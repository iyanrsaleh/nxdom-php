#include "php.h"
#include "SAPI.h"
#include "nxdom_response.h"

static void nxdom_send_status_and_content_type(int status)
{
	SG(sapi_headers).http_response_code = status;

	char content_type[] = "Content-Type: application/json";
	sapi_add_header(content_type, sizeof(content_type) - 1, 1);
}

static void nxdom_echo_json_encoded(zval *body)
{
	zval func_name;
	zval retval;

	ZVAL_STRING(&func_name, "json_encode");

	if (call_user_function(NULL, NULL, &func_name, &retval, 1, body) == SUCCESS
		&& Z_TYPE(retval) == IS_STRING
	) {
		php_write(Z_STRVAL(retval), Z_STRLEN(retval));
	}

	zval_ptr_dtor(&func_name);
	zval_ptr_dtor(&retval);
}

void nxdom_response_json(int status, zval *body)
{
	nxdom_send_status_and_content_type(status);
	nxdom_echo_json_encoded(body);
	zval_ptr_dtor(body);
}

static void nxdom_response_wrapped(int status, const char *key, zval *value)
{
	zval body;
	array_init(&body);
	add_assoc_zval(&body, key, value);
	nxdom_response_json(status, &body);
}

void nxdom_response_ok(zval *data)
{
	nxdom_response_wrapped(200, "data", data);
}

void nxdom_response_created(zval *data)
{
	nxdom_response_wrapped(201, "data", data);
}

void nxdom_response_error(int status, const char *message)
{
	zval msg;
	ZVAL_STRING(&msg, message);
	nxdom_response_wrapped(status, "error", &msg);
}
