<?php

/**
 * Setup tabel + data contoh untuk uji M2 (Database Layer) pada app demo.
 * Usage: php scripts/seed-demo.php
 */

require __DIR__ . '/../nxdom/autoload.php';

use Nxdom\Core\AppContext;
use Nxdom\Core\Database;

$appDir = __DIR__ . '/../examples/demo';
$app = AppContext::fromDirectory($appDir);
if (!$app) {
    fwrite(STDERR, "Gagal resolve AppContext dari $appDir\n");
    exit(1);
}

$db = new Database($app);
$pdo = $db->pdo();

$pdo->exec('DROP TABLE IF EXISTS users');
$pdo->exec('
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
');

$db->table('users')->insert(['name' => 'Ayu', 'email' => 'ayu@example.com', 'active' => 1]);
$db->table('users')->insert(['name' => 'Budi', 'email' => 'budi@example.com', 'active' => 1]);
$db->table('users')->insert(['name' => 'Citra', 'email' => 'citra@example.com', 'active' => 0]);

echo "OK: seed selesai, " . count($db->table('users')->get()) . " baris di tabel users\n";
