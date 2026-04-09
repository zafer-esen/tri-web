const ShareManager = {
  async share() {
    const state = {
      code: EditorManager.getCode(),
      options: OptionsPanel.getState(),
    };

    try {
      const resp = await fetch('api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
      if (!resp.ok) throw new Error('Server error');
      const result = await resp.json();
      const url = window.location.origin + window.location.pathname + '?share=' + result.id;
      await this.copyToClipboard(url);
      this.showToast('Share link copied to clipboard');
    } catch (err) {
      this.showToast('Failed to generate share link');
      console.error('Share error:', err);
    }
  },

  async restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (shareId) {
      try {
        const resp = await fetch('api/load?id=' + encodeURIComponent(shareId));
        if (!resp.ok) throw new Error('Not found');
        const state = await resp.json();
        if (state.code) EditorManager.setCode(state.code);
        if (state.options) OptionsPanel.setState(state.options);
        return true;
      } catch (e) {
        console.error('Failed to load shared program:', e);
      }
    }
    return false;
  },

  async copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  },

  showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  },
};
