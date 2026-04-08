<?php
// TriCera web interface configuration
// To override settings locally, create config.local.php in this directory.
// That file is gitignored and will not be overwritten by git pull.

$TRICERA_PATH = getenv('TRICERA_PATH') ?: '/path/to/tri';
$MAX_TIMEOUT = 60;          // max user-requested timeout (seconds)
$HARD_TIMEOUT = 65;         // hard kill (slightly above MAX_TIMEOUT for cleanup)
$MAX_CODE_SIZE = 50000;     // bytes
$SHARE_DIR = __DIR__ . '/../shares';
$LOG_DIR = __DIR__ . '/../log';
$MAX_LOG_SIZE_MB = 50;      // rotate log when it exceeds this size
$NICE_LEVEL = 19;           // lowest priority
$MEM_LIMIT_MB = 2048;       // heap data limit for TriCera process (--data, not --as)

// Allowed argument patterns (security whitelist)
$ALLOWED_ARG_PATTERN = '/^-(?:arithMode:[a-z0-9]+|t:\d+|m:\w+|heapModel:[a-z]+|log:\d+'
    . '|cex|acsl|f|printPP|p|pDot|dotCEX|pngNo'
    . '|reachsafety|memsafety|valid-deref|valid-free'
    . '|valid-memtrack|valid-memcleanup|splitProperties'
    . '|cpp|cppLight|noPP'
    . '|inv|sol|ssol)$/';

// Load local overrides if present (gitignored)
$localConfig = __DIR__ . '/config.local.php';
if (file_exists($localConfig)) {
    require $localConfig;
}
