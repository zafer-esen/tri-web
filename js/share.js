// Sharing / permalink functionality
const ShareManager = {
  init() {
    // Nothing to init - called from app.js
  },

  async share() {
    const state = {
      code: EditorManager.getCode(),
      options: OptionsPanel.getState(),
    };

    // Try client-side encoding first (for small programs)
    try {
      const json = JSON.stringify(state);
      const encoded = btoa(unescape(encodeURIComponent(json)));

      // If small enough for URL hash, use that
      if (encoded.length < 4000) {
        const url = window.location.origin + window.location.pathname + '#code=' + encoded;
        await this.copyToClipboard(url);
        this.showToast('Share link copied to clipboard');
        return;
      }
    } catch (e) {
      // Fall through to server-side sharing
    }

    // Server-side sharing for larger programs
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
    // Check hash-based sharing
    const hash = window.location.hash;
    if (hash.startsWith('#code=')) {
      try {
        const encoded = hash.slice(6);
        const json = decodeURIComponent(escape(atob(encoded)));
        const state = JSON.parse(json);
        if (state.code) EditorManager.setCode(state.code);
        if (state.options) OptionsPanel.setState(state.options);
        return true;
      } catch (e) {
        console.error('Failed to restore from hash:', e);
      }
    }

    // Check query-param sharing
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
      // Fallback for non-HTTPS contexts
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
