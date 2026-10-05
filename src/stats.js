// `slimread stats`: shows, for this project, how many tokens an agent spends reading
// files whole versus reading their outlines — so people can see the savings on their own code.

import path from 'node:path';
import fs from 'node:fs';
import { listSourceFiles, displayPath } from './files.js';
import { outline } from './tools.js';
import { parseFile, flatten } from './symbols.js';

// A common rough estimate for code: ~4 characters per token.
const tokens = (chars) => Math.round(chars / 4);

export async function stats(dir = '.') {
  const root = path.resolve(dir);
  const files = listSourceFiles(root, root);
  if (!files.length) return `No supported source files found in ${root}.`;

  const rows = [];
  for (const file of files) {
    try {
      const full = tokens(fs.readFileSync(file, 'utf8').length);
      const out = tokens((await outline(root, { path: file })).length);
      const parsed = await parseFile(file);
      // A typical slim read: the outline plus one of this file's innermost functions (average size).
      const leaves = flatten(parsed.symbols).filter((s) => !s.children.length);
      const sizes = leaves.map((s) => tokens(parsed.lines.slice(s.startLine - 1, s.endLine).join('\n').length));
      const avgLeaf = sizes.length ? Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length) : full;
      rows.push({ file: displayPath(root, file), lines: parsed.lines.length, full, out, slim: Math.min(full, out + avgLeaf) });
    } catch {
      // unparsable file; skip
    }
  }

  const fmt = (n) => n.toLocaleString('en-US');
  const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
  const big = rows.filter((r) => r.lines >= 200).sort((a, b) => b.full - a.full);

  const out = [
    `slimread stats for ${root}`,
    `${fmt(rows.length)} source files, ${fmt(sum('lines'))} lines`,
    '',
    `Reading every file whole:   ~${fmt(sum('full'))} tokens`,
    `Reading every outline:      ~${fmt(sum('out'))} tokens`,
  ];
  if (big.length) {
    out.push('', 'Largest files: whole file → outline + one typical function from that file');
    for (const r of big.slice(0, 10)) {
      const pct = Math.round((1 - r.slim / r.full) * 100);
      out.push(`  ${fmt(r.full).padStart(7)} → ${fmt(r.slim).padStart(6)} tokens  (${String(pct).padStart(2)}% less)  ${r.file}`);
    }
  } else {
    out.push('', 'No files over 200 lines: slimread will save little here; agents can read these files whole.');
  }
  out.push('', 'Token counts are estimates (~4 characters per token).');
  return out.join('\n');
}
