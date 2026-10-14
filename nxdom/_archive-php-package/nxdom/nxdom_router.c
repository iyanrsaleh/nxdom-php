#include "php.h"
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
	/* $_GET diakses lewat EG(symbol_table), pola sama seperti $_SESSION
	 * di nxdom_auth.c — bukan struct PG(http_globals) yang lebih rumit
	 * untuk kasus baca-saja sederhana seperti ini. */
	zval *get = zend_hash_str_find(&EG(symbol_table), "_GET", sizeof("_GET") - 1);
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

	zval *get = zend_hash_str_find(&EG(symbol_table), "_GET", sizeof("_GET") - 1);
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

void nxdom_router_dispatch(nxdom_app_context *ctx, zval *route, zval *params)
{
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
