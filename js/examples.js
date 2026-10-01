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
      id: 'invariant-heap',
      name: 'Invariant Heap Encodings',
      examples: [],
    },
    {
      name: 'Memory Safety',
      examples: [
        { id: 'mem-deref', name: 'Null Dereference (UNSAFE)', file: 'mem-deref.c' },
        { id: 'mem-free', name: 'Double Free (UNSAFE)', file: 'mem-free.c' },
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
        { id: 'acsl-max', name: 'Max Function', file: 'acsl-max.c' },
      ],
    },
  ],

  regressionCategories: [],
  expandedCategories: new Set(),

  init(button, panel) {
    this.button = button;
    this.panel = panel;
    this.labelEl = button.querySelector('.examples-label');

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      this._togglePanel();
    });
    document.addEventListener('click', (e) => {
      if (!this.panel.contains(e.target) && e.target !== this.button) {
        this._closePanel();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._closePanel();
    });

    this._loadRegressionTests();
    this._loadArtifactExamples();
    this.render();
  },

  async _loadArtifactExamples() {
    try {
      const resp = await fetch('examples/invariant-heap.json');
      if (!resp.ok) return;
      const index = this.categories.findIndex(category => category.id === 'invariant-heap');
      this.categories[index] = await resp.json();
      this.render();
    } catch (e) {}
  },

  async _loadRegressionTests() {
    try {
      const resp = await fetch('examples/regression-tests.json');
      if (!resp.ok) return;
      this.regressionCategories = await resp.json();
      this.render();
    } catch (e) {}
  },

  _togglePanel() {
    if (this.panel.style.display === 'none') {
      this.panel.style.display = '';
    } else {
      this._closePanel();
    }
  },

  _closePanel() {
    this.panel.style.display = 'none';
  },

  render() {
    this.panel.innerHTML = '';

    for (const cat of this.categories) {
      this.panel.appendChild(this._makeGroup(cat, 'examples/' + (cat.id || cat.name)));
    }

    if (this.regressionCategories.length) {
      const sep = document.createElement('div');
      sep.className = 'examples-separator';
      sep.textContent = 'Regression tests';
      this.panel.appendChild(sep);

      for (const cat of this.regressionCategories) {
        this.panel.appendChild(this._makeGroup(cat, 'regression/' + cat.name));
      }
    }
  },

  _exampleCount(cat) {
    return (cat.examples || []).length + (cat.categories || []).reduce(
      (count, child) => count + this._exampleCount(child), 0);
  },

  _makeGroup(cat, key) {
    const group = document.createElement('details');
    group.className = 'examples-group';
    group.open = this.expandedCategories.has(key);
    const header = document.createElement('summary');
    header.className = 'examples-group-header collapsible';
    for (const [className, text] of [
      ['examples-group-arrow', '\u25B8'],
      ['examples-group-name', cat.name],
      ['examples-group-count', this._exampleCount(cat)],
    ]) {
      const span = document.createElement('span');
      span.className = className;
      span.textContent = text;
      header.appendChild(span);
    }
    group.appendChild(header);
    group.addEventListener('toggle', () => {
      if (group.open) this.expandedCategories.add(key);
      else this.expandedCategories.delete(key);
    });

    const items = document.createElement('div');
    items.className = 'examples-group-items';
    for (const child of cat.categories || []) {
      items.appendChild(this._makeGroup(child, key + '/' + (child.id || child.name)));
    }
    for (const ex of cat.examples || []) items.appendChild(this._makeItem(ex));
    group.appendChild(items);
    return group;
  },

  _makeItem(ex) {
    const item = document.createElement('div');
    item.className = 'examples-item';
    item.textContent = ex.name;
    item.addEventListener('click', () => {
      this.loadExample(ex.id);
      this._closePanel();
    });
    return item;
  },

  async loadExample(id) {
    const example = this.findExample(id);
    if (!example) return;

    try {
      const resp = await fetch('examples/' + example.file);
      if (!resp.ok) throw new Error('Failed to load example');
      const code = await resp.text();

      const firstLines = code.split('\n').slice(0, 5).join('\n');
      const m = firstLines.match(/\/\/\s*TRICERA-OPTIONS:\s*(.+)/);
      const flags = example.args || (m && m[1].trim().split(/\s+/));
      if (flags) {
        const state = OptionsPanel.cliArgsToState(flags);
        OptionsPanel.setState(state);
      } else {
        OptionsPanel.resetState();
        OptionsPanel._fullRerender();
      }

      EditorManager.setCode(code);
      OutputPanel.clear();
      OutputPanel.setStatus('idle');
      document.getElementById('status-bar').className = 'status-bar';

      if (this.labelEl) this.labelEl.textContent = example.name;
    } catch (err) {
      console.error('Failed to load example:', err);
    }
  },

  findExample(id, categories = [...this.categories, ...this.regressionCategories]) {
    for (const cat of categories) {
      for (const ex of cat.examples || []) {
        if (ex.id === id) return ex;
      }
      const nested = this.findExample(id, cat.categories || []);
      if (nested) return nested;
    }
    return null;
  },
};
