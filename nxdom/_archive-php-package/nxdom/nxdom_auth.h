/* Auth — port dari nxdom/core/Auth.php (PHP, referensi asli).
 *
 * REVISI (Plan.md 0D): percobaan pertama memakai PS(...) macro (API
 * "native" ext/session) menyebabkan SEGFAULT — ps_globals_id yang
 * dipakai macro itu tidak diekspor untuk extension eksternal. Solusi
 * final: session_start()/session_name()/session_destroy()/
 * session_regenerate_id() SEMUA userland call (nxdom_call.h), dan
 * $_SESSION dibaca/ditulis lewat EG(symbol_table) (cara resmi PHP
 * sendiri menyimpan superglobal, lihat nxdom_auth.c). */

#ifndef NXDOM_AUTH_H
#define NXDOM_AUTH_H

#include "php.h"
#include "nxdom_app_context.h"

/* Semua fungsi berikut mengasumsikan pdo sudah terkoneksi (lihat
 * nxdom_database.h) dan app->auth berisi table/identifier/passwordColumn
 * (divalidasi requireAuthConfig()-setara di dalamnya). Return SUCCESS/
 * FAILURE — FAILURE berarti AuthException-setara: out_status diisi kode
 * HTTP, out_message diisi pesan (dimiliki caller, zend_string_release
 * setelah selesai). */

zend_result nxdom_auth_register(
	nxdom_app_context *ctx, zval *pdo, zval *body,
	zval *out_result, int *out_status, zend_string **out_message
);

zend_result nxdom_auth_login(
	nxdom_app_context *ctx, zval *pdo, zval *body,
	zval *out_result, int *out_status, zend_string **out_message
);

/* ctx dibutuhkan supaya session_name() dipanggil dengan nama yang SAMA
 * seperti dipakai login()/me()/isAuthenticated() ("nxdom_{app->id}") —
 * bug nyata ditemukan saat pengujian: memanggil session_start() tanpa
 * session_name() dulu beroperasi pada session PHPSESSID default, bukan
 * session NxDom yang sedang aktif, sehingga logout tidak benar-benar
 * menghapus status login (isAuthenticated() tetap true setelahnya). */
void nxdom_auth_logout(nxdom_app_context *ctx);

/* out_user diisi NULL (ZVAL_NULL) kalau belum login / user tidak
 * ditemukan lagi di DB — bukan FAILURE, sama seperti Auth::me() PHP
 * return null (bukan exception). */
zend_result nxdom_auth_me(nxdom_app_context *ctx, zval *pdo, zval *out_user);

zend_bool nxdom_auth_is_authenticated(nxdom_app_context *ctx);

#endif
