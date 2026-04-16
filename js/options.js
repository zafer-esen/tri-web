const MEMSAFETY_SUBS = ['valid-deref', 'valid-free', 'valid-memtrack', 'valid-memcleanup'];

const OptionsPanel = {
  sections: [
    {
      title: 'Basic settings',
      groups: [
        {
          id: 'arithmetic',
          label: 'Integer arithmetic',
          type: 'select',
          options: [
            { value: 'math', label: 'Mathematical (unbounded)', cliArg: '-arithMode:math' },
            { value: 'ilp32', label: 'ILP32 (32-bit int)', cliArg: '-arithMode:ilp32' },
            { value: 'lp64', label: 'LP64 (64-bit long)', cliArg: '-arithMode:lp64' },
            { value: 'llp64', label: 'LLP64 (Windows 64-bit)', cliArg: '-arithMode:llp64' },
          ],
          default: 'math',
          help: 'Integer semantics. Mathematical uses unbounded integers (default). ILP32/LP64/LLP64 model machine-specific integer sizes with overflow.',
        },
        {
          id: 'timeout',
          label: 'Timeout (seconds)',
          type: 'number',
          cliArgPrefix: '-t:',
          default: 30,
          min: 1,
          max: 60,
          help: 'Maximum verification time (up to 60 seconds).',
        },
        {
          id: 'entryFunction',
          label: 'Entry function',
          type: 'text',
          cliArgPrefix: '-m:',
          default: 'main',
          help: 'The function to use as the program entry point.',
        },
        {
          id: 'preprocessor',
          label: 'C preprocessor',
          type: 'select',
          options: [
            { value: 'default', label: 'None', cliArg: null },
            { value: 'cpp', label: 'Full (cpp)', cliArg: '-cpp' },
            { value: 'cppLight', label: 'Light (no system headers)', cliArg: '-cppLight' },
          ],
          default: 'default',
          help: 'Run the C preprocessor (cpp) on the input before TriCera\'s own preprocessor (tri-pp). Light mode skips system headers.',
        },
      ],
    },
    {
      title: 'Output',
      groups: [
        {
          id: 'outputCex',
          label: 'Counterexamples',
          sublabel: 'when UNSAFE',
          type: 'checkboxGroup',
          options: [
            { value: 'cex', label: 'Textual', cliArg: '-cex',
              help: 'Display a step-by-step textual counterexample trace.' },
            { value: 'dotCEX', label: 'Graphical diagram', cliArg: '-dotCEX',
              help: 'Generate a graphical counterexample diagram. Not supported for concurrent programs (use the textual option for those).' },
          ],
          default: ['cex'],
        },
        {
          id: 'outputSol',
          label: 'Solutions',
          sublabel: 'when SAFE',
          type: 'checkboxGroup',
          options: [
            { value: 'sol', label: 'Prolog format', cliArg: '-sol',
              help: 'Display invariants and solutions in Prolog format.' },
            { value: 'ssol', label: 'SMT-LIB format', cliArg: '-ssol',
              help: 'Display invariants and solutions in SMT-LIB format.' },
          ],
          default: [],
        },
        {
          id: 'outputAnnot',
          label: 'Inferred annotations',
          sublabel: 'when SAFE',
          type: 'checkboxGroup',
          options: [
            { value: 'inv', label: 'Loop invariants', cliArg: '-inv',
              help: 'Try to infer loop invariants. Automatically enables ACSL output.' },
            { value: 'acsl', label: 'ACSL pre/postconditions', cliArg: '-acsl',
              help: 'Generate ACSL-style function contracts and loop invariants.' },
          ],
          default: [],
        },
        {
          id: 'outputCHC',
          label: 'Horn encoding of the program',
          sublabel: 'skips verification',
          type: 'checkboxGroup',
          options: [
            { value: 'printCHCs', label: 'Prolog format', cliArg: '-p',
              help: 'Display the Horn clause encoding in Prolog format.' },
            { value: 'spCHCs', label: 'SMT-LIB format', cliArg: '-sp',
              help: 'Display the Horn clause encoding in SMT-LIB format.' },
            { value: 'pDot', label: 'Graphical diagram', cliArg: '-pDot',
              help: 'Generate graphical Horn clause diagrams. Shows clauses before and after simplification.' },
          ],
          default: [],
        },
        {
          id: 'printPP',
          type: 'toggle',
          cliArg: '-printPP',
          default: false,
          label: 'TriCera preprocessor output',
          help: 'Show the output of the TriCera preprocessor (tri-pp). Skips verification.',
        },
        {
          id: 'statistics',
          type: 'toggle',
          cliArg: '-statistics',
          default: false,
          label: 'Verification statistics',
          help: 'Display solving statistics: time, CEGAR iterations, clause counts, etc.',
        },
      ],
    },
    {
      title: 'Properties to check',
      groups: [
        {
          id: 'properties',
          type: 'checkboxGroup',
          options: [
            { value: 'reachsafety', label: 'Reachability safety', cliArg: '-reachsafety',
              help: 'Check unreachability of unreach-call functions (e.g. reach_error()). User assert() statements are always checked regardless of this option.' },
            { value: 'memsafety', label: 'Memory safety (all)', cliArg: '-memsafety',
              help: 'Check all memory safety properties (selects all sub-options below).' },
            { value: 'valid-deref', label: 'Valid pointer dereferences', cliArg: '-valid-deref', indent: true,
              help: 'Check that pointer dereferences and array accesses are within bounds.' },
            { value: 'valid-free', label: 'Valid free (no double-free)', cliArg: '-valid-free', indent: true,
              help: 'Check that all free() calls are valid.' },
            { value: 'valid-memtrack', label: 'Valid memory tracking (no leaks)', cliArg: '-valid-memtrack', indent: true,
              help: 'Check that all allocated memory is tracked during execution.' },
            { value: 'valid-memcleanup', label: 'Memory cleanup (freed at exit)', cliArg: '-valid-memcleanup', indent: true,
              help: 'Check that all allocated memory is freed before program exit.' },
          ],
          default: ['reachsafety', 'valid-deref'],
          help: 'Which program properties TriCera should verify.',
        },
        {
          id: 'splitProperties',
          label: 'Check properties separately',
          type: 'toggle',
          cliArg: '-splitProperties',
          default: false,
          help: 'Verify each property independently rather than all at once. Can make individual verification tasks easier.',
        },
      ],
    },
    {
      title: 'Advanced',
      collapsible: true,
      collapsed: true,
      groups: [
        {
          id: 'backend',
          label: 'Backend',
          type: 'select',
          options: [
            { value: 'cegar', label: 'CEGAR (default)', cliArg: null },
            { value: 'sym-bfs', label: 'Symbolic execution (breadth-first)', cliArg: '-sym:bfs' },
            { value: 'sym-dfs', label: 'Symbolic execution (depth-first)', cliArg: '-sym:dfs' },
          ],
          default: 'cegar',
          help: 'CEGAR uses counterexample-guided abstraction refinement. Symbolic execution explores program paths directly (experimental).',
        },
        {
          id: 'abstract',
          label: 'Interpolation abstraction',
          type: 'select',
          options: [
            { value: 'portfolio', label: 'Portfolio (default)', cliArg: '-abstractPO' },
            { value: 'off', label: 'Off', cliArg: '-abstract:off' },
            { value: 'term', label: 'Term', cliArg: '-abstract:term' },
            { value: 'oct', label: 'Octagon', cliArg: '-abstract:oct' },
            { value: 'relEqs', label: 'Relational equalities', cliArg: '-abstract:relEqs' },
            { value: 'relIneqs', label: 'Relational inequalities', cliArg: '-abstract:relIneqs' },
            { value: 'relEqs2', label: 'Relational equalities v2', cliArg: '-abstract:relEqs2' },
            { value: 'relIneqs2', label: 'Relational inequalities v2', cliArg: '-abstract:relIneqs2' },
          ],
          default: 'portfolio',
          help: 'Controls how interpolants are abstracted during CEGAR. Portfolio runs with and without abstraction in parallel.',
          visible: () => OptionsPanel.state.backend === 'cegar',
        },
        {
          id: 'abstractTO',
          label: 'Abstraction timeout (seconds)',
          type: 'number',
          cliArgPrefix: '-abstractTO:',
          default: 2,
          min: 1,
          max: 30,
          help: 'Timeout for the abstraction template search.',
          visible: () => OptionsPanel.state.backend === 'cegar'
            && !['portfolio', 'off'].includes(OptionsPanel.state.abstract),
        },
        {
          id: 'disj',
          label: 'Disjunctive interpolation',
          type: 'toggle',
          cliArg: '-disj',
          default: false,
          help: 'Use disjunctive interpolation for more precise invariants (may be slower).',
          visible: () => OptionsPanel.state.backend === 'cegar',
        },
        {
          id: 'solReconstruction',
          label: 'Solution reconstruction',
          type: 'select',
          options: [
            { value: 'wp', label: 'Weakest preconditions (default)', cliArg: null },
            { value: 'cegar', label: 'CEGAR-based', cliArg: '-solutionReconstruction:cegar' },
          ],
          default: 'wp',
          help: 'Method for reconstructing solutions from proofs. CEGAR-based may produce different invariants.',
        },
        {
          id: 'symDepth',
          label: 'Max symex depth',
          type: 'number',
          cliArgPrefix: '-symDepth:',
          default: '',
          min: 1,
          max: 1000,
          help: 'Maximum depth for symbolic execution (underapproximation). Leave empty for unlimited.',
          visible: () => OptionsPanel.state.backend === 'sym-bfs',
        },
        {
          id: 'slicing',
          label: 'Clause slicing',
          type: 'select',
          options: [
            { value: 'yes', label: 'Yes (default)', cliArg: null },
            { value: 'no', label: 'No', cliArg: '-noSlicing' },
          ],
          default: 'yes',
          help: 'Clause slicing removes irrelevant parts of clauses to speed up solving.',
        },
        {
          id: 'splitClauses',
          label: 'Split disjunctions in clauses',
          type: 'select',
          options: [
            { value: '0', label: "Don't split (0)", cliArg: '-splitClauses:0' },
            { value: '1', label: 'Default (1)', cliArg: null },
            { value: '2', label: 'Aggressive (2)', cliArg: '-splitClauses:2' },
          ],
          default: '1',
          help: 'How aggressively to split disjunctions in Horn clauses. Higher values may help with some programs but increase clause count.',
        },
        {
          id: 'heapModel',
          label: 'Heap model',
          type: 'select',
          options: [
            { value: 'native', label: 'Native (theory of heaps)', cliArg: '-heapModel:native' },
            { value: 'array', label: 'Array (experimental)', cliArg: '-heapModel:array' },
          ],
          default: 'native',
          help: 'Memory model for heap operations. Native uses a theory of heaps; array-based is experimental.',
        },
        {
          id: 'programArrays',
          label: 'Program arrays',
          type: 'select',
          options: [
            { value: 'heap', label: 'Theory of heaps (default)', cliArg: null },
            { value: 'math', label: 'Mathematical', cliArg: '-mathArrays' },
          ],
          default: 'heap',
          help: 'How to model C arrays. Theory of heaps allocates arrays on the heap. Mathematical arrays are unbounded and skip memory safety checks on arrays.',
        },
        {
          id: 'forceNondetInit',
          label: 'Non-deterministic initialization',
          type: 'toggle',
          cliArg: '-forceNondetInit',
          default: false,
          help: 'Initialize static and global variables to non-deterministic values instead of the default zero.',
        },
      ],
    },
  ],

  state: {},

  init(container) {
    this.container = container;
    this.resetState();
    this.render();
    this._initTooltips();
  },

  resetState() {
    this.state = {};
    for (const sec of this.sections) {
      for (const g of sec.groups) {
        this.state[g.id] = JSON.parse(JSON.stringify(g.default));
      }
    }
  },

  render() {
    this.container.innerHTML = '';
    for (const sec of this.sections) {
      const header = document.createElement('div');
      header.className = 'option-section-title';
      if (sec.collapsible) header.classList.add('collapsible');
      if (sec.collapsed) header.classList.add('collapsed');
      header.dataset.sectionTitle = sec.title;
      const arrow = sec.collapsible ? (sec.collapsed ? '\u25B8 ' : '\u25BE ') : '';
      header.textContent = arrow + sec.title;
      this.container.appendChild(header);

      const body = document.createElement('div');
      body.className = 'option-section-body';
      if (sec.collapsed) body.style.display = 'none';
      this.container.appendChild(body);

      if (sec.collapsible) {
        header.addEventListener('click', () => {
          sec.collapsed = !sec.collapsed;
          header.classList.toggle('collapsed', sec.collapsed);
          body.style.display = sec.collapsed ? 'none' : '';
          header.textContent = (sec.collapsed ? '\u25B8 ' : '\u25BE ') + sec.title;
        });
      }

      for (const group of sec.groups) {
        const el = document.createElement('div');
        el.className = 'option-group';
        el.dataset.groupId = group.id;
        if (group.visible && !group.visible()) el.style.display = 'none';
        if (group.label && group.type !== 'toggle') {
          el.innerHTML = this._renderLabel(group);
        }
        el.innerHTML += this._renderControl(group);
        body.appendChild(el);
        this._bindEvents(el, group);
      }

      if (sec.title === 'Advanced') {
        const preview = document.createElement('div');
        preview.className = 'cli-preview-wrap';
        preview.innerHTML = `
          <div class="cli-preview-label">Command line preview</div>
          <pre class="cli-preview"></pre>`;
        body.appendChild(preview);
      }
    }
    this._updateCliPreview();
  },

  _renderLabel(group) {
    const sublabel = group.sublabel
      ? `<span class="option-sublabel">${group.sublabel}</span>` : '';
    const help = group.help
      ? `<span class="help-icon">?<span class="tooltip">${group.help}</span></span>` : '';
    return `<div class="option-group-label">${group.label}${sublabel}${help}</div>`;
  },

  _renderControl(group) {
    switch (group.type) {
      case 'select': return this._renderSelect(group);
      case 'checkboxGroup': return this._renderCheckboxGroup(group);
      case 'toggle': return this._renderToggle(group);
      case 'number': return this._renderNumber(group);
      case 'text': return this._renderText(group);
      default: return '';
    }
  },

  _renderSelect(group) {
    const opts = group.options.map(o =>
      `<option value="${o.value}" ${this.state[group.id] === o.value ? 'selected' : ''}>${o.label}</option>`
    ).join('');
    return `<select data-id="${group.id}">${opts}</select>`;
  },

  _renderCheckboxGroup(group) {
    const items = group.options.map(o => {
      const checked = (this.state[group.id] || []).includes(o.value) ? 'checked' : '';
      const helpHtml = o.help
        ? `<span class="help-icon">?<span class="tooltip">${o.help}</span></span>` : '';
      const indent = o.indent ? ' checkbox-indent' : '';
      return `
        <div class="checkbox-item${indent}">
          <input type="checkbox" id="opt-${group.id}-${o.value}" data-id="${group.id}" data-value="${o.value}" ${checked}>
          <label for="opt-${group.id}-${o.value}">${o.label}</label>
          ${helpHtml}
        </div>`;
    }).join('');
    if (group.id !== 'properties') return items;
    const arr = this.state[group.id] || [];
    const noneSelected = !arr.length;
    const hint = `<div class="option-hint" style="display:${noneSelected ? 'block' : 'none'}">No properties selected: reachability safety will be used as the default.</div>`;
    const warn = `<div class="option-warning" style="display:${!noneSelected && !arr.includes('reachsafety') ? 'block' : 'none'}">Note: reach_error() calls are not being checked without Reachability safety.</div>`;
    return items + hint + warn;
  },

  _renderToggle(group) {
    const checked = this.state[group.id] ? 'checked' : '';
    const help = group.help
      ? `<span class="help-icon">?<span class="tooltip">${group.help}</span></span>` : '';
    return `
      <div class="toggle-item">
        <label class="toggle-switch">
          <input type="checkbox" data-id="${group.id}" ${checked}>
          <span class="toggle-slider"></span>
        </label>
        <span>${group.label}</span>
        ${help}
      </div>`;
  },

  _renderNumber(group) {
    const val = this.state[group.id];
    return `<input type="number" data-id="${group.id}" value="${val === '' ? '' : val}" min="${group.min || ''}" max="${group.max || ''}" placeholder="${group.default === '' ? 'unlimited' : ''}">`;
  },

  _renderText(group) {
    return `<input type="text" data-id="${group.id}" value="${this.state[group.id] || ''}" placeholder="${group.default || ''}">`;
  },

  _bindEvents(el, group) {
    switch (group.type) {
      case 'select':
        el.querySelector('select').addEventListener('change', e => {
          this.state[group.id] = e.target.value;
          this._onGroupChange(group.id);
          this._updateCliPreview();
        });
        break;
      case 'checkboxGroup':
        el.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.addEventListener('change', e => {
            const val = e.target.dataset.value;
            const arr = this.state[group.id] || [];
            if (e.target.checked) {
              if (!arr.includes(val)) arr.push(val);
            } else {
              const idx = arr.indexOf(val);
              if (idx >= 0) arr.splice(idx, 1);
            }
            this.state[group.id] = arr;
            this._onCheckboxChange(group.id, val, e.target.checked);
            this._updateCliPreview();
          });
        });
        break;
      case 'toggle':
        el.querySelector('input[type="checkbox"]').addEventListener('change', e => {
          this.state[group.id] = e.target.checked;
          this._updateCliPreview();
        });
        break;
      case 'number': {
        const inp = el.querySelector('input');
        const clamp = () => {
          if (inp.value === '' && group.default === '') {
            this.state[group.id] = '';
          } else {
            let v = parseInt(inp.value, 10);
            if (isNaN(v)) v = group.default === '' ? '' : group.default;
            else {
              if (group.min != null) v = Math.max(v, group.min);
              if (group.max != null) v = Math.min(v, group.max);
            }
            inp.value = v;
            this.state[group.id] = v;
          }
          this._updateCliPreview();
        };
        inp.addEventListener('change', clamp);
        inp.addEventListener('blur', clamp);
        break;
      }
      case 'text':
        el.querySelector('input').addEventListener('change', e => {
          this.state[group.id] = e.target.value.trim() || group.default;
          this._updateCliPreview();
        });
        break;
    }
  },

  _onGroupChange(groupId) {
    if (groupId === 'backend' || groupId === 'abstract') {
      this._fullRerender();
    }
  },

  _onCheckboxChange(groupId, value, checked) {
    if (groupId === 'properties') this._applyPropertyCouplings(value, checked);
    else if (groupId === 'outputAnnot') this._applyAnnotationCouplings(value, checked);
    else if (groupId === 'outputCHC') this._applyCHCCouplings(value, checked);
    else if (groupId === 'outputCex') this._applyCexCouplings(value, checked);
  },

  _applyPropertyCouplings(value, checked) {
    const arr = this.state.properties;
    if (value === 'memsafety') {
      for (const sub of MEMSAFETY_SUBS) {
        const idx = arr.indexOf(sub);
        if (checked && idx < 0) arr.push(sub);
        if (!checked && idx >= 0) arr.splice(idx, 1);
      }
    } else if (MEMSAFETY_SUBS.includes(value)) {
      if (!checked) {
        const msIdx = arr.indexOf('memsafety');
        if (msIdx >= 0) arr.splice(msIdx, 1);
      } else if (MEMSAFETY_SUBS.every(s => arr.includes(s))) {
        if (!arr.includes('memsafety')) arr.push('memsafety');
      }
    }
    this._rerenderGroup('properties');
  },

  _applyAnnotationCouplings(value, checked) {
    const arr = this.state.outputAnnot;
    if (checked && value === 'inv' && !arr.includes('acsl')) arr.push('acsl');
    if (!checked && value === 'acsl') {
      const idx = arr.indexOf('inv');
      if (idx >= 0) arr.splice(idx, 1);
    }
    this._rerenderGroup('outputAnnot');
  },

  _applyCHCCouplings(value, checked) {
    const arr = this.state.outputCHC;
    if (checked && value === 'pDot' && !arr.includes('printCHCs')) arr.push('printCHCs');
    if (!checked && value === 'printCHCs') {
      const idx = arr.indexOf('pDot');
      if (idx >= 0) arr.splice(idx, 1);
    }
    this._rerenderGroup('outputCHC');
  },

  _applyCexCouplings(value, checked) {
    const arr = this.state.outputCex;
    if (checked && value === 'dotCEX' && !arr.includes('cex')) arr.push('cex');
    this._rerenderGroup('outputCex');
  },

  _rerenderGroup(groupId) {
    const group = this._findGroup(groupId);
    const el = this.container.querySelector(`[data-group-id="${groupId}"]`);
    if (!group || !el) return;
    const labelHtml = (group.label && group.type !== 'toggle') ? this._renderLabel(group) : '';
    el.innerHTML = labelHtml + this._renderControl(group);
    this._bindEvents(el, group);
    this._initTooltips();
    this._updateCliPreview();
  },

  _fullRerender() {
    this.render();
    this._initTooltips();
  },

  _findGroup(id) {
    for (const sec of this.sections) {
      for (const g of sec.groups) {
        if (g.id === id) return g;
      }
    }
    return null;
  },

  _updateCliPreview() {
    const el = this.container && this.container.querySelector('.cli-preview');
    if (!el) return;
    const args = this.getCliArgs();
    el.textContent = 'tri ' + args.join(' ') + (args.length ? ' ' : '') + 'program.c';
  },

  getCliArgs() {
    const args = [];
    for (const sec of this.sections) {
      for (const group of sec.groups) {
        if (group.visible && !group.visible()) continue;
        const val = this.state[group.id];
        switch (group.type) {
          case 'select': {
            const opt = group.options.find(o => o.value === val);
            if (opt && opt.cliArg) args.push(opt.cliArg);
            break;
          }
          case 'checkboxGroup':
            for (const v of (val || [])) {
              const opt = group.options.find(o => o.value === v);
              if (opt) args.push(opt.cliArg);
            }
            break;
          case 'toggle':
            if (val && group.cliArg) args.push(group.cliArg);
            break;
          case 'number':
            if (val !== '' && val != null && group.cliArgPrefix)
              args.push(group.cliArgPrefix + val);
            break;
          case 'text':
            if (val && val !== group.default && group.cliArgPrefix)
              args.push(group.cliArgPrefix + val);
            break;
        }
      }
    }
    return args;
  },

  cliArgsToState(args) {
    const state = {};
    for (const sec of this.sections) {
      for (const g of sec.groups) {
        state[g.id] = JSON.parse(JSON.stringify(g.default));
      }
    }
    for (const arg of args) {
      this._matchArgToState(arg, state);
    }
    return state;
  },

  _matchArgToState(arg, state) {
    for (const sec of this.sections) {
      for (const group of sec.groups) {
        switch (group.type) {
          case 'select': {
            const opt = group.options.find(o => o.cliArg === arg);
            if (opt) { state[group.id] = opt.value; return; }
            break;
          }
          case 'checkboxGroup': {
            const opt = group.options.find(o => o.cliArg === arg);
            if (opt) {
              if (!state[group.id].includes(opt.value)) state[group.id].push(opt.value);
              return;
            }
            break;
          }
          case 'toggle':
            if (group.cliArg === arg) { state[group.id] = true; return; }
            break;
          case 'number':
            if (group.cliArgPrefix && arg.startsWith(group.cliArgPrefix)) {
              const v = parseInt(arg.slice(group.cliArgPrefix.length), 10);
              if (!isNaN(v)) state[group.id] = v;
              return;
            }
            break;
          case 'text':
            if (group.cliArgPrefix && arg.startsWith(group.cliArgPrefix)) {
              state[group.id] = arg.slice(group.cliArgPrefix.length);
              return;
            }
            break;
        }
      }
    }
  },

  getState() { return JSON.parse(JSON.stringify(this.state)); },

  setState(obj) {
    for (const key in obj) {
      if (this.state.hasOwnProperty(key)) this.state[key] = obj[key];
    }
    this._fullRerender();
  },

  _initTooltips() {
    this.container.querySelectorAll('.help-icon').forEach(icon => {
      const tooltip = icon.querySelector('.tooltip');
      if (!tooltip) return;
      const newIcon = icon.cloneNode(true);
      icon.parentNode.replaceChild(newIcon, icon);
      const newTooltip = newIcon.querySelector('.tooltip');
      newIcon.addEventListener('mouseenter', () => {
        const rect = newIcon.getBoundingClientRect();
        newTooltip.style.top = (rect.top - 4) + 'px';
        newTooltip.style.right = (window.innerWidth - rect.left + 6) + 'px';
        newTooltip.style.left = '';
        newTooltip.classList.add('visible');
      });
      newIcon.addEventListener('mouseleave', () => {
        newTooltip.classList.remove('visible');
      });
    });
  },
};
