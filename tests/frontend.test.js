const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const flush = () => new Promise(resolve => setImmediate(resolve));

function optionsPanel(encodings = ['R', 'RW-fun-tag-opt2', 'Future-9']) {
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/options.js'), 'utf8') + '\nthis.panel = OptionsPanel;', context);
  const panel = context.panel;
  panel._fullRerender = () => {};
  panel._rerenderGroup = () => {};
  panel.resetState();
  if (encodings !== null) panel.setInvariantEncodings(encodings);
  return panel;
}

function examplesLoader(panel = optionsPanel([])) {
  class Element {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.listeners = {};
    }
    set innerHTML(value) { this.children = []; }
    appendChild(child) { this.children.push(child); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
  }
  const statusBar = {};
  const editor = { setCode(code) { this.code = code; } };
  const context = vm.createContext({
    console,
    OptionsPanel: panel,
    EditorManager: editor,
    OutputPanel: { clear() {}, setStatus() {} },
    document: { getElementById: () => statusBar, createElement: tag => new Element(tag) },
    fetch: async file => ({
      ok: true,
      text: async () => fs.readFileSync(path.join(root, file), 'utf8'),
      json: async () => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')),
    }),
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/examples.js'), 'utf8') + '\nthis.loader = ExamplesLoader;', context);
  const loader = context.loader;
  loader.panel = new Element('div');
  return { loader, panel, editor, statusBar };
}

function harness(fetcher) {
  const timers = new Map();
  let nextId = 0;
  const states = [], results = [], errors = [], calls = [];
  const context = vm.createContext({
    console, AbortController, DOMException,
    crypto: { randomUUID: () => 'test-job' },
    setTimeout: (fn, delay) => { timers.set(++nextId, { fn, delay }); return nextId; },
    clearTimeout: id => timers.delete(id),
    EditorManager: { getCode: () => 'int main() {}', clearAll() {} },
    OutputPanel: { clear() {} },
    OptionsPanel: { getCliArgs: () => ['-t:1'], getValidationError: () => null },
    fetch: async (url, options) => {
      calls.push(url);
      const value = await fetcher(url, options);
      return { ok: true, status: 200, json: async () => value };
    },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'js/verify.js'), 'utf8') + '\nthis.verifier = Verifier;', context);
  const verifier = context.verifier;
  verifier.setUIState = state => states.push(state);
  verifier.handleResult = result => { results.push(result); states.push(result.status.toLowerCase()); };
  verifier.handleError = error => { errors.push(error); states.push('error'); };
  return {
    verifier, context, states, results, errors, calls, timers,
    async fire(delay) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `Missing timer with delay ${delay}`);
      timers.delete(entry[0]);
      entry[1].fn();
      await flush();
    },
  };
}

test('invariant uses only the default flag and preserves incompatible properties', () => {
  const panel = optionsPanel();
  panel.state.heapModel = 'invariant';
  assert.match(panel.getValidationError(), /Deselect the memory-safety properties/);
  assert.ok(panel.state.properties.includes('valid-deref'));
  panel.state.properties = ['reachsafety'];
  panel.state.programArrays = 'math';
  assert.equal(panel.getValidationError(), null);
  const args = [...panel.getCliArgs()];
  assert.ok(args.includes('-invEncoding'));
  assert.ok(!args.some(arg => arg.startsWith('-heapModel:')));
  assert.ok(!args.includes('-mathArrays'));
});

test('invariant imports win regardless of flag order without introducing memory checks', () => {
  const panel = optionsPanel();
  for (const args of [['-invEncoding', '-heapModel:array'], ['-heapModel:native', '-invEncoding']]) {
    const state = panel.cliArgsToState(args);
    assert.equal(state.heapModel, 'invariant');
    assert.deepEqual([...state.properties], ['reachsafety']);
  }
  panel.setState(panel.cliArgsToState(['-invEncoding', '-valid-free']));
  assert.match(panel.getValidationError(), /reachability only/);
});

test('each named invariant encoding emits one flag and only applies in invariant mode', () => {
  const panel = optionsPanel();
  panel.state.heapModel = 'invariant';
  panel.state.properties = ['reachsafety'];
  const options = panel._findGroup('invariantEncoding').options;
  assert.equal(options[0].value, 'default');
  assert.deepEqual([...options.map(option => option.value)], ['default', 'R', 'RW-fun-tag-opt2', 'Future-9']);
  for (const option of options) {
    panel.state.invariantEncoding = option.value;
    assert.equal(panel.getValidationError(), null);
    const args = [...panel.getCliArgs()];
    assert.deepEqual(args.filter(arg => arg.startsWith('-invEncoding')), [option.cliArg]);
    assert.ok(!args.some(arg => arg.startsWith('-heapModel:')));
    assert.ok(!args.includes('-mathArrays'));
  }
  for (const heap of ['native', 'array']) {
    panel.state.heapModel = heap;
    assert.ok(!panel.getCliArgs().some(arg => arg.startsWith('-invEncoding')));
  }
});

test('named imports follow TriCera precedence and preserve an explicit return to default', () => {
  const panel = optionsPanel();
  for (const args of [
    ['-invEncoding:R', '-heapModel:array'],
    ['-heapModel:native', '-invEncoding:R'],
    ['-invEncoding:RW-fun-tag-opt2', '-invEncoding:R'],
  ]) {
    const state = panel.cliArgsToState(args);
    assert.equal(state.heapModel, 'invariant');
    assert.equal(state.invariantEncoding, 'R');
    assert.deepEqual([...state.properties], ['reachsafety']);
  }
  for (const flag of ['-invEncoding', '-invEncoding:default']) {
    panel.setState(panel.cliArgsToState(['-invEncoding:R', flag]));
    assert.equal(panel.state.invariantEncoding, 'default');
    assert.ok(panel.getCliArgs().includes('-invEncoding'));
  }
});

test('named encodings survive sharing and older shares restore the TriCera default', () => {
  const panel = optionsPanel();
  panel.setState({ heapModel: 'invariant', invariantEncoding: 'RW-fun-tag-opt2', properties: ['reachsafety'] });
  const saved = panel.getState();
  panel.resetState();
  panel.setState(saved);
  assert.ok(panel.getCliArgs().includes('-invEncoding:RW-fun-tag-opt2'));
  panel.setState({ heapModel: 'invariant', properties: ['reachsafety'] });
  assert.ok(panel.getCliArgs().includes('-invEncoding'));
  panel.setState({ heapModel: 'invariant', invariantEncoding: 'unsupported' });
  assert.match(panel.getValidationError(), /unavailable/);
});

test('unavailable discovery leaves only the TriCera default with no fixed fallback list', () => {
  const panel = optionsPanel([]);
  panel.setState({ heapModel: 'invariant', properties: ['reachsafety'] });
  assert.deepEqual([...panel._findGroup('invariantEncoding').options.map(option => option.value)], ['default']);
  assert.equal(panel.getValidationError(), null);
  assert.ok(panel.getCliArgs().includes('-invEncoding'));
  panel.setInvariantEncodings(undefined);
  assert.equal(panel._findGroup('invariantEncoding').options.length, 1);
});

test('saved named choices survive either config/share load order', () => {
  for (const configFirst of [true, false]) {
    const panel = optionsPanel(null);
    if (configFirst) panel.setInvariantEncodings(['Future-9']);
    panel.setState({ heapModel: 'invariant', invariantEncoding: 'Future-9', properties: ['reachsafety'] });
    if (!configFirst) {
      assert.match(panel.getValidationError(), /still loading/);
      panel.setInvariantEncodings(['Future-9']);
    }
    assert.equal(panel.state.invariantEncoding, 'Future-9');
    assert.equal(panel.getValidationError(), null);
    assert.ok(panel.getCliArgs().includes('-invEncoding:Future-9'));
  }
});

test('an unavailable saved encoding is reported without silently selecting the default', () => {
  const panel = optionsPanel(null);
  panel.setState({ heapModel: 'invariant', invariantEncoding: 'Removed', properties: ['reachsafety'] });
  panel.setInvariantEncodings([]);
  assert.equal(panel.state.invariantEncoding, 'Removed');
  assert.match(panel.getValidationError(), /unavailable/);
  assert.match(panel._renderSelect(panel._findGroup('invariantEncoding')), /disabled selected>Saved encoding unavailable/);
  assert.ok(!panel.getCliArgs().includes('-invEncoding'));
});

test('discovered options are deduplicated and restricted to safe encoding names', () => {
  const panel = optionsPanel(['default', 'Future-9', 'Future-9', '<script>', 'bad:name', null, 5]);
  assert.deepEqual([...panel._findGroup('invariantEncoding').options.map(option => option.value)], ['default', 'Future-9']);
});

test('shares preserve invariant or existing array selection', () => {
  const panel = optionsPanel();
  panel.setState({ heapModel: 'invariant', properties: ['reachsafety'] });
  const saved = panel.getState();
  panel.resetState();
  panel.setState(saved);
  assert.ok(panel.getCliArgs().includes('-invEncoding'));
  panel.setState({ heapModel: 'array' });
  assert.ok(panel.getCliArgs().includes('-heapModel:array'));
  assert.ok(!panel.getCliArgs().includes('-invEncoding'));
});

test('configured timeout bound survives reset, import, and either share/config order', () => {
  for (const configFirst of [true, false]) {
    const panel = optionsPanel();
    if (configFirst) panel.setMaxTimeout(10);
    panel.setState({ timeout: 60 });
    if (!configFirst) panel.setMaxTimeout(10);
    assert.equal(panel.state.timeout, 10);
    panel.resetState();
    assert.equal(panel.state.timeout, 10);
    assert.equal(panel.cliArgsToState(['-t:60']).timeout, 10);
  }
});

test('artifact examples load code and default invariant settings after incompatible selections', async () => {
  const { loader, panel, editor, statusBar } = examplesLoader();
  await loader._loadArtifactExamples();
  const category = loader.categories.find(category => category.id === 'invariant-heap');
  const flatten = cat => [...(cat.examples || []), ...(cat.categories || []).flatMap(flatten)];
  const examples = flatten(category);
  assert.ok(examples.length > 4);
  assert.equal(new Set(examples.map(example => example.id)).size, examples.length);
  for (const example of examples) {
    panel.setState({ heapModel: 'array', invariantEncoding: 'Removed', properties: ['memsafety', 'valid-deref'] });
    editor.code = undefined;
    await loader.loadExample(example.id);
    assert.equal(editor.code, fs.readFileSync(path.join(root, 'examples', example.file), 'utf8'));
    assert.equal(panel.state.heapModel, 'invariant');
    assert.equal(panel.state.invariantEncoding, 'default');
    assert.deepEqual([...panel.state.properties], ['reachsafety']);
    assert.equal(panel.getValidationError(), null);
    assert.ok(panel.getCliArgs().includes('-invEncoding'));
    assert.ok(example.args.filter(arg => arg.startsWith('-cpp')).every(arg => panel.getCliArgs().includes(arg)));
    assert.equal(statusBar.className, 'status-bar');
  }
});

test('curated, artifact, and regression groups collapse independently and retain their state', async () => {
  const { loader } = examplesLoader();
  await loader._loadArtifactExamples();
  loader.regressionCategories = [{ name: 'Basic Verification', examples: [{ id: 'regression-test', name: 'Regression', file: 'basic-assert.c' }] }];
  loader.render();
  const basic = loader.panel.children[0];
  const regression = loader.panel.children.at(-1);
  const artifact = loader.panel.children[2];
  for (const group of [basic, regression, artifact]) {
    assert.equal(group.tagName, 'details');
    assert.equal(group.open, false);
    assert.equal(group.children[0].tagName, 'summary');
  }
  basic.open = true;
  basic.listeners.toggle();
  artifact.open = true;
  artifact.listeners.toggle();
  loader.render();
  assert.equal(loader.panel.children[0].open, true);
  assert.equal(loader.panel.children.at(-1).open, false);
  assert.equal(loader.panel.children[2].open, true);
});

test('immediate API errors are displayed without polling', async () => {
  const h = harness(() => ({ status: 'ERROR', message: 'Code too large' }));
  await h.verifier.verify();
  assert.equal(h.results[0].message, 'Code too large');
  assert.deepEqual(h.calls, ['api/verify']);
  assert.equal(h.verifier.running, false);
  assert.equal(h.timers.size, 0);
});

test('incompatible invariant properties fail before submission', async () => {
  const h = harness(() => assert.fail('should not submit'));
  h.context.OptionsPanel.getValidationError = () => 'Unsupported memory checks';
  await h.verifier.verify();
  assert.equal(h.results[0].status, 'ERROR');
  assert.equal(h.verifier.running, false);
  assert.equal(h.calls.length, 0);
});

test('abort between polls reaches a terminal result and permits another verification', async () => {
  let aborted = false;
  const h = harness(url => {
    if (url === 'api/verify') { aborted = false; return { status: 'running' }; }
    if (url === 'api/abort') { aborted = true; return { aborted: true }; }
    return { status: aborted ? 'ABORTED' : 'SAFE' };
  });
  const first = h.verifier.verify();
  await flush();
  await h.verifier.abort();
  await h.fire(1000);
  await first;
  assert.equal(h.results[0].status, 'ABORTED');
  assert.equal(h.verifier.running, false);
  assert.equal(h.timers.size, 0);
  const second = h.verifier.verify();
  await flush();
  await h.fire(1000);
  await second;
  assert.equal(h.results[1].status, 'SAFE');
});

test('abort during submission waits for acknowledgement before requesting cancellation', async () => {
  let acknowledge;
  const h = harness(url => {
    if (url === 'api/verify') return new Promise(resolve => { acknowledge = resolve; });
    if (url === 'api/abort') return { aborted: true };
    return { status: 'ABORTED' };
  });
  const verification = h.verifier.verify();
  await flush();
  const cancellation = h.verifier.abort();
  assert.deepEqual(h.calls, ['api/verify']);
  acknowledge({ status: 'running' });
  await cancellation;
  assert.deepEqual(h.calls, ['api/verify', 'api/abort']);
  await h.fire(1000);
  await verification;
  assert.equal(h.verifier.running, false);
});

test('a stalled poll fetch is bounded and releases the UI', async () => {
  const h = harness((url, options) => {
    if (url === 'api/verify') return { status: 'running' };
    return new Promise((resolve, reject) => options.signal.addEventListener('abort',
      () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
  });
  const pending = h.verifier.verify();
  await flush();
  await h.fire(1000);
  await h.fire(10000);
  await pending;
  assert.match(h.errors[0].message, /request timed out/);
  assert.equal(h.verifier.running, false);
  assert.equal(h.timers.size, 0);
});

test('late cancellation acknowledgement cannot change a completed result', async () => {
  let acknowledgeAbort;
  const h = harness(url => {
    if (url === 'api/verify') return { status: 'running' };
    if (url === 'api/abort') return new Promise(resolve => { acknowledgeAbort = resolve; });
    return { status: 'SAFE' };
  });
  const pending = h.verifier.verify();
  await flush();
  const cancellation = h.verifier.abort();
  await flush();
  await h.fire(1000);
  await pending;
  acknowledgeAbort({ aborted: true });
  await cancellation;
  assert.equal(h.results.length, 1);
  assert.equal(h.results[0].status, 'SAFE');
});
