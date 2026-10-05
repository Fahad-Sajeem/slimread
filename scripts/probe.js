// Prints the syntax tree node types of a file, to help when adding or fixing language rules.
// Usage: node scripts/probe.js path/to/file
import fs from 'node:fs';
import { createRequire } from 'node:module';
import Parser from 'web-tree-sitter';
import { languageFor } from '../src/symbols.js';

const file = process.argv[2];
const grammar = file && languageFor(file);
if (!grammar) {
  console.error('Usage: node scripts/probe.js <supported source file>');
  process.exit(1);
}
await Parser.init();
const require = createRequire(import.meta.url);
const parser = new Parser();
parser.setLanguage(await Parser.Language.load(require.resolve(`tree-sitter-wasms/out/tree-sitter-${grammar}.wasm`)));
const tree = parser.parse(fs.readFileSync(file, 'utf8'));

const walk = (node, depth) => {
  if (depth > 8) return;
  const name = node.childForFieldName('name');
  console.log(`${'  '.repeat(depth)}${node.type}  L${node.startPosition.row + 1}${name ? `  name=${name.text}` : ''}`);
  for (const child of node.namedChildren) walk(child, depth + 1);
};
walk(tree.rootNode, 0);
