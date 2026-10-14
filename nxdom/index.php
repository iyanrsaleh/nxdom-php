<?php

/**
 * Front controller GLOBAL NxDom — dipasang SEKALI di level server (bukan
 * per-app), dipakai bersama semua aplikasi NxDom di server ini.
 *
 * Aplikasi TIDAK membawa salinan file ini (README §6/§33/§35): webroot app
 * hanya berisi aset (index.html/app.js/style.css/assets) + konfigurasi
 * NxDom (nxdom.config.json/.manifest.json/.policy.json). Rewrite generik
 * di tiap vhost mengarahkan path tanpa file fisik (/api/*) ke sini.
 *
 * Isi file ini sengaja seminimal mungkin: seluruh logic (Kernel/Router/
 * Database/Auth) ada di native extension (nxdom_dispatch()).
 */
if (function_exists('nxdom_dispatch') && nxdom_dispatch()) {
    exit;
}

/**
 * SPA fallback: path non-/api/* yang sampai ke sini berarti route
 * client-side tanpa file fisik — serve index.html milik APP sedangkan
 * /api/* yang tidak match manifest tetap 404 JSON.
 */
$requestPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
if (strncmp($requestPath, '/api/', 5) !== 0) {
    $indexHtml = $_SERVER['DOCUMENT_ROOT'] . '/index.html';
    if (is_file($indexHtml)) {
        header('Content-Type: text/html; charset=utf-8');
        readfile($indexHtml);
        exit;
    }
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Not found']);
