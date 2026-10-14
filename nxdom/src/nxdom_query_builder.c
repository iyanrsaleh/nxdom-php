#include "php.h"
#include "zend_smart_str.h"
#include "nxdom_query_builder.h"
#include "nxdom_call.h"

/* PDO::PARAM_STR = 2, cukup untuk bind_value kalau dibutuhkan — tapi kita
 * pakai execute($assocArray) yang auto-detect tipe, sama seperti PHP asli
 * ($stmt->execute($params)), jadi konstanta ini tidak dipakai langsung. */

static int nxdom_is_identifier(const char *s)
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

static const char *ALLOWED_OPERATORS[] = { "=", "!=", ">", ">=", "<", "<=", "like", "in", NULL };

static int nxdom_is_allowed_operator(const char *op)
{
	for (int i = 0; ALLOWED_OPERATORS[i]; i++) {
		if (strcmp(ALLOWED_OPERATORS[i], op) == 0) {
			return 1;
		}
	}
	return 0;
}

nxdom_query_builder *nxdom_qb_create(zval *pdo, const char *table)
{
	if (!nxdom_is_identifier(table)) {
		return NULL;
	}

	nxdom_query_builder *qb = emalloc(sizeof(nxdom_query_builder));
	ZVAL_COPY_VALUE(&qb->pdo, pdo);
	qb->table = zend_string_init(table, strlen(table), 0);
	array_init(&qb->wheres);
	array_init(&qb->order_by);
	array_init(&qb->select);
	array_init(&qb->group_by);
	qb->has_limit = 0;
	qb->limit = 0;
	qb->has_offset = 0;
	qb->offset = 0;
	return qb;
}

void nxdom_qb_free(nxdom_query_builder *qb)
{
	if (!qb) return;
	zend_string_release(qb->table);
	zval_ptr_dtor(&qb->wheres);
	zval_ptr_dtor(&qb->order_by);
	zval_ptr_dtor(&qb->select);
	zval_ptr_dtor(&qb->group_by);
	efree(qb);
}

/* qb->pdo/table/wheres/order_by/has_limit/limit disalin isinya (bukan
 * struct-nya) ke qb baru — dipakai find(), yang di PHP memakai clone $this
 * supaya where('id','=',$id)->limit(1) tidak mengubah instance asli. */
static nxdom_query_builder *nxdom_qb_clone(nxdom_query_builder *src)
{
	nxdom_query_builder *dst = emalloc(sizeof(nxdom_query_builder));
	ZVAL_COPY_VALUE(&dst->pdo, &src->pdo);
	dst->table = zend_string_copy(src->table);
	ZVAL_DUP(&dst->wheres, &src->wheres);
	ZVAL_DUP(&dst->order_by, &src->order_by);
	ZVAL_DUP(&dst->select, &src->select);
	ZVAL_DUP(&dst->group_by, &src->group_by);
	dst->has_limit = src->has_limit;
	dst->limit = src->limit;
	dst->has_offset = src->has_offset;
	dst->offset = src->offset;
	return dst;
}

ZEND_TLS char last_error_buf[256];
ZEND_TLS int has_last_error = 0;

static void nxdom_qb_set_error(const char *fmt, const char *arg)
{
	snprintf(last_error_buf, sizeof(last_error_buf), fmt, arg);
	has_last_error = 1;
}

const char *nxdom_qb_last_error(nxdom_query_builder *qb)
{
	(void) qb;
	return has_last_error ? last_error_buf : NULL;
}

zend_result nxdom_qb_where(nxdom_query_builder *qb, const char *column, const char *op, zval *value)
{
	has_last_error = 0;

	if (!nxdom_is_allowed_operator(op)) {
		nxdom_qb_set_error("Operator tidak diizinkan: %s", op);
		return FAILURE;
	}
	if (!nxdom_is_identifier(column)) {
		nxdom_qb_set_error("Nama kolom tidak valid: %s", column);
		return FAILURE;
	}

	zval condition;
	array_init(&condition);
	add_next_index_string(&condition, column);
	add_next_index_string(&condition, op);
	zval value_copy;
	ZVAL_COPY(&value_copy, value);
	add_next_index_zval(&condition, &value_copy);

	add_next_index_zval(&qb->wheres, &condition);
	return SUCCESS;
}

zend_result nxdom_qb_order_by(nxdom_query_builder *qb, const char *column, const char *direction)
{
	has_last_error = 0;

	if (!nxdom_is_identifier(column)) {
		nxdom_qb_set_error("Nama kolom tidak valid: %s", column);
		return FAILURE;
	}

	int is_desc = direction && strcasecmp(direction, "desc") == 0;
	zend_string *entry = zend_strpprintf(0, "%s %s", column, is_desc ? "DESC" : "ASC");
	add_next_index_str(&qb->order_by, entry);
	return SUCCESS;
}

zend_result nxdom_qb_replace_order_by(nxdom_query_builder *qb, const char *column, const char *direction)
{
	zval_ptr_dtor(&qb->order_by);
	array_init(&qb->order_by);
	return nxdom_qb_order_by(qb, column, direction);
}

void nxdom_qb_limit(nxdom_query_builder *qb, zend_long limit)
{
	qb->has_limit = 1;
	qb->limit = limit;
}

void nxdom_qb_offset(nxdom_query_builder *qb, zend_long offset)
{
	qb->has_offset = 1;
	qb->offset = offset;
}

/* Ganti isi qb->select/group_by dari array kolom policy. Setiap kolom
 * wajib identifier valid (bukan dari input client mentah — policy adalah
 * sumber tepercaya, tapi tetap divalidasi untuk mencegah salah tulis
 * policy jadi celah interpolasi). Return FAILURE pada kolom tidak valid. */
static zend_result nxdom_qb_fill_columns(nxdom_query_builder *qb, zval *dst, zval *columns)
{
	zval_ptr_dtor(dst);
	array_init(dst);

	if (!columns || Z_TYPE_P(columns) != IS_ARRAY) {
		return SUCCESS;
	}

	zval *col;
	ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(columns), col) {
		if (Z_TYPE_P(col) != IS_STRING) {
			continue;
		}
		if (!nxdom_is_identifier(Z_STRVAL_P(col))) {
			nxdom_qb_set_error("Nama kolom tidak valid: %s", Z_STRVAL_P(col));
			return FAILURE;
		}
		add_next_index_str(dst, zend_string_copy(Z_STR_P(col)));
	} ZEND_HASH_FOREACH_END();

	return SUCCESS;
}

zend_result nxdom_qb_set_select(nxdom_query_builder *qb, zval *columns)
{
	has_last_error = 0;
	return nxdom_qb_fill_columns(qb, &qb->select, columns);
}

zend_result nxdom_qb_set_group_by(nxdom_query_builder *qb, zval *columns)
{
	has_last_error = 0;
	return nxdom_qb_fill_columns(qb, &qb->group_by, columns);
}

zend_result nxdom_qb_set_select_one(nxdom_query_builder *qb, const char *column)
{
	has_last_error = 0;

	if (!nxdom_is_identifier(column)) {
		nxdom_qb_set_error("Nama kolom tidak valid: %s", column);
		return FAILURE;
	}

	zval_ptr_dtor(&qb->select);
	array_init(&qb->select);
	add_next_index_string(&qb->select, column);
	return SUCCESS;
}

zend_result nxdom_qb_apply_constraints(nxdom_query_builder *qb, zval *constraints)
{
	zval *where_list = zend_hash_str_find(Z_ARRVAL_P(constraints), "where", sizeof("where") - 1);
	if (where_list && Z_TYPE_P(where_list) == IS_ARRAY) {
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
			if (nxdom_qb_where(qb, Z_STRVAL_P(col), Z_STRVAL_P(op), val) != SUCCESS) {
				return FAILURE;
			}
		} ZEND_HASH_FOREACH_END();
	}

	zval *order_list = zend_hash_str_find(Z_ARRVAL_P(constraints), "orderBy", sizeof("orderBy") - 1);
	if (order_list && Z_TYPE_P(order_list) == IS_ARRAY) {
		zval *order;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(order_list), order) {
			if (Z_TYPE_P(order) != IS_ARRAY) continue;
			zval *col = zend_hash_str_find(Z_ARRVAL_P(order), "column", sizeof("column") - 1);
			zval *dir = zend_hash_str_find(Z_ARRVAL_P(order), "direction", sizeof("direction") - 1);
			if (!col || Z_TYPE_P(col) != IS_STRING) continue;
			const char *dir_str = (dir && Z_TYPE_P(dir) == IS_STRING) ? Z_STRVAL_P(dir) : "asc";
			if (nxdom_qb_order_by(qb, Z_STRVAL_P(col), dir_str) != SUCCESS) {
				return FAILURE;
			}
		} ZEND_HASH_FOREACH_END();
	}

	zval *limit_zv = zend_hash_str_find(Z_ARRVAL_P(constraints), "limit", sizeof("limit") - 1);
	if (limit_zv && Z_TYPE_P(limit_zv) == IS_LONG) {
		nxdom_qb_limit(qb, Z_LVAL_P(limit_zv));
	}

	return SUCCESS;
}

/* Bangun klausa WHERE + params bind (format ["nama_param" => value, ...])
 * — sama seperti QueryBuilder::buildWhere() PHP: operator 'in' meledak
 * jadi beberapa placeholder w{i}_{col}_{j}, '!=' jadi '<>' di SQL,
 * boolean value di-cast ke int (PDO tidak selalu handle bool konsisten
 * lintas driver). out_params dimiliki caller (zval_ptr_dtor setelah
 * selesai). Return zend_string* SQL (dimiliki caller, zend_string_release
 * setelah selesai) — string kosong (bukan NULL) kalau tidak ada where. */
static zend_string *nxdom_qb_build_where(nxdom_query_builder *qb, zval *out_params)
{
	array_init(out_params);

	uint32_t count = zend_hash_num_elements(Z_ARRVAL(qb->wheres));
	if (count == 0) {
		return ZSTR_EMPTY_ALLOC();
	}

	smart_str clauses = {0};
	zend_long i = 0;
	zval *cond;

	ZEND_HASH_FOREACH_VAL(Z_ARRVAL(qb->wheres), cond) {
		zval *col = zend_hash_index_find(Z_ARRVAL_P(cond), 0);
		zval *op = zend_hash_index_find(Z_ARRVAL_P(cond), 1);
		zval *val = zend_hash_index_find(Z_ARRVAL_P(cond), 2);
		const char *column = Z_STRVAL_P(col);
		const char *operator_ = Z_STRVAL_P(op);

		if (i > 0) {
			smart_str_appends(&clauses, " AND ");
		}

		if (strcmp(operator_, "in") == 0) {
			smart_str_appends(&clauses, column);
			smart_str_appends(&clauses, " IN (");

			HashTable *values = (Z_TYPE_P(val) == IS_ARRAY) ? Z_ARRVAL_P(val) : NULL;
			zval single_value_arr;
			if (!values) {
				array_init(&single_value_arr);
				zval val_copy;
				ZVAL_COPY(&val_copy, val);
				add_next_index_zval(&single_value_arr, &val_copy);
				values = Z_ARRVAL(single_value_arr);
			}

			zend_long j = 0;
			zval *v;
			ZEND_HASH_FOREACH_VAL(values, v) {
				if (j > 0) smart_str_appends(&clauses, ", ");
				zend_string *param_name = zend_strpprintf(0, "w%d_%s_%d", (int) i, column, (int) j);
				smart_str_appendc(&clauses, ':');
				smart_str_append(&clauses, param_name);

				zval param_value;
				ZVAL_COPY(&param_value, v);
				add_assoc_zval_ex(out_params, ZSTR_VAL(param_name), ZSTR_LEN(param_name), &param_value);
				zend_string_release(param_name);
				j++;
			} ZEND_HASH_FOREACH_END();

			if (!(Z_TYPE_P(val) == IS_ARRAY)) {
				zval_ptr_dtor(&single_value_arr);
			}

			smart_str_appendc(&clauses, ')');
		} else {
			const char *sql_operator = strcmp(operator_, "!=") == 0 ? "<>" : operator_;
			zend_string *param_name = zend_strpprintf(0, "w%d_%s", (int) i, column);

			smart_str_appends(&clauses, column);
			smart_str_appendc(&clauses, ' ');
			smart_str_appends(&clauses, sql_operator);
			smart_str_appends(&clauses, " :");
			smart_str_append(&clauses, param_name);

			zval param_value;
			if (Z_TYPE_P(val) == IS_TRUE) {
				ZVAL_LONG(&param_value, 1);
			} else if (Z_TYPE_P(val) == IS_FALSE) {
				ZVAL_LONG(&param_value, 0);
			} else {
				ZVAL_COPY(&param_value, val);
			}
			add_assoc_zval_ex(out_params, ZSTR_VAL(param_name), ZSTR_LEN(param_name), &param_value);
			zend_string_release(param_name);
		}

		i++;
	} ZEND_HASH_FOREACH_END();

	smart_str_0(&clauses);
	zend_string *result = zend_string_copy(clauses.s);
	smart_str_free(&clauses);
	return result;
}

/* prepare($sql) lalu execute($params), return statement object (PDOStatement)
 * atau FAILURE (exception dari PDO tetap ada di EG(exception)). */
static zend_result nxdom_pdo_prepare_execute(zval *pdo, zend_string *sql, zval *params, zval *out_stmt)
{
	zval sql_zv;
	ZVAL_STR_COPY(&sql_zv, sql);

	if (nxdom_call_method(pdo, "prepare", 1, &sql_zv, out_stmt) != SUCCESS) {
		zval_ptr_dtor(&sql_zv);
		return FAILURE;
	}
	zval_ptr_dtor(&sql_zv);

	zval exec_retval;
	zend_result status = nxdom_call_method(out_stmt, "execute", 1, params, &exec_retval);
	if (status == SUCCESS) {
		zval_ptr_dtor(&exec_retval);
	} else {
		zval_ptr_dtor(out_stmt);
	}
	return status;
}

zend_result nxdom_qb_get(nxdom_query_builder *qb, zval *out_result)
{
	zval params;
	zend_string *where_sql = nxdom_qb_build_where(qb, &params);

	smart_str sql = {0};
	smart_str_appends(&sql, "SELECT ");
	if (zend_hash_num_elements(Z_ARRVAL(qb->select)) > 0) {
		zval *col;
		zend_bool first_col = 1;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL(qb->select), col) {
			if (!first_col) smart_str_appends(&sql, ", ");
			smart_str_append(&sql, Z_STR_P(col));
			first_col = 0;
		} ZEND_HASH_FOREACH_END();
	} else {
		smart_str_appendc(&sql, '*');
	}
	smart_str_appends(&sql, " FROM ");
	smart_str_append(&sql, qb->table);
	if (ZSTR_LEN(where_sql) > 0) {
		smart_str_appends(&sql, " WHERE ");
		smart_str_append(&sql, where_sql);
	}
	if (zend_hash_num_elements(Z_ARRVAL(qb->group_by)) > 0) {
		smart_str_appends(&sql, " GROUP BY ");
		zval *gcol;
		zend_bool first_group = 1;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL(qb->group_by), gcol) {
			if (!first_group) smart_str_appends(&sql, ", ");
			smart_str_append(&sql, Z_STR_P(gcol));
			first_group = 0;
		} ZEND_HASH_FOREACH_END();
	}
	if (zend_hash_num_elements(Z_ARRVAL(qb->order_by)) > 0) {
		smart_str_appends(&sql, " ORDER BY ");
		zval *part;
		zend_bool first = 1;
		ZEND_HASH_FOREACH_VAL(Z_ARRVAL(qb->order_by), part) {
			if (!first) smart_str_appends(&sql, ", ");
			smart_str_append(&sql, Z_STR_P(part));
			first = 0;
		} ZEND_HASH_FOREACH_END();
	}
	if (qb->has_limit) {
		smart_str_appends(&sql, " LIMIT ");
		smart_str_append_long(&sql, qb->limit);
		if (qb->has_offset) {
			smart_str_appends(&sql, " OFFSET ");
			smart_str_append_long(&sql, qb->offset);
		}
	}
	smart_str_0(&sql);
	zend_string_release(where_sql);

	zval stmt;
	zend_result status = nxdom_pdo_prepare_execute(&qb->pdo, sql.s, &params, &stmt);
	smart_str_free(&sql);
	zval_ptr_dtor(&params);

	if (status != SUCCESS) {
		return FAILURE;
	}

	status = nxdom_call_method(&stmt, "fetchAll", 0, NULL, out_result);
	zval_ptr_dtor(&stmt);
	return status;
}

zend_result nxdom_qb_find(nxdom_query_builder *qb, zval *id, const char *key, zval *out_result)
{
	nxdom_query_builder *clone = nxdom_qb_clone(qb);

	zend_result status = nxdom_qb_where(clone, key, "=", id);
	if (status != SUCCESS) {
		nxdom_qb_free(clone);
		return FAILURE;
	}
	nxdom_qb_limit(clone, 1);

	zval rows;
	status = nxdom_qb_get(clone, &rows);
	nxdom_qb_free(clone);

	if (status != SUCCESS) {
		return FAILURE;
	}

	zval *first = zend_hash_index_find(Z_ARRVAL(rows), 0);
	if (first) {
		ZVAL_COPY(out_result, first);
	} else {
		ZVAL_NULL(out_result);
	}
	zval_ptr_dtor(&rows);
	return SUCCESS;
}

zend_result nxdom_qb_insert(nxdom_query_builder *qb, zval *data, zval *out_id)
{
	smart_str columns = {0};
	smart_str placeholders = {0};
	zend_bool first = 1;
	zend_string *key;

	ZEND_HASH_FOREACH_STR_KEY(Z_ARRVAL_P(data), key) {
		if (!first) {
			smart_str_appends(&columns, ", ");
			smart_str_appends(&placeholders, ", ");
		}
		smart_str_append(&columns, key);
		smart_str_appendc(&placeholders, ':');
		smart_str_append(&placeholders, key);
		first = 0;
	} ZEND_HASH_FOREACH_END();
	smart_str_0(&columns);
	smart_str_0(&placeholders);

	smart_str sql = {0};
	smart_str_appends(&sql, "INSERT INTO ");
	smart_str_append(&sql, qb->table);
	smart_str_appends(&sql, " (");
	smart_str_append(&sql, columns.s);
	smart_str_appends(&sql, ") VALUES (");
	smart_str_append(&sql, placeholders.s);
	smart_str_appendc(&sql, ')');
	smart_str_0(&sql);
	smart_str_free(&columns);
	smart_str_free(&placeholders);

	zval stmt;
	zend_result status = nxdom_pdo_prepare_execute(&qb->pdo, sql.s, data, &stmt);
	smart_str_free(&sql);

	if (status != SUCCESS) {
		return FAILURE;
	}

	status = nxdom_call_method(&qb->pdo, "lastInsertId", 0, NULL, out_id);
	zval_ptr_dtor(&stmt);
	return status;
}

zend_result nxdom_qb_update(nxdom_query_builder *qb, zval *data, zend_long *out_affected)
{
	smart_str set_clause = {0};
	zend_bool first = 1;
	zend_string *key;

	ZEND_HASH_FOREACH_STR_KEY(Z_ARRVAL_P(data), key) {
		if (!first) smart_str_appends(&set_clause, ", ");
		smart_str_append(&set_clause, key);
		smart_str_appends(&set_clause, " = :set_");
		smart_str_append(&set_clause, key);
		first = 0;
	} ZEND_HASH_FOREACH_END();
	smart_str_0(&set_clause);

	zval where_params;
	zend_string *where_sql = nxdom_qb_build_where(qb, &where_params);

	smart_str sql = {0};
	smart_str_appends(&sql, "UPDATE ");
	smart_str_append(&sql, qb->table);
	smart_str_appends(&sql, " SET ");
	smart_str_append(&sql, set_clause.s);
	if (ZSTR_LEN(where_sql) > 0) {
		smart_str_appends(&sql, " WHERE ");
		smart_str_append(&sql, where_sql);
	}
	smart_str_0(&sql);
	smart_str_free(&set_clause);
	zend_string_release(where_sql);

	/* params = whereParams + {"set_col": val, ...} — sama seperti PHP:
	 * $params = $whereParams; foreach ($data as $col => $val) $params["set_$col"] = $val; */
	zval params;
	ZVAL_DUP(&params, &where_params);
	zval_ptr_dtor(&where_params);

	{
		zval *val;
		ZEND_HASH_FOREACH_STR_KEY_VAL(Z_ARRVAL_P(data), key, val) {
			zend_string *set_key = zend_strpprintf(0, "set_%s", ZSTR_VAL(key));
			zval val_copy;
			ZVAL_COPY(&val_copy, val);
			add_assoc_zval_ex(&params, ZSTR_VAL(set_key), ZSTR_LEN(set_key), &val_copy);
			zend_string_release(set_key);
		} ZEND_HASH_FOREACH_END();
	}

	zval stmt;
	zend_result status = nxdom_pdo_prepare_execute(&qb->pdo, sql.s, &params, &stmt);
	smart_str_free(&sql);
	zval_ptr_dtor(&params);

	if (status != SUCCESS) {
		return FAILURE;
	}

	zval row_count;
	status = nxdom_call_method(&stmt, "rowCount", 0, NULL, &row_count);
	zval_ptr_dtor(&stmt);

	if (status == SUCCESS) {
		*out_affected = zval_get_long(&row_count);
		zval_ptr_dtor(&row_count);
	}
	return status;
}

zend_result nxdom_qb_delete(nxdom_query_builder *qb, zend_long *out_affected)
{
	zval params;
	zend_string *where_sql = nxdom_qb_build_where(qb, &params);

	smart_str sql = {0};
	smart_str_appends(&sql, "DELETE FROM ");
	smart_str_append(&sql, qb->table);
	if (ZSTR_LEN(where_sql) > 0) {
		smart_str_appends(&sql, " WHERE ");
		smart_str_append(&sql, where_sql);
	}
	smart_str_0(&sql);
	zend_string_release(where_sql);

	zval stmt;
	zend_result status = nxdom_pdo_prepare_execute(&qb->pdo, sql.s, &params, &stmt);
	smart_str_free(&sql);
	zval_ptr_dtor(&params);

	if (status != SUCCESS) {
		return FAILURE;
	}

	zval row_count;
	status = nxdom_call_method(&stmt, "rowCount", 0, NULL, &row_count);
	zval_ptr_dtor(&stmt);

	if (status == SUCCESS) {
		*out_affected = zval_get_long(&row_count);
		zval_ptr_dtor(&row_count);
	}
	return status;
}
