#!/usr/bin/env node
// With no command, runs the MCP server on stdio (this is what agents launch).
// Commands: install, uninstall, stats, help, version.

const [command, ...rest] = process.argv.slice(2).filter((a, i, all) => !(a === '--root' || all[i - 1] === '--root'));

const HELP = `slimread: read code by symbol, not by file. An MCP server for coding agents.

Usage:
  npx slimread install     Set up for your agents (Claude Code, Codex, Cursor)
  npx slimread uninstall   Remove everything install added
  npx slimread stats [dir] Show how many tokens it would save on this project
  npx slimread             Run the MCP server (agents do this automatically)

Install options:
  --claude --codex --cursor   Choose agents (default: ask about each detected one)
  --global                    All projects, instead of only the current one
  --no-rules                  Don't add the short note to CLAUDE.md / AGENTS.md / Cursor rules
  --local                     Point agents at this copy instead of the npm package
  --dry-run                   Show what would change without writing anything
  --yes                       Don't ask; set up every detected agent`;

try {
  if (!command || command.startsWith('--')) {
    const { startServer } = await import('../src/server.js');
    await startServer();
  } else if (command === 'install' || command === 'uninstall') {
    const { runInstallCli } = await import('../src/install.js');
    await runInstallCli(rest, { remove: command === 'uninstall' });
  } else if (command === 'stats') {
    const { stats } = await import('../src/stats.js');
    console.log(await stats(rest.find((a) => !a.startsWith('--')) ?? '.'));
  } else if (command === 'version' || command === '-v') {
    const { VERSION } = await import('../src/version.js');
    console.log(VERSION);
  } else {
    console.log(HELP);
    if (!['help', '-h'].includes(command)) process.exitCode = 1;
  }
} catch (err) {
  console.error(`slimread: ${err.message}`);
  process.exitCode = 1;
}
