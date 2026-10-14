#include "php.h"
#include "nxdom_app_context.h"
#include "nxdom_call.h"

/* Panggil json_decode($json, true) — pola call_user_function yang sama
 * dipakai extension PHP lain saat butuh fungsi dari extension lain
 * (lihat Zend/zend_API.h). Return FAILURE kalau hasil bukan array
 * (termasuk saat JSON tidak valid, json_decode mengembalikan NULL). */
static zend_result nxdom_json_decode_assoc(zend_string *json, zval *out)
{
	zval func_name;
	zval params[2];
	zval retval;

	ZVAL_STRING(&func_name, "json_decode");
	ZVAL_STR(&params[0], json);
	ZVAL_TRUE(&params[1]);

	zend_result status = call_user_function(NULL, NULL, &func_name, &retval, 2, params);

	zval_ptr_dtor(&func_name);

	if (status != SUCCESS || Z_TYPE(retval) != IS_ARRAY) {
		zval_ptr_dtor(&retval);
		return FAILURE;
	}

	ZVAL_COPY_VALUE(out, &retval);
	return SUCCESS;
}

nxdom_app_context *nxdom_app_context_from_directory(const char *base_path)
{
	size_t base_len = strlen(base_path);
	/* rtrim '/' '\\' — samakan dengan rtrim($basePath, '/\\') di PHP */
	while (base_len > 0 && (base_path[base_len - 1] == '/' || base_path[base_len - 1] == '\\')) {
		base_len--;
	}

	zend_string *config_path = zend_strpprintf(0, "%.*s/nxdom.config.json", (int) base_len, base_path);
	zend_string *raw = nxdom_read_file(ZSTR_VAL(config_path));
	zend_string_release(config_path);

	if (!raw) {
		return NULL;
	}

	zval config;
	zend_result decoded = nxdom_json_decode_assoc(raw, &config);
	zend_string_release(raw);

	if (decoded != SUCCESS) {
		return NULL;
	}

	zval *id_zv = zend_hash_str_find(Z_ARRVAL(config), "id", sizeof("id") - 1);
	zval *database_zv = zend_hash_str_find(Z_ARRVAL(config), "database", sizeof("database") - 1);

	/* Sama seperti PHP: id dan database wajib ada (AppContext.php
	 * mengakses $config['id']/$config['database'] tanpa null-coalesce,
	 * akan fatal error kalau tidak ada — di sini kita tolak lebih awal
	 * dan eksplisit, bukan meniru fatal error PHP). */
	if (!id_zv || Z_TYPE_P(id_zv) != IS_STRING || !database_zv || Z_TYPE_P(database_zv) != IS_ARRAY) {
		zval_ptr_dtor(&config);
		return NULL;
	}

	nxdom_app_context *ctx = pemalloc(sizeof(nxdom_app_context), 1);
	ctx->id = zend_string_copy(Z_STR_P(id_zv));
	ctx->base_path = zend_string_init(base_path, base_len, 1);

	ZVAL_COPY(&ctx->database, database_zv);

	zval *auth_zv = zend_hash_str_find(Z_ARRVAL(config), "auth", sizeof("auth") - 1);
	if (auth_zv && Z_TYPE_P(auth_zv) == IS_ARRAY) {
		ZVAL_COPY(&ctx->auth, auth_zv);
	} else {
		array_init(&ctx->auth);
	}

	/* storage.path, kalau ada: basePath + '/' + config['storage']['path'].
	 * PHP memakai realpath($basePath) — di sini basePath sudah path
	 * absolut yang diteruskan Kernel, jadi tidak perlu realpath ulang. */
	zval *storage_zv = zend_hash_str_find(Z_ARRVAL(config), "storage", sizeof("storage") - 1);
	zval *storage_path_zv = NULL;
	if (storage_zv && Z_TYPE_P(storage_zv) == IS_ARRAY) {
		storage_path_zv = zend_hash_str_find(Z_ARRVAL_P(storage_zv), "path", sizeof("path") - 1);
	}

	if (storage_path_zv && Z_TYPE_P(storage_path_zv) == IS_STRING) {
		ctx->storage_path = zend_strpprintf(
			0, "%.*s/%s", (int) base_len, base_path, Z_STRVAL_P(storage_path_zv)
		);
	} else {
		ctx->storage_path = zend_strpprintf(0, "%.*s/storage", (int) base_len, base_path);
	}

	zval_ptr_dtor(&config);
	return ctx;
}

void nxdom_app_context_free(nxdom_app_context *ctx)
{
	if (!ctx) {
		return;
	}

	zend_string_release(ctx->id);
	zend_string_release(ctx->base_path);
	zend_string_release(ctx->storage_path);
	zval_ptr_dtor(&ctx->database);
	zval_ptr_dtor(&ctx->auth);
	pefree(ctx, 1);
}

void nxdom_app_context_load_manifest(nxdom_app_context *ctx, zval *out_manifest)
{
	zend_string *manifest_path = zend_strpprintf(0, "%s/nxdom.manifest.json", ZSTR_VAL(ctx->base_path));
	zend_string *raw = nxdom_read_file(ZSTR_VAL(manifest_path));
	zend_string_release(manifest_path);

	zval decoded;
	zend_bool ok = raw && nxdom_json_decode_assoc(raw, &decoded) == SUCCESS;
	if (raw) {
		zend_string_release(raw);
	}

	if (!ok) {
		array_init(out_manifest);
		add_assoc_long(out_manifest, "version", 1);
		zval routes;
		array_init(&routes);
		add_assoc_zval(out_manifest, "routes", &routes);
		return;
	}

	ZVAL_COPY_VALUE(out_manifest, &decoded);
}
