/* Response — port dari nxdom/core/Response.php (PHP, referensi asli).
 * Set status HTTP via SAPI native (SG(sapi_headers)), Content-Type via
 * sapi_add_header, body JSON via json_encode() userland (call_user_function)
 * — encode JSON sendiri di C tidak sepadan manfaatnya untuk struktur kecil
 * seperti response body, ext/json PHP sudah battle-tested untuk ini.
 */

#ifndef NXDOM_RESPONSE_H
#define NXDOM_RESPONSE_H

#include "php.h"

/* Kirim {"data": <data>} dengan status 200. Mengambil alih (bukan copy)
 * zval data — caller tidak perlu dtor data setelah panggilan ini. */
void nxdom_response_ok(zval *data);

/* Kirim {"data": <data>} dengan status 201. */
void nxdom_response_created(zval *data);

/* Kirim {"error": message} dengan status HTTP tertentu. */
void nxdom_response_error(int status, const char *message);

/* Primitif umum: kirim body (array PHP, akan di-json_encode) dengan status. */
void nxdom_response_json(int status, zval *body);

#endif
