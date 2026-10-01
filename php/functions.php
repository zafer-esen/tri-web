<?php

function configureToolEnvironment() {
    global $TOOL_PATH, $TRICERA_PATH;
    $paths = explode(PATH_SEPARATOR, $TOOL_PATH ?? (getenv('PATH') ?: ''));
    $paths = array_unique(array_filter(array_merge($paths, ['/usr/local/bin', '/usr/bin', '/bin']), 'strlen'));
    putenv('PATH=' . implode(PATH_SEPARATOR, $paths));
    putenv('DISPLAY=');
    $configured = getenv('TRI_PP_PATH');
    if ($configured === false || $configured === '') {
        $triDir = dirname(@realpath($TRICERA_PATH) ?: $TRICERA_PATH);
        $directories = [$triDir . '/dist', $triDir];
        $onPath = findTool('tri-pp');
        if ($onPath) $directories[] = dirname($onPath);
        $checkout = dirname($triDir) . '/tri-pp';
        $directories[] = $checkout;
        $directories[] = $checkout . '/build';
        foreach ($directories as $directory) {
            $executable = $directory . '/tri-pp';
            if (@is_file($executable) && @is_executable($executable)) {
                putenv('TRI_PP_PATH=' . realpath($directory));
                break;
            }
        }
    }
}

function findTool($name) {
    exec('command -v ' . escapeshellarg($name) . ' 2>/dev/null', $output, $exitCode);
    return $exitCode === 0 && $output ? $output[0] : null;
}

function parseInvariantEncodings($helpOutput) {
    $lines = preg_split('/\R/', $helpOutput);
    foreach ($lines as $index => $line) {
        if (!preg_match('/^\s*-invEncoding\[:\w+\]\s/', $line)) continue;
        $names = [];
        foreach (array_slice($lines, $index + 1) as $line) {
            $line = rtrim(trim($line), ',');
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9-]*(?:\s*,\s*[A-Za-z0-9][A-Za-z0-9-]*)*$/D', $line)) break;
            foreach (explode(',', $line) as $name) {
                $name = trim($name);
                if ($name !== 'default') $names[] = $name;
            }
        }
        return array_values(array_unique($names));
    }
    return [];
}

function validateArgs($args) {
    global $ALLOWED_ARG_PATTERN, $MAX_TIMEOUT;
    $safeArgs = [];
    foreach ($args as $arg) {
        if (is_string($arg) && preg_match($ALLOWED_ARG_PATTERN, $arg)) {
            if (preg_match('/^-t:(\d+(?:\.\d+)?)$/D', $arg, $m)) {
                $arg = '-t:' . min((float)$m[1], $MAX_TIMEOUT);
            }
            $safeArgs[] = $arg;
        }
    }
    return $safeArgs;
}

function jobTimeout($args) {
    global $MAX_TIMEOUT, $HARD_TIMEOUT, $TIMEOUT_GRACE;
    $requested = $MAX_TIMEOUT;
    foreach ($args as $arg) {
        if (strpos($arg, '-t:') === 0) $requested = (float)substr($arg, 3);
    }
    return min($HARD_TIMEOUT, max(1, $requested) + $TIMEOUT_GRACE);
}

function terminalResult($status, $message) {
    return ['status' => $status, 'message' => $message, 'diagnostics' => []];
}

function jobPid($requestId) {
    global $PID_DIR;
    $file = "$PID_DIR/$requestId.pid";
    return is_file($file) ? (int)trim(file_get_contents($file)) : 0;
}

function signalJob($requestId, $signal) {
    $pid = jobPid($requestId);
    if ($pid <= 1) return false;
    if (function_exists('posix_kill')) return @posix_kill(-$pid, $signal);
    exec('kill -' . (int)$signal . ' -' . $pid . ' 2>/dev/null', $unused, $exitCode);
    return $exitCode === 0;
}

function writeJsonAtomically($path, $value) {
    $tmp = $path . '.' . uniqid() . '.tmp';
    file_put_contents($tmp, json_encode($value));
    rename($tmp, $path);
}

function logSubmission($code, $args, $status, $elapsedMs) {
    global $LOG_DIR, $MAX_LOG_SIZE_MB;
    if (!$LOG_DIR) return;
    if (!is_dir($LOG_DIR)) @mkdir($LOG_DIR, 0700, true);
    $logPath = "$LOG_DIR/submissions.log";
    if (file_exists($logPath) && filesize($logPath) > $MAX_LOG_SIZE_MB * 1024 * 1024) {
        @rename($logPath, "$logPath.1");
    }
    $ts = date('Y-m-d H:i:s');
    $ip = $_SERVER['REMOTE_ADDR'] ?? '?';
    $argsStr = implode(' ', $args);
    $preview = substr(str_replace("\n", "\\n", $code), 0, 500);
    if (strlen($code) > 500) $preview .= "... (" . strlen($code) . " chars total)";
    @file_put_contents($logPath,
        "$ts | $ip | $status | {$elapsedMs}ms | args: $argsStr\n  code: $preview\n",
        FILE_APPEND | LOCK_EX);
}

function collectGraphImages($workDir) {
    $images = [];
    $labels = [
        'graph0' => 'Horn Clauses (before simplification)',
        'graph1' => 'Horn Clauses (after simplification)',
    ];
    foreach (glob("$workDir/graph*.png") as $pngf) {
        $name = pathinfo($pngf, PATHINFO_FILENAME);
        $images[] = [
            'label' => $labels[$name] ?? "Horn Clauses ($name)",
            'data' => base64_encode(file_get_contents($pngf)),
        ];
    }
    $cexDot = "$workDir/dag-graph-cex.dot";
    if (file_exists($cexDot) && ($dotBin = trim(shell_exec('which dot 2>/dev/null')))) {
        $png = shell_exec(escapeshellarg($dotBin) . ' -Tpng ' . escapeshellarg($cexDot));
        if ($png) {
            $images[] = ['label' => 'Counterexample', 'data' => base64_encode($png)];
        }
    }
    return $images;
}

function parseTriceraOutput($output, $args = []) {
    $result = [
        'status' => 'UNKNOWN',
        'message' => '',
        'diagnostics' => [],
        'counterexample' => null,
        'acsl' => null,
        'chcs' => null,
        'preprocessorOutput' => null,
    ];

    $failed = preg_match('/^(?:.*Error:|Out of Memory|Stack Overflow)/m', $output);
    $timedOut = preg_match('/^TIMEOUT\s*$/m', $output);
    if (!$failed && !$timedOut && (in_array('-p', $args) || in_array('-pDot', $args) || in_array('-sp', $args))) {
        $result['status'] = 'INFO';
        $result['message'] = 'Horn clauses generated (no verification).';
        if (preg_match('/^(.*?)(System predicates:)/ms', $output, $m)) {
            $pp = trim($m[1]);
            if ($pp !== '') $result['preprocessorOutput'] = $pp;
            $result['chcs'] = trim(substr($output, strlen($m[1])));
        } else {
            $result['chcs'] = trim($output);
        }
        return $result;
    }

    if (in_array('-printPP', $args)) {
        if (preg_match('/^(.*?)(?:timeout\n)?(SAFE|UNSAFE|TIMEOUT|UNKNOWN)/ms', $output, $ppMatch)) {
            $result['preprocessorOutput'] = trim($ppMatch[1]);
        } else {
            $result['preprocessorOutput'] = trim($output);
        }
        if (in_array('-t:0', $args) && !$failed) {
            $result['status'] = 'INFO';
            $result['message'] = 'Preprocessor output generated (verification skipped).';
            return $result;
        }
    }

    if (preg_match('/^SAFE\s*$/m', $output) && !preg_match('/UNSAFE/', $output)) {
        $result['status'] = 'SAFE';
        $result['message'] = 'Program verified successfully.';
    } elseif (preg_match('/^UNSAFE\s*$/m', $output)) {
        $result['status'] = 'UNSAFE';
        $result['message'] = 'Verification failed.';
    } elseif (preg_match('/^TIMEOUT\s*$/m', $output)) {
        $result['status'] = 'TIMEOUT';
        $result['message'] = 'Verification timed out.';
    }

    if (preg_match('/^UNKNOWN(?:\s*\((.+?)\))?\s*$/m', $output, $m)
        && !in_array($result['status'], ['SAFE', 'UNSAFE', 'TIMEOUT'])) {
        $result['status'] = 'UNKNOWN';
        $reason = $m[1] ?? '';
        $result['message'] = $reason ? "Result unknown: $reason" : 'Result unknown.';
    }

    if (preg_match_all('/Parse Error: At line (\d+)/', $output, $matches, PREG_SET_ORDER)) {
        $result['status'] = 'ERROR';
        foreach ($matches as $m) {
            $line = (int)$m[1];
            $result['message'] = "Parse error at line $line";
            $result['diagnostics'][] = [
                'type' => 'parse-error',
                'line' => $line,
                'column' => 1,
                'message' => 'Parse error',
                'property' => null,
            ];
        }
    }

    if (preg_match('/Horn Translation Error:\s*(.+)/', $output, $m)) {
        $result['status'] = 'ERROR';
        $result['message'] = 'Translation error: ' . $m[1];
    }

    if (preg_match('/Other Error:\s*(.+)/', $output, $m)) {
        $result['status'] = 'ERROR';
        $result['message'] = 'Error: ' . $m[1];
    }

    if (strpos($output, 'Out of Memory') !== false) {
        $result['status'] = 'ERROR';
        $result['message'] = 'Out of memory.';
    }
    if (strpos($output, 'Stack Overflow') !== false) {
        $result['status'] = 'ERROR';
        $result['message'] = 'Stack overflow.';
    }

    if (preg_match_all('/Failed assertion:\s*\n(.+?)\(line:(\d+)\s+col:(\d+)\)\s*(?:\(property:\s*(.+?)\))?/s', $output, $matches, PREG_SET_ORDER)) {
        foreach ($matches as $m) {
            $result['diagnostics'][] = [
                'type' => 'failed-assertion',
                'line' => (int)$m[2],
                'column' => (int)$m[3],
                'message' => 'Failed assertion',
                'property' => trim($m[4] ?? 'user-assertion'),
            ];
        }
    }

    if (preg_match('/(---+\nInit:.*?)(?=Failed assertion:|UNSAFE)/s', $output, $m)) {
        $result['counterexample'] = trim($m[1]);
    }

    if (preg_match('/Inferred ACSL annotations\n={10,}\n(.*?)={10,}/s', $output, $m)) {
        $result['acsl'] = trim($m[1]);
    }

    return $result;
}
