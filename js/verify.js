const Verifier = {
  running: false,
  currentRequestId: null,
  pollTimer: null,
  submission: null,
  aborting: false,

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
      const validationError = OptionsPanel.getValidationError();
      if (validationError) {
        this.handleResult({ status: 'ERROR', message: validationError });
        return;
      }
      const args = OptionsPanel.getCliArgs();
      this.submission = this._fetchJSON('api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, args, requestId }),
      });
      const initial = await this.submission;
      if (initial.status !== 'running') {
        this.handleResult(initial);
        return;
      }

      const maxPollTime = initial.timeoutSeconds ? initial.timeoutSeconds * 1000 + 15000 : 310000;
      const result = await this._pollForResult(requestId, maxPollTime);
      this.handleResult(result);
    } catch (err) {
      this.handleError(err);
    } finally {
      this.running = false;
      this.currentRequestId = null;
      this.pollTimer = null;
      this.submission = null;
      this.aborting = false;
    }
  },

  async _pollForResult(requestId, maxPollTime = 310000) {
    const startTime = Date.now();
    while (true) {
      await this._waitForPoll();
      const remaining = maxPollTime - (Date.now() - startTime);
      if (remaining <= 0) throw new Error('Polling timed out waiting for verification result');
      const data = await this._fetchJSON(`api/result?id=${encodeURIComponent(requestId)}`, {}, Math.min(10000, remaining));
      if (data.status === 'not_found' && Date.now() - startTime > 5000) {
        throw new Error('Verification result was not found on the server');
      }
      if (data.status !== 'running' && data.status !== 'not_found') return data;
    }
  },

  _waitForPoll() {
    return new Promise(resolve => {
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        resolve();
      }, 1000);
    });
  },

  async _fetchJSON(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      const data = await resp.json();
      if (!resp.ok && data.status !== 'ERROR' && data.status !== 'not_found') {
        throw new Error(data.message || `Server error: ${resp.status}`);
      }
      return data;
    } catch (err) {
      if (timedOut) throw new Error('Server request timed out');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  async abort() {
    if (!this.running || !this.currentRequestId || this.aborting) return;
    const id = this.currentRequestId;
    this.aborting = true;
    let accepted = false;
    try {
      // Wait for submission acknowledgement so an early Abort cannot miss the job.
      const initial = await this.submission;
      if (initial.status !== 'running' || this.currentRequestId !== id) return;
      const result = await this._fetchJSON('api/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: id }),
      });
      accepted = result.aborted;
      // Keep polling for the terminal response: PHP collects output, logs, and
      // removes temporary source files when that response is retrieved.
    } catch (err) {
      console.error('Abort failed:', err);
      // Keep polling; the server's deadline still applies if cancellation failed.
    } finally {
      if (!accepted && this.currentRequestId === id) this.aborting = false;
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
