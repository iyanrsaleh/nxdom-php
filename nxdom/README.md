# nxdom/ — Instalasi NxDom di Level Server

Folder ini adalah instalasi NxDom **global** (README §1/§4) — tidak disalin ke aplikasi mana pun, satu untuk semua app di server.

## Isi aktif (dipakai runtime)

- **`index.php`** — front controller generik. Satu-satunya file PHP yang dijalankan Apache/Nginx untuk request `/api/*` dan sejenisnya, karena native extension sendiri tidak bisa dipanggil web server tanpa ada file fisik untuk dieksekusi (lihat `Plan.md` Bagian 0C/0E/0F/0G). Isinya hanya memanggil `nxdom_dispatch()` — logic sungguhan (Kernel/Router/Database/Auth) ada di native extension, bukan di sini.
- **`config/*.schema.json`** — dokumentasi kontrak `nxdom.config.json`/`nxdom.manifest.json`/`nxdom.policy.json` (JSON Schema, referensi struktur — tidak dieksekusi).

## Native extension (logic sungguhan)

Source C ada **di luar repo ini**, di `C:\phpsdk\phpmaster\vs16\x64\php-src\ext\nxdom\` (lokasi kerja build toolchain, lihat `install.md`). Hasil build (`php_nxdom.dll`/`.so`) disalin ke `extension_dir` PHP server dan diaktifkan lewat `extension=nxdom` di `php.ini` — lihat `Apache.md` untuk langkah lengkap.

Dua file build system:

- **`config.w32`** — build Windows (`nmake`), toolset MSVC (target server rujukan: v142/VS16).
- **`config.m4`** — build Linux/Unix (`phpize && ./configure && make`) — dipakai untuk build & uji di WSL (Ubuntu, aaPanel PHP 8.3), lihat `Plan_02.md` §9.6.

> **Build `.dll` untuk PHP VS16/v142**: BuildTools 2022 **tidak** menyediakan v142 (installer: "Cannot find package ... in product graph"). Perlu VS2019 lengkap, VS2022 penuh (via GUI), atau runner `windows-2019`. **Selalu verifikasi folder `VC\Tools\MSVC\14.2*` ada** sebelum build — kalau tidak, `nmake` memakai v143 dan `.dll` gagal di-load PHP VS16. Lihat `install.md` Langkah 1 (bagian "PENTING").

## `_archive-php-package/`

Arsip implementasi **PHP package** (M0-M7, sebelum keputusan beralih ke native C extension — lihat `Plan.md` Bagian 0/0B untuk riwayat kenapa). Berisi `Kernel.php`/`Router.php`/`Database.php`/`Auth.php`/dll versi PHP murni, `bootstrap.php` (untuk `auto_prepend_file`), `router.php` (untuk `php -S`), `front.php` (versi awal front controller sebelum jadi `index.php`).

**Tidak dipakai runtime** — disimpan sebagai referensi porting (setiap fungsi C di native extension punya padanan langsung di sini yang bisa dibaca untuk memahami logic aslinya sebelum ditulis ulang ke C).

## Rencana: route halaman prefix (`/help/*`) — segmen pertama = page (SUDAH DIEKSEKUSI ✅)

**Masalah**: route halaman (`action: "page"`) hanya cocok **exact**. `/help/data/demo3/dll` tidak match `/help`, sehingga jatuh ke SPA fallback (`index.html`) — tertahan/menyesatkan. Diinginkan: **segmen pertama** (`help`) = page, **sisanya** (`data/demo3/dll`) = parameter yang diteruskan (terbaca di halaman via `location.pathname`).

**Desain**:
- Route ditulis `"path": "/help/*"` — segmen terakhir `*` = prefix match.
- `nxdom_router_match()`: bila segmen terakhir route adalah `*`, route cocok kalau segmen-segmen sebelum `*` adalah **awalan** path (path boleh lebih panjang). Sisa segmen dikumpulkan ke `out_params` sebagai `0`,`1`,… (numerik) + `"rest"` (string gabungan).
- Handler page (`nxdom_handle_page`) tetap serve `pages/help.html`; halaman statis membaca sisa path dari `location.pathname` di client (tanpa perlu server var tambahan).
- `*` hanya valid sebagai segmen **terakhir**; validasi di schema/validator.

**Perubahan file**: `nxdom_router.c` (`nxdom_router_match`), `manifest.schema.json` + `scripts/validate-manifest.php` (izinkan `*` di akhir path), manifest demo (`/help/*`, `/about/*`).

**Status**: ✅ dieksekusi & diuji (`/help/data/demo3/dll` → serve `pages/help.html`).

## Rencana: route halaman (`action: "page"`) di router NxDom (SUDAH DIEKSEKUSI ✅)

**Masalah**: halaman non-`/api` (mis. `/about`, `/help`) saat ini **tidak** ditangani router NxDom — `nxdom_kernel_handle()` hanya memproses path berawalan `/api/`, sisanya diserahkan ke SPA fallback front controller. User ingin `/about` & `/help` menjadi **rute NxDom sungguhan** yang di-serve extension, bukan dirender client.

**Desain**:
- Manifest can carry page routes: `{ "method":"GET", "path":"/about", "action":"page", "page":"about" }`.
- Native `nxdom_kernel_handle()` diperluas: path **non-`/api/`** tetap dicoba match ke manifest (sebelumnya langsung menyerah ke front controller). Kalau tidak match manifest manapun, tetap return 0 → front controller lanjut (SPA fallback/404).
- `nxdom_router_dispatch()` menangani `action == "page"`: baca `<DOCUMENT_ROOT>/pages/<page>.html` dan kirim sebagai `text/html` (200). File tidak ada → 404.
- `page` **wajib identifier sederhana** (`^[a-zA-Z0-9_]+$`) — mencegah path traversal (`../`).

**Perubahan file**:
- `nxdom_kernel.c` — buang gate `/api/` (coba match manifest untuk path apa pun; kalau gagal → return 0).
- `nxdom_router.c` — cabang `action == "page"` + helper baca file.
- Manifest/policy schema — dokumentasikan `action: "page"`, field `page`.
- App demo: `pages/about.html`, `pages/help.html`.

**Status**: ✅ dieksekusi & diuji di `nxdom.local` (WSL).

## Rencana: menyamakan deployment dengan arsitektur README (SUDAH DIEKSEKUSI ✅)

**Masalah**: saat membuat demo uji di server WSL (`nxdom.local`, lihat `Plan_02.md` §11), `index.php` (front controller) **disalin ke dalam webroot app** (`/www/wwwroot/nxdom.local/index.php`). Ini melanggar README §6/§33/§35: aplikasi tidak boleh membawa kode runtime NxDom/front controller-nya sendiri — front controller harus **satu berkas generik global** yang dipakai semua app, dipasang sekali di level server.

**Yang benar sesuai tujuan awal** (README §4/§28/§35):
- Aplikasi hanya berisi aset + konfigurasi: `index.html`/`app.js`/`style.css`/`assets/` + `nxdom.config.json`/`nxdom.manifest.json`/`nxdom.policy.json`. `nxdom.config.json` **memang boleh** ada di document root — ia "satu-satunya jejak NxDom di level aplikasi", murni konfigurasi, bukan kode (`Plan.md`).
- **Front controller + rewrite = generik, sekali di server**, bukan per-app.

**Perubahan yang direncanakan**:
1. Pindahkan front controller ke lokasi global di luar semua webroot: `/www/nxdom/index.php`.
2. Hapus `index.php` dari webroot app (`/www/wwwroot/nxdom.local/`).
3. Vhost app hanya perlu satu `Include` rewrite generik (arahkan `/api/*` tanpa file fisik ke front controller global) + blokir `nxdom.*.json`. Config rewrite generik dipakai identik oleh semua vhost.

**Status**: ✅ dieksekusi untuk demo `nxdom.local` (front controller global di `/www/nxdom/index.php`, webroot app dibersihkan dari PHP), diuji nyata lewat nginx+FPM.
