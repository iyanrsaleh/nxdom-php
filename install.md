# Setup Toolchain — Native NxDom Extension (C)

Panduan ini membangun **NxDom sebagai native PHP extension** (`php_nxdom.dll`), diaktifkan lewat `extension=nxdom` di `php.ini` — sesuai README §7/§17/§28. Ikuti dari atas ke bawah; setiap bagian berisi **perintah yang harus dijalankan** lebih dulu, lalu catatan riwayat/pelajaran di bawahnya (boleh dilewati kalau cuma ingin mengulang prosesnya).

## Target build

Build harus **persis cocok** dengan PHP yang akan menjalankannya, kalau tidak `.dll` hasil build tidak akan bisa di-load (`Unable to load dynamic library` / ABI mismatch). Cek target dengan:

```
<path-ke-php.exe> -i
```

cari baris `Compiler`, `Thread Safety`, `Architecture`, `PHP Extension Build`. Untuk server rujukan proyek ini (`C:\Tnserver\bin\php\php.exe`):

```
PHP Version         : 8.1.31
Compiler            : Visual C++ 2019 (toolset MSVC v142)
Architecture         : x64
Thread Safety        : ZTS (enabled)
PHP Extension Build  : API20210902,TS,VS16
```

---

## Langkah 1 — Toolset compiler yang cocok

1. Install **Visual Studio Build Tools** (versi apa pun — 2022, 2026, dst. semuanya bisa dipakai, karena yang penting bukan versi produk installer-nya, tapi komponen toolset spesifik di langkah berikut).
2. Di **Visual Studio Installer → Modify**, tab **Individual components**, centang toolset MSVC yang **sama persis** dengan target (untuk VS16/VS2019: **"MSVC v142 - VS 2019 C++ x64/x86 build tools"**). Toolset default bawaan installer (biasanya versi terbaru) **tidak cukup** — PHP memvalidasi ketat string build saat load extension.
3. Verifikasi toolset benar-benar terpasang — cari folder versi `14.2x` (bukan `14.5x` atau versi installer lain) di:
   ```
   <VS install dir>\VC\Tools\MSVC\
   ```
   Jalankan `cl.exe` di dalamnya, banner harus menunjukkan versi `19.2x` (v142) — bukan `19.5x`/`19.4x` dst.

> **Riwayat**: mesin ini sudah punya "Visual Studio Build Tools 2026" (produk versi 18) tapi hanya toolset v143 (`cl` 19.51) — tidak cocok VS16. Menambahkan komponen v142 lewat Modify menyelesaikannya (`cl` jadi 19.29, cocok).

### PENTING — BuildTools 2022 (produk 17.x) TIDAK menyediakan v142 lewat command-line

Ditemukan lewat pengujian nyata (sesi 2026-10-14): pada **BuildTools 2022**, mencoba memasang v142 lewat command-line **GAGAL diam-diam meski `ExitCode=0`**:

```
setup.exe modify --installPath "<VS path>" --add Microsoft.VisualStudio.Component.VC.v142.x86.x64 --quiet --norestart
```

Log installer (`dd_setup_*.log`) berisi:
```
Warning: Cannot find package: Microsoft.VisualStudio.Component.VC.v142.x86.x64 in product graph.
```

Artinya komponen v142 **tidak ada di katalog channel** BuildTools 2022 ini — bukan soal ID salah. Verifikasi sesudahnya: folder `VC\Tools\MSVC\` tetap hanya berisi `14.44` (v143), tidak ada `14.2x`.

**Solusi untuk target PHP VS16/v142, pilih salah satu:**

- **A. Install Visual Studio 2019 lengkap** (punya v142 native) di mesin build, lalu ikuti Langkah 2 seterusnya dengan `vcvarsall.bat x64 -vcvars_ver=14.29`. Ini jalur paling pasti.
- **B. Install Visual Studio 2022 (bukan sekadar BuildTools)** — produk 2022 penuh kadang menyertakan komponen v142 di Individual components; centang lewat **GUI** (bukan `--add` headless) dan verifikasi folder `14.2x` benar-benar terbentuk sebelum lanjut.
- **C. Build di runner CI `windows-2019`** (punya v142) — cocok kalau tidak mau memasang VS2019 lokal.

**Jangan asumsikan `ExitCode=0` berarti komponen terpasang** — SELALU verifikasi folder `VC\Tools\MSVC\14.2*` ada sebelum melanjutkan build. Kalau tidak ada, `nmake` akan memakai v143 dan `.dll` hasilnya **tidak akan bisa di-load** oleh PHP VS16 (`linked with 14.4x, but the core is linked with 14.29`).

> **Catatan sesi ini**: mesin dev yang dipakai terakhir HANYA punya v143 (BuildTools 2022), dan v142 tidak bisa ditambahkan lewat CLI. Karena itu `.dll` di rilis `v0.0.x` **belum dikonfirmasi** cocok untuk PHP VS16/v142 — pengguna dengan PHP VS16 perlu build sendiri lewat salah satu jalur A/B/C di atas. `nxdom.so` (Linux, PHP 8.3 NTS) sudah terbukti termuat & berfungsi.

## Langkah 2 — PHP SDK

1. Clone ke path **pendek, dekat drive root, tanpa spasi** (wiki resmi PHP mewanti-wanti path panjang/berspasi bisa gagal build):
   ```
   git clone --branch php-sdk-2.2.0 https://github.com/php/php-sdk-binary-tools.git C:\phpsdk
   ```
2. Buka **cmd.exe murni** (bukan PowerShell, bukan starter script SDK dulu — lihat catatan toolset di bawah), lalu aktifkan toolset compiler yang benar secara eksplisit:
   ```
   cd C:\phpsdk
   call "<VS install dir>\VC\Auxiliary\Build\vcvarsall.bat" x64 -vcvars_ver=14.29
   cl
   ```
   Pastikan `cl` menunjukkan versi toolset yang benar (v142 → `19.29.xxxxx`) sebelum lanjut.
3. Tambahkan SDK ke `PATH` sesi ini, lalu buat build tree:
   ```
   set PATH=C:\phpsdk\bin;%PATH%
   phpsdk_version
   C:\phpsdk\bin\phpsdk_buildtree.bat phpmaster
   ```
   `phpsdk_version` harus menampilkan versi SDK (bukan error) — ini prasyarat langkah `configure` nanti. Build tree akan terbentuk di `C:\phpsdk\phpmaster\{vc14,vc15,vs16,vs17,vs18}\{x64,x86,arm64}\`.

> **Riwayat/pelajaran**:
> - Starter script resmi (`phpsdk-vs16-x64.bat`) **gagal** ("Could not determine 'vs16' directory") karena ia mendeteksi berdasarkan **versi produk Visual Studio installer** (mencari rentang versi [16,17)), bukan versi toolset compiler — Build Tools "2026" (produk versi 18) tidak pernah cocok meski toolset v142 sudah ada di dalamnya. Solusi: skip starter script, set environment manual seperti di atas.
> - Tool SDK (`phpsdk_buildtree`, `phpsdk_version`, dll.) tidak otomatis ada di `PATH` cmd.exe murni — harus ditambahkan manual atau dipanggil dengan path lengkap `C:\phpsdk\bin\<tool>.bat`.
> - **Semua langkah build (2 dan seterusnya) harus dijalankan di satu cmd.exe session yang sama** — jangan buka jendela baru di tengah proses, karena environment `PATH`/`INCLUDE`/`LIB` yang benar hanya berlaku untuk proses itu.

## Langkah 3 — Source PHP (versi yang sama persis dengan target)

1. Clone tag yang **persis sama** dengan versi target (bukan `master`/branch, dan bukan versi mendekati):
   ```
   git clone --branch php-8.1.31 --depth 1 https://github.com/php/php-src.git
   ```
2. Pindahkan/salin ke lokasi yang diharapkan build tree SDK: `C:\phpsdk\phpmaster\vs16\x64\php-src\` (path harus persis ini — nama folder `vs16` dipakai apa adanya meski toolset sesungguhnya v142, karena itu konvensi build tree SDK bukan nama toolset).
3. **Verifikasi lengkap sebelum lanjut** — jangan asumsikan operasi selesai hanya karena command kembali:
   ```
   git log -1 --format="%H %d"     # harus menunjukkan "tag: php-8.1.31", bukan "master"
   ```
   dan bandingkan jumlah file sumber vs. tujuan (`find <folder> -type f | wc -l`) — harus identik. Cek juga header kunci ada: `Zend\zend.h`, `main\php_version.h`, `TSRM\TSRM.h`.

> **Riwayat/pelajaran — PENTING untuk operasi file besar di Windows**:
> - `mv` lintas-drive (D: → C:) untuk ~21.000 file **tampak selesai lebih cepat dari yang sebenarnya** — proses masih berjalan di background jauh melebihi perkiraan waktu. Mengecek isi folder tujuan sebelum benar-benar tuntas menunjukkan file hilang dan metadata git yang salah (`master` alih-alih tag yang benar — kemungkinan `.git` belum lengkap tersalin saat dicek).
> - `rm -rf` untuk membersihkan hasil yang tidak lengkap sempat gagal berulang kali dengan `Directory not empty` di folder acak berbeda-beda tiap percobaan — gejala file lock sementara (kemungkinan antivirus real-time scan menahan file `.phpt` sesaat). **Solusi**: retry dalam loop (2-3 kali biasanya cukup), bukan sekali coba lalu menyerah.
> - **Pakai `cp -r` (bukan `mv`) untuk operasi besar/berisiko** — pertahankan sumber asli sampai tujuan **terverifikasi lengkap** (langkah 3.3 di atas), baru hapus sumber lama. Ini jauh lebih aman daripada `mv` yang bisa meninggalkan kedua sisi dalam keadaan tidak lengkap kalau terganggu di tengah jalan.

## Langkah 4 — Scaffold skeleton extension

Sebelum menulis logika sungguhan, buat extension paling minimal yang bisa dikompilasi dan di-load, untuk membuktikan seluruh toolchain (langkah 1-3) benar sebelum menambah kompleksitas. Template resmi ada di `php-src\ext\skeleton\` — pelajari strukturnya, lalu buat folder baru `php-src\ext\nxdom\` berisi 4 file minimal:

- `config.w32` — deklarasi `ARG_ENABLE`/`EXTENSION` untuk build system Windows.
- `php_nxdom.h` — deklarasi `zend_module_entry`, versi extension.
- `nxdom_arginfo.h` — signature fungsi PHP-facing (wajib di PHP 8.x, disertai `ZEND_BEGIN_ARG_...`).
- `nxdom.c` — implementasi: minimal satu fungsi bukti-konsep, `PHP_RINIT_FUNCTION` (hook request lifecycle — ini yang nanti menggantikan `auto_prepend_file`), `PHP_MINFO_FUNCTION`, dan `zend_module_entry` yang menyatukan semuanya.

Lihat isi persis ke-4 file itu di `php-src\ext\nxdom\` (sudah dibuat di proyek ini) sebagai contoh konkret.

## Langkah 5 — Build

Di cmd.exe session yang sama (environment v142 aktif, PATH SDK sudah di-set):

```
cd C:\phpsdk\phpmaster\vs16\x64\php-src
buildconf.bat
configure --disable-all --enable-cli --enable-nxdom=shared
nmake
```

- `buildconf.bat` — regenerasi `configure.js` dari `config.w32`, mendeteksi extension baru di `ext\`.
- `configure --disable-all --enable-cli --enable-nxdom=shared` — build minimal: hanya SAPI CLI + extension `nxdom` sebagai `.dll` terpisah (bukan `static`/tertanam ke `php.exe`), tanpa membangun ulang seluruh ekstensi PHP bawaan.
- **Cek output `configure`**: baris `Compiler`, `Thread Safety`, `Architecture` di ringkasan akhir harus cocok persis target (lihat bagian "Target build" di atas), dan tabel "Enabled extensions" harus menampilkan `nxdom | shared`.
- `nmake` — compile sungguhan. **Memakan waktu lama** (10-30+ menit) karena tetap mengompilasi seluruh PHP core (Zend Engine dkk.), bukan hanya extension baru.

> **Riwayat/pelajaran**: `configure` sempat gagal dengan `ERROR: Incompatible binary tools version` — penyebabnya `phpsdk_version` (dipanggil internal oleh `confutils.js` untuk cek versi SDK minimal) tidak ditemukan karena `C:\phpsdk\bin` belum ada di `PATH` sesi ini, sehingga versi terbaca `0.0.0` dan dianggap terlalu lama — padahal SDK yang terpasang jauh lebih baru dari syarat minimal. Solusi: pastikan `set PATH=C:\phpsdk\bin;%PATH%` sudah dijalankan (lihat Langkah 2.3) sebelum `configure`.

## Langkah 6 — Uji load ke PHP sungguhan

Setelah `nmake` selesai tanpa error, `.dll` hasil build ada di `x64\Release_TS\php_nxdom.dll` (relatif terhadap folder `php-src`). Untuk mengaktifkannya di PHP target:

1. Salin `php_nxdom.dll` ke `extension_dir` PHP target (lihat `php.ini` → `extension_dir`, mis. `C:\Tnserver\bin\php\ext\`).
2. Tambahkan `extension=nxdom` di `php.ini` target.
3. Uji: `<php.exe> -m | findstr nxdom` (harus muncul di daftar modul) dan `<php.exe> -r "echo nxdom_version();"` (kalau fungsi bukti-konsep sudah ditulis).

**✅ SELESAI (2026-09-14)**. Build sukses (`nmake` → `EXT nxdom build complete`, `php_nxdom.dll` dihasilkan). Diuji dua tahap:

1. Dengan `php.exe` hasil build sendiri (di folder `x64\Release_TS\` yang sama) — berhasil, `nxdom_version()` → `0.0.1`.
2. Dengan `php.exe` **sungguhan** milik server rujukan (`C:\Tnserver\bin\php\php.exe`, dikompilasi terpisah oleh tim PHP resmi Nov 2024) — `.dll` disalin ke `extension_dir`-nya, diuji pakai flag `-d extension=nxdom` (**tanpa mengubah `php.ini`**, supaya proyek lain di server yang sama tidak ikut terpengaruh selama pengujian):
   ```
   php.exe -d extension=nxdom -m
   php.exe -d extension=nxdom -r "echo nxdom_version();"
   ```
   Keduanya berhasil — pembuktian ABI cocok 100% dengan PHP produksi, bukan cuma berhasil kompilasi di lingkungan build sendiri.

**Langkah selanjutnya** (belum dikerjakan): memutuskan kapan/bagaimana mengaktifkan `extension=nxdom` permanen di `php.ini` server (dampaknya ke semua PHP di server itu, perlu keputusan sadar).

## Langkah 7 — Dependency eksternal (SQLite, dst.) untuk extension yang butuh library C pihak ketiga

Extension seperti `pdo_sqlite` butuh header + lib SQLite yang **tidak** disertakan `php-src` maupun PHP SDK secara default — perlu diunduh terpisah lewat `phpsdk_deps`.

```
set PHP_SDK_VS=vs16
phpsdk_deps --update --branch 8.1
```

> **Riwayat/pelajaran**:
> - `phpsdk_deps` gagal dengan `Active CRT name '' differs from the branch CRT name 'vs16'` kalau dijalankan di `cmd.exe` murni tanpa env var `PHP_SDK_VS` — variabel ini biasanya di-set starter script resmi (`phpsdk-vsXX-x64.bat`) yang kita lewati sejak Langkah 2 (karena starter tidak mendeteksi Build Tools versi produk installer yang tidak konvensional). Solusi: set manual `PHP_SDK_VS=vs16` sebelum memanggil tool SDK apa pun yang butuh info ini.
> - `phpsdk_deps --update --branch 8.1` mengunduh **seluruh** dependency untuk semua ekstensi resmi PHP 8.1 (Apache, ICU, libcurl, OpenSSL, SQLite, dll — puluhan paket), bukan hanya yang kita butuhkan. Ini wajar dan tidak perlu dipersempit untuk kasus proyek ini (ukurannya tetap masuk akal, dan menyederhanakan tidak sepadan usahanya).
> - Setelah dependency terunduh, **wajib** `configure` ulang (bukan cuma `nmake`) supaya driver seperti `pdo_sqlite` terdeteksi dan masuk ke Makefile — flag yang dipakai: `--enable-pdo --with-pdo-sqlite=shared`.
> - Extension `shared` (termasuk `pdo_sqlite`) perlu diaktifkan eksplisit lewat `-d extension=./php_pdo_sqlite.dll` (atau `php.ini`) untuk dimuat — tidak otomatis aktif meski berhasil dibangun, sama seperti `nxdom` sendiri.

## Langkah 8 — Driver `mysql` (MariaDB portable untuk pengujian)

Server rujukan proyek ini tidak punya MySQL/MariaDB aktif. Untuk menguji driver `mysql` NxDom secara nyata (bukan cuma verifikasi kode), pasang MariaDB **portable** (bukan installer/service):

1. Unduh **"ZIP file"** (bukan MSI) dari https://mariadb.org/download/?tab=archive, ekstrak ke folder kerja (mis. `C:\phpsdk\mariadb-test\`).
2. Inisialisasi data directory:
   ```
   bin\mariadb-install-db.exe --datadir="<path>\data"
   ```
3. Jalankan standalone di port terpisah (hindari bentrok 3306 default):
   ```
   bin\mysqld.exe --datadir="<path>\data" --port=3307 --skip-grant-tables --console
   ```
4. Buat database/tabel test lewat `bin\mysql.exe --port=3307 --host=127.0.0.1 -u root -e "..."`.
5. Matikan setelah selesai: `bin\mysqladmin.exe --port=3307 --host=127.0.0.1 -u root shutdown`.

Build PHP dengan driver mysql (`mysqlnd`, built-in php-src — **tidak** butuh library eksternal seperti `pdo_sqlite` butuh `sqlite3.h`):

```
configure --disable-all --enable-cli --enable-nxdom=shared --enable-pdo --with-pdo-sqlite=shared --with-pdo-mysql=mysqlnd --with-mysqlnd=yes
nmake
```

> **Riwayat/pelajaran**:
> - MSI installer resmi MariaDB **bisa** diekstrak tanpa instalasi penuh (`msiexec /a ... TARGETDIR=...`, "administrative install"), tapi lebih sederhana langsung memakai varian ZIP yang memang portable dari awal.
> - `configure --with-pdo-mysql=mysqlnd` saja **tidak cukup** — gagal link (`unresolved external symbol mysqlnd_connection_init` dst.) karena `--disable-all` ikut mematikan `mysqlnd` walau `ARG_WITH("mysqlnd", ..., "yes")` defaultnya aktif; `pdo_mysql` tetap mencoba link ke simbol mysqlnd meski mysqlnd sendiri tidak ter-enable (bug/inkonsistensi build system, bukan kesalahan konfigurasi kita). Solusi: tambahkan `--with-mysqlnd=yes` eksplisit.
> - `pdo_mysql`/`mysqlnd` ter-build sebagai **static** (tertanam di `php.exe`), berbeda dari `pdo_sqlite` yang bisa `shared` — jadi tidak bisa disalin sebagai `.dll` terpisah ke `php.exe` server rujukan yang binary-nya beda. Pengujian driver mysql karena itu dilakukan dengan `php.exe` hasil build sendiri (tetap PHP 8.1.31 asli dari source resmi yang sama), bukan server rujukan — dianggap cukup representatif karena `.dll` NxDom-nya sendiri identik.

## Langkah 9 — Build Linux (WSL) dengan `phpize` — alternatif saat toolchain Windows bermasalah

Kalau toolset MSVC v142 tidak tersedia di mesin (mis. hanya ada v143/14.44, sehingga `.dll` hasil build linked 14.44 sementara PHP target/core linked 14.29 → "Can't load module ... linked with 14.44, but the core is linked with 14.29"), atau server target Windows (`C:\Tnserver`) tidak ada, extension bisa di-build & diuji sebagai `.so` di Linux (WSL). Ini **bukan pengganti** build Windows untuk server produksi VS16 — hanya jalur uji/verifikasi logika C.

Prasyarat (Ubuntu/WSL, mis. aaPanel PHP 8.3): `gcc`, `make`, `autoconf`, `phpize`, `php-config`, header dev PHP.

```
mkdir -p ~/nxdom-ext
cp <sumber>/ext/nxdom/*.c <sumber>/ext/nxdom/*.h <sumber>/ext/nxdom/config.m4 ~/nxdom-ext/
cd ~/nxdom-ext
phpize                                   # atau /path/php/83/bin/phpize bila ada beberapa PHP
./configure --with-php-config=/www/server/php/83/bin/php-config
make
```

Hasil: `modules/nxdom.so`. Uji:

```
php -d extension=$PWD/modules/nxdom.so -m | grep nxdom
php -d extension=$PWD/modules/nxdom.so -r 'echo nxdom_version();'
```

> **Riwayat/pelajaran**:
> - File **`config.m4`** (baru, pasangan `config.w32`) wajib ada agar `phpize` mengenali extension — sebelumnya hanya ada `config.w32` (Windows-only).
> - Perlu include eksplisit `Zend/zend_exceptions.h` (untuk `zend_clear_exception`) dan `ext/standard/base64.h` (untuk `php_base64_decode_ex`) — di Windows ter-include transitif, di Linux tidak.
> - `php_base64_decode_ex` di PHP 8.3 mengembalikan `zend_string*` (tiga argumen), bukan buffer+panjang (empat argumen) — cek signature di `ext/standard/base64.h` versi target.
> - Diuji nyata (Plan_02.md §9.5b): `POST /api/outside` end-to-end lewat PHP built-in server di WSL, termasuk payload ter-encrypt NexaEncrypt — semua lolos.
