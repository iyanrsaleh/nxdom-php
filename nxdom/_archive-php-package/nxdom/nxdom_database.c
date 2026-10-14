#include "php.h"
#include "nxdom_database.h"
#include "nxdom_call.h"

static zval *nxdom_hash_find(zval *arr, const char *key)
{
	return zend_hash_str_find(Z_ARRVAL_P(arr), key, strlen(key));
}

static const char *nxdom_hash_find_string(zval *arr, const char *key, const char *default_value)
{
	zval *v = nxdom_hash_find(arr, key);
	return (v && Z_TYPE_P(v) == IS_STRING) ? Z_STRVAL_P(v) : default_value;
}

static zend_long nxdom_hash_find_long(zval *arr, const char *key, zend_long default_value)
{
	zval *v = nxdom_hash_find(arr, key);
	return (v && Z_TYPE_P(v) == IS_LONG) ? Z_LVAL_P(v) : default_value;
}

/* Port dari Database::resolveSqlitePath(): kalau path sudah absolut
 * (drive letter Windows atau leading '/'), pakai apa adanya; kalau
 * relatif, gabung dengan base_path dan pastikan direktori induknya ada
 * (mkdir -p setara). */
static zend_string *nxdom_resolve_sqlite_path(const char *path, const char *base_path)
{
	bool is_absolute = (path[0] == '/')
		|| (isalpha((unsigned char) path[0]) && path[1] == ':' && (path[2] == '/' || path[2] == '\\'));

	if (is_absolute) {
		return zend_string_init(path, strlen(path), 0);
	}

	zend_string *full_path = zend_strpprintf(0, "%s/%s", base_path, path);

	zend_string *dir = zend_string_init(ZSTR_VAL(full_path), ZSTR_LEN(full_path), 0);
	char *last_slash = strrchr(ZSTR_VAL(dir), '/');
	char *last_bslash = strrchr(ZSTR_VAL(dir), '\\');
	char *cut = last_slash > last_bslash ? last_slash : last_bslash;
	if (cut) {
		ZSTR_LEN(dir) = cut - ZSTR_VAL(dir);
		ZSTR_VAL(dir)[ZSTR_LEN(dir)] = '\0';

		zend_stat_t sb;
		if (VCWD_STAT(ZSTR_VAL(dir), &sb) != 0) {
			php_stream_mkdir(ZSTR_VAL(dir), 0777, PHP_STREAM_MKDIR_RECURSIVE, NULL);
		}
	}
	zend_string_release(dir);

	return full_path;
}

static zend_string *nxdom_build_dsn(zval *config, const char *base_path, zend_result *status)
{
	const char *driver = nxdom_hash_find_string(config, "driver", NULL);
	*status = SUCCESS;

	if (!driver) {
		*status = FAILURE;
		return NULL;
	}

	if (strcmp(driver, "sqlite") == 0) {
		const char *path = nxdom_hash_find_string(config, "path", "");
		zend_string *sqlite_path = nxdom_resolve_sqlite_path(path, base_path);
		zend_string *dsn = zend_strpprintf(0, "sqlite:%s", ZSTR_VAL(sqlite_path));
		zend_string_release(sqlite_path);
		return dsn;
	}

	if (strcmp(driver, "mysql") == 0) {
		return zend_strpprintf(
			0, "mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4",
			nxdom_hash_find_string(config, "host", ""),
			(int) nxdom_hash_find_long(config, "port", 3306),
			nxdom_hash_find_string(config, "name", "")
		);
	}

	if (strcmp(driver, "pgsql") == 0) {
		return zend_strpprintf(
			0, "pgsql:host=%s;port=%d;dbname=%s",
			nxdom_hash_find_string(config, "host", ""),
			(int) nxdom_hash_find_long(config, "port", 5432),
			nxdom_hash_find_string(config, "name", "")
		);
	}

	*status = FAILURE;
	return NULL;
}

zend_result nxdom_database_connect(zval *database_config, const char *base_path, zval *out_pdo)
{
	zend_result dsn_status;
	zend_string *dsn = nxdom_build_dsn(database_config, base_path, &dsn_status);
	if (dsn_status != SUCCESS) {
		return FAILURE;
	}

	const char *driver = nxdom_hash_find_string(database_config, "driver", "");
	const char *user = nxdom_hash_find_string(database_config, "user", NULL);
	const char *password = nxdom_hash_find_string(database_config, "password", NULL);

	zval args[4];
	ZVAL_STR(&args[0], dsn);
	if (user) {
		ZVAL_STRING(&args[1], user);
	} else {
		ZVAL_NULL(&args[1]);
	}
	if (password) {
		ZVAL_STRING(&args[2], password);
	} else {
		ZVAL_NULL(&args[2]);
	}

	/* PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION (2), PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC (2).
	 * Nilai konstanta ini stabil sejak PDO ada — dipakai literal di sini
	 * (bukan zend_lookup di kelas PDO untuk mengambil nilai konstantanya)
	 * supaya tidak menambah round-trip lookup untuk nilai yang tidak
	 * pernah berubah. */
	zval options;
	array_init(&options);
	add_index_long(&options, 3 /* PDO::ATTR_ERRMODE */, 2 /* PDO::ERRMODE_EXCEPTION */);
	add_index_long(&options, 19 /* PDO::ATTR_DEFAULT_FETCH_MODE */, 2 /* PDO::FETCH_ASSOC */);
	ZVAL_COPY_VALUE(&args[3], &options);

	zend_result status = nxdom_new_object("PDO", 4, args, out_pdo);

	zend_string_release(dsn);
	zval_ptr_dtor(&args[1]);
	zval_ptr_dtor(&args[2]);
	zval_ptr_dtor(&options);

	if (status != SUCCESS) {
		return FAILURE;
	}

	if (strcmp(driver, "sqlite") == 0) {
		zval sql, exec_retval;
		ZVAL_STRING(&sql, "PRAGMA foreign_keys = ON");
		nxdom_call_method(out_pdo, "exec", 1, &sql, &exec_retval);
		zval_ptr_dtor(&sql);
		if (EG(exception)) {
			zval_ptr_dtor(out_pdo);
			return FAILURE;
		}
	}

	return SUCCESS;
}
