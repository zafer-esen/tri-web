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
configureToolEnvironment();

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

$safeArgs = validateArgs($requestedArgs);
// Compute before the internal -t:0 used for preprocessor output.
$hardTimeout = jobTimeout($safeArgs);
if ((in_array('-cpp', $safeArgs) || in_array('-cppLight', $safeArgs)) && !findTool('cc')) {
    echo json_encode(terminalResult('ERROR', "C preprocessing cannot find an executable 'cc' in the web server's PATH. Check the compiler installation and TRICERA_TOOL_PATH."));
    exit;
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

// The tri invocation with resource limits (to be exec'd by a wrapper shell)
$triInvocation = sprintf(
    'nice -n %d timeout --signal=KILL %s prlimit --data=%d %s %s %s',
    $NICE_LEVEL,
    escapeshellarg((string)$hardTimeout),
    $MEM_LIMIT_MB * 1024 * 1024,
    escapeshellarg($TRICERA_PATH),
    implode(' ', $escapedArgs),
    escapeshellarg($tmpFile)
);

// Result storage directory
$resultDir = $RESULT_DIR;
if (!is_dir($resultDir)) @mkdir($resultDir, 0700, true);
$outputFile = "$resultDir/$requestId.out";
$doneFile   = "$resultDir/$requestId.done";
$metaFile   = "$resultDir/$requestId.meta";
$abortFile  = "$resultDir/$requestId.abort";
$cachedFile = "$resultDir/$requestId.json";
if (file_exists($metaFile) || file_exists($cachedFile)) {
    echo json_encode(terminalResult('ERROR', 'Request ID already exists. Start a new verification.'));
    @unlink($tmpFile);
    @rmdir($workDir);
    exit;
}
foreach (glob("$resultDir/*.json") as $cached) {
    if (filemtime($cached) < time() - 300) @unlink($cached);
}

// Save metadata for result.php to use when returning the result
file_put_contents($metaFile, json_encode([
    'workDir' => $workDir,
    'args' => $safeArgs,
    'wantsGraphs' => $wantsGraphs,
    'code' => $code,
    'startTime' => microtime(true),
    'hardTimeout' => $hardTimeout,
]));

// The worker becomes timeout itself, so its recorded PID is the workload's
// process group. Keep the supervisor outside that group to record completion.
if (!is_dir($PID_DIR)) @mkdir($PID_DIR, 0700, true);
$pidFile = "$PID_DIR/$requestId.pid";

$worker = 'echo $$ > ' . escapeshellarg($pidFile)
    . '; test -f ' . escapeshellarg($metaFile)
    . ' && test ! -f ' . escapeshellarg($abortFile) . ' || exit 125'
    . '; exec ' . $triInvocation;
$wrapper = 'cd ' . escapeshellarg($workDir)
    . ' && setsid sh -c ' . escapeshellarg($worker)
    . ' > ' . escapeshellarg($outputFile) . ' 2>&1'
    . '; code=$?; printf \'%s %s\\n\' "$code" "$(date +%s.%N)" > ' . escapeshellarg($doneFile . '.tmp')
    . '; mv ' . escapeshellarg($doneFile . '.tmp') . ' ' . escapeshellarg($doneFile);
$bgCmd = 'setsid sh -c ' . escapeshellarg($wrapper) . ' > /dev/null 2>&1 &';

// Launch in background (returns immediately)
exec($bgCmd);

echo json_encode(['requestId' => $requestId, 'status' => 'running', 'timeoutSeconds' => $hardTimeout]);
