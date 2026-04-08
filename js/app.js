// Application initialization
(function () {
  // Configure Monaco loader
  require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }
  });

  require(['vs/editor/editor.main'], function () {
    // Register language and theme
    TriceraLanguage.register(monaco);

    // Create editor
    EditorManager.init(document.getElementById('editor-container'));

    // Initialize options panel
    OptionsPanel.init(document.getElementById('options-container'));

    // Initialize output panel
    OutputPanel.init();

    // Initialize examples dropdown
    ExamplesLoader.init(document.getElementById('examples-select'));

    // Verify button
    document.getElementById('verify-btn').addEventListener('click', () => Verifier.verify());

    // Share button
    document.getElementById('share-btn').addEventListener('click', () => ShareManager.share());

    // Options panel toggle
    document.getElementById('toggle-options').addEventListener('click', () => {
      const panel = document.getElementById('options-panel');
      panel.classList.toggle('collapsed');
      setTimeout(() => EditorManager.layout(), 160);
    });

    // Clear verification state on edit
    EditorManager.editor.onDidChangeModelContent(() => {
      EditorManager.clearAll();
      document.getElementById('status-bar').className = 'status-bar';
    });

    // Restore from URL or load default example
    ShareManager.restoreFromURL().then(restored => {
      if (!restored) {
        // Load default code
        EditorManager.setCode(DEFAULT_CODE);
      }
    });

    // Fetch server config (version, limits)
    fetch('api/config').then(r => r.json()).then(config => {
      if (config.version) {
        document.querySelector('.version').textContent = 'v' + config.version;
      }
    }).catch(() => {});
  });

  const DEFAULT_CODE = `// Welcome to TriCera - C Program Verifier
// Press Ctrl+Enter or click "Verify" to check this program.

void main() {
  int x = 0;
  int y = 0;

  while (x < 10) {
    x++;
    y++;
  }

  assert(x == y);    // SAFE: x and y are always equal
  // assert(x == 11); // Try uncommenting this - it will be UNSAFE
}
`;
})();
