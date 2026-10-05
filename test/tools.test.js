import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outline, readSymbol, findSymbol, findReferences } from '../src/tools.js';

const root = fileURLToPath(new URL('./fixtures', import.meta.url));

test('outline of a file lists symbols with signatures and line ranges', async () => {
  const out = await outline(root, { path: 'sample.py' });
  assert.match(out, /^sample\.py \(\d+ lines, python\)/);
  assert.match(out, /\n {2}class AuthService {2}L11-25\n/);
  assert.match(out, /\n {4}def login\(self, user, pw\) {2}L21-25/);
});

test('outline of a folder lists every supported file', async () => {
  const out = await outline(root, {});
  for (const f of ['sample.py', 'sample.ts', 'sample.go', 'Sample.java']) assert.ok(out.includes(f), f);
});

test('read_symbol returns exactly the symbol, numbered', async () => {
  const out = await readSymbol(root, { path: 'sample.py', name: 'AuthService.login' });
  assert.equal(out.split('\n')[0], 'sample.py L21-25');
  assert.equal(out.split('\n')[1], '21|     def login(self, user, pw):');
  assert.doesNotMatch(out, /fetch_all/);
});

test('read_symbol accepts :: and reports ambiguity and misses', async () => {
  assert.match(await readSymbol(root, { path: 'sample.cpp', name: 'AuthService::login' }), /^sample\.cpp L12-14/);
  assert.match(await readSymbol(root, { path: 'sample.rs', name: 'AuthService' }), /matches 2 symbols/);
  assert.match(await readSymbol(root, { path: 'sample.py', name: 'nope' }), /No symbol "nope".*Available: helper/);
});

test('read_symbol returns a member list for very large classes', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slimread-'));
  const methods = Array.from({ length: 80 }, (_, i) => `    def m${i}(self):\n        a = 1\n        b = 2\n        return a + b\n`).join('\n');
  fs.writeFileSync(path.join(dir, 'big.py'), `class Big:\n${methods}`);
  const out = await readSymbol(dir, { path: 'big.py', name: 'Big' });
  assert.match(out, /class Big is \d+ lines/);
  assert.match(out, /def m79\(self\)/);
  assert.ok(out.length < 4000);
  const full = await readSymbol(dir, { path: 'big.py', name: 'Big', full: true });
  assert.ok(full.includes('        return a + b'));
});

test('find_symbol searches the whole project', async () => {
  const out = await findSymbol(root, { name: 'login' });
  assert.match(out, /sample\.py:21-25 function AuthService\.login/);
  assert.match(out, /sample\.c:11-13 function login/);
  assert.match(await findSymbol(root, { name: 'fetch' }), /No exact match.*\n.*fetch_all/);
});

test('find_references finds whole-word uses', async () => {
  const out = await findReferences(root, { name: 'helper', path: 'sample.py' });
  assert.match(out, /^2 line\(s\)/);
  assert.match(out, /sample\.py:24: return helper\(0\)/);
});

test('respects .gitignore', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slimread-'));
  fs.writeFileSync(path.join(dir, '.gitignore'), 'generated/\n');
  fs.mkdirSync(path.join(dir, 'generated'));
  fs.writeFileSync(path.join(dir, 'generated', 'x.py'), 'def gen(): pass\n');
  fs.writeFileSync(path.join(dir, 'y.py'), 'def real(): pass\n');
  const out = await outline(dir, {});
  assert.match(out, /y\.py/);
  assert.doesNotMatch(out, /generated/);
});
