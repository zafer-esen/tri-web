#!/usr/bin/env python3
"""TriCera web interface server. Uses only the Python standard library."""

import argparse
import base64
import glob as globmod
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

TRICERA_PATH = None
SHARE_DIR = None
LOG_DIR = None
MAX_CODE_SIZE = 50000
MAX_TIMEOUT = 60
HARD_TIMEOUT = 65
TIMEOUT_GRACE = 1
TOOL_PATH = os.environ.get('TRICERA_TOOL_PATH')
SERVER_MODE = False
MAX_LOG_SIZE_MB = 50

RUNNING_PROCS = {}
RUNNING_PROCS_LOCK = threading.Lock()
ABORT_REQUESTS = set()  # guarded by RUNNING_PROCS_LOCK, including jobs still starting

COMPLETED_RESULTS = {}
COMPLETED_RESULTS_LOCK = threading.Lock()
PENDING_REQUESTS = set()
PENDING_REQUESTS_LOCK = threading.Lock()
RESULT_TTL = 300

ALLOWED_ARG_PATTERN = re.compile(
    r'^-(?:arithMode:[a-z0-9]+|t:\d+(\.\d+)?|m:\w+|heapModel:[a-z]+|log:\d+'
    r'|cex|acsl|f|printPP|p|pDot|dotCEX|pngNo|sp'
    r'|reachsafety|memsafety|valid-deref|valid-free'
    r'|valid-memtrack|valid-memcleanup|splitProperties'
    r'|cpp|cppLight|noPP'
    r'|inv|invEncoding(?::[A-Za-z0-9-]+)?|sol|ssol|statistics'
    r'|sym|sym:bfs|sym:dfs|symDepth:\d+'
    r'|abstract:\w+|abstractTO:\d+(\.\d+)?|abstractPO'
    r'|disj|noSlicing|solutionReconstruction:\w+'
    r'|splitClauses:\d+'
    r'|forceNondetInit|mathArrays)$'
)


def log_submission(remote_addr, code, args, result_status, elapsed_ms):
    """Append a verification submission to the log, rotating at MAX_LOG_SIZE_MB."""
    if not LOG_DIR:
        return
    try:
        log_path = os.path.join(LOG_DIR, 'submissions.log')
        if os.path.isfile(log_path) and os.path.getsize(log_path) > MAX_LOG_SIZE_MB * 1024 * 1024:
            rotated = log_path + '.1'
            if os.path.isfile(rotated):
                os.unlink(rotated)
            os.rename(log_path, rotated)
        with open(log_path, 'a') as f:
            ts = time.strftime('%Y-%m-%d %H:%M:%S')
            code_preview = code[:500].replace('\n', '\\n')
            if len(code) > 500:
                code_preview += f'... ({len(code)} chars total)'
            f.write(f'{ts} | {remote_addr} | {result_status} | {elapsed_ms}ms | args: {args}\n')
            f.write(f'  code: {code_preview}\n')
    except Exception:
        pass


TRICERA_VERSION = None
TRICERA_ENCODINGS = []


def tricera_environment():
    """Find installed tools, including tri-pp for older TriCera launchers."""
    env = os.environ.copy()
    paths = (TOOL_PATH if TOOL_PATH is not None else env.get('PATH', '')).split(os.pathsep)
    env['PATH'] = os.pathsep.join(dict.fromkeys(
        p for p in paths + ['/usr/local/bin', '/usr/bin', '/bin'] if p))
    env['DISPLAY'] = ''
    if not env.get('TRI_PP_PATH') and TRICERA_PATH:
        tri_dir = os.path.dirname(os.path.realpath(TRICERA_PATH))
        on_path = shutil.which('tri-pp', path=env['PATH'])
        candidates = [os.path.join(tri_dir, 'dist'), tri_dir]
        if on_path:
            candidates.append(os.path.dirname(os.path.abspath(on_path)))
        # A common development layout has sibling tricera/ and tri-pp/ checkouts.
        pp_checkout = os.path.join(os.path.dirname(tri_dir), 'tri-pp')
        candidates.extend([pp_checkout, os.path.join(pp_checkout, 'build')])
        for directory in candidates:
            executable = os.path.join(directory, 'tri-pp')
            if os.path.isfile(executable) and os.access(executable, os.X_OK):
                env['TRI_PP_PATH'] = os.path.realpath(directory)
                break
    return env


def detect_tricera_version():
    """Get TriCera version by running tri --version."""
    global TRICERA_VERSION
    if not TRICERA_PATH:
        return None
    try:
        proc = subprocess.run(
            [TRICERA_PATH, '--version'],
            capture_output=True, text=True, timeout=10,
            cwd=os.path.dirname(TRICERA_PATH),
            env=tricera_environment(),
        )
        TRICERA_VERSION = proc.stdout.strip()
        return TRICERA_VERSION
    except Exception:
        return None


def parse_invariant_encodings(help_output):
    """Read the comma-separated list immediately after the invariant help entry."""
    lines = help_output.splitlines()
    for index, line in enumerate(lines):
        if not re.match(r'^\s*-invEncoding\[:\w+\]\s', line):
            continue
        names = []
        for line in lines[index + 1:]:
            line = line.strip().rstrip(',')
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]*(?:\s*,\s*[A-Za-z0-9][A-Za-z0-9-]*)*', line):
                break
            names.extend(name.strip() for name in line.split(',') if name.strip() != 'default')
        return list(dict.fromkeys(names))
    return []


def detect_invariant_encodings():
    if not TRICERA_PATH:
        return []
    try:
        with subprocess.Popen(
            [TRICERA_PATH, '--help'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, errors='replace', start_new_session=True,
            cwd=os.path.dirname(TRICERA_PATH), env=tricera_environment(),
        ) as proc:
            try:
                output, _ = proc.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                kill_process_group(proc)
                proc.communicate()
                return []
            return parse_invariant_encodings(output) if proc.returncode == 0 else []
    except OSError:
        return []


def find_tricera():
    """Locate the tri executable via TRICERA_PATH, sibling dirs, or PATH."""
    candidates = [
        os.environ.get('TRICERA_PATH', ''),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tricera', 'tri'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tri'),
    ]
    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return os.path.abspath(path)
    return shutil.which('tri')


def parse_tricera_output(output, args=None):
    """Parse TriCera stdout/stderr into structured result."""
    args = args or []
    result = {
        'status': 'UNKNOWN',
        'message': '',
        'diagnostics': [],
        'counterexample': None,
        'acsl': None,
        'chcs': None,
        'preprocessorOutput': None,
    }

    failed = bool(re.search(r'^(?:.*Error:|Out of Memory|Stack Overflow)', output, re.MULTILINE))
    timed_out = bool(re.search(r'^TIMEOUT\s*$', output, re.MULTILINE))
    if not failed and not timed_out and ('-p' in args or '-pDot' in args or '-sp' in args):
        result['status'] = 'INFO'
        result['message'] = 'Horn clauses generated (no verification).'
        parts = re.split(r'^(System predicates:)', output, maxsplit=1, flags=re.MULTILINE)
        if len(parts) >= 3:
            pp_text = parts[0].strip()
            if pp_text:
                result['preprocessorOutput'] = pp_text
            result['chcs'] = (parts[1] + parts[2]).strip()
        else:
            result['chcs'] = output.strip()
        return result

    if '-printPP' in args:
        parts = re.split(r'^(?:timeout\n)?(SAFE|UNSAFE|TIMEOUT|UNKNOWN)', output, maxsplit=1, flags=re.MULTILINE)
        if len(parts) >= 2:
            result['preprocessorOutput'] = parts[0].strip()
        else:
            result['preprocessorOutput'] = output.strip()
        if '-t:0' in args and not failed:
            result['status'] = 'INFO'
            result['message'] = 'Preprocessor output generated (verification skipped).'
            return result

    if re.search(r'^SAFE\s*$', output, re.MULTILINE) and not re.search(r'UNSAFE', output):
        result['status'] = 'SAFE'
        result['message'] = 'Program verified successfully.'
    elif re.search(r'^UNSAFE\s*$', output, re.MULTILINE):
        result['status'] = 'UNSAFE'
        result['message'] = 'Verification failed.'
    elif re.search(r'^TIMEOUT\s*$', output, re.MULTILINE):
        result['status'] = 'TIMEOUT'
        result['message'] = 'Verification timed out.'

    # Unknown with reason
    m = re.search(r'^UNKNOWN(?:\s*\((.+?)\))?\s*$', output, re.MULTILINE)
    if m and result['status'] not in ('SAFE', 'UNSAFE', 'TIMEOUT'):
        result['status'] = 'UNKNOWN'
        reason = m.group(1) or ''
        result['message'] = f'Result unknown: {reason}' if reason else 'Result unknown.'

    for m in re.finditer(r'Parse Error: At line (\d+)', output):
        result['status'] = 'ERROR'
        line = int(m.group(1))
        result['message'] = f'Parse error at line {line}'
        result['diagnostics'].append({
            'type': 'parse-error',
            'line': line,
            'column': 1,
            'message': 'Parse error',
            'property': None,
        })

    m = re.search(r'Horn Translation Error:\s*(.+)', output)
    if m:
        result['status'] = 'ERROR'
        result['message'] = f'Translation error: {m.group(1)}'

    m = re.search(r'Other Error:\s*(.+)', output)
    if m:
        result['status'] = 'ERROR'
        result['message'] = f'Error: {m.group(1)}'

    if 'Out of Memory' in output:
        result['status'] = 'ERROR'
        result['message'] = 'Out of memory.'
    if 'Stack Overflow' in output:
        result['status'] = 'ERROR'
        result['message'] = 'Stack overflow.'

    for m in re.finditer(
        r'Failed assertion:\s*\n(.+?)\(line:(\d+)\s+col:(\d+)\)\s*(?:\(property:\s*(.+?)\))?',
        output, re.DOTALL
    ):
        result['diagnostics'].append({
            'type': 'failed-assertion',
            'line': int(m.group(2)),
            'column': int(m.group(3)),
            'message': 'Failed assertion',
            'property': (m.group(4) or 'user-assertion').strip(),
        })

    cex_match = re.search(r'(-{3,}\nInit:.*?)(?=Failed assertion:|UNSAFE)', output, re.DOTALL)
    if cex_match:
        result['counterexample'] = cex_match.group(1).strip()

    acsl_match = re.search(
        r'Inferred ACSL annotations\n={10,}\n(.*?)={10,}',
        output, re.DOTALL
    )
    if acsl_match:
        result['acsl'] = acsl_match.group(1).strip()

    return result


def collect_graph_images(workdir):
    """Collect -pDot PNGs and -dotCEX dot files, returning base64-encoded PNGs."""
    images = []
    env = tricera_environment()
    dot_bin = shutil.which('dot', path=env['PATH'])

    pngs = sorted(globmod.glob(os.path.join(workdir, 'graph*.png')))
    labels = ['Horn Clauses (before simplification)', 'Horn Clauses (after simplification)']
    for i, pngf in enumerate(pngs):
        try:
            with open(pngf, 'rb') as f:
                data = f.read()
            label = labels[i] if i < len(labels) else f'Horn Clauses (graph{i})'
            images.append({
                'label': label,
                'data': base64.b64encode(data).decode('ascii'),
            })
        except Exception:
            continue

    if dot_bin:
        cex_dot = os.path.join(workdir, 'dag-graph-cex.dot')
        if os.path.isfile(cex_dot):
            try:
                proc = subprocess.run(
                    [dot_bin, '-Tpng', cex_dot],
                    capture_output=True, timeout=10, env=env,
                )
                if proc.returncode == 0 and proc.stdout:
                    images.append({
                        'label': 'Counterexample',
                        'data': base64.b64encode(proc.stdout).decode('ascii'),
                    })
            except Exception:
                pass

    return images


def validate_args(args):
    """Validate and filter CLI arguments against the whitelist, clamping -t:N."""
    safe_args = []
    for arg in args:
        if isinstance(arg, str) and ALLOWED_ARG_PATTERN.fullmatch(arg):
            m = re.fullmatch(r'-t:(\d+(?:\.\d+)?)', arg)
            if m:
                t = min(float(m.group(1)), MAX_TIMEOUT)
                safe_args.append(f'-t:{t:g}')
            else:
                safe_args.append(arg)
    return safe_args


def job_timeout(args):
    # Compute before adding the internal -t:0 used for preprocessor output.
    requested = next((float(a[3:]) for a in reversed(args) if a.startswith('-t:')), MAX_TIMEOUT)
    return min(HARD_TIMEOUT, max(1, requested) + TIMEOUT_GRACE)


def terminal_result(status, message, output='', elapsed=0):
    return {'status': status, 'message': message, 'diagnostics': [],
            'rawOutput': output, 'elapsedMs': elapsed}


def kill_process_group(proc):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


def abort_job(request_id):
    # The startup thread checks the same lock before publishing its process.
    with RUNNING_PROCS_LOCK:
        proc = RUNNING_PROCS.get(request_id)
        with PENDING_REQUESTS_LOCK:
            pending = request_id in PENDING_REQUESTS
        if not proc and not pending:
            return False
        ABORT_REQUESTS.add(request_id)
        if proc:
            kill_process_group(proc)
        return True


def run_tricera(code, args, request_id=None):
    """Run TriCera on the given code and return structured result."""
    if not TRICERA_PATH:
        return {
            'status': 'ERROR',
            'message': 'TriCera executable not found. Set TRICERA_PATH or use --tricera flag.',
            'diagnostics': [],
            'rawOutput': '',
            'elapsedMs': 0,
        }

    if len(code) > MAX_CODE_SIZE:
        return {
            'status': 'ERROR',
            'message': f'Code too large (max {MAX_CODE_SIZE // 1000}KB).',
            'diagnostics': [],
            'rawOutput': '',
            'elapsedMs': 0,
        }

    safe_args = validate_args(args)
    hard_timeout = job_timeout(safe_args)
    env = tricera_environment()
    if any(a in safe_args for a in ('-cpp', '-cppLight')) and not shutil.which('cc', path=env['PATH']):
        return terminal_result('ERROR', "C preprocessing cannot find an executable 'cc' in the web server's PATH. Check the compiler installation and TRICERA_TOOL_PATH.")

    ext = '.hcc' if any(kw in code for kw in ['thread ', 'thread[', 'atomic ', 'atomic{', 'chan ']) else '.c'

    workdir = tempfile.mkdtemp(prefix='tri_work_')
    tmppath = os.path.join(workdir, 'input' + ext)
    try:
        with open(tmppath, 'w') as f:
            f.write(code)

        wants_graphs = any(a in safe_args for a in ['-pDot', '-dotCEX'])
        # -pDot alone: suppress the image viewer with -pngNo.
        # Don't add -pngNo when -dotCEX is requested: Main.scala gates the CEX
        # dot file generation on !pngNo, so -pngNo would lose the CEX graph.
        if '-pDot' in safe_args and '-dotCEX' not in safe_args \
           and '-pngNo' not in safe_args:
            safe_args.append('-pngNo')

        # -printPP alone: skip verification via -t:0
        if '-printPP' in safe_args and not any(f in safe_args for f in ('-p', '-pDot', '-sp')):
            safe_args.append('-t:0')

        if SERVER_MODE:
            cmd = [
                'nice', '-n', '19',
                'prlimit', f'--data={2048 * 1024 * 1024}',
                TRICERA_PATH,
            ] + safe_args + [tmppath]
        else:
            cmd = [TRICERA_PATH] + safe_args + [tmppath]

        start = time.monotonic()
        aborted = False
        timed_out = False

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                cwd=workdir,
                env=env,
                start_new_session=True,
            )
            if request_id:
                with RUNNING_PROCS_LOCK:
                    RUNNING_PROCS[request_id] = proc
                    if request_id in ABORT_REQUESTS:
                        kill_process_group(proc)
            try:
                stdout, stderr = proc.communicate(timeout=hard_timeout)
                output = stdout + stderr
            except subprocess.TimeoutExpired:
                timed_out = True
                kill_process_group(proc)
                stdout, stderr = proc.communicate()
                output = stdout + stderr
            finally:
                if request_id:
                    with RUNNING_PROCS_LOCK:
                        aborted = request_id in ABORT_REQUESTS
                        RUNNING_PROCS.pop(request_id, None)
                        ABORT_REQUESTS.discard(request_id)
        except Exception as e:
            output = f'Other Error: {e}'

        elapsed = int((time.monotonic() - start) * 1000)

        if aborted:
            return terminal_result('ABORTED', 'Verification aborted by user.', output, elapsed)
        if timed_out:
            return terminal_result('TIMEOUT', 'Verification timed out.', output, elapsed)

        result = parse_tricera_output(output, safe_args)
        result['rawOutput'] = output
        result['elapsedMs'] = elapsed
        if 'proc' in locals() and proc.returncode and result['status'] in ('UNKNOWN', 'INFO'):
            result.update(status='ERROR', message=f'TriCera exited with status {proc.returncode}.')

        if wants_graphs:
            result['graphImages'] = collect_graph_images(workdir)

        return result
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def _run_tricera_background(code, args, request_id, remote_addr):
    try:
        result = run_tricera(code, args, request_id=request_id)
    except Exception as e:
        result = terminal_result('ERROR', f'Could not run TriCera: {e}')
    with RUNNING_PROCS_LOCK:
        if request_id in ABORT_REQUESTS:
            result = terminal_result('ABORTED', 'Verification aborted by user.')
        ABORT_REQUESTS.discard(request_id)
        with COMPLETED_RESULTS_LOCK:
            COMPLETED_RESULTS[request_id] = {
                'result': result,
                'completed_at': time.time(),
            }
        with PENDING_REQUESTS_LOCK:
            PENDING_REQUESTS.discard(request_id)
    log_submission(remote_addr, code, args,
                   result.get('status', '?'), result.get('elapsedMs', 0))
    _cleanup_old_results()


def _cleanup_old_results():
    now = time.time()
    with COMPLETED_RESULTS_LOCK:
        expired = [rid for rid, entry in COMPLETED_RESULTS.items()
                   if now - entry['completed_at'] > RESULT_TTL]
        for rid in expired:
            del COMPLETED_RESULTS[rid]


class TriceraHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        path = urlparse(self.path).path

        if path == '/api/verify':
            self.handle_verify()
        elif path == '/api/abort':
            self.handle_abort()
        elif path == '/api/share':
            self.handle_share()
        else:
            self.send_error(404)

    def do_GET(self):
        path = urlparse(self.path).path

        if path == '/favicon.ico':
            self.send_response(204)
            self.end_headers()
            return
        elif path == '/api/result':
            self.handle_result()
        elif path == '/api/load':
            self.handle_load()
        elif path == '/api/config':
            self.handle_config()
        else:
            super().do_GET()

    def handle_verify(self):
        body = self.read_json()
        if not body or 'code' not in body:
            self.send_json({'status': 'ERROR', 'message': 'No code provided'}, 400)
            return

        args = body.get('args', [])
        request_id = body.get('requestId')
        if not request_id:
            self.send_json({'status': 'ERROR', 'message': 'No requestId provided'}, 400)
            return

        remote_addr = self.client_address[0]
        with PENDING_REQUESTS_LOCK:
            PENDING_REQUESTS.add(request_id)
        thread = threading.Thread(
            target=_run_tricera_background,
            args=(body['code'], args, request_id, remote_addr),
            daemon=True,
        )
        thread.start()
        self.send_json({'requestId': request_id, 'status': 'running',
                        'timeoutSeconds': job_timeout(validate_args(args))})

    def handle_abort(self):
        body = self.read_json()
        request_id = body.get('requestId') if body else None
        if not request_id:
            self.send_json({'error': 'No requestId provided'}, 400)
            return
        try:
            self.send_json({'aborted': abort_job(request_id)})
        except Exception as e:
            self.send_json({'aborted': False, 'message': str(e)}, 500)

    def handle_result(self):
        qs = parse_qs(urlparse(self.path).query)
        request_id = qs.get('id', [''])[0]
        if not request_id:
            self.send_json({'error': 'No request ID provided'}, 400)
            return

        with COMPLETED_RESULTS_LOCK:
            entry = COMPLETED_RESULTS.get(request_id)
        if entry:
            self.send_json(entry['result'])
            return

        with RUNNING_PROCS_LOCK:
            is_running = request_id in RUNNING_PROCS
        if is_running:
            self.send_json({'status': 'running'})
            return

        with PENDING_REQUESTS_LOCK:
            is_pending = request_id in PENDING_REQUESTS
        if is_pending:
            self.send_json({'status': 'running'})
            return

        self.send_json({'status': 'not_found', 'message': 'No result for this request ID'}, 404)

    def handle_config(self):
        self.send_json({
            'version': TRICERA_VERSION,
            'maxTimeout': MAX_TIMEOUT,
            'invariantEncodings': TRICERA_ENCODINGS,
        })

    def handle_share(self):
        body = self.read_json()
        if not body or 'code' not in body:
            self.send_json({'error': 'No code provided'}, 400)
            return

        share_id = uuid.uuid4().hex[:16]
        share_path = os.path.join(SHARE_DIR, f'{share_id}.json')
        with open(share_path, 'w') as f:
            json.dump({
                'code': body.get('code', ''),
                'options': body.get('options', {}),
                'created': int(time.time()),
            }, f)

        self.send_json({'id': share_id})

    def handle_load(self):
        qs = parse_qs(urlparse(self.path).query)
        share_id = qs.get('id', [''])[0]
        share_id = re.sub(r'[^a-f0-9]', '', share_id)

        share_path = os.path.join(SHARE_DIR, f'{share_id}.json')
        if not os.path.isfile(share_path):
            self.send_json({'error': 'Not found'}, 404)
            return

        with open(share_path) as f:
            data = json.load(f)
        self.send_json(data)

    def read_json(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            return json.loads(body)
        except (ValueError, TypeError):
            return None

    def send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        try:
            msg = format % args
        except Exception:
            msg = str(args)
        if '/api/' in msg:
            sys.stderr.write(f"[{self.log_date_time_string()}] {msg}\n")


def main():
    global TRICERA_PATH, SHARE_DIR, LOG_DIR, SERVER_MODE, MAX_TIMEOUT, HARD_TIMEOUT, TOOL_PATH
    global TRICERA_ENCODINGS

    parser = argparse.ArgumentParser(description='TriCera Web Interface - Local Server')
    parser.add_argument('--port', type=int, default=8000, help='Port to serve on (default: 8000)')
    parser.add_argument('--tricera', type=str, default=None, help='Path to the tri executable')
    parser.add_argument('--host', type=str, default='localhost', help='Host to bind to (default: localhost)')
    parser.add_argument('--tool-path', help='Search path for compiler and helper executables (or TRICERA_TOOL_PATH)')
    parser.add_argument('--server', action='store_true',
                        help='Server mode: use nice, prlimit, and strict timeout limits')
    args = parser.parse_args()
    if args.tool_path is not None:
        TOOL_PATH = args.tool_path

    if args.server:
        SERVER_MODE = True
        MAX_TIMEOUT = 60
        HARD_TIMEOUT = 65
        print('Running in SERVER mode (nice, prlimit, 60s timeout cap)')
    else:
        MAX_TIMEOUT = 300
        HARD_TIMEOUT = 305

    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    TRICERA_PATH = args.tricera or find_tricera()
    SHARE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shares')
    LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'log')
    os.makedirs(SHARE_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)

    if TRICERA_PATH:
        version = detect_tricera_version()
        TRICERA_ENCODINGS = detect_invariant_encodings()
        print(f'TriCera found at: {TRICERA_PATH} (version {version or "unknown"})')
    else:
        print('WARNING: TriCera executable not found.')
        print('  Set TRICERA_PATH environment variable, or use --tricera flag.')
        print('  The editor will work, but verification will fail.')

    ThreadingHTTPServer.allow_reuse_address = True
    server = ThreadingHTTPServer((args.host, args.port), TriceraHandler)
    print(f'Serving at http://{args.host}:{args.port}')
    print('Press Ctrl+C to stop.')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
        server.server_close()


if __name__ == '__main__':
    main()
