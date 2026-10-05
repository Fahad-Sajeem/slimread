// The four tools, as plain functions that return text. server.js exposes them over MCP;
// tests call them directly. Output is compact plain text on purpose: every character
// returned here ends up in the agent's context.

import fs from 'node:fs';
import { parseFile, flatten } from './symbols.js';
import { resolvePath, displayPath, listSourceFiles, MAX_FILES } from './files.js';

const DIR_OUTLINE_LINE_LIMIT = 400;
const LARGE_SYMBOL_LINES = 300;
const MAX_FIND_RESULTS = 50;
const MAX_REFERENCES = 100;

// Signatures usually already say what they are (`def`, `class`, `fn`...); only add the kind when they don't.
const KEYWORDS = /\b(def|class|function|fn|func|fun|struct|interface|enum|trait|impl|mod|module|namespace|record|protocol|object|type|union|init|constructor)\b/;
const describe = (s) => (KEYWORDS.test(s.signature) ? s.signature : `${s.kind} ${s.signature}`);

export async function outline(root, { path: p = '.' } = {}) {
  const abs = resolvePath(root, p);
  if (fs.statSync(abs).isDirectory()) return outlineDirectory(root, abs);

  const shown = displayPath(root, abs);
  const parsed = await parseFile(abs);
  if (!parsed) {
    const lines = fs.readFileSync(abs, 'utf8').split('\n').length;
    return `${shown} (${lines} lines): not a supported source language. Read it directly instead.`;
  }
  const out = [`${shown} (${parsed.lines.length} lines, ${parsed.language})`];
  if (!parsed.symbols.length) out.push('  (no classes or functions found)');
  const walk = (syms, depth) => {
    for (const s of syms) {
      out.push(`${'  '.repeat(depth)}${describe(s)}  L${s.startLine}-${s.endLine}`);
      walk(s.children, depth + 1);
    }
  };
  walk(parsed.symbols, 1);
  return out.join('\n');
}

async function outlineDirectory(root, abs) {
  const files = listSourceFiles(root, abs);
  if (!files.length) return `No supported source files under ${displayPath(root, abs)}.`;
  const out = [];
  let truncated = 0;
  for (const file of files) {
    if (out.length >= DIR_OUTLINE_LINE_LIMIT) {
      truncated++;
      continue;
    }
    let parsed;
    try {
      parsed = await parseFile(file);
    } catch {
      continue;
    }
    const names = parsed.symbols.map((s) => `${s.kind} ${s.label}`);
    out.push(`${displayPath(root, file)} (${parsed.lines.length} lines)${names.length ? ': ' + names.join(', ') : ''}`);
  }
  if (truncated) out.push(`... ${truncated} more files. Outline a subfolder or a single file for more detail.`);
  if (files.length >= MAX_FILES) out.push(`(stopped after ${MAX_FILES} files)`);
  return out.join('\n');
}

export async function readSymbol(root, { path: p, name, full = false }) {
  const abs = resolvePath(root, p);
  const parsed = await parseFile(abs);
  if (!parsed) throw new Error(`${p} is not a supported source language. Read it directly instead.`);
  const shown = displayPath(root, abs);

  const matches = matchSymbols(flatten(parsed.symbols), name);
  if (!matches.length) {
    const all = flatten(parsed.symbols).map((s) => s.qualified);
    return `No symbol "${name}" in ${shown}. Available: ${all.slice(0, 60).join(', ')}${all.length > 60 ? ', ...' : ''}`;
  }
  if (matches.length > 1) {
    return [`"${name}" matches ${matches.length} symbols in ${shown}; use the qualified name:`,
      ...matches.map((s) => `  ${s.kind} ${s.qualified}  L${s.startLine}-${s.endLine}`)].join('\n');
  }

  const s = matches[0];
  const size = s.endLine - s.startLine + 1;
  if (!full && size > LARGE_SYMBOL_LINES && s.children.length) {
    // A big class: return its members instead of 1000 lines, so the agent can pick one.
    const out = [`${shown} ${s.kind} ${s.qualified} is ${size} lines (L${s.startLine}-${s.endLine}). Its members:`];
    for (const c of s.children) out.push(`  ${describe(c)}  L${c.startLine}-${c.endLine}`);
    out.push(`Read one with read_symbol (e.g. "${s.children[0].qualified}"), or pass full=true for the whole ${s.kind}.`);
    return out.join('\n');
  }
  return [`${shown} L${s.startLine}-${s.endLine}`, numbered(parsed.lines, s.startLine, s.endLine)].join('\n');
}

export async function findSymbol(root, { name, path: p = '.' }) {
  const abs = resolvePath(root, p);
  const needle = lastSegment(name);
  const exact = [];
  const partial = [];
  for (const file of listSourceFiles(root, abs)) {
    // Cheap text check first so we only parse files that could contain the name.
    const text = safeRead(file);
    if (text === null || !text.toLowerCase().includes(needle.toLowerCase())) continue;
    let parsed;
    try {
      parsed = await parseFile(file);
    } catch {
      continue;
    }
    for (const s of flatten(parsed.symbols)) {
      const hit = { file, s };
      if (matchSymbols([s], name).length) exact.push(hit);
      else if (s.name.toLowerCase().includes(needle.toLowerCase())) partial.push(hit);
    }
  }
  const hits = exact.length ? exact : partial;
  if (!hits.length) return `No definition named "${name}" found.`;
  const out = exact.length ? [] : [`No exact match for "${name}"; similar names:`];
  for (const { file, s } of hits.slice(0, MAX_FIND_RESULTS)) {
    out.push(`${displayPath(root, file)}:${s.startLine}-${s.endLine} ${s.kind} ${s.qualified} — ${s.signature}`);
  }
  if (hits.length > MAX_FIND_RESULTS) out.push(`... ${hits.length - MAX_FIND_RESULTS} more. Narrow with path.`);
  return out.join('\n');
}

export async function findReferences(root, { name, path: p = '.' }) {
  const abs = resolvePath(root, p);
  const needle = lastSegment(name);
  if (!/^[\w$]+$/.test(needle)) throw new Error(`"${name}" is not a plain identifier.`);
  const re = new RegExp(`(?<![\\w$])${needle.replace(/\$/g, '\\$')}(?![\\w$])`);
  const out = [];
  let total = 0;
  for (const file of listSourceFiles(root, abs)) {
    const text = safeRead(file);
    if (text === null || !text.includes(needle)) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      total++;
      if (out.length < MAX_REFERENCES) {
        const line = lines[i].trim();
        out.push(`${displayPath(root, file)}:${i + 1}: ${line.length > 200 ? line.slice(0, 197) + '...' : line}`);
      }
    }
  }
  if (!total) return `No uses of "${needle}" found.`;
  if (total > MAX_REFERENCES) out.push(`... ${total - MAX_REFERENCES} more. Narrow with path.`);
  return [`${total} line(s) mention "${needle}" (name match, so same-named symbols are included):`, ...out].join('\n');
}

// "login" matches any symbol named login; "AuthService.login" (or "AuthService::login")
// matches by qualified-name suffix.
function matchSymbols(symbols, query) {
  const q = query.replace(/::|#/g, '.');
  const exact = symbols.filter((s) => s.qualified === q);
  if (exact.length) return exact;
  return symbols.filter((s) => (q.includes('.') ? s.qualified.endsWith(`.${q}`) : s.name === q));
}

function lastSegment(name) {
  return name.replace(/::|#/g, '.').split('.').pop();
}

function numbered(lines, start, end) {
  const width = String(end).length;
  const out = [];
  for (let n = start; n <= end; n++) out.push(`${String(n).padStart(width)}| ${lines[n - 1] ?? ''}`);
  return out.join('\n');
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

