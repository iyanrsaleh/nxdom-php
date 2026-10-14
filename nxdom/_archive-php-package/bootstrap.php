<?php

/**
 * Entry point untuk Apache/Nginx via auto_prepend_file.
 * Lihat Plan.md Bagian 2. Kernel::handle() adalah titik logika bersama
 * dengan router.php (untuk php -S) — jaga keduanya tetap setara.
 */

require __DIR__ . '/autoload.php';

use Nxdom\Core\Kernel;

$documentRoot = $_SERVER['DOCUMENT_ROOT'] ?? getcwd();
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';

if (Kernel::handle($documentRoot, $requestUri)) {
    exit;
}

// Tidak ditangani NxDom (bukan route /api/, bukan file terproteksi) —
// biarkan PHP/Apache lanjut memproses file yang diminta seperti biasa.
