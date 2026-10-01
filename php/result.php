<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
configureToolEnvironment();

$requestId = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['id'] ?? '');
if ($requestId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'No request ID provided']);
    exit;
}

$resultDir = $RESULT_DIR;
$outputFile = "$resultDir/$requestId.out";
$doneFile   = "$resultDir/$requestId.done";
$metaFile   = "$resultDir/$requestId.meta";
$abortFile  = "$resultDir/$requestId.abort";
$cachedFile = "$resultDir/$requestId.json";

if (file_exists($cachedFile)) {
    readfile($cachedFile);
    exit;
}

$meta = file_exists($metaFile) ? json_decode(file_get_contents($metaFile), true) : [];
$startTime = $meta['startTime'] ?? microtime(true);
$deadline = $startTime + ($meta['hardTimeout'] ?? $HARD_TIMEOUT);
$forcedResult = null;

if (!file_exists($doneFile)) {
    if (!$meta) {
        http_response_code(404);
        echo json_encode(['status' => 'not_found', 'message' => 'No result for this request ID']);
        exit;
    }
    if (microtime(true) > $deadline + 2) {
        signalJob($requestId, 9);
        $forcedResult = terminalResult('TIMEOUT', 'Verification timed out.');
    } elseif (microtime(true) > $startTime + 5 && !signalJob($requestId, 0)) {
        $forcedResult = terminalResult('ERROR', 'Verification stopped without a result.');
    } else {
        echo json_encode(['status' => 'running']);
        exit;
    }
}

$rawOutput = file_exists($outputFile) ? file_get_contents($outputFile) : '';
$safeArgs = $meta['args'] ?? [];
$wantsGraphs = $meta['wantsGraphs'] ?? false;
$workDir = $meta['workDir'] ?? '';
$code = $meta['code'] ?? '';
$completion = file_exists($doneFile) ? preg_split('/\s+/', trim(file_get_contents($doneFile))) : [];
$finished = isset($completion[1]) ? (float)$completion[1] : microtime(true);
$elapsed = max(0, round(($finished - $startTime) * 1000));
$exitCode = (int)($completion[0] ?? -1);

if (file_exists($abortFile)) {
    $result = terminalResult('ABORTED', 'Verification aborted by user.');
} elseif ($forcedResult) {
    $result = $forcedResult;
} elseif ($exitCode === 124 || ($exitCode === 137 && $finished >= $deadline)) {
    $result = terminalResult('TIMEOUT', 'Verification timed out.');
} else {
    $result = parseTriceraOutput($rawOutput, $safeArgs);
    if ($exitCode !== 0 && in_array($result['status'], ['INFO', 'UNKNOWN'])) {
        $result = terminalResult('ERROR', "TriCera exited with status $exitCode.");
    }
}
$result['rawOutput'] = $rawOutput;
$result['elapsedMs'] = $elapsed;

if ($wantsGraphs && !in_array($result['status'], ['TIMEOUT', 'ABORTED', 'ERROR']) && $workDir && is_dir($workDir)) {
    $result['graphImages'] = collectGraphImages($workDir);
}

logSubmission($code, $safeArgs, $result['status'] ?? '?', $elapsed);
// Keep terminal responses briefly so a lost response can be polled again.
writeJsonAtomically($cachedFile, $result);

// Clean up temporary files
if ($workDir && is_dir($workDir)) {
    array_map('unlink', glob("$workDir/*"));
    @rmdir($workDir);
}
@unlink($outputFile);
@unlink($doneFile);
@unlink($metaFile);
@unlink($abortFile);
$pidFile = "$PID_DIR/$requestId.pid";
@unlink($pidFile);

echo json_encode($result);
