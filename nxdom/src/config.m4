dnl config.m4 for extension nxdom (Linux/Unix build — pasangan dari config.w32)
dnl NxDom — native PHP extension. See config.w32 for the Windows counterpart.

PHP_ARG_ENABLE([nxdom],
  [whether to enable NxDom support],
  [AS_HELP_STRING([--enable-nxdom], [Enable NxDom support])],
  [no])

if test "$PHP_NXDOM" != "no"; then
  AC_DEFINE(HAVE_NXDOM, 1, [NxDom support enabled])

  PHP_ADD_EXTENSION_DEP(nxdom, pdo)
  PHP_ADD_EXTENSION_DEP(nxdom, session)

  PHP_NEW_EXTENSION(nxdom,
    [nxdom.c nxdom_app_context.c nxdom_response.c nxdom_router.c nxdom_call.c nxdom_database.c nxdom_query_builder.c nxdom_auth.c nxdom_kernel.c],
    $ext_shared,, [-DZEND_ENABLE_STATIC_TSRMLS_CACHE=1])
fi
