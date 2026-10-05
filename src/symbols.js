// Parses source files with tree-sitter and extracts a tree of symbols
// (classes, functions, methods, ...) with their exact line ranges.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import Parser from 'web-tree-sitter';
import { EXTENSIONS, LANGUAGES, COMMENT_TYPES } from './languages.js';

const require = createRequire(import.meta.url);

export const MAX_FILE_BYTES = 2 * 1024 * 1024;

let initPromise;
const languageCache = new Map(); // grammar name -> Promise<Language>
const fileCache = new Map(); // abs path -> { key, result }
const FILE_CACHE_LIMIT = 300;

export function languageFor(file) {
  return EXTENSIONS[path.extname(file).toLowerCase()] ?? null;
}

async function loadLanguage(grammar) {
  initPromise ??= Parser.init();
  await initPromise;
  if (!languageCache.has(grammar)) {
    const wasm = require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`);
    languageCache.set(grammar, Parser.Language.load(wasm));
  }
  return languageCache.get(grammar);
}

/**
 * Parse a file and return { language, lines, symbols }.
 * Returns null for unsupported file types. Results are cached until the file changes.
 */
export async function parseFile(absPath) {
  const grammar = languageFor(absPath);
  if (!grammar) return null;
  const stat = fs.statSync(absPath);
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`File is too large to parse (${Math.round(stat.size / 1024)} KB, limit ${MAX_FILE_BYTES / 1024} KB)`);
  }
  const key = `${stat.mtimeMs}:${stat.size}`;
  const cached = fileCache.get(absPath);
  if (cached && cached.key === key) return cached.result;

  const source = fs.readFileSync(absPath, 'utf8');
  const result = await parseSource(source, grammar);

  if (fileCache.size >= FILE_CACHE_LIMIT) fileCache.delete(fileCache.keys().next().value);
  fileCache.set(absPath, { key, result });
  return result;
}

export async function parseSource(source, grammar) {
  const language = await loadLanguage(grammar);
  const parser = new Parser();
  parser.setLanguage(language);
  const tree = parser.parse(source);
  try {
    const symbols = [];
    collect(tree.rootNode, LANGUAGES[grammar], grammar, null, symbols);
    return { language: grammar, lines: source.split(/\r?\n/), symbols };
  } finally {
    tree.delete();
    parser.delete();
  }
}

function collect(node, rules, grammar, parent, out) {
  for (const child of node.namedChildren) {
    const kind = rules.defs[child.type];
    const symbol = kind ? makeSymbol(child, kind, rules, grammar, parent) : null;
    if (symbol) {
      out.push(symbol);
      collect(child, rules, grammar, symbol, symbol.children);
    } else {
      collect(child, rules, grammar, parent, out);
    }
  }
}

function makeSymbol(node, kind, rules, grammar, parent) {
  const named = nameOf(node, grammar);
  if (!named) return null;
  const { name, qualifier, label } = named;

  // Extend the range outward over wrappers (decorators, `export`, templates)
  // and upward over doc comments / attributes directly above the symbol.
  let outer = (node.type === 'variable_declarator' && declarationOf(node)) || node;
  while (outer.parent && rules.wrappers?.includes(outer.parent.type)) outer = outer.parent;
  let startRow = outer.startPosition.row;
  for (let prev = outer.previousNamedSibling; prev; prev = prev.previousNamedSibling) {
    const isDoc = COMMENT_TYPES.has(prev.type) || prev.type === 'attribute_item' || prev.type === 'decorator';
    if (!isDoc || prev.endPosition.row < startRow - 1) break;
    startRow = prev.startPosition.row;
  }

  const prefix = [parent?.qualified, qualifier].filter(Boolean).join('.');
  return {
    name,
    kind: refineKind(node, kind, grammar),
    qualified: prefix ? `${prefix}.${name}` : name,
    label: label ?? name,
    signature: signatureOf(node),
    startLine: startRow + 1,
    endLine: outer.endPosition.row + 1,
    children: [],
  };
}

function nameOf(node, grammar) {
  switch (node.type) {
    case 'variable_declarator': {
      // `const foo = () => {}` (or a function/class value, or one wrapped in a call such as
      // useCallback(() => ...), memo(...), forwardRef(...)) counts when declared at module level
      // or directly in a function body — e.g. the handlers inside a React component.
      if (!isFunctionValue(node.childForFieldName('value'))) return null;
      const decl = declarationOf(node);
      const scope = decl?.parent;
      const atModule = scope && ['program', 'export_statement'].includes(scope.type);
      const inFunctionBody = scope?.type === 'statement_block' && FUNCTION_NODES.has(scope.parent?.type);
      if (!atModule && !inFunctionBody) return null;
      const id = node.childForFieldName('name');
      return id?.type === 'identifier' ? { name: id.text } : null;
    }
    case 'method_declaration':
      if (grammar === 'go') {
        // func (s *AuthService) Login() -> AuthService.Login
        const receiver = node.childForFieldName('receiver');
        const type = receiver && findDescendant(receiver, (n) => n.type === 'type_identifier');
        return { name: node.childForFieldName('name').text, qualifier: type?.text };
      }
      break;
    case 'impl_item': {
      // impl Trait for Type -> named after Type, so Type.method works for lookups
      const type = node.childForFieldName('type');
      if (!type) return null;
      const name = type.text.replace(/<.*$/s, '');
      const trait = node.childForFieldName('trait');
      return { name, label: trait ? `${trait.text} for ${type.text}` : type.text };
    }
    case 'function_definition':
      if (grammar === 'c' || grammar === 'cpp') return cFunctionName(node);
      break;
    case 'struct_specifier':
    case 'class_specifier':
    case 'enum_specifier':
    case 'union_specifier':
      // `struct foo *p` is a use, not a definition — require a body.
      if (!node.childForFieldName('body')) return null;
      break;
    case 'init_declaration':
      return { name: 'init' };
  }

  const nameNode = node.childForFieldName('name')
    ?? node.namedChildren.find((c) => ['identifier', 'type_identifier', 'simple_identifier', 'constant'].includes(c.type));
  return nameNode ? { name: nameNode.text } : null;
}

const FUNCTION_VALUES = new Set(['arrow_function', 'function_expression', 'function', 'generator_function', 'class']);
const FUNCTION_NODES = new Set(['function_declaration', 'generator_function_declaration', 'method_definition', ...FUNCTION_VALUES]);

function isFunctionValue(value) {
  if (!value) return false;
  if (FUNCTION_VALUES.has(value.type)) return true;
  if (value.type === 'call_expression') {
    const first = value.childForFieldName('arguments')?.namedChildren[0];
    return isFunctionValue(first);
  }
  return false;
}

function cFunctionName(node) {
  let decl = node.childForFieldName('declarator');
  while (decl && !['identifier', 'field_identifier', 'qualified_identifier', 'operator_name', 'destructor_name'].includes(decl.type)) {
    decl = decl.childForFieldName('declarator') ?? decl.namedChildren.find((c) => c.type.endsWith('declarator') || c.type.endsWith('identifier'));
  }
  if (!decl) return null;
  if (decl.type === 'qualified_identifier') {
    // AuthService::login -> name "login", qualified "AuthService.login"
    const parts = decl.text.split('::');
    return { name: parts.pop(), qualifier: parts.join('.') || undefined };
  }
  return { name: decl.text };
}

function refineKind(node, kind, grammar) {
  // Swift and Kotlin use one node type for class/struct/enum/interface; the keyword tells them apart.
  if ((grammar === 'swift' || grammar === 'kotlin') && node.type === 'class_declaration') {
    const keyword = node.children.find((c) => !c.isNamed && /^(class|struct|enum|extension|actor|interface)$/.test(c.type));
    if (keyword) return keyword.type;
  }
  return kind;
}

function signatureOf(node) {
  let text = node.text;
  const body = node.childForFieldName('body');
  if (body && text.endsWith(body.text) && body.text.length < text.length) {
    text = text.slice(0, text.length - body.text.length);
  } else {
    text = text.split('\n')[0];
  }
  text = text.replace(/\s+/g, ' ').trim().replace(/[\s{:=]+$/, '').trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function declarationOf(declarator) {
  const p = declarator.parent;
  return p && (p.type === 'lexical_declaration' || p.type === 'variable_declaration') ? p : null;
}

function findDescendant(node, pred) {
  for (const child of node.namedChildren) {
    if (pred(child)) return child;
    const found = findDescendant(child, pred);
    if (found) return found;
  }
  return null;
}

/** Depth-first list of all symbols in a symbol tree. */
export function flatten(symbols, out = []) {
  for (const s of symbols) {
    out.push(s);
    flatten(s.children, out);
  }
  return out;
}
