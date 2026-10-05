import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install, uninstall } from '../src/install.js';

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'slimread-install-'));
  const project = path.join(base, 'project');
  const home = path.join(base, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  return { project, home };
}

const read = (f) => fs.readFileSync(f, 'utf8');

test('project install for all agents is idempotent and fully reversible', () => {
  const { project, home } = sandbox();
  // Pre-existing user content must survive install + uninstall untouched.
  fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# My project\n\nUse tabs.\n');
  fs.writeFileSync(path.join(project, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
  fs.mkdirSync(path.join(home, '.codex'));
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), 'model = "o4"\n');

  const opts = { agents: ['claude', 'codex', 'cursor'], project, home, local: true };
  const first = install(opts);
  assert.ok(first.every((a) => a.changed), JSON.stringify(first));

  const mcp = JSON.parse(read(path.join(project, '.mcp.json')));
  assert.deepEqual(Object.keys(mcp.mcpServers), ['other', 'slimread']);
  assert.equal(mcp.mcpServers.slimread.command, process.execPath);
  assert.match(read(path.join(project, 'CLAUDE.md')), /^# My project\n\nUse tabs\.\n\n<!-- slimread:start -->/);
  assert.match(read(path.join(project, 'AGENTS.md')), /read_symbol/);
  const toml = read(path.join(home, '.codex', 'config.toml'));
  assert.match(toml, /^model = "o4"\n\n# slimread:start\n\[mcp_servers\.slimread\]\ncommand = ".+"\nargs = \[".+slimread\.js"\]\n# slimread:end\n$/);
  const cursor = JSON.parse(read(path.join(project, '.cursor', 'mcp.json')));
  assert.deepEqual(cursor.mcpServers.slimread.args.slice(-2), ['--root', '${workspaceFolder}']);
  assert.match(read(path.join(project, '.cursor', 'rules', 'slimread.mdc')), /alwaysApply: true/);

  const second = install(opts);
  assert.ok(second.every((a) => !a.changed), 'a second install changes nothing');

  uninstall(opts);
  assert.equal(read(path.join(project, 'CLAUDE.md')), '# My project\n\nUse tabs.\n');
  assert.deepEqual(JSON.parse(read(path.join(project, '.mcp.json'))), { mcpServers: { other: { command: 'x' } } });
  assert.equal(read(path.join(home, '.codex', 'config.toml')), 'model = "o4"\n');
  assert.ok(!fs.existsSync(path.join(project, 'AGENTS.md')), 'AGENTS.md held only our note, so it is removed');
  assert.ok(!fs.existsSync(path.join(project, '.cursor', 'rules', 'slimread.mdc')));
});

test('uses npx (through cmd on Windows) by default', () => {
  const { project, home } = sandbox();
  install({ agents: ['cursor'], project, home, rules: false });
  const { command, args } = JSON.parse(read(path.join(project, '.cursor', 'mcp.json'))).mcpServers.slimread;
  if (process.platform === 'win32') assert.deepEqual([command, ...args.slice(0, 4)], ['cmd', '/c', 'npx', '-y', 'slimread']);
  else assert.deepEqual([command, ...args.slice(0, 2)], ['npx', '-y', 'slimread']);
});

test('dry run writes nothing', () => {
  const { project, home } = sandbox();
  const actions = install({ agents: ['claude', 'codex', 'cursor'], project, home, dryRun: true });
  assert.ok(actions.length > 0);
  assert.deepEqual(fs.readdirSync(project), []);
  assert.deepEqual(fs.readdirSync(home), []);
});

test('leaves a hand-written Codex entry alone', () => {
  const { project, home } = sandbox();
  fs.mkdirSync(path.join(home, '.codex'));
  const mine = '[mcp_servers.slimread]\ncommand = "custom"\n';
  fs.writeFileSync(path.join(home, '.codex', 'config.toml'), mine);
  const [action] = install({ agents: ['codex'], project, home, rules: false });
  assert.match(action.note, /left as is/);
  assert.equal(read(path.join(home, '.codex', 'config.toml')), mine);
});
