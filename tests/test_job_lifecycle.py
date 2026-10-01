"""Exercise both backends with real child processes, without an HTTP server."""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class JobLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='tricera-web-test-')
        self.work = Path(self.tmp.name)
        self.mock = self.work / 'tri'
        self.mock.write_text('''#!%s
import json, os, subprocess, sys, time
if sys.argv[-1] == '--version':
    print('test-version')
    sys.exit(0)
if sys.argv[-1] == '--help':
    print(open(os.path.join(os.path.dirname(__file__), 'help.txt')).read())
    sys.exit(int(os.environ.get('MOCK_HELP_EXIT', '0')))
request = json.loads(open(sys.argv[-1]).read())
mode = request.get('mode', 'safe')
if mode == 'hang':
    child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(60)'])
    with open(request['pids'], 'w') as stream:
        json.dump([os.getpid(), child.pid], stream)
    print('preprocessing started', flush=True)
    time.sleep(60)
elif mode == 'env':
    print(json.dumps({'pp': os.environ.get('TRI_PP_PATH'), 'path': os.environ.get('PATH')}))
elif mode == 'compiler':
    subprocess.run(['cc', '--version'], check=True)
elif mode == 'error':
    print('Other Error: compiler failed')
    sys.exit(1)
elif mode == 'timeout':
    print('TIMEOUT')
    sys.exit(0)
elif mode == 'pp':
    print('int main() {}')
    print('TIMEOUT')  # TriCera's internal -t:0 skips solving after preprocessing.
    sys.exit(0)
print('SAFE')
''' % sys.executable)
        self.mock.chmod(0o755)
        self.help_file = self.work / 'help.txt'
        self.help_file.write_text('-invEncoding[:t] Use an invariant-based heap encoding. t is the encoding type:\n'
                                  '  R, Future-9, RW-fun-tag-opt2\n'
                                  '  Default: something chosen by TriCera.\n-t:time Set timeout\n')
        spec = importlib.util.spec_from_file_location('web_under_test', ROOT / 'serve.py')
        self.web = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.web)
        self.web.TRICERA_PATH = str(self.mock)
        self.web.TIMEOUT_GRACE = 0.1
        self.web.HARD_TIMEOUT = 10
        self.web.LOG_DIR = None
        self.web.TOOL_PATH = None
        self.jobs = []
        self.php = shutil.which('php')
        self.php_options = []
        if self.php:
            shutil.copytree(ROOT / 'php', self.work / 'php', ignore=shutil.ignore_patterns('config.local.php'))
            self.configure_php()
            (self.work / 'php' / 'endpoint.php').write_text('''<?php
$_SERVER['REQUEST_METHOD'] = 'POST';
$_GET = json_decode($argv[2], true);
$source = file_get_contents(__DIR__ . '/' . $argv[1] . '.php');
$source = str_replace("file_get_contents('php://input')", "file_get_contents('php://stdin')", $source);
eval('?>' . $source);
''')

    def configure_php(self, extra=''):
        def quote(value):
            return "'" + str(value).replace('\\', '\\\\').replace("'", "\\'") + "'"
        (self.work / 'php' / 'config.local.php').write_text(
            '<?php\n$TRICERA_PATH = ' + quote(self.mock) + ';\n'
            '$RESULT_DIR = ' + quote(self.work / 'results') + ';\n'
            '$PID_DIR = ' + quote(self.work / 'pids') + ';\n'
            '$LOG_DIR = null; $HARD_TIMEOUT = 10; $TIMEOUT_GRACE = 0.1; $NICE_LEVEL = 0;\n' + extra)

    def tearDown(self):
        for proc in list(self.web.RUNNING_PROCS.values()):
            self.web.kill_process_group(proc)
        for pid_file in (self.work / 'pids').glob('*.pid'):
            try:
                os.killpg(int(pid_file.read_text()), signal.SIGKILL)
            except ProcessLookupError:
                pass
        # Let detached supervisors finish before removing their temporary files.
        time.sleep(0.05)
        self.tmp.cleanup()

    def call(self, backend, endpoint, data=None, query=None, env=None):
        if backend == 'php':
            if not self.php:
                self.skipTest('PHP CLI is required for PHP backend tests')
            result = subprocess.run(
                [self.php] + self.php_options + [str(self.work / 'php' / 'endpoint.php'), endpoint, json.dumps(query or {})],
                input=json.dumps(data or {}), capture_output=True, text=True, timeout=5, env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stderr, '', result.stderr)
            return json.loads(result.stdout)
        handler = self.web.TriceraHandler.__new__(self.web.TriceraHandler)
        handler.read_json = lambda: data
        handler.client_address = ('127.0.0.1', 0)
        handler.path = '/api/' + endpoint + ('?id=' + query['id'] if query else '')
        responses = []
        handler.send_json = lambda value, *args: responses.append(value)
        getattr(handler, 'handle_' + endpoint)()
        return responses[0]

    def start(self, backend, mode='safe', args=None, env=None):
        rid = '%s-%s-%d' % (backend, mode, len(self.jobs))
        self.jobs.append(rid)
        pids = self.work / (rid + '.children')
        response = self.call(backend, 'verify', {
            'requestId': rid,
            'code': json.dumps({'mode': mode, 'pids': str(pids)}),
            'args': args if args is not None else ['-t:1'],
        }, env=env)
        self.assertEqual(response['status'], 'running', response)
        return rid, pids, response

    def result(self, backend, rid):
        return self.call(backend, 'result', query={'id': rid})

    def wait_result(self, backend, rid):
        end = time.monotonic() + 5
        while time.monotonic() < end:
            result = self.result(backend, rid)
            if result['status'] not in ('running', 'not_found'):
                return result
            time.sleep(0.03)
        self.fail('Job never completed: ' + rid)

    def wait_children(self, path):
        end = time.monotonic() + 3
        while time.monotonic() < end:
            if path.exists():
                return json.loads(path.read_text())
            time.sleep(0.02)
        self.fail('Mock did not start')

    def assert_stopped(self, pids):
        for pid in pids:
            stat = Path('/proc') / str(pid) / 'stat'
            if stat.exists():
                self.assertEqual(stat.read_text().split()[2], 'Z', 'Child remains alive: %s' % pid)

    def test_requested_deadline_kills_descendants_and_preserves_output(self):
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                start = time.monotonic()
                rid, path, initial = self.start(backend, 'hang')
                self.assertAlmostEqual(initial['timeoutSeconds'], 1.1)
                children = self.wait_children(path)
                result = self.wait_result(backend, rid)
                self.assertEqual(result['status'], 'TIMEOUT', result)
                self.assertIn('preprocessing started', result['rawOutput'])
                self.assertLess(time.monotonic() - start, 3)
                self.assert_stopped(children)
                self.assertEqual(self.result(backend, rid), result, 'Terminal result must survive repeated polls')

    def test_abort_kills_descendants_and_finishes(self):
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                rid, path, _ = self.start(backend, 'hang', ['-t:9'])
                children = self.wait_children(path)
                self.assertTrue(self.call(backend, 'abort', {'requestId': rid})['aborted'])
                self.assertEqual(self.wait_result(backend, rid)['status'], 'ABORTED')
                self.assert_stopped(children)

    def test_abort_while_python_job_is_starting(self):
        rid = 'starting'
        self.web.PENDING_REQUESTS.add(rid)
        self.assertTrue(self.web.abort_job(rid))
        result = self.web.run_tricera(json.dumps({'mode': 'safe'}), ['-t:1'], rid)
        self.assertEqual(result['status'], 'ABORTED')

    def test_php_abort_without_posix_extension(self):
        self.php_options = ['-d', 'disable_functions=posix_kill']
        rid, path, _ = self.start('php', 'hang', ['-t:9'])
        children = self.wait_children(path)
        self.assertTrue(self.call('php', 'abort', {'requestId': rid})['aborted'])
        self.assertEqual(self.wait_result('php', rid)['status'], 'ABORTED')
        self.assert_stopped(children)

    def test_unexpected_kill_is_an_error_not_user_abort_or_timeout(self):
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                rid, path, _ = self.start(backend, 'hang', ['-t:9'])
                children = self.wait_children(path)
                os.killpg(os.getpgid(children[0]), signal.SIGKILL)
                self.assertEqual(self.wait_result(backend, rid)['status'], 'ERROR')
                self.assert_stopped(children)

    def test_python_completion_is_final_before_logging(self):
        rid = 'completed'
        self.web.PENDING_REQUESTS.add(rid)
        cancellations = []
        with patch.object(self.web, 'run_tricera', return_value={'status': 'SAFE'}), \
             patch.object(self.web, 'log_submission', side_effect=lambda *args: cancellations.append(self.web.abort_job(rid))):
            self.web._run_tricera_background('code', [], rid, 'localhost')
        self.assertEqual(cancellations, [False])
        self.assertNotIn(rid, self.web.ABORT_REQUESTS)

    def test_output_modes_preserve_timeouts_and_errors(self):
        for backend in ('python', 'php'):
            for mode, expected in [('timeout', 'TIMEOUT'), ('error', 'ERROR')]:
                with self.subTest(backend=backend, mode=mode):
                    rid, _, _ = self.start(backend, mode, ['-t:1', '-p'])
                    self.assertEqual(self.wait_result(backend, rid)['status'], expected)

    def test_hard_timeout_overrides_preprocessor_output_mode(self):
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                rid, _, _ = self.start(backend, 'hang', ['-t:1', '-printPP'])
                self.assertEqual(self.wait_result(backend, rid)['status'], 'TIMEOUT')

    def test_successful_preprocessor_output_still_skips_solving(self):
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                rid, _, _ = self.start(backend, 'pp', ['-t:1', '-printPP'])
                self.assertEqual(self.wait_result(backend, rid)['status'], 'INFO')

    def test_preserves_explicit_preprocessor_path_and_repairs_sparse_path(self):
        for backend in ('python', 'php'):
            for pp in (None, '/custom/preprocessor'):
                with self.subTest(backend=backend, pp=pp):
                    env = dict(os.environ, PATH=str(self.work))
                    env.pop('TRICERA_TOOL_PATH', None)
                    if pp is None:
                        env.pop('TRI_PP_PATH', None)
                    else:
                        env['TRI_PP_PATH'] = pp
                    with patch.dict(os.environ, env, clear=True):
                        rid, _, _ = self.start(backend, 'env', ['-t:1', '-cpp'], env)
                        result = self.wait_result(backend, rid)
                    self.assertEqual(result['status'], 'SAFE', result)
                    actual = json.loads(result['rawOutput'].splitlines()[0])
                    self.assertEqual(actual['pp'], pp)
                    self.assertIn('/usr/bin', actual['path'].split(':'))

    def test_php_finds_compiler_outside_open_basedir(self):
        if not self.php:
            self.skipTest('PHP CLI is required for PHP backend tests')
        with tempfile.TemporaryDirectory(prefix='tricera-web-compiler-') as directory:
            compiler = Path(directory) / 'cc'
            compiler.write_text('#!/bin/sh\necho compiler-ran\n')
            compiler.chmod(0o755)
            self.php_options = ['-d', 'open_basedir=' + str(self.work),
                                '-d', 'sys_temp_dir=' + str(self.work)]
            probe = subprocess.run(
                [self.php] + self.php_options + ['-r',
                 'echo json_encode(@is_file($argv[1]) && @is_executable($argv[1]));',
                 str(compiler)], capture_output=True, text=True, check=True)
            self.assertEqual(probe.stdout, 'false')
            env = dict(os.environ, PATH=directory)
            env.pop('TRICERA_TOOL_PATH', None)
            env.pop('TRI_PP_PATH', None)
            for option in ('-cpp', '-cppLight'):
                with self.subTest(option=option):
                    rid, _, _ = self.start('php', 'compiler', ['-t:2', option], env)
                    result = self.wait_result('php', rid)
                    self.assertEqual(result['status'], 'SAFE', result)
                    self.assertIn('compiler-ran', result['rawOutput'])

    def test_argument_validation_includes_invariant_and_clamps_decimals(self):
        encodings = ['R', 'R-opt', 'R-tag', 'R-tag-opt', 'RW', 'RW-fun', 'RW-fun-opt',
                     'RW-fun-tag', 'RW-fun-tag-opt', 'RW-fun-tag-opt-p', 'RW-fun-tag-opt2',
                     'RW-tag', 'RW-tag-opt', 'default']
        flags = ['-invEncoding:' + name for name in encodings]
        args = ['-invEncoding', '-inv', '-heapModel:array', '-t:600.0', '-t:1.5'] + flags
        expected = ['-invEncoding', '-inv', '-heapModel:array', '-t:60', '-t:1.5'] + flags
        args += ['-invEncoding:', '-invEncoding:R;echo', '-invEncoding:R extra', '-invEncoding:R\n']
        self.assertEqual(self.web.validate_args(args), expected)
        if self.php:
            script = "require $argv[1]; require $argv[2]; echo json_encode(validateArgs(json_decode($argv[3], true)));"
            result = subprocess.run([self.php, '-r', script, str(ROOT / 'php/config.php'),
                                     str(ROOT / 'php/functions.php'), json.dumps(args)],
                                    capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout), expected)

    def test_php_expired_job_without_completion_marker_finishes(self):
        if not self.php:
            self.skipTest('PHP CLI required')
        directory = self.work / 'results'
        directory.mkdir()
        (directory / 'expired.meta').write_text(json.dumps({'startTime': time.time() - 20, 'hardTimeout': 1}))
        self.assertEqual(self.result('php', 'expired')['status'], 'TIMEOUT')

    def test_preprocessor_discovery_supports_installations_path_and_sibling_checkouts(self):
        installation = self.work / 'tools' / 'tricera'
        installation.mkdir(parents=True)
        launcher = installation / 'tri'
        shutil.copy2(self.mock, launcher)
        self.mock = launcher
        self.web.TRICERA_PATH = str(launcher)
        self.configure_php()
        path_dir = self.work / 'bin'
        directories = [installation / 'dist', installation, path_dir,
                       installation.parent / 'tri-pp', installation.parent / 'tri-pp' / 'build']
        helpers = []
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)
            helper = directory / 'tri-pp'
            helper.write_text('#!/bin/sh\nexit 0\n')
            helper.chmod(0o755)
            helpers.append(helper)
        env = dict(os.environ, PATH=str(path_dir))
        env.pop('TRI_PP_PATH', None)
        for directory, helper in zip(directories, helpers):
            for backend in ('python', 'php'):
                with self.subTest(backend=backend, directory=directory), patch.dict(os.environ, env, clear=True):
                    rid, _, _ = self.start(backend, 'env', env=env)
                    result = self.wait_result(backend, rid)
                    discovered = json.loads(result['rawOutput'].splitlines()[0])
                    self.assertEqual(discovered['pp'], str(directory.resolve()))
            helper.unlink()

    def test_non_executable_preprocessor_is_not_exported(self):
        helper = self.work / 'tri-pp'
        helper.write_text('not executable')
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                rid, _, _ = self.start(backend, 'env')
                result = self.wait_result(backend, rid)
                discovered = json.loads(result['rawOutput'].splitlines()[0])
                self.assertIsNone(discovered['pp'])

    def config(self, backend):
        if backend == 'python':
            self.web.TRICERA_ENCODINGS = self.web.detect_invariant_encodings()
            return self.call(backend, 'config')
        return self.call(backend, 'config-api')

    def test_config_discovers_installed_encodings_including_new_names(self):
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                result = self.config(backend)
                self.assertEqual(result['invariantEncodings'], ['R', 'Future-9', 'RW-fun-tag-opt2'])

    def test_config_handles_wrapped_lists_and_omits_default_alias(self):
        self.help_file.write_text('-invEncoding[:name] Encoding types:\r\n'
                                  '  New-1, R,\r\n'
                                  '  R, default, New-2\r\n'
                                  '  Default: New-1\r\n-t:time Set timeout\r\n')
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                self.assertEqual(self.config(backend)['invariantEncodings'], ['New-1', 'R', 'New-2'])

    def test_config_discovery_falls_back_on_missing_or_malformed_help(self):
        for help_text in ['', 'old version without invariant support',
                          '-invEncoding[:t] Encoding types:\n  bad;command\n']:
            self.help_file.write_text(help_text)
            for backend in ('python', 'php'):
                with self.subTest(backend=backend, help_text=help_text):
                    self.assertEqual(self.config(backend)['invariantEncodings'], [])

    def test_config_discovery_ignores_output_from_failed_probes(self):
        with patch.dict(os.environ, {'MOCK_HELP_EXIT': '3'}):
            for backend in ('python', 'php'):
                with self.subTest(backend=backend):
                    self.assertEqual(self.config(backend)['invariantEncodings'], [])

    def test_config_discovery_handles_missing_executable(self):
        self.web.TRICERA_PATH = str(self.work / 'missing')
        self.configure_php("$TRICERA_PATH = '/nonexistent/tricera-web-test';")
        for backend in ('python', 'php'):
            with self.subTest(backend=backend):
                self.assertEqual(self.config(backend)['invariantEncodings'], [])


if __name__ == '__main__':
    unittest.main()
