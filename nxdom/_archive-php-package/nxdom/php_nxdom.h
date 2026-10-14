/* NxDom native extension — lihat Plan.md Bagian 0/0B untuk riwayat
 * keputusan (kenapa native C, bukan PHP package + auto_prepend_file). */

#ifndef PHP_NXDOM_H
# define PHP_NXDOM_H

extern zend_module_entry nxdom_module_entry;
# define phpext_nxdom_ptr &nxdom_module_entry

# define PHP_NXDOM_VERSION "0.0.1"

# if defined(ZTS) && defined(COMPILE_DL_NXDOM)
ZEND_TSRMLS_CACHE_EXTERN()
# endif

#endif	/* PHP_NXDOM_H */
