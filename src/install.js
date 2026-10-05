// `slimread install` / `slimread uninstall`: registers the MCP server with each agent
// in that agent's own config format, and adds a short note to its rules file so the
// agent knows to prefer outline/read_symbol over reading whole files.
//
// Every change is idempotent (re-running replaces our own entry) and reversible
// (uninstall removes exactly what install added, marked by "slimread:start/end").

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const NAME = 'slimread';
const BIN = fileURLToPath(new URL('../bin/slimread.js', import.meta.url));
const IS_WINDOWS = process.platform === 'win32';

export const AGENTS = {
  claude: { label: 'Claude Code', detect: (home) => fs.existsSync(path.join(home, '.claude')) || onPath('claude') },
  codex: { label: 'Codex', detect: (home) => fs.existsSync(path.join(home, '.codex')) || onPath('codex') },
  cursor: { label: 'Cursor', detect: (home) => fs.existsSync(path.join(home, '.cursor')) },
};

const RULES_BODY = `## Reading code (slimread)
Before reading a source file longer than ~200 lines, call the slimread \`outline\` tool, then \`read_symbol\` for only the functions or classes you need.
Use \`find_symbol\` to locate a definition and \`find_references\` to find callers. Read whole files only when you need most of their content.`;

const MD_START = '<!-- slimread:start -->';
const MD_END = '<!-- slimread:end -->';
const TOML_START = '# slimread:start';
const TOML_END = '# slimread:end';

/**
 * opts: { agents: string[], global: boolean, local: boolean, rules: boolean, dryRun: boolean,
 *         project: string, home: string, log: fn }
 * Returns the list of actions taken (or planned, for dryRun).
 */
export function install(opts) {
  const o = withDefaults(opts);
  const server = serverCommand(o.local);
  const actions = [];
  for (const agent of o.agents) {
    if (agent === 'claude') {
      if (o.global) actions.push(claudeGlobal(server, o));
      else actions.push(writeJsonServer(path.join(o.project, '.mcp.json'), server, o, 'Claude Code (project; Claude asks you to approve it on next start)'));
      if (o.rules) actions.push(upsertMarkdown(path.join(o.global ? path.join(o.home, '.claude') : o.project, 'CLAUDE.md'), o));
    } else if (agent === 'codex') {
      // Codex keeps MCP servers in its global config; the server uses the folder Codex runs in.
      actions.push(upsertToml(path.join(o.home, '.codex', 'config.toml'), server, o));
      if (o.rules) actions.push(upsertMarkdown(path.join(o.global ? path.join(o.home, '.codex') : o.project, 'AGENTS.md'), o));
    } else if (agent === 'cursor') {
      // Cursor may start servers outside the project folder, so pass the workspace explicitly.
      const cursorServer = { ...server, args: [...server.args, '--root', '${workspaceFolder}'] };
      const dir = o.global ? path.join(o.home, '.cursor') : path.join(o.project, '.cursor');
      actions.push(writeJsonServer(path.join(dir, 'mcp.json'), cursorServer, o, 'Cursor'));
      if (o.rules) {
        if (o.global) actions.push({ file: 'Cursor user rules', note: 'add manually in Cursor Settings > Rules:\n' + RULES_BODY });
        else actions.push(writeFile(path.join(o.project, '.cursor', 'rules', 'slimread.mdc'),
          `---\ndescription: Read code by symbol with slimread\nalwaysApply: true\n---\n\n${RULES_BODY}\n`, o));
      }
    }
  }
  return actions;
}

export function uninstall(opts) {
  const o = withDefaults(opts);
  const actions = [];
  for (const agent of o.agents) {
    if (agent === 'claude') {
      if (o.global) actions.push(runClaude(['mcp', 'remove', '--scope', 'user', NAME], o, 'removed from Claude Code (user scope)'));
      else actions.push(removeJsonServer(path.join(o.project, '.mcp.json'), o));
      actions.push(removeMarkdown(path.join(o.global ? path.join(o.home, '.claude') : o.project, 'CLAUDE.md'), o));
    } else if (agent === 'codex') {
      actions.push(removeToml(path.join(o.home, '.codex', 'config.toml'), o));
      actions.push(removeMarkdown(path.join(o.global ? path.join(o.home, '.codex') : o.project, 'AGENTS.md'), o));
    } else if (agent === 'cursor') {
      const dir = o.global ? path.join(o.home, '.cursor') : path.join(o.project, '.cursor');
      actions.push(removeJsonServer(path.join(dir, 'mcp.json'), o));
      if (!o.global) actions.push(deleteFile(path.join(o.project, '.cursor', 'rules', 'slimread.mdc'), o));
    }
  }
  return actions.filter(Boolean);
}

/** Interactive front end for the CLI. */
export async function runInstallCli(argv, { remove = false } = {}) {
  const flags = new Set(argv);
  const home = os.homedir();
  let agents = Object.keys(AGENTS).filter((a) => flags.has(`--${a}`));
  const interactive = !agents.length && !flags.has('--yes') && process.stdin.isTTY;

  if (!agents.length) {
    const detected = Object.keys(AGENTS).filter((a) => AGENTS[a].detect(home));
    if (!detected.length) {
      console.log('No supported agents detected. Pass --claude, --codex and/or --cursor to choose explicitly.');
      return;
    }
    agents = detected;
    if (interactive) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const chosen = [];
      for (const a of detected) {
        const answer = (await rl.question(`${remove ? 'Remove from' : 'Set up for'} ${AGENTS[a].label}? [Y/n] `)).trim().toLowerCase();
        if (answer === '' || answer.startsWith('y')) chosen.push(a);
      }
      rl.close();
      agents = chosen;
    }
  }
  if (!agents.length) return console.log('Nothing to do.');

  const opts = {
    agents,
    global: flags.has('--global'),
    local: flags.has('--local'),
    rules: !flags.has('--no-rules'),
    dryRun: flags.has('--dry-run'),
  };
  const actions = remove ? uninstall(opts) : install(opts);
  const verb = opts.dryRun ? 'Would update' : 'Updated';
  for (const a of actions) {
    if (a.note) console.log(`  ! ${a.file}: ${a.note}`);
    else if (a.changed) console.log(`  ${verb} ${a.file}${a.detail ? ` (${a.detail})` : ''}`);
    else console.log(`  Unchanged ${a.file}${a.detail ? ` (${a.detail})` : ''}`);
  }
  if (!remove && !opts.dryRun) {
    console.log(`\nDone. Restart your agent${agents.length > 1 ? 's' : ''} to load slimread.`);
    if (!opts.global) console.log('Project files (.mcp.json, .cursor/, CLAUDE.md, AGENTS.md) can be committed so your team gets it too.');
  }
}

// ---------- helpers ----------

function withDefaults(opts) {
  return { project: process.cwd(), home: os.homedir(), rules: true, ...opts };
}

/** How agents should launch the server. --local points at this checkout (for development / unpublished use). */
export function serverCommand(local) {
  if (local) return { command: process.execPath, args: [BIN] };
  // On Windows, npx is a .cmd script, which agents can only launch through cmd.
  return IS_WINDOWS ? { command: 'cmd', args: ['/c', 'npx', '-y', NAME] } : { command: 'npx', args: ['-y', NAME] };
}

function writeJsonServer(file, server, o, detail) {
  const data = readJson(file);
  data.mcpServers ??= {};
  const before = JSON.stringify(data.mcpServers[NAME]);
  data.mcpServers[NAME] = { command: server.command, args: server.args };
  const changed = before !== JSON.stringify(data.mcpServers[NAME]);
  if (changed && !o.dryRun) writeOut(file, JSON.stringify(data, null, 2) + '\n');
  return { file, changed, detail };
}

function removeJsonServer(file, o) {
  if (!fs.existsSync(file)) return { file, changed: false };
  const data = readJson(file);
  if (!data.mcpServers?.[NAME]) return { file, changed: false };
  delete data.mcpServers[NAME];
  if (!o.dryRun) writeOut(file, JSON.stringify(data, null, 2) + '\n');
  return { file, changed: true };
}

function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is not valid JSON; fix or remove it and run again.`);
  }
}

function tomlBlock(server) {
  const q = (s) => JSON.stringify(s); // JSON strings are valid TOML basic strings
  return [TOML_START, `[mcp_servers.${NAME}]`, `command = ${q(server.command)}`,
    `args = [${server.args.map(q).join(', ')}]`, TOML_END].join('\n');
}

function upsertToml(file, server, o) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const block = tomlBlock(server);
  if (!text.includes(TOML_START) && new RegExp(`^\\[mcp_servers\\.${NAME}\\]`, 'm').test(text)) {
    return { file, note: `already has a [mcp_servers.${NAME}] section not added by this installer; left as is.` };
  }
  const next = replaceBlock(text, TOML_START, TOML_END, block);
  const changed = next !== text;
  if (changed && !o.dryRun) writeOut(file, next);
  return { file, changed, detail: 'Codex, all projects' };
}

function removeToml(file, o) {
  return removeBlock(file, TOML_START, TOML_END, o);
}

function upsertMarkdown(file, o) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const next = replaceBlock(text, MD_START, MD_END, `${MD_START}\n${RULES_BODY}\n${MD_END}`);
  const changed = next !== text;
  if (changed && !o.dryRun) writeOut(file, next);
  return { file, changed, detail: 'rules note' };
}

function removeMarkdown(file, o) {
  return removeBlock(file, MD_START, MD_END, o);
}

// Replace our marked block if present, otherwise append it.
function replaceBlock(text, start, end, block) {
  const i = text.indexOf(start);
  const j = text.indexOf(end, i);
  if (i >= 0 && j > i) return text.slice(0, i) + block + text.slice(j + end.length);
  const sep = !text ? '' : text.endsWith('\n\n') ? '' : text.endsWith('\n') ? '\n' : '\n\n';
  return `${text}${sep}${block}\n`;
}

function removeBlock(file, start, end, o) {
  if (!fs.existsSync(file)) return { file, changed: false };
  const text = fs.readFileSync(file, 'utf8');
  const i = text.indexOf(start);
  const j = text.indexOf(end, i);
  if (i < 0 || j < 0) return { file, changed: false };
  const before = text.slice(0, i).replace(/\s+$/, '');
  const after = text.slice(j + end.length).replace(/^\s+/, '');
  const next = [before, after].filter(Boolean).join('\n\n') + '\n';
  if (!o.dryRun) {
    if (next.trim()) writeOut(file, next);
    else fs.rmSync(file); // the file only held our block
  }
  return { file, changed: true };
}

function writeFile(file, content, o) {
  const changed = !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content;
  if (changed && !o.dryRun) writeOut(file, content);
  return { file, changed, detail: 'rules note' };
}

function deleteFile(file, o) {
  if (!fs.existsSync(file)) return { file, changed: false };
  if (!o.dryRun) fs.rmSync(file);
  return { file, changed: true };
}

function writeOut(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function claudeGlobal(server, o) {
  runClaude(['mcp', 'remove', '--scope', 'user', NAME], { ...o, quiet: true });
  return runClaude(['mcp', 'add', '--scope', 'user', NAME, '--', server.command, ...server.args], o, 'Claude Code, all projects');
}

function runClaude(args, o, detail) {
  const file = 'claude mcp (user scope)';
  if (o.dryRun) return { file, changed: true, detail };
  if (!onPath('claude')) {
    return { file, note: `the claude CLI was not found. Run this yourself:\n    claude ${args.map(quote).join(' ')}` };
  }
  const r = spawnSync(IS_WINDOWS ? `claude ${args.map(quote).join(' ')}` : 'claude', IS_WINDOWS ? [] : args,
    { shell: IS_WINDOWS, encoding: 'utf8' });
  if (o.quiet) return null;
  if (r.status !== 0) return { file, note: `failed: ${(r.stderr || r.stdout || '').trim()}` };
  return { file, changed: true, detail };
}

function quote(s) {
  return /^[\w@./:=-]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`;
}

function onPath(cmd) {
  const r = spawnSync(IS_WINDOWS ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  return r.status === 0;
}
