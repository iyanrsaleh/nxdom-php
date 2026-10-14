#include "php.h"
#include "SAPI.h"
#include "Zend/zend_exceptions.h"
#include "ext/standard/base64.h"
#include "nxdom_router.h"
#include "nxdom_database.h"
#include "nxdom_query_builder.h"
#include "nxdom_auth.h"
#include "nxdom_response.h"
#include "nxdom_call.h"

#define NXDOM_MAX_SEGMENTS 32

/* Port dari Router::segments(): trim '/' di kedua ujung, split by '/',
 * buang segmen kosong (mis. "//" berturut-turut) — sama seperti
 * array_filter(explode('/', trim($path,'/'))) di PHP. Segmen disimpan
 * sebagai pointer+panjang ke DALAM path_copy (tidak alokasi per-segmen),
 * jadi path_copy harus tetap hidup selama segments dipakai. */
static int nxdom_path_segments(char *path_copy, const char *segments[], size_t seg_lens[])
{
	char *p = path_copy;

	while (*p == '/') p++;

	size_t len = strlen(p);
	while (len > 0 && p[len - 1] == '/') {
		p[--len] = '\0';
	}

	if (len == 0) {
		return 0;
	}

	int count = 0;
	char *segment_start = p;

	for (char *c = p; ; c++) {
		if (*c == '/' || *c == '\0') {
			size_t seg_len = c - segment_start;
			if (seg_len > 0 && count < NXDOM_MAX_SEGMENTS) {
				segments[count] = segment_start;
				seg_lens[count] = seg_len;
				count++;
			}
			if (*c == '\0') {
				break;
			}
			*c = '\0';
			segment_start = c + 1;
		}
	}

	return count;
}

static int nxdom_str_ieq(const char *a, const char *b)
{
	return strcasecmp(a, b) == 0;
}

int nxdom_router_match(
	zval *routes, const char *method, const char *path,
	zval *out_route, zval *out_params
) {
	char path_buf[2048];
	strncpy(path_buf, path, sizeof(path_buf) - 1);
	path_buf[sizeof(path_buf) - 1] = '\0';

	const char *path_segments[NXDOM_MAX_SEGMENTS];
	size_t path_seg_lens[NXDOM_MAX_SEGMENTS];
	int path_seg_count = nxdom_path_segments(path_buf, path_segments, path_seg_lens);

	zval *route;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(routes), route) {
		zval *route_method = zend_hash_str_find(Z_ARRVAL_P(route), "method", sizeof("method") - 1);
		zval *route_path = zend_hash_str_find(Z_ARRVAL_P(route), "path", sizeof("path") - 1);

		if (!route_method || Z_TYPE_P(route_method) != IS_STRING
			|| !route_path || Z_TYPE_P(route_path) != IS_STRING
		) {
			continue;
		}

		if (!nxdom_str_ieq(Z_STRVAL_P(route_method), method)) {
			continue;
		}

		char route_path_buf[2048];
		strncpy(route_path_buf, Z_STRVAL_P(route_path), sizeof(route_path_buf) - 1);
		route_path_buf[sizeof(route_path_buf) - 1] = '\0';

		const char *route_segments[NXDOM_MAX_SEGMENTS];
		size_t route_seg_lens[NXDOM_MAX_SEGMENTS];
		int route_seg_count = nxdom_path_segments(route_path_buf, route_segments, route_seg_lens);

		if (route_seg_count != path_seg_count) {
			continue;
		}

		zval params;
		array_init(&params);
		int is_match = 1;

		for (int i = 0; i < route_seg_count; i++) {
			if (route_segments[i][0] == ':') {
				zend_string *param_name = zend_string_init(
					route_segments[i] + 1, route_seg_lens[i] - 1, 0
				);
				zend_string *param_value = zend_string_init(
					path_segments[i], path_seg_lens[i], 0
				);
				zval value_zv;
				ZVAL_STR(&value_zv, param_value);
				zend_symtable_update(Z_ARRVAL(params), param_name, &value_zv);
				zend_string_release(param_name);
				continue;
			}

			if (route_seg_lens[i] != path_seg_lens[i]
				|| memcmp(route_segments[i], path_segments[i], route_seg_lens[i]) != 0
			) {
				is_match = 0;
				break;
			}
		}

		if (is_match) {
			ZVAL_COPY(out_route, route);
			ZVAL_COPY_VALUE(out_params, &params);
			return 1;
		}

		zval_ptr_dtor(&params);
	} ZEND_HASH_FOREACH_END();

	return 0;
}

static const char *AUTH_ACTIONS[] = { "login", "logout", "register", "me", NULL };
static const char *CRUD_ACTIONS[] = { "query", "get", "create", "update", "delete", NULL };

static int nxdom_action_in(const char *action, const char *list[])
{
	for (int i = 0; list[i]; i++) {
		if (strcmp(list[i], action) == 0) return 1;
	}
	return 0;
}

/* Port dari Router::jsonBody(): baca php://input, json_decode assoc,
 * array kosong kalau gagal/bukan array — sama seperti PHP. */
static void nxdom_json_body(zval *out)
{
	zend_string *raw = nxdom_read_file("php://input");
	if (!raw) {
		array_init(out);
		return;
	}

	zval func_name, json_arg, true_arg, retval;
	ZVAL_STRING(&func_name, "json_decode");
	ZVAL_STR(&json_arg, raw);
	ZVAL_TRUE(&true_arg);
	zval args[2] = { json_arg, true_arg };

	if (call_user_function(NULL, NULL, &func_name, &retval, 2, args) == SUCCESS && Z_TYPE(retval) == IS_ARRAY) {
		ZVAL_COPY_VALUE(out, &retval);
	} else {
		zval_ptr_dtor(&retval);
		array_init(out);
	}
	zval_ptr_dtor(&func_name);
	zend_string_release(raw);
}

/* Port dari Router::filterFillable(): NULL fillable = body apa adanya;
 * selain itu hanya key yang ada di fillable yang dipertahankan
 * (array_intersect_key + array_flip di PHP). */
static void nxdom_filter_fillable(zval *body, zval *fillable, zval *out)
{
	if (!fillable || Z_TYPE_P(fillable) != IS_ARRAY) {
		ZVAL_COPY(out, body);
		return;
	}

	array_init(out);
	zval *field;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(fillable), field) {
		if (Z_TYPE_P(field) != IS_STRING) continue;
		zval *val = zend_hash_str_find(Z_ARRVAL_P(body), Z_STRVAL_P(field), Z_STRLEN_P(field));
		if (val) {
			zval val_copy;
			ZVAL_COPY(&val_copy, val);
			add_assoc_zval_ex(out, Z_STRVAL_P(field), Z_STRLEN_P(field), &val_copy);
		}
	} ZEND_HASH_FOREACH_END();
}

/* Nama key path-param dari route['params'][0] ?? 'id' — dipakai
 * handleGet/Update/Delete untuk tahu kolom mana yang dicocokkan dengan
 * nilai path param hasil match (params runtime, BEDA dari route['params']
 * yang cuma daftar NAMA param dari manifest). */
static const char *nxdom_route_key_column(zval *route)
{
	zval *params_def = zend_hash_str_find(Z_ARRVAL_P(route), "params", sizeof("params") - 1);
	if (params_def && Z_TYPE_P(params_def) == IS_ARRAY) {
		zval *first = zend_hash_index_find(Z_ARRVAL_P(params_def), 0);
		if (first && Z_TYPE_P(first) == IS_STRING) {
			return Z_STRVAL_P(first);
		}
	}
	return "id";
}

static void nxdom_handle_get(nxdom_query_builder *qb, zval *params, zval *route)
{
	const char *key = nxdom_route_key_column(route);
	zval *id = zend_hash_str_find(Z_ARRVAL_P(params), key, strlen(key));
	if (!id) {
		nxdom_response_error(404, "Data tidak ditemukan");
		return;
	}

	zval row;
	if (nxdom_qb_find(qb, id, key, &row) != SUCCESS) {
		return; /* PDOException, caller (dispatch) yang catch */
	}

	if (Z_TYPE(row) == IS_NULL) {
		nxdom_response_error(404, "Data tidak ditemukan");
		return;
	}
	nxdom_response_ok(&row);
}

static void nxdom_handle_create(nxdom_query_builder *qb, zval *constraints)
{
	zval body;
	nxdom_json_body(&body);

	zval *fillable = constraints ? zend_hash_str_find(Z_ARRVAL_P(constraints), "fillable", sizeof("fillable") - 1) : NULL;
	zval data;
	nxdom_filter_fillable(&body, fillable, &data);
	zval_ptr_dtor(&body);

	if (zend_hash_num_elements(Z_ARRVAL(data)) == 0) {
		zval_ptr_dtor(&data);
		nxdom_response_error(400, "Body kosong atau tidak ada field yang diizinkan (fillable)");
		return;
	}

	zval new_id;
	if (nxdom_qb_insert(qb, &data, &new_id) != SUCCESS) {
		zval_ptr_dtor(&data);
		return; /* PDOException, caller yang catch */
	}

	zval result;
	ZVAL_COPY_VALUE(&result, &data);
	add_assoc_zval(&result, "id", &new_id);
	nxdom_response_created(&result);
}

static void nxdom_handle_update(nxdom_query_builder *qb, zval *params, zval *route, zval *constraints)
{
	const char *key = nxdom_route_key_column(route);
	zval *id = zend_hash_str_find(Z_ARRVAL_P(params), key, strlen(key));
	if (!id) {
		nxdom_response_error(404, "Data tidak ditemukan");
		return;
	}

	zval body;
	nxdom_json_body(&body);

	zval *fillable = constraints ? zend_hash_str_find(Z_ARRVAL_P(constraints), "fillable", sizeof("fillable") - 1) : NULL;
	zval data;
	nxdom_filter_fillable(&body, fillable, &data);
	zval_ptr_dtor(&body);

	if (zend_hash_num_elements(Z_ARRVAL(data)) == 0) {
		zval_ptr_dtor(&data);
		nxdom_response_error(400, "Body kosong atau tidak ada field yang diizinkan (fillable)");
		return;
	}

	if (nxdom_qb_where(qb, key, "=", id) != SUCCESS) {
		zval_ptr_dtor(&data);
		nxdom_response_error(400, nxdom_qb_last_error(qb));
		return;
	}

	zend_long affected;
	if (nxdom_qb_update(qb, &data, &affected) != SUCCESS) {
		zval_ptr_dtor(&data);
		return; /* PDOException, caller yang catch */
	}

	if (affected == 0) {
		zval_ptr_dtor(&data);
		nxdom_response_error(404, "Data tidak ditemukan");
		return;
	}

	zval id_copy;
	ZVAL_COPY(&id_copy, id);
	add_assoc_zval(&data, "id", &id_copy);
	nxdom_response_ok(&data);
}

static void nxdom_handle_delete(nxdom_query_builder *qb, zval *params, zval *route)
{
	const char *key = nxdom_route_key_column(route);
	zval *id = zend_hash_str_find(Z_ARRVAL_P(params), key, strlen(key));
	if (!id) {
		nxdom_response_error(404, "Data tidak ditemukan");
		return;
	}

	if (nxdom_qb_where(qb, key, "=", id) != SUCCESS) {
		nxdom_response_error(400, nxdom_qb_last_error(qb));
		return;
	}

	zend_long affected;
	if (nxdom_qb_delete(qb, &affected) != SUCCESS) {
		return; /* PDOException, caller yang catch */
	}

	if (affected == 0) {
		nxdom_response_error(404, "Data tidak ditemukan");
		return;
	}

	zval result;
	array_init(&result);
	add_assoc_bool(&result, "deleted", 1);
	nxdom_response_json(200, &result);
}

/* Port dari Router::clientWhereFromQueryString() + castQueryValue():
 * baca $_GET['where'] (bisa berulang), format "kolom:operator:nilai",
 * cast "true"/"false"/numeric sesuai PHP. */
static void nxdom_apply_client_where(nxdom_query_builder *qb, zval *constraints, zend_bool *out_error)
{
	/* $_GET diakses lewat helper nxdom_superglobal (paksa materialisasi
	 * auto-global — lihat nxdom_call.c; membaca EG(symbol_table) langsung
	 * bisa kosong saat auto_globals_jit=On). */
	zval *get = nxdom_superglobal("_GET");
	if (!get || Z_TYPE_P(get) != IS_ARRAY) {
		return;
	}

	zval *where_raw = zend_hash_str_find(Z_ARRVAL_P(get), "where", sizeof("where") - 1);
	if (!where_raw) {
		return;
	}

	zval *allowed = constraints ? zend_hash_str_find(Z_ARRVAL_P(constraints), "allowClientWhere", sizeof("allowClientWhere") - 1) : NULL;

	/* $_GET['where'] bisa string tunggal atau array (mis. ?where[]=a&where[]=b) */
	zval single_wrapper;
	HashTable *entries;
	if (Z_TYPE_P(where_raw) == IS_ARRAY) {
		entries = Z_ARRVAL_P(where_raw);
	} else {
		array_init(&single_wrapper);
		zval copy;
		ZVAL_COPY(&copy, where_raw);
		add_next_index_zval(&single_wrapper, &copy);
		entries = Z_ARRVAL(single_wrapper);
	}

	zval *entry;
	ZEND_HASH_FOREACH_VAL(entries, entry) {
		if (Z_TYPE_P(entry) != IS_STRING) continue;

		char buf[512];
		strncpy(buf, Z_STRVAL_P(entry), sizeof(buf) - 1);
		buf[sizeof(buf) - 1] = '\0';

		char *col = buf;
		char *op = strchr(col, ':');
		if (!op) continue;
		*op++ = '\0';
		char *val = strchr(op, ':');
		if (!val) continue;
		*val++ = '\0';

		int column_allowed = 0;
		if (allowed && Z_TYPE_P(allowed) == IS_ARRAY) {
			zval *a;
			ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(allowed), a) {
				if (Z_TYPE_P(a) == IS_STRING && strcmp(Z_STRVAL_P(a), col) == 0) {
					column_allowed = 1;
					break;
				}
			} ZEND_HASH_FOREACH_END();
		}

		if (!column_allowed) {
			zend_string *msg = zend_strpprintf(0, "Kolom '%s' tidak diizinkan untuk where dari client", col);
			nxdom_response_error(403, ZSTR_VAL(msg));
			zend_string_release(msg);
			*out_error = 1;
			if (Z_TYPE_P(where_raw) != IS_ARRAY) zval_ptr_dtor(&single_wrapper);
			return;
		}

		zval value_zv;
		if (strcmp(val, "true") == 0) {
			ZVAL_TRUE(&value_zv);
		} else if (strcmp(val, "false") == 0) {
			ZVAL_FALSE(&value_zv);
		} else {
			zend_bool is_numeric_val = 1;
			for (const char *c = val; *c; c++) {
				if (!isdigit((unsigned char) *c) && *c != '.' && *c != '-') { is_numeric_val = 0; break; }
			}
			if (is_numeric_val && *val) {
				ZVAL_DOUBLE(&value_zv, zend_strtod(val, NULL));
			} else {
				ZVAL_STRING(&value_zv, val);
			}
		}

		nxdom_qb_where(qb, col, op, &value_zv);
		zval_ptr_dtor(&value_zv);
	} ZEND_HASH_FOREACH_END();

	if (Z_TYPE_P(where_raw) != IS_ARRAY) {
		zval_ptr_dtor(&single_wrapper);
	}
}

static void nxdom_handle_query(nxdom_query_builder *qb, zval *constraints)
{
	if (constraints) {
		nxdom_qb_apply_constraints(qb, constraints);
	}

	zend_bool where_error = 0;
	nxdom_apply_client_where(qb, constraints, &where_error);
	if (where_error) {
		return;
	}

	zval *get = nxdom_superglobal("_GET");
	if (get && Z_TYPE_P(get) == IS_ARRAY) {
		zval *order_raw = zend_hash_str_find(Z_ARRVAL_P(get), "orderBy", sizeof("orderBy") - 1);
		if (order_raw && Z_TYPE_P(order_raw) == IS_STRING && Z_STRLEN_P(order_raw) > 0) {
			char buf[256];
			strncpy(buf, Z_STRVAL_P(order_raw), sizeof(buf) - 1);
			buf[sizeof(buf) - 1] = '\0';
			char *col = buf;
			char *dir = strchr(col, ':');
			if (dir) *dir++ = '\0';
			else dir = "asc";

			zval *allowed = constraints ? zend_hash_str_find(Z_ARRVAL_P(constraints), "allowClientOrderBy", sizeof("allowClientOrderBy") - 1) : NULL;
			int column_allowed = 0;
			if (allowed && Z_TYPE_P(allowed) == IS_ARRAY) {
				zval *a;
				ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(allowed), a) {
					if (Z_TYPE_P(a) == IS_STRING && strcmp(Z_STRVAL_P(a), col) == 0) { column_allowed = 1; break; }
				} ZEND_HASH_FOREACH_END();
			}

			if (!column_allowed) {
				zend_string *msg = zend_strpprintf(0, "Kolom '%s' tidak diizinkan untuk orderBy dari client", col);
				nxdom_response_error(403, ZSTR_VAL(msg));
				zend_string_release(msg);
				return;
			}
			nxdom_qb_replace_order_by(qb, col, dir);
		}

		zval *limit_raw = zend_hash_str_find(Z_ARRVAL_P(get), "limit", sizeof("limit") - 1);
		if (limit_raw) {
			zend_long requested = zval_get_long(limit_raw);
			zval *max_zv = constraints ? zend_hash_str_find(Z_ARRVAL_P(constraints), "maxClientLimit", sizeof("maxClientLimit") - 1) : NULL;
			if (!max_zv) {
				nxdom_response_error(403, "limit dari client tidak diizinkan untuk route ini");
				return;
			}
			zend_long max = zval_get_long(max_zv);
			nxdom_qb_limit(qb, requested < max ? requested : max);
		}
	}

	zval rows;
	if (nxdom_qb_get(qb, &rows) != SUCCESS) {
		return; /* PDOException, caller yang catch */
	}
	nxdom_response_ok(&rows);
}

/* Decrypt payload NexaEncrypt (Port dari NexaEncrypt.js obfuscateJson/
 * deobfuscateJson, Plan_02.md §3.3): langkah kebalikannya adalah
 * base64_decode → XOR byte-per-byte dengan secretKey (diulang) → UTF-8 →
 * json_decode. Algoritma trivial (XOR + Base64), dijalankan pada BYTE
 * (bukan char code UTF-16 seperti versi JS lama), persis seperti catatan
 * "URUTAN PENTING: UTF-8 DULU, baru XOR" di NexaEncrypt.js.
 *
 * secretKey default 'nexa-default-secret-key-2025' (NexaStorage.js baris
 * 211). Return SUCCESS + out_parsed (hasil json_decode assoc) kalau
 * berhasil; FAILURE kalau base64/JSON tidak valid. */
static zend_result nxdom_nexa_decrypt(const char *encoded, size_t encoded_len, zval *out_parsed)
{
	const char *secret = "nexa-default-secret-key-2025";
	size_t secret_len = strlen(secret);

	/* base64_decode — pakai implementasi core (ext/standard/base64.h),
	 * bukan memanggil fungsi userland, supaya tidak bergantung pada
	 * konteks pemanggilan userland. */
	zend_string *decoded_zstr = php_base64_decode_ex((const unsigned char *) encoded, encoded_len, 0);
	if (!decoded_zstr) {
		return FAILURE;
	}

	size_t decoded_len = ZSTR_LEN(decoded_zstr);
	unsigned char *decoded = (unsigned char *) emalloc(decoded_len ? decoded_len : 1);
	if (decoded_len) {
		memcpy(decoded, ZSTR_VAL(decoded_zstr), decoded_len);
	}
	zend_string_release(decoded_zstr);

	/* XOR byte-per-byte dengan key yang diulang (simpleXOR versi JS). */
	for (size_t i = 0; i < decoded_len; i++) {
		decoded[i] = decoded[i] ^ (unsigned char) secret[i % secret_len];
	}

	zend_string *json_str = zend_string_init((const char *) decoded, decoded_len, 0);
	efree(decoded);

	zval func_name, arg, true_arg, retval;
	ZVAL_STRING(&func_name, "json_decode");
	ZVAL_STR(&arg, json_str);
	ZVAL_TRUE(&true_arg);
	zval args[2] = { arg, true_arg };

	zend_result status = call_user_function(NULL, NULL, &func_name, &retval, 2, args);
	zval_ptr_dtor(&func_name);
	zend_string_release(json_str);

	if (status != SUCCESS || Z_TYPE(retval) != IS_ARRAY) {
		zval_ptr_dtor(&retval);
		return FAILURE;
	}

	ZVAL_COPY_VALUE(out_parsed, &retval);
	return SUCCESS;
}

/* ==== /api/outside — jalur model (Plan_02.md §9) ==== */

/* Port dari OutsideController::normalizeName regex ^[a-zA-Z_][a-zA-Z0-9_]*$
 * — validasi format nama model/method (mencegah nama sembarang dipakai
 * sebagai identifier/lookup). Sama persis dengan nxdom_is_identifier di
 * query_builder.c, tapi static di sana — salinan kecil lokal, bukan
 * dipaksa berbagi lewat header untuk satu fungsi 6 baris. */
static int nxdom_outside_is_name(const char *s)
{
	if (!s || !(isalpha((unsigned char) s[0]) || s[0] == '_')) {
		return 0;
	}
	for (const char *c = s + 1; *c; c++) {
		if (!(isalnum((unsigned char) *c) || *c == '_')) {
			return 0;
		}
	}
	return 1;
}

/* Cari nilai `userid` di dalam params hasil dekripsi (Plan_02.md §9.4/§9.5
 * poin 2): kalau params[0] object dengan key "userid"/"user_id", ambil dari
 * situ; kalau tidak, cari object {userid} di elemen manapun. Return pointer
 * zval milik params (TIDAK di-copy), atau NULL kalau tidak ada. */
static zval *nxdom_outside_find_userid(zval *params)
{
	if (Z_TYPE_P(params) != IS_ARRAY) {
		return NULL;
	}

	zval *first = zend_hash_index_find(Z_ARRVAL_P(params), 0);
	if (first && Z_TYPE_P(first) == IS_ARRAY) {
		zval *uid = zend_hash_str_find(Z_ARRVAL_P(first), "userid", sizeof("userid") - 1);
		if (!uid) {
			uid = zend_hash_str_find(Z_ARRVAL_P(first), "user_id", sizeof("user_id") - 1);
		}
		if (uid) {
			return uid;
		}
	}

	zval *entry;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(params), entry) {
		if (Z_TYPE_P(entry) != IS_ARRAY) continue;
		zval *uid = zend_hash_str_find(Z_ARRVAL_P(entry), "userid", sizeof("userid") - 1);
		if (!uid) {
			uid = zend_hash_str_find(Z_ARRVAL_P(entry), "user_id", sizeof("user_id") - 1);
		}
		if (uid) {
			return uid;
		}
	} ZEND_HASH_FOREACH_END();

	return NULL;
}

/* Resolve nilai placeholder policy untuk [col, op, val]:
 *  - "$auth.userId" → userid dari params (kalau tidak ada → out_found=0)
 *  - "$param.N"     → params[N] (kalau indeks tidak ada → out_found=0)
 *  - selain itu     → literal policy apa adanya (out_found selalu 1)
 * out_found menandakan ada/tidaknya nilai; caller memutuskan bagaimana
 * menghadapi nilai yang tidak ketemu (Plan_02.md §9.2). */
static void nxdom_outside_resolve_value(zval *val, zval *params, zval *out, int *out_found)
{
	*out_found = 1;

	if (Z_TYPE_P(val) != IS_STRING) {
		ZVAL_COPY(out, val);
		return;
	}

	const char *s = Z_STRVAL_P(val);

	if (strcmp(s, "$auth.userId") == 0) {
		zval *uid = nxdom_outside_find_userid(params);
		if (!uid) {
			*out_found = 0;
			ZVAL_NULL(out);
			return;
		}
		ZVAL_COPY(out, uid);
		return;
	}

	if (strncmp(s, "$param.", sizeof("$param.") - 1) == 0) {
		const char *idx_str = s + sizeof("$param.") - 1;
		if (!*idx_str) {
			*out_found = 0;
			ZVAL_NULL(out);
			return;
		}
		for (const char *c = idx_str; *c; c++) {
			if (!isdigit((unsigned char) *c)) {
				*out_found = 0;
				ZVAL_NULL(out);
				return;
			}
		}
		zend_long idx = zend_strtod(idx_str, NULL);
		zval *pv = zend_hash_index_find(Z_ARRVAL_P(params), (zend_ulong) idx);
		if (!pv) {
			*out_found = 0;
			ZVAL_NULL(out);
			return;
		}
		ZVAL_COPY(out, pv);
		return;
	}

	ZVAL_COPY(out, val);
}

/* Bangun & jalankan query dari resep policy.models[model][method]. */
static void nxdom_handle_outside(nxdom_app_context *ctx, zval *pdo)
{
	zval body;
	nxdom_json_body(&body);

	zval *model_zv = zend_hash_str_find(Z_ARRVAL(body), "model", sizeof("model") - 1);
	zval *method_zv = zend_hash_str_find(Z_ARRVAL(body), "method", sizeof("method") - 1);

	if (!model_zv || Z_TYPE_P(model_zv) != IS_STRING
		|| !method_zv || Z_TYPE_P(method_zv) != IS_STRING
	) {
		zval_ptr_dtor(&body);
		nxdom_response_error(400, "Field 'model' dan 'method' wajib ada");
		return;
	}

	if (!nxdom_outside_is_name(Z_STRVAL_P(model_zv)) || !nxdom_outside_is_name(Z_STRVAL_P(method_zv))) {
		zval_ptr_dtor(&body);
		nxdom_response_error(400, "Nama model/method tidak valid");
		return;
	}

	/* params: string ter-encrypt (NexaEncrypt, NexaStorage.js) atau array
	 * JSON polos (jalur lama/test). String → decrypt; kalau gagal decrypt,
	 * coba json_decode langsung (toleran); kalau tetap gagal → tolak.
	 * params BOLEH tidak ada (mis. resep tanpa $param.N) → array kosong. */
	zval *params_zv = zend_hash_str_find(Z_ARRVAL(body), "params", sizeof("params") - 1);
	zval params;
	zend_bool params_ok = 0;
	if (!params_zv) {
		array_init(&params);
		params_ok = 1;
	} else if (Z_TYPE_P(params_zv) == IS_ARRAY) {
		ZVAL_COPY(&params, params_zv);
		params_ok = 1;
	} else if (Z_TYPE_P(params_zv) == IS_STRING) {
		if (nxdom_nexa_decrypt(Z_STRVAL_P(params_zv), Z_STRLEN_P(params_zv), &params) == SUCCESS) {
			params_ok = 1;
		} else {
			/* Fallback: string JSON polos (mis. dikirim sebagai string). */
			zval func_name, arg, true_arg, retval;
			ZVAL_STRING(&func_name, "json_decode");
			ZVAL_STR_COPY(&arg, Z_STR_P(params_zv));
			ZVAL_TRUE(&true_arg);
			zval args[2] = { arg, true_arg };
			if (call_user_function(NULL, NULL, &func_name, &retval, 2, args) == SUCCESS && Z_TYPE(retval) == IS_ARRAY) {
				ZVAL_COPY_VALUE(&params, &retval);
				params_ok = 1;
			} else {
				zval_ptr_dtor(&retval);
			}
			zval_ptr_dtor(&func_name);
			zval_ptr_dtor(&arg);
		}
	}

	if (!params_ok) {
		zval_ptr_dtor(&body);
		nxdom_response_error(400, "Parameter 'params' tidak valid");
		return;
	}

	zval policy;
	nxdom_app_context_load_policy(ctx, &policy);

	zval *models = zend_hash_str_find(Z_ARRVAL(policy), "models", sizeof("models") - 1);
	zval *model_def = (models && Z_TYPE_P(models) == IS_ARRAY)
		? zend_hash_str_find(Z_ARRVAL_P(models), Z_STRVAL_P(model_zv), Z_STRLEN_P(model_zv))
		: NULL;

	if (!model_def || Z_TYPE_P(model_def) != IS_ARRAY) {
		zval_ptr_dtor(&policy);
		zval_ptr_dtor(&params);
		zval_ptr_dtor(&body);
		nxdom_response_error(404, "Method not found");
		return;
	}

	zval *recipe = zend_hash_str_find(Z_ARRVAL_P(model_def), Z_STRVAL_P(method_zv), Z_STRLEN_P(method_zv));
	if (!recipe || Z_TYPE_P(recipe) != IS_ARRAY) {
		zval_ptr_dtor(&policy);
		zval_ptr_dtor(&params);
		zval_ptr_dtor(&body);
		nxdom_response_error(404, "Method not found");
		return;
	}

	/* Resolve tabel: fixed, atau tableParam true → params[0] wajib ada di
	 * allowedTables (whitelist tertutup, Plan_02.md §9.2). */
	zval *table_zv = zend_hash_str_find(Z_ARRVAL_P(recipe), "table", sizeof("table") - 1);
	zval *table_param_zv = zend_hash_str_find(Z_ARRVAL_P(recipe), "tableParam", sizeof("tableParam") - 1);
	zend_bool table_from_param = table_param_zv && Z_TYPE_P(table_param_zv) == IS_TRUE;

	zend_string *table_name = NULL;

	if (table_from_param) {
		zval *p0 = zend_hash_index_find(Z_ARRVAL(params), 0);
		if (!p0 || Z_TYPE_P(p0) != IS_STRING) {
			zval_ptr_dtor(&policy);
			zval_ptr_dtor(&params);
			zval_ptr_dtor(&body);
			nxdom_response_error(400, "Parameter tabel tidak valid");
			return;
		}
		const char *chosen = Z_STRVAL_P(p0);

		zval *allowed = zend_hash_str_find(Z_ARRVAL_P(recipe), "allowedTables", sizeof("allowedTables") - 1);
		int ok = 0;
		if (allowed && Z_TYPE_P(allowed) == IS_ARRAY) {
			zval *a;
			ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(allowed), a) {
				if (Z_TYPE_P(a) == IS_STRING && strcmp(Z_STRVAL_P(a), chosen) == 0) { ok = 1; break; }
			} ZEND_HASH_FOREACH_END();
		}
		if (!ok) {
			zval_ptr_dtor(&policy);
			zval_ptr_dtor(&params);
			zval_ptr_dtor(&body);
			nxdom_response_error(403, "Table not allowed");
			return;
		}
		table_name = zend_string_init(chosen, strlen(chosen), 0);
	} else if (table_zv && Z_TYPE_P(table_zv) == IS_STRING) {
		table_name = zend_string_init(Z_STRVAL_P(table_zv), Z_STRLEN_P(table_zv), 0);
	} else {
		zval_ptr_dtor(&policy);
		zval_ptr_dtor(&params);
		zval_ptr_dtor(&body);
		nxdom_response_error(500, "Resep policy tidak punya tabel");
		return;
	}

	nxdom_query_builder *qb = nxdom_qb_create(pdo, ZSTR_VAL(table_name));
	if (!qb) {
		zend_string_release(table_name);
		zval_ptr_dtor(&policy);
		zval_ptr_dtor(&params);
		zval_ptr_dtor(&body);
		nxdom_response_error(500, "Nama tabel tidak valid");
		return;
	}

	int failed = 0;
	const char *fail_msg = NULL;

	zval *select_zv = zend_hash_str_find(Z_ARRVAL_P(recipe), "select", sizeof("select") - 1);
	if (select_zv && Z_TYPE_P(select_zv) == IS_ARRAY && nxdom_qb_set_select(qb, select_zv) != SUCCESS) {
		failed = 1;
		fail_msg = nxdom_qb_last_error(qb);
	}

	zval *where_list = zend_hash_str_find(Z_ARRVAL_P(recipe), "where", sizeof("where") - 1);
	if (!failed && where_list && Z_TYPE_P(where_list) == IS_ARRAY) {
		zval *cond;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(where_list), cond) {
			if (Z_TYPE_P(cond) != IS_ARRAY || zend_hash_num_elements(Z_ARRVAL_P(cond)) != 3) {
				continue;
			}
			zval *col = zend_hash_index_find(Z_ARRVAL_P(cond), 0);
			zval *op = zend_hash_index_find(Z_ARRVAL_P(cond), 1);
			zval *val = zend_hash_index_find(Z_ARRVAL_P(cond), 2);
			if (Z_TYPE_P(col) != IS_STRING || Z_TYPE_P(op) != IS_STRING) {
				continue;
			}

			zval resolved;
			int found = 0;
			nxdom_outside_resolve_value(val, &params, &resolved, &found);
			if (!found) {
				/* Placeholder tidak punya nilai (mis. $auth.userId tanpa
				 * userid) — guard: tolak, jangan jalankan query tanpa
				 * constraint yang seharusnya ada (Plan_02.md §9.2). */
				failed = 1;
				fail_msg = "Parameter wajib tidak tersedia di request";
				zval_ptr_dtor(&resolved);
				break;
			}

			if (nxdom_qb_where(qb, Z_STRVAL_P(col), Z_STRVAL_P(op), &resolved) != SUCCESS) {
				failed = 1;
				fail_msg = nxdom_qb_last_error(qb);
				zval_ptr_dtor(&resolved);
				break;
			}
			zval_ptr_dtor(&resolved);
		} ZEND_HASH_FOREACH_END();
	}

	zval *order_list = zend_hash_str_find(Z_ARRVAL_P(recipe), "orderBy", sizeof("orderBy") - 1);
	if (!failed && order_list && Z_TYPE_P(order_list) == IS_ARRAY) {
		zval *order;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(order_list), order) {
			if (Z_TYPE_P(order) != IS_ARRAY) continue;
			zval *col = zend_hash_str_find(Z_ARRVAL_P(order), "column", sizeof("column") - 1);
			zval *dir = zend_hash_str_find(Z_ARRVAL_P(order), "direction", sizeof("direction") - 1);
			if (!col || Z_TYPE_P(col) != IS_STRING) continue;
			const char *dir_str = (dir && Z_TYPE_P(dir) == IS_STRING) ? Z_STRVAL_P(dir) : "asc";
			if (nxdom_qb_order_by(qb, Z_STRVAL_P(col), dir_str) != SUCCESS) {
				failed = 1;
				fail_msg = nxdom_qb_last_error(qb);
				break;
			}
		} ZEND_HASH_FOREACH_END();
	}

	zval *group_zv = zend_hash_str_find(Z_ARRVAL_P(recipe), "groupBy", sizeof("groupBy") - 1);
	if (!failed && group_zv && Z_TYPE_P(group_zv) == IS_ARRAY && nxdom_qb_set_group_by(qb, group_zv) != SUCCESS) {
		failed = 1;
		fail_msg = nxdom_qb_last_error(qb);
	}

	zval *limit_zv = zend_hash_str_find(Z_ARRVAL_P(recipe), "limit", sizeof("limit") - 1);
	if (!failed && limit_zv && Z_TYPE_P(limit_zv) == IS_LONG) {
		nxdom_qb_limit(qb, Z_LVAL_P(limit_zv));
	}

	zval *single_zv = zend_hash_str_find(Z_ARRVAL_P(recipe), "single", sizeof("single") - 1);
	zend_bool single = single_zv && Z_TYPE_P(single_zv) == IS_TRUE;

	if (failed) {
		nxdom_qb_free(qb);
		zend_string_release(table_name);
		zval_ptr_dtor(&policy);
		zval_ptr_dtor(&params);
		zval_ptr_dtor(&body);
		nxdom_response_error(400, fail_msg ? fail_msg : "Resep policy tidak valid");
		return;
	}

	if (single) {
		nxdom_qb_limit(qb, 1);
		zval rows;
		if (nxdom_qb_get(qb, &rows) == SUCCESS) {
			zval *first = zend_hash_index_find(Z_ARRVAL(rows), 0);
			zval result;
			if (first) {
				ZVAL_COPY(&result, first);
			} else {
				ZVAL_NULL(&result);
			}
			zval_ptr_dtor(&rows);
			nxdom_response_ok(&result);
		}
	} else {
		zval rows;
		if (nxdom_qb_get(qb, &rows) == SUCCESS) {
			nxdom_response_ok(&rows);
		}
	}

	nxdom_qb_free(qb);
	zend_string_release(table_name);
	zval_ptr_dtor(&policy);
	zval_ptr_dtor(&params);
	zval_ptr_dtor(&body);
}

/* Port dari Router::dispatchAuth() catch (AuthException $e) / catch
 * (PDOException $e): AuthException-setara (status+message dari
 * nxdom_auth_*) dibalas apa adanya; PDOException-setara (EG(exception)
 * masih set tanpa status/message — lihat nxdom_auth.h) dibalas 500
 * generik + di-log, exception di-clear supaya tidak "bocor" ke request
 * berikutnya. */
static void nxdom_respond_auth_failure(int status, zend_string *message)
{
	if (EG(exception)) {
		php_error_docref(NULL, E_WARNING, "[nxdom] PDOException (auth)");
		zend_clear_exception();
		nxdom_response_error(500, "Database error");
		return;
	}
	nxdom_response_error(status, ZSTR_VAL(message));
	zend_string_release(message);
}

static void nxdom_dispatch_auth(nxdom_app_context *ctx, zval *pdo, zval *route)
{
	const char *action = Z_STRVAL_P(zend_hash_str_find(Z_ARRVAL_P(route), "action", sizeof("action") - 1));
	int status;
	zend_string *message;
	zval result;

	if (strcmp(action, "register") == 0) {
		zval body;
		nxdom_json_body(&body);
		zend_result r = nxdom_auth_register(ctx, pdo, &body, &result, &status, &message);
		zval_ptr_dtor(&body);
		if (r != SUCCESS) {
			nxdom_respond_auth_failure(status, message);
			return;
		}
		nxdom_response_created(&result);
		return;
	}

	if (strcmp(action, "login") == 0) {
		zval body;
		nxdom_json_body(&body);
		zend_result r = nxdom_auth_login(ctx, pdo, &body, &result, &status, &message);
		zval_ptr_dtor(&body);
		if (r != SUCCESS) {
			nxdom_respond_auth_failure(status, message);
			return;
		}
		nxdom_response_ok(&result);
		return;
	}

	if (strcmp(action, "logout") == 0) {
		nxdom_auth_logout(ctx);
		zval body;
		array_init(&body);
		add_assoc_bool(&body, "loggedOut", 1);
		nxdom_response_json(200, &body);
		return;
	}

	if (strcmp(action, "me") == 0) {
		if (nxdom_auth_me(ctx, pdo, &result) != SUCCESS) {
			php_error_docref(NULL, E_WARNING, "[nxdom] PDOException (auth me)");
			zend_clear_exception();
			nxdom_response_error(500, "Database error");
			return;
		}
		if (Z_TYPE(result) == IS_NULL) {
			nxdom_response_error(401, "Belum login");
			return;
		}
		nxdom_response_ok(&result);
		return;
	}
}

/* Kirim halaman HTML statis dari <DOCUMENT_ROOT>/pages/<page>.html untuk
 * route action "page" (mis. { path:"/about", action:"page", page:"about" }).
 * `page` WAJIB identifier sederhana (dicek sebelum sampai sini) — mencegah
 * path traversal. Tidak butuh koneksi database sama sekali. */
static void nxdom_handle_page(nxdom_app_context *ctx, zval *route)
{
	zval *page_zv = zend_hash_str_find(Z_ARRVAL_P(route), "page", sizeof("page") - 1);
	if (!page_zv || Z_TYPE_P(page_zv) != IS_STRING) {
		nxdom_response_error(500, "Route 'page' tanpa field 'page'");
		return;
	}

	const char *page = Z_STRVAL_P(page_zv);

	/* Validasi: identifier sederhana saja (tanpa '/', '.', '-', dst.) —
	 * WAJIB, mencegah 'page' berisi '../' menembus direktori. */
	if (!nxdom_outside_is_name(page)) {
		nxdom_response_error(400, "Nama page tidak valid");
		return;
	}

	zend_string *file_path = zend_strpprintf(0, "%s/pages/%s.html", ZSTR_VAL(ctx->base_path), page);
	zend_string *html = nxdom_read_file(ZSTR_VAL(file_path));

	if (!html) {
		zend_string_release(file_path);
		nxdom_response_error(404, "Halaman tidak ditemukan");
		return;
	}

	SG(sapi_headers).http_response_code = 200;
	char content_type[] = "Content-Type: text/html; charset=utf-8";
	sapi_add_header(content_type, sizeof(content_type) - 1, 1);
	php_write(ZSTR_VAL(html), ZSTR_LEN(html));

	zend_string_release(html);
	zend_string_release(file_path);
}

void nxdom_router_dispatch(nxdom_app_context *ctx, zval *route, zval *params)
{
	zval *auth_flag0 = zend_hash_str_find(Z_ARRVAL_P(route), "auth", sizeof("auth") - 1);
	const char *action0 = Z_STRVAL_P(zend_hash_str_find(Z_ARRVAL_P(route), "action", sizeof("action") - 1));

	/* Route halaman (action "page") TIDAK butuh database — tangani lebih
	 * dulu, sebelum connect PDO. */
	if (strcmp(action0, "page") == 0) {
		if (auth_flag0 && Z_TYPE_P(auth_flag0) == IS_TRUE && !nxdom_auth_is_authenticated(ctx)) {
			nxdom_response_error(401, "Autentikasi diperlukan");
			return;
		}
		nxdom_handle_page(ctx, route);
		return;
	}

	zval pdo;
	if (nxdom_database_connect(&ctx->database, ZSTR_VAL(ctx->base_path), &pdo) != SUCCESS) {
		if (EG(exception)) zend_clear_exception();
		nxdom_response_error(500, "Database error");
		return;
	}

	zval *auth_flag = zend_hash_str_find(Z_ARRVAL_P(route), "auth", sizeof("auth") - 1);
	if (auth_flag && Z_TYPE_P(auth_flag) == IS_TRUE && !nxdom_auth_is_authenticated(ctx)) {
		zval_ptr_dtor(&pdo);
		nxdom_response_error(401, "Autentikasi diperlukan");
		return;
	}

	const char *action = Z_STRVAL_P(zend_hash_str_find(Z_ARRVAL_P(route), "action", sizeof("action") - 1));

	/* Cabang /api/outside (jalur model NXUI Storage().models()) — dicek
	 * SEBELUM CRUD supaya resource "outside" tidak disalahartikan sebagai
	 * nama tabel. Lihat Plan_02.md §9. */
	if (strcmp(action, "outside") == 0) {
		nxdom_handle_outside(ctx, &pdo);
		if (EG(exception)) {
			php_error_docref(NULL, E_WARNING, "[nxdom] PDOException (outside)");
			zend_clear_exception();
			nxdom_response_error(500, "Database error");
		}
		zval_ptr_dtor(&pdo);
		return;
	}

	if (nxdom_action_in(action, AUTH_ACTIONS)) {
		nxdom_dispatch_auth(ctx, &pdo, route);
		zval_ptr_dtor(&pdo);
		return;
	}

	if (!nxdom_action_in(action, CRUD_ACTIONS)) {
		zend_string *msg = zend_strpprintf(0, "Action tidak dikenal: %s", action);
		nxdom_response_error(500, ZSTR_VAL(msg));
		zend_string_release(msg);
		zval_ptr_dtor(&pdo);
		return;
	}

	zval *resource = zend_hash_str_find(Z_ARRVAL_P(route), "resource", sizeof("resource") - 1);
	nxdom_query_builder *qb = nxdom_qb_create(&pdo, Z_STRVAL_P(resource));
	if (!qb) {
		nxdom_response_error(400, "Nama resource tidak valid");
		zval_ptr_dtor(&pdo);
		return;
	}

	zval *constraints = zend_hash_str_find(Z_ARRVAL_P(route), "constraints", sizeof("constraints") - 1);

	if (strcmp(action, "query") == 0) {
		nxdom_handle_query(qb, constraints);
	} else if (strcmp(action, "get") == 0) {
		nxdom_handle_get(qb, params, route);
	} else if (strcmp(action, "create") == 0) {
		nxdom_handle_create(qb, constraints);
	} else if (strcmp(action, "update") == 0) {
		nxdom_handle_update(qb, params, route, constraints);
	} else if (strcmp(action, "delete") == 0) {
		nxdom_handle_delete(qb, params, route);
	}

	if (EG(exception)) {
		php_error_docref(NULL, E_WARNING, "[nxdom] PDOException");
		zend_clear_exception();
		nxdom_response_error(500, "Database error");
	}

	nxdom_qb_free(qb);
	zval_ptr_dtor(&pdo);
}
