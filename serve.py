#!/usr/bin/env python3
"""
Local development server for TriCera web interface.
No external dependencies - uses Python standard library only.

Usage:
    python3 serve.py
    python3 serve.py --port 3000 --tricera /path/to/tri
"""

import argparse
import base64
import glob as globmod
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import uuid
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

# Configuration
TRICERA_PATH = None
SHARE_DIR = None
LOG_DIR = None
MAX_CODE_SIZE = 50000
MAX_TIMEOUT = 60           # max user-requested timeout
HARD_TIMEOUT = 65          # hard kill (slightly above MAX_TIMEOUT)
SERVER_MODE = False        # when True, use nice + resource limits
MAX_LOG_SIZE_MB = 50       # rotate log when it exceeds this size

# Allowed TriCera argument prefixes (security whitelist)
ALLOWED_ARG_PATTERN = re.compile(
    r'^-(?:arithMode:[a-z0-9]+|t:\d+(\.\d+)?|m:\w+|heapModel:[a-z]+|log:\d+'
    r'|cex|acsl|f|printPP|p|pDot|dotCEX|pngNo|sp'
    r'|reachsafety|memsafety|valid-deref|valid-free'
    r'|valid-memtrack|valid-memcleanup|splitProperties'
    r'|cpp|cppLight|noPP'
    r'|inv|sol|ssol|statistics'
    r'|sym|sym:bfs|sym:dfs|symDepth:\d+'
    r'|abstract:\w+|abstractTO:\d+(\.\d+)?|abstractPO'
    r'|disj|noSlicing|solutionReconstruction:\w+'
    r'|splitClauses:\d+'
    r'|forceNondetInit|mathArrays)$'
)


def log_submission(remote_addr, code, args, result_status, elapsed_ms):
    """Append a verification submission to the log file with rotation."""
    if not LOG_DIR:
        return
    try:
        log_path = os.path.join(LOG_DIR, 'submissions.log')
        # Rotate if too large
        if os.path.isfile(log_path) and os.path.getsize(log_path) > MAX_LOG_SIZE_MB * 1024 * 1024:
            rotated = log_path + '.1'
            if os.path.isfile(rotated):
                os.unlink(rotated)
            os.rename(log_path, rotated)
        with open(log_path, 'a') as f:
            ts = time.strftime('%Y-%m-%d %H:%M:%S')
            # Truncate code in log to first 500 chars
            code_preview = code[:500].replace('\n', '\\n')
            if len(code) > 500:
                code_preview += f'... ({len(code)} chars total)'
            f.write(f'{ts} | {remote_addr} | {result_status} | {elapsed_ms}ms | args: {args}\n')
            f.write(f'  code: {code_preview}\n')
    except Exception:
        pass  # logging should never break verification


TRICERA_VERSION = None


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
        )
        TRICERA_VERSION = proc.stdout.strip()
        return TRICERA_VERSION
    except Exception:
        return None


def find_tricera():
    """Auto-detect the TriCera executable."""
    candidates = [
        os.environ.get('TRICERA_PATH', ''),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tricera', 'tri'),
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tri'),
    ]
    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return os.path.abspath(path)
    # Check PATH
    which = shutil.which('tri')
    if which:
        return which
    return None


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

    # -p / -pDot / -sp: CHC output, no verification
    if '-p' in args or '-pDot' in args or '-sp' in args:
        result['status'] = 'INFO'
        result['message'] = 'Horn clauses generated (no verification).'
        # Split at "System predicates:" - above is preprocessor output, below is CHCs
        parts = re.split(r'^(System predicates:)', output, maxsplit=1, flags=re.MULTILINE)
        if len(parts) >= 3:
            pp_text = parts[0].strip()
            if pp_text:
                result['preprocessorOutput'] = pp_text
            result['chcs'] = (parts[1] + parts[2]).strip()
        else:
            result['chcs'] = output.strip()
        return result

    # -printPP: extract preprocessor output before verdict
    if '-printPP' in args:
        # Split at timeout/verdict line to isolate preprocessor output
        parts = re.split(r'^(?:timeout\n)?(SAFE|UNSAFE|TIMEOUT|UNKNOWN)', output, maxsplit=1, flags=re.MULTILINE)
        if len(parts) >= 2:
            result['preprocessorOutput'] = parts[0].strip()
        else:
            result['preprocessorOutput'] = output.strip()
        # If -t:0 was used to skip verification, treat as INFO
        if '-t:0' in args:
            result['status'] = 'INFO'
            result['message'] = 'Preprocessor output generated (verification skipped).'
            return result
            return result

    # Determine verification result
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

    # Parse errors
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

    # Translation errors
    m = re.search(r'Horn Translation Error:\s*(.+)', output)
    if m:
        result['status'] = 'ERROR'
        result['message'] = f'Translation error: {m.group(1)}'

    # Other errors
    m = re.search(r'Other Error:\s*(.+)', output)
    if m:
        result['status'] = 'ERROR'
        result['message'] = f'Error: {m.group(1)}'

    # Out of memory / stack overflow
    if 'Out of Memory' in output:
        result['status'] = 'ERROR'
        result['message'] = 'Out of memory.'
    if 'Stack Overflow' in output:
        result['status'] = 'ERROR'
        result['message'] = 'Stack overflow.'

    # Failed assertions with line/col info
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

    # Extract counterexample (text between --- delimiters before UNSAFE)
    cex_match = re.search(r'(-{3,}\nInit:.*?)(?=Failed assertion:|UNSAFE)', output, re.DOTALL)
    if cex_match:
        result['counterexample'] = cex_match.group(1).strip()

    # Extract ACSL annotations (between ===... delimiters)
    acsl_match = re.search(
        r'Inferred ACSL annotations\n={10,}\n(.*?)={10,}',
        output, re.DOTALL
    )
    if acsl_match:
        result['acsl'] = acsl_match.group(1).strip()

    return result


def collect_graph_images(workdir):
    """Find generated PNG and dot files in workdir, return as base64 images."""
    images = []
    dot_bin = shutil.which('dot')

    # 1. Collect pre-generated PNG files from -pDot (graph0.png, graph1.png, ...)
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

    # 2. Convert dot files that don't have a corresponding PNG (e.g., dag-graph-cex.dot)
    if dot_bin:
        cex_dot = os.path.join(workdir, 'dag-graph-cex.dot')
        if os.path.isfile(cex_dot):
            try:
                proc = subprocess.run(
                    [dot_bin, '-Tpng', cex_dot],
                    capture_output=True, timeout=10,
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
    """Validate and filter CLI arguments against whitelist."""
    safe_args = []
    for arg in args:
        if ALLOWED_ARG_PATTERN.match(arg):
            # Clamp -t:N to MAX_TIMEOUT
            m = re.match(r'^-t:(\d+)$', arg)
            if m:
                t = min(int(m.group(1)), MAX_TIMEOUT)
                safe_args.append(f'-t:{t}')
            else:
                safe_args.append(arg)
    return safe_args


def run_tricera(code, args):
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

    # Determine file extension
    ext = '.hcc' if any(kw in code for kw in ['thread ', 'thread[', 'atomic ', 'atomic{', 'chan ']) else '.c'

    # Use a temp directory as cwd so TriCera writes dot files there
    workdir = tempfile.mkdtemp(prefix='tri_work_')
    tmppath = os.path.join(workdir, 'input' + ext)
    try:
        with open(tmppath, 'w') as f:
            f.write(code)

        wants_graphs = any(a in safe_args for a in ['-pDot', '-dotCEX'])
        if wants_graphs and '-pngNo' not in safe_args:
            safe_args.append('-pngNo')

        # -printPP without CHC flags: skip verification with -t:0
        chc_flags = ['-p', '-pDot', '-sp']
        if '-printPP' in safe_args and not any(f in safe_args for f in chc_flags):
            safe_args.append('-t:0')

        # Build command after all arg modifications
        if SERVER_MODE:
            cmd = [
                'nice', '-n', '19',
                'prlimit', f'--data={2048 * 1024 * 1024}',
                TRICERA_PATH,
            ] + safe_args + [tmppath]
        else:
            cmd = [TRICERA_PATH] + safe_args + [tmppath]

        start = time.time()

        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=HARD_TIMEOUT,
                cwd=workdir,
                env={
                    **os.environ,
                    'TRI_PP_PATH': os.path.dirname(TRICERA_PATH),
                    'DISPLAY': '',  # suppress image viewer opening
                },
            )
            output = proc.stdout + proc.stderr
        except subprocess.TimeoutExpired:
            output = 'TIMEOUT'
        except Exception as e:
            output = f'Other Error: {e}'

        elapsed = int((time.time() - start) * 1000)

        result = parse_tricera_output(output, safe_args)
        result['rawOutput'] = output
        result['elapsedMs'] = elapsed

        # Collect generated dot files and convert to PNG via graphviz
        if wants_graphs:
            result['graphImages'] = collect_graph_images(workdir)

        return result
    finally:
        import shutil as _shutil
        _shutil.rmtree(workdir, ignore_errors=True)


class TriceraHandler(SimpleHTTPRequestHandler):
    """HTTP handler that serves static files and handles API endpoints."""

    def do_POST(self):
        path = urlparse(self.path).path

        if path == '/api/verify':
            self.handle_verify()
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
        elif path == '/api/load':
            self.handle_load()
        elif path == '/api/config':
            self.handle_config()
        else:
            # Serve static files
            super().do_GET()

    def handle_verify(self):
        body = self.read_json()
        if not body or 'code' not in body:
            self.send_json({'status': 'ERROR', 'message': 'No code provided'}, 400)
            return

        args = body.get('args', [])
        result = run_tricera(body['code'], args)
        remote_addr = self.client_address[0]
        log_submission(remote_addr, body['code'], args,
                       result.get('status', '?'), result.get('elapsedMs', 0))
        self.send_json(result)

    def handle_config(self):
        self.send_json({
            'version': TRICERA_VERSION,
            'maxTimeout': MAX_TIMEOUT,
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
        # Sanitize ID
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
        # Only log API calls
        try:
            msg = format % args
        except Exception:
            msg = str(args)
        if '/api/' in msg:
            sys.stderr.write(f"[{self.log_date_time_string()}] {msg}\n")


def main():
    global TRICERA_PATH, SHARE_DIR, LOG_DIR, SERVER_MODE, MAX_TIMEOUT, HARD_TIMEOUT

    parser = argparse.ArgumentParser(description='TriCera Web Interface - Local Server')
    parser.add_argument('--port', type=int, default=8000, help='Port to serve on (default: 8000)')
    parser.add_argument('--tricera', type=str, default=None, help='Path to the tri executable')
    parser.add_argument('--host', type=str, default='localhost', help='Host to bind to (default: localhost)')
    parser.add_argument('--server', action='store_true',
                        help='Server mode: use nice, prlimit, and strict timeout limits')
    args = parser.parse_args()

    if args.server:
        SERVER_MODE = True
        MAX_TIMEOUT = 60
        HARD_TIMEOUT = 65
        print('Running in SERVER mode (nice, prlimit, 60s timeout cap)')
    else:
        MAX_TIMEOUT = 300
        HARD_TIMEOUT = 305

    # Set working directory to script location (so static files are served correctly)
    os.chdir(os.path.dirname(os.path.abspath(__file__)))

    # Find TriCera
    TRICERA_PATH = args.tricera or find_tricera()
    SHARE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shares')
    LOG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'log')
    os.makedirs(SHARE_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)

    if TRICERA_PATH:
        version = detect_tricera_version()
        print(f'TriCera found at: {TRICERA_PATH} (version {version or "unknown"})')
    else:
        print('WARNING: TriCera executable not found.')
        print('  Set TRICERA_PATH environment variable, or use --tricera flag.')
        print('  The editor will work, but verification will fail.')

    HTTPServer.allow_reuse_address = True
    server = HTTPServer((args.host, args.port), TriceraHandler)
    print(f'Serving at http://{args.host}:{args.port}')
    print('Press Ctrl+C to stop.')

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nStopped.')
        server.server_close()


if __name__ == '__main__':
    main()
