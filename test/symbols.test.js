import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { parseFile, flatten } from '../src/symbols.js';

const fixture = (f) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));

const EXPECTED = {
  'sample.py': ['helper', 'AuthService', 'AuthService.__init__', 'AuthService.hash', 'AuthService.login', 'fetch_all'],
  'sample.ts': ['User', 'Id', 'Role', 'helper', 'arrow', 'AuthService', 'AuthService.constructor', 'AuthService.login', 'AuthService.hash'],
  'sample.tsx': ['CallScreen', 'CallScreen.handleMessage', 'CallScreen.reset', 'Row'],
  'sample.js': ['helper', 'arrow', 'AuthService', 'AuthService.login'],
  'sample.go': ['AuthService', 'Store', 'Helper', 'AuthService.Login'],
  'sample.rs': ['AuthService', 'Role', 'Store', 'Store.get', 'AuthService', 'AuthService.login', 'helper', 'inner', 'inner.nested'],
  'Sample.java': ['AuthService', 'AuthService.AuthService', 'AuthService.login', 'AuthService.Store', 'AuthService.Store.get', 'AuthService.Role'],
  'Sample.cs': ['Auth', 'Auth.IStore', 'Auth.IStore.Get', 'Auth.AuthService', 'Auth.AuthService.AuthService', 'Auth.AuthService.Login', 'Auth.User'],
  'sample.c': ['auth_service', 'helper', 'login'],
  'sample.cpp': ['auth', 'auth.AuthService', 'auth.AuthService.login', 'auth.helper'],
  'sample.rb': ['Auth', 'Auth.AuthService', 'Auth.AuthService.initialize', 'Auth.AuthService.login', 'Auth.AuthService.hash', 'helper'],
  'sample.php': ['Store', 'Store.get', 'AuthService', 'AuthService.login', 'helper'],
  'sample.kt': ['AuthService', 'AuthService.login', 'Registry', 'Registry.get', 'helper'],
  'sample.swift': ['Store', 'Store.get', 'AuthService', 'AuthService.init', 'AuthService.login', 'User', 'helper'],
};

for (const [file, names] of Object.entries(EXPECTED)) {
  test(`symbols: ${file}`, async () => {
    const parsed = await parseFile(fixture(file));
    assert.deepEqual(flatten(parsed.symbols).map((s) => s.qualified), names);
  });
}

test('decorators and doc comments are part of the symbol range', async () => {
  const py = flatten((await parseFile(fixture('sample.py'))).symbols);
  assert.equal(py.find((s) => s.name === 'hash').startLine, 17); // the @staticmethod line
  const ts = flatten((await parseFile(fixture('sample.ts'))).symbols);
  assert.equal(ts.find((s) => s.name === 'helper').startLine, 15); // the /** doc */ line
});

test('kinds and signatures', async () => {
  const swift = flatten((await parseFile(fixture('sample.swift'))).symbols);
  assert.equal(swift.find((s) => s.name === 'User').kind, 'struct');
  const go = flatten((await parseFile(fixture('sample.go'))).symbols);
  assert.equal(go.find((s) => s.name === 'Login').signature, 'func (s *AuthService) Login(user string) string');
});

test('unsupported files return null', async () => {
  assert.equal(await parseFile(fileURLToPath(new URL('../package.json', import.meta.url))), null);
});
