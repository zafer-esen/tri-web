<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';

$requestId = preg_replace('/[^a-zA-Z0-9_-]/', '', $_GET['id'] ?? '');
if ($requestId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'No request ID provided']);
    exit;
}

$resultDir = sys_get_temp_dir() . '/tricera-web-results';
$outputFile = "$resultDir/$requestId.out";
$doneFile   = "$resultDir/$requestId.done";
$metaFile   = "$resultDir/$requestId.meta";

if (!file_exists($doneFile)) {
    if (file_exists($metaFile)) {
        echo json_encode(['status' => 'running']);
    } else {
        http_response_code(404);
        echo json_encode(['status' => 'not_found', 'message' => 'No result for this request ID']);
    }
    exit;
}

$rawOutput = file_exists($outputFile) ? file_get_contents($outputFile) : '';
$meta = file_exists($metaFile) ? json_decode(file_get_contents($metaFile), true) : [];
$safeArgs = $meta['args'] ?? [];
$wantsGraphs = $meta['wantsGraphs'] ?? false;
$workDir = $meta['workDir'] ?? '';
$code = $meta['code'] ?? '';
$startTime = $meta['startTime'] ?? microtime(true);
$elapsed = round((filemtime($doneFile) - $startTime) * 1000);

$exitCode = (int)trim(file_get_contents($doneFile));
if ($exitCode === 137) {
    $result = [
        'status' => 'ABORTED',
        'message' => 'Verification aborted by user.',
        'diagnostics' => [],
        'rawOutput' => $rawOutput,
        'elapsedMs' => $elapsed,
    ];
} else {
    $result = parseTriceraOutput($rawOutput, $safeArgs);
    $result['rawOutput'] = $rawOutput;
    $result['elapsedMs'] = $elapsed;
}

if ($wantsGraphs && $workDir && is_dir($workDir)) {
    $result['graphImages'] = collectGraphImages($workDir);
}

logSubmission($code, $safeArgs, $result['status'] ?? '?', $elapsed);

// Clean up temporary files
if ($workDir && is_dir($workDir)) {
    array_map('unlink', glob("$workDir/*"));
    @rmdir($workDir);
}
@unlink($outputFile);
@unlink($doneFile);
@unlink($metaFile);
$pidFile = "$PID_DIR/$requestId.pid";
@unlink($pidFile);

echo json_encode($result);
