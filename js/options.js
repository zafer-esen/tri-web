// Data-driven options panel
const MEMSAFETY_SUBS = ['valid-deref', 'valid-free', 'valid-memtrack', 'valid-memcleanup'];

const OptionsPanel = {
  groups: [
    {
      id: 'arithmetic',
      label: 'Arithmetic Mode',
      type: 'select',
      options: [
        { value: 'math', label: 'Mathematical (unbounded)', cliArg: '-arithMode:math' },
        { value: 'ilp32', label: 'ILP32 (32-bit int)', cliArg: '-arithMode:ilp32' },
        { value: 'lp64', label: 'LP64 (64-bit long)', cliArg: '-arithMode:lp64' },
        { value: 'llp64', label: 'LLP64 (Windows 64-bit)', cliArg: '-arithMode:llp64' },
      ],
      default: 'math',
      help: 'Integer arithmetic semantics. Mathematical uses unbounded integers (default). ILP32/LP64/LLP64 model machine-specific integer sizes with overflow.',
    },
    {
      id: 'properties',
      label: 'Properties to Check',
      type: 'checkboxGroup',
      options: [
        { value: 'reachsafety', label: 'Reachability Safety', cliArg: '-reachsafety',
          help: 'Check assert() statements and unreachability of reach_error().' },
        { value: 'memsafety', label: 'Memory Safety (all)', cliArg: '-memsafety',
          help: 'Check all memory safety properties at once (selects all sub-options below).' },
        { value: 'valid-deref', label: 'Valid Dereferences', cliArg: '-valid-deref', indent: true,
          help: 'Check pointer dereferences and array accesses are within bounds.' },
        { value: 'valid-free', label: 'Valid Free', cliArg: '-valid-free', indent: true,
          help: 'Check no double-free or free of non-heap memory.' },
        { value: 'valid-memtrack', label: 'Valid Memory Tracking', cliArg: '-valid-memtrack', indent: true,
          help: 'Check all allocated memory is tracked (no leaks during execution).' },
        { value: 'valid-memcleanup', label: 'Memory Cleanup', cliArg: '-valid-memcleanup', indent: true,
          help: 'Check all memory is freed before program exit.' },
      ],
      default: [],
      help: 'When none selected, reachability safety (assert statements) is checked by default.',
    },
    {
      id: 'splitProperties',
      label: 'Split Properties',
      type: 'toggle',
      cliArg: '-splitProperties',
      default: false,
      help: 'Verify each property separately rather than all at once. Useful for pinpointing which property fails.',
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
      label: 'Entry Function',
      type: 'text',
      cliArgPrefix: '-m:',
      default: 'main',
      help: 'The function to use as the program entry point.',
    },
    {
      id: 'heapModel',
      label: 'Heap Model',
      type: 'select',
      options: [
        { value: 'native', label: 'Native (theory of heaps)', cliArg: '-heapModel:native' },
        { value: 'array', label: 'Array (experimental)', cliArg: '-heapModel:array' },
      ],
      default: 'native',
      help: 'Memory model for heap operations. Native uses a theory of heaps; array is experimental.',
    },
    {
      id: 'output',
      label: 'Output Options',
      type: 'checkboxGroup',
      options: [
        { value: 'cex', label: 'Show Counterexamples', cliArg: '-cex',
          help: 'Display a textual counterexample trace when the result is UNSAFE.' },
        { value: 'dotCEX', label: 'Graphical Counterexample', cliArg: '-dotCEX',
          help: 'Generate a graphical counterexample diagram (requires Graphviz). Shown when UNSAFE.' },
        { value: 'inv', label: 'Infer Loop Invariants', cliArg: '-inv',
          help: 'Try to infer loop invariants. Automatically enables ACSL output. Only works when the program is SAFE.' },
        { value: 'acsl', label: 'Infer ACSL Annotations', cliArg: '-acsl',
          help: 'Generate ACSL-style pre/postconditions and loop invariants. Only available when the program is SAFE.' },
        { value: 'printCHCs', label: 'Print Horn Clauses', cliArg: '-p',
          help: 'Display the generated Constrained Horn Clauses (skips verification).' },
        { value: 'pDot', label: 'Graphical Horn Clauses', cliArg: '-pDot',
          help: 'Generate graphical representation of Horn clauses (requires Graphviz). Generates two graphs: before and after simplification.' },
        { value: 'printPP', label: 'TriCera Preprocessor', cliArg: '-printPP',
          help: 'Show the output of the TriCera preprocessor (tri-pp). Skips verification.' },
      ],
      default: ['cex'],
      help: 'Additional output to include with verification results.',
    },
    {
      id: 'preprocessor',
      label: 'C Preprocessor',
      type: 'select',
      options: [
        { value: 'default', label: 'None / Disabled', cliArg: null },
        { value: 'cpp', label: 'Full (cpp)', cliArg: '-cpp' },
        { value: 'cppLight', label: 'Light (no system headers)', cliArg: '-cppLight' },
      ],
      default: 'default',
      help: 'Run the C preprocessor (cpp) on the input before TriCera\'s own preprocessor (tri-pp). "Light" skips system headers.',
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
    for (const g of this.groups) {
      this.state[g.id] = JSON.parse(JSON.stringify(g.default));
    }
  },

  render() {
    this.container.innerHTML = '';
    for (const group of this.groups) {
      const el = document.createElement('div');
      el.className = 'option-group';
      el.dataset.groupId = group.id;
      el.innerHTML = this._renderLabel(group);
      el.innerHTML += this._renderControl(group);
      this.container.appendChild(el);
      this._bindEvents(el, group);
    }
  },

  _renderLabel(group) {
    return `
      <div class="option-group-label">
        ${group.label}
        <span class="help-icon">?<span class="tooltip">${group.help}</span></span>
      </div>`;
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
        ? `<span class="help-icon">?<span class="tooltip">${o.help}</span></span>`
        : '';
      const indent = o.indent ? ' checkbox-indent' : '';
      return `
        <div class="checkbox-item${indent}">
          <input type="checkbox" id="opt-${group.id}-${o.value}" data-id="${group.id}" data-value="${o.value}" ${checked}>
          <label for="opt-${group.id}-${o.value}">${o.label}</label>
          ${helpHtml}
        </div>`;
    }).join('');
    // Show default hint when nothing is selected (for properties group)
    const noneSelected = !(this.state[group.id] || []).length;
    const hint = (group.id === 'properties')
      ? `<div class="option-hint" id="properties-hint" style="display:${noneSelected ? 'block' : 'none'}">Default: checking reachability safety (assert statements)</div>`
      : '';
    return items + hint;
  },

  _renderToggle(group) {
    const checked = this.state[group.id] ? 'checked' : '';
    return `
      <div class="toggle-item">
        <label class="toggle-switch">
          <input type="checkbox" data-id="${group.id}" ${checked}>
          <span class="toggle-slider"></span>
        </label>
        <span>${group.label}</span>
      </div>`;
  },

  _renderNumber(group) {
    return `<input type="number" data-id="${group.id}" value="${this.state[group.id]}" min="${group.min || ''}" max="${group.max || ''}">`;
  },

  _renderText(group) {
    return `<input type="text" data-id="${group.id}" value="${this.state[group.id] || ''}" placeholder="${group.default || ''}">`;
  },

  _bindEvents(el, group) {
    switch (group.type) {
      case 'select':
        el.querySelector('select').addEventListener('change', e => {
          this.state[group.id] = e.target.value;
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
            this._applyCouplings(group.id, val, e.target.checked);
          });
        });
        break;
      case 'toggle':
        el.querySelector('input[type="checkbox"]').addEventListener('change', e => {
          this.state[group.id] = e.target.checked;
        });
        break;
      case 'number': {
        const inp = el.querySelector('input');
        const clamp = () => {
          let v = parseInt(inp.value, 10);
          if (isNaN(v)) v = group.default;
          if (group.min != null) v = Math.max(v, group.min);
          if (group.max != null) v = Math.min(v, group.max);
          inp.value = v;
          this.state[group.id] = v;
        };
        inp.addEventListener('change', clamp);
        inp.addEventListener('blur', clamp);
        break;
      }
      case 'text':
        el.querySelector('input').addEventListener('change', e => {
          this.state[group.id] = e.target.value.trim() || group.default;
        });
        break;
    }
  },

  // Handle option dependencies/couplings
  _applyCouplings(groupId, value, checked) {
    if (groupId === 'properties') {
      this._applyPropertyCouplings(value, checked);
    } else if (groupId === 'output') {
      this._applyOutputCouplings(value, checked);
    }
  },

  _applyPropertyCouplings(value, checked) {
    const arr = this.state.properties;
    if (value === 'memsafety') {
      // memsafety toggles all sub-options
      for (const sub of MEMSAFETY_SUBS) {
        const idx = arr.indexOf(sub);
        if (checked && idx < 0) arr.push(sub);
        if (!checked && idx >= 0) arr.splice(idx, 1);
      }
    } else if (MEMSAFETY_SUBS.includes(value)) {
      if (!checked) {
        // Deselecting a sub-option deselects memsafety
        const msIdx = arr.indexOf('memsafety');
        if (msIdx >= 0) arr.splice(msIdx, 1);
      } else {
        // If all subs are now selected, auto-select memsafety
        if (MEMSAFETY_SUBS.every(s => arr.includes(s))) {
          if (!arr.includes('memsafety')) arr.push('memsafety');
        }
      }
    }
    // Re-render to update checkboxes and hint
    this._rerenderGroup('properties');
  },

  _applyOutputCouplings(value, checked) {
    const arr = this.state.output;
    if (checked) {
      // inv auto-enables acsl
      if (value === 'inv' && !arr.includes('acsl')) {
        arr.push('acsl');
      }
      // pDot auto-enables printCHCs
      if (value === 'pDot' && !arr.includes('printCHCs')) {
        arr.push('printCHCs');
      }
    } else {
      // Deselecting acsl also deselects inv
      if (value === 'acsl') {
        const invIdx = arr.indexOf('inv');
        if (invIdx >= 0) arr.splice(invIdx, 1);
      }
      // Deselecting printCHCs also deselects pDot
      if (value === 'printCHCs') {
        const pdIdx = arr.indexOf('pDot');
        if (pdIdx >= 0) arr.splice(pdIdx, 1);
      }
    }
    // Re-render to update checkboxes
    this._rerenderGroup('output');
  },

  _rerenderGroup(groupId) {
    const group = this.groups.find(g => g.id === groupId);
    const el = this.container.querySelector(`[data-group-id="${groupId}"]`);
    if (!group || !el) return;
    el.innerHTML = this._renderLabel(group) + this._renderControl(group);
    this._bindEvents(el, group);
    this._initTooltips();
  },

  getCliArgs() {
    const args = [];
    for (const group of this.groups) {
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
          if (val != null && group.cliArgPrefix) {
            args.push(group.cliArgPrefix + val);
          }
          break;
        case 'text':
          if (val && val !== group.default && group.cliArgPrefix) {
            args.push(group.cliArgPrefix + val);
          }
          break;
      }
    }
    return args;
  },

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  },

  setState(obj) {
    for (const key in obj) {
      if (this.state.hasOwnProperty(key)) {
        this.state[key] = obj[key];
      }
    }
    this.render();
    this._initTooltips();
  },

  _initTooltips() {
    this.container.querySelectorAll('.help-icon').forEach(icon => {
      const tooltip = icon.querySelector('.tooltip');
      if (!tooltip) return;
      // Remove old listeners by cloning
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
