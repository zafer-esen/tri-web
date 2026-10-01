<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/functions.php';
configureToolEnvironment();

$version = null;
$encodings = [];
if (is_executable($TRICERA_PATH)) {
    $command = 'timeout --signal=KILL 5 ' . escapeshellarg($TRICERA_PATH);
    $out = shell_exec($command . ' --version 2>/dev/null');
    if ($out) $version = trim($out);
    exec($command . ' --help 2>/dev/null', $helpLines, $exitCode);
    if ($exitCode === 0) $encodings = parseInvariantEncodings(implode("\n", $helpLines));
}

echo json_encode([
    'version' => $version,
    'maxTimeout' => $MAX_TIMEOUT,
    'invariantEncodings' => $encodings,
]);
