# @nxdom/cli — `nxdom-php`

CLI development untuk aplikasi NxDom (README §20: dipakai di mesin developer, tidak dibundel ke production — lihat §21). Nama command **`nxdom-php`**, bukan `nxdom` — sengaja dibedakan karena `nxdom` sudah dipakai `nxdom-cli` (platform induk) di lingkungan dev ini (lihat `package.json` paket ini).

## Instalasi

Dua cara memakai `nxdom-php`, pilih salah satu:

### A. Lewat Node (untuk development NxDom itu sendiri)

Repo ini **bukan** npm workspaces — `cli/` adalah paket Node berdiri sendiri, jadi command `nxdom-php` tidak otomatis tersedia hanya dengan `npm install` di root.

```bash
cd cli
npm link
```

Ini mendaftarkan `nxdom-php` (dari `bin` di `cli/package.json`, menunjuk ke `cli/bin/nxdom-php.js`) secara global di mesin tsb. Tanpa `npm link`, panggil lewat path lengkap ke entrypoint-nya:

```bash
node <path-ke-repo>/cli/bin/nxdom-php.js create myapp
```

Kalau setelah `npm link` terminal masih melempar `'nxdom-php' is not recognized`, cek `npm config get prefix` ada di `PATH` — itu lokasi npm menaruh symlink command global.

### B. Lewat `nxdom-php.exe` (tanpa Node terpasang di mesin target)

`cli/dist/nxdom-php.exe` adalah build [Node.js Single Executable Application](https://nodejs.org/api/single-executable-applications.html) (SEA, fitur native Node 22+, bukan pkg/nexe) — satu file `.exe` mandiri yang tidak butuh Node terpasang untuk **menjalankan** `nxdom-php` itu sendiri (`create`/`build`/`dev`/`config` semua berfungsi penuh, sudah diuji nyata). Build dengan:

```bash
cd cli
npm install    # sekali, untuk esbuild+postject (devDependencies)
npm run build:exe
```

Menghasilkan `cli/dist/nxdom-php.exe` + `cli/dist/SHA256SUMS.txt`. Salin `.exe` itu ke mana pun, jalankan langsung tanpa `npm link`/`node`:

```powershell
.\nxdom-php.exe create myapp
.\nxdom-php.exe dev myapp
```

**Catatan penting**: `.exe` ini hanya membebaskan `nxdom-php` sendiri dari kebutuhan Node — `build`/`dev` tetap men-spawn `node` dari `PATH` untuk menjalankan compiler (lihat "Bagaimana `.exe` bekerja" di bawah), jadi mesin target **tetap perlu Node.js terpasang** kalau ingin `build`/`dev` berfungsi, bukan cuma `create`. Dan tetap perlu `php.exe` dengan extension `nxdom` untuk `dev` (README §20-21 — PHP juga tidak dibundel).

## Command

### `nxdom-php create <name> [targetDir]`

Scaffold app baru di `<targetDir>/<name>` (default `targetDir`: direktori saat ini). Menyalin template dari `cli/templates/app/`:

- `index.html` — placeholder `{{APP_ID}}` diganti dengan `<name>`, sudah menyertakan `<script type="importmap">` yang memetakan `@nxdom/client` ke `./assets/nxclient/index.js`.
- `app.js` — contoh handler NxDom (`import nxdom from '@nxdom/client'`).
- `assets/nxclient/` — **salinan** `packages/nxdom-js/src` (paket `@nxdom/client`), bukan disimlink — supaya `import nxdom from '@nxdom/client'` di `app.js` benar-benar ter-resolve browser lewat importmap di atas. Tanpa ini app hasil `create` tidak bisa jalan sama sekali di browser.
- `nxdom.policy.json` — whitelist keamanan (fillable, auth, dsb).
- `nxdom.config.json` — **dibuat baru** (bukan disalin dari template), berisi konfigurasi database SQLite default dan secret auth sekali-pakai (`dev-only-secret-<name>-change-me` — ganti sebelum produksi).

```bash
nxdom-php create myapp
```

`<name>` wajib lowercase dan diawali huruf (`^[a-z][a-z0-9_-]*$`); gagal kalau folder tujuan sudah ada.

**Catatan**: `create` tidak membuat `nxdom.manifest.json` — file itu dihasilkan `build`/`dev` dari `app.js` + `nxdom.policy.json`, bukan ditulis manual.

### `nxdom-php build <app-dir> [--php <path>]`

Wrapper tipis di atas `@nxdom/compiler` (`cli/compiler/src/cli.js` — dipindah ke dalam `cli/` supaya tooling development terpusat, lihat Struktur Paket di bawah): membaca `app.js` + `nxdom.policy.json` di `<app-dir>`, menghasilkan `nxdom.manifest.json`. Dijalankan sebagai proses Node terpisah supaya error compiler (`UnsupportedPatternError`, `PolicyMissingError`, dll.) dan exit code apa adanya sampai ke terminal.

```bash
nxdom-php build myapp
```

#### Auto-generate schema (Plan_01.md poin 2)

Kalau `--php <path>` diberikan (atau `.nxdomrc.json`/env `NXDOM_PHP_BIN` sudah tersedia — sama prioritasnya seperti `dev`), `build` juga menjalankan `cli/scripts/ensure-schema.php` setelah manifest sukses ditulis:

```bash
nxdom-php build myapp --php C:\Tnserver\bin\php\php.exe
# OK: 2 route ditulis ke .../nxdom.manifest.json
# OK: tabel 'items' dibuat (.../storage/db.sqlite)
# OK: tabel 'users' dibuat (.../storage/db.sqlite)
```

**Kenapa ini penting**: sebelumnya (`Plan.md` §M7, "Keterbatasan diketahui"), app hasil `create` selalu `500` saat `GET`/`POST` pertama karena tabelnya belum ada — developer harus menulis SQL manual dulu. Sekarang `create` → `build --php`/`dev` langsung menghasilkan app yang bisa dipakai.

**Cara kerja** (`cli/scripts/ensure-schema.php`, hanya untuk driver `sqlite`):
- Kolom tiap tabel = union semua `constraints.fillable` dari seluruh route manifest dengan `resource` yang sama (resource `auth` dilewati — itu bukan nama tabel).
- Tabel yang jadi tabel auth (`nxdom.config.json` → `auth.table`, default `users`) **selalu** mendapat kolom `auth.identifier` + `auth.passwordColumn`, walau tidak muncul di `fillable` manapun — supaya register/login langsung bisa dipakai.
- `CREATE TABLE IF NOT EXISTS` — tabel yang **sudah ada** (dan datanya) **tidak pernah disentuh**, hanya dibuat kalau benar-benar belum ada (diverifikasi: dijalankan ulang terhadap `examples/demo` yang sudah punya 8 baris data, tidak ada perubahan).
- Driver `mysql`/`pgsql` **dilewati diam-diam** (bukan error) — developer diasumsikan sudah mengelola schema sendiri di server DB yang ada.
- Ini **bukan** migration system — tidak ada versioning/rollback/alter table. Hanya starting point sekali jalan; ubah/tambah kolom setelahnya dilakukan manual oleh developer.

**Diuji nyata**: app baru (`create` → `build --php`) langsung `GET`/`POST /api/items` sukses (`200`/`201`) tanpa setup manual apa pun; kolom auth (`email`/`password`) ter-generate otomatis di tabel `users` meski template default tidak memakainya; idempotent terhadap tabel yang sudah ada + berisi data; driver `mysql` (bahkan dengan kredensial tidak valid) di-skip tanpa error koneksi.

### `nxdom-php dev <app-dir> [--php <path>] [--port 8080]`

Menjalankan dev server lewat `php -S` (PHP built-in server) terhadap native extension NxDom — **diperbaiki** setelah migrasi proyek dari PHP package ke native C extension (`Plan.md` Bagian 0) sempat membuat command ini rusak total (referensi ke `nxdom/router.php` versi lama yang sudah tidak ada, kini hanya arsip di `nxdom/_archive-php-package/router.php`). Lihat `Plan_01.md` poin 1 untuk riwayat perbaikannya.

Perilaku:

1. Build manifest sekali di awal (memanggil `build()` yang sama seperti command `build`).
2. **Generate router PHP sementara** ke direktori temp OS (`os.tmpdir()`), lalu jalankan `php -S 127.0.0.1:<port> -t <app-dir> <router-sementara>`. Router ini beda dari `nxdom/index.php` (front controller produksi Apache, lihat `Apache.md`): PHP built-in server, tidak seperti Apache + `mod_rewrite`, **tidak** memastikan file fisik tidak ada sebelum memanggil router script — jadi router dev ini punya fallback eksplisit (`return false`) untuk file statis nyata (`index.html`, `app.js`, `assets/*`) dan untuk path root (`/`, supaya `index.html` ter-serve otomatis), plus blokir eksplisit `nxdom.*.json` (config/manifest/policy) sebelum fallback itu — tanpanya file itu bocor mentah lewat php -S persis seperti kerentanan yang pernah ditemukan di Apache (`Plan.md` §0F poin 2).
3. Mem-watch `app.js` dan `nxdom.policy.json`, rebuild manifest otomatis saat berubah (server tidak perlu direstart karena manifest dibaca ulang tiap request).
4. Saat proses dihentikan (Ctrl+C/SIGINT), watcher dan child process PHP dihentikan, dan direktori router sementara dihapus.

PHP tidak dibundel bersama NxDom (README §20–21) — path `php.exe` **wajib** disediakan lewat `--php <path>` atau env `NXDOM_PHP_BIN`, tidak ada default hardcoded:

```bash
nxdom-php dev myapp --php C:\Tnserver\bin\php\php.exe --port 8080
```

**Prasyarat**: `php.exe` yang dipakai harus sudah memuat extension `nxdom` (`extension=nxdom` aktif di `php.ini`-nya, atau build PHP khusus yang menyertakannya) — `dev` tidak menambahkan flag `-d extension=nxdom` otomatis, karena lokasi `.dll`/`.so` bervariasi per mesin (lihat `install.md`/`Apache.md`).

**Diuji nyata** (bukan hanya ditulis) terhadap `examples/demo` dengan `php.exe` server rujukan: `GET /` (200, serve `index.html`), file statis bersarang (`assets/nxclient/index.js`, 200), `nxdom.config.json`/`.manifest.json`/`.policy.json` (403, tidak bocor), route API virtual (`GET /api/users`, 200), route tidak dikenal (`GET /api/nonexistent`, 404 JSON). **Belum diverifikasi**: pembersihan direktori temp saat proses dihentikan via Ctrl+C interaktif — pengujian otomatis di lingkungan ini tidak bisa mengirim sinyal POSIX ke proses Node native Windows; logicnya identik dengan pola shutdown yang sudah dipakai versi `dev.js` sebelumnya, tapi belum dikonfirmasi langsung. Coba `nxdom-php dev` lalu Ctrl+C untuk konfirmasi manual kalau ragu.

#### Konfigurasi dev tersimpan (`.nxdomrc.json`)

`dev` menentukan `phpBin`/`port` lewat prioritas: **flag CLI** (`--php`/`--port`, override sekali pakai, tidak disimpan) > **env** `NXDOM_PHP_BIN` (khusus phpBin) > **`.nxdomrc.json`** tersimpan di `<app-dir>` > **prompt interaktif** (hanya kalau semua di atas kosong — sekali dijawab, disimpan otomatis ke `.nxdomrc.json`, tidak ditanya lagi run berikutnya).

```bash
nxdom-php dev myapp
# belum ada .nxdomrc.json dan tidak ada --php/env -> ditanya:
#   Path php.exe: C:\Tnserver\bin\php\php.exe
#   Port [8080]: 8080
# tersimpan ke myapp/.nxdomrc.json, run berikutnya langsung pakai ini tanpa tanya lagi
```

`.nxdomrc.json` murni preferensi mesin developer lokal (path `php.exe` pasti beda per developer) — **jangan commit ke source control** bersama app (mirip `.env` lokal), beda dari `nxdom.config.json` yang berisi kredensial DB/auth app dan memang ikut di-deploy.

#### Memakai `dev` dengan XAMPP/WAMP terpasang

`dev` tidak peduli dari mana `php.exe` berasal — kalau sudah punya XAMPP/WAMP terpasang, arahkan `--php` ke `php.exe` di dalamnya:

```bash
nxdom-php dev myapp --php C:\xampp\php\php.exe
nxdom-php dev myapp --php C:\wamp64\bin\php\php8.x.x\php.exe
```

Ini tetap menjalankan `php -S` (built-in server) **milik XAMPP/WAMP** — **bukan** lewat Apache-nya XAMPP/WAMP. Menjalankan lewat Apache XAMPP/WAMP sungguhan itu kasus berbeda (setara instalasi produksi), ikuti `Apache.md` (front controller `nxdom/index.php` + `mod_rewrite`), bukan `nxdom-php dev`.

**Peringatan ABI penting**: `php_nxdom.dll` yang dibundel (`cli/install/php_nxdom.dll`) dibuild khusus untuk PHP **ZTS** (Thread Safe) — sedangkan installer XAMPP/WAMP paling umum memakai **NTS** (Non Thread Safe, lebih cepat untuk kasus umum). `php -m` tidak akan menampilkan `nxdom` kalau ABI tidak cocok, dan `nxdom-php install --php <path-php-xampp>` akan **menolak eksplisit** (bukan bug — itu memang tujuan pengecekan ABI-nya) kalau ternyata tidak cocok. Cek dulu dengan:

```bash
C:\xampp\php\php.exe -i | findstr /C:"Thread Safety" /C:"PHP Extension Build"
```

Kalau `Thread Safety` menunjukkan `disabled` (NTS) atau `PHP Extension Build` beda dari `API20210902,TS,VS16`, `.dll` bundel **tidak akan bekerja** — perlu build ulang sendiri mengikuti `install.md`, ditargetkan persis ke build PHP XAMPP/WAMP tsb. **Belum diuji nyata** (tidak ada instalasi XAMPP/WAMP di lingkungan pengujian ini) — bagian ini berdasarkan cara kerja `--php` yang sudah diverifikasi generik terhadap `php.exe` mana pun, plus pengetahuan umum default build XAMPP/WAMP.

### `nxdom-php config <app-dir>`

Isi ulang `.nxdomrc.json` kapan saja tanpa harus menghapus filenya manual — nilai lama ditampilkan sebagai default di prompt:

```bash
nxdom-php config myapp
```

### `nxdom-php install --php <path-ke-php.exe>`

Memasang extension native `nxdom` (`cli/install/php_nxdom.dll`, dibundel bersama `nxdom-php`) ke `php.exe` target — untuk user yang belum punya `extension=nxdom` aktif sama sekali dan ingin `dev` langsung berfungsi tanpa mengikuti seluruh `install.md`/`Apache.md` manual.

```bash
nxdom-php install --php C:\Tnserver\bin\php\php.exe
```

**Mengecek ABI dulu, baru menyalin** — native extension sangat sensitif versi compiler/thread-safety (`install.md` Bagian "Target build"), jadi `install` membandingkan `Architecture` dan `PHP Extension Build` dari `php -i` target dengan yang dibutuhkan `.dll` bundel ini (`x64`, `API20210902,TS,VS16` — dibuild untuk PHP 8.1.31 ZTS/VC++2019). **Kalau tidak cocok, ditolak eksplisit** dengan pesan yang membandingkan keduanya, mengarahkan ke `install.md` untuk build ulang sendiri — tidak pernah memaksakan salin `.dll` yang kemungkinan besar gagal di-load.

Kalau cocok: `.dll` disalin ke `extension_dir` php.exe target, dan baris `extension=nxdom` ditambahkan ke `php.ini` yang aktif (idempotent — dicek dulu, tidak menduplikasi kalau sudah ada). Kalau `.dll` sedang terkunci (Apache/PHP lain sedang memakainya — lihat `Apache.md` Langkah 1), gagal dengan pesan jelas, bukan crash.

`dev` **otomatis memberi peringatan** (bukan block) kalau extension belum terdeteksi aktif di `php.exe` yang dipakai, mengarahkan ke command ini:

```
[nxdom-php] PERINGATAN: extension 'nxdom' tidak terdeteksi aktif di C:\...\php.exe.
  Server tetap dijalankan, tapi seluruh route /api/* akan gagal (404) sampai extension ini aktif.
  Coba: nxdom-php install --php "C:\...\php.exe"
```

**Diuji nyata** (lewat `php.ini`/`extension_dir` terisolasi via env `PHPRC`, tidak menyentuh instalasi produksi server rujukan): ABI cocok → salin + edit `php.ini` → extension benar-benar termuat (`php -m` menampilkan `nxdom`); jalankan dua kali → idempotent (baris tidak diduplikasi); `.dll` terkunci → pesan jelas, bukan crash. **Belum diuji nyata**: jalur penolakan ABI tidak cocok (tidak ada PHP versi/build lain yang tersedia di mesin ini untuk perbandingan sungguhan) — logic-nya perbandingan string sederhana, diverifikasi lewat pembacaan kode, bukan eksekusi.

## `nxdom-php install-host [--php <path>]`

Membantu pemasangan extension native `nxdom` (`.so`) di **hosting Linux** (aaPanel/CyberPanel) — melengkapi `install` (§ di atas) yang khusus Windows. **Bersifat deteksi + cetak perintah: TIDAK mengubah sistem sendiri** (semua perubahan dicetak sebagai perintah `sudo` untuk dijalankan admin), konsisten dengan posisi CLI sebagai tooling.

```bash
nxdom-php install-host
nxdom-php install-host --php /www/server/php/83/bin/php
```

Yang dilakukan:
1. Deteksi panel: **aaPanel** (`/www/server/panel`), **CyberPanel** (`/usr/local/CyberCP` + `/usr/local/lsws`), atau plain.
2. Temukan instalasi PHP (`--php` eksplisit, atau scan `/www/server/php/*/bin/php`, folder `lsphp*` di `/usr/local/lsws`, lalu `php` di PATH) — **di-dedup** kalau beberapa path menunjuk instalasi yang sama.
3. Laporkan versi, `extension_dir`, `php.ini`, dan `PHP Extension Build` (ABI) tiap PHP.
4. Cetak perintah persis: salin `.so` → `extension_dir`; tambah `extension=nxdom` ke **php.ini (FPM/web)**; tulis front controller global `/www/nxdom/index.php`; rewrite vhost (nginx/Apache/OLS); restart service; verifikasi.

**Diuji nyata** di WSL aaPanel (PHP 8.3): deteksi panel benar, menemukan PHP 8.3 + `extension_dir`/`php.ini`, dedup symlink `/usr/bin/php`, dan perintah yang dicetak **identik** dengan langkah manual yang terbukti mengaktifkan extension di demo `nxdom.local` (Plan_02 §11). Di Windows, command ini mengarahkan ke `nxdom-php install`.

**Catatan ABI**: `.so` Linux dibuild terhadap PHP resmi (`phpize`, lihat `install.md` Langkah 9). LSPHP (CyberPanel) memakai build PHP LiteSpeed — kemungkinan perlu rebuild terpisah (lihat `Apache.md`).

## Bagaimana `.exe` bekerja `cli/scripts/build-exe.mjs`: bundle `bin/nxdom-php.js` dengan esbuild (format CJS), lalu di-embed ke salinan `node.exe` lewat Node SEA API (`--experimental-sea-config` + `postject`) — pola sama seperti proyek terpisah `nxdom-cli` (`D:\Framework\CLI\nxdom`).

**Masalah nyata yang harus dipecahkan** (ditemukan lewat build+run sungguhan, bukan diantisipasi di awal): bundle CJS membuat `import.meta.url` selalu **kosong** — kode yang tadinya memakai itu untuk resolve path (`create.js`/`build.js`, ke `templates/`, `packages/nxdom-js/src`, `compiler/src/cli.js`) langsung crash (`ERR_INVALID_ARG_TYPE`) begitu dijalankan dari `.exe`. Solusinya (`cli/src/runtimePaths.js`):

1. Semua path aset lewat fungsi (`templateDir()`, `nxclientSrcDir()`, `compilerCliPath()`, `bundledDllPath()`) yang bercabang pada `node:sea`'s `isSea()` — API resmi Node 22+, bukan deteksi manual.
2. Mode dev (`!isSea()`): fungsi-fungsi itu resolve ke folder sumber asli seperti sebelumnya.
3. Mode `.exe` (`isSea()`): 10 file non-kode (`EMBEDDED_ASSETS` di `runtimePaths.js` — template `create`, source `@nxdom/client`, bundle compiler, `php_nxdom.dll` untuk `install`, `ensure-schema.php` untuk auto-schema `build`) didaftarkan sebagai `assets` di SEA config (per-file, SEA tidak mendukung folder — binary seperti `.dll` juga didukung generik oleh mekanisme ini), lalu **dimaterialisasikan ke satu folder temp** saat pertama dibutuhkan (`assetsRoot()`, di-cache per proses) — supaya kode pemanggil tidak perlu tahu bedanya sama sekali.
4. Compiler (`compiler/src/cli.js`) **tidak** ikut di-embed sebagai source asli — source itu `import 'acorn'`/`'acorn-walk'`, dan SEA assets memateriaisasi file individual tanpa `node_modules`-nya (dibuktikan: `ERR_MODULE_NOT_FOUND 'acorn'` sebelum diperbaiki). Solusinya, `build-exe.mjs` mem-bundle compiler+dependency-nya jadi satu file (`compiler.cli.bundle.cjs`, ~214kb) lewat esbuild **sebelum** didaftarkan sebagai asset.
5. `build()` (`build.js`) menjalankan compiler sebagai proses Node terpisah — di mode `.exe`, `process.execPath` adalah `nxdom-php.exe` itu sendiri (bukan `node.exe`), jadi interpreter yang dipakai untuk proses child beralih ke `node` dari `PATH` saat `isSea()` true. **Konsekuensi**: `build`/`dev` dari `.exe` tetap butuh Node.js terpasang di mesin target — hanya `create` (tidak spawn proses lain) yang benar-benar 100% mandiri.

**Diuji nyata end-to-end** lewat `.exe` hasil build: `create` (scaffold lengkap termasuk `assets/nxclient/*`), `build` (manifest ter-generate benar via compiler yang di-bundle), `dev` (prompt interaktif config tersimpan, server jalan, `GET /` dan `GET /api/*` sama-sama 200), `install` (ABI cocok → `.dll` ter-embed berhasil disalin dari dalam `.exe`, extension benar-benar termuat) — semua lolos.

## Struktur paket

```
cli/
├── package.json         # nama paket: @nxdom/cli, bin: nxdom-php -> bin/nxdom-php.js
├── bin/
│   └── nxdom-php.js       # entrypoint tipis (pola bin/+src/, konsisten dengan proyek nxdom-cli terpisah)
├── src/
│   ├── index.js            # dispatch command (create/build/dev/config/install), dipanggil dari bin/
│   ├── create.js            # nxdom-php create
│   ├── build.js              # nxdom-php build (spawn compiler, node biasa atau node dari PATH saat .exe)
│   ├── dev.js                  # nxdom-php dev (generate router PHP sementara + watch + cek extension aktif)
│   ├── config.js                # baca/tulis .nxdomrc.json + prompt interaktif
│   ├── install.js                # nxdom-php install (cek ABI, salin php_nxdom.dll, edit php.ini)
│   └── runtimePaths.js            # resolusi path aset, bekerja di mode dev maupun .exe SEA
├── scripts/
│   ├── build-exe.mjs        # build nxdom-php.exe (esbuild + Node SEA + postject)
│   └── ensure-schema.php     # auto-generate CREATE TABLE sqlite, dipanggil build.js
├── templates/app/       # template hasil `create`
├── install/
│   └── php_nxdom.dll    # native extension NxDom, dibundel untuk `nxdom-php install` (ABI: x64, API20210902,TS,VS16)
└── compiler/            # @nxdom/compiler — paket Node terpisah (package.json sendiri),
    ├── package.json     # ditaruh di dalam cli/ karena satu-satunya konsumennya adalah `build`/`dev` di sini
    ├── src/
    │   ├── analyze.js          # parse app.js (acorn/acorn-walk), kenali pola nxdom.* yang didukung
    │   ├── build-manifest.js   # gabung hasil analyze + nxdom.policy.json -> nxdom.manifest.json
    │   └── cli.js              # `node cli/compiler/src/cli.js <app-dir>`
    └── test/test-compiler.mjs
```
