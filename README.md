# slimread

**Read code by symbol, not by file.** An MCP server that lets coding agents (Claude Code, Codex, Cursor and others) read just the function they need instead of the whole file, which cuts the tokens they spend on reading code.

```
Without slimread: the agent reads auth/service.ts       → ~20,000 tokens
With slimread:    outline("auth/service.ts")            →    ~400 tokens
                  read_symbol(..., "AuthService.login") →    ~500 tokens
```

On real projects, reading a large file this way typically costs **85–95% fewer tokens**. Run `npx slimread stats` to see the numbers for your own code.

## Install

```bash
npx slimread install
```

This detects the agents you have, asks which ones to set up, and for each one:

1. **Registers the server** in that agent's own config.
2. **Adds a 3-line note** to its rules file telling it to outline large files before reading them.

You only do this once. After that you don't run anything: your agent starts slimread in the background when a session begins and stops it when the session ends.

| Agent | Server config | Rules note |
|---|---|---|
| Claude Code | `.mcp.json` (project) or `claude mcp add --scope user` (global) | `CLAUDE.md` |
| Codex | `~/.codex/config.toml` | `AGENTS.md` |
| Cursor | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global) | `.cursor/rules/slimread.mdc` |

By default the setup applies to the current project, and those files can be committed so your whole team gets it. Use `--global` to set it up for all your projects instead.

```
npx slimread install --claude --cursor   # choose agents instead of being asked
npx slimread install --global            # all projects
npx slimread install --dry-run           # show what would change, write nothing
npx slimread install --no-rules          # only register the server
npx slimread uninstall                   # remove exactly what install added
```

Install is safe to re-run, and uninstall leaves your own content in those files untouched.

### Other agents, or manual setup

Any MCP client can run it. The server command is:

```json
{ "command": "npx", "args": ["-y", "slimread"] }
```

On Windows, use `"command": "cmd", "args": ["/c", "npx", "-y", "slimread"]`.

The server works on the folder it is started in. To point it at another folder, add `"--root", "/path/to/project"` to the args or set `SLIMREAD_ROOT`.

## What the agent gets

Four read-only tools:

| Tool | What it returns |
|---|---|
| `outline(path)` | The classes, functions and methods in a file, with signatures and line ranges. For a folder, the top-level symbols of every file. |
| `read_symbol(path, name)` | The exact source of one symbol, with line numbers. Accepts `login`, `AuthService.login` or `AuthService::login`. For a class over 300 lines it returns the member list instead, so the agent can pick a method (or pass `full: true`). |
| `find_symbol(name)` | Where a symbol is defined anywhere in the project. |
| `find_references(name)` | Every line that mentions a name, e.g. to find callers before changing a function. |

Example `outline` output:

```
auth/service.ts (1812 lines, typescript)
  export class AuthService  L12-640
    constructor(db: Database)  L20-31
    method async login(user: string, pw: string): Promise<Session>  L40-88
    method async refresh(token: string)  L90-131
    ...
  function hashPassword(pw: string): string  L642-660
```

## Languages

Python, JavaScript, TypeScript (and JSX/TSX), Go, Rust, Java, C#, C, C++, Ruby, PHP, Kotlin and Swift.

For other file types (Markdown, JSON, YAML, CSS...), agents keep reading them directly, which is usually the right choice anyway.

## How it works

- Files are parsed with [tree-sitter](https://tree-sitter.github.io/) (bundled as WebAssembly, so nothing to compile and no language servers to install).
- **There's no index.** Files are parsed when asked about (milliseconds each) and cached until they change, so results are never out of date.
- `.gitignore` is respected, and `node_modules`, build output and similar folders are skipped.
- Everything runs locally: it makes no network calls, and it never writes or modifies files.

## When it helps (and when it doesn't)

- **Helps most:** large files (300+ lines) and agents without their own code index, i.e. **Claude Code and Codex**.
- **Helps less:** Cursor already has semantic search over your codebase. There, slimread adds exact symbol reads and outlines, but the savings are smaller.
- **Small projects:** if your files are short, agents can read them whole; `npx slimread stats` will tell you.
- `find_references` matches by name, so different symbols with the same name both show up.
- The rules note encourages the agent to use slimread, but it can't force it to.

## Development

```bash
git clone https://github.com/Fahad-Sajeem/slimread.git && cd slimread
npm install
npm test
node bin/slimread.js stats /path/to/any/project
node bin/slimread.js install --local   # point your agents at this checkout
```

To add a language, add its file extensions and syntax node types to `src/languages.js`, add a sample file to `test/fixtures`, and add the expected symbols to `test/symbols.test.js`. `node scripts/probe.js <file>` prints the syntax node types of any file.

## License

MIT
