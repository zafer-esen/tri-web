// Output panel management
const OutputPanel = {
  init() {
    this.panel = document.getElementById('output-panel');
    this.statusEl = document.getElementById('output-status');
    this.tabsEl = document.getElementById('output-tabs');

    // Tab switching
    this.tabsEl.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      this.switchTab(btn.dataset.tab);
    });

    // Close button
    document.getElementById('output-close').addEventListener('click', () => this.hide());

    // Resize handle
    this._initResize();
  },

  _initResize() {
    const handle = document.getElementById('output-resize-handle');
    let startY, startH;
    const onMove = (e) => {
      const delta = startY - e.clientY;
      const newH = Math.max(80, Math.min(startH + delta, window.innerHeight * 0.7));
      this.panel.style.height = newH + 'px';
      EditorManager.layout();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    handle.addEventListener('mousedown', (e) => {
      startY = e.clientY;
      startH = this.panel.offsetHeight;
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  setStatus(status, message, elapsedMs) {
    if (status === 'idle' || status === 'verifying') {
      this.statusEl.className = 'output-status';
      this.statusEl.textContent = '';
      return;
    }

    const labels = {
      safe: 'SAFE',
      unsafe: 'UNSAFE',
      timeout: 'TIMEOUT',
      error: 'ERROR',
      unknown: 'UNKNOWN',
      info: 'INFO',
    };

    const icons = {
      safe: '\u2713',
      unsafe: '\u2717',
      info: '\u2139',
      timeout: '\u23F1',
      error: '\u26A0',
      unknown: '?',
    };

    const label = labels[status] || status.toUpperCase();
    const icon = icons[status] || '';
    const time = elapsedMs ? ` (${(elapsedMs / 1000).toFixed(1)}s)` : '';
    const msg = message ? ` \u2014 ${message}` : '';

    this.statusEl.className = 'output-status ' + status;
    this.statusEl.textContent = `${icon} ${label}${time}${msg}`;
  },

  setContent(tab, text) {
    const el = document.getElementById('output-content-' + tab);
    if (!el) return;
    el.textContent = text;

    // Show/hide tab button
    const tabBtn = this.tabsEl.querySelector(`[data-tab="${tab}"]`);
    if (tabBtn && tab !== 'output') {
      tabBtn.style.display = text ? '' : 'none';
    }
  },

  switchTab(tab) {
    this.tabsEl.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.output-content').forEach(el => {
      el.classList.toggle('active', el.id === 'output-content-' + tab);
    });
  },

  show() {
    this.panel.classList.add('open');
    // Trigger editor relayout after transition
    setTimeout(() => EditorManager.layout(), 160);
  },

  hide() {
    this.panel.classList.remove('open');
    setTimeout(() => EditorManager.layout(), 160);
  },

  setGraphImages(images) {
    const el = document.getElementById('output-content-graph');
    if (!el) return;
    el.innerHTML = '';
    for (const img of images) {
      const imgEl = document.createElement('img');
      imgEl.src = 'data:image/png;base64,' + img.data;
      imgEl.alt = img.label || 'Graph';
      imgEl.style.maxWidth = '100%';
      imgEl.style.margin = '8px 0';
      if (img.label) {
        const label = document.createElement('div');
        label.textContent = img.label;
        label.style.fontSize = '11px';
        label.style.color = '#969696';
        label.style.marginTop = '8px';
        el.appendChild(label);
      }
      el.appendChild(imgEl);
    }
    // Show graph tab
    const tabBtn = this.tabsEl.querySelector('[data-tab="graph"]');
    if (tabBtn) tabBtn.style.display = '';
  },

  clear() {
    this.setContent('output', '');
    this.setContent('acsl', '');
    this.setContent('chcs', '');
    this.setContent('pp', '');
    const graphEl = document.getElementById('output-content-graph');
    if (graphEl) graphEl.innerHTML = '';
    this.switchTab('output');
    // Hide optional tabs
    this.tabsEl.querySelectorAll('.tab-btn').forEach(b => {
      if (b.dataset.tab !== 'output') b.style.display = 'none';
    });
  },
};
