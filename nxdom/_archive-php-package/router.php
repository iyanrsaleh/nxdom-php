<?php

/**
 * Entry point untuk PHP built-in server: php -S host:port nxdom/router.php
 * Lihat Plan.md Bagian 2. Memanggil Kernel::handle() yang sama dengan
 * bootstrap.php agar perilaku dev server dan Apache/Nginx tetap setara.
 */

require __DIR__ . '/autoload.php';

use Nxdom\Core\Kernel;

$documentRoot = $_SERVER['DOCUMENT_ROOT'];
$requestUri = $_SERVER['REQUEST_URI'];
$path = parse_url($requestUri, PHP_URL_PATH) ?? '/';

if (Kernel::handle($documentRoot, $requestUri)) {
    return true;
}

// File statis: biarkan built-in server men-serve-nya sendiri jika ada,
// selain itu 404.
$file = rtrim($documentRoot, '/\\') . $path;
if ($path !== '/' && is_file($file)) {
    return false;
}

return false;
