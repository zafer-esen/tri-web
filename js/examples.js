// Example programs and loader
const ExamplesLoader = {
  categories: [
    {
      name: 'Basic Verification',
      examples: [
        { id: 'basic-assert', name: 'Simple Assertion (SAFE)', file: 'basic-assert.c' },
        { id: 'basic-unsafe', name: 'Failing Assertion (UNSAFE)', file: 'basic-unsafe.c' },
        { id: 'loop-invariant', name: 'Loop Invariant', file: 'loop-invariant.c' },
      ],
    },
    {
      name: 'Heap & Pointers',
      examples: [
        { id: 'swap-heap', name: 'Pointer Swap', file: 'swap-heap.c' },
        { id: 'linked-list', name: 'Linked List', file: 'linked-list.c' },
      ],
    },
    {
      name: 'Memory Safety',
      examples: [
        { id: 'mem-deref', name: 'Valid Dereference', file: 'mem-deref.c',
          options: { properties: ['valid-deref'] } },
        { id: 'mem-free', name: 'Double Free (UNSAFE)', file: 'mem-free.c',
          options: { properties: ['valid-free'] } },
      ],
    },
    {
      name: 'Concurrency',
      examples: [
        { id: 'atomic-inc', name: 'Atomic Increment', file: 'atomic-inc.hcc' },
      ],
    },
    {
      name: 'ACSL Contracts',
      examples: [
        { id: 'acsl-max', name: 'Max Function', file: 'acsl-max.c',
          options: { output: ['acsl'] } },
      ],
    },
  ],

  // Regression test categories loaded from JSON manifest
  regressionCategories: [],

  init(selectEl) {
    this.selectEl = selectEl;
    this.render();
    this.selectEl.addEventListener('change', e => {
      if (e.target.value) this.loadExample(e.target.value);
    });
    // Load regression tests manifest asynchronously
    this._loadRegressionTests();
  },

  async _loadRegressionTests() {
    try {
      const resp = await fetch('examples/regression-tests.json');
      if (!resp.ok) return;
      this.regressionCategories = await resp.json();
      this.render();
    } catch (e) {
      // Regression tests not available (e.g., not deployed)
    }
  },

  render() {
    this.selectEl.innerHTML = '<option value="">Load Example...</option>';

    // Curated examples
    for (const cat of this.categories) {
      this._addOptgroup(cat);
    }

    // Regression tests (grouped under a separator)
    if (this.regressionCategories.length) {
      const sep = document.createElement('optgroup');
      sep.label = '--- Regression Tests ---';
      sep.disabled = true;
      this.selectEl.appendChild(sep);

      for (const cat of this.regressionCategories) {
        this._addOptgroup(cat);
      }
    }
  },

  _addOptgroup(cat) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = cat.name;
    for (const ex of cat.examples) {
      const opt = document.createElement('option');
      opt.value = ex.id;
      opt.textContent = ex.name;
      optgroup.appendChild(opt);
    }
    this.selectEl.appendChild(optgroup);
  },

  async loadExample(id) {
    const example = this.findExample(id);
    if (!example) return;

    try {
      const resp = await fetch('examples/' + example.file);
      if (!resp.ok) throw new Error('Failed to load example');
      const code = await resp.text();
      EditorManager.setCode(code);
      OutputPanel.clear();
      OutputPanel.setStatus('idle');
      document.getElementById('status-bar').className = 'status-bar';

      // Apply recommended options if any
      if (example.options) {
        OptionsPanel.resetState();
        OptionsPanel.setState(example.options);
      }
    } catch (err) {
      console.error('Failed to load example:', err);
    }

    // Reset dropdown
    this.selectEl.value = '';
  },

  findExample(id) {
    for (const cat of this.categories) {
      for (const ex of cat.examples) {
        if (ex.id === id) return ex;
      }
    }
    for (const cat of this.regressionCategories) {
      for (const ex of cat.examples) {
        if (ex.id === id) return ex;
      }
    }
    return null;
  },
};
