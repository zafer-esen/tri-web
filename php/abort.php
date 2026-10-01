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
$requestId = $input['requestId'] ?? '';
$requestId = preg_replace('/[^a-zA-Z0-9_-]/', '', $requestId);

if ($requestId === '') {
    http_response_code(400);
    echo json_encode(['error' => 'No requestId provided']);
    exit;
}

$metaFile = "$RESULT_DIR/$requestId.meta";
if (!file_exists($metaFile) || file_exists("$RESULT_DIR/$requestId.done")) {
    echo json_encode(['aborted' => false, 'message' => 'No running process for that requestId']);
    exit;
}

// Mark first: the worker may still be starting and checks this before exec.
file_put_contents("$RESULT_DIR/$requestId.abort", '1');
signalJob($requestId, 9);
echo json_encode(['aborted' => true]);
