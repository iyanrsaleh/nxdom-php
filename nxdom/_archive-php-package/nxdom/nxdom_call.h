/* Helper generik memanggil method PHP userland dari C dengan jumlah
 * argumen bebas — dipakai untuk memanggil PDO/PDOStatement (Database,
 * QueryBuilder) dan password_hash/session_* (Auth) tanpa menulis ulang
 * driver database/hashing/session dari nol (semuanya sudah C extension
 * matang bawaan PHP, cukup dipanggil).
 */

#ifndef NXDOM_CALL_H
#define NXDOM_CALL_H

#include "php.h"

/* Panggil $object->$method_name(...$argv). Return SUCCESS/FAILURE
 * (FAILURE juga kalau exception PHP terlempar selama pemanggilan — cek
 * EG(exception) di caller). out_retval diisi return value (caller harus
 * zval_ptr_dtor kalau tidak butuh) — boleh NULL kalau return value
 * diabaikan. */
zend_result nxdom_call_method(
	zval *object, const char *method_name,
	uint32_t argc, zval *argv, zval *out_retval
);

/* Panggil fungsi global by name (mis. "json_decode", "password_hash").
 * Sama seperti nxdom_call_method tapi tanpa $object. */
zend_result nxdom_call_function(
	const char *function_name,
	uint32_t argc, zval *argv, zval *out_retval
);

/* Instantiate class by name dan panggil constructor-nya dengan argv.
 * Return SUCCESS + out_object diisi (refcount dimiliki caller, harus
 * zval_ptr_dtor) kalau berhasil; FAILURE kalau class tidak ada atau
 * constructor melempar exception (cek EG(exception)). */
zend_result nxdom_new_object(
	const char *class_name,
	uint32_t argc, zval *argv, zval *out_object
);

/* Baca seluruh isi file (atau stream wrapper apa pun, termasuk
 * "php://input") ke zend_string via php_stream — sama seperti
 * file_get_contents() PHP. NULL kalau tidak bisa dibuka. Caller harus
 * zend_string_release setelah selesai. */
zend_string *nxdom_read_file(const char *path);

#endif
