#include "php.h"
#include "nxdom_auth.h"
#include "nxdom_call.h"
#include "nxdom_query_builder.h"

/* PENTING: TIDAK menyertakan ext/session/php_session.h dan TIDAK memakai
 * macro PS(...) sama sekali — PS() bergantung pada 'ps_globals_id' yang
 * TIDAK diekspor ext/session untuk dipakai extension lain. Mencobanya
 * (percobaan pertama porting ini) menyebabkan SEGFAULT nyata (baca
 * memori tak valid), ditemukan lewat pengujian manual. Lihat Plan.md.
 *
 * Solusi aman: session_start()/session_name()/session_destroy()/
 * session_regenerate_id() SEMUA dipanggil userland (nxdom_call_function),
 * dan $_SESSION dibaca/ditulis lewat EG(symbol_table) — cara resmi PHP
 * sendiri menyimpan superglobal (lihat php_session_track_init() di
 * ext/session/session.c: $_SESSION disimpan sebagai entri biasa di
 * symbol table global dengan key "_SESSION", bukan struct privat). */

#define NXDOM_SESSION_KEY "nxdom_user_id"
#define NXDOM_SESSION_VAR "_SESSION"

static const char *nxdom_auth_str(zval *auth, const char *key)
{
	zval *v = zend_hash_str_find(Z_ARRVAL_P(auth), key, strlen(key));
	return (v && Z_TYPE_P(v) == IS_STRING) ? Z_STRVAL_P(v) : NULL;
}

/* Port dari Auth::requireAuthConfig(): table/identifier/passwordColumn
 * wajib ada dan non-kosong di app->auth. */
static int nxdom_auth_require_config(
	nxdom_app_context *ctx, const char **table, const char **identifier, const char **password_column,
	int *out_status, zend_string **out_message
) {
	*table = nxdom_auth_str(&ctx->auth, "table");
	*identifier = nxdom_auth_str(&ctx->auth, "identifier");
	*password_column = nxdom_auth_str(&ctx->auth, "passwordColumn");

	const char *missing = !*table ? "table" : (!*identifier ? "identifier" : (!*password_column ? "passwordColumn" : NULL));
	if (missing) {
		*out_status = 500;
		*out_message = zend_strpprintf(0, "Konfigurasi auth.%s belum diset di nxdom.config.json", missing);
		return 0;
	}
	return 1;
}

/* session_status() userland — return long (0=disabled, 1=none, 2=active),
 * sama seperti konstanta PHP_SESSION_ACTIVE=2. Menghindari PS(session_status)
 * yang tidak aman diakses dari extension eksternal (lihat catatan atas). */
static zend_bool nxdom_session_is_active(void)
{
	zval retval;
	if (nxdom_call_function("session_status", 0, NULL, &retval) != SUCCESS) {
		return 0;
	}
	zend_bool active = Z_TYPE(retval) == IS_LONG && Z_LVAL(retval) == 2;
	zval_ptr_dtor(&retval);
	return active;
}

static void nxdom_ensure_session_started(nxdom_app_context *ctx)
{
	if (nxdom_session_is_active()) {
		return;
	}

	zend_string *session_name = zend_strpprintf(0, "nxdom_%s", ZSTR_VAL(ctx->id));
	zval name_arg, retval;
	ZVAL_STR(&name_arg, session_name);
	nxdom_call_function("session_name", 1, &name_arg, &retval);
	zend_string_release(session_name);
	zval_ptr_dtor(&retval);

	/* session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']) */
	zval cookie_params;
	array_init(&cookie_params);
	add_assoc_bool(&cookie_params, "httponly", 1);
	add_assoc_string(&cookie_params, "samesite", "Lax");
	zval cookie_retval;
	nxdom_call_function("session_set_cookie_params", 1, &cookie_params, &cookie_retval);
	zval_ptr_dtor(&cookie_params);
	zval_ptr_dtor(&cookie_retval);

	zval start_retval;
	nxdom_call_function("session_start", 0, NULL, &start_retval);
	zval_ptr_dtor(&start_retval);
}

/* Set/ambil $_SESSION lewat USERLAND (zend_eval_string), BUKAN symbol table
 * langsung. Alasan (bug nyata, ditemukan lewat logging): session extension
 * PHP mem-publish $_SESSION HANYA saat USERLAND menyentuhnya — memanggil
 * session_start() dari extension (via nxdom_call_function) TIDAK
 * mematerialisasi $_SESSION ke EG(symbol_table), sehingga penulisan kita
 * hilang dan file sess_* jadi 0 byte (login tidak persisten). Mengakses
 * lewat userland frame membuat session extension publish & sinkron.
 * KEAMANAN: nilai yang diinterpolasi hanya integer user_id (dari DB, bukan
 * input client) + key internal konstanta — tidak ada permukaan injeksi. */
static void nxdom_session_set(const char *key, zval *value)
{
	(void) key; /* hanya dipakai untuk NXDOM_SESSION_KEY */
	zend_long uid = zval_get_long(value);
	char *code = NULL;
	spprintf(&code, 0, "$_SESSION[%s] = %ld;", "'" NXDOM_SESSION_KEY "'", uid);
	if (code) {
		zval retval;
		ZVAL_UNDEF(&retval);
		zend_eval_string(code, &retval, "nxdom_session_set");
		if (!Z_ISUNDEF(retval)) zval_ptr_dtor(&retval);
		efree(code);
	}
}

/* Ambil user_id dari $_SESSION via userland; return SUCCESS + *out (long)
 * kalau ada, FAILURE kalau tidak. */
static zend_result nxdom_session_get_user_id(zend_long *out)
{
	/* Simpan ke variabel global lewat userland, lalu baca dari symbol table
	 * (hindari 'return' di zend_eval_string). */
	zval retval;
	ZVAL_UNDEF(&retval);
	char *code = NULL;
	spprintf(&code, 0,
		"$GLOBALS['__nxdom_sess_uid'] = $_SESSION[%s] ?? null;",
		"'" NXDOM_SESSION_KEY "'");
	zend_result ok = FAILURE;
	if (code) {
		zend_eval_string(code, &retval, "nxdom_session_get");
		efree(code);
	}
	if (!Z_ISUNDEF(retval)) zval_ptr_dtor(&retval);

	zval *uid_zv = zend_hash_str_find(&EG(symbol_table), "__nxdom_sess_uid", sizeof("__nxdom_sess_uid") - 1);
	if (uid_zv) {
		ZVAL_DEREF(uid_zv);
		if (!Z_ISNULL_P(uid_zv)) {
			*out = zval_get_long(uid_zv);
			ok = SUCCESS;
		}
	}
	/* Bersihkan variabel global bantu. */
	zend_hash_str_del(&EG(symbol_table), "__nxdom_sess_uid", sizeof("__nxdom_sess_uid") - 1);
	return ok;
}

/* Port dari Auth::publicUser(): buang kolom password dari hasil sebelum
 * dikembalikan ke caller (Router/Response). */
static void nxdom_strip_password_column(zval *user, const char *password_column)
{
	zend_hash_str_del(Z_ARRVAL_P(user), password_column, strlen(password_column));
}

zend_result nxdom_auth_register(
	nxdom_app_context *ctx, zval *pdo, zval *body,
	zval *out_result, int *out_status, zend_string **out_message
) {
	const char *table, *identifier, *password_column;
	if (!nxdom_auth_require_config(ctx, &table, &identifier, &password_column, out_status, out_message)) {
		return FAILURE;
	}

	zval *identifier_zv = zend_hash_str_find(Z_ARRVAL_P(body), identifier, strlen(identifier));
	zval *password_zv = zend_hash_str_find(Z_ARRVAL_P(body), password_column, strlen(password_column));

	zend_string *identifier_val = identifier_zv ? zval_get_string(identifier_zv) : ZSTR_EMPTY_ALLOC();
	zend_string *password_val = password_zv ? zval_get_string(password_zv) : ZSTR_EMPTY_ALLOC();

	if (ZSTR_LEN(identifier_val) == 0 || ZSTR_LEN(password_val) == 0) {
		*out_status = 400;
		*out_message = zend_strpprintf(0, "Field '%s' dan '%s' wajib diisi", identifier, password_column);
		zend_string_release(identifier_val);
		zend_string_release(password_val);
		return FAILURE;
	}

	nxdom_query_builder *qb = nxdom_qb_create(pdo, table);
	zval id_arg;
	ZVAL_STR_COPY(&id_arg, identifier_val);
	zval existing;
	zend_result find_status = nxdom_qb_find(qb, &id_arg, identifier, &existing);
	zval_ptr_dtor(&id_arg);

	if (find_status == SUCCESS && Z_TYPE(existing) != IS_NULL) {
		zval_ptr_dtor(&existing);
		nxdom_qb_free(qb);
		zend_string_release(identifier_val);
		zend_string_release(password_val);
		*out_status = 409;
		*out_message = zend_strpprintf(0, "'%s' sudah terdaftar", identifier);
		return FAILURE;
	}
	if (find_status == SUCCESS) {
		zval_ptr_dtor(&existing);
	}

	/* password_hash($password, PASSWORD_DEFAULT) — PASSWORD_DEFAULT = null
	 * secara historis (algo default dipilih PHP sendiri), dikirim sebagai
	 * argumen kedua bertipe null supaya sama seperti userland tanpa hardcode
	 * nilai konstanta algoritma yang bisa berubah antar versi PHP. */
	zval hash_args[2];
	ZVAL_STR_COPY(&hash_args[0], password_val);
	ZVAL_NULL(&hash_args[1]);
	zval hashed;
	nxdom_call_function("password_hash", 2, hash_args, &hashed);
	zval_ptr_dtor(&hash_args[0]);
	zend_string_release(password_val);

	zval data;
	array_init(&data);
	add_assoc_str(&data, identifier, identifier_val);
	add_assoc_zval(&data, password_column, &hashed);

	zval *fillable = zend_hash_str_find(Z_ARRVAL(ctx->auth), "registerFillable", sizeof("registerFillable") - 1);
	if (fillable && Z_TYPE_P(fillable) == IS_ARRAY) {
		zval *field;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(fillable), field) {
			if (Z_TYPE_P(field) != IS_STRING) continue;
			zval *field_val = zend_hash_str_find(Z_ARRVAL_P(body), Z_STRVAL_P(field), Z_STRLEN_P(field));
			if (field_val) {
				zval field_copy;
				ZVAL_COPY(&field_copy, field_val);
				add_assoc_zval_ex(&data, Z_STRVAL_P(field), Z_STRLEN_P(field), &field_copy);
			}
		} ZEND_HASH_FOREACH_END();
	}

	zval new_id;
	zend_result insert_status = nxdom_qb_insert(qb, &data, &new_id);
	nxdom_qb_free(qb);

	if (insert_status != SUCCESS) {
		zval_ptr_dtor(&data);
		return FAILURE; /* PDOException tetap di EG(exception), caller (Router) yang catch */
	}

	array_init(out_result);
	add_assoc_zval(out_result, "id", &new_id);
	zval *id_str_in_data = zend_hash_str_find(Z_ARRVAL(data), identifier, strlen(identifier));
	zval id_copy;
	ZVAL_COPY(&id_copy, id_str_in_data);
	add_assoc_zval_ex(out_result, identifier, strlen(identifier), &id_copy);

	zval_ptr_dtor(&data);
	return SUCCESS;
}

zend_result nxdom_auth_login(
	nxdom_app_context *ctx, zval *pdo, zval *body,
	zval *out_result, int *out_status, zend_string **out_message
) {
	const char *table, *identifier, *password_column;
	if (!nxdom_auth_require_config(ctx, &table, &identifier, &password_column, out_status, out_message)) {
		return FAILURE;
	}

	zval *identifier_zv = zend_hash_str_find(Z_ARRVAL_P(body), identifier, strlen(identifier));
	zval *password_zv = zend_hash_str_find(Z_ARRVAL_P(body), password_column, strlen(password_column));

	zend_string *identifier_val = identifier_zv ? zval_get_string(identifier_zv) : ZSTR_EMPTY_ALLOC();
	zend_string *password_val = password_zv ? zval_get_string(password_zv) : ZSTR_EMPTY_ALLOC();

	if (ZSTR_LEN(identifier_val) == 0 || ZSTR_LEN(password_val) == 0) {
		*out_status = 400;
		*out_message = zend_strpprintf(0, "Field '%s' dan '%s' wajib diisi", identifier, password_column);
		zend_string_release(identifier_val);
		zend_string_release(password_val);
		return FAILURE;
	}

	nxdom_query_builder *qb = nxdom_qb_create(pdo, table);
	zval id_arg;
	ZVAL_STR_COPY(&id_arg, identifier_val);
	zend_string_release(identifier_val);
	zval user;
	zend_result find_status = nxdom_qb_find(qb, &id_arg, identifier, &user);
	nxdom_qb_free(qb);
	zval_ptr_dtor(&id_arg);

	if (find_status != SUCCESS) {
		zend_string_release(password_val);
		return FAILURE;
	}

	zend_bool invalid = Z_TYPE(user) == IS_NULL;
	if (!invalid) {
		zval *stored_hash = zend_hash_str_find(Z_ARRVAL(user), password_column, strlen(password_column));
		zval verify_args[2];
		ZVAL_STR_COPY(&verify_args[0], password_val);
		if (stored_hash && Z_TYPE_P(stored_hash) == IS_STRING) {
			ZVAL_COPY(&verify_args[1], stored_hash);
		} else {
			ZVAL_STRING(&verify_args[1], "");
		}
		zval verify_result;
		nxdom_call_function("password_verify", 2, verify_args, &verify_result);
		zval_ptr_dtor(&verify_args[0]);
		zval_ptr_dtor(&verify_args[1]);

		invalid = Z_TYPE(verify_result) != IS_TRUE;
		zval_ptr_dtor(&verify_result);
	}
	zend_string_release(password_val);

	if (invalid) {
		if (Z_TYPE(user) != IS_NULL) zval_ptr_dtor(&user);
		*out_status = 401;
		*out_message = zend_string_init(ZEND_STRL("Kredensial tidak valid"), 0);
		return FAILURE;
	}

	nxdom_ensure_session_started(ctx);

	zval regen_retval;
	zval true_arg;
	ZVAL_TRUE(&true_arg);
	nxdom_call_function("session_regenerate_id", 1, &true_arg, &regen_retval);

	zval *user_id = zend_hash_str_find(Z_ARRVAL(user), "id", sizeof("id") - 1);
	if (user_id) {
		nxdom_session_set(NXDOM_SESSION_KEY, user_id);
	}

	nxdom_strip_password_column(&user, password_column);
	ZVAL_COPY_VALUE(out_result, &user);
	return SUCCESS;
}

/* Port dari Auth::logout(): ensureSessionStarted() dulu (WAJIB via ctx,
 * supaya session_name() dipanggil dengan nama yang sama seperti
 * login()/me() — bug nyata: session_start() polos tanpa session_name()
 * beroperasi pada session PHPSESSID default, bukan session NxDom yang
 * aktif, sehingga logout tidak menghapus status login sungguhan),
 * lalu $_SESSION = [] dan session_destroy(). */
void nxdom_auth_logout(nxdom_app_context *ctx)
{
	nxdom_ensure_session_started(ctx);

	/* Kosongkan $_SESSION lewat userland (sama alasan seperti session_set),
	 * lalu hancurkan session. */
	zval retval;
	ZVAL_UNDEF(&retval);
	zend_eval_string("$_SESSION = [];", &retval, "nxdom_session_clear");
	if (!Z_ISUNDEF(retval)) zval_ptr_dtor(&retval);

	zval destroy_retval;
	nxdom_call_function("session_destroy", 0, NULL, &destroy_retval);
	zval_ptr_dtor(&destroy_retval);
}

zend_result nxdom_auth_me(nxdom_app_context *ctx, zval *pdo, zval *out_user)
{
	nxdom_ensure_session_started(ctx);

	zend_long uid;
	if (nxdom_session_get_user_id(&uid) != SUCCESS) {
		ZVAL_NULL(out_user);
		return SUCCESS;
	}

	const char *table, *identifier, *password_column;
	int status;
	zend_string *message;
	if (!nxdom_auth_require_config(ctx, &table, &identifier, &password_column, &status, &message)) {
		zend_string_release(message);
		return FAILURE;
	}

	nxdom_query_builder *qb = nxdom_qb_create(pdo, table);
	zval id_zv;
	ZVAL_LONG(&id_zv, uid);
	zend_result find_status = nxdom_qb_find(qb, &id_zv, "id", out_user);
	nxdom_qb_free(qb);

	if (find_status != SUCCESS) {
		return FAILURE;
	}

	if (Z_TYPE_P(out_user) != IS_NULL) {
		nxdom_strip_password_column(out_user, password_column);
	}
	return SUCCESS;
}

zend_bool nxdom_auth_is_authenticated(nxdom_app_context *ctx)
{
	nxdom_ensure_session_started(ctx);
	zend_long uid;
	return nxdom_session_get_user_id(&uid) == SUCCESS;
}
