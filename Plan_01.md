# NxDom — Plan_01: Yang Perlu Ditingkatkan Selanjutnya

> Lanjutan dari `Plan.md` (M0-M7 + migrasi native extension §0-§0I, seluruhnya selesai dan teruji). Dokumen ini **tidak mengulang** riwayat di sana — hanya memetakan gap yang ditemukan setelah migrasi ke native extension selesai, sebagian dikonfirmasi lewat pengujian nyata selama sesi dokumentasi (lihat referensi tiap poin).
>
> Prioritas ditandai: 🔴 blocker (proyek tidak konsisten/berfungsi tanpa ini), 🟡 penting (celah nyata tapi ada workaround), 🟢 nice-to-have (lanjutan alami, bukan urgent).

---

## 1. ✅ `nxdom-php dev` rusak total pasca-migrasi native extension — DIPERBAIKI

**Temuan awal**: `cli/src/dev.js` menjalankan `php -S ... nxdom/router.php` — tapi `nxdom/router.php` sudah tidak ada di lokasi itu sejak migrasi ke native C extension (`Plan.md` §0). File itu kini hanya arsip di `nxdom/_archive-php-package/router.php` (versi PHP-package lama, sebelum keputusan native C). Menjalankan `dev` apa adanya akan gagal karena PHP tidak menemukan file target.

**Temuan lanjutan (menjawab kekhawatiran §0E)**: diuji nyata — `php -S` **ternyata bisa** memanggil `nxdom_dispatch()` dengan benar untuk path virtual (`/api/users` → 200), berbeda dari kekhawatiran awal berdasarkan `Plan.md` §0E (RINIT tidak bisa baca document_root). Ini karena PHP built-in server **selalu** memanggil router script untuk semua request (bukan lewat RINIT langsung) — jadi `nxdom_dispatch()` dipanggil dari dalam request PHP normal yang sudah lengkap `$_SERVER`, sama seperti front controller Apache.

**Perbedaan penting yang ditemukan lewat pengujian** (bukan asumsi): PHP built-in server, tidak seperti Apache + `mod_rewrite`, **tidak** mengecek file fisik sebelum memanggil router script — request ke file statis nyata (`index.html`, `app.js`) ikut terlempar ke `nxdom_dispatch()` dan gagal 404. Juga ditemukan (dan diperbaiki di iterasi kedua) risiko keamanan: percobaan pertama pakai `is_file()` polos untuk fallback statis, yang secara tidak sengaja meloloskan `nxdom.config.json` (berisi kredensial DB!) sebagai "file statis biasa" — persis kelas bug yang sama dengan `Plan.md` §0F poin 2 di Apache, ternyata perlu dicegah eksplisit lagi di jalur `php -S`.

**Solusi diterapkan**: `cli/src/dev.js` sekarang **men-generate router PHP sementara on-the-fly** (ke `os.tmpdir()`, dihapus saat shutdown) alih-alih bergantung pada file statis di `nxdom/`. Router ini: (1) blokir `nxdom.*.json` lebih dulu, (2) fallback ke file fisik/`index.html` di root, (3) baru panggil `nxdom_dispatch()`. Keputusan ini diambil sengaja (bukan menaruh file baru permanen di `nxdom/`) supaya `cli/` tetap satu-satunya sumber kebenaran untuk seluruh tooling development, terpisah dari `nxdom/` yang isinya murni instalasi produksi.

**Diuji nyata** lewat `nxdom-php dev demo --php ... --port ...` sungguhan (bukan simulasi manual): `GET /` (200, index.html), file statis bersarang (`assets/nxclient/index.js`, 200), `nxdom.config.json`/`.manifest.json`/`.policy.json` (403), `GET /api/users` (200), `GET /api/nonexistent` (404 JSON) — semua lolos.

**Belum diverifikasi**: cleanup direktori temp saat Ctrl+C interaktif — sinyal POSIX dari tooling pengujian (Git Bash `kill`) tidak sampai ke proses Node native Windows di lingkungan ini, jadi shutdown handler tidak bisa dipicu lewat jalur itu untuk dikonfirmasi. Logic-nya identik dengan pola `dev.js` versi sebelumnya (yang sudah lama dipakai tanpa keluhan soal ini). **Perlu konfirmasi manual**: jalankan `nxdom-php dev`, tekan Ctrl+C di terminal interaktif, cek folder `%TEMP%\nxdom-php-dev-*` sudah terhapus.

---

## 2. ✅ Scaffold `nxdom-php create` tidak menyertakan schema database — DIPERBAIKI

**Temuan awal** (sudah dikonfirmasi sebagai "keterbatasan diketahui" di `Plan.md` §M7 poin "Keterbatasan diketahui"): `create` tidak membuat tabel database sama sekali. `GET` ke resource yang tabelnya belum ada → `500` generik — app hasil `create` tidak bisa dipakai sampai developer menulis SQL migration manual, padahal README §29 tersirat bisa langsung jalan.

**Solusi diterapkan**: `cli/scripts/ensure-schema.php` — dipanggil `build.js` setelah compiler sukses menulis manifest, **kalau `phpBin` diketahui** (`--php` eksplisit ke `nxdom-php build`, atau `.nxdomrc.json`/env `NXDOM_PHP_BIN` tersedia — prioritas sama seperti `dev`; tanpa itu semua, langkah ini di-skip diam-diam, compile manifest tetap sukses seperti sebelumnya). `dev` selalu punya `phpBin` resolved, jadi otomatis ikut generate schema di setiap build.

**Cara kerja**:
- Kolom tiap tabel = union `constraints.fillable` dari seluruh route manifest dengan `resource` yang sama (resource `auth` dilewati, bukan nama tabel).
- Tabel yang jadi tabel auth (`nxdom.config.json` → `auth.table`, default `users`) **selalu** dapat kolom `auth.identifier`+`auth.passwordColumn` walau tidak ada di `fillable` manapun — sesuai keputusan eksplisit user (deteksi otomatis dari config, bukan mengharuskan developer menambah manual ke policy).
- `CREATE TABLE IF NOT EXISTS`, semua kolom `TEXT` kecuali `id`/`created_at` — starting point sengaja sederhana, bukan migration system (tidak ada versioning/alter table).
- Hanya driver `sqlite` — `mysql`/`pgsql` di-skip diam-diam (developer diasumsikan sudah kelola schema server DB sendiri).

**Diuji nyata**: app baru (`create` → `build --php`) langsung `GET`/`POST /api/items` sukses (`200`/`201`) tanpa setup manual sama sekali; kolom `email`/`password` ter-generate otomatis di tabel `users` meski template default tidak memakainya; idempotent terhadap `examples/demo` (tabel `users` sudah ada dengan 8 baris data — dijalankan ulang, data tidak berubah); driver `mysql` dengan kredensial tidak valid di-skip tanpa mencoba koneksi; **diuji juga dari `.exe`** (bukan cuma mode `node`) — `ensure-schema.php` ditambahkan ke `EMBEDDED_ASSETS`/`runtimePaths.js` sejak awal, tidak mengulang bug `import.meta.url` yang sama seperti fitur-fitur sebelumnya.

---

## 3. 🟡 `examples/myapp/` — app scaffold lama tanpa `assets/nxclient/`

**Status saat sesi ini**: sudah tidak ada di repo (kemungkinan sudah dihapus manual). Kalau muncul lagi dari `nxdom-php create` versi **sebelum** perbaikan importmap (lihat riwayat sesi ini), akan tetap rusak karena dibuat sebelum `create.js` menyalin `assets/nxclient/`. Tidak perlu tindakan sekarang — dicatat sebagai jejak riwayat kalau muncul kebingungan serupa lagi.

---

## 4. 🟡 Instalasi produksi (native extension + front controller + rewrite) belum diuji di luar server rujukan `Tnserver`

**Temuan**: `Apache.md` Langkah 1-8 seluruhnya diverifikasi hanya terhadap `C:\Tnserver` (Apache 2.4 + PHP 8.1.31 ZTS/VC++2019, satu mesin dev). Bagian "Instalasi di Control Panel Hosting" (cPanel/CyberPanel) yang ditambahkan di sesi ini **eksplisit ditandai belum diuji nyata** — murni pemetaan konsep berdasarkan pengetahuan umum panel tsb, bukan hasil instalasi sungguhan.

**Risiko**: klaim README §28 ("administrator hosting cukup 4 langkah") belum pernah dibuktikan di luar satu mesin. ABI native extension sangat sensitif terhadap versi compiler PHP (`install.md` menekankan ini berkali-kali) — server hosting lain, apalagi LSPHP (CyberPanel), kemungkinan besar butuh **rebuild** `.dll`/`.so` terpisah, bukan sekadar salin file.

**Rekomendasi**: sebelum mengklaim dukungan cPanel/CyberPanel di dokumentasi manapun sebagai "didukung" (bukan "dipetakan konsepnya"), perlu satu putaran uji nyata di masing-masing — idealnya di VPS murah/trial, bukan shared hosting (butuh akses WHM/root seperti sudah dicatat di `Apache.md`).

---

## 5. 🟡 Skema `nxdom.manifest.json` — custom action untuk business logic non-CRUD

**Temuan**: `Plan.md` §6 (bagian "Yang Masih Perlu Diputuskan", ditulis sebelum migrasi native extension) mencatat ini sebagai keputusan terbuka sejak M0 dan **belum pernah disentuh** sampai M7 selesai. Compiler (M6) menolak tegas (`UnsupportedPatternError`) pola apa pun di luar CRUD manifest generik — artinya NxDom saat ini **hanya bisa** melayani aplikasi CRUD murni. Begitu ada kebutuhan logic sedikit lebih kompleks (mis. hitung total belanja sebelum insert, kirim email setelah register), tidak ada jalur resmi.

**Dampak**: ini bukan bug, tapi batas kemampuan arsitektur fundamental yang belum diselesaikan sejak awal proyek — makin lama makin mendesak begitu ada percobaan aplikasi nyata (bukan cuma demo CRUD `users`).

**Rekomendasi**: eksplorasi jalur "named server-function" yang sempat disebut `Plan.md` §4 (custom action didaftarkan lewat konfigurasi, bukan PHP bebas per-app — supaya tidak melanggar README §6). Ini keputusan desain besar, sebaiknya dibahas terpisah sebelum diimplementasi, bukan diputuskan sambil jalan.

---

## 6. 🟢 Driver `pgsql` belum pernah diuji dengan server nyata

**Temuan**: `Plan.md` "Ringkasan Status" mencatat driver `mysql` sudah diuji dengan MySQL 5.7 nyata (§0I) dan MariaDB, tapi `pgsql` **hanya diuji secara kode** (DSN, prepared statement) — belum pernah terhubung ke PostgreSQL sungguhan. Prioritas rendah karena tidak ada indikasi ada kebutuhan Postgres mendesak, tapi kalau diklaim "didukung" di dokumentasi manapun, klaim itu belum terbukti.

---

## 7. 🟢 Migration/schema management

**Temuan**: dicatat eksplisit sebagai di luar scope M0-M7 (`Plan.md` "Ringkasan Status"). Terkait erat dengan poin 2 di atas (scaffold tanpa schema) — kalau poin 2 diselesaikan lewat auto-generate sederhana dari policy, migration system penuh (versioning, rollback, alter table) tetap jadi pertanyaan terbuka terpisah untuk skala lebih besar.

---

## 8. 🟢 Registrasi permanen `extension=nxdom` di server rujukan

**Temuan**: `Plan.md` §0B mencatat ini sengaja **belum dikerjakan** — pengujian sejauh ini pakai flag sementara (`-d extension=nxdom` di CLI) atau php.ini yang sudah diedit untuk pengujian §0F/§0G, bukan status permanen yang dikonfirmasi ulang. **Update**: dikonfirmasi ulang saat mengerjakan poin 1 — `php -m` di server rujukan sudah menampilkan `nxdom` **tanpa** flag apa pun, artinya `extension=nxdom` sekarang **memang sudah permanen** di `php.ini` server itu (kemungkinan diaktifkan user di luar sesi ini). Poin ini bisa dianggap selesai untuk server rujukan — tetap relevan untuk server/mesin lain yang belum pernah diaktifkan.

---

## 9. ✅ Restrukturisasi `cli/` — pola `bin/`+`src/`, package.json lengkap, build `.exe` — SELESAI

**Latar belakang**: `cli/` awalnya campur-aduk (`cli/src/cli.js` merangkap entrypoint + parsing argumen), `package.json` minim (cuma `name`/`bin`), dan tidak ada cara distribusi tanpa Node. Diminta menyelaraskan dengan pola proyek `nxdom-cli` terpisah (`D:\Framework\CLI\nxdom`) — CLI agentic besar milik user sendiri yang sudah punya `bin/`+`src/`, `package.json` lengkap, dan build `.exe` via Node SEA.

**Perubahan struktural**:
- `cli/src/cli.js` (lama, merangkap entrypoint+logic) dipecah jadi `cli/bin/nxdom-php.js` (entrypoint tipis) + `cli/src/index.js` (fungsi `run(argv)`, dipanggil dari bin).
- `cli/package.json` dilengkapi: `main`, `files`, `engines`, `scripts` (`start`, `link`, `build:exe`), `keywords`.
- Command baru **`nxdom-php config <app-dir>`** — mengisi ulang `.nxdomrc.json` (path php.exe, port) kapan saja, dengan nilai lama sebagai default prompt.
- Konfigurasi dev interaktif: `dev` sekarang menentukan `phpBin`/`port` lewat prioritas flag CLI > env `NXDOM_PHP_BIN` > `.nxdomrc.json` tersimpan di app-dir > **prompt interaktif** (sekali, hasilnya disimpan otomatis). File `.nxdomrc.json` sengaja terpisah dari `nxdom.config.json` (kredensial app yang di-deploy) — ini murni preferensi mesin developer lokal, tidak untuk di-commit.

**Bug nyata ditemukan & diperbaiki saat implementasi prompt interaktif** (bukan ditulis langsung benar): `readline.question()` dipanggil berurutan (di-`await`) pada stdin non-TTY gagal diam-diam untuk pertanyaan kedua dan seterusnya — proses keluar dengan "unsettled top-level await" tanpa pesan error yang jelas. Diselidiki lewat serangkaian skrip isolasi (bukan tebakan): akar masalahnya readline bisa meng-emit beberapa event `'line'` secara síncron sekaligus untuk seluruh buffer input, lebih cepat dari konsumen `await` memprosesnya. Solusi: `cli/src/config.js` memakai satu listener `'line'` dengan **buffer FIFO** untuk baris yang tiba sebelum ada yang menunggunya.

**Build `.exe`** (`cli/scripts/build-exe.mjs`, `npm run build:exe` di `cli/`): pola sama seperti `nxdom-cli` (esbuild bundle → Node SEA config → inject blob via `postject`), menghasilkan `cli/dist/nxdom-php.exe`. Masalah nyata ditemukan & diperbaiki (bukan diantisipasi sejak awal):
1. **`import.meta.url` kosong di bundle CJS** — `create.js`/`build.js` yang tadinya resolve path lewat itu langsung crash (`ERR_INVALID_ARG_TYPE`) dijalankan dari `.exe`. Solusi: `cli/src/runtimePaths.js`, bercabang pada `node:sea`'s `isSea()` — mode dev pakai path sumber asli, mode `.exe` memateriaisasi aset yang di-embed (`EMBEDDED_ASSETS`) ke satu folder temp per proses.
2. **Compiler (`compiler/src/cli.js`) tidak bisa langsung di-embed sebagai source** — source itu `import 'acorn'`/`'acorn-walk'`, dan SEA assets memateriaisasi file individual tanpa `node_modules`-nya (`ERR_MODULE_NOT_FOUND 'acorn'` sebelum diperbaiki). Solusi: `build-exe.mjs` mem-bundle compiler+dependency jadi satu file (`compiler.cli.bundle.cjs`) via esbuild sebelum didaftarkan sebagai asset.
3. **`process.execPath` di mode `.exe` adalah `nxdom-php.exe` itu sendiri, bukan `node.exe`** — `build()` yang menjalankan compiler sebagai proses child harus beralih ke `node` dari `PATH` saat `isSea()` true. Konsekuensi: `build`/`dev` dari `.exe` tetap butuh Node.js terpasang di mesin target; hanya `create` yang 100% mandiri tanpa Node.

**Diuji nyata end-to-end** lewat `.exe` hasil build (bukan cuma `node bin/nxdom-php.js`): `create` (scaffold lengkap termasuk `assets/nxclient/*` dan importmap benar), `build` (manifest ter-generate benar via compiler ter-bundle), `dev` (prompt interaktif tersimpan ke `.nxdomrc.json`, server jalan, `GET /` dan `GET /api/items` sama-sama 200) — semua lolos.

**Perluasan — command `nxdom-php install` (menjawab: "bagaimana user baru yang belum punya `extension=nxdom` mendaftarkannya lewat `cli/`?")**: ditemukan `cli/install/php_nxdom.dll` sudah ada sebagai bundel binary hasil build native extension (55KB), tapi belum ada cara memasangnya otomatis. Ditambahkan `cli/src/install.js`:
- **Cek ABI dulu, baru izinkan salin** (bukan salin-lalu-berharap) — membandingkan `Architecture`/`PHP Extension Build` dari `php -i` target dengan yang dibutuhkan `.dll` bundel (`x64`, `API20210902,TS,VS16`). Tidak cocok → ditolak eksplisit dengan pesan perbandingan, mengarahkan ke `install.md` untuk build ulang sendiri — karena native extension yang ABI-nya tidak cocok gagal total saat load, bukan gagal sebagian.
- Cocok → salin `.dll` ke `extension_dir` php.exe target + tambahkan `extension=nxdom` ke `php.ini` aktif (idempotent, dicek dulu sebelum ditulis).
- `dev.js` diberi pengecekan `isNxdomLoaded()` sebelum spawn server — kalau extension belum aktif, **peringatan** (bukan block) yang mengarahkan ke `nxdom-php install`, supaya kegagalan tidak muncul samar sebagai "semua /api/* selalu 404" tanpa petunjuk penyebab.

**Bug nyata ditemukan & diperbaiki selama implementasi**:
1. Parsing `php -i` untuk `extension_dir` awalnya salah — direktif seperti ini dicetak PHP sebagai TIGA kolom (`nama => local_value => master_value`), bukan satu kolom seperti `PHP Version`. Regex awal menangkap seluruh sisa baris, menghasilkan path ganda tergabung (`C:\...\ext => C:\...\ext`) yang gagal `existsSync()`. Diperbaiki dengan regex yang eksplisit membatasi hanya kolom pertama.
2. `EBUSY` saat menyalin `.dll` (Apache/PHP lain sedang memakainya, kondisi nyata karena server rujukan `Tnserver` memang menjalankan Apache produksi) awalnya naik sebagai stack trace Node mentah — ditangkap eksplisit, pesan diarahkan ke `Apache.md` Langkah 1.
3. **`install.js` awalnya juga rentan bug `import.meta.url` kosong yang sama seperti poin sebelumnya** — path ke `.dll` bundel di-resolve lewat `__dirname` manual, bukan `runtimePaths.js`. Diperbaiki: `.dll` (`install/php_nxdom.dll`) ditambahkan ke `EMBEDDED_ASSETS`, fungsi baru `bundledDllPath()` di `runtimePaths.js` menangani kedua mode (dev vs `.exe`) — bukti bahwa pola ini harus konsisten diterapkan ke SETIAP file baru yang menambahkan resolusi path, bukan cuma yang sudah ada saat perbaikan pertama.
4. `dev.js` melempar `Unhandled 'error' event` (crash Node mentah) kalau `spawn()` php.exe gagal (mis. path salah/tidak ada) — ditemukan tidak sengaja saat menguji skenario extension belum aktif. Ditambahkan handler `server.on('error', ...)` dengan pesan jelas (`FAIL: php.exe tidak ditemukan di: ...`) dan cleanup temp dir yang benar.

**Diuji nyata** (lewat `php.ini`/`extension_dir` terisolasi via env `PHPRC`, tidak pernah menyentuh instalasi produksi server rujukan yang sedang menjalankan Apache): baik mode `node` maupun mode `.exe` — ABI cocok → salin + edit `php.ini` → extension benar-benar termuat (dikonfirmasi `php -m`); jalankan dua kali → idempotent; `.dll` terkunci → pesan jelas; `dev` dengan extension tidak aktif → peringatan muncul; `dev` dengan path php.exe salah → error jelas, bukan crash. **Belum diuji nyata**: jalur penolakan ABI tidak cocok (tidak ada PHP versi/build lain di mesin ini untuk perbandingan sungguhan) — diverifikasi lewat pembacaan kode (perbandingan string sederhana), bukan eksekusi.

---

## Urutan Pengerjaan yang Disarankan

1. ✅ **Poin 1** (perbaiki `dev`) — selesai, diuji nyata. Tersisa: konfirmasi manual Ctrl+C (lihat catatan di poin 1).
2. ✅ **Poin 9** (restrukturisasi `cli/`, config interaktif, `.exe`, `install`) — selesai, diuji nyata.
3. ✅ **Poin 2** (schema auto-generate dari policy) — selesai, diuji nyata (mode `node` dan `.exe`).
4. **Poin 5** (custom action) — berikutnya, keputusan arsitektur besar, sebaiknya dibahas begitu ada kebutuhan nyata pertama (jangan desain spekulatif tanpa kasus konkret).
5. Poin 4, 6, 7 — dikerjakan sesuai kebutuhan/permintaan, tidak mendesak untuk pengembangan lanjutan di mesin dev saat ini. Poin 8 sudah selesai untuk server rujukan.

---

## Metodologi Verifikasi (mengikuti pola `Plan.md`)

Setiap poin di atas, saat mulai dikerjakan, wajib mengikuti disiplin yang sudah terbukti berulang kali menyelamatkan proyek ini dari asumsi salah (`Plan.md` §0C-0H, §M3-M7): **uji nyata dulu, jangan asumsikan kode benar hanya karena "terlihat benar"**. Klaim "selesai" hanya sah setelah dibuktikan lewat eksekusi sungguhan (request HTTP nyata, command CLI nyata dijalankan, bukan tinjauan kode semata) — dan dicatat di sini dengan bukti konkretnya, bukan pernyataan sukses generik.
