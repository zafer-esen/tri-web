const Verifier = {
  running: false,
  currentRequestId: null,

  async verify() {
    if (this.running) return;
    this.running = true;

    const code = EditorManager.getCode();
    if (!code.trim()) {
      this.running = false;
      return;
    }

    const requestId = (crypto.randomUUID && crypto.randomUUID()) ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.currentRequestId = requestId;

    EditorManager.clearAll();
    OutputPanel.clear();
    this.setUIState('verifying');

    try {
      const args = OptionsPanel.getCliArgs();
      const resp = await fetch('api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, args, requestId }),
      });
      if (!resp.ok) throw new Error(`Server error: ${resp.status}`);
      this.handleResult(await resp.json());
    } catch (err) {
      this.handleError(err);
    } finally {
      this.running = false;
      this.currentRequestId = null;
      this.setUIState('idle');
    }
  },

  async abort() {
    if (!this.running || !this.currentRequestId) return;
    try {
      await fetch('api/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: this.currentRequestId }),
      });
    } catch (err) {
      console.error('Abort failed:', err);
    }
  },

  handleResult(result) {
    const status = (result.status || 'UNKNOWN').toLowerCase();
    this.setUIState(status);

    if (status === 'safe') {
      EditorManager.setDecorations('safe');
    } else if (status === 'unsafe') {
      const lines = (result.diagnostics || []).filter(d => d.line).map(d => d.line);
      EditorManager.setDecorations('unsafe', lines);
      if (result.diagnostics && result.diagnostics.length)
        EditorManager.setMarkers(result.diagnostics);
    } else if (result.diagnostics && result.diagnostics.length) {
      EditorManager.setMarkers(result.diagnostics);
    }

    OutputPanel.setStatus(status, result.message, result.elapsedMs);
    OutputPanel.setContent('output', result.rawOutput || result.message || '');

    if (result.acsl) OutputPanel.setContent('acsl', result.acsl);
    if (result.chcs) OutputPanel.setContent('chcs', result.chcs);
    if (result.preprocessorOutput) OutputPanel.setContent('pp', result.preprocessorOutput);
    if (result.graphImages && result.graphImages.length)
      OutputPanel.setGraphImages(result.graphImages);
    OutputPanel.show();

    if (status === 'info') {
      if (result.chcs) OutputPanel.switchTab('chcs');
      else if (result.preprocessorOutput) OutputPanel.switchTab('pp');
    } else if (result.graphImages && result.graphImages.length) {
      OutputPanel.switchTab('graph');
    }
  },

  handleError(err) {
    this.setUIState('error');
    OutputPanel.setStatus('error', 'Connection error: ' + err.message);
    OutputPanel.setContent('output', 'Error communicating with the server:\n' + err.message);
    OutputPanel.show();
  },

  setUIState(status) {
    const bar = document.getElementById('status-bar');
    bar.className = 'status-bar ' + (status === 'idle' ? '' : status);

    const verifyBtn = document.getElementById('verify-btn');
    const abortBtn = document.getElementById('abort-btn');
    if (status === 'verifying') {
      verifyBtn.disabled = true;
      verifyBtn.classList.add('verifying');
      abortBtn.disabled = false;
    } else {
      verifyBtn.disabled = false;
      verifyBtn.classList.remove('verifying');
      abortBtn.disabled = true;
    }
  },
};
