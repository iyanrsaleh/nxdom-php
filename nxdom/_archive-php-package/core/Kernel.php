<?php

namespace Nxdom\Core;

final class Kernel
{
    /**
     * Pola nama file NxDom yang tidak boleh pernah diserve mentah,
     * terlepas dari method, app context, atau apakah route lain cocok.
     * Wajib dicek paling awal di setiap entry point (bootstrap.php & router.php).
     * Lihat Plan.md Bagian 2 poin 4.
     */
    private const PROTECTED_FILENAME_PATTERN = '/^nxdom\.[a-z]+\.json$/i';

    public static function isProtectedPath(string $path): bool
    {
        $basename = basename(parse_url($path, PHP_URL_PATH) ?? $path);
        return (bool) preg_match(self::PROTECTED_FILENAME_PATTERN, $basename);
    }

    /**
     * Titik masuk tunggal, dipanggil dari bootstrap.php (auto_prepend_file)
     * maupun router.php (php -S). Return true jika request sudah ditangani
     * habis (caller harus stop), false jika caller boleh lanjut serve file
     * statis seperti biasa.
     */
    public static function handle(string $documentRoot, string $requestUri): bool
    {
        $path = parse_url($requestUri, PHP_URL_PATH) ?? '/';

        if (self::isProtectedPath($path)) {
            http_response_code(403);
            header('Content-Type: text/plain');
            echo "403 Forbidden\n";
            return true;
        }

        $appContext = self::resolveApp($documentRoot);
        if ($appContext === null) {
            // Tidak ada nxdom.config.json ditemukan — bukan app NxDom,
            // biarkan file statis diserve seperti biasa.
            return false;
        }

        if (strpos($path, '/api/') !== 0) {
            return false;
        }

        $manifest = $appContext->loadManifest();
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

        $match = Router::match($manifest['routes'] ?? [], $method, $path);
        if ($match === null) {
            http_response_code(404);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Route not found']);
            return true;
        }

        Router::dispatch($appContext, $match['route'], $match['params']);
        return true;
    }

    /**
     * Resolve AppContext dari document root request saat ini. Untuk M1,
     * dicari langsung di documentRoot — belum ada strategi multi-tenant
     * bertingkat (lihat Plan.md Bagian 3, akan diperluas saat dibutuhkan
     * lebih dari satu app per document root).
     */
    public static function resolveApp(string $documentRoot): ?AppContext
    {
        return AppContext::fromDirectory($documentRoot);
    }
}
