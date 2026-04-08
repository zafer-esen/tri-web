<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config.php';

// Detect TriCera version
$version = null;
if (is_executable($TRICERA_PATH)) {
    $out = shell_exec(escapeshellarg($TRICERA_PATH) . ' --version 2>&1');
    if ($out) $version = trim($out);
}

echo json_encode([
    'version' => $version,
    'maxTimeout' => $MAX_TIMEOUT,
]);
