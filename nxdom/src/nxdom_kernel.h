/* Kernel — port dari nxdom/core/Kernel.php (PHP, referensi asli).
 * Titik masuk tunggal dipanggil dari PHP_RINIT_FUNCTION (nxdom.c).
 *
 * Batasan arsitektur (Plan.md Bagian 0C, temuan riset kritis): RINIT bisa
 * "ikut berjalan" di setiap request (menggantikan peran auto_prepend_file
 * secara native), TAPI tidak bisa mengganti/membatalkan primary_file yang
 * sudah diputuskan SAPI sebelum RINIT dipanggil. Jadi nxdom_kernel_handle()
 * berguna penuh untuk pola "satu file PHP jadi front controller" (setara
 * router.php versi PHP dulu, dipakai lewat `php -S ... front.php` atau
 * SAPI apa pun yang selalu mengarahkan request ke satu script) — untuk
 * kasus routing web-server-level (mis. Apache tanpa front controller
 * eksplisit) tetap perlu bantuan config server terpisah, di luar cakupan
 * RINIT murni.
 */

#ifndef NXDOM_KERNEL_H
#define NXDOM_KERNEL_H

#include "php.h"

/* Return 1 kalau path cocok pola nxdom.<apapun>.json (case-insensitive) —
 * file-file ini TIDAK PERNAH boleh diserve mentah. */
int nxdom_kernel_is_protected_path(const char *path);

/* Titik masuk utama. document_root/request_uri sama seperti parameter
 * Kernel::handle() PHP. Return 1 kalau request sudah ditangani penuh
 * (response sudah dikirim, caller — PHP_RINIT_FUNCTION — harus
 * menghentikan eksekusi script lebih lanjut lewat zend_bailout()),
 * 0 kalau caller boleh lanjut proses normal (bukan app NxDom, atau
 * bukan route /api/*). */
int nxdom_kernel_handle(const char *document_root, const char *request_uri);

#endif
