# NxDom — Arsitektur PHP Extension Global

> **Write JavaScript. Run on PHP.**

## 1. Tujuan

NxDom dirancang sebagai **PHP Extension/Module global** yang dipasang satu kali pada environment PHP.

Aplikasi yang menggunakan NxDom **tidak membawa source NxDom**, tidak memiliki folder `nxdom/`, dan tidak perlu menyalin runtime NxDom ke dalam `www`.

Konsep utama:

```text
PHP Environment
      │
      └── NxDom Extension
               │
               ├── API
               ├── Router
               ├── Database
               ├── Auth
               ├── Storage
               └── Runtime
```

Kemudian banyak aplikasi dapat menggunakan NxDom secara global.

---

# 2. Arsitektur Utama

```text
SERVER / HOSTING
│
├── PHP Engine
│   │
│   ├── PDO
│   ├── CURL
│   ├── mbstring
│   └── NxDom Extension
│
├── www/
│   │
│   ├── site-a/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── style.css
│   │
│   ├── site-b/
│   │   ├── index.html
│   │   ├── app.js
│   │   └── style.css
│   │
│   └── site-c/
│       ├── index.html
│       ├── app.js
│       └── style.css
│
└── MySQL / MariaDB
```

NxDom berada **di level PHP**, bukan di dalam:

```text
www/
```

---

# 3. NxDom Bukan Library Aplikasi

NxDom tidak digunakan seperti:

```text
myapp/
└── vendor/
    └── nxdom/
```

dan bukan:

```text
myapp/
└── nxdom/
```

NxDom merupakan komponen yang dimuat oleh PHP.

Konsep:

```text
PHP
│
├── Built-in
├── Standard Extensions
└── NxDom Extension
```

---

# 4. Instalasi NxDom

NxDom dipasang pada environment PHP sebagai native extension:

```ini
extension=nxdom
```

Setelah PHP memuat NxDom:

```text
PHP
  │
  ▼
NxDom
```

NxDom tersedia untuk aplikasi PHP yang berjalan pada environment tersebut — tapi `extension=nxdom` saja **tidak cukup** untuk request `/api/*` sampai ke NxDom. Web server (Apache/Nginx) hanya memanggil PHP interpreter untuk file fisik yang cocok; untuk path virtual seperti `/api/users`, PHP (dan karena itu NxDom) tidak pernah dijalankan sama sekali kecuali web server diarahkan ke sana lebih dulu.

Karena itu instalasi lengkap juga menyertakan dua bagian generik yang dipasang **sekali di level server**, bukan per-aplikasi:

- **`nxdom/index.php`** — satu front controller PHP generik (sama untuk semua app) yang memanggil `nxdom_dispatch()` di dalam extension. Diperlukan karena native extension tidak bisa dieksekusi web server tanpa ada file fisik untuk dipanggil.
- **Konfigurasi `mod_rewrite` generik** (di-`Include` identik di tiap `<VirtualHost>`) — mengarahkan path tanpa file fisik ke front controller, dan memblokir akses langsung ke `nxdom.*.json` (config/manifest/policy) supaya tidak ter-serve sebagai file statis.

Lihat `Plan.md` Bagian 0C–0G untuk riwayat kenapa ini diperlukan, dan `nxdom/README.md` untuk isi folder instalasi globalnya.

---

# 5. Satu NxDom untuk Banyak Aplikasi

Satu server dapat memiliki:

```text
NxDom Extension
       │
       ├── Website A
       ├── Website B
       ├── Website C
       ├── Website D
       └── Website E
```

Tidak diperlukan instalasi NxDom pada setiap aplikasi.

---

# 6. Struktur Website

Website cukup memiliki:

```text
www/
└── myapp/
    ├── index.html
    ├── app.js
    ├── style.css
    └── assets/
```

Tidak ada:

```text
❌ nxdom/
❌ vendor/nxdom/
❌ Runtime.php
❌ Router.php
❌ Database.php
❌ bootstrap.php
```

---

# 7. Hubungan PHP dan NxDom

```text
┌───────────────────────┐
│      PHP Engine       │
│                       │
│   ┌───────────────┐   │
│   │    NxDom      │   │
│   │   Extension   │   │
│   └───────────────┘   │
│                       │
└───────────┬───────────┘
            │
            ▼
       Application
```

NxDom menjadi extension yang menyediakan kemampuan tambahan kepada PHP. Extension inilah yang menjalankan logic Router/Database/Auth (lihat §11–12) — tapi ia dipanggil lewat front controller generik (§4), bukan menggantikan Apache/Nginx dalam memutuskan request mana yang sampai ke PHP.

---

# 8. Komponen NxDom

NxDom dapat memiliki komponen internal:

```text
NxDom
├── Core
├── Router
├── API
├── Database
├── Auth
├── Session
├── Storage
├── Cache
├── Queue
└── Runtime
```

Komponen tersebut berada di dalam NxDom Extension.

Developer tidak perlu menyalinnya ke aplikasi.

---

# 9. Database

NxDom menyediakan abstraksi database.

Contoh konsep API:

```js
const users = await nxdom.db("users").get();
```

atau:

```js
const users = await nxdom
    .db("users")
    .where("active", true)
    .get();
```

Alurnya:

```text
JavaScript
    │
    ▼
NxDom API
    │
    ▼
NxDom Database
    │
    ▼
PDO / MySQL
    │
    ▼
MySQL / MariaDB
```

---

# 10. Authentication

NxDom menyediakan sistem authentication global:

```text
NxDom
├── Register
├── Login
├── Logout
├── Session
├── Password Hash
├── API Token
├── Roles
└── Permissions
```

Aplikasi hanya menggunakan API NxDom.

---

# 11. Router

Router menjadi bagian dari NxDom.

```text
Browser
   │
   │ /api/users
   ▼
PHP
   │
   ▼
NxDom Router
   │
   ▼
Application Handler
```

Aplikasi tidak perlu membawa:

```text
Router.php
```

karena router berada pada NxDom Extension.

---

# 12. API

JavaScript browser berkomunikasi dengan backend NxDom.

Contoh:

```js
const response = await fetch("/api/users");

const users = await response.json();
```

Alurnya:

```text
Browser
   │
   │ HTTP Request
   ▼
Apache / Nginx
   │
   ▼
PHP
   │
   ▼
NxDom
   │
   ├── Router
   ├── Auth
   ├── Database
   └── API
   │
   ▼
Response
```

---

# 13. JavaScript Application

Developer menulis JavaScript:

```js
const response = await fetch("/api/users");

const users = await response.json();

console.log(users);
```

Developer tidak perlu mengetahui implementasi PHP internal NxDom.

---

# 14. NxDom JavaScript API

NxDom membutuhkan JavaScript API yang menjadi interface antara aplikasi dan NxDom.

Contoh:

```js
import nxdom from "@nxdom/client";

const users = await nxdom.db("users").get();
```

API tersebut bukan Node.js API.

API tersebut merupakan **NxDom Application API**, diimplementasikan sebagai paket `@nxdom/client` (lihat `packages/nxdom-js/README.md` untuk referensi API lengkapnya).

---

# 15. Runtime

Runtime NxDom berada pada extension.

Bukan:

```text
myapp/
└── Runtime.php
```

Tetapi secara konseptual:

```text
PHP
└── NxDom Extension
    └── Runtime
```

Runtime bertanggung jawab terhadap operasi internal NxDom.

---

# 16. PHP Engine Tetap Dibutuhkan

NxDom tidak menggantikan PHP.

Arsitektur:

```text
Operating System
       │
       ▼
PHP
       │
       ▼
NxDom Extension
       │
       ▼
Application
```

PHP tetap menjadi engine yang menjalankan server-side processing.

---

# 17. NxDom Bukan Web Server

NxDom tidak menggantikan:

```text
Apache
Nginx
```

Arsitektur:

```text
Internet
   │
   ▼
Apache / Nginx (+ mod_rewrite generik, §4)
   │
   ▼
PHP (front controller generik)
   │
   ▼
NxDom
   │
   ▼
Application
```

Apache/Nginx tetap yang memutuskan request mana yang diteruskan ke PHP — NxDom baru berjalan setelah itu terjadi (lihat §4 untuk konfigurasi generik yang diperlukan).

---

# 18. NxDom Bukan Hosting

NxDom tidak menyediakan:

```text
VPS
Domain
DNS
Apache
Nginx
PHP Hosting
Database Server
```

NxDom hanya menyediakan application runtime dan API pada environment PHP.

---

# 19. Application Layer

Aplikasi berada di atas NxDom:

```text
┌─────────────────────┐
│    Application      │
│                     │
│ HTML                │
│ CSS                 │
│ JavaScript          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│       NxDom         │
│                     │
│ API                 │
│ Router              │
│ Database            │
│ Auth                │
│ Storage             │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│        PHP          │
└─────────────────────┘
```

---

# 20. Development Environment

Developer dapat menggunakan Node.js untuk toolchain NxDom.

```text
Developer PC
│
├── Node.js
├── npm / NxPM
├── NxDom CLI
└── Project
```

Contoh:

```bash
nxdom create myapp
nxpm install
nxdom dev
nxdom build
```

Node.js digunakan untuk **development tooling**, bukan sebagai production runtime.

---

# 21. Production Environment

Production tidak membutuhkan Node.js.

```text
Production Server
│
├── Apache / Nginx
├── PHP
├── NxDom Extension
├── MySQL / MariaDB
└── Applications
```

Tidak diperlukan:

```text
❌ Node.js
❌ npm
❌ NxPM
❌ NxDom CLI
```

---

# 22. Multi-Application Architecture

NxDom dirancang untuk banyak aplikasi:

```text
                    PHP
                     │
                NxDom Extension
                     │
       ┌─────────────┼─────────────┐
       │             │             │
       ▼             ▼             ▼
    App A          App B         App C
       │             │             │
       ▼             ▼             ▼
    Database      Database      Database
```

Satu instalasi NxDom dapat digunakan oleh banyak website.

---

# 23. Isolasi Aplikasi

Walaupun NxDom global, setiap aplikasi tetap memiliki:

```text
Configuration
Database
Session
Authentication
Storage
Environment
Routes
```

secara terpisah.

Contoh:

```text
App A
├── config
├── database
└── storage

App B
├── config
├── database
└── storage
```

NxDom menyediakan engine-nya secara global, sedangkan data aplikasi tetap terisolasi.

---

# 24. Security

NxDom harus memastikan satu aplikasi tidak dapat mengakses data aplikasi lain tanpa izin.

Minimal:

```text
Application ID
Tenant / Site Context
Permission
Filesystem Isolation
Database Isolation
Environment Isolation
```

---

# 25. Compiler NxDom

Compiler tetap diperlukan untuk developer experience.

Pipeline:

```text
JavaScript
     │
     ▼
NxDom Compiler
     │
     ▼
NxDom Application Format
     │
     ▼
PHP Hosting + NxDom Extension
```

Compiler **tidak perlu membawa NxDom runtime ke aplikasi**.

---

# 26. Peran Compiler

Compiler bertugas:

* membaca JavaScript
* menganalisis NxDom API
* melakukan optimasi
* membuat application bundle
* melakukan validasi
* membuat metadata aplikasi
* membuat asset build
* membuat source map
* menyiapkan deployment

Compiler bukan installer NxDom server.

---

# 27. Deployment

Sebelum deployment:

```bash
nxdom build
```

Hasil aplikasi:

```text
dist/
├── index.html
├── app.js
├── style.css
└── assets/
```

Kemudian upload:

```text
dist/
    ↓
www/myapp/
```

NxDom **sudah tersedia secara global pada server**.

---

# 28. Server Setup

Administrator hosting melakukan:

```text
1. Install PHP
2. Install NxDom Extension (php_nxdom.dll/.so, extension=nxdom)
3. Pasang front controller generik (nxdom/index.php)
4. Pasang mod_rewrite generik (Include identik di tiap vhost — §4)
5. Configure database
```

Langkah 2–4 dilakukan **sekali** di level server, bukan per-aplikasi — lihat §4 dan `Plan.md` Bagian 0G untuk detail teknisnya. Setelah itu banyak aplikasi dapat menggunakan NxDom tanpa konfigurasi tambahan apa pun di sisi mereka.

---

# 29. Developer Setup

Developer tidak perlu menginstal NxDom ke dalam project.

Cukup:

```bash
nxdom-php create myapp
```

Kemudian:

```bash
nxdom-php build myapp
```

dan (development):

```bash
nxdom-php dev myapp --php <path-ke-php.exe>
```

Command sungguhan adalah **`nxdom-php`** (paket `@nxdom/cli`), bukan `nxdom`/`nxpm` seperti pada konsep §20 — lihat `cli/README.md` untuk referensi lengkap tiap command, termasuk status `dev` yang saat ini diketahui belum berfungsi pasca-migrasi ke native extension (`Plan.md` Bagian 0).

---

# 30. Perbedaan dengan Framework PHP

Framework tradisional biasanya:

```text
Application
└── vendor/
    └── framework/
```

NxDom:

```text
PHP
└── NxDom Extension

Applications
├── App A
├── App B
└── App C
```

NxDom berada pada level PHP environment.

---

# 31. Perbedaan dengan Library

Library:

```text
App
└── library/
```

NxDom:

```text
PHP
└── NxDom
```

NxDom tidak perlu diduplikasi pada setiap aplikasi.

---

# 32. Target Arsitektur Final

```text
                    INTERNET
                       │
                       ▼
                Apache / Nginx
                       │
                       ▼
                  PHP Engine
                       │
              ┌────────┴────────┐
              │                 │
              ▼                 ▼
        NxDom Extension     PHP APIs
              │
     ┌────────┼─────────┐
     │        │         │
     ▼        ▼         ▼
   Router   Database   Auth
     │        │         │
     └────────┼─────────┘
              │
              ▼
        Applications
        ┌─────┼─────┐
        ▼     ▼     ▼
      App A App B App C
```

---

# 33. Prinsip Final NxDom

NxDom harus mengikuti prinsip berikut:

1. **NxDom dipasang satu kali pada PHP environment.**
2. **NxDom bukan folder di `www`.**
3. **NxDom bukan `vendor` aplikasi.**
4. **NxDom bukan runtime yang disalin ke setiap project.**
5. **NxDom dapat digunakan banyak aplikasi.**
6. **Developer tidak perlu menulis PHP.**
7. **Production tidak membutuhkan Node.js.**
8. **Production tidak membutuhkan npm.**
9. **Production tidak membutuhkan NxPM.**
10. **PHP tetap menjadi engine utama.**
11. **Apache/Nginx tetap menjadi web server.**
12. **NxDom menyediakan application API di atas PHP.**
13. **Database/Auth/Router/Storage menjadi bagian dari NxDom.**
14. **Setiap aplikasi tetap memiliki isolasi konfigurasi dan data.**
15. **Compiler NxDom menangani JavaScript developer experience.**

---

# 34. Visi

```text
                 DEVELOPER
                     │
                     │
            JavaScript / HTML / CSS
                     │
                     ▼
                NxDom Toolchain
                     │
                     ▼
                Application
                     │
                     ▼
              PHP + NxDom
                     │
                     ▼
                Web Hosting
```

### Filosofi

> **Write JavaScript. Run on PHP.**

NxDom memberikan pengalaman pengembangan modern berbasis JavaScript, sementara production tetap menggunakan infrastruktur PHP yang sudah tersedia.

---

# 35. Keputusan Arsitektur

**NxDom ditetapkan sebagai PHP Extension/Module global.**

Model berikut **tidak digunakan**:

```text
❌ NxDom di www/
❌ NxDom di vendor/
❌ NxDom di setiap aplikasi
❌ Runtime.php di setiap aplikasi
❌ Router.php di setiap aplikasi
❌ Database.php di setiap aplikasi
```

Model yang digunakan:

```text
PHP Environment
      │
      └── NxDom Extension
               │
        ┌──────┼──────┐
        ▼      ▼      ▼
       App A  App B  App C
```

**Satu NxDom → banyak aplikasi.**

> **Catatan implementasi (lihat `Plan.md` §0C–0G):** "NxDom Extension" pada diagram di atas dijangkau lewat front controller PHP generik + konfigurasi `mod_rewrite` generik yang dipasang sekali di server (§4, §28) — bukan `extension=nxdom` semata. Front controller dan rule rewrite itu tetap satu berkas/config generik untuk semua app (bukan per-app), sehingga prinsip 1–5 di atas tetap terjaga: aplikasi individual tidak membawa `Router.php`/`Database.php`/config NxDom apa pun.
