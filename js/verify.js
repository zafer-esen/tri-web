// Verification lifecycle
const Verifier = {
  running: false,

  async verify() {
    if (this.running) return;
    this.running = true;

    const code = EditorManager.getCode();
    if (!code.trim()) {
      this.running = false;
      return;
    }

    // Clear previous results
    EditorManager.clearAll();
    OutputPanel.clear();
    this.setUIState('verifying');

    try {
      const args = OptionsPanel.getCliArgs();
      const resp = await fetch('api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, args }),
      });

      if (!resp.ok) {
        throw new Error(`Server error: ${resp.status}`);
      }

      const result = await resp.json();
      this.handleResult(result);
    } catch (err) {
      this.handleError(err);
    } finally {
      this.running = false;
      const btn = document.getElementById('verify-btn');
      btn.disabled = false;
      btn.classList.remove('verifying');
      btn.textContent = 'Verify';
    }
  },

  handleResult(result) {
    const status = (result.status || 'UNKNOWN').toLowerCase();
    this.setUIState(status);

    // Apply editor decorations
    if (status === 'safe') {
      EditorManager.setDecorations('safe');
    } else if (status === 'unsafe') {
      const lines = (result.diagnostics || [])
        .filter(d => d.line)
        .map(d => d.line);
      EditorManager.setDecorations('unsafe', lines);
      if (result.diagnostics && result.diagnostics.length) {
        EditorManager.setMarkers(result.diagnostics);
      }
    } else if (result.diagnostics && result.diagnostics.length) {
      // Parse errors, etc.
      EditorManager.setMarkers(result.diagnostics);
    }

    // Populate output panel
    OutputPanel.setStatus(status, result.message, result.elapsedMs);

    // Build primary output: counterexample first (if UNSAFE), then raw output
    let mainOutput = '';
    if (status === 'unsafe' && result.counterexample) {
      mainOutput += 'Counterexample:\n' + result.counterexample + '\n\n';
    }
    if (result.diagnostics && result.diagnostics.length) {
      for (const d of result.diagnostics) {
        const prop = d.property ? ` (${d.property})` : '';
        mainOutput += `${d.message} at line ${d.line}${prop}\n`;
      }
      mainOutput += '\n';
    }
    mainOutput += result.rawOutput || result.message || '';
    OutputPanel.setContent('output', mainOutput);

    // ACSL annotations (only shown when SAFE)
    if (result.acsl) OutputPanel.setContent('acsl', result.acsl);
    // CHCs (when -p flag used, status is 'info')
    if (result.chcs) OutputPanel.setContent('chcs', result.chcs);
    // Preprocessor output
    if (result.preprocessorOutput) OutputPanel.setContent('pp', result.preprocessorOutput);
    // Graphviz images
    if (result.graphImages && result.graphImages.length) {
      OutputPanel.setGraphImages(result.graphImages);
    }
    OutputPanel.show();

    // Auto-switch to the most relevant tab
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
    // Status bar
    const bar = document.getElementById('status-bar');
    bar.className = 'status-bar ' + status;

    // Button
    const btn = document.getElementById('verify-btn');
    if (status === 'verifying') {
      btn.disabled = true;
      btn.classList.add('verifying');
      btn.textContent = 'Verifying...';
    }
  },
};
