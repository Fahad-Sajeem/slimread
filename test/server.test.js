import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('works end to end as an MCP server', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      fileURLToPath(new URL('../bin/slimread.js', import.meta.url)),
      '--root', fileURLToPath(new URL('./fixtures', import.meta.url)),
    ],
  });
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ['find_references', 'find_symbol', 'outline', 'read_symbol']);
    assert.ok(tools.every((t) => t.annotations?.readOnlyHint));

    const res = await client.callTool({ name: 'read_symbol', arguments: { path: 'sample.go', name: 'AuthService.Login' } });
    assert.match(res.content[0].text, /^sample\.go L15-17\n15\| func \(s \*AuthService\) Login/);

    const err = await client.callTool({ name: 'outline', arguments: { path: 'missing.py' } });
    assert.equal(err.isError, true);
    assert.match(err.content[0].text, /Path not found/);
  } finally {
    await client.close();
  }
});
