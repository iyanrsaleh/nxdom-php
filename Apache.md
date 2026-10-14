# Setup Apache untuk NxDom Native Extension

Runbook langkah-demi-langkah untuk memasang NxDom (native PHP extension) di server Apache, dari kondisi awal (server PHP+Apache polos, belum ada apa-apa) sampai bisa menjalankan app NxDom sungguhan. Disusun dari langkah nyata yang sudah dijalankan dan diuji terhadap server rujukan (`C:\Tnserver`, Apache 2.4 + PHP 8.1.31 ZTS/VC++2019). Untuk kronologi/riwayat percobaan-gagal dan alasan tiap keputusan, lihat `Plan.md` Bagian 0C–0H — dokumen ini hanya berisi **hasil akhir yang terbukti bekerja**.

Prasyarat sebelum mulai: `php_nxdom.dll` (atau `.so` di Linux) sudah berhasil dibuild — lihat `install.md` untuk proses build native extension-nya.

---

## Langkah 1 — Salin `.dll` ke `extension_dir` PHP

```
copy php_nxdom.dll  ke  <extension_dir dari php.ini>\
```

`extension_dir` bisa dicek dari `php.ini` (baris `extension_dir = "..."`) atau `php -i | grep extension_dir`.

> Kalau Apache sedang berjalan, file `.dll` lama akan **terkunci** (tidak bisa ditimpa) — hentikan service Apache dulu (`Stop-Service Apache2.4`), baru salin, baru nyalakan lagi.

## Langkah 2 — Daftarkan `extension=nxdom` di `php.ini`

Tambahkan **satu baris** di `php.ini` (server rujukan: `C:\Tnserver\bin\php\php.ini`), di bagian daftar `extension=...` yang sudah ada:

```ini
extension=nxdom
```

**Catatan penting**:
- `extension=` **hanya bisa** didaftarkan di level `php.ini` **global** — tidak bisa di-scope per-vhost lewat `php_admin_value` atau sejenisnya (keterbatasan PHP sendiri, bukan Apache). Ini berarti mengaktifkan NxDom akan memuatnya untuk **semua** PHP yang berjalan di server itu, termasuk aplikasi lain yang tidak memakai NxDom.
- Ini **aman** untuk aplikasi lain: `PHP_RINIT_FUNCTION` NxDom mengecek keberadaan `nxdom.config.json` di `DOCUMENT_ROOT` request tsb — kalau tidak ada, langsung `return SUCCESS` tanpa efek apa pun. Aplikasi tanpa `nxdom.config.json` tidak terpengaruh sama sekali.
- `zend_extension=opcache` (kalau sudah ada) **boleh tetap aktif** bersamaan — sempat dicurigai sebagai sumber masalah saat debugging (lihat Plan.md 0G), tapi terbukti **tidak relevan** setelah akar masalah sesungguhnya (poin di Langkah 5) diperbaiki. Tidak perlu dinonaktifkan.

Setelah edit `php.ini`, **restart Apache** (`Restart-Service Apache2.4 -Force` di Windows, atau `systemctl restart apache2` di Linux) — perubahan `php.ini` tidak berlaku sampai proses PHP di-reload.

## Langkah 3 — Verifikasi extension ter-load

```powershell
php -m | findstr nxdom
```

Harus muncul `nxdom` di daftar. Kalau tidak muncul, cek `error.log` Apache untuk pesan gagal load (mis. ABI mismatch — lihat `install.md` soal kecocokan versi compiler).

## Langkah 4 — Buat file `nxdom-rewrite.conf` (config generik, sekali per server)

Buat file baru **di luar folder app mana pun** (mis. `C:\Tnserver\bin\Apache\conf\nxdom-rewrite.conf`), isinya:

```apache
RewriteEngine On

# Lapis 1: blokir file konfigurasi NxDom secara mutlak.
RewriteRule ^/?nxdom\.[a-z]+\.json$ - [F,L]

# Lapis 2: request tanpa file fisik, HANYA kalau document root vhost ini
# punya nxdom.config.json, diarahkan ke front controller native.
RewriteCond %{DOCUMENT_ROOT}/nxdom.config.json -f
RewriteCond %{IS_SUBREQ} !=true
RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI} !-f
RewriteCond %{DOCUMENT_ROOT}%{REQUEST_URI} !-d
RewriteRule ^ "<path-absolut-ke>/nxdom/index.php" [L]
```

Ganti `<path-absolut-ke>` dengan lokasi instalasi NxDom sungguhan (mis. `D:/Framework/CLI/NxPHP/nxdom/index.php`).

**Kenapa tiap baris ada** (semua ditemukan lewat pengujian nyata, bukan ditulis langsung benar — lihat Plan.md 0G/0H untuk kronologi debugging tiap poin):
| Baris | Tanpa ini, apa yang terjadi |
|---|---|
| `^/?nxdom\.` (dengan `/?`) | Tanpa leading-slash-optional, pola tidak pernah match karena URI Apache selalu diawali `/`. |
| `RewriteCond ... IS_SUBREQ` | `DirectoryIndex` mencoba `index.php` dulu sebelum `index.html` — untuk app yang pakai `index.html`, sub-request internal ke `index.php` (tidak ada filenya) ikut salah ter-rewrite ke front controller kalau tidak dikecualikan. |
| `%{DOCUMENT_ROOT}%{REQUEST_URI}` (bukan `%{REQUEST_FILENAME}`) | `%{REQUEST_FILENAME}` tidak ter-resolve jadi path absolut dalam konteks `Include` per-vhost ini — file statis nyata (`app.js`, `assets/*.js`) ikut salah ter-rewrite ke front controller. |

## Langkah 5 — Include config generik itu di **tiap** `<VirtualHost>` yang ingin memakai NxDom

Di file vhost (mis. `httpd-vhosts.conf`), tambahkan **satu baris identik** di dalam `<VirtualHost>` block app tsb:

```apache
<VirtualHost *:80>
    ServerName demo.local
    DocumentRoot "D:/Framework/CLI/NxPHP/examples/demo"
    <Directory "D:/Framework/CLI/NxPHP/examples/demo">
        Options +Indexes +Includes +FollowSymLinks +MultiViews
        AllowOverride All
        Require all granted
    </Directory>
    <FilesMatch \.php$>
        SetHandler application/x-httpd-php
    </FilesMatch>

    Include conf/nxdom-rewrite.conf

    ErrorLog "logs/demo.local-error.log"
    CustomLog "logs/demo.local-access.log" common
</VirtualHost>
```

**Kenapa harus di dalam tiap `<VirtualHost>`, bukan cukup sekali di `httpd.conf` utama**: Apache **tidak mewariskan** direktif `RewriteEngine`/`RewriteRule` dari server config (di luar semua `<VirtualHost>`) ke `<VirtualHost>` yang sudah punya `ServerName` eksplisit — begini perilaku standar Apache (virtual host merging), dikonfirmasi lewat pengujian nyata (rule di `httpd.conf` utama sama sekali tidak match untuk request ke `demo.local`). Karena isi `nxdom-rewrite.conf` **identik** untuk semua vhost (bukan config khusus per-app), pola "tulis sekali, `Include` berkali-kali" ini tetap dianggap konfigurasi generik server (README §28), bukan pelanggaran README §6.

## Langkah 6 — Izinkan akses ke `index.php` (di luar semua `DocumentRoot`)

Karena `index.php` berada **di luar** semua `DocumentRoot` app, dan Apache modern punya `<Directory />` default `Require all denied`, perlu override eksplisit. Tambahkan **sekali** di `httpd.conf` utama (bukan per-vhost — ini berlaku global, aman untuk semua):

```apache
<Directory "<path-absolut-ke>/nxdom">
    Require all denied
    <Files "index.php">
        Require all granted
    </Files>
</Directory>
```

Least-privilege: hanya file `index.php` yang diizinkan, bukan seluruh folder `nxdom/` (yang berisi source `.c`/`.h`, tidak untuk diakses browser).

## Langkah 7 — Buat `index.php` (satu file, sekali untuk semua app)

Di lokasi instalasi NxDom (bukan di dalam app mana pun):

```php
<?php
/**
 * WAJIB mengakses $_SERVER dari userland SEBELUM nxdom_dispatch() —
 * $_SERVER PHP bersifat lazy-initialized, sedangkan nxdom_dispatch()
 * membaca $_SERVER langsung dari EG(symbol_table) di C, melewati
 * mekanisme lazy-load itu. Tanpa baris ini, nxdom_dispatch() SELALU
 * gagal diam-diam (return false). Lihat Plan.md Bagian 0G untuk
 * kronologi debugging temuan ini.
 */
$_SERVER['REQUEST_URI'];

if (function_exists('nxdom_dispatch') && nxdom_dispatch()) {
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Not found']);
```

## Langkah 8 — Restart Apache dan verifikasi

```powershell
httpd.exe -t          # cek syntax dulu, sebelum restart
Restart-Service Apache2.4 -Force
```

Uji berurutan (semua harus lolos sebelum dianggap selesai):

```bash
curl http://<vhost>/                      # file statis app, HARUS 200 normal
curl http://<vhost>/nxdom.config.json     # HARUS 403 (bukan bocor isi file)
curl http://<vhost>/nxdom.manifest.json   # HARUS 403
curl http://<vhost>/api/<sesuatu>         # HARUS ditangani NxDom, BUKAN 404 dari Apache
curl http://<vhost>/app.js                # file JS statis app, HARUS 200 (bukan ikut ter-route ke NxDom)
```

Kalau salah satu masih gagal, jangan asumsikan "hampir benar" — tiap kegagalan sebelumnya di Langkah 4 (`IS_SUBREQ`, path resolution) hanya kelihatan lewat `LogLevel rewrite:trace5` di `ErrorLog` vhost, bukan dari tebakan.

---

## Ringkasan: apa yang didaftarkan di mana

| File | Perubahan | Sekali per... |
|---|---|---|
| `php.ini` (global) | `extension=nxdom` (1 baris) | server |
| `httpd.conf` (utama) | `<Directory>` izin akses `index.php` | server |
| `conf/nxdom-rewrite.conf` (baru) | Isi lengkap Langkah 4 | server (isinya identik untuk semua app) |
| `httpd-vhosts.conf` (per app) | `Include conf/nxdom-rewrite.conf` (1 baris) | **vhost/app** — inilah satu-satunya bagian yang berulang per app, tapi isinya cuma pointer, bukan logic |
| `nxdom/index.php` (baru) | Isi lengkap Langkah 7 | server (satu file untuk semua app) |
| App itu sendiri (`nxdom.config.json`, `app.js`, dll.) | **Tidak ada perubahan apa pun** terkait Apache | — |

Prinsip README §6 tetap terjaga: app tidak menyimpan file NxDom apa pun. Yang "berulang per app" hanyalah satu baris `Include` di config server (dikelola administrator hosting, README §28), bukan file yang disalin ke dalam app.

---

## Instalasi di Control Panel Hosting (aaPanel, cPanel, CyberPanel, dll.)

Langkah 1–8 di atas mengasumsikan akses penuh ke `httpd.conf`/`php.ini` (server rujukan `Tnserver`). Di hosting berbasis control panel, akses itu biasanya **tidak langsung tersedia** — panel menyediakan jalur sendiri untuk hal yang sama.

> **Bantuan otomatis (Linux)**: command **`nxdom-php install-host`** mendeteksi panel (aaPanel/CyberPanel) dan mencetak perintah `sudo` persis untuk Langkah 1–3 (salin `.so`, edit php.ini, restart) + front controller + rewrite. Ia **tidak** mengubah sistem sendiri — lihat `cli/README.md`. **Diuji nyata di aaPanel** (WSL, PHP 8.3), lihat `Plan_02.md` §11; cPanel/CyberPanel masih pemetaan konsep (belum diuji di instalasi sungguhan).

### aaPanel (Nginx/Apache + PHP-FPM) — SUDAH DIUJI NYATA

Diverifikasi di WSL Ubuntu + aaPanel 8.0.6, PHP 8.3.35 (lihat `Plan_02.md` §11):

1. **Extension** — build `.so` di Linux (`phpize`, `install.md` Langkah 9), salin ke `extension_dir` PHP target (mis. `/www/server/php/83/lib/php/extensions/no-debug-non-zts-<API>/`), lalu tambah `extension = nxdom.so` ke **`/www/server/php/83/etc/php.ini`** (php.ini FPM — BUKAN `php-cli.ini`). Restart: `/etc/init.d/php-fpm-83 restart`.
2. **Front controller global** — `/www/nxdom/index.php` (satu file, di luar semua webroot), lihat `nxdom/README.md`.
3. **Rewrite vhost** — edit vhost di `/www/server/panel/vhost/nginx/<domain>.conf`: blokir `nxdom.*.json`, `try_files $uri @nxdom`, `location @nxdom` → `fastcgi_pass unix:/tmp/php-cgi-83.sock` + `SCRIPT_FILENAME /www/nxdom/index.php`. Reload: `/etc/init.d/nginx reload`.
4. Aplikasi di webroot murni aset + `nxdom.config.json` (tanpa kode PHP) — lihat `nxdom/README.md`.

> **Catatan**: aaPanel memakai php.ini terpisah untuk CLI (`php-cli.ini`) dan FPM (`php.ini`); yang membuat extension aktif di web adalah yang **FPM**. `php -i` dari CLI melaporkan `php-cli.ini` — jangan tertukar.

### Prinsip umum (berlaku di panel apa pun)

Untuk memasang NxDom di panel manapun, cari 4 hal yang setara dengan Langkah 1–7:

1. **Tempat mengaktifkan PHP extension** — biasanya di level WHM/root panel (bukan per-akun/per-domain), karena `extension=` PHP memang selalu global per versi-PHP (§Langkah 2 di atas berlaku sama di mana pun). Kalau panel memakai beberapa versi PHP sekaligus (mis. PHP 8.1 dan 8.2 terpisah), `.dll`/`.so` harus disalin dan didaftarkan **di tiap versi PHP** yang dipakai app NxDom.
2. **Tempat menaruh rewrite rule custom per-vhost** — panel modern jarang mengizinkan edit `httpd.conf` utama langsung, tapi hampir selalu menyediakan mekanisme "include config tambahan per vhost" yang otomatis di-include Apache/LiteSpeed saat regenerasi config. Isi `nxdom-rewrite.conf` (Langkah 4) tetap sama persis — yang beda cuma *tempat menaruhnya* supaya ikut ter-include.
3. **Tempat mengatur `<Directory>` permission** untuk `index.php` di luar `DocumentRoot` — kalau panel tidak mengizinkan `<Directory>` di luar home akun sama sekali, alternatifnya taruh `nxdom/` di path yang tetap diizinkan panel (mis. di luar `public_html` tapi masih di dalam home directory akun sistem yang menjalankan instalasi NxDom, bukan di dalam app manapun) dan sesuaikan permission lewat mekanisme panel yang sama.
4. **User/permission proses PHP** — di panel, PHP sering berjalan sebagai suPHP/PHP-FPM per-akun (bukan satu proses `mod_php` milik Apache seperti di server rujukan) — pastikan file `.dll`/`.so` dan `index.php` bisa dibaca oleh user itu.

### cPanel (Apache + EasyApache)
 — BELUM DIUJI


- **Extension** — Langkah 1–3 dilakukan lewat **WHM → EasyApache 4** kalau NxDom dipaketkan sebagai RPM/extension resmi (jalur yang didukung cPanel), atau lewat **WHM → MultiPHP INI Editor** untuk menambahkan baris `extension=nxdom` per versi PHP kalau `.so` disalin manual ke `extension_dir` versi PHP tsb (cek path lewat `MultiPHP INI Editor` juga). Ini setara Langkah 2, tapi harus diulang untuk **setiap** versi PHP (mis. `ea-php81`, `ea-php82`) yang dipakai domain NxDom.
- **Rewrite generik (Langkah 4–5)** — cPanel meregenerasi `httpd.conf` dari template, jadi edit manual akan hilang saat rebuild. Jalur yang bertahan: **WHM → Apache Configuration → Include Editor**, pilih "Pre VirtualHost Include" atau "Pre Main Include" sesuai kebutuhan, atau — kalau NxDom hanya dipakai domain tertentu — taruh isi Langkah 4 di **`.htaccess`** domain tsb (`AllowOverride All` biasanya sudah default di cPanel, beda dari server rujukan yang perlu diaktifkan manual). `.htaccess` per-domain sedikit menyimpang dari "config generik server" (README §28) tapi tetap tidak melanggar README §6 karena isinya bukan logic aplikasi, cuma pointer rewrite yang identik untuk semua app NxDom.
- **Directory permission (Langkah 6)** — kalau `Include Editor` WHM dipakai, `<Directory>` untuk `index.php` bisa didaftarkan di include yang sama (level server, sekali untuk semua akun). Kalau lewat `.htaccess` per-domain, permission cukup diatur normal seperti file PHP lain di domain tsb.
- **Root access** — semua langkah di atas butuh akses **WHM** (root/reseller), bukan cPanel akun biasa. Kalau hanya punya akses cPanel akun (shared hosting), instalasi NxDom **tidak mungkin** dilakukan sendiri — extension PHP dan Apache include level-server selalu butuh akses admin.

### CyberPanel (OpenLiteSpeed, bukan Apache)

**Perbedaan mendasar**: CyberPanel default memakai **OpenLiteSpeed (OLS)**, bukan Apache — walau format rewrite rule LiteSpeed kompatibel sintaks Apache (`RewriteEngine`/`RewriteCond`/`RewriteRule` bisa dipakai apa adanya), *cara memasangnya* sama sekali berbeda: tidak ada `httpd-vhosts.conf` atau `Include` file `.conf` seperti Apache.

- **Extension (Langkah 1–3)** — OLS memakai **LSPHP** (build PHP milik LiteSpeed sendiri, bukan `php.exe`/php-fpm generik) dengan `php.ini` dan `extension_dir` terpisah per versi LSPHP. Cari lewat **CyberPanel → PHP → Select PHP Version**, lalu edit `php.ini` LSPHP yang sesuai (path biasanya `/usr/local/lsws/lsphpXX/etc/php.ini`). `.so` harus dibuild/dikompilasi cocok terhadap ABI **LSPHP**, bukan cukup ABI PHP resmi — kemungkinan besar perlu rebuild native extension terhadap source LSPHP kalau ABI-nya berbeda dari PHP resmi versi sama (belum diverifikasi; cek dulu `lsphp -i` untuk baris `PHP Extension Build` sebagaimana `install.md` mewanti-wanti untuk build resmi).
- **Rewrite generik (Langkah 4–5)** — dipasang lewat **CyberPanel/OLS WebAdmin Console → Virtual Host → Rewrite tab**, bukan file `.conf` yang di-`Include`. Isi rule Langkah 4 tetap valid sebagai teks rewrite (sintaks kompatibel Apache), ditempel di kolom "Additional Rewrite Rules" tiap vhost — ini **secara struktural sama** dengan Langkah 5 (satu blok identik ditempel berulang per vhost), hanya bentuk UI-nya beda.
- **Directory permission (Langkah 6)** — OLS mengatur ini lewat **"External App"/"Context"** di WebAdmin, bukan `<Directory>` Apache. `index.php` perlu didaftarkan sebagai context yang bisa diakses (mis. sebagai script context menunjuk ke path fisiknya) supaya OLS mau mengeksekusinya meski di luar `DocumentRoot` vhost.
- **Root access** — sama seperti cPanel/WHM, ini semua butuh akses admin CyberPanel (bukan akun website biasa).

### Kesimpulan

Prinsip arsitektur (README §4/§28, Plan.md §0G) — native extension + front controller generik + rewrite generik, dipasang sekali di level server — **tidak berubah** di panel manapun. Yang berbeda hanya *mekanisme* tiap panel untuk mencapai efek yang sama, dan derajat akses (root/WHM/admin panel) yang dibutuhkan tetap sama tingginya seperti server manual. **aaPanel sudah diuji nyata** (§ di atas, `Plan_02.md` §11); **cPanel & CyberPanel belum** — sebelum mengklaim "sudah bisa jalan" di keduanya, perlu pengujian nyata terhadap instalasi sungguhan.
