#!/usr/bin/env python3
"""Tests for the async verification pattern that prevents 504 Gateway Timeout.

Creates a mock TriCera, a proxy with a short timeout, and tests that:
1. A blocking endpoint through a short-timeout proxy causes 504 (negative test)
2. The async polling pattern avoids 504 (positive test)
3. Both SAFE and UNSAFE results are returned correctly
4. Abort works with the async pattern
"""

import http.client
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def _free_port():
    with socket.socket() as s:
        s.bind(('', 0))
        return s.getsockname()[1]


class TimeoutProxy(BaseHTTPRequestHandler):
    """Minimal HTTP proxy that returns 504 when the backend exceeds proxy_timeout."""
    backend_port = None
    proxy_timeout = 3

    def do_POST(self):
        self._proxy('POST')

    def do_GET(self):
        self._proxy('GET')

    def _proxy(self, method):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length) if length else None
        try:
            conn = http.client.HTTPConnection(
                'localhost', self.backend_port, timeout=self.proxy_timeout)
            headers = {'Content-Type': self.headers.get('Content-Type', 'application/json')}
            conn.request(method, self.path, body=body, headers=headers)
            resp = conn.getresponse()
            data = resp.read()
            self.send_response(resp.status)
            for h in ('Content-Type', 'Content-Length'):
                val = resp.getheader(h)
                if val:
                    self.send_header(h, val)
            self.end_headers()
            self.wfile.write(data)
            conn.close()
        except Exception:
            err_body = b'{"error": "Gateway Timeout"}'
            self.send_response(504)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(err_body)))
            self.end_headers()
            self.wfile.write(err_body)

    def log_message(self, *args):
        pass


class BlockingHandler(BaseHTTPRequestHandler):
    """Simulates the OLD synchronous /api/verify that blocks for the full
    verification duration. Used to demonstrate the 504 in the negative test."""
    block_seconds = 5

    def do_POST(self):
        time.sleep(self.block_seconds)
        body = json.dumps({'status': 'SAFE', 'message': 'Done'}).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class TestVerifyTimeout(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.mock_dir = tempfile.mkdtemp()
        cls.mock_tricera = os.path.join(cls.mock_dir, 'tri')
        with open(cls.mock_tricera, 'w') as f:
            f.write('#!/bin/bash\n')
            f.write('SLEEP=2\n')
            f.write('RESULT="SAFE"\n')
            f.write('for arg in "$@"; do\n')
            f.write('  case "$arg" in -t:*) SLEEP="${arg#-t:}" ;; esac\n')
            f.write('done\n')
            f.write('INPUT="${@: -1}"\n')
            f.write('if grep -q "EXPECT_UNSAFE" "$INPUT" 2>/dev/null; then\n')
            f.write('  RESULT="UNSAFE"\n')
            f.write('fi\n')
            f.write('sleep "$SLEEP"\n')
            f.write('echo "$RESULT"\n')
        os.chmod(cls.mock_tricera, os.stat(cls.mock_tricera).st_mode | stat.S_IEXEC)

        cls.server_port = _free_port()
        cls.proxy_port = _free_port()
        cls.blocking_port = _free_port()

        serve_py = os.path.join(cls.mock_dir, 'serve.py')
        shutil.copyfile(os.path.join(os.path.dirname(__file__), '..', 'serve.py'), serve_py)
        cls.server_proc = subprocess.Popen(
            [sys.executable, serve_py,
             '--port', str(cls.server_port),
             '--host', 'localhost',
             '--tricera', cls.mock_tricera],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )

        TimeoutProxy.backend_port = cls.server_port
        TimeoutProxy.proxy_timeout = 3
        cls.proxy_server = HTTPServer(('localhost', cls.proxy_port), TimeoutProxy)
        cls.proxy_thread = threading.Thread(target=cls.proxy_server.serve_forever, daemon=True)
        cls.proxy_thread.start()

        BlockingHandler.block_seconds = 5
        cls.blocking_server = HTTPServer(('localhost', cls.blocking_port), BlockingHandler)
        cls.blocking_thread = threading.Thread(target=cls.blocking_server.serve_forever, daemon=True)
        cls.blocking_thread.start()

        for _ in range(50):
            try:
                urlopen(f'http://localhost:{cls.server_port}/api/config', timeout=2)
                break
            except Exception:
                time.sleep(0.2)
        else:
            raise RuntimeError('serve.py did not start in time')

    @classmethod
    def tearDownClass(cls):
        cls.server_proc.terminate()
        cls.server_proc.wait()
        cls.proxy_server.shutdown()
        cls.blocking_server.shutdown()
        shutil.rmtree(cls.mock_dir, ignore_errors=True)

    def _post_json(self, port, path, data, timeout=10):
        body = json.dumps(data).encode()
        req = Request(f'http://localhost:{port}{path}', data=body,
                      headers={'Content-Type': 'application/json'})
        resp = urlopen(req, timeout=timeout)
        return resp.status, json.loads(resp.read())

    def _get_json(self, port, path, timeout=10):
        resp = urlopen(f'http://localhost:{port}{path}', timeout=timeout)
        return resp.status, json.loads(resp.read())

    # -- Negative test: reproduce the 504 --

    def test_01_blocking_request_causes_504(self):
        """A blocking endpoint behind a 3s-timeout proxy with 5s work -> 504."""
        # Point proxy at the blocking server instead
        original_port = TimeoutProxy.backend_port
        TimeoutProxy.backend_port = self.blocking_port
        try:
            body = json.dumps({'code': 'test'}).encode()
            req = Request(f'http://localhost:{self.proxy_port}/api/verify',
                          data=body,
                          headers={'Content-Type': 'application/json'})
            try:
                resp = urlopen(req, timeout=10)
                status = resp.status
            except HTTPError as e:
                status = e.code
            self.assertEqual(status, 504,
                             'Blocking endpoint should cause 504 through short-timeout proxy')
        finally:
            TimeoutProxy.backend_port = original_port

    # -- Positive tests: async pattern works --

    def test_02_async_verify_returns_immediately(self):
        """POST /api/verify returns in <2s even for a 5s verification."""
        start = time.time()
        status, data = self._post_json(self.server_port, '/api/verify', {
            'code': 'void main() { assert(1); }',
            'args': ['-t:5'],
            'requestId': 'test-immediate-02',
        })
        elapsed = time.time() - start
        self.assertEqual(status, 200)
        self.assertEqual(data['status'], 'running')
        self.assertEqual(data['requestId'], 'test-immediate-02')
        self.assertLess(elapsed, 2.0, 'POST should return in under 2 seconds')
        # Wait for background task to finish to avoid interference
        time.sleep(6)

    def test_03_poll_gets_safe_result(self):
        """Polling /api/result returns SAFE for a safe program."""
        request_id = 'test-safe-03'
        self._post_json(self.server_port, '/api/verify', {
            'code': 'void main() { assert(1); }',
            'args': ['-t:1'],
            'requestId': request_id,
        })
        result = None
        for _ in range(20):
            time.sleep(0.5)
            _, data = self._get_json(self.server_port, f'/api/result?id={request_id}')
            if data.get('status') != 'running':
                result = data
                break
        self.assertIsNotNone(result, 'Should have received a result')
        self.assertEqual(result['status'], 'SAFE')

    def test_04_poll_gets_unsafe_result(self):
        """Polling returns UNSAFE for a program containing EXPECT_UNSAFE."""
        request_id = 'test-unsafe-04'
        self._post_json(self.server_port, '/api/verify', {
            'code': '// EXPECT_UNSAFE\nvoid main() { assert(0); }',
            'args': ['-t:1'],
            'requestId': request_id,
        })
        result = None
        for _ in range(20):
            time.sleep(0.5)
            _, data = self._get_json(self.server_port, f'/api/result?id={request_id}')
            if data.get('status') != 'running':
                result = data
                break
        self.assertIsNotNone(result, 'Should have received a result')
        self.assertEqual(result['status'], 'UNSAFE')

    def test_05_no_504_through_proxy(self):
        """Full flow through a 3s-timeout proxy with 5s verification -> no 504."""
        request_id = 'test-proxy-05'
        status, data = self._post_json(self.proxy_port, '/api/verify', {
            'code': 'void main() { assert(1); }',
            'args': ['-t:5'],
            'requestId': request_id,
        })
        self.assertEqual(status, 200)
        self.assertEqual(data['status'], 'running')

        result = None
        for _ in range(20):
            time.sleep(1)
            _, data = self._get_json(self.proxy_port, f'/api/result?id={request_id}')
            if data.get('status') != 'running':
                result = data
                break
        self.assertIsNotNone(result, 'Should have received a result through proxy')
        self.assertEqual(result['status'], 'SAFE',
                         'Should get SAFE result through proxy without 504')

    def test_06_abort_works(self):
        """Aborting a running verification stops it."""
        request_id = 'test-abort-06'
        self._post_json(self.server_port, '/api/verify', {
            'code': 'void main() { assert(1); }',
            'args': ['-t:30'],
            'requestId': request_id,
        })
        time.sleep(1)

        _, abort_data = self._post_json(self.server_port, '/api/abort', {
            'requestId': request_id,
        })
        self.assertTrue(abort_data.get('aborted'), 'Abort should succeed')

        time.sleep(1)
        _, data = self._get_json(self.server_port, f'/api/result?id={request_id}')
        self.assertIn(data['status'], ['ABORTED', 'not_found'],
                      'Result after abort should be ABORTED or not_found')


if __name__ == '__main__':
    unittest.main()
