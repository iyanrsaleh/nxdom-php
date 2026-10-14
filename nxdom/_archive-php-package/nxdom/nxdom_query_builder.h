/* QueryBuilder — port dari nxdom/core/QueryBuilder.php (PHP, referensi
 * asli). Builder pattern: where()/orderBy()/limit() memodifikasi state,
 * get()/find()/insert()/update()/delete() mengeksekusi via PDO (dipanggil
 * userland lewat nxdom_call.h, bukan driver SQL ditulis ulang di C).
 */

#ifndef NXDOM_QUERY_BUILDER_H
#define NXDOM_QUERY_BUILDER_H

#include "php.h"

typedef struct _nxdom_query_builder {
	zval pdo;                /* objek PDO, tidak dimiliki (borrowed dari Database) */
	zend_string *table;
	zval wheres;              /* array of [column, operator, value] */
	zval order_by;            /* array of "column DIRECTION" string */
	zend_bool has_limit;
	zend_long limit;
} nxdom_query_builder;

/* Return NULL kalau nama tabel tidak valid (regex ^[a-zA-Z_][a-zA-Z0-9_]*$,
 * sama seperti QueryBuilder::__construct() PHP) — exception TIDAK
 * dilempar di sini, caller (Router) yang memutuskan bagaimana melapor
 * error ini sebagai response. pdo TIDAK di-copy/addref oleh fungsi ini,
 * caller harus menjaga pdo tetap hidup selama qb dipakai. */
nxdom_query_builder *nxdom_qb_create(zval *pdo, const char *table);
void nxdom_qb_free(nxdom_query_builder *qb);

/* Return SUCCESS/FAILURE (FAILURE = operator/kolom tidak valid, exception
 * NXDOM_QB_INVALID_ARGUMENT sudah "dilempar" secara konvensi: caller cek
 * nxdom_qb_last_error(qb) untuk pesannya). */
zend_result nxdom_qb_where(nxdom_query_builder *qb, const char *column, const char *op, zval *value);
zend_result nxdom_qb_apply_constraints(nxdom_query_builder *qb, zval *constraints);
zend_result nxdom_qb_order_by(nxdom_query_builder *qb, const char *column, const char *direction);
zend_result nxdom_qb_replace_order_by(nxdom_query_builder *qb, const char *column, const char *direction);
void nxdom_qb_limit(nxdom_query_builder *qb, zend_long limit);

/* Pesan error tervalidasi terakhir (nama kolom/operator/tabel tidak
 * valid) — NULL kalau tidak ada error. Dimiliki qb, jangan di-free. */
const char *nxdom_qb_last_error(nxdom_query_builder *qb);

/* Operasi eksekusi. out_result diisi sesuai method (get→array of array,
 * find→array atau null, insert→string id, update/delete→long rowCount).
 * Return SUCCESS/FAILURE — FAILURE dengan EG(exception) set berarti
 * PDOException (caller catch sebagai 500), FAILURE tanpa EG(exception)
 * berarti validasi (cek nxdom_qb_last_error). */
zend_result nxdom_qb_get(nxdom_query_builder *qb, zval *out_result);
zend_result nxdom_qb_find(nxdom_query_builder *qb, zval *id, const char *key, zval *out_result);
zend_result nxdom_qb_insert(nxdom_query_builder *qb, zval *data, zval *out_id);
zend_result nxdom_qb_update(nxdom_query_builder *qb, zval *data, zend_long *out_affected);
zend_result nxdom_qb_delete(nxdom_query_builder *qb, zend_long *out_affected);

#endif
