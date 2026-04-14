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
    this.render();
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
      const group = document.createElement('div');
      group.className = 'examples-group';
      const header = document.createElement('div');
      header.className = 'examples-group-header';
      header.textContent = cat.name;
      group.appendChild(header);
      for (const ex of cat.examples) {
        group.appendChild(this._makeItem(ex));
      }
      this.panel.appendChild(group);
    }

    if (this.regressionCategories.length) {
      const sep = document.createElement('div');
      sep.className = 'examples-separator';
      sep.textContent = 'Regression tests';
      this.panel.appendChild(sep);

      for (const cat of this.regressionCategories) {
        const group = document.createElement('div');
        group.className = 'examples-group collapsible';
        const expanded = this.expandedCategories.has(cat.name);
        if (expanded) group.classList.add('expanded');

        const header = document.createElement('div');
        header.className = 'examples-group-header collapsible';
        header.innerHTML = `
          <span class="examples-group-arrow">${expanded ? '\u25BE' : '\u25B8'}</span>
          <span class="examples-group-name">${cat.name}</span>
          <span class="examples-group-count">${cat.examples.length}</span>`;
        header.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.expandedCategories.has(cat.name)) {
            this.expandedCategories.delete(cat.name);
          } else {
            this.expandedCategories.add(cat.name);
          }
          this.render();
        });
        group.appendChild(header);

        if (expanded) {
          const items = document.createElement('div');
          items.className = 'examples-group-items';
          for (const ex of cat.examples) {
            items.appendChild(this._makeItem(ex));
          }
          group.appendChild(items);
        }
        this.panel.appendChild(group);
      }
    }
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
      if (m) {
        const flags = m[1].trim().split(/\s+/);
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
