# NxDom — Rencana Implementasi

> Referensi arsitektur: `README.md`
> Server rujukan: `C:\Tnserver\bin\php` (PHP 8.1.31 ZTS, **Visual C++ 2019**, x64, Zend/PHP Extension Build `API20210902,TS,VS16` — lihat Bagian 0B untuk kenapa ini penting)
> Catatan: folder `app/` di server rujukan adalah proyek lain ("Ngorei framework") — tidak berkaitan, jangan disentuh/dicampur.

---

## 0. Keputusan Teknis Dasar — REVISI (2026-09-13)

**Keputusan Bagian 0 semula (PHP package + `auto_prepend_file`) DIBATALKAN.** Riwayat kenapa:

1. M0-M7 dibangun di atas asumsi "PHP package global di-load via `auto_prepend_file`" — seluruhnya diuji lewat `php -S` dan **berhasil** (lihat riwayat M0-M7 di bawah, semua tetap valid sebagai kode PHP-nya).
2. Saat mencoba jalur produksi sungguhan (README §17: Apache/Nginx → PHP → NxDom), `auto_prepend_file` terbukti **tidak cukup**: ia hanya jalan saat Apache memilih mengeksekusi PHP, yang hanya terjadi untuk file `.php` fisik — request ke path tanpa file fisik (`/api/users`) 404 dari Apache duluan, dan file `.json` (`nxdom.config.json`) ter-serve mentah (bocor kredensial) karena bukan `.php`.
3. Percobaan menambal ini dengan `mod_rewrite`/`.htaccess`/`<Directory>` khusus di vhost app **melanggar README §6 sendiri** (❌ `bootstrap.php` per-app — app tidak boleh punya jejak config NxDom). Ditegur pengguna, semua perubahan Apache di-revert.
4. Kesimpulan: satu-satunya cara yang benar-benar konsisten dengan README §7/§17/§28 ("NxDom Extension" yang cukup `extension=nxdom` di `php.ini`, tanpa config tambahan apa pun di app maupun di web server) adalah **native PHP extension (C, Zend Engine API)** — bukan package PHP.

| Pertanyaan | Keputusan (baru) |
|---|---|
| Bentuk "Extension" | **Native C extension**, dikompilasi jadi `php_nxdom.dll`, diaktifkan lewat `extension=nxdom` di `php.ini`. Hook ke request lifecycle PHP (`RINIT`/`RSHUTDOWN`/`PHP_MINIT` dst.) via Zend Engine API — TIDAK butuh `auto_prepend_file`, TIDAK butuh `mod_rewrite`/`.htaccess`/config Apache apa pun. |
| Peran JavaScript | Tidak berubah — client-side SDK, lihat keputusan lama. |
| Compiler | Tidak berubah. |
| Kode PHP M1-M7 (`nxdom/core/*.php`) | **Tidak dibuang** — jadi referensi logika (Kernel/Router/Database/Auth) yang perlu ditulis ulang dalam C, bukan lagi kode produksi yang di-load lewat `auto_prepend_file`. |

### 0B. Toolchain — ✅ SELESAI, skeleton extension terbukti bekerja (2026-09-14)

Panduan lengkap step-by-step (bisa diulang dari nol): **`install.md`**. Ringkasan status:

- ✅ MSVC v142 (VS2019 toolset) — Build Tools apa pun boleh, asal komponen toolset v142 eksplisit ditambahkan (dicek via `cl.exe` versi `19.29.x`).
- ✅ PHP SDK — `C:\phpsdk\`, build tree `phpmaster\vs16\x64\` sudah dibuat.
- ✅ Source PHP 8.1.31 — `C:\phpsdk\phpmaster\vs16\x64\php-src\` (tag persis, terverifikasi).
- ✅ Skeleton extension pertama — `php-src\ext\nxdom\` (`config.w32`, `php_nxdom.h`, `nxdom_arginfo.h`, `nxdom.c`): satu fungsi bukti-konsep (`nxdom_version()`) + `PHP_RINIT_FUNCTION` (hook lifecycle yang nanti menggantikan `auto_prepend_file`).
- ✅ **Build berhasil** (`nmake` → `EXT nxdom build complete`) menghasilkan `php_nxdom.dll`.
- ✅ **Diuji dan berhasil di-load oleh `php.exe` SUNGGUHAN server rujukan** (`C:\Tnserver\bin\php\php.exe`, built Nov 2024 — bukan php.exe hasil build sendiri), tanpa mengubah `php.ini` (pakai flag `-d extension=nxdom` supaya proyek lain di server sama, mis. Ngorei, tidak terpengaruh selama pengujian):
  ```
  php.exe -d extension=nxdom -m           → menampilkan "nxdom"
  php.exe -d extension=nxdom -r "echo nxdom_version();"  → "0.0.1"
  ```
  Ini pembuktian ABI cocok 100% antara hasil build dan PHP produksi — ekstensi native benar-benar bisa dimuat, bukan cuma berhasil kompilasi.

**Belum dikerjakan**: mengaktifkan `extension=nxdom` secara permanen di `php.ini` server rujukan (langkah ini akan memengaruhi semua PHP di server itu — perlu keputusan sadar seperti halnya `auto_prepend_file` dulu, lihat riwayat di atas). Logika Kernel/Router/Database/Auth (referensi: `nxdom/core/*.php`, hasil M1-M4) **belum** dipindahkan ke C — skeleton saat ini hanya modul kosong pembuktian toolchain.

### 0C. Temuan Riset Kritis — Batas Kemampuan Native Extension untuk Routing (2026-09-14)

Sebelum menulis logika porting PHP→C, diriset dulu: bisakah `PHP_RINIT_FUNCTION` (hook C, dipanggil di awal tiap request) **mengambil alih** request untuk path tanpa file fisik (`/api/users`), menggantikan kebutuhan `mod_rewrite`?

**Temuan** (dari `main/main.c`, fungsi `php_execute_script()`): PHP menjalankan `zend_execute_scripts(ZEND_REQUIRE, NULL, 3, prepend_file, primary_file, append_file)`. `auto_prepend_file` (`prepend_file`) memang dieksekusi lewat jalur ini, TAPI **`primary_file`** (script yang sesuai URL request) **ditentukan oleh SAPI** (Apache module/mod_php, atau resolusi file oleh web server) **sebelum** `RINIT` extension dipanggil. Artinya:

- Extension C **bisa** "ikut berjalan" di setiap request (persis seperti `auto_prepend_file`, hanya lebih native) — ini valid dan berguna.
- Extension C **tidak bisa** mengganti/membatalkan `primary_file` dari `RINIT` biasa. Kalau web server sudah memutuskan "file `/api/users` tidak ada → 404", keputusan itu terjadi **sebelum atau independen dari** RINIT PHP, tergantung SAPI (Apache 404 duluan sebelum PHP dipanggil sama sekali untuk path yang tidak match file/handler apa pun — persis masalah yang sama ditemukan saat eksperimen Apache/mod_rewrite sebelumnya).
- Teknik override lebih dalam (mengganti `zend_execute_ex`, dipakai APM/profiler seperti Xdebug/New Relic) **ada**, tapi jauh lebih kompleks dan berisiko (rawan crash/corruption jika salah) — diputuskan **tidak dipakai** untuk kasus ini.

**Keputusan final arsitektur**: native extension NxDom menggantikan `auto_prepend_file` (ikut berjalan di semua request, mendeteksi `nxdom.config.json`, memanggil balik ke logika PHP `nxdom/core/*.php` via `zend_call_function` — lihat Bagian 0D), TAPI kebutuhan mengarahkan path tanpa file fisik (`/api/*`) ke NxDom tetap memerlukan **satu baris konfigurasi generik di level SERVER** (mis. `mod_rewrite` di `httpd.conf` utama, atau fallback resource PHP-FPM) — dipasang **sekali saat instalasi server oleh administrator hosting** (README §28), BUKAN per-app/per-vhost seperti percobaan gagal sebelumnya (yang melanggar README §6). Ini beda fundamental: config generik sekali di server vs. config khusus di tiap app.

### 0E. Temuan Riset LANJUTAN — RINIT bahkan TIDAK BISA membaca `document_root` untuk path virtual (2026-09-14)

Setelah seluruh Kernel/Router/Database/Auth selesai diporting (0D) dan `PHP_RINIT_FUNCTION` disambungkan sungguhan, ditemukan batasan yang **lebih ketat** dari perkiraan 0C: bukan cuma "RINIT tidak bisa mengganti primary_file" — **RINIT bahkan tidak bisa MEMBACA `document_root` sama sekali** untuk request ke path yang tidak match file fisik (`/api/users`), setidaknya di CLI Server SAPI (`php -S`).

**Proses investigasi** (dibuktikan lewat logging langsung ke file dari dalam `RINIT`, bukan dugaan):
1. `sapi_getenv("DOCUMENT_ROOT", ...)` selalu `NULL` — field `getenv` di `cli_server_sapi_module` (`sapi/cli/php_cli_server.c`) memang `NULL`, SAPI ini tidak mengimplementasikan hook itu sama sekali.
2. `$_SERVER['DOCUMENT_ROOT']` via `EG(symbol_table)` juga `NULL` di titik RINIT — dibuktikan `$_SERVER` **sudah benar** kalau dibaca dari **dalam script PHP** (setelah RINIT), tapi belum ter-populate saat RINIT dipanggil.
3. `SG(request_info).path_translated` juga `NULL` — ditelusuri ke `php_cli_server_client_populate_request_info()` (dipanggil SEBELUM `php_request_startup()`/RINIT, jadi timing seharusnya benar), tapi `client->request.path_translated` sendiri hanya diisi oleh `php_cli_server_request_translate_vpath()` untuk request yang **match file fisik** — untuk path virtual murni (`/api/users`, tidak ada file `users` di disk), field itu sengaja tetap kosong oleh SAPI itu sendiri, bukan soal urutan waktu.
4. `PG(doc_root)` (setting `php.ini` global `doc_root`) — `NULL`, dan lagipula itu bukan representasi `-t` target CLI server, jadi tidak relevan.
5. `getcwd()` (C standar) — mengembalikan lokasi `php.exe`, bukan `-t` target.

**Kesimpulan**: untuk path virtual (yang justru **satu-satunya kasus yang penting** bagi NxDom — `/api/*` memang selalu virtual), **tidak ada API publik/native manapun** yang bisa dipakai `RINIT` untuk mengetahui document root di CLI Server SAPI. Kemungkinan SAPI lain (Apache module, PHP-FPM) berperilaku berbeda dan bisa saja punya jalur yang bekerja — **belum diriset**, karena effort lanjutan ini butuh keputusan eksplisit (lihat pertanyaan yang diajukan ke user setelah temuan ini).

**Dampak ke desain**: `nxdom_kernel_handle()`, `nxdom_router_dispatch()`, dan seluruh komponen di baliknya (`Database`/`QueryBuilder`/`Auth`) semuanya **tetap benar dan sudah teruji tuntas** (lihat hasil pengujian `nxdom_debug_dispatch()` sebelumnya) — masalahnya murni di titik **bagaimana `RINIT` tahu harus memanggil `nxdom_kernel_handle()` dengan document_root yang benar**, bukan logic di dalamnya.

### 0F. Dikonfirmasi juga di Apache module SAPI, bukan cuma CLI Server (2026-09-14)

Ditegur user karena riset 0E dilakukan dengan CLI Server SAPI (`php -S`), padahal target produksi sebenarnya adalah **Apache** (README §17/§28) dan vhost Apache nyata (`demo.local` → `D:\Framework\CLI\NxPHP\examples\demo`, dibuat user sebelumnya) sudah tersedia. Diuji ulang dengan cara yang benar:

1. `php_nxdom.dll` disalin ke `extension_dir` server rujukan (`C:\Tnserver\bin\php\ext\`); `pdo_sqlite` **sudah aktif bawaan** di `php.ini` server itu (tidak perlu disalin ulang).
2. `extension=nxdom` ditambahkan ke `C:\Tnserver\bin\php\php.ini` (**global**, tidak bisa di-scope per-vhost — keterbatasan PHP sendiri, bukan Apache). Dicatat eksplisit sebagai perubahan server bersama, dikonfirmasi user sebelum dieksekusi (sama seperti protokol `auto_prepend_file` sebelumnya) — risikonya lebih rendah karena `RINIT` NxDom aman untuk app tanpa `nxdom.config.json` (langsung return, tidak ada efek ke Ngorei dkk).
3. Apache di-restart (service Windows, oleh user dengan hak admin) — bersih, tidak ada error terkait `nxdom` di log.

**Hasil pengujian lewat `http://demo.local/` sungguhan**:
- `GET /` (file statis, index.html) → 200, normal. ✅
- `GET /api/users` → **404 dari Apache sendiri** (bukan dari NxDom — body-nya halaman error Apache default, bukan JSON) — **persis konfirmasi 0C**: Apache tidak pernah memanggil PHP interpreter sama sekali untuk path tanpa file fisik dan tanpa `mod_rewrite`, jadi `RINIT` tidak pernah terpanggil.
- `GET /nxdom.config.json` → **200, isi ter-serve mentah (bocor kredensial!)** — **regresi terhadap tujuan keamanan awal**. Penyebab sama: file `.json` diserve Apache sebagai static file langsung (`FilesMatch \.php$` di vhost hanya meng-invoke PHP untuk file `.php`), PHP/RINIT tidak pernah dipanggil sama sekali untuk request ini.

**Kesimpulan definitif** (menggantikan constraint tunggal 0C dengan yang lebih tegas): native extension PHP — di SAPI manapun yang sudah diuji (CLI Server, Apache module) — **tidak bisa** menjadi solusi tunggal untuk (a) routing path virtual maupun (b) proteksi file sensitif, **kecuali** PHP interpreter memang dipanggil untuk request itu. Ini bukan kekurangan implementasi NxDom, melainkan cara kerja fundamental SAPI PHP: modul PHP (native atau tidak) hanya "bangun" ketika web server sudah memutuskan menjalankan PHP.

**Konsekuensi**: proteksi `nxdom.*.json` dan routing `/api/*` **tetap** memerlukan bantuan konfigurasi web server (mis. `mod_rewrite` + `<FilesMatch>` deny, seperti percobaan Bagian [riwayat Apache sebelumnya] — bedanya sekarang harus dipasang sebagai **konfigurasi server generik** yang berlaku untuk vhost mana pun yang punya `nxdom.config.json`, bukan config khusus satu app, supaya tidak mengulang pelanggaran README §6). Native extension NxDom tetap bernilai penuh untuk **logic** (Kernel/Router/Database/Auth — semua sudah terbukti benar dan reusable), tapi **bukan** solusi lengkap untuk "zero config web server" seperti yang diharapkan murni dari sisi extension saja.

### 0G. Solusi Final: Front Controller + `mod_rewrite` Generik (2026-09-14) — ✅ BERHASIL, teruji lewat Apache sungguhan

Ditegur user (tepat) karena README §11/§12/§32 sendiri **tidak pernah** menuntut zero-config — Apache/Nginx tetap ada di depan PHP, router NxDom bekerja **setelah** PHP dipanggil. Solusi yang seharusnya diterima sejak 0C: **satu front controller generik** (`nxdom/front-native.php` — satu file untuk SEMUA app NxDom, bukan per-app) dipasang lewat **satu baris `Include` identik** di tiap `<VirtualHost>` yang mengarah ke `conf/nxdom-rewrite.conf` (isi generik: blokir `nxdom.*.json` + rewrite path tanpa file fisik ke front controller, kondisional pada `nxdom.config.json` ada di document root).

**API final**: `nxdom_dispatch()` (tanpa parameter, beda dari `nxdom_debug_dispatch()` yang butuh 3 parameter untuk testing) — baca `$_SERVER['DOCUMENT_ROOT']`/`['REQUEST_URI']` dari `EG(symbol_table)` (aman dipanggil dari sini karena di titik ini, dipanggil dari script PHP biasa bukan RINIT, auto-global sudah ter-trigger — beda dari keterbatasan RINIT di 0E), lalu panggil `nxdom_kernel_handle()` yang sudah terbukti benar sejak 0D.

**Rangkaian bug ditemukan & diperbaiki selama setup (semua lewat pengujian nyata, bukan tinjauan kode)**:
1. **Rewrite server-level tidak berlaku untuk `<VirtualHost>` bernama** — percobaan pertama taruh `RewriteEngine`/`RewriteRule` di luar semua `<VirtualHost>` di `httpd.conf`; ternyata Apache tidak mewariskan `Rewrite*` dari server config ke vhost bernama (virtual host merging, perilaku standar Apache). Solusi: pindah ke file `conf/nxdom-rewrite.conf`, di-`Include` satu baris identik di tiap vhost.
2. **Pola regex tanpa leading slash tidak pernah match** — `^nxdom\.[a-z]+\.json$` ditulis tanpa `/` di depan, padahal URI yang dicocokkan Apache selalu berupa `/nxdom.config.json` (berawalan slash). Diperbaiki jadi `^/?nxdom\.[a-z]+\.json$`. Ditemukan lewat `LogLevel rewrite:trace5`, sama seperti pola bug yang **pernah** ditemukan di percobaan Apache jauh sebelumnya (lupa diterapkan lagi di rule baru — pelajaran: pelajaran lama harus dicek ulang eksplisit, bukan diasumsikan otomatis terbawa).
3. **`IS_SUBREQ` terlupa lagi** — DirectoryIndex mencoba `index.php` sebelum `index.html`, sub-request internal untuk `/index.php` (tidak match file fisik karena app pakai `index.html`) ikut ter-rewrite ke front controller. Persis bug yang sama seperti percobaan Apache sebelumnya, terlupa lagi di rule baru ini.
4. **`VirtualProtect() failed [87]` di Apache error log** — muncul konsisten setelah `extension=nxdom` aktif bersama `zend_extension=opcache`. **Dugaan awal (opcache adalah penyebab fungsional kegagalan) TERBUKTI SALAH** setelah investigasi lebih lanjut — lihat poin 5.
5. **BUG PALING SULIT DITEMUKAN — `$_SERVER` lazy-initialization**: `nxdom_dispatch()` konsisten `return false` (front controller jatuh ke 404-nya sendiri) walau `nxdom_kernel_handle()` sendiri sudah terbukti benar. Diagnosis salah arah berkali-kali (dikira: state basi antar-restart, dikira: opcache, dikira: file cache) sebelum ditemukan lewat eliminasi sistematis (menambah satu baris kode setiap kali, uji ulang): **akar masalahnya `$_SERVER` PHP bersifat *lazy-initialized*** — auto-global baru benar-benar dibangun di `EG(symbol_table)` saat **pertama kali diakses dari kode PHP userland** (`zend_is_auto_global` trigger populasi). `nxdom_dispatch()` membaca `EG(symbol_table)` **langsung** dari C, melewati mekanisme lazy-load itu — kalau front controller tidak pernah menyentuh `$_SERVER` dari sisi PHP lebih dulu, entrinya belum ada sama sekali saat kode C mencoba membacanya. **Solusi**: baris `$_SERVER['REQUEST_URI'];` (sengaja tidak dipakai hasilnya) ditambahkan di awal `front-native.php` sebelum memanggil `nxdom_dispatch()` — bukan workaround tersembunyi, didokumentasikan eksplisit sebagai bagian kontrak front controller. Opcache **dikonfirmasi tidak relevan** (diuji nyala/mati dengan fix ini, hasil konsisten 200 di kedua kondisi) — kegagalan konsisten sebelumnya kebetulan selalu terjadi bersamaan dengan kondisi `$_SERVER` belum ter-trigger, bukan karena opcache itu sendiri.

**Diuji dan berhasil PENUH lewat Apache sungguhan** (`http://demo.local/`, bukan simulasi): file statis (200), `nxdom.config.json` (403, tidak lagi bocor), seluruh siklus CRUD (`GET/POST/PUT` `/api/users`, `/api/users/:id`) dan auth (register/login/me/guard/logout) — identik hasil dengan seluruh pengujian `nxdom_debug_dispatch()` sebelumnya, kali ini murni lewat request HTTP nyata ke Apache tanpa fungsi debug apa pun. Diuji 5x request berturut-turut untuk memastikan konsistensi (bukan kebetulan sekali berhasil).

**Artefak**: `nxdom_dispatch()` (API final, `nxdom.c`), `nxdom/front-native.php` (front controller generik), `C:\Tnserver\bin\Apache\conf\nxdom-rewrite.conf` (rule generik, di-Include per-vhost), `<Directory>` izin akses `front-native.php` di `httpd.conf` (least privilege, sama seperti pola front.php versi PHP-package dulu).

### 0H. Validasi Akhir — JS SDK (`@nxdom/client`, M5) Tetap Kompatibel Tanpa Perubahan (2026-09-14)

Ditanya user: bagaimana nasib `examples/demo/app.js` (`import nxdom from '@nxdom/client'`, dibangun M5 sebagai PHP package) setelah seluruh backend beralih total ke native C extension? Dijawab dengan pengujian nyata, bukan asumsi teoretis — dijalankan ulang `packages/nxdom-js/test/manual-e2e.mjs` (test M5 lama, tidak diubah satu baris pun) dengan `baseUrl` diarahkan ke `http://demo.local` (native extension via Apache, bukan lagi `php -S`+package PHP).

**Hasil: 14/14 assertion lolos**, identik dengan hasil M5 asli — `db().get()/where()/orderBy()/find()`, seluruh siklus `auth.register/login/me/logout()`, guard `auth:true` pada `update()`. SDK JS **sama sekali tidak perlu diubah** karena kontrak HTTP (path, method, format `{"data":...}`/`{"error":...}`, status code) sengaja dijaga identik sepanjang proses porting PHP→C (M0D-M0G).

**Rantai lengkap yang kini teruji end-to-end**, dari visi README (`Write JavaScript. Run on PHP.`) sampai implementasi nyata:
```
app.js (browser) → @nxdom/client SDK (fetch) → HTTP → Apache (mod_rewrite generik)
  → front-native.php → nxdom_dispatch() (C, extension=nxdom) → Kernel/Router/Database/Auth (C) → SQLite (PDO)
```

### 0I. Driver `mysql` — Diuji Ulang dengan MySQL Sungguhan (bukan MariaDB), lewat Apache (2026-09-14)

Sebelumnya driver `mysql` hanya diuji dengan MariaDB 10.11.19 **portable** (M-porting Auth/Database). Ditemukan MySQL **sungguhan** (5.7.44) sudah berjalan di server dev ini (port 3306, service non-Windows-service, kredensial disediakan user) — dipakai untuk validasi tambahan yang lebih representatif produksi.

- Database terisolasi `nxdom_test` dibuat khusus (tidak memakai database proyek lain yang sudah ada di server MySQL yang sama, mis. `nexa02`, `beasiswa`, dll.).
- App terpisah `examples/demo-mysql/` (reuse `app.js`/`assets`/manifest dari `examples/demo/`, hanya `nxdom.config.json` beda: `driver: mysql`, host/port/kredensial MySQL sungguhan).
- Vhost `demo-mysql.local` ditambahkan ke `httpd-vhosts.conf` (pola identik `demo.local`, termasuk `Include conf/nxdom-rewrite.conf` yang sama) — diuji via `curl -H "Host: demo-mysql.local"` tanpa mendaftarkan ke hosts file (tidak perlu privilese admin tambahan).

**Hasil: seluruh siklus CRUD + auth lengkap berhasil** — query, get-by-id, register, login, update dengan guard `auth:true`, logout, dan guard menolak setelah logout — identik hasilnya dengan pengujian SQLite/MariaDB sebelumnya, tanpa perbedaan kode apa pun (driver dipilih murni dari `nxdom.config.json`). Ini pembuktian bahwa `nxdom_database_connect()` untuk driver `mysql` bekerja terhadap MySQL versi lama (5.7, bukan hanya MariaDB modern) dan lewat Apache module SAPI sungguhan (bukan `php -S`).

### 0D. Desain Lifecycle Hook (Hybrid C + PHP)

Sesuai keputusan "extension C sebagai lifecycle hook tipis, panggil balik ke PHP" (bukan port semua logic ke C murni — terlalu berisiko memory-unsafe untuk query builder/session/JSON):

**Revisi keputusan (2026-09-14)**: desain "panggil balik ke PHP" di atas **dibatalkan** — ditemukan bahwa itu tidak menghilangkan ketergantungan pada file `.php` eksternal (`nxdom/core/*.php` tetap harus ada di server), sehingga secara arsitektur nyaris sama dengan `auto_prepend_file` yang sudah kita revisi sebelumnya, tanpa keuntungan nyata. **Keputusan final: port logic ke C sungguhan** (tulis ulang, bukan panggil balik) — `nxdom/core/*.php` (843 baris total) tidak lagi dipakai di jalur produksi setelah portingnya selesai; file itu tetap ada di repo sebagai *referensi* bacaan saat porting, bukan dependency runtime.

**Strategi porting** (bertahap per komponen, urutan dari paling sederhana/tanpa-I/O ke paling kompleks):
1. `Response` (28 baris PHP) — ✅ selesai.
2. `AppContext` (54 baris PHP) — ✅ selesai.
3. `Router::match()`/`segments()` — ✅ selesai. `Router::dispatch()`/`dispatchAuth()`/`handleQuery/Get/Create/Update/Delete()`/`jsonBody()`/`filterFillable()`/`clientWhereFromQueryString()` (sisa 279 baris, butuh Database+Auth) — ✅ **selesai juga**, lihat entri terpisah di bawah setelah komponen 4-5.
4. `Database`/`QueryBuilder` (70+192 baris PHP) — ✅ selesai. Pendekatan: **instantiate objek `PDO` userland** (`nxdom_new_object("PDO", ...)`) dan panggil method-nya (`prepare`/`execute`/`fetchAll`/`lastInsertId`/`rowCount`) via helper generik `nxdom_call.h` — bukan menulis driver SQL dari nol, PDO sendiri sudah C extension matang.
5. `Auth` (133 baris PHP) — ✅ selesai. **Rencana awal (pakai `PS(...)` macro native ext/session) TERBUKTI SALAH** — lihat catatan bug kritis di bawah. Pendekatan final: `password_hash`/`password_verify`/`session_start`/`session_name`/`session_set_cookie_params`/`session_destroy`/`session_regenerate_id` **semua userland call** (`nxdom_call.h`), `$_SESSION` dibaca/ditulis lewat `EG(symbol_table)` (cara resmi PHP sendiri menyimpan superglobal).

**Pola teknis yang terbukti bekerja** untuk komponen 1-2: representasi data map/dictionary (config, manifest, database creds) tetap pakai tipe Zend (`zval`/`HashTable`), BUKAN struct C kaku — field-nya bervariasi tergantung driver/opsional, memaksakan struct fixed-field hanya menduplikasi skema yang sudah ada di `nxdom/config/*.schema.json` tanpa manfaat. Untuk operasi yang PHP sendiri sudah punya fungsi userland matang (`json_decode`/`json_encode`), dipanggil via `call_user_function(NULL, NULL, &func_name, &retval, argc, argv)` (macro di `Zend/zend_API.h`) — bukan menulis parser JSON manual di C, itu tidak sepadan risikonya untuk manfaat yang kecil. Baca file pakai `php_stream_open_wrapper`+`php_stream_copy_to_mem` (native, bukan `fopen` C standar — supaya kompatibel stream wrapper PHP).

**Artefak**: `php-src\ext\nxdom\{nxdom_app_context.h,.c, nxdom_response.h,.c}`, fungsi PHP-facing sementara untuk uji manual (`nxdom_debug_app_context()`, `nxdom_debug_response_ok()` — bukan API final, akan diganti saat `Router`/`Kernel` native tersambung).

**Bug ditemukan & diperbaiki saat build**: (1) lupa menjalankan ulang `buildconf.bat` setelah menambah file `.c` baru ke `config.w32` — `configure.js` hasil buildconf lama masih menyimpan daftar source file versi sebelumnya, menyebabkan link error "unresolved external symbol" walau file baru sudah ada dan benar; (2) `Z_ARRVAL(storage_zv)` seharusnya `Z_ARRVAL_P(storage_zv)` — `storage_zv` adalah `zval *` (pointer, hasil `zend_hash_str_find`), bukan `zval` value, ketahuan lewat `error C2231` compiler.

**Diuji dan berhasil** dengan `php.exe` server rujukan sungguhan (`C:\Tnserver\bin\php\php.exe`, bukan php.exe hasil build sendiri): `nxdom_debug_app_context()` membaca `nxdom.config.json` + `nxdom.manifest.json` nyata (9 route dengan nested `constraints`/`where`/`orderBy` nested) dan menghasilkan struktur PHP array yang identik dengan yang dihasilkan versi PHP asli; `nxdom_debug_response_ok()` menghasilkan `{"data": ...}` JSON yang sama persis format-nya dengan `Response::ok()` PHP.

**`Router::match()` — artefak**: `nxdom_router.h`/`.c`, fungsi uji `nxdom_debug_router_match()`. Implementasi C memakai in-place string splitting (mutasi buffer lokal, tanpa alokasi per-segmen) untuk `segments()`, dan `strcasecmp` untuk perbandingan method case-insensitive (setara `strtoupper()` dobel di PHP). Diuji dengan manifest nyata (9 route) dan `php.exe` server rujukan sungguhan, mencakup: query dengan constraints nested (copy utuh), path parameter `:id` (`{"id":"42"}`), method case-insensitive (`get` tetap cocok `GET`), method tidak cocok → `null`, path tidak cocok → `null`, jumlah segmen berbeda → `null`, slash ganda/trailing (`//api//users//`) tetap ternormalisasi dan cocok, serta route ber-`auth: true` (`PUT /api/users/:id`) — semua identik perilaku dengan versi PHP asli.

**`Database`/`QueryBuilder` — artefak**: `nxdom_call.h`/`.c` (helper generik: `nxdom_call_method` panggil method objek dengan N argumen via `zend_fcall_info`/`zend_fcall_info_call`, `nxdom_call_function` panggil fungsi global by name, `nxdom_new_object` instantiate class + panggil constructor via `object_init_ex`+`get_constructor`+`zend_call_known_function` — pola resmi yang sama dipakai `ReflectionClass::newInstance()` di `ext/reflection`), `nxdom_database.h`/`.c` (bangun DSN dari config, resolve path SQLite relatif termasuk mkdir -p via `php_stream_mkdir`, instantiate `PDO`), `nxdom_query_builder.h`/`.c` (struct builder dengan `wheres`/`order_by` sebagai zval array — bukan struct kaku, method `where`/`orderBy`/`replaceOrderBy`/`limit`/`applyConstraints`/`get`/`find`/`insert`/`update`/`delete`, validasi identifier kolom/tabel manual di C — regex `^[a-zA-Z_][a-zA-Z0-9_]*$` ditulis sebagai character check langsung, bukan memanggil PCRE engine, karena polanya sesederhana itu). Fungsi uji: `nxdom_debug_query()`, `nxdom_debug_insert()`.

Perlu dependency eksternal SQLite (`phpsdk_deps`, lihat `install.md` Langkah 7 — env var `PHP_SDK_VS=vs16` wajib di-set manual karena starter script resmi dilewati) dan flag `configure` tambahan `--enable-pdo --with-pdo-sqlite=shared`.

**Bug ditemukan & diperbaiki saat build**: (3) `static ZEND_TLS` — `error C2159: more than one storage class specified`; `ZEND_TLS` sendiri sudah mencakup `static` di implementasinya, kombinasi keduanya ditolak MSVC (beda dari GCC yang mungkin toleran) — dihapus jadi `ZEND_TLS` saja. (4) Macro `smart_str_appends`/dst. "unresolved external symbol" saat linking — `php.h` hanya menyertakan `zend_smart_str_public.h` (deklarasi struct), bukan `zend_smart_str.h` penuh (macro/fungsi inline); harus di-`#include` eksplisit di file yang memakainya.

**Diuji dan berhasil** dengan `php.exe` server rujukan sungguhan + `php_pdo_sqlite.dll` dimuat bersamaan: `nxdom_debug_query()` dengan constraints berbentuk persis manifest asli (`where`/`orderBy`/`limit`) mengembalikan 2 baris (Ayu, Budi; Citra ter-filter `active=false`) — identik hasil dengan pengujian PHP M2; `nxdom_debug_insert()` mengembalikan id baru sebagai string (`lastInsertId()` PDO), dan query ulang setelahnya mengonfirmasi baris baru benar-benar tersimpan.

**Driver `mysql` — juga diuji nyata** (bukan cuma diverifikasi lewat kode/DSN construction seperti status M2 versi PHP sebelumnya). Server rujukan tidak punya MySQL/MariaDB aktif (hanya sisa log WampServer 2023 yang sudah tidak terpasang) — dipasang **MariaDB 10.11.19 portable** (zip, bukan installer/service — lihat `install.md` Langkah 8) khusus untuk pengujian, dijalankan standalone di port 3307, dimatikan lagi setelah selesai. Build butuh `mysqlnd` (MySQL Native Driver, built-in php-src, tidak butuh library eksternal) — sempat gagal link (`unresolved external symbol mysqlnd_*`) karena `--disable-all` mematikan `mysqlnd` meski default `ARG_WITH` adalah `"yes"` (inkonsistensi build system: `pdo_mysql` tetap mencoba link ke mysqlnd walau mysqlnd sendiri tidak ter-enable); teratasi dengan flag eksplisit `--with-mysqlnd=yes` bersama `--with-pdo-mysql=mysqlnd`. `nxdom_debug_query()`/`nxdom_debug_insert()` terhadap MariaDB nyata (DSN `mysql:host=127.0.0.1;port=3307;...`) menghasilkan hasil identik dengan pengujian SQLite. Divalidasi dengan `php.exe` hasil build sendiri (bukan server rujukan — `pdo_mysql` ter-build `static`/tertanam, tidak bisa disalin sebagai `.dll` terpisah lintas binary seperti `pdo_sqlite`; `.dll` NxDom-nya sendiri identik, keputusan sadar untuk tidak build ulang server rujukan hanya demi ini).

**`Auth` — artefak**: `nxdom_auth.h`/`.c` — `nxdom_auth_register()`, `nxdom_auth_login()`, `nxdom_auth_logout()`, `nxdom_auth_me()`, `nxdom_auth_is_authenticated()`. Fungsi uji: `nxdom_debug_auth_{register,login,logout,me,check}()`.

**🔴 BUG KRITIS ditemukan & diperbaiki — SEGFAULT nyata**: percobaan pertama memakai pendekatan "campuran native+userland" yang disepakati (Bagian 0D awal) — `php_session_start()` dipanggil native, `$_SESSION` dibaca/tulis via macro `PS(http_session_vars)` — **segfault langsung** (`exit 139`) begitu `nxdom_debug_auth_check()` dipanggil, bahkan tanpa operasi lain sebelumnya. Akar penyebab: macro `PS(v)` (di `ext/session/php_session.h`) di-`#define` sebagai `ZEND_TSRMG(ps_globals_id, ...)`, dan `ps_globals_id` adalah **variabel internal modul `ext/session` yang tidak diekspor/dideklarasikan di header publik** — extension eksternal (`nxdom`) yang mencoba memakainya membaca simbol yang tidak valid dari perspektifnya sendiri. Ini kesalahan asumsi arsitektur (mengira ada "native API" untuk akses session padahal yang ada adalah implementasi internal privat), bukan sekadar typo — ditemukan lewat pengujian langsung, bukan review kode.
**Solusi final**: session_start/session_name/session_destroy/session_regenerate_id **semua userland call**, `$_SESSION` diakses lewat **`EG(symbol_table)`** — dipelajari dari source `ext/session/session.c` sendiri (`php_session_track_init()`): PHP menyimpan `$_SESSION` sebagai entri biasa di symbol table global dengan key `"_SESSION"`, bukan lewat struct privat — inilah API yang sebenarnya aman diakses extension lain.

**🔴 BUG KEDUA ditemukan & diperbaiki — logout tidak benar-benar logout**: setelah bug segfault teratasi, pengujian end-to-end lewat HTTP (cookie session sungguhan, bukan cuma CLI) menunjukkan `isAuthenticated()` tetap `true` setelah `logout()` dipanggil. Akar penyebab: `nxdom_auth_logout()` awalnya memanggil `session_start()` **langsung tanpa `session_name()` dulu** — beroperasi pada session default (`PHPSESSID`), bukan session NxDom (`nxdom_{app->id}`) yang sedang aktif, sehingga `session_destroy()` menghapus session yang salah sama sekali. Diperbaiki dengan mengubah signature `nxdom_auth_logout()` menerima `nxdom_app_context*` dan memanggil `nxdom_ensure_session_started(ctx)` (yang menyertakan `session_name()`) alih-alih `session_start()` polos — port yang correct dari `Auth::logout()` PHP yang juga memanggil `ensureSessionStarted()` lebih dulu.

**Diuji dan berhasil** end-to-end lewat HTTP sungguhan (`php -S` + `curl` dengan cookie jar, meniru siklus request nyata — CLI saja tidak cukup untuk menguji session/cookie): guard `check` → `false` sebelum login; `login` password salah → error, password benar → data user (tanpa kolom password); `check`/`me` → `true`/data user setelah login; `logout` → `check`/`me` kembali `false`/`null` — siklus lengkap identik perilaku dengan versi PHP M4.

### `Router::dispatch()` — menyatukan semua komponen jadi satu alur request lengkap

Bagian terakhir porting native: menyambungkan `match()`, `Database`/`QueryBuilder`, dan `Auth` yang sudah selesai jadi satu fungsi `nxdom_router_dispatch()`, meng-port sisa `Router.php` (`dispatch`, `dispatchAuth`, `handleQuery/Get/Create/Update/Delete`, `jsonBody`, `filterFillable`, `clientWhereFromQueryString`, `castQueryValue`).

**Pola teknis baru**: `$_GET` dan `php://input` (body request) diakses dengan cara yang sama seperti `$_SESSION` di Auth — `$_GET` lewat `EG(symbol_table)` (bukan API SAPI level rendah), `php://input` lewat `nxdom_read_file()` (helper `php_stream_open_wrapper` yang sama dipakai untuk baca `nxdom.config.json`/`nxdom.manifest.json`, di-extract jadi fungsi bersama di `nxdom_call.h` supaya tidak duplikasi 3x). Konsisten dengan prinsip keseluruhan porting ini: pakai API resmi/publik PHP (userland call atau struct yang memang didokumentasikan untuk dipakai luar), hindari struct/macro yang "kelihatan native" tapi sebenarnya privat modul lain (pelajaran dari bug segfault `PS(...)` di Auth).

**Artefak**: `nxdom_router_dispatch()` di `nxdom_router.c` (ditambahkan ke file yang sama dengan `nxdom_router_match()`, bukan file terpisah — keduanya sama-sama "Router"). Fungsi uji: `nxdom_debug_dispatch(basePath, method, path)` — satu pemanggilan yang meng-cover seluruh siklus resolve manifest → match route → dispatch, dipakai sebagai front controller uji lewat `php -S` (menggantikan pola `nxdom_debug_*` granular sebelumnya untuk pengujian end-to-end).

**Bug ditemukan & diperbaiki saat penulisan** (sebelum sempat dicoba build — ditemukan lewat self-review, bukan lewat compiler/runtime): kode awal sempat memakai `goto` label yang tidak lengkap dan pemanggilan `error_log()` sebagai fungsi C (padahal itu fungsi PHP userland, bukan simbol C) — dibersihkan sebelum build pertama. Saat build: `error_log` "unresolved external symbol" (dugaan salah bahwa nama fungsi PHP userland otomatis jadi simbol C yang bisa dipanggil langsung) — diganti `php_error_docref(NULL, E_WARNING, ...)`, API C native resmi untuk logging dari dalam extension.

**Diuji dan berhasil end-to-end lewat HTTP sungguhan** (`php -S` dengan front-controller kecil yang memanggil `nxdom_debug_dispatch()`, `curl` dengan cookie jar) — mereplikasi **seluruh** skenario CRUD+auth yang pernah diuji terpisah di M3/M5 (versi PHP) dan komponen individual C sebelumnya, kali ini sebagai satu alur utuh:
- `GET /api/users` (query+constraints manifest) → 200, 2 baris.
- `GET /api/users/:id` → 200 data benar; id tidak ada → 404.
- `GET /api/unknown` → 404 "Route not found".
- `where` client whitelisted → filter benar; non-whitelist → 403.
- `POST /api/users` (create+fillable) → 201, field di luar fillable (`is_admin`) diabaikan.
- `PUT`/`DELETE` dengan `auth:true` → 401 tanpa session, sukses dengan session valid, 404 untuk id yang sudah dihapus.
- `register` → `login` → `me` (session aktif) → `update` sukses → `delete` sukses → `logout` → request berikutnya 401 lagi (bukan replay session lama).

**Ini pembuktian akhir bahwa native extension NxDom — seluruh Response, AppContext, Router, Database, QueryBuilder, Auth — bekerja sebagai satu kesatuan utuh**, identik perilakunya dengan implementasi PHP package (M0-M7), sekarang sebagai C yang dikompilasi jadi `.dll` dan dimuat PHP produksi sungguhan.

---

## 1. Lokasi & Struktur Global NxDom di Server

```text
C:\Tnserver\
└── nxdom\                     ← instalasi NxDom (global, satu untuk semua app)
    ├── core\
    │   ├── Kernel.php          (entry point, menerima request, resolve app context)
    │   ├── Router.php
    │   ├── Database.php
    │   ├── Auth.php
    │   ├── Session.php
    │   ├── Storage.php
    │   └── Cache.php
    ├── bootstrap.php           ← file yang didaftarkan sebagai auto_prepend_file
    └── config\
        └── nxdom.php           (konfigurasi global: default DB driver, path apps, dll)
```

Setiap aplikasi (di `www/<app>/` atau document root masing-masing) tetap hanya berisi:

```text
www\myapp\
├── index.html / index.php (thin entry, atau tanpa index.php sama sekali)
├── app.js
├── style.css
├── nxdom.config.json        ← isolasi: nama app, koneksi DB, auth secret, dsb.
└── assets\
```

`nxdom.config.json` adalah satu-satunya "jejak" NxDom di level aplikasi — bukan kode, hanya konfigurasi (selaras README §23 "Isolasi Aplikasi").

> ⚠️ **Risiko**: karena file ini ada di document root, secara default bisa diakses langsung lewat browser (`GET /nxdom.config.json`) dan membocorkan kredensial DB/auth secret. Lihat Bagian 2 poin blokir akses — wajib aktif sebelum M1 dianggap selesai.

---

## 2. Mekanisme Bootstrap Global

1. Di `php.ini` server (`C:\Tnserver\bin\php\php.ini`) ditambahkan:
   ```ini
   auto_prepend_file = "C:\Tnserver\nxdom\bootstrap.php"
   ```
2. `bootstrap.php` dijalankan di **setiap** request PHP di server, tugasnya:
   - Autoload class-class core NxDom (spl_autoload sederhana, tanpa Composer wajib).
   - **Resolve App Context**: tentukan aplikasi mana yang sedang di-request. Strategi paling sederhana untuk PHP built-in server / dev: berdasarkan `$_SERVER['DOCUMENT_ROOT']` → cari `nxdom.config.json` di root tsb (naik ke folder induk bila perlu).
   - Muat `nxdom.config.json` app tsb → set konteks (nama app, koneksi DB, secret auth) ke dalam objek `Kernel` singleton.
   - Registrasikan fungsi global/helper (mis. `nxdom()` accessor) supaya endpoint app bisa memanggil `nxdom()->db(...)`, dst.
3. Jika request menyentuh route API (mis. path diawali `/api/`), Kernel mengambil alih (lewat Router) dan tidak melanjutkan ke file PHP app — meniru pola router `system/bin/index.php` yang sudah dilihat di server rujukan, tapi generik (bukan hardcode ke satu app).
4. **Blokir akses langsung ke file konfigurasi/manifest**: sebelum resolve route lain, Kernel mengecek apakah path yang diminta cocok dengan nama file sensitif milik NxDom (`nxdom.config.json`, `nxdom.manifest.json`, atau pola `nxdom.*.json` lainnya) — bila cocok, langsung balas `403 Forbidden` tanpa membaca isi file, terlepas dari method atau app context. Ini satu-satunya lapisan proteksi karena file tetap diletakkan di document root (lihat Bagian 1) — jadi pengecekan ini **wajib berjalan di setiap entry point** (`bootstrap.php` untuk Apache/Nginx, **dan** `router.php` untuk `php -S`), bukan opsional/tambahan.

**Catatan penting**: karena tidak pakai Apache/Nginx rewrite, untuk dev kita jalankan lewat PHP built-in server dengan router script:
```bash
php -S localhost:8080 C:\Tnserver\nxdom\router.php
```
`router.php` inilah yang menggantikan peran `auto_prepend_file` untuk kasus dev server (built-in server tidak selalu menghormati `auto_prepend_file` per-request secara konsisten untuk file statis) — jadi sebenarnya dibutuhkan **dua entry point yang setara**: `bootstrap.php` (untuk Apache/Nginx + `auto_prepend_file`) dan `router.php` (untuk `php -S`), keduanya memanggil `Kernel::handle()` yang sama.

---

## 3. Isolasi Multi-Aplikasi (README §23–24)

`Kernel::resolveApp()` bertanggung jawab menghasilkan objek `AppContext` berisi:

```text
AppContext
├── id            (slug app, dari nxdom.config.json atau nama folder)
├── basePath       (document root app)
├── database       (kredensial/driver, per-app)
├── session prefix (agar cookie/session tidak bentrok antar app)
├── storagePath    (folder upload/cache khusus app, di luar root NxDom)
└── authSecret     (untuk signing token API, per-app)
```

Semua pemanggilan `nxdom.db()`, `nxdom.auth()`, dst. di runtime **selalu discope** ke `AppContext` aktif — tidak ada state global lintas app dalam satu proses.

---

## 4. Desain API Awal (Server-side, dipanggil dari Router)

**Keputusan: manifest deklaratif, bukan PHP di app** (mengikuti ketat README prinsip #6 "Developer tidak perlu menulis PHP"). Developer hanya menulis JS di sisi client menggunakan NxDom JS API; compiler NxDom menganalisis pemanggilan tsb dan menghasilkan manifest route yang dibaca Router server saat runtime.

Contoh alur:

```js
// app.js (ditulis developer)
const users = await nxdom.db("users").where("active", true).get();
```

Compiler (`nxdom build`) menganalisis pemanggilan `nxdom.db(...)` di atas dan menghasilkan:

```json
// dist/nxdom.manifest.json (auto-generated, dibaca Kernel/Router saat request)
{
  "routes": [
    {
      "method": "GET",
      "path": "/api/users",
      "resource": "users",
      "action": "query",
      "constraints": { "where": [["active", "=", true]] }
    }
  ]
}
```

Router server (`core/Router.php`) tidak mengeksekusi "handler tertulis developer" (karena tidak ada), melainkan menginterpretasikan entri manifest langsung menjadi operasi Database/Auth/Storage generik — Router bersifat **data-driven**, bukan code-driven.

Implikasi desain:
- Compiler harus mem-parse AST JS (bukan sekadar regex) untuk menangkap pola `nxdom.db(...)`, `nxdom.auth(...)`, dst. secara andal — bagian tersulit dan berisiko dari keseluruhan proyek.
- Skema manifest (`nxdom.manifest.json`) menjadi **kontrak inti** antara compiler dan Kernel/Router — harus distabilkan lebih dulu sebelum keduanya dibangun paralel.
- Untuk kasus yang tidak bisa direpresentasikan manifest generik (business logic kompleks), perlu jalur "custom action" — didaftarkan lewat konfigurasi (bukan PHP bebas), misalnya named server-function yang sudah disediakan NxDom sendiri (bukan ditulis developer per-app). Ini perlu dieksplorasi saat M3/M-Compiler mulai terasa nyata batasnya.

---

## 5. Urutan Eksekusi (Milestone)

Karena Router bersifat data-driven (Bagian 4), **manifest schema harus stabil lebih dulu** — jadi M-Manifest mendahului Kernel/Router yang sesungguhnya. Untuk mempercepat pembuktian arsitektur, M1–M2 boleh memakai manifest **yang ditulis tangan** (belum digenerate compiler) agar Kernel/Database/Router bisa langsung diuji; compiler AST-parsing (M-Compiler) menyusul setelah kontrak manifest terbukti cukup.

1. **M0 — Skema Manifest (`nxdom.manifest.json`)** ✅ selesai
   Struktur: `routes[]` dengan `method`, `path` (wajib `/api/...`), `resource`, `action` (`query`/`get`/`create`/`update`/`delete`/`login`/`logout`/`register`/`me`), `params`, `constraints` (where/orderBy/limit/fillable), `auth` (boolean).
   Artefak:
   - `nxdom/config/manifest.schema.json` — JSON Schema manifest.
   - `nxdom/config/config.schema.json` — JSON Schema `nxdom.config.json` (per-app).
   - `examples/demo/nxdom.config.json`, `examples/demo/nxdom.manifest.json` — contoh tulis-tangan (CRUD users + auth login/me).
   - `scripts/validate-manifest.php` — validator struktural tanpa dependency eksternal (AJV tidak tersedia di environment ini); dijalankan dan **lolos** terhadap contoh demo via `C:\Tnserver\bin\php\php.exe`.

2. **M1 — Skeleton Kernel & Bootstrap** ✅ selesai
   Artefak: `nxdom/core/AppContext.php`, `nxdom/core/Kernel.php`, `nxdom/core/Router.php` (matching path+method, termasuk path param `:id`), `nxdom/autoload.php`, `nxdom/bootstrap.php` (Apache/Nginx), `nxdom/router.php` (php -S) — keduanya memanggil `Kernel::handle()` yang sama.
   Diuji dengan `php -S 127.0.0.1:8099 -t examples/demo nxdom/router.php` (PHP 8.1.31 dari `C:\Tnserver\bin\php\php.exe`):
   - `GET /` → `200` (file statis tetap terserve normal).
   - `GET /nxdom.config.json` dan `GET /nxdom.manifest.json` → `403` (kriteria wajib keamanan, lihat Bagian 2 poin 4).
   - `GET /api/users` → `200`, JSON mencerminkan `resource`, `action`, `constraints` persis dari manifest tulis-tangan M0.
   - `GET /api/users/42` → `200`, path param `:id` ter-capture jadi `{"id":"42"}`.
   - `GET /api/unknown` → `404` JSON, tidak crash.

   Router M1 baru men-dispatch echo terstruktur (belum ke Database/Auth sungguhan) — itu cakupan M2/M3/M4 berikutnya.

3. **M2 — Database Layer** ✅ selesai
   Artefak: `nxdom/core/Database.php` (wrapper PDO, driver sqlite/mysql/pgsql via `nxdom.config.json`), `nxdom/core/QueryBuilder.php` (`table()->where()->orderBy()->limit()->get()/find()/insert()/update()/delete()`, plus `applyConstraints()` yang menerima langsung struktur `constraints` dari manifest — jembatan siap pakai untuk M3).
   Proteksi dasar: whitelist nama tabel/kolom (regex identifier) dan operator `where` (`=, !=, >, >=, <, <=, like, in`), parameter selalu lewat prepared statement (bukan interpolasi string) — mencegah SQL injection dari constraints manifest yang bisa saja berasal dari input compiler/pengguna.
   Diuji dengan `scripts/seed-demo.php` (isi tabel `users` di SQLite app demo) dan `scripts/test-database.php` (10 assertion: query+constraints manifest asli, find, insert, update, delete, penolakan operator ilegal) — **semua lolos** via `C:\Tnserver\bin\php\php.exe`.

4. **M3 — Router Data-Driven + API Response** ✅ selesai
   Artefak: `nxdom/core/Response.php` (helper JSON standar: `ok`/`created`/`error`), `Router::dispatch()` dirombak dari echo placeholder (M1) menjadi eksekusi CRUD sungguhan ke `Database`/`QueryBuilder` (M2) — `query`/`get`/`create`/`update`/`delete` semua jalan; action auth (`login`/`logout`/`register`/`me`) sengaja dikembalikan `501` terkontrol (implementasi sungguhan itu cakupan M4).
   `create`/`update` menerapkan whitelist `constraints.fillable` dari manifest sebelum data masuk ke query — mencegah mass-assignment field yang tidak dimaksudkan (dibuktikan: field `password` di luar `fillable` update tidak ikut berubah meski dikirim di body).
   Exception `PDOException` ditangkap eksplisit di `dispatch()` → dibalas `500` JSON generik + detail dicatat ke `error_log()`, tidak dibocorkan ke response (ditemukan sebagai bug nyata saat pengujian: awalnya fatal error PDO bocor ke klien sebagai HTML berisi stack trace/path server — sudah diperbaiki).
   Diuji end-to-end via `php -S -t examples/demo nxdom/router.php`: seluruh siklus CRUD `/api/users`, percobaan delete ganda (404), body non-JSON (400), dan auth-stub (501) — semua sesuai ekspektasi.

5. **M4 — Auth dasar** ✅ selesai
   Keputusan skema: tabel/kolom auth (`table`, `identifier`, `passwordColumn`, `registerFillable`) dikonfigurasi di **`nxdom.config.json`** (bukan di manifest per-route) — satu skema user berlaku untuk seluruh app, konsisten dengan pola isolasi config yang sudah ada (secret, sessionTtl). Lihat `nxdom/config/config.schema.json` dan `examples/demo/nxdom.config.json`.
   Artefak: `nxdom/core/Auth.php` (register dengan `password_hash`, login dengan `password_verify` + `session_regenerate_id`, logout menghancurkan session, `me`, `isAuthenticated()` untuk guard), `nxdom/core/AuthException.php` (exception ber-status HTTP eksplisit). Session di-scope per-app lewat `session_name('nxdom_' . $app->id)` (README §23 isolasi) dengan cookie `httponly` + `samesite=Lax`.
   `Router::dispatch()` sekarang menegakkan **guard `route['auth'] === true`** sebelum action apa pun dijalankan (CRUD maupun auth) — bukan hanya dicatat di manifest tapi diabaikan.
   Manifest demo ditambah route `register`/`logout` yang sebelumnya belum ada (ditemukan hilang saat pengujian end-to-end — 404 "Route not found").
   Diuji end-to-end dengan cookie session (`curl -b/-c`) via `php -S`: guard 401 tanpa session, register sukses + password ter-hash (tidak pernah dikembalikan di response), duplikat identifier → 409, login password salah → 401 pesan generik (tidak membocorkan keberadaan akun), login benar → session aktif, `PUT /api/users/:id` (auth:true) sukses dengan session valid, logout menghancurkan session, request berikutnya dengan cookie lama tetap 401 (bukan replay).

6. **M5 — JS Client SDK** ✅ selesai
   Keputusan desain: constraints (`where`/`orderBy`/`limit`) yang ditulis di client (mis. `nxdom.db("users").where("name","like","%Budi%")`) **dikirim dinamis** lewat query string (`?where=kolom:operator:nilai&orderBy=kolom:arah&limit=N`), digabung di server dengan constraints manifest — bukan sekadar path statis. Aturan gabung (aspek keamanan paling penting di M5): **manifest = wajib+fixed, client hanya boleh menambah dalam whitelist eksplisit** (`constraints.allowClientWhere`, `allowClientOrderBy`, `maxClientLimit` — field baru di `manifest.schema.json`). Tanpa whitelist di manifest, client tidak bisa menambah apa pun untuk route itu. `where` client di-AND-kan dengan `where` manifest; `orderBy` client **menggantikan** (bukan AND, karena tidak bisa digabung seperti where) — lihat `QueryBuilder::replaceOrderBy()`; `limit` client dibatasi `min(diminta, maxClientLimit)`.
   Artefak server: `Router::handleQuery()` (parsing `$_GET['where']`/`orderBy`/`limit`, enforce whitelist → `403` bila kolom di luar whitelist).
   Artefak SDK: `packages/nxdom-js/src/{Http,QueryBuilder,Auth,index}.js` — `createClient(baseUrl)` menghasilkan `{ db(resource), auth }`; `Http` pakai `fetch` dengan `credentials: 'include'` (wajib agar cookie session dari M4 ikut terkirim).
   **Nama paket npm**: `@nxdom/client` (scoped), **bukan** `nxdom` polos — nama `nxdom` sudah dipakai global di mesin dev ini oleh `nxdom-cli` (`npm ls -g` menunjukkan `nxdom@npm:nxdom-cli@1.0.17 -> D:\riset\modules`, alias CLI platform induk yang berbeda tujuan, lihat konteks NxDOM/nxdom-cli di percakapan sebelumnya). Import di kode aplikasi tetap bisa memakai alias `nxdom` secara lokal (mis. lewat bundler) tanpa mengklaim nama itu di npm registry.
   Bug ditemukan & diperbaiki: (1) `QueryBuilder::orderBy()` semula selalu *append*, padahal orderBy client harus *replace* manifest — ditambah method `replaceOrderBy()`. (2) `index.js` awalnya mengekspor `createClient` dua kali (`export function` + `export {}`) → `SyntaxError: Duplicate export` saat dimuat Node, baru ketahuan begitu diuji nyata (bukan hanya ditulis).
   Diuji end-to-end dengan Node 22 asli (`fetch` bawaan + cookie jar manual di skrip uji) terhadap server PHP live: `packages/nxdom-js/test/manual-e2e.mjs` — 14 assertion (query+constraints dinamis, penolakan kolom di luar whitelist dengan `403`, orderBy replace, find 404, siklus auth lengkap register/login-salah/login-benar/me/logout, route `auth:true` sukses saat sesi aktif dan `401` setelah logout) — **semua lolos**.

7. **M6 — Compiler (AST parsing → manifest otomatis)** ✅ selesai
   Keputusan desain kunci: compiler membaca `app.js` (kode client) tapi kebijakan keamanan server (`fillable`, `allowClientWhere`/`allowClientOrderBy`/`maxClientLimit`, `auth`) **tidak bisa diturunkan otomatis** dari pemanggilan client biasa (`nxdom.db("users").create(data)` tidak menyebutkan field apa yang boleh diisi). Solusi: **`nxdom.policy.json`** — file kebijakan terpisah ditulis manual oleh developer (skema: `nxdom/config/policy.schema.json`), digabung compiler dengan hasil analisis AST. Build **ditolak eksplisit** (`PolicyMissingError`) jika resource dipakai dengan action `create`/`update` tapi tidak ada entri policy — mencegah endpoint tanpa whitelist fillable lolos ke produksi secara diam-diam.
   Cakupan pola v1 (didukung, didokumentasikan eksplisit di `cli/compiler/src/analyze.js`): `nxdom.db("<resource>").get/find/create/update/delete(...)` (termasuk lewat chain `.where()/.orderBy()/.limit()` di antaranya) dan `nxdom.auth.register/login/logout/me()`, hanya lewat `import nxdom from '@nxdom/client'` (default import, alias apa pun). Di luar itu (resource bukan string literal, alias variabel perantara pada hasil `nxdom.db(...)`, named import) compiler **menolak tegas** dengan `UnsupportedPatternError` — bukan diam-diam mengabaikan — mengarahkan developer menulis manifest manual untuk route tsb.
   Artefak: `cli/compiler/src/analyze.js` (parse via `acorn`+`acorn-walk`), `cli/compiler/src/build-manifest.js` (gabung `calls` + policy → manifest, route path/method mengikuti konvensi REST tetap per action), `cli/compiler/src/cli.js` (`node cli/compiler/src/cli.js <app-dir>` → tulis `nxdom.manifest.json`). Paket bernama `@nxdom/compiler` (scoped, konsisten dengan `@nxdom/client` di M5).
   **Nama paket SDK direvisi dari `nxdom` menjadi `@nxdom/client`** (scoped) — ditemukan nama `nxdom` sudah dipakai global di mesin dev (`npm ls -g`: `nxdom@npm:nxdom-cli@1.0.17`, alias CLI platform induk NxDOM yang berbeda tujuan) sebelum M6 dimulai.
   Bug ditemukan & diperbaiki lewat validasi silang (bandingkan manifest hasil compiler vs. manifest tulis-tangan M0-M5 yang sudah teruji, byte-diff terstruktur): pola pertama compiler hanya mengenali `nxdom.db("x").method()` langsung, sehingga `nxdom.db("users").where("active", true).get()` (chain dengan constraints dinamis, pola nyata dari M5) gagal terdeteksi — route `GET /api/users` (action `query`) hilang dari manifest hasil compiler. Diperbaiki dengan `findDbRoot()` yang menembus chain `where`/`orderBy`/`limit` sampai ke akar `nxdom.db(...)`.
   Diuji: (a) `examples/demo/app.js` + `nxdom.policy.json` dikompilasi, hasilnya **identik struktural** (diff by-field, bukan cuma path) dengan manifest tulis-tangan M0-M5 yang sudah lolos semua pengujian sebelumnya; (b) manifest hasil compiler divalidasi ulang dengan `scripts/validate-manifest.php` — lolos; (c) seluruh suite M5 (`manual-e2e.mjs`, 14 assertion) dijalankan ulang terhadap manifest hasil compiler tanpa mengubah kode server — **tidak ada regresi**; (d) `cli/compiler/test/test-compiler.mjs` — 10 unit test mencakup jalur bahagia, dedup, dan kedua jalur penolakan (`UnsupportedPatternError`, `PolicyMissingError`) — semua lolos.

8. **M7 — CLI (`nxdom-php create/dev/build`)** ✅ selesai
   **Nama command**: `nxdom-php`, **bukan** `nxdom` — command `nxdom` sudah dipakai `nxdom-cli` (platform induk NxDOM) di mesin dev ini, sama seperti alasan `@nxdom/client`/`@nxdom/compiler` scoped di M5/M6. Paket: `@nxdom/cli` (`cli/package.json`, bin `nxdom-php` → `cli/src/cli.js`).
   Artefak: `cli/src/create.js` (scaffold dari `cli/templates/app/`: `index.html`, `app.js`, `nxdom.policy.json` minimal, plus `nxdom.config.json` digenerate dinamis dengan `id` = nama app — **tidak** menulis `nxdom.manifest.json`, itu tugas build/dev lewat compiler M6), `cli/src/build.js` (wrapper `@nxdom/compiler`), `cli/src/dev.js` (build sekali → `php -S -t <app> nxdom/router.php` → `fs.watch` pada `app.js`+`nxdom.policy.json` untuk rebuild manifest otomatis tanpa restart server, karena Router membaca manifest ulang tiap request).
   Keputusan sengaja: PHP **tidak dibundel** (README §20-21) — `dev` mewajibkan `--php <path>` atau env `NXDOM_PHP_BIN`, tidak ada default hardcoded ke `C:\Tnserver\bin\php\php.exe` milik environment dev ini.
   Keterbatasan diketahui dan didokumentasikan (bukan bug): `create` tidak membuat skema tabel database — mencoba `GET` resource yang tabelnya belum ada menghasilkan `500` (PDOException tercatat di log server, tidak dibocorkan ke client, sesuai desain M3). Migration/schema management ada di luar scope M0-M7.
   Diuji nyata: (a) `create testapp` → struktur file benar, `{{APP_ID}}` ter-substitusi; (b) `build` → manifest 2 route sesuai template; (c) `dev` terhadap app baru → server jalan, `GET` ke tabel belum-ada menghasilkan `500` generik yang benar (bukan crash/kebocoran); (d) `dev` terhadap `examples/demo` (tabel sudah ada dari M1-M6) → `GET /api/users` sukses `200`; (e) **watch teruji**: edit `nxdom.policy.json` saat server jalan (menambah `constraints.limit`) ter-rebuild otomatis ke `nxdom.manifest.json` tanpa restart server, dibuktikan lewat isi file sebelum/sesudah.

---

## Ringkasan Status

**M0-M7 seluruhnya selesai dan teruji** terhadap PHP 8.1.31 nyata (`C:\Tnserver\bin\php\php.exe`) dan Node 22 nyata — bukan hanya ditulis di atas kertas. Pipeline lengkap terbukti bekerja end-to-end: `nxdom-php create` → tulis `app.js`+`nxdom.policy.json` → `nxdom-php dev` mengompilasi ke manifest → Kernel/Router men-dispatch ke Database/Auth sungguhan → SDK `@nxdom/client` dari browser/Node memanggilnya dengan constraints dinamis yang di-guard whitelist server.

Yang **belum** dikerjakan (di luar scope M0-M7, lihat Bagian 6 untuk daftar keputusan terbuka lain):
- Registrasi `auto_prepend_file` ke server sungguhan (sengaja ditunda, lihat peringatan di awal file ini).
- Native distribusi/packaging (composer package, instalasi ke server produksi sungguhan di luar `php -S`).
- Migration/schema management (create tabel otomatis).
- Driver `mysql`/`pgsql` baru diuji secara kode (DSN, prepared statement), belum diuji dengan server MySQL/Postgres nyata — hanya SQLite yang sudah diverifikasi end-to-end.

---

## 6. Yang Masih Perlu Diputuskan

- [ ] Skema lengkap `nxdom.manifest.json` (M0) — field untuk `constraints` selain `where` (order, limit, joins?), dan bagaimana merepresentasikan business logic yang tidak sekadar CRUD.
- [ ] Jalur "custom action" untuk logic kompleks yang tidak terekspresikan manifest generik (lihat catatan di Bagian 4).
- [ ] Format `nxdom.config.json` final (skema field).
- [ ] Strategi autoload: spl_autoload manual vs mensyaratkan Composer terpasang global di `C:\Tnserver\nxdom\vendor`.
- [ ] Target DB dev: mulai dari SQLite (tanpa setup server DB) lalu tambah MySQL, atau langsung MySQL/MariaDB.

---

## Referensi

- `README.md` — visi & prinsip arsitektur (35 poin).
- `C:\Tnserver\bin\php\php.ini` — konfigurasi PHP server rujukan.
- `C:\Tnserver\bin\php\app\system\bin\index.php` — contoh pola router PHP built-in server (milik proyek lain "Ngorei", dipakai hanya sebagai referensi pola, tidak disalin langsung).
