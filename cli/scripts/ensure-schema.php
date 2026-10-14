<?php
/**
 * nxdom-php build/dev — auto-generate schema minimal.
 *
 * Dipanggil sebagai proses PHP terpisah oleh cli/src/build.js SETELAH
 * compiler menulis nxdom.manifest.json (Plan_01.md poin 2). Tujuannya
 * SEMPIT dan sengaja terbatas: memastikan app hasil `nxdom-php create`
 * bisa langsung di-GET/POST tanpa developer menulis SQL manual dulu —
 * BUKAN migration system (tidak ada versioning/rollback/alter table).
 *
 * Sumber kolom per tabel:
 *   - union semua `constraints.fillable` dari seluruh route manifest
 *     yang resource-nya sama (lihat compiler M6 — fillable sudah
 *     digabung compiler dari nxdom.policy.json, bukan ditebak di sini).
 *   - kalau tabel itu juga jadi tabel auth (nxdom.config.json auth.table,
 *     default "users"), tambahkan kolom auth.identifier + auth.passwordColumn
 *     WALAU tidak muncul di fillable manapun — register/login butuh
 *     kolom itu ada meski route auth sendiri tidak punya constraints.fillable.
 *   - resource "auth" itu sendiri BUKAN nama tabel (itu route khusus,
 *     bukan resource nxdom.db()) — dilewati, tidak dibuatkan tabel.
 *
 * Semua kolom bertipe TEXT (SQLite dynamic typing, cukup untuk starting
 * point) kecuali `id` (INTEGER PRIMARY KEY) dan `created_at` (DATETIME
 * DEFAULT CURRENT_TIMESTAMP) yang selalu ditambahkan ke setiap tabel.
 * CREATE TABLE IF NOT EXISTS — tabel yang sudah ada (kolom sudah
 * disesuaikan manual oleh developer) TIDAK disentuh sama sekali, hanya
 * dibuat kalau benar-benar belum ada.
 *
 * Hanya driver sqlite yang didukung untuk auto-generate ini (paling
 * umum dipakai scaffold/dev) — driver lain (mysql/pgsql) dilewati diam-
 * diam dengan pesan info, developer diasumsikan mengelola schema sendiri
 * untuk database server yang sudah ada.
 */

[$appDir] = array_slice($argv, 1) + [null];
if (!$appDir || !is_dir($appDir)) {
    fwrite(STDERR, "Usage: php ensure-schema.php <app-dir>\n");
    exit(1);
}

$configPath = $appDir . DIRECTORY_SEPARATOR . 'nxdom.config.json';
$manifestPath = $appDir . DIRECTORY_SEPARATOR . 'nxdom.manifest.json';

if (!is_file($configPath) || !is_file($manifestPath)) {
    // Belum ada config/manifest — bukan error, biarkan alur build normal yang menangani.
    exit(0);
}

$config = json_decode(file_get_contents($configPath), true);
$manifest = json_decode(file_get_contents($manifestPath), true);

if (!is_array($config) || !is_array($manifest)) {
    fwrite(STDERR, "ensure-schema: nxdom.config.json atau nxdom.manifest.json tidak valid JSON.\n");
    exit(1);
}

$driver = $config['database']['driver'] ?? null;
if ($driver !== 'sqlite') {
    // mysql/pgsql: developer diasumsikan sudah punya schema di server DB yang ada.
    exit(0);
}

$authTable = $config['auth']['table'] ?? 'users';
$authIdentifier = $config['auth']['identifier'] ?? null;
$authPasswordColumn = $config['auth']['passwordColumn'] ?? null;

$fillableByResource = [];
foreach ($manifest['routes'] ?? [] as $route) {
    $resource = $route['resource'] ?? null;
    if (!$resource || $resource === 'auth') {
        continue;
    }
    $fillable = $route['constraints']['fillable'] ?? [];
    $fillableByResource[$resource] = array_unique(array_merge($fillableByResource[$resource] ?? [], $fillable));
}

if (isset($config['auth']) && ($authIdentifier || $authPasswordColumn)) {
    $authColumns = array_filter([$authIdentifier, $authPasswordColumn]);
    $fillableByResource[$authTable] = array_unique(array_merge($fillableByResource[$authTable] ?? [], $authColumns));
}

if (!$fillableByResource) {
    exit(0);
}

$sqlitePath = $config['database']['path'] ?? 'storage/db.sqlite';
$absoluteSqlitePath = preg_match('#^([a-zA-Z]:[\\\\/]|/)#', $sqlitePath)
    ? $sqlitePath
    : $appDir . DIRECTORY_SEPARATOR . $sqlitePath;

$dir = dirname($absoluteSqlitePath);
if (!is_dir($dir)) {
    mkdir($dir, 0777, true);
}

$pdo = new PDO('sqlite:' . $absoluteSqlitePath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);

$identifierPattern = '/^[a-zA-Z_][a-zA-Z0-9_]*$/';

foreach ($fillableByResource as $table => $columns) {
    if (!preg_match($identifierPattern, $table)) {
        fwrite(STDERR, "ensure-schema: nama tabel tidak valid, dilewati: {$table}\n");
        continue;
    }

    $exists = $pdo->query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=" . $pdo->quote($table)
    )->fetch();
    if ($exists) {
        continue;
    }

    $columnDefs = ['id INTEGER PRIMARY KEY AUTOINCREMENT'];
    foreach ($columns as $column) {
        if (!preg_match($identifierPattern, $column) || $column === 'id') {
            continue;
        }
        $columnDefs[] = "\"{$column}\" TEXT";
    }
    $columnDefs[] = 'created_at DATETIME DEFAULT CURRENT_TIMESTAMP';

    $sql = "CREATE TABLE \"{$table}\" (" . implode(', ', $columnDefs) . ')';
    $pdo->exec($sql);
    fwrite(STDOUT, "OK: tabel '{$table}' dibuat ({$absoluteSqlitePath})\n");
}
