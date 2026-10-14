#include "php.h"
#include "nxdom_call.h"

zend_string *nxdom_read_file(const char *path)
{
	php_stream *stream = php_stream_open_wrapper((char *) path, "rb", REPORT_ERRORS, NULL);
	if (!stream) {
		return NULL;
	}

	zend_string *contents = php_stream_copy_to_mem(stream, PHP_STREAM_COPY_ALL, 0);
	php_stream_close(stream);

	return contents;
}

zend_result nxdom_call_method(
	zval *object, const char *method_name,
	uint32_t argc, zval *argv, zval *out_retval
) {
	zval callable, method_name_zv;
	array_init(&callable);
	Z_TRY_ADDREF_P(object);
	add_next_index_zval(&callable, object);
	ZVAL_STRING(&method_name_zv, method_name);
	add_next_index_zval(&callable, &method_name_zv);

	zend_fcall_info fci = empty_fcall_info;
	zend_fcall_info_cache fcc = empty_fcall_info_cache;
	char *error = NULL;

	zend_result init_status = zend_fcall_info_init(&callable, 0, &fci, &fcc, NULL, &error);
	if (error) {
		efree(error);
	}
	zval_ptr_dtor(&callable);

	if (init_status != SUCCESS) {
		return FAILURE;
	}

	fci.param_count = argc;
	fci.params = argv;

	zval retval;
	zend_result call_status = zend_fcall_info_call(&fci, &fcc, &retval, NULL);

	if (call_status != SUCCESS || EG(exception)) {
		zval_ptr_dtor(&retval);
		return FAILURE;
	}

	if (out_retval) {
		ZVAL_COPY_VALUE(out_retval, &retval);
	} else {
		zval_ptr_dtor(&retval);
	}

	return SUCCESS;
}

zend_result nxdom_call_function(
	const char *function_name,
	uint32_t argc, zval *argv, zval *out_retval
) {
	zval func_name;
	ZVAL_STRING(&func_name, function_name);

	zval retval;
	zend_result status = call_user_function(NULL, NULL, &func_name, &retval, argc, argv);
	zval_ptr_dtor(&func_name);

	if (status != SUCCESS || EG(exception)) {
		zval_ptr_dtor(&retval);
		return FAILURE;
	}

	if (out_retval) {
		ZVAL_COPY_VALUE(out_retval, &retval);
	} else {
		zval_ptr_dtor(&retval);
	}

	return SUCCESS;
}

zend_result nxdom_new_object(
	const char *class_name,
	uint32_t argc, zval *argv, zval *out_object
) {
	zend_string *name = zend_string_init(class_name, strlen(class_name), 0);
	zend_class_entry *ce = zend_lookup_class(name);
	zend_string_release(name);

	if (!ce) {
		return FAILURE;
	}

	if (object_init_ex(out_object, ce) != SUCCESS) {
		return FAILURE;
	}

	zend_function *constructor = Z_OBJ_HT_P(out_object)->get_constructor(Z_OBJ_P(out_object));
	if (!constructor) {
		return argc == 0 ? SUCCESS : FAILURE;
	}

	zend_call_known_function(
		constructor, Z_OBJ_P(out_object), Z_OBJCE_P(out_object), NULL,
		argc, argv, NULL
	);

	if (EG(exception)) {
		zval_ptr_dtor(out_object);
		return FAILURE;
	}

	return SUCCESS;
}
