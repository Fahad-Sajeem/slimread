// Per-language rules: which file extensions map to which grammar, and which
// syntax-tree node types count as symbols (and what kind of symbol they are).
//
// To add a language: add its extensions to EXTENSIONS, add a `defs` map below,
// and add a fixture in test/fixtures. Node type names come from the grammar;
// `node scripts/probe.js <file>` prints them for any file.

export const EXTENSIONS = {
  '.py': 'python', '.pyi': 'python',
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
  '.tsx': 'tsx',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.cs': 'c_sharp',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp',
  '.rb': 'ruby',
  '.php': 'php',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.swift': 'swift',
};

const JS_DEFS = {
  function_declaration: 'function',
  generator_function_declaration: 'function',
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  method_definition: 'method',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum',
  internal_module: 'namespace',
  // `const foo = () => {}` — only counted when the value is a function or class (see symbols.js)
  variable_declarator: 'function',
};

export const LANGUAGES = {
  python: {
    defs: { function_definition: 'function', class_definition: 'class' },
    // Decorators belong to the symbol they decorate.
    wrappers: ['decorated_definition'],
  },
  javascript: { defs: JS_DEFS, wrappers: ['export_statement'] },
  typescript: { defs: JS_DEFS, wrappers: ['export_statement'] },
  tsx: { defs: JS_DEFS, wrappers: ['export_statement'] },
  go: {
    defs: {
      function_declaration: 'function',
      method_declaration: 'method',
      type_spec: 'type',
    },
  },
  rust: {
    defs: {
      function_item: 'function',
      function_signature_item: 'function',
      struct_item: 'struct',
      enum_item: 'enum',
      trait_item: 'trait',
      impl_item: 'impl',
      mod_item: 'module',
      macro_definition: 'macro',
      type_item: 'type',
    },
  },
  java: {
    defs: {
      class_declaration: 'class',
      interface_declaration: 'interface',
      enum_declaration: 'enum',
      record_declaration: 'record',
      annotation_type_declaration: 'interface',
      method_declaration: 'method',
      constructor_declaration: 'constructor',
    },
  },
  c_sharp: {
    defs: {
      namespace_declaration: 'namespace',
      file_scoped_namespace_declaration: 'namespace',
      class_declaration: 'class',
      interface_declaration: 'interface',
      struct_declaration: 'struct',
      enum_declaration: 'enum',
      record_declaration: 'record',
      method_declaration: 'method',
      constructor_declaration: 'constructor',
      property_declaration: 'property',
    },
  },
  c: {
    defs: {
      function_definition: 'function',
      struct_specifier: 'struct',
      enum_specifier: 'enum',
      union_specifier: 'union',
    },
  },
  cpp: {
    defs: {
      function_definition: 'function',
      class_specifier: 'class',
      struct_specifier: 'struct',
      enum_specifier: 'enum',
      union_specifier: 'union',
      namespace_definition: 'namespace',
    },
    wrappers: ['template_declaration'],
  },
  ruby: {
    defs: {
      method: 'method',
      singleton_method: 'method',
      class: 'class',
      module: 'module',
    },
  },
  php: {
    defs: {
      function_definition: 'function',
      method_declaration: 'method',
      class_declaration: 'class',
      interface_declaration: 'interface',
      trait_declaration: 'trait',
      enum_declaration: 'enum',
    },
  },
  kotlin: {
    defs: {
      class_declaration: 'class',
      object_declaration: 'object',
      function_declaration: 'function',
    },
  },
  swift: {
    defs: {
      class_declaration: 'class',
      protocol_declaration: 'protocol',
      function_declaration: 'function',
      protocol_function_declaration: 'function',
      init_declaration: 'constructor',
    },
  },
};

// Syntax nodes that are comments, used to attach doc comments to the symbol below them.
export const COMMENT_TYPES = new Set(['comment', 'line_comment', 'block_comment', 'doc_comment', 'multiline_comment']);
