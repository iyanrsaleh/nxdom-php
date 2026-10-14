<?php

/**
 * Uji manual M2 (Database Layer) terhadap app demo + SQLite.
 * Usage: php scripts/test-database.php
 */

require __DIR__ . '/../nxdom/autoload.php';

use Nxdom\Core\AppContext;
use Nxdom\Core\Database;

function assertTrue(bool $cond, string $label): void
{
    echo ($cond ? "OK  " : "FAIL") . " - $label\n";
    if (!$cond) {
        exit(1);
    }
}

$app = AppContext::fromDirectory(__DIR__ . '/../examples/demo');
$db = new Database($app);

// 1. query dengan constraints manifest /api/users
$manifest = $app->loadManifest();
$listRoute = array_values(array_filter($manifest['routes'], fn ($r) => $r['action'] === 'query'))[0];

$rows = $db->table($listRoute['resource'])
    ->applyConstraints($listRoute['constraints'])
    ->get();

assertTrue(count($rows) === 2, 'query aktif=true, orderBy, limit -> 2 baris (Ayu, Budi)');
// created_at bisa identik antar baris (presisi detik SQLite) saat seed
// berjalan cepat, jadi urutan ORDER BY created_at DESC saja tidak
// deterministik di uji ini — cek keanggotaan set, bukan urutan pasti.
assertTrue(
    in_array($rows[0]['name'], ['Ayu', 'Budi'], true) && in_array($rows[1]['name'], ['Ayu', 'Budi'], true),
    'orderBy+limit mengembalikan tepat {Ayu, Budi} (Citra ter-filter active=false)'
);

// 2. find (mensimulasikan action=get, params.id)
$one = $db->table('users')->find(1);
assertTrue($one !== null && $one['name'] === 'Ayu', 'find(1) -> Ayu');

$missing = $db->table('users')->find(999);
assertTrue($missing === null, 'find(999) -> null');

// 3. insert (mensimulasikan action=create dengan fillable)
$newId = $db->table('users')->insert(['name' => 'Dewi', 'email' => 'dewi@example.com', 'active' => 1]);
assertTrue((int) $newId === 4, 'insert -> id baru = 4');

// 4. update (mensimulasikan action=update, params.id)
$affected = $db->table('users')->where('id', '=', 4)->update(['name' => 'Dewi Updated']);
assertTrue($affected === 1, 'update where id=4 -> 1 baris terpengaruh');
assertTrue($db->table('users')->find(4)['name'] === 'Dewi Updated', 'nilai ter-update benar');

// 5. delete (mensimulasikan action=delete, params.id)
$deleted = $db->table('users')->where('id', '=', 4)->delete();
assertTrue($deleted === 1, 'delete where id=4 -> 1 baris terhapus');
assertTrue($db->table('users')->find(4) === null, 'baris id=4 sudah tidak ada');

// 6. proteksi dasar: operator/kolom tidak valid ditolak
try {
    $db->table('users')->where('id', 'DROP TABLE', 1);
    assertTrue(false, 'operator ilegal harus melempar exception');
} catch (\InvalidArgumentException $e) {
    assertTrue(true, 'operator ilegal ditolak dengan InvalidArgumentException');
}

echo "\nSemua uji M2 lolos.\n";
