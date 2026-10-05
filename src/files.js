// Project root resolution and file walking that respects .gitignore.

import fs from 'node:fs';
import path from 'node:path';
import ignore from 'ignore';
import { languageFor, MAX_FILE_BYTES } from './symbols.js';

const ALWAYS_SKIP = new Set([
  'node_modules', 'bower_components', 'vendor', 'dist', 'build', 'target', 'obj',
  'coverage', '__pycache__', 'venv', 'site-packages', 'Pods', 'DerivedData',
]);
export const MAX_FILES = 20000;

/**
 * The project root: --root <dir>, then SLIMREAD_ROOT, then the working directory.
 * Agents start MCP servers in the project folder, so the working directory is usually right.
 */
export function resolveRoot(argv = process.argv, env = process.env) {
  const i = argv.indexOf('--root');
  const candidates = [i >= 0 ? argv[i + 1] : undefined, env.SLIMREAD_ROOT];
  for (const c of candidates) {
    // Skip unexpanded placeholders like ${workspaceFolder} from clients that don't support them.
    if (c && !c.includes('${') && fs.existsSync(c)) return path.resolve(c);
  }
  return process.cwd();
}

export function resolvePath(root, p = '.') {
  const abs = path.resolve(root, p);
  if (!fs.existsSync(abs)) throw new Error(`Path not found: ${p}`);
  return abs;
}

export function displayPath(root, abs) {
  const rel = path.relative(root, abs);
  return (rel && !rel.startsWith('..') ? rel : abs).split(path.sep).join('/');
}

/** All supported source files under `start`, sorted, honoring .gitignore files on the way down. */
export function listSourceFiles(root, start) {
  const results = [];
  const startStat = fs.statSync(start);
  if (startStat.isFile()) return languageFor(start) ? [start] : [];

  const walk = (dir, matchers) => {
    if (results.length >= MAX_FILES) return;
    const gitignore = path.join(dir, '.gitignore');
    if (fs.existsSync(gitignore)) {
      matchers = [...matchers, { base: dir, ig: ignore().add(fs.readFileSync(gitignore, 'utf8')) }];
    }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (results.length >= MAX_FILES) return;
      const full = path.join(dir, e.name);
      const isDir = e.isDirectory();
      if (isDir && (e.name.startsWith('.') || ALWAYS_SKIP.has(e.name))) continue;
      if (isIgnored(full, isDir, matchers)) continue;
      if (isDir) {
        walk(full, matchers);
      } else if (e.isFile() && languageFor(e.name)) {
        try {
          if (fs.statSync(full).size <= MAX_FILE_BYTES) results.push(full);
        } catch {
          // unreadable file; skip
        }
      }
    }
  };

  walk(start, rootMatchers(root, start));
  return results;
}

// .gitignore files between the root and the starting folder also apply.
function rootMatchers(root, start) {
  const matchers = [];
  const rel = path.relative(root, start);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return matchers;
  let dir = root;
  for (const part of rel ? rel.split(path.sep) : []) {
    const gi = path.join(dir, '.gitignore');
    if (fs.existsSync(gi)) matchers.push({ base: dir, ig: ignore().add(fs.readFileSync(gi, 'utf8')) });
    dir = path.join(dir, part);
  }
  return matchers;
}

function isIgnored(full, isDir, matchers) {
  for (const { base, ig } of matchers) {
    const rel = path.relative(base, full).split(path.sep).join('/');
    if (rel && ig.ignores(isDir ? `${rel}/` : rel)) return true;
  }
  return false;
}
