<?php
/**
 * Validator minimal untuk nxdom.manifest.json dan nxdom.config.json (M0).
 * Tanpa dependency eksternal — cek struktural sesuai nxdom/config/*.schema.json.
 * Bukan validator JSON Schema generik; akan diganti/ditambah saat compiler (M6) dibangun.
 *
 * Usage: php scripts/validate-manifest.php <path-ke-folder-app>
 */

function fail(string $msg): void
{
    fwrite(STDERR, "FAIL: $msg\n");
    exit(1);
}

function readJson(string $path): array
{
    if (!is_file($path)) {
        fail("File tidak ditemukan: $path");
    }
    $raw = file_get_contents($path);
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        fail("JSON tidak valid di $path: " . json_last_error_msg());
    }
    return $data;
}

function validateConfig(array $config, string $file): array
{
    $errors = [];

    if (!isset($config['id']) || !preg_match('/^[a-z][a-z0-9_-]*$/', $config['id'])) {
        $errors[] = "$file: 'id' wajib ada dan match pola slug lowercase";
    }
    if (!isset($config['database']['driver']) || !in_array($config['database']['driver'], ['sqlite', 'mysql', 'pgsql'], true)) {
        $errors[] = "$file: 'database.driver' wajib salah satu dari sqlite/mysql/pgsql";
    }

    return $errors;
}

function validateManifest(array $manifest, string $file): array
{
    $errors = [];

    if (($manifest['version'] ?? null) !== 1) {
        $errors[] = "$file: 'version' wajib bernilai 1";
    }

    $validMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    $validActions = ['query', 'get', 'create', 'update', 'delete', 'login', 'logout', 'register', 'me', 'outside', 'page'];
    $paramRequiredActions = ['get', 'update', 'delete'];

    foreach (($manifest['routes'] ?? []) as $i => $route) {
        $ctx = "$file: routes[$i]";
        $action = $route['action'] ?? null;

        foreach (['method', 'path', 'action'] as $req) {
            if (!isset($route[$req])) {
                $errors[] = "$ctx: field '$req' wajib ada";
            }
        }

        // action "page" tidak butuh 'resource' (bukan operasi tabel).
        if ($action !== 'page' && !isset($route['resource'])) {
            $errors[] = "$ctx: field 'resource' wajib ada";
        }

        if (isset($route['method']) && !in_array($route['method'], $validMethods, true)) {
            $errors[] = "$ctx: method '{$route['method']}' tidak valid";
        }

        // Path: /api/* untuk action API; path lain hanya valid untuk "page".
        // Segmen terakhir '*' = prefix match, hanya boleh untuk action "page".
        if (isset($route['path'])) {
            $isApiPath = strpos($route['path'], '/api/') === 0;
            $isPrefix = substr($route['path'], -2) === '/*';
            if ($isPrefix && $action !== 'page') {
                $errors[] = "$ctx: path prefix '/*' hanya valid untuk action 'page'";
            }
            if (!$isApiPath && $action !== 'page') {
                $errors[] = "$ctx: path non-/api/ ('{$route['path']}') hanya valid untuk action 'page'";
            }
        }

        if (isset($route['action']) && !in_array($route['action'], $validActions, true)) {
            $errors[] = "$ctx: action '{$route['action']}' tidak dikenal";
        }

        if ($action === 'page') {
            if (empty($route['page']) || !preg_match('/^[a-zA-Z0-9_]+$/', (string) $route['page'])) {
                $errors[] = "$ctx: action 'page' wajib punya field 'page' (identifier sederhana, tanpa ekstensi)";
            }
        }

        if (isset($route['action']) && in_array($route['action'], $paramRequiredActions, true)) {
            if (empty($route['params'])) {
                $errors[] = "$ctx: action '{$route['action']}' wajib punya 'params' non-kosong";
            }
        }

        if (isset($route['constraints']['where'])) {
            foreach ($route['constraints']['where'] as $j => $cond) {
                if (!is_array($cond) || count($cond) !== 3) {
                    $errors[] = "$ctx: constraints.where[$j] harus array 3 elemen [kolom, operator, nilai]";
                }
            }
        }
    }

    return $errors;
}

$dir = $argv[1] ?? null;
if (!$dir || !is_dir($dir)) {
    fail("Usage: php validate-manifest.php <path-ke-folder-app>");
}

$configPath = rtrim($dir, '/\\') . '/nxdom.config.json';
$manifestPath = rtrim($dir, '/\\') . '/nxdom.manifest.json';

$config = readJson($configPath);
$manifest = readJson($manifestPath);

$errors = array_merge(
    validateConfig($config, $configPath),
    validateManifest($manifest, $manifestPath)
);

if ($errors) {
    foreach ($errors as $e) {
        fwrite(STDERR, "FAIL: $e\n");
    }
    exit(1);
}

echo "OK: config dan manifest valid ($dir)\n";
