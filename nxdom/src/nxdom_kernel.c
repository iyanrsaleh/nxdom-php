#include "php.h"
#include "SAPI.h"
#include "nxdom_kernel.h"
#include "nxdom_app_context.h"
#include "nxdom_router.h"
#include "nxdom_response.h"

/* Ambil bagian path dari REQUEST_URI (buang query string setelah '?').
 * REQUEST_URI SAPI selalu relatif (tidak pernah absolute URI dengan
 * scheme/host), jadi cukup potong di '?' pertama — setara
 * parse_url($uri, PHP_URL_PATH) untuk kasus ini tanpa perlu full URL
 * parser (php_url_parse) yang menangani banyak kasus tidak relevan
 * (scheme, userinfo, fragment, dst.). out_path dimiliki caller,
 * zend_string_release setelah selesai. */
static zend_string *nxdom_extract_path(const char *request_uri)
{
	const char *query_start = strchr(request_uri, '?');
	size_t len = query_start ? (size_t) (query_start - request_uri) : strlen(request_uri);
	if (len == 0) {
		return zend_string_init("/", 1, 0);
	}
	return zend_string_init(request_uri, len, 0);
}

static const char *nxdom_basename(const char *path)
{
	const char *slash = strrchr(path, '/');
	return slash ? slash + 1 : path;
}

/* Port dari Kernel::isProtectedPath(): cocokkan basename terhadap pola
 * /^nxdom\.[a-z]+\.json$/i tanpa memanggil PCRE engine — pola ini cukup
 * sederhana untuk character-by-character check manual (sama seperti
 * validasi identifier di QueryBuilder), konsisten dengan prinsip porting:
 * hindari overhead/risiko memanggil subsistem PHP yang lebih besar
 * (PCRE) untuk pola yang sebenarnya trivial. */
int nxdom_kernel_is_protected_path(const char *path)
{
	const char *name = nxdom_basename(path);
	const char prefix[] = "nxdom.";
	size_t prefix_len = sizeof(prefix) - 1;

	if (strncasecmp(name, prefix, prefix_len) != 0) {
		return 0;
	}

	const char *p = name + prefix_len;
	const char *dot = strchr(p, '.');
	if (!dot || p == dot) {
		return 0; /* wajib ada minimal 1 huruf sebelum '.json' */
	}
	for (const char *c = p; c < dot; c++) {
		if (!isalpha((unsigned char) *c)) {
			return 0;
		}
	}

	return strcasecmp(dot, ".json") == 0;
}

int nxdom_kernel_handle(const char *document_root, const char *request_uri)
{
	zend_string *path = nxdom_extract_path(request_uri);

	if (nxdom_kernel_is_protected_path(ZSTR_VAL(path))) {
		zend_string_release(path);
		SG(sapi_headers).http_response_code = 403;
		char content_type[] = "Content-Type: text/plain";
		sapi_add_header(content_type, sizeof(content_type) - 1, 1);
		php_write("403 Forbidden\n", sizeof("403 Forbidden\n") - 1);
		return 1;
	}

	nxdom_app_context *ctx = nxdom_app_context_from_directory(document_root);
	if (!ctx) {
		/* Tidak ada nxdom.config.json — bukan app NxDom, biarkan file
		 * statis diserve seperti biasa (sama seperti return false PHP). */
		zend_string_release(path);
		return 0;
	}

	zval manifest;
	nxdom_app_context_load_manifest(ctx, &manifest);

	const char *method = SG(request_info).request_method ? SG(request_info).request_method : "GET";

	zval *routes = zend_hash_str_find(Z_ARRVAL(manifest), "routes", sizeof("routes") - 1);
	zval route, params;
	int matched = routes && nxdom_router_match(routes, method, ZSTR_VAL(path), &route, &params);
	zval_ptr_dtor(&manifest);
	zend_string_release(path);

	/* Route halaman (action "page", mis. /about) juga match di sini —
	 * bukan cuma /api/*. Bila TIDAK match manifest manapun, serahkan ke
	 * caller (front controller: SPA fallback / 404 JSON). */
	if (!matched) {
		nxdom_app_context_free(ctx);
		return 0;
	}

	nxdom_router_dispatch(ctx, &route, &params);

	zval_ptr_dtor(&route);
	zval_ptr_dtor(&params);
	nxdom_app_context_free(ctx);
	return 1;
}
