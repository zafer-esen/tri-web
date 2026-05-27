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
require_once __DIR__ . '/functions.php';

$input = json_decode(file_get_contents('php://input'), true);
if (!$input || empty($input['code'])) {
    echo json_encode(['status' => 'ERROR', 'message' => 'No code provided']);
    exit;
}

$code = $input['code'];
$requestedArgs = $input['args'] ?? [];
$requestId = $input['requestId'] ?? '';
$requestId = preg_replace('/[^a-zA-Z0-9_-]/', '', $requestId);

if ($requestId === '') {
    http_response_code(400);
    echo json_encode(['status' => 'ERROR', 'message' => 'No requestId provided']);
    exit;
}

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

// The tri invocation with resource limits (to be exec'd by a wrapper shell)
$triInvocation = sprintf(
    'nice -n %d timeout --signal=KILL %d prlimit --data=%d %s %s %s 2>&1',
    $NICE_LEVEL,
    $HARD_TIMEOUT,
    $MEM_LIMIT_MB * 1024 * 1024,
    escapeshellarg($TRICERA_PATH),
    implode(' ', $escapedArgs),
    escapeshellarg($tmpFile)
);

// Result storage directory
$resultDir = sys_get_temp_dir() . '/tricera-web-results';
if (!is_dir($resultDir)) @mkdir($resultDir, 0700, true);
$outputFile = "$resultDir/$requestId.out";
$doneFile   = "$resultDir/$requestId.done";
$metaFile   = "$resultDir/$requestId.meta";

// Save metadata for result.php to use when returning the result
file_put_contents($metaFile, json_encode([
    'workDir' => $workDir,
    'args' => $safeArgs,
    'wantsGraphs' => $wantsGraphs,
    'code' => $code,
    'startTime' => microtime(true),
]));

// Wrap in setsid so the whole process tree is in one process group we can kill.
// Output goes to a file; a done marker is written on completion.
if (!is_dir($PID_DIR)) @mkdir($PID_DIR, 0700, true);
$pidFile = "$PID_DIR/$requestId.pid";

$bgParts = ['cd ' . escapeshellarg($workDir)];
$bgParts[] = 'echo $$ > ' . escapeshellarg($pidFile);
$bgParts[] = sprintf(
    'TRI_PP_PATH=%s DISPLAY= %s > %s 2>&1; echo $? > %s',
    escapeshellarg($triPpPath),
    $triInvocation,
    escapeshellarg($outputFile),
    escapeshellarg($doneFile)
);
$wrapper = implode(' && ', $bgParts);
$bgCmd = 'setsid sh -c ' . escapeshellarg($wrapper) . ' > /dev/null 2>&1 &';

// Launch in background (returns immediately)
exec($bgCmd);

echo json_encode(['requestId' => $requestId, 'status' => 'running']);
