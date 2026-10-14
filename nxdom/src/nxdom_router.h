/* Router — port dari nxdom/core/Router.php (PHP, referensi asli). */

#ifndef NXDOM_ROUTER_H
#define NXDOM_ROUTER_H

#include "php.h"
#include "nxdom_app_context.h"

/* Cocokkan (method, path) terhadap array routes (dari manifest, hasil
 * nxdom_app_context_load_manifest). Return 1 kalau cocok (out_route diisi
 * COPY zval route yang cocok, out_params diisi array asosiatif param path
 * seperti {"id": "42"}), 0 kalau tidak ada yang cocok (out_route/out_params
 * tidak diisi). Caller memiliki out_route/out_params, harus zval_ptr_dtor
 * setelah selesai — HANYA kalau return value 1. */
int nxdom_router_match(
	zval *routes, const char *method, const char *path,
	zval *out_route, zval *out_params
);

/* Port dari Router::dispatch(): satu titik masuk yang mengeksekusi route
 * yang sudah cocok (hasil nxdom_router_match) — connect Database, cek
 * guard auth, lalu jalankan action CRUD atau auth, dan langsung KIRIM
 * response (via nxdom_response.h) — tidak mengembalikan apa pun ke
 * caller, persis seperti Router::dispatch() PHP void. */
void nxdom_router_dispatch(nxdom_app_context *ctx, zval *route, zval *params);

#endif
