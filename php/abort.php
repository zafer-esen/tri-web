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
$requestId = $input['requestId'] ?? '';
$requestId = preg_replace('/[^a-zA-Z0-9_-]/', '', $requestId);

if ($requestId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'No requestId provided']);
    exit;
}

$pidFile = "$PID_DIR/$requestId.pid";
if (!file_exists($pidFile)) {
    echo json_encode(['aborted' => false, 'message' => 'No running process for that requestId']);
    exit;
}

$pid = (int)trim(file_get_contents($pidFile));
if ($pid <= 0) {
    echo json_encode(['aborted' => false, 'message' => 'Invalid PID in file']);
    exit;
}

// Kill the whole process group (negative PID means PGID).
// The verify.php wrapper uses setsid, so PID == PGID.
if (function_exists('posix_kill')) {
    $ok = posix_kill(-$pid, 9) || posix_kill($pid, 9);
} else {
    exec('kill -9 -' . escapeshellarg($pid) . ' 2>/dev/null', $o1, $r1);
    $ok = ($r1 === 0);
    if (!$ok) {
        exec('kill -9 ' . escapeshellarg($pid) . ' 2>/dev/null', $o2, $r2);
        $ok = ($r2 === 0);
    }
}

@unlink($pidFile);
echo json_encode(['aborted' => (bool)$ok]);
