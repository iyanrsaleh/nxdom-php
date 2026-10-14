/* AppContext — port dari nxdom/core/AppContext.php (PHP, referensi asli).
 * Representasi C untuk config satu aplikasi NxDom (nxdom.config.json).
 *
 * database/auth tetap disimpan sebagai zval (HashTable PHP) alih-alih
 * struct C kaku — field-nya bervariasi tergantung driver (sqlite/mysql/
 * pgsql) dan opsional (auth), memaksakan struct fixed-field di sini hanya
 * akan menduplikasi skema yang sudah didefinisikan di
 * nxdom/config/config.schema.json tanpa manfaat nyata.
 */

#ifndef NXDOM_APP_CONTEXT_H
#define NXDOM_APP_CONTEXT_H

#include "php.h"

typedef struct _nxdom_app_context {
	zend_string *id;
	zend_string *base_path;
	zval database;   /* array, dari config['database'] */
	zval auth;        /* array, dari config['auth'] ?? [] */
	zend_string *storage_path;
} nxdom_app_context;

/* Return NULL kalau nxdom.config.json tidak ada / tidak valid — sama
 * seperti AppContext::fromDirectory() PHP mengembalikan null. Caller
 * bertanggung jawab memanggil nxdom_app_context_free() setelah selesai. */
nxdom_app_context *nxdom_app_context_from_directory(const char *base_path);

void nxdom_app_context_free(nxdom_app_context *ctx);

/* Baca nxdom.manifest.json di basePath milik ctx. Return array kosong
 * {"version":1,"routes":[]} kalau file tidak ada/tidak valid — caller
 * memiliki zval hasil (harus zval_ptr_dtor setelah selesai). */
void nxdom_app_context_load_manifest(nxdom_app_context *ctx, zval *out_manifest);

#endif
