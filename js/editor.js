const EditorManager = {
  editor: null,
  decorationIds: [],

  init(container) {
    this.editor = monaco.editor.create(container, {
      value: '',
      language: 'tricera-c',
      theme: 'tricera-dark',
      fontSize: 14,
      lineNumbers: 'on',
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      glyphMargin: true,
      renderLineHighlight: 'line',
      tabSize: 2,
      wordWrap: 'off',
      fixedOverflowWidgets: true,
    });

    this.editor.addAction({
      id: 'tricera-verify',
      label: 'Verify with TriCera',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => Verifier.verify(),
    });
  },

  getCode() {
    return this.editor ? this.editor.getValue() : '';
  },

  setCode(text) {
    if (this.editor) {
      this.editor.setValue(text);
      this.clearAll();
    }
  },

  setMarkers(diagnostics) {
    if (!this.editor) return;
    const model = this.editor.getModel();
    const lineCount = model.getLineCount();
    const markers = diagnostics
      .filter(d => d.line >= 1 && d.line <= lineCount)
      .map(d => ({
        severity: d.type === 'parse-error'
          ? monaco.MarkerSeverity.Error
          : monaco.MarkerSeverity.Warning,
        message: d.message + (d.property ? ` (${d.property})` : ''),
        startLineNumber: d.line,
        startColumn: d.column || 1,
        endLineNumber: d.line,
        endColumn: model.getLineMaxColumn(d.line),
      }));
    monaco.editor.setModelMarkers(model, 'tricera', markers);
  },

  clearMarkers() {
    if (!this.editor) return;
    monaco.editor.setModelMarkers(this.editor.getModel(), 'tricera', []);
  },

  setDecorations(status, lines) {
    if (!this.editor) return;
    const model = this.editor.getModel();
    const lineCount = model.getLineCount();
    const decorations = [];

    if (status === 'safe') {
      decorations.push({
        range: new monaco.Range(1, 1, lineCount, model.getLineMaxColumn(lineCount)),
        options: { className: 'safe-line-bg', isWholeLine: true },
      });
    } else if (status === 'unsafe') {
      decorations.push({
        range: new monaco.Range(1, 1, lineCount, model.getLineMaxColumn(lineCount)),
        options: { className: 'unsafe-line-bg', isWholeLine: true },
      });
      if (lines && lines.length) {
        for (const line of lines) {
          if (line >= 1 && line <= lineCount) {
            decorations.push({
              range: new monaco.Range(line, 1, line, 1),
              options: {
                glyphMarginClassName: 'unsafe-line-glyph',
                isWholeLine: true,
              },
            });
          }
        }
      }
    }

    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, decorations);
  },

  clearDecorations() {
    if (!this.editor) return;
    this.decorationIds = this.editor.deltaDecorations(this.decorationIds, []);
  },

  clearAll() {
    this.clearMarkers();
    this.clearDecorations();
  },

  layout() {
    if (this.editor) this.editor.layout();
  },
};
