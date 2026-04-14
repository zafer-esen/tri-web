const TriceraLanguage = {
  register(monaco) {
    monaco.languages.register({
      id: 'tricera-c',
      extensions: ['.c', '.hcc'],
      aliases: ['TriCera C', 'tricera-c'],
    });

    monaco.languages.setMonarchTokensProvider('tricera-c', {
      keywords: [
        'auto', 'break', 'case', 'const', 'continue', 'default', 'do',
        'else', 'enum', 'extern', 'for', 'goto', 'if', 'inline',
        'register', 'restrict', 'return', 'sizeof', 'static', 'struct',
        'switch', 'typedef', 'union', 'volatile', 'while', '_Bool',
        '_Complex', '_Imaginary',
      ],
      typeKeywords: [
        'void', 'int', 'char', 'float', 'double', 'long', 'short',
        'unsigned', 'signed', 'NULL', 'bool', 'true', 'false',
        'size_t', 'ptrdiff_t',
      ],
      triceraKeywords: [
        'thread', 'atomic', 'within', 'chan', 'clock', 'duration',
        'assert', 'assume', 'reach_error',
        'chan_send', 'chan_receive',
        'alloca', 'malloc', 'calloc', 'realloc', 'free',
      ],
      operators: [
        '=', '>', '<', '!', '~', '?', ':',
        '==', '<=', '>=', '!=', '&&', '||', '++', '--',
        '+', '-', '*', '/', '&', '|', '^', '%', '<<', '>>', '>>>',
        '+=', '-=', '*=', '/=', '&=', '|=', '^=', '%=', '<<=', '>>=',
        '->', '.',
      ],
      symbols: /[=><!~?:&|+\-*\/\^%]+/,

      tokenizer: {
        root: [
          [/\/\*@/, 'comment.doc', '@acslBlock'],
          [/\/\*/, 'comment', '@comment'],
          [/\/\/.*$/, 'comment'],
          [/^\s*#\s*\w+/, 'keyword.preprocessor'],
          [/\b__VERIFIER_\w+\b/, 'keyword.tricera'],
          [/[a-zA-Z_]\w*/, {
            cases: {
              '@triceraKeywords': 'keyword.tricera',
              '@keywords': 'keyword',
              '@typeKeywords': 'type',
              '@default': 'identifier',
            }
          }],
          [/0[xX][0-9a-fA-F]+[uUlL]*/, 'number.hex'],
          [/0[0-7]+[uUlL]*/, 'number.octal'],
          [/\d+(\.\d+)?([eE][-+]?\d+)?[fFlLuU]*/, 'number'],
          [/"([^"\\]|\\.)*$/, 'string.invalid'],
          [/"/, 'string', '@string'],
          [/'[^\\']'/, 'string.char'],
          [/'(\\.)+'/, 'string.char'],
          [/[{}()\[\]]/, '@brackets'],
          [/@symbols/, {
            cases: {
              '@operators': 'operator',
              '@default': '',
            }
          }],
          [/[;,]/, 'delimiter'],
          [/\s+/, 'white'],
        ],

        acslBlock: [
          [/\*\//, 'comment.doc', '@pop'],
          [/\\(result|old|valid|valid_read|separated|nothing|true|false|at|null)\b/, 'keyword.acsl'],
          [/\b(requires|ensures|assigns|loop\s+invariant|loop\s+variant|assert|assume|decreases|behavior|complete\s+behaviors|disjoint\s+behaviors|predicate|logic|integer|real)\b/, 'keyword.acsl'],
          [/==>|<==|<==>/, 'operator'],
          [/[a-zA-Z_]\w*/, 'comment.doc'],
          [/./, 'comment.doc'],
        ],

        comment: [
          [/[^/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[/*]/, 'comment'],
        ],

        string: [
          [/[^\\"]+/, 'string'],
          [/\\./, 'string.escape'],
          [/"/, 'string', '@pop'],
        ],
      },
    });

    monaco.editor.defineTheme('tricera-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword.tricera', foreground: '4EC9B0', fontStyle: 'bold' },
        { token: 'keyword.acsl', foreground: 'DCDCAA', fontStyle: 'italic' },
        { token: 'comment.doc', foreground: '6A9955', fontStyle: 'italic' },
        { token: 'keyword', foreground: '569CD6' },
        { token: 'keyword.preprocessor', foreground: 'C586C0' },
        { token: 'type', foreground: '4EC9B0' },
        { token: 'number', foreground: 'B5CEA8' },
        { token: 'number.hex', foreground: 'B5CEA8' },
        { token: 'string', foreground: 'CE9178' },
        { token: 'string.char', foreground: 'CE9178' },
        { token: 'string.escape', foreground: 'D7BA7D' },
        { token: 'comment', foreground: '6A9955' },
        { token: 'operator', foreground: 'D4D4D4' },
        { token: 'delimiter', foreground: 'D4D4D4' },
      ],
      colors: {
        'editor.background': '#1e1e1e',
        'editor.foreground': '#d4d4d4',
      },
    });

    monaco.languages.registerHoverProvider('tricera-c', {
      provideHover(model, position) {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const info = TriceraLanguage.hoverInfo[word.word];
        if (!info) return null;
        return {
          range: new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn),
          contents: [{ value: info }],
        };
      }
    });
  },

  hoverInfo: {
    'assert': '**assert(expr)** -- Verify that `expr` holds. TriCera will try to prove this assertion is always true.',
    'assume': '**assume(expr)** -- Assume `expr` is true. Used to constrain the verification search space.',
    'atomic': '**atomic { ... }** -- Execute the block atomically (no thread interleaving).',
    'thread': '**thread Name { ... }** or **thread[N] Name { ... }** -- Declare a concurrent thread.',
    'chan': '**chan** -- Channel type for inter-thread communication.',
    'chan_send': '**chan_send(ch, val)** -- Send a value on a channel.',
    'chan_receive': '**chan_receive(ch)** -- Receive a value from a channel.',
    'within': '**within(lo, hi) { ... }** -- Timed block: execute within [lo, hi] time units.',
    'clock': '**clock** -- Clock variable type for timed verification.',
    'duration': '**duration** -- Duration type for timed verification.',
    'reach_error': '**reach_error()** -- Mark an unreachable program point (SV-COMP style).',
    '__VERIFIER_nondet_int': '**__VERIFIER_nondet_int()** -- Returns a nondeterministic int value.',
    '__VERIFIER_nondet_uint': '**__VERIFIER_nondet_uint()** -- Returns a nondeterministic unsigned int value.',
  },
};
