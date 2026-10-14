<?php

/**
 * Front controller untuk Apache/Nginx + mod_rewrite (produksi, README §17).
 *
 * BERBEDA dari bootstrap.php (auto_prepend_file): auto_prepend_file hanya
 * tereksekusi saat Apache MEMILIH untuk menjalankan PHP untuk request itu —
 * yang hanya terjadi bila ada file .php fisik yang cocok. Untuk request ke
 * path tanpa file fisik (mis. /api/users) atau ke file non-.php (mis.
 * nxdom.config.json yang di-serve mentah sebagai static file), PHP —
 * dan karenanya auto_prepend_file — TIDAK PERNAH terpanggil sama sekali.
 * Ini ditemukan sebagai kebocoran kredensial nyata saat pengujian Apache
 * sungguhan pertama kali (lihat Plan.md).
 *
 * Solusi: mod_rewrite mengarahkan SEMUA request yang bukan file/direktori
 * fisik ke front controller ini (lihat .htaccess / vhost RewriteRule),
 * yang memanggil Kernel::handle() secara eksplisit — sama seperti
 * router.php untuk php -S. auto_prepend_file tetap dipasang sebagai lapis
 * tambahan (mis. untuk kasus lain di masa depan), tapi front controller
 * inilah yang menjamin Kernel selalu dilewati untuk request non-file.
 */

require __DIR__ . '/autoload.php';

use Nxdom\Core\Kernel;

$documentRoot = $_SERVER['DOCUMENT_ROOT'];
$requestUri = $_SERVER['REQUEST_URI'];

if (Kernel::handle($documentRoot, $requestUri)) {
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Not found']);
