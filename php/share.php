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
    http_response_code(400);
    echo json_encode(['error' => 'No code provided']);
    exit;
}

if (!is_dir($SHARE_DIR)) mkdir($SHARE_DIR, 0700, true);

$id = bin2hex(random_bytes(8));
$data = [
    'code' => $input['code'],
    'options' => $input['options'] ?? [],
    'created' => time(),
];

file_put_contents("$SHARE_DIR/$id.json", json_encode($data));
echo json_encode(['id' => $id]);
