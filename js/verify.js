const Verifier = {
  running: false,
  currentRequestId: null,
  pollTimer: null,

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

      const result = await this._pollForResult(requestId);
      this.handleResult(result);
    } catch (err) {
      if (err.name !== 'AbortError') {
        this.handleError(err);
      }
    } finally {
      this.running = false;
      this.currentRequestId = null;
      this.pollTimer = null;
      this.setUIState('idle');
    }
  },

  _pollForResult(requestId) {
    const POLL_INTERVAL = 1000;
    const MAX_POLL_TIME = 310000;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const poll = async () => {
        if (this.currentRequestId !== requestId) {
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }

        if (Date.now() - startTime > MAX_POLL_TIME) {
          reject(new Error('Polling timed out waiting for verification result'));
          return;
        }

        try {
          const resp = await fetch(`api/result?id=${encodeURIComponent(requestId)}`);
          if (!resp.ok && resp.status !== 404) {
            throw new Error(`Server error: ${resp.status}`);
          }
          const data = await resp.json();

          if (data.status === 'running' || data.status === 'not_found') {
            this.pollTimer = setTimeout(poll, POLL_INTERVAL);
          } else {
            resolve(data);
          }
        } catch (err) {
          reject(err);
        }
      };

      this.pollTimer = setTimeout(poll, POLL_INTERVAL);
    });
  },

  async abort() {
    if (!this.running || !this.currentRequestId) return;
    const id = this.currentRequestId;
    this.currentRequestId = null;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    try {
      await fetch('api/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
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
