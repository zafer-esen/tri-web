<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config.php';

$id = preg_replace('/[^a-f0-9]/', '', $_GET['id'] ?? '');
if (!$id) {
    http_response_code(400);
    echo json_encode(['error' => 'No ID provided']);
    exit;
}

$file = "$SHARE_DIR/$id.json";
if (!file_exists($file)) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found']);
    exit;
}

readfile($file);
