/* Database — port dari nxdom/core/Database.php (PHP, referensi asli).
 *
 * Alih-alih menulis driver database dari nol, kita INSTANTIATE kelas PDO
 * userland PHP (via nxdom_new_object) dan panggil method-nya (prepare/
 * execute/fetchAll/dst.) via nxdom_call_method — PDO sendiri sudah C
 * extension matang dan battle-tested, port ulang driver SQL dari nol
 * hanya menambah risiko tanpa manfaat.
 */

#ifndef NXDOM_DATABASE_H
#define NXDOM_DATABASE_H

#include "php.h"

/* Bangun objek PDO baru dari config['database'] (array zval, field
 * 'driver'/'path'/'host'/'port'/'name'/'user'/'password', sama seperti
 * Database::connect() PHP). base_path dipakai untuk resolve path SQLite
 * relatif. Return SUCCESS + out_pdo diisi (owned oleh caller) atau
 * FAILURE (driver tidak dikenal, atau PDO melempar exception koneksi —
 * exception TETAP ada di EG(exception), caller meneruskannya sebagai
 * error 500 seperti PDOException catch di Router.php). */
zend_result nxdom_database_connect(zval *database_config, const char *base_path, zval *out_pdo);

#endif
