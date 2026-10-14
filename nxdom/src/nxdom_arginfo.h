/* Arginfo NxDom. nxdom_version() = bukti-konsep awal (M0 native).
 * nxdom_debug_app_context()/nxdom_debug_response_ok() = uji manual porting
 * AppContext dan Response ke C (Plan.md 0D) — bukan API publik final,
 * akan diganti saat Kernel::handle() native tersambung penuh. */

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_version, 0, 0, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_app_context, 0, 1, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_response_ok, 0, 0, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_MIXED, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_router_match, 0, 3, IS_ARRAY, 1)
	ZEND_ARG_TYPE_INFO(0, routes, IS_ARRAY, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, path, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_query, 0, 3, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, table, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, constraints, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_insert, 0, 3, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, table, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, data, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_auth_register, 0, 2, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, body, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_auth_login, 0, 2, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, body, IS_ARRAY, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_auth_me, 0, 1, IS_MIXED, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_auth_logout, 0, 1, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_auth_check, 0, 1, _IS_BOOL, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_debug_dispatch, 0, 3, IS_VOID, 0)
	ZEND_ARG_TYPE_INFO(0, basePath, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, method, IS_STRING, 0)
	ZEND_ARG_TYPE_INFO(0, path, IS_STRING, 0)
ZEND_END_ARG_INFO()

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_nxdom_dispatch, 0, 0, _IS_BOOL, 0)
ZEND_END_ARG_INFO()

ZEND_FUNCTION(nxdom_version);
ZEND_FUNCTION(nxdom_debug_app_context);
ZEND_FUNCTION(nxdom_debug_response_ok);
ZEND_FUNCTION(nxdom_debug_router_match);
ZEND_FUNCTION(nxdom_debug_query);
ZEND_FUNCTION(nxdom_debug_insert);
ZEND_FUNCTION(nxdom_debug_auth_register);
ZEND_FUNCTION(nxdom_debug_auth_login);
ZEND_FUNCTION(nxdom_debug_auth_me);
ZEND_FUNCTION(nxdom_debug_auth_logout);
ZEND_FUNCTION(nxdom_debug_auth_check);
ZEND_FUNCTION(nxdom_debug_dispatch);
ZEND_FUNCTION(nxdom_dispatch);

static const zend_function_entry ext_functions[] = {
	ZEND_FE(nxdom_version, arginfo_nxdom_version)
	ZEND_FE(nxdom_debug_app_context, arginfo_nxdom_debug_app_context)
	ZEND_FE(nxdom_debug_response_ok, arginfo_nxdom_debug_response_ok)
	ZEND_FE(nxdom_debug_router_match, arginfo_nxdom_debug_router_match)
	ZEND_FE(nxdom_debug_query, arginfo_nxdom_debug_query)
	ZEND_FE(nxdom_debug_insert, arginfo_nxdom_debug_insert)
	ZEND_FE(nxdom_debug_auth_register, arginfo_nxdom_debug_auth_register)
	ZEND_FE(nxdom_debug_auth_login, arginfo_nxdom_debug_auth_login)
	ZEND_FE(nxdom_debug_auth_me, arginfo_nxdom_debug_auth_me)
	ZEND_FE(nxdom_debug_auth_logout, arginfo_nxdom_debug_auth_logout)
	ZEND_FE(nxdom_debug_auth_check, arginfo_nxdom_debug_auth_check)
	ZEND_FE(nxdom_debug_dispatch, arginfo_nxdom_debug_dispatch)
	ZEND_FE(nxdom_dispatch, arginfo_nxdom_dispatch)
	ZEND_FE_END
};
