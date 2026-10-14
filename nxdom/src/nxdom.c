/* NxDom native extension — skeleton pertama.
 *
 * Tujuan: membuktikan toolchain build (MSVC v142 + PHP SDK + php-src
 * 8.1.31) menghasilkan .dll yang benar-benar bisa di-load PHP 8.1.31 di
 * server rujukan (C:\Tnserver\bin\php), sebelum logika Kernel/Router/
 * Database/Auth (referensi: nxdom/core/*.php di root repo, dibangun M1-M7
 * sebagai PHP package) dipindahkan/ditulis ulang ke C.
 *
 * Lihat Plan.md Bagian 0/0B untuk riwayat kenapa native extension dipilih.
 */

#ifdef HAVE_CONFIG_H
# include "config.h"
#endif

#include "php.h"
#include "SAPI.h"
#include "Zend/zend_exceptions.h"
#include "ext/standard/info.h"
#include "php_nxdom.h"
#include "nxdom_arginfo.h"
#include "nxdom_app_context.h"
#include "nxdom_response.h"
#include "nxdom_router.h"
#include "nxdom_database.h"
#include "nxdom_query_builder.h"
#include "nxdom_auth.h"
#include "nxdom_kernel.h"
#include "nxdom_call.h"

#ifndef ZEND_PARSE_PARAMETERS_NONE
#define ZEND_PARSE_PARAMETERS_NONE() \
	ZEND_PARSE_PARAMETERS_START(0, 0) \
	ZEND_PARSE_PARAMETERS_END()
#endif

/* {{{ string nxdom_version() */
PHP_FUNCTION(nxdom_version)
{
	ZEND_PARSE_PARAMETERS_NONE();

	RETURN_STRING(PHP_NXDOM_VERSION);
}
/* }}} */

/* {{{ array|null nxdom_debug_app_context(string $basePath)
 * Uji manual porting AppContext ke C (Plan.md 0D) — bukan API final. */
PHP_FUNCTION(nxdom_debug_app_context)
{
	char *base_path;
	size_t base_path_len;

	ZEND_PARSE_PARAMETERS_START(1, 1)
		Z_PARAM_STRING(base_path, base_path_len)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx = nxdom_app_context_from_directory(base_path);
	if (!ctx) {
		RETURN_NULL();
	}

	array_init(return_value);
	add_assoc_str(return_value, "id", zend_string_copy(ctx->id));
	add_assoc_str(return_value, "basePath", zend_string_copy(ctx->base_path));
	add_assoc_str(return_value, "storagePath", zend_string_copy(ctx->storage_path));

	zval database_copy;
	ZVAL_COPY(&database_copy, &ctx->database);
	add_assoc_zval(return_value, "database", &database_copy);

	zval auth_copy;
	ZVAL_COPY(&auth_copy, &ctx->auth);
	add_assoc_zval(return_value, "auth", &auth_copy);

	zval manifest;
	nxdom_app_context_load_manifest(ctx, &manifest);
	add_assoc_zval(return_value, "manifest", &manifest);

	nxdom_app_context_free(ctx);
}
/* }}} */

/* {{{ void nxdom_debug_response_ok(mixed $data)
 * Uji manual porting Response ke C (Plan.md 0D) — bukan API final. */
PHP_FUNCTION(nxdom_debug_response_ok)
{
	zval *data;

	ZEND_PARSE_PARAMETERS_START(1, 1)
		Z_PARAM_ZVAL(data)
	ZEND_PARSE_PARAMETERS_END();

	zval data_copy;
	ZVAL_COPY(&data_copy, data);
	nxdom_response_ok(&data_copy);
}
/* }}} */

/* {{{ array|null nxdom_debug_router_match(array $routes, string $method, string $path)
 * Uji manual porting Router::match()/segments() ke C (Plan.md 0D) — bukan
 * API final. Return ['route' => ..., 'params' => ...] sama seperti bentuk
 * Router::match() PHP, atau null kalau tidak ada yang cocok. */
PHP_FUNCTION(nxdom_debug_router_match)
{
	zval *routes;
	char *method, *path;
	size_t method_len, path_len;

	ZEND_PARSE_PARAMETERS_START(3, 3)
		Z_PARAM_ARRAY(routes)
		Z_PARAM_STRING(method, method_len)
		Z_PARAM_STRING(path, path_len)
	ZEND_PARSE_PARAMETERS_END();

	zval route, params;
	if (!nxdom_router_match(routes, method, path, &route, &params)) {
		RETURN_NULL();
	}

	array_init(return_value);
	add_assoc_zval(return_value, "route", &route);
	add_assoc_zval(return_value, "params", &params);
}
/* }}} */

/* {{{ mixed nxdom_debug_query(string $basePath, string $table, array $constraints)
 * Uji manual porting Database+QueryBuilder::get() ke C (Plan.md 0D) —
 * bukan API final. */
PHP_FUNCTION(nxdom_debug_query)
{
	char *base_path, *table;
	size_t base_path_len, table_len;
	zval *constraints;

	ZEND_PARSE_PARAMETERS_START(3, 3)
		Z_PARAM_STRING(base_path, base_path_len)
		Z_PARAM_STRING(table, table_len)
		Z_PARAM_ARRAY(constraints)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx = nxdom_app_context_from_directory(base_path);
	if (!ctx) {
		nxdom_response_error(500, "AppContext gagal dimuat");
		RETURN_NULL();
	}

	zval pdo;
	if (nxdom_database_connect(&ctx->database, ZSTR_VAL(ctx->base_path), &pdo) != SUCCESS) {
		nxdom_app_context_free(ctx);
		RETURN_FALSE;
	}

	nxdom_query_builder *qb = nxdom_qb_create(&pdo, table);
	if (!qb) {
		zval_ptr_dtor(&pdo);
		nxdom_app_context_free(ctx);
		RETURN_FALSE;
	}

	if (nxdom_qb_apply_constraints(qb, constraints) != SUCCESS) {
		php_error_docref(NULL, E_WARNING, "%s", nxdom_qb_last_error(qb));
		nxdom_qb_free(qb);
		zval_ptr_dtor(&pdo);
		nxdom_app_context_free(ctx);
		RETURN_FALSE;
	}

	zend_result status = nxdom_qb_get(qb, return_value);

	nxdom_qb_free(qb);
	zval_ptr_dtor(&pdo);
	nxdom_app_context_free(ctx);

	if (status != SUCCESS) {
		if (EG(exception)) {
			zend_clear_exception();
		}
		RETURN_FALSE;
	}
}
/* }}} */

/* Helper bersama fungsi debug Auth: load AppContext + connect PDO.
 * Return 0 kalau gagal (RETURN_* sudah dipanggil caller), out_ctx/out_pdo
 * diisi kalau return 1 (caller wajib nxdom_app_context_free/zval_ptr_dtor). */
static int nxdom_debug_auth_prepare(zval *return_value, const char *base_path, nxdom_app_context **out_ctx, zval *out_pdo)
{
	*out_ctx = nxdom_app_context_from_directory(base_path);
	if (!*out_ctx) {
		RETVAL_NULL();
		return 0;
	}

	if (nxdom_database_connect(&(*out_ctx)->database, ZSTR_VAL((*out_ctx)->base_path), out_pdo) != SUCCESS) {
		nxdom_app_context_free(*out_ctx);
		if (EG(exception)) zend_clear_exception();
		RETVAL_FALSE;
		return 0;
	}

	return 1;
}

/* {{{ mixed nxdom_debug_auth_register(string $basePath, array $body)
 * Uji manual porting Auth::register() ke C — bukan API final. */
PHP_FUNCTION(nxdom_debug_auth_register)
{
	char *base_path;
	size_t base_path_len;
	zval *body;

	ZEND_PARSE_PARAMETERS_START(2, 2)
		Z_PARAM_STRING(base_path, base_path_len)
		Z_PARAM_ARRAY(body)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx;
	zval pdo;
	if (!nxdom_debug_auth_prepare(return_value, base_path, &ctx, &pdo)) {
		return;
	}

	int status;
	zend_string *message;
	zend_result result = nxdom_auth_register(ctx, &pdo, body, return_value, &status, &message);

	zval_ptr_dtor(&pdo);
	nxdom_app_context_free(ctx);

	if (result != SUCCESS) {
		if (EG(exception)) {
			zend_clear_exception();
			RETURN_FALSE;
		}
		nxdom_response_error(status, ZSTR_VAL(message));
		zend_string_release(message);
		RETURN_NULL();
	}
}
/* }}} */

/* {{{ mixed nxdom_debug_auth_login(string $basePath, array $body)
 * Uji manual porting Auth::login() ke C — bukan API final. */
PHP_FUNCTION(nxdom_debug_auth_login)
{
	char *base_path;
	size_t base_path_len;
	zval *body;

	ZEND_PARSE_PARAMETERS_START(2, 2)
		Z_PARAM_STRING(base_path, base_path_len)
		Z_PARAM_ARRAY(body)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx;
	zval pdo;
	if (!nxdom_debug_auth_prepare(return_value, base_path, &ctx, &pdo)) {
		return;
	}

	int status;
	zend_string *message;
	zend_result result = nxdom_auth_login(ctx, &pdo, body, return_value, &status, &message);

	zval_ptr_dtor(&pdo);
	nxdom_app_context_free(ctx);

	if (result != SUCCESS) {
		if (EG(exception)) {
			zend_clear_exception();
			RETURN_FALSE;
		}
		nxdom_response_error(status, ZSTR_VAL(message));
		zend_string_release(message);
		RETURN_NULL();
	}
}
/* }}} */

/* {{{ mixed nxdom_debug_auth_me(string $basePath)
 * Uji manual porting Auth::me() ke C — bukan API final. */
PHP_FUNCTION(nxdom_debug_auth_me)
{
	char *base_path;
	size_t base_path_len;

	ZEND_PARSE_PARAMETERS_START(1, 1)
		Z_PARAM_STRING(base_path, base_path_len)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx;
	zval pdo;
	if (!nxdom_debug_auth_prepare(return_value, base_path, &ctx, &pdo)) {
		return;
	}

	zend_result result = nxdom_auth_me(ctx, &pdo, return_value);

	zval_ptr_dtor(&pdo);
	nxdom_app_context_free(ctx);

	if (result != SUCCESS && EG(exception)) {
		zend_clear_exception();
		RETURN_FALSE;
	}
}
/* }}} */

/* {{{ void nxdom_debug_auth_logout(string $basePath) */
PHP_FUNCTION(nxdom_debug_auth_logout)
{
	char *base_path;
	size_t base_path_len;

	ZEND_PARSE_PARAMETERS_START(1, 1)
		Z_PARAM_STRING(base_path, base_path_len)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx = nxdom_app_context_from_directory(base_path);
	if (!ctx) {
		return;
	}

	nxdom_auth_logout(ctx);
	nxdom_app_context_free(ctx);
}
/* }}} */

/* {{{ bool nxdom_debug_auth_check(string $basePath)
 * Uji manual porting Auth::isAuthenticated() ke C — bukan API final. */
PHP_FUNCTION(nxdom_debug_auth_check)
{
	char *base_path;
	size_t base_path_len;

	ZEND_PARSE_PARAMETERS_START(1, 1)
		Z_PARAM_STRING(base_path, base_path_len)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx = nxdom_app_context_from_directory(base_path);
	if (!ctx) {
		RETURN_FALSE;
	}

	zend_bool authenticated = nxdom_auth_is_authenticated(ctx);
	nxdom_app_context_free(ctx);

	RETURN_BOOL(authenticated);
}
/* }}} */

/* {{{ void nxdom_debug_dispatch(string $basePath, string $method, string $path)
 * Uji manual porting Router::dispatch() ke C — menyatukan semua komponen
 * (AppContext, Router::match, Database, QueryBuilder, Auth) jadi satu
 * alur request lengkap. Bukan API final — akan diganti PHP_RINIT_FUNCTION
 * sungguhan setelah teruji. */
PHP_FUNCTION(nxdom_debug_dispatch)
{
	char *base_path, *method, *path;
	size_t base_path_len, method_len, path_len;

	ZEND_PARSE_PARAMETERS_START(3, 3)
		Z_PARAM_STRING(base_path, base_path_len)
		Z_PARAM_STRING(method, method_len)
		Z_PARAM_STRING(path, path_len)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx = nxdom_app_context_from_directory(base_path);
	if (!ctx) {
		nxdom_response_error(500, "AppContext gagal dimuat");
		return;
	}

	zval manifest;
	nxdom_app_context_load_manifest(ctx, &manifest);

	zval *routes = zend_hash_str_find(Z_ARRVAL(manifest), "routes", sizeof("routes") - 1);
	zval route, params;
	int matched = routes && nxdom_router_match(routes, method, path, &route, &params);
	zval_ptr_dtor(&manifest);

	if (!matched) {
		nxdom_app_context_free(ctx);
		nxdom_response_error(404, "Route not found");
		return;
	}

	nxdom_router_dispatch(ctx, &route, &params);

	zval_ptr_dtor(&route);
	zval_ptr_dtor(&params);
	nxdom_app_context_free(ctx);
}
/* }}} */

/* {{{ bool nxdom_dispatch()
 * API FINAL — dipanggil dari front controller (satu file .php generik,
 * dipasang via mod_rewrite level SERVER, lihat Plan.md Bagian 0F/0G).
 * Baca DOCUMENT_ROOT/REQUEST_URI dari superglobal $_SERVER. Return true
 * kalau request sudah ditangani penuh (caller harus langsung exit), false
 * kalau bukan app NxDom / bukan route /api/* (caller lanjut proses normal,
 * mis. serve file statis).
 *
 * PENTING (bug ditemukan saat uji FPM/nginx): dengan `auto_globals_jit=On`
 * (default produksi), $_SERVER BELUM dimaterialisasi ke EG(symbol_table)
 * sampai userland pertama kali mengaksesnya — membaca EG(symbol_table)
 * langsung dari extension bisa menemukan KOSONG dan salah balas false,
 * padahal request valid. Solusi: paksa materialisasi lewat
 * zend_is_auto_global_str(), lalu baca dari PG(http_globals)
 * [TRACK_VARS_SERVER] (sumber kanonik), dengan fallback ke EG(symbol_table)
 * untuk SAPI yang tidak mengisi http_globals. */
PHP_FUNCTION(nxdom_dispatch)
{
	ZEND_PARSE_PARAMETERS_NONE();

	/* Baca $_SERVER via helper (paksa materialisasi auto-global — lihat
	 * catatan di atas & nxdom_call.c). */
	zval *server = nxdom_superglobal("_SERVER");

	zval *document_root_zv = (server && Z_TYPE_P(server) == IS_ARRAY)
		? zend_hash_str_find(Z_ARRVAL_P(server), "DOCUMENT_ROOT", sizeof("DOCUMENT_ROOT") - 1)
		: NULL;
	zval *request_uri_zv = (server && Z_TYPE_P(server) == IS_ARRAY)
		? zend_hash_str_find(Z_ARRVAL_P(server), "REQUEST_URI", sizeof("REQUEST_URI") - 1)
		: NULL;

	if (!document_root_zv || Z_TYPE_P(document_root_zv) != IS_STRING
		|| !request_uri_zv || Z_TYPE_P(request_uri_zv) != IS_STRING
	) {
		RETURN_FALSE;
	}

	RETURN_BOOL(nxdom_kernel_handle(Z_STRVAL_P(document_root_zv), Z_STRVAL_P(request_uri_zv)));
}
/* }}} */

/* {{{ mixed nxdom_debug_insert(string $basePath, string $table, array $data)
 * Uji manual porting QueryBuilder::insert() ke C — bukan API final. */
PHP_FUNCTION(nxdom_debug_insert)
{
	char *base_path, *table;
	size_t base_path_len, table_len;
	zval *data;

	ZEND_PARSE_PARAMETERS_START(3, 3)
		Z_PARAM_STRING(base_path, base_path_len)
		Z_PARAM_STRING(table, table_len)
		Z_PARAM_ARRAY(data)
	ZEND_PARSE_PARAMETERS_END();

	nxdom_app_context *ctx = nxdom_app_context_from_directory(base_path);
	if (!ctx) {
		RETURN_NULL();
	}

	zval pdo;
	if (nxdom_database_connect(&ctx->database, ZSTR_VAL(ctx->base_path), &pdo) != SUCCESS) {
		nxdom_app_context_free(ctx);
		RETURN_FALSE;
	}

	nxdom_query_builder *qb = nxdom_qb_create(&pdo, table);
	if (!qb) {
		zval_ptr_dtor(&pdo);
		nxdom_app_context_free(ctx);
		RETURN_FALSE;
	}

	zend_result status = nxdom_qb_insert(qb, data, return_value);

	nxdom_qb_free(qb);
	zval_ptr_dtor(&pdo);
	nxdom_app_context_free(ctx);

	if (status != SUCCESS) {
		if (EG(exception)) {
			zend_clear_exception();
		}
		RETURN_FALSE;
	}
}
/* }}} */

/* {{{ PHP_RINIT_FUNCTION
 * Hook lifecycle native pengganti auto_prepend_file (README §17): akan
 * jadi titik masuk Kernel::handle() setara C, setelah skeleton ini
 * terbukti bisa di-load. Untuk sekarang belum melakukan apa-apa. */
PHP_RINIT_FUNCTION(nxdom)
{
#if defined(ZTS) && defined(COMPILE_DL_NXDOM)
	ZEND_TSRMLS_CACHE_UPDATE();
#endif

	/* Port dari bootstrap.php/router.php (PHP): titik masuk NxDom di
	 * setiap request. Lihat nxdom_kernel.h untuk batasan arsitektur
	 * (RINIT tidak bisa mengganti primary_file, hanya "ikut berjalan").
	 *
	 * BUG DITEMUKAN saat pengujian: sapi_getenv("DOCUMENT_ROOT", ...)
	 * SELALU return NULL di CLI Server SAPI (php -S) — field `getenv`
	 * di cli_server_sapi_module (sapi/cli/php_cli_server.c) memang NULL,
	 * SAPI itu hanya mem-populate $_SERVER langsung, tidak lewat hook
	 * getenv. Jadi RINIT tidak pernah menangani request sama sekali,
	 * padahal Kernel::handle() sendiri sudah benar (diverifikasi lewat
	 * nxdom_debug_dispatch() sebelumnya). Solusi: baca $_SERVER lewat
	 * helper nxdom_superglobal() (paksa materialisasi auto-global — beda
	 * dari RINIT yang tidak butuh itu di CLI, di SAPI web auto_globals_jit
	 * membuat EG(symbol_table) kosong) — bukan sapi_getenv. */
	zval *server = nxdom_superglobal("_SERVER");
	zval *document_root_zv = server && Z_TYPE_P(server) == IS_ARRAY
		? zend_hash_str_find(Z_ARRVAL_P(server), "DOCUMENT_ROOT", sizeof("DOCUMENT_ROOT") - 1)
		: NULL;

	const char *document_root = (document_root_zv && Z_TYPE_P(document_root_zv) == IS_STRING)
		? Z_STRVAL_P(document_root_zv) : NULL;
	const char *request_uri = SG(request_info).request_uri;

	if (document_root && request_uri && nxdom_kernel_handle(document_root, request_uri)) {
		zend_bailout();
	}

	return SUCCESS;
}
/* }}} */

/* {{{ PHP_MINFO_FUNCTION */
PHP_MINFO_FUNCTION(nxdom)
{
	php_info_print_table_start();
	php_info_print_table_header(2, "NxDom support", "enabled");
	php_info_print_table_row(2, "NxDom version", PHP_NXDOM_VERSION);
	php_info_print_table_end();
}
/* }}} */

/* {{{ nxdom_module_entry */
zend_module_entry nxdom_module_entry = {
	STANDARD_MODULE_HEADER,
	"nxdom",
	ext_functions,
	NULL,                    /* PHP_MINIT */
	NULL,                    /* PHP_MSHUTDOWN */
	PHP_RINIT(nxdom),
	NULL,                    /* PHP_RSHUTDOWN */
	PHP_MINFO(nxdom),
	PHP_NXDOM_VERSION,
	STANDARD_MODULE_PROPERTIES
};
/* }}} */

#ifdef COMPILE_DL_NXDOM
# ifdef ZTS
ZEND_TSRMLS_CACHE_DEFINE()
# endif
ZEND_GET_MODULE(nxdom)
#endif
