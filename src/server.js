// MCP server: exposes the tools in tools.js over stdio. Agents launch this
// process themselves when a session starts and stop it when the session ends.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { outline, readSymbol, findSymbol, findReferences } from './tools.js';
import { resolveRoot } from './files.js';
import { VERSION } from './version.js';

const PATH_HINT = 'File or folder, relative to the project root or absolute.';

export async function startServer() {
  const root = resolveRoot();
  const server = new McpServer({ name: 'slimread', version: VERSION });

  const register = (name, description, inputSchema, fn) => {
    server.registerTool(
      name,
      { description, inputSchema, annotations: { readOnlyHint: true, openWorldHint: false } },
      async (args) => {
        try {
          return { content: [{ type: 'text', text: await fn(root, args) }] };
        } catch (err) {
          return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
        }
      },
    );
  };

  register(
    'outline',
    'List the classes, functions and methods in a source file (with signatures and line ranges), or in every file of a folder. ' +
      'Much cheaper than reading a file: use it first, then read only the symbols you need.',
    { path: z.string().optional().describe(PATH_HINT + ' Defaults to the project root.') },
    outline,
  );
  register(
    'read_symbol',
    'Return the exact source of one function, method or class from a file, with line numbers. ' +
      'Accepts a plain name ("login") or a qualified one ("AuthService.login").',
    {
      path: z.string().describe(PATH_HINT),
      name: z.string().describe('Symbol name, e.g. "login" or "AuthService.login".'),
      full: z.boolean().optional().describe('Return a large class in full instead of its member list.'),
    },
    readSymbol,
  );
  register(
    'find_symbol',
    'Find where a class, function or method is defined anywhere in the project. Returns file, line range and signature.',
    {
      name: z.string().describe('Symbol name, e.g. "login" or "AuthService.login".'),
      path: z.string().optional().describe('Limit the search to this folder.'),
    },
    findSymbol,
  );
  register(
    'find_references',
    'List every line in the project\'s source files that mentions a name (whole-word match), e.g. to find callers before changing a function.',
    {
      name: z.string().describe('Identifier to search for.'),
      path: z.string().optional().describe('Limit the search to this folder.'),
    },
    findReferences,
  );

  await server.connect(new StdioServerTransport());
}
