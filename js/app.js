(function () {
  require.config({
    paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' }
  });

  require(['vs/editor/editor.main'], function () {
    TriceraLanguage.register(monaco);
    EditorManager.init(document.getElementById('editor-container'));
    OptionsPanel.init(document.getElementById('options-container'));
    OutputPanel.init();
    ExamplesLoader.init(
      document.getElementById('examples-button'),
      document.getElementById('examples-panel')
    );

    document.getElementById('verify-btn').addEventListener('click', () => Verifier.verify());
    document.getElementById('abort-btn').addEventListener('click', () => Verifier.abort());
    document.getElementById('share-btn').addEventListener('click', () => ShareManager.share());
    document.getElementById('help-btn').addEventListener('click', () => {
      const panel = document.getElementById('help-panel');
      panel.style.display = panel.style.display === 'none' ? '' : 'none';
    });
    document.getElementById('toggle-options').addEventListener('click', () => {
      document.getElementById('options-panel').classList.toggle('collapsed');
      setTimeout(() => EditorManager.layout(), 160);
    });

    EditorManager.editor.onDidChangeModelContent(() => {
      EditorManager.clearAll();
      document.getElementById('status-bar').className = 'status-bar';
    });

    ShareManager.restoreFromURL().then(restored => {
      if (!restored) EditorManager.setCode(DEFAULT_CODE);
    });

    fetch('api/config').then(r => r.json()).then(config => {
      if (config.version)
        document.querySelector('.version').textContent = 'v' + config.version;
    }).catch(() => {});
  });

  const DEFAULT_CODE = `// Press Ctrl+Enter or click "Verify" to check this program.

void main() {
  int x = 0;
  int y = 0;

  while (x < 10) {
    x++;
    y++;
  }

  assert(x == y);    // SAFE: x and y are always equal
  // assert(x == 11); // Try uncommenting: UNSAFE
}
`;
})();
