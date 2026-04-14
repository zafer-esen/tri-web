<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

require_once __DIR__ . '/config.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['code'])) {
    echo json_encode(['status' => 'ERROR', 'message' => 'No code provided']);
    exit;
}

$code = $input['code'];
$requestedArgs = $input['args'] ?? [];

if (strlen($code) > $MAX_CODE_SIZE) {
    echo json_encode(['status' => 'ERROR', 'message' => 'Code too large (max ' . ($MAX_CODE_SIZE / 1000) . 'KB)']);
    exit;
}

// Whitelist and clamp args, keep them unescaped in $safeArgs.
$safeArgs = [];
foreach ($requestedArgs as $arg) {
    if (is_string($arg) && preg_match($ALLOWED_ARG_PATTERN, $arg)) {
        if (preg_match('/^-t:(\d+)$/', $arg, $tm)) {
            $safeArgs[] = '-t:' . min((int)$tm[1], $MAX_TIMEOUT);
        } else {
            $safeArgs[] = $arg;
        }
    }
}

// -pDot alone: suppress the image viewer with -pngNo.
// Don't add -pngNo when -dotCEX is requested (Main.scala gates CEX dot on !pngNo).
if (in_array('-pDot', $safeArgs) && !in_array('-dotCEX', $safeArgs)
    && !in_array('-pngNo', $safeArgs)) {
    $safeArgs[] = '-pngNo';
}

// -printPP alone: skip verification via -t:0
$chcFlags = ['-p', '-pDot', '-sp'];
if (in_array('-printPP', $safeArgs) && !array_intersect($safeArgs, $chcFlags)) {
    $safeArgs[] = '-t:0';
}

$workDir = sys_get_temp_dir() . '/tricera-web-' . uniqid();
mkdir($workDir, 0700, true);

$hasThreads = preg_match('/\b(thread\s|thread\[|atomic\s|atomic\{|chan\s)/', $code);
$ext = $hasThreads ? '.hcc' : '.c';
$tmpFile = "$workDir/input$ext";
file_put_contents($tmpFile, $code);

$wantsGraphs = in_array('-pDot', $safeArgs) || in_array('-dotCEX', $safeArgs);

$escapedArgs = array_map('escapeshellarg', $safeArgs);
$triPpPath = dirname($TRICERA_PATH);
$cmd = sprintf(
    'cd %s && TRI_PP_PATH=%s DISPLAY= nice -n %d timeout --signal=KILL %d prlimit --data=%d %s %s %s 2>&1',
    escapeshellarg($workDir),
    escapeshellarg($triPpPath),
    $NICE_LEVEL,
    $HARD_TIMEOUT,
    $MEM_LIMIT_MB * 1024 * 1024,
    escapeshellarg($TRICERA_PATH),
    implode(' ', $escapedArgs),
    escapeshellarg($tmpFile)
);

$startTime = microtime(true);
exec($cmd, $outputLines, $exitCode);
$elapsed = round((microtime(true) - $startTime) * 1000);

$rawOutput = implode("\n", $outputLines);
$result = parseTriceraOutput($rawOutput, $safeArgs);
$result['rawOutput'] = $rawOutput;
$result['elapsedMs'] = $elapsed;

if ($wantsGraphs) {
    $result['graphImages'] = collectGraphImages($workDir);
}

array_map('unlink', glob("$workDir/*"));
@rmdir($workDir);

logSubmission($code, $safeArgs, $result['status'] ?? '?', $elapsed);

echo json_encode($result);

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

    if (in_array('-p', $args) || in_array('-pDot', $args) || in_array('-sp', $args)) {
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
        if (in_array('-t:0', $args)) {
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
