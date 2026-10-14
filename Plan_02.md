# NxDom — Plan_02: Kebutuhan Poin 5 (Custom Action) — nxdom-php Menggantikan Backend Lama

> **Koreksi penting terhadap draf awal dokumen ini**: draf pertama keliru menganggap NXUI (Web Statik) dan backend Nexa PHP lama sebagai proyek terpisah yang "kebetulan ditemukan". Setelah membaca `D:\Framework\CLI\nxdom\README.md`/`overview.md`/`teknis.md`, gambaran sebenarnya: **`nxdom-cli` adalah installer/manager terpadu untuk lima runtime resmi ekosistem NxDom** — Backend (PHP), Desktop (Electron), Mobile (Expo/React Native), Web Express (Node), dan **Web Statik (= NXUI)**. `examples/demo/` adalah instalasi Web Statik yang sedang diuji integrasinya.
>
> **Keputusan eksplisit dari user**: runtime **Backend** (saat ini backend Nexa PHP lama — `D:\info@nxdom.org\Repository\backend\`, berbasis Controllers/Models/Composer) **akan digantikan sepenuhnya** oleh `nxdom-php` (native C extension yang sedang kita bangun di repo ini). Dan: **`nxdom-php` harus kompatibel dengan kontrak `/outside` NXUI apa adanya** — Web Statik yang sudah ada tidak boleh diubah. Ini mengubah total kesimpulan draf pertama dokumen ini (yang menyarankan "dua backend berdampingan" — sudah tidak berlaku).
>
> **Cakupan dipersempit lebih lanjut** (§4.0): routing/tampilan halaman **sepenuhnya** tanggung jawab `examples/demo/app.js` (client-side, `NexaRoute`) — bukan concern backend. Dari dua jalur `/outside` yang ditemukan (§3.2), hanya **jalur model** (`routeToModel`, dibatasi ke query builder) yang perlu dipelajari/direplikasi; jalur controller (`routeToController`, PHP class bebas) **tidak perlu direplikasi**, cukup dipahami pola API-nya saja.
>
> **Status akhir seluruh 3 jalur Storage() teraudit** (lihat §8 untuk jalur ketiga yang ditemukan belakangan): `.package()` → jalur controller, **ditolak** (§4.0). `.models()` → jalur model, **direplikasi penuh** (§3-§4, query builder + resolusi class + tanpa session). `.model()` tunggal → client kirim SQL string, **ditolak eksplisit demi keamanan** (§8.3) — satu-satunya pengecualian terhadap prinsip "kompatibel apa adanya", diputuskan sadar karena pola aslinya rentan SQL injection (blocklist regex, bukan whitelist/parameterized).

---

## 1. Peta Ekosistem (setelah koreksi)

```
nxdom-cli (installer terpadu, "Menu Runtime")
├── Backend       ← Nexa PHP lama HARI INI; TARGET: digantikan nxdom-php (repo ini)
├── Desktop       (Electron — di luar cakupan repo ini)
├── Mobile        (Expo/React Native — di luar cakupan repo ini)
├── Web Express   (Node/Express — di luar cakupan repo ini)
└── Web Statik    ← NXUI. FRONTEND yang harus TETAP BERFUNGSI tanpa perubahan
                     setelah Backend diganti nxdom-php.
```

`examples/demo/` = instalasi Web Statik (NXUI) yang sudah ada, dipakai sebagai kasus uji integrasi nyata untuk pembuktian: **apakah `nxdom-php` bisa menggantikan backend Nexa PHP lama secara transparan bagi NXUI.**

## 2. Apa itu NXUI (Web Statik) — ringkas

SPA framework client-side murni:
- **Entry point**: `App.js`/`app.js` (file yang sama, Windows case-insensitive).
- **Bundle**: `assets/modules/nxdom.js` — mengekspos `window.NXUI`/`window.NEXA`, memuat modul opsional (`Route`, `Buckets`, `forms`, dll.) berdasarkan `assets/modules/modules.json`.
- **Routing client-side**: `NexaRoute`/`NexaPage` — baca `templates/{nama}.js`.
- **Data fetching ke Backend**: `NXUI.Storage()` — `.get()`, `.api()`, **`.package()`** (lihat §3).

## 3. Kontrak `/outside` yang WAJIB didukung `nxdom-php`

### 3.1 URL construction (dibuktikan lewat pembacaan kode `NexaStorage.js`)

```js
getBaseURL() === normalizeUrl(NEXA.apiBase) + "/outside"
```

Semua `Storage().get()`, `.api()`, `.package()` (untuk `row`/path relatif — bukan URL absolut) memanggil `joinURL(getBaseURL(), row)`. **Dibuktikan lewat request nyata** (`curl` terhadap server NxDom manifest yang ada): rute NxDom asli (`/api/users`) → `200`; rute yang akan dipanggil `Storage()` (`/api/outside/users`) → `404`. **Kesimpulan wajib**: `nxdom-php` harus mengekspos route `/api/outside` (atau apa pun path yang dikonfigurasi sebagai `NEXA.apiBase`, dengan `/outside` di belakangnya) sebagai endpoint RPC generik, terpisah dari route CRUD manifest `/api/{resource}` yang sudah ada — **keduanya perlu hidup berdampingan di dalam nxdom-php**, bukan saling menggantikan.

### 3.2 Payload contract — dari `OutsideController::routeToController()`/`routeToModel()` (`D:\info@nxdom.org\Repository\backend\controllers\Api\OutsideController.php`)

**Request** (POST ke `/outside`):
```json
// Jalur controller:
{ "controllers": "ExampleControllers", "method": "createOrder", "params": "<base64+xor-encrypted-json>" }
// Jalur model:
{ "model": "Exasmple", "method": "newsById", "params": "<base64+xor-encrypted-json>" }
```

**Server harus**:
1. Normalize nama (`XControllers` → `XController`, lihat `normalizeControllerName()`).
2. **Validasi regex** nama controller/model & method: `^[a-zA-Z_][a-zA-Z0-9_]*$` — mencegah nama sembarang dipakai sebagai identifier PHP/lookup internal.
3. **Decrypt `params`** — XOR + Base64 (lihat §3.3, algoritma trivial, mudah direplikasi di C).
4. Resolve target: jalur controller cari **class PHP** (`resolveControllerNamespace`, scan direktori kalau tidak ketemu di namespace umum); jalur model cari **Model class** (`resolveModelNamespace`, juga scan direktori).
5. **Cek method ada & public** (reflection: `method_exists` + `ReflectionMethod::isPublic()`).
6. Panggil `$target->$methodName($params)`.

**Response** (seragam):
```json
{ "status": "success", "data": <hasil method>, "controller": "...", "method": "...", "timestamp": "..." }
// atau saat gagal:
{ "status": "error", "message": "...", "error": "KODE_ERROR_KONSTAN", "timestamp": ... }
```

Kode error yang harus direplikasi persis (dipakai NXUI untuk menampilkan pesan yang tepat ke user): `MISSING_REQUIRED_FIELDS`, `INVALID_CONTROLLER_NAME`, `INVALID_METHOD_NAME`, `CONTROLLER_NOT_FOUND`, `METHOD_NOT_FOUND`, `METHOD_NOT_ACCESSIBLE`, `CROSS_CONTROLLER_ERROR`, `MODEL_PATH_MISSING`, `METHOD_NAME_MISSING`, `INVALID_MODEL_PATH`, `MODEL_INSTANTIATION_ERROR`, `PROCESSING_ERROR`.

### 3.3 Enkripsi payload — `NexaEncrypt` — KEPUTUSAN DIBALIK: DIREPLIKASI, jangan ubah file JS

**Keputusan awal** (sesi sebelumnya) menyimpulkan `NexaEncrypt` tidak perlu direplikasi, cukup JSON polos, dan `NexaStorage.js` disesuaikan untuk berhenti meng-encrypt. **Keputusan ini DIBALIK oleh user**: setelah ditemukan bahwa `NexaModels.js` (client, `examples/demo/assets/modules/Buckets/`) **sudah memanggil `this.nexaEncrypt.encryptJson(...)` di banyak titik** (`get`/`post`/`insert`/`update`/`delete`/`paginate`/`count`/`exists`/`first`/`execute` — lihat §8), mengubah `NexaEncrypt.js` berarti mengubah **banyak titik pemanggilan** di file yang seharusnya tidak disentuh (konsisten dengan prinsip pembuka dokumen ini: NXUI yang sudah ada tidak boleh diubah).

**Keputusan final**: `nxdom-php` **harus mereplikasi algoritma `NexaEncrypt`** (XOR + Base64, `system/Helpers/NexaEncrypt.php`) di sisi server — `NexaEncrypt.js`/`NexaStorage.js`/`NexaModels.js` **tidak diubah sama sekali**. Algoritma trivial (`base64_encode(xor(json_encode(data), secretKey))`, default `secretKey = 'nexa-default-secret-key-2025'`) — mudah direplikasi di native extension (XOR byte-per-byte dan base64 adalah operasi dasar).

### 3.4 Query builder `NexaModel::Storage()` — gap fitur signifikan

Dibaca dari `system/NexaModel.php` (6185 baris) — daftar method yang jauh lebih kaya dari `QueryBuilder` NxDom sekarang:

**Audit selesai** — `NexaModel.php` punya 207 method publik total; disaring ke **query builder inti** saja (disepakati eksplisit dengan user — chart/menu/dashboard/`showTablesRet*`/`readVariable*`/`generateMenu*` dan sejenisnya dikeluarkan dari cakupan, itu fitur admin-panel bawaan framework lama, bukan primitif data access). Implementasi tiap method inti sudah dibaca langsung (bukan cuma signature) untuk memastikan perilaku persis, bukan tebakan dari nama.

| Kategori | Method `NexaModel` (readonly, dibaca implementasinya) | Ada di NxDom `QueryBuilder` sekarang? |
|---|---|---|
| Where dasar | `where($column, $operator=null, $value=null, $boolean='AND')` — auto-detect `array` value → `IN`/`NOT IN`; auto-wrap `LIKE` dengan `%...%` kalau value belum ada wildcard; `$column` array → multi-kondisi AND | ✅ Ada (`where`), tapi **tanpa** auto-IN/auto-LIKE-wrap/array-multi-kondisi |
| Where OR | `orWhere` (alias `where(..., 'OR')`) | ❌ Tidak ada (NxDom cuma AND) |
| Where IN/NOT IN | `whereIn`, `whereNotIn`, `orWhereIn`, `orWhereNotIn` — no-op kalau `$values` kosong (bukan generate SQL `IN ()` invalid) | ❌ Tidak ada |
| Where BETWEEN | `whereBetween`, `whereNotBetween` — **validasi count($values)===2**, throw kalau tidak | ❌ Tidak ada |
| Where NULL | `whereNull`, `whereNotNull`, `orWhereNull`, `orWhereNotNull` | ❌ Tidak ada |
| Where tanggal | `whereDate/Year/Month/Day`, `wherePeriode`, `whereDateRange`, (+varian `orWhere*`) | ❌ Tidak ada |
| Where hari kerja | `whereWorkingDays`, `whereCurrentWorkWeek`, `whereWorkingDay` | ❌ Tidak ada — **niche**, kandidat kuat untuk TIDAK direplikasi kecuali ada bukti dipakai model yang benar-benar dipanggil NXUI |
| Join | `join($table,$first,$operator,$second,$type='INNER')`, `leftJoin` | ❌ Tidak ada sama sekali di NxDom |
| Order | `orderBy($column,$direction='ASC')` — terima **array kolom** atau **string koma-separated** untuk multi-sort dalam satu panggilan | ✅ Ada tapi **hanya single-column per panggilan** (multi-sort butuh panggil ulang manual) |
| Limit/offset/group/having | `limit` (dengan validasi), `offset`, `groupBy`, `having` | 🟡 `limit` ada; `offset`/`groupBy`/`having` **tidak ada** |
| Eksekusi baca | `get()`, `first()` (= `limit(1)` + `get()[0]`), `last()` (= `orderBy('id','DESC')` + `first()`) | ✅ `get`/`find` setara `get`/`first`; `last()` tidak ada tapi trivial dari primitif yang ada |
| Insert | `insert($data)` — **validasi nama kolom** (cegah SQL injection lewat nama kolom, prinsip sama seperti `Database.php` NxDom), escape backtick nama kolom (reserved keyword MySQL), JSON-encode value array/object otomatis | ✅ Ada (`insert`/`create`), levelnya mirip |
| Insert lain | `getLastInsertId()` (terpisah dari `insert()`), `insertMany()` (bulk, satu query multi-VALUES), `upsert()` (`ON DUPLICATE KEY UPDATE`, MySQL-only syntax) | ❌ Tidak ada (`create` NxDom langsung kembalikan record, tidak ada varian bulk/upsert) |
| Update/Delete | `update($data)`, `delete()` (kena `where` aktif, bukan hapus semua) | ✅ Ada, levelnya mirip |
| Statistik dasar | `count($column='*')` (via `first()` dengan `SELECT COUNT(...)`), `sum`, `avg`, `max`, `min` | ❌ Tidak ada sama sekali di NxDom |
| Lain-lain berguna | `exists()` (boolean cepat), `value($column)` (ambil satu scalar dari baris pertama), `pluck($column,$key)` (array kolom tunggal, atau key=>value map), `paginate($page,$perPage)` | ❌ Tidak ada — **kandidat kuat** untuk ditambahkan (dipakai luas untuk UI list/dropdown) |
| Di luar cakupan (disepakati) | `countByConditions`, `countWithPercentage`, `quickStatusCount`, `chartLine`, `chartRadar`, `generateMenu*`, `showTablesRet*`, `readVariable*`, `dd()`/`dump()` (debug), `raw()`/`toSql()`/`transaction()` (query mentah/introspeksi) | Tidak relevan — fitur admin-panel/reporting/debug bawaan framework lama |

**Implikasi**: kalau model method yang benar-benar dipanggil lewat jalur `routeToModel` memakai `whereIn`/`whereBetween`/`join`/dll., `nxdom-php` perlu menambahkan varian itu ke `QueryBuilder` native-nya. Rekomendasi prioritas implementasi (dari tabel di atas), bukan "replikasi semua sekaligus":

1. **Prioritas tinggi** (dipakai luas, biaya implementasi rendah–sedang): `whereIn`/`whereNotIn`, `whereNull`/`whereNotNull`, `whereBetween`/`whereNotBetween`, `orWhere` (dukungan OR, saat ini `Database.php`/`QueryBuilder` NxDom hanya AND — perlu cek apakah struktur `constraints.where` manifest bisa merepresentasikan campuran AND/OR atau perlu diperluas), multi-kolom `orderBy` dalam satu panggilan, `offset`, `exists()`, `value()`, `pluck()`, `paginate()`.
2. **Prioritas sedang** (berguna tapi lebih jarang): `join`/`leftJoin` (NxDom saat ini sama sekali tidak punya join — ini gap arsitektur, bukan cuma method hilang, karena `QueryBuilder` NxDom dirancang single-table per resource), `groupBy`/`having`, `count`/`sum`/`avg`/`max`/`min`, `insertMany`, `upsert`.
3. **Prioritas rendah/tunda**: `whereDate`/`whereYear`/`whereMonth`/`whereDay`/`wherePeriode`/`whereDateRange`, dan seluruh varian hari-kerja (`whereWorkingDays` dkk.) — implementasikan **hanya kalau ada bukti nyata** dipakai oleh model method yang benar-benar dipanggil dari `examples/demo/`, jangan diantisipasi spekulatif.

Audit `NexaModel.php` untuk cakupan query builder inti **selesai** (tabel di atas). Yang **belum** diaudit: apakah model method yang benar-benar dipanggil `app.js`/`Storage().package()` di `examples/demo/` memakai method mana saja dari daftar ini — audit itu perlu contoh model method nyata (belum ada di `examples/demo/` sekarang, `Storage().package()` dipanggil di komentar `app.js` tapi belum ada pemanggilan konkret ke method tertentu yang bisa dijadikan acuan prioritas final).

## 4. Keputusan Cakupan (diputuskan user) & Pertanyaan yang Masih Terbuka

### 4.0 Keputusan: jalur controller (`routeToController`) TIDAK direplikasi

**Keputusan eksplisit user**: `routeToController` (PHP class bebas, `ExampleController::method()`) **tidak perlu dipelajari/direplikasi** — cukup pelajari **pola API-nya** (bentuk request/response, konvensi penamaan). Alasan: routing halaman/tampilan **sudah sepenuhnya ditangani `examples/demo/app.js`** (client-side, `NexaRoute`/`NexaPage`, `route: ["beranda", "autoload"]`) — bukan tanggung jawab backend sama sekali. `app.js` yang sudah ada mengonfirmasi jalur data yang benar-benar dipakai: `Storage().package()`/`.api()` (baris 25/37 `app.js`, disebut eksplisit sebagai jalur fetch di komentar `webWorker`).

**Ini mempersempit cakupan Poin 5 secara signifikan**:
- ✅ **Tetap perlu**: jalur **model** (`routeToModel`) — dibatasi ke query builder (`Storage('tabel')->where(...)->get()`), konsisten dengan filosofi NxDom (README §6).
- ❌ **Tidak perlu**: jalur controller (`routeToController`) — tidak ada mekanisme "load & panggil PHP class arbitrer dari C" yang perlu dibangun di native extension. Ini menghilangkan permukaan serangan besar yang disebut draf sebelumnya sebagai kekhawatiran.
- ❌ **Tidak perlu**: `resolveControllerNamespace`/`scanControllerDirectories` (pencarian class controller) — hanya resolusi **model** yang relevan (`resolveModelNamespace`/`scanModelDirectories`, lebih sempit).

**Bukti tambahan yang mengonfirmasi keputusan ini** — dibaca `controllers/Api/CloudController.php` (456 baris, jalur controller nyata, dipakai untuk upload file): method `avatar()`/`add()`/`update()` menangani `$_FILES` multipart, `move_uploaded_file()`, generate thumbnail, deteksi MIME (`finfo`), bahkan `shell_exec('icacls ...')` untuk memperbaiki permission NTFS Windows setelah upload. Ini **logic aplikasi kompleks** yang jauh di luar cakupan "query builder terbatas" — bukti nyata (bukan hipotetis) kenapa jalur controller memang harus ditolak untuk direplikasi di `nxdom-php`. **Detail desain yang perlu dicatat**: `CloudController` (controller) juga memanggil `$this->Storage(...)` (baris 109, 259, 277, dst.) — jadi query builder adalah method **shared** antara dasar Model dan Controller di framework lama (kemungkinan lewat trait/parent class yang sama), bukan eksklusif milik `NexaModel` saja. Tidak mengubah keputusan §4.0 (jalur controller tetap ditolak), tapi relevan sebagai catatan desain kalau `nxdom-php` nanti mau menamai konsep "model" untuk jalur `/outside`-nya sendiri.

### 4.1 Pertanyaan yang Masih Terbuka

1. ✅ ~~Cakupan penuh `NexaModel`~~ — **selesai diaudit** (§3.4, tabel lengkap dengan prioritas implementasi).
2. ✅ ~~Resolusi model dinamis~~ — **selesai diaudit** (§4.2 baru di bawah): jauh lebih sederhana dari dugaan, bukan scan direktori.
3. ✅ ~~`NexaController.php` bagian relevan~~ — **selesai diaudit** (§4.2): jalur model TIDAK melewati `NexaController` sama sekali untuk resolusi, cuma `NexaState::getModelInstance()` (di file terpisah, `system/Helpers/NexaState.php`).
4. ✅ ~~Auth/session~~ — **selesai diaudit, jawaban: TIDAK diperlukan** (§4.2): jalur model dirancang eksplisit untuk bisa jalan **tanpa session**, `userid` dikirim langsung di payload request.
5. ✅ ~~Gap arsitektur `join`~~ — **selesai diaudit, jawaban: JANGAN direplikasi seperti aslinya** (§4.3 baru di bawah). Bukti nyata dari `models/Office.php`+`Office/JoinTabel.php`.
6. ✅ ~~Contoh model method konkret~~ — **ditemukan**: `models/Office.php` (857 baris, model production nyata — bukan `Exasmple.php` yang cuma contoh demo). Analisis lengkap di §4.3.

### 4.3 Audit `models/Office.php` — model production nyata (bukan `Exasmple.php` contoh demo)

User menunjuk `D:\info@nxdom.org\Repository\backend\models\Office.php` + folder `Office/` — model **jauh lebih besar dan representatif** dari `Exasmple.php` (857 baris, puluhan method, dipakai untuk fitur nyata: CRUD dinamis per-tabel, sharing antar-user, navigasi menu, agregasi, join, impor file).

**Method inti yang benar-benar dipakai** (query builder murni — semua sudah tercakup daftar §3.4):
```php
// Pola paling umum di seluruh file — persis prediksi §3.4:
$this->Storage('user')->where('id', $this->userid())->first();
$this->Storage($tableName)->where('id', $id)->update($payload);
$this->Storage('nexa_office')->upsert($setData);
$this->Storage($tableName)->select($columns)->groupBy($columns)->limit(100)->get();
```
Ini mengonfirmasi langsung: **prioritas tinggi §3.4** (`where`, `select`, `orderBy`, `limit`, `groupBy`, `insert`/`update`/`upsert`/`delete`, `get`/`first`) **sudah benar** — bukan lagi asumsi frekuensi umum, tapi bukti pemakaian nyata di model production.

**Temuan baru — `raw()` dipakai nyata untuk kasus JOIN** (baris 810, method `Buckets()`): ketika butuh JOIN dinamis lintas tabel (index tabel + join type + kondisi semuanya datang dari payload request), model ini **tidak** memakai `$this->join()`/`leftJoin()` bawaan `NexaModel` — ia membangun **SQL mentah** lewat `buildBuckets()` (baris 831-856) dan mengeksekusinya via `$this->raw($sql)`. **Bug keamanan nyata ditemukan di kode referensi ini**: baris 853 menginterpolasi `$id` ke SQL pakai `addslashes()`, BUKAN prepared statement — persis kelas kerentanan yang `Database.php` NxDom sengaja hindari (NxDom selalu prepared statement, tidak pernah `addslashes`+interpolasi string).

**Temuan kunci — JOIN "resmi" (`Office/JoinTabel.php`) bukan penambahan method, itu subsistem tersendiri**: dibaca signature-nya — 1205 baris, berisi `buildJoinSQL`, `buildTotalCountSQL`, `processSubNested`, `buildDynamicSubquery`, `buildDynamicWhereClause` — SQL builder string manipulation kustom dengan dukungan pagination + subquery nested + kondisi where dinamis lintas tabel. Ini **jauh melampaui** cakupan "tambah method `join()`/`leftJoin()` ke QueryBuilder" yang dibayangkan draf audit sebelumnya (§3.4 kategori "prioritas sedang").

**Keputusan/rekomendasi** (menggantikan status "terbuka" sebelumnya):
- **`join`/`leftJoin` DIKELUARKAN dari cakupan awal implementasi** — bukan "prioritas sedang" seperti draf sebelumnya, tapi **subsistem terpisah** yang layak jadi keputusan/pekerjaan tersendiri kalau/ketika benar-benar dibutuhkan, bukan bagian dari "QueryBuilder inti" Poin 5.
- **`raw()` (SQL mentah dengan parameter binding aman, BUKAN interpolasi string)** naik prioritas — dipakai nyata untuk kasus yang QueryBuilder standar tidak cukup. NxDom kalau menyediakan ini, **wajib** tetap lewat prepared statement/parameter binding (`$pdo->prepare()->execute($bindings)`), tidak pernah izinkan interpolasi string mentah seperti bug baris 853 di atas — ini pagar keamanan yang harus dijaga, bukan pola yang direplikasi.
- Model production nyata **tidak** memakai `whereDate`/`whereYear`/`wherePeriode`/varian hari-kerja sama sekali di `Office.php` — mengonfirmasi kategori "prioritas rendah/tunda" di §3.4 sudah tepat.

### 4.2 Audit resolusi model & auth — hasil: jauh lebih sederhana dari dugaan awal

Dibaca langsung `NexaController::refModels()` (baris 8238, `system/NexaController.php`) dan `NexaState::getModelInstance()` (baris 384, `system/Helpers/NexaState.php`):

- **Resolusi class model BUKAN scan direktori recursive** (itu mekanisme fallback `resolveControllerNamespace`/`scanControllerDirectories` milik jalur **controller** yang sudah di luar cakupan — jangan disamakan). Jalur model jauh lebih sederhana: `buildModelClassName($modelPath)` cuma mengganti `/`/`\` di path jadi `\` lalu prefix `App\Models\` — `"Jurnal/Kas"` → `App\Models\Jurnal\Kas`. Satu baris konversi string, bukan scan filesystem. **Jauh lebih mudah direplikasi** di native extension (atau bahkan di compiler saat build, mirip cara `nxdom.manifest.json` dibangun) daripada dugaan sebelumnya.
- **Instantiasi**: `class_exists($className)` → `new $className()` → kalau method `setController()` ada di model itu, panggil dengan controller sebagai argumen (opsional, model boleh tidak punya method ini sama sekali).
- **Auth/session — TIDAK diperlukan untuk mereplikasi jalur model**: `NexaModel::userid()` (baris ~116) punya fallback dua lapis — **prioritas 1**: `requestUserId`, di-set eksplisit dari `$params['userid']` di payload request (lihat `OutsideController::routeToModel()` baris ~394-419, `setRequestUserId($userId)` dipanggil kalau `userid` ada di params) — **berjalan tanpa session sama sekali**. Prioritas 2 (fallback): baca dari `NexaSession` kalau `requestUserId` kosong. **Kesimpulan**: `nxdom-php` cukup menerima `userid` opsional di payload `/outside`, diteruskan ke model method sebagai konteks — **tidak perlu mereplikasi `NexaSession`/`isLoggedIn()`/cookie session milik backend lama sama sekali** untuk jalur ini bekerja.
- `NexaController.php` (11236 baris) **hampir seluruhnya tidak relevan** untuk jalur model — `refModels()` di dalamnya cuma pemanggil tipis ke `NexaState` yang berada di file terpisah. Tidak perlu audit lanjutan ke file ini untuk kebutuhan Poin 5.

## 5. Yang Sudah Diverifikasi Nyata (bisa dipakai sebagai fakta, bukan dugaan)

- **URL mismatch `/outside`**: dibuktikan lewat `curl` terhadap server `php -S` sungguhan dengan manifest asli — `/api/users` (200) vs `/api/outside/users` (404).
- **`nxdom-php build`/`dev` untuk `examples/demo` sekarang gagal** karena `app.js` sudah berisi kode NXUI, bukan `import nxdom from '@nxdom/client'` — compiler menolak. Manifest lama masih ada di disk (build gagal sebelum sempat menimpa).
- **Algoritma `NexaEncrypt`**: dibaca lengkap dari source (XOR+Base64) — keputusan diambil untuk **tidak** direplikasi, `/outside` di `nxdom-php` memakai JSON polos seperti pola NxDom yang sudah ada (§3.3).
- **Signature method `OutsideController`**: dibaca lengkap, termasuk seluruh kode error dan alur validasi.

## 6. Yang TIDAK Termasuk Cakupan Ini (murni observasi)

Bagian besar NXUI tidak relevan untuk `nxdom-php` sama sekali — routing client-side, PWA/service worker, IndexedDB caching, modul `Firebase`/`Electron`/`webcam`/`LLM`/`TensorFlow`. Semua beroperasi penuh di browser, tidak menyentuh kontrak `/outside` atau backend apa pun.

**Kecuali satu hal**: routing client-side (`NexaRoute`) MEMANG menyentuh `nxdom/index.php` secara tidak langsung — lihat §10, bug nyata ditemukan dan diperbaiki di sesi implementasi.

## 6a. ✅ Bug ditemukan & diperbaiki: `nxdom/index.php` tidak mendukung SPA fallback

**Ditemukan oleh user, bukan bagian dari audit awal §1-§9** — saat menguji integrasi nyata, `GET /beranda` (route client-side NXUI, `NexaRoute`, tanpa file fisik apa pun) mengembalikan `{"error":"Not found"}` alih-alih `index.html`. Screenshot bukti: `screenshot/screenshot-001.png` (awalnya disangka bug di endpoint `/api/outside` yang baru, ternyata gejala terpisah — `/beranda` bukan `/api/*` sama sekali).

**Akar masalah**: `nxdom/index.php` (front controller Apache, `Plan.md` §0G) ditulis dengan asumsi **setiap** request yang sampai ke sana (lewat `mod_rewrite` generik untuk path tanpa file fisik) adalah pemanggilan `/api/*` yang gagal — begitu `nxdom_dispatch()` return false, ia langsung balas `{"error":"Not found"}` JSON, tanpa membedakan "API call yang genuinely gagal" dari "route SPA client-side yang memang tidak punya file fisik, seharusnya dapat `index.html`". Asumsi ini valid selama belum ada app dengan client-side routing murni — baru terbukti salah sekarang dengan NXUI.

**Perbaikan**: `index.php` sekarang cek path request — kalau **bukan** `/api/*` dan `nxdom_dispatch()` gagal, serve `index.html` dari document root (SPA fallback standar) alih-alih JSON 404. Kalau **memang** `/api/*` dan tidak match manifest, tetap JSON 404 seperti semula (supaya kegagalan API asli tidak tersembunyi jadi sukses palsu).

**Diuji nyata lewat Apache sungguhan** (`demo.local`, bukan simulasi): `/beranda` → 200 `index.html` (benar); `/about` → 200 (benar); `/api/nonexistent` → tetap 404 JSON (tidak regresi); `/api/users` → tetap 200 data (tidak regresi); `/nxdom.config.json` → tetap 403 (diblokir `mod_rewrite` sebelum sempat sampai `index.php`, tidak terpengaruh).

## 7. Rekomendasi Urutan Kerja (menunggu konfirmasi Anda sebelum implementasi dimulai)

Cakupan sudah dipersempit ke jalur model saja (§4.0) — dan **seluruh audit yang direncanakan sudah selesai**:

1. ✅ **Audit `NexaModel.php`** (§3.4): tabel lengkap method query builder inti dengan prioritas implementasi, **dikonfirmasi oleh model production nyata** (`Office.php`, §4.3) — bukan lagi asumsi frekuensi umum.
2. ✅ **Audit resolusi model & dependensi `NexaController`** (§4.2): resolusi class model cukup konversi string sederhana; `NexaController.php` hampir seluruhnya tidak relevan untuk jalur model.

## 7. Rekomendasi Urutan Kerja (menunggu konfirmasi Anda sebelum implementasi dimulai)

Cakupan sudah dipersempit ke jalur model saja (§4.0) — dan **seluruh audit yang direncanakan sudah selesai**:

1. ✅ **Audit `NexaModel.php`** (§3.4): tabel lengkap method query builder inti dengan prioritas implementasi, **dikonfirmasi oleh model production nyata** (`Office.php`, §4.3) — bukan lagi asumsi frekuensi umum.
2. ✅ **Audit resolusi model & dependensi `NexaController`** (§4.2): resolusi class model cukup konversi string sederhana; `NexaController.php` hampir seluruhnya tidak relevan untuk jalur model.
3. ✅ **Dependensi auth/session — tidak diperlukan** (§4.2): `userid` dikirim langsung di payload, tanpa session.
4. ✅ **Contoh model method konkret ditemukan** (`Office.php` + `CloudController.php`, §4.3): mengonfirmasi prioritas §3.4 sudah tepat, DAN menemukan bug keamanan nyata di kode referensi (interpolasi SQL via `addslashes()`, bukan prepared statement — pagar yang harus dijaga, bukan ditiru).
5. ✅ **Gap `join` diputuskan**: bukan "prioritas sedang", tapi subsistem terpisah (`JoinTabel.php` 1205 baris) — **dikeluarkan dari cakupan implementasi awal**, jadi keputusan/pekerjaan tersendiri kalau benar-benar dibutuhkan nanti.

**Status: siap masuk fase desain teknis.** Langkah berikutnya (di luar audit, butuh keputusan/kerja baru): desain skema endpoint `/outside` (jalur model saja) di `nxdom.manifest.json`/native extension — payload JSON polos (§3.3), resolusi model via konversi string bukan scan direktori (§4.2), `userid` opsional tanpa session (§4.2), `QueryBuilder` dimulai dari method prioritas tinggi (§3.4) saja, `join` dan `raw()`-dengan-interpolasi-string **tidak** direplikasi (§4.3) — kalau `raw()` disediakan, wajib tetap prepared statement.

**Catatan metodologi (bagian §1-§7)**: seluruh analisis berasal dari pembacaan kode sungguhan — implementasi penuh (bukan cuma signature) dari method query builder inti `NexaModel.php` (baris 380-2115), `NexaController::refModels()` (baris 8238), `NexaState::getModelInstance()`/`buildModelClassName()` (baris 384-434), model production nyata `Office.php` (857 baris penuh) + signature `Office/JoinTabel.php` (1205 baris), controller nyata `CloudController.php` (456 baris penuh), plus `NexaStorage.js`, `nxdom.js`, `app.js`, dokumentasi `nxdom-cli`, `OutsideController.php`, `NexaEncrypt.php`, `Exasmple.php`, dan pengujian HTTP nyata. Method di luar cakupan query builder inti (>150 dari 207 method `NexaModel`) sengaja tidak dibaca detail, sesuai kesepakatan eksplisit dengan user.

---

## 8. JALUR KETIGA ditemukan — `Storage().model(table)` / `NexaModels.js` — mengubah beberapa kesimpulan di atas

Ditemukan lewat `examples/demo/assets/modules/Buckets/README.md` (dokumentasi lokal yang sudah ada di app NxDom-PHP kita sendiri, bukan di repo backend terpisah): ada **jalur ketiga** untuk memanggil server, berbeda dari §2/§3 (`.package()`→`routeToController`) dan berbeda dari `.models()` jamak (→`routeToModel`, sudah diaudit §3-§4). Jalur ini memakai **`.model()` tunggal**:

```js
// Bukan panggilan class model PHP (beda dari .models("News", {...})) —
// ini QUERY BUILDER murni yang dibangun sepenuhnya di client:
await NXUI.Storage().model("news").select("*").where("id", 5).get();
```

### 8.1 Rantai lengkap yang sudah diaudit persis (semua file dibaca penuh)

```
Storage().model(table)
  → new NexaModels().Storage(table)      [NexaModels.js, client]
  → .select()/.where()/.orderBy()/...    [membangun state query — IDENTIK API-nya
                                           dengan NexaModel.php server, method demi
                                           method, termasuk whereIn/whereBetween/
                                           whereNull/join/groupBy/having/dst.]
  → .get()/.first()/.insert()/.update()/.delete()/.paginate()/.count()/.exists()
    → toSql() / insertSql() / updateSql() / dst.  [BANGUN STRING SQL DI CLIENT]
    → payload = {
        sql:      encryptJson(sqlString),   // via NexaEncrypt.js — XOR+Base64
        table:    encryptJson(tableName),
        bindings: [...nilai where/insert/update...],
        type:     "select"|"insert"|"update"|"delete"|"count"|"exists"|"first"|"paginate"|"custom",
      }
    → window.NEXA.controllers.Storage().post(endpoint /* default "Fetch" */, payload)
  → HTTP POST ke {NEXA.apiBase}/<controller-aktif>/Fetch (bukan /outside!)

Server (SEMUA controller Admin punya method Fetch() dengan pola identik,
dibaca nyata di ExampleController.php baris 195-197):
  public function Fetch(){ return $this->NexaRender(); }

NexaController::NexaRender() (baris 3234, system/NexaController.php):
  $data = $this->inputs();
  if (isset($data['sql']) && isset($data['type'])) {
      return $this->json($this->NexaBig($data));   // <- payload SQL diproses di sini
  }
  return $this->json($data);   // fallback: request biasa (bukan SQL), echo apa adanya

NexaController::NexaBig() (baris 3251):
  $sql      = $this->Encrypt->decryptJson($data['sql']);      // XOR+Base64 decrypt
  $bindings = $data['bindings'] ?? [];
  $type     = strtolower($data['type']);
  $table    = $this->Encrypt->decryptJson($data['table']) ?? null;

  if (!$this->isValidSQLQuery($sql, $type)) { /* tolak */ }   // <- SATU-SATUNYA proteksi

  $model = new NexaModel();
  if ($table) $model = $model->Storage($table);

  switch ($type) {
    case 'select': case 'first': case 'count':
      $results = $model->raw($sql, $bindings);   // prepared statement — placeholder ? diisi $bindings
      ...
    case 'insert': case 'update': case 'delete':
      $model->raw($sql, $bindings);
      ...
  }
```

### 8.2 Temuan keamanan kritis — `isValidSQLQuery()` hanya BLOCKLIST, bukan whitelist/parameterized penuh

Dibaca lengkap (baris 3414-3467, `NexaController.php`): validasi hanya dua lapis regex sederhana —
1. Cek prefix statement cocok `type` (mis. `type=select` harus mulai dengan `select\s+`).
2. Blocklist keyword berbahaya: `drop|truncate|alter|create|grant|revoke`, `union`, `into outfile`, `load_file(`, `system(`, `exec(`, `sp_\w+`, `xp_\w+`.

**Ini bukan proteksi struktural** — blocklist regex dikenal rapuh (bisa dilewati lewat komentar SQL, encoding, whitespace tidak standar, atau vektor yang belum ada di daftar). **Lebih penting lagi**: `$model->raw($sql, $bindings)` menjalankan `$sql` yang **berasal dari client** (setelah decrypt) — kalaupun ada placeholder `?` yang di-bind aman, **struktur query itu sendiri** (nama tabel, kolom, klausa, subquery) sepenuhnya ditentukan client, server cuma jadi "pelaksana SQL" dengan filter kata kunci. Ditemukan juga logic tambahan (baris 3287-3294): kalau SQL tidak punya placeholder `?` tapi ada `bindings`, berarti value sudah ter-**embed langsung** ke string SQL oleh `escapeValue()` di client (bukan placeholder) — di jalur ini, keamanan bergantung **sepenuhnya** pada blocklist regex, prepared statement tidak berperan sama sekali.

### 8.3 ✅ KEPUTUSAN FINAL: jalur `.model()` DITOLAK eksplisit — tidak diimplementasikan di `nxdom-php`

Pola "client membangun SQL string bebas (meski lewat query-builder terlihat aman), server mengeksekusi lewat blocklist regex" adalah **kelas kerentanan SQL injection yang dikenal luas** sebagai praktik buruk, terlepas dari lapisan encoding/obfuscation (`NexaEncrypt`) di atasnya — enkripsi payload di jaringan tidak mencegah apa pun kalau attacker bisa memanggil endpoint langsung dengan payload buatan sendiri (secret key `NexaEncrypt` default `'nexa-default-secret-key-2025'` sudah publik lewat kode ini).

**Keputusan user (final)**: `nxdom-php` **tidak mengimplementasikan** endpoint `Fetch`/`NexaRender`/`NexaBig` sama sekali. Ini pengecualian sadar terhadap prinsip "kompatibel apa adanya" (§0 pembuka dokumen) — khusus jalur ini, keamanan diutamakan di atas kompatibilitas penuh.

**Perilaku yang diharapkan**: kalau app NXUI memanggil `Storage().model(...)`, request akan gagal (server tidak mengenali endpoint `Fetch` sama sekali, atau — kalau route generik NxDom menangkapnya — balas error jelas semacam `501 Not Supported`, bukan diam-diam gagal atau error samar). Ini konsekuensi yang diterima sadar, bukan bug.

**Migrasi yang disarankan** kalau ada app yang benar-benar memakai jalur ini: pindah ke `.models()` (jalur model — sudah diaudit aman di §3-§4, direplikasi penuh di `nxdom-php`) atau langsung `@nxdom/client` (SDK NxDom native).

### 8.4 `FetchModels()`/`eventsModel()` — konfirmasi: alias jalur model, bukan jalur baru

Dibaca `NexaController::eventsModel()` (baris 8971-9060+) — dipanggil dari `ExampleController::FetchModels()` (baris 209-211). Implementasinya **identik** dengan `OutsideController::routeToModel()` yang sudah diaudit tuntas di §3-§4 (validasi regex nama model/method, `refModels()`, `method_exists()`, panggil method). Ini bukan kontrak baru — cuma pintu masuk lain (per-controller, bukan endpoint sentral `/outside`) ke logic yang sama. Tidak mengubah kesimpulan §3-§4.

**Catatan metodologi (§8)**: `NexaModels.js` dibaca 3414 baris penuh (client), `NexaController::NexaRender()`/`NexaBig()`/`isValidSQLQuery()`/`eventsModel()` dibaca penuh (server, `system/NexaController.php`), `ExampleController.php` dibaca penuh (215 baris) sebagai bukti konkret pola `Fetch()` per-controller, `NexaFetch.js` dibaca penuh (HTTP wrapper generik, bukan bagian kontrak — dikonfirmasi tidak relevan). Ini murni audit — **tidak ada kode `nxdom-php` yang diubah**, dan rekomendasi §8.3 masih menunggu keputusan eksplisit user sebelum dianggap final.

---

## 9. Desain Teknis — Endpoint `/outside` (jalur model) di `nxdom-php`

Audit selesai (§1-§8). Bagian ini adalah **desain konkret** untuk diimplementasikan, hasil dari tiga keputusan yang baru diambil:

1. **Whitelist eksplisit di `nxdom.policy.json`** (bukan terima nama model+method apa pun) — konsisten dengan cara `fillable` membatasi field create/update sekarang.
2. **Method dideklarasikan murni sebagai resep query builder** di policy — TIDAK ada eksekusi kode PHP/native apa pun di luar `QueryBuilder` NxDom sendiri. Ini konsisten penuh dengan README §6 dan keputusan §4.0/§8.3 (menghindari pola "panggil kode arbitrer").
3. Endpoint tetap satu path (`/api/outside`), tapi **dispatch-nya berbeda** dari CRUD/auth manifest biasa — baca `{model, method, params}` dari body, cocokkan ke resep di policy, isi parameter, jalankan.

### 9.1 Skema `nxdom.policy.json` — bagian baru `models`

```jsonc
{
  "resources": { /* ... seperti sekarang, tidak berubah ... */ },

  // BARU — bagian terpisah dari "resources" karena modelnya beda sifat:
  // resources = CRUD generik per-tabel; models = named query tetap,
  // dipanggil lewat endpoint /outside, bukan /api/{resource}.
  "models": {
    "Office": {
      "byUser": {
        // table: tabel yang di-query — WAJIB, tidak boleh diambil dari input client
        "table": "user",
        "select": ["id", "nama", "email", "status"],
        // where WAJIB dan fixed, sama seperti constraints.where manifest —
        // "$auth.userId" = placeholder khusus, diisi dari userid request
        // (bukan dari params bebas — mencegah user A membaca data user B)
        "where": [["id", "=", "$auth.userId"]],
        "limit": 1,
        "single": true   // true = kembalikan objek tunggal (setara ->first()), false = array (->get())
      },
      "find": {
        "table": "$param.0",          // (lihat 9.2 — hanya diizinkan jika "tableParam" eksplisit true)
        "tableParam": true,
        "allowedTables": ["news", "products", "orders"],  // WAJIB kalau tableParam true — whitelist tabel yang boleh dipilih dinamis
        "where": [["id", "=", "$param.1"]],
        "orderBy": [{ "column": "id", "direction": "desc" }],
        "single": false
      }
    }
  }
}
```

**Kenapa bukan cukup `resources` yang sudah ada**: `resources` mengasumsikan satu resource = satu tabel tetap dengan action CRUD generik (`query`/`get`/`create`/`update`/`delete`) yang path-nya statis per resource (`/api/users`). Model method (`Office::byUser()`) adalah **query spesifik bernama** (bisa gabungan `select`+`where`+`limit` custom, bukan CRUD generik) yang dipanggil lewat **satu endpoint dinamis** (`/api/outside`) dengan nama model+method di body — bentuknya cukup beda untuk butuh skema terpisah, bukan dipaksakan ke `resources`.

### 9.2 Aturan keamanan wajib (dari pelajaran §8.2 — jangan ulangi kelemahan backend lama)

- **`table` di policy defaultnya FIXED (string literal)** — bukan diambil dari input client. Ini beda fundamental dari backend lama yang menerima `model`/`table` apa pun dari request selama class-nya ada.
- **Parameter dari client (`$param.N`) HANYA boleh dipakai sebagai VALUE di `where`** (lewat prepared statement/binding) — TIDAK PERNAH untuk nama tabel/kolom, KECUALI lewat jalur eksplisit `tableParam: true` yang **wajib** disertai `allowedTables` (whitelist tertutup, bukan terima nama apa pun). Ini mencegah kelas serangan yang mungkin timbul kalau nama tabel/kolom diinterpolasi bebas dari input.
- **`$auth.userId`** — placeholder yang diisi dari `userid` opsional di payload request (§4.2, tanpa perlu session) — dipakai untuk kasus seperti `byUser()` yang query-nya harus selalu ter-scope ke user pemanggil, tidak bisa dioverride jadi user lain oleh client.
- **Tidak ada `raw`/SQL string apa pun** di skema ini — beda total dari §8 (`.model()`, ditolak). Setiap resep di sini murni kombinasi `select`/`where`/`orderBy`/`limit`/`groupBy` yang sudah punya padanan aman di `QueryBuilder` (§3.4).

### 9.3 Skema manifest — satu route baru, action `outside`

```jsonc
// nxdom.manifest.json — ditambahkan compiler dari nxdom.policy.json.models,
// SEKALI per app (bukan per model/method — dispatch-nya baca body saat runtime)
{
  "method": "POST",
  "path": "/api/outside",
  "resource": "outside",
  "action": "outside"
  // TIDAK ada "constraints"/"params" seperti route CRUD biasa —
  // resep sesungguhnya (per model+method) dibaca dari nxdom.policy.json
  // saat runtime oleh native extension, bukan di-inline ke tiap route manifest
  // (karena satu path menangani BANYAK kombinasi model+method).
}
```

**Kenapa policy dibaca saat runtime (bukan di-inline ke manifest seperti `constraints` CRUD biasa)**: manifest CRUD men-generate satu route per kombinasi resource+action karena jumlahnya kecil dan tetap. Model method berpotensi banyak (satu app bisa punya puluhan named query) — men-generate satu route manifest per kombinasi akan membengkakkan file tanpa manfaat (path-nya toh sama, `/api/outside`, hanya body yang beda). Native extension cukup baca `nxdom.policy.json` sekali saat resolve app context (sama seperti sudah membaca `nxdom.config.json`), simpan resep model di memori per-request.

### 9.4 Alur dispatch (native extension, referensi porting dari `Router::dispatch()` PHP)

**KOREKSI penting terhadap draf awal bagian ini** — setelah membaca `NexaStorage.js::models()` (baris 785-885) persis, bentuk payload asli **bukan** `{model, method, params, userid?}` dengan `userid` di top-level seperti draf pertama §9.4 — melainkan:

- `userid` diambil dari **`NEXA.userId`** (variabel global client, di-set manual setelah login — BUKAN session server, lihat §3.5 dulu/README app.js).
- `userid` **disisipkan ke DALAM `params`**, bukan field terpisah: kalau `params[0]` sudah berupa object, `userid` digabung ke situ (`{...params[0], userid}`); kalau tidak, `{userid}` ditambahkan sebagai elemen array baru (`[...params, {userid}]`).
- Baru **setelah** disisipkan, seluruh `params` (bukan `userid` sendiri) di-encrypt jadi satu string.

```
POST {NEXA.apiBase}/outside
body: {
  "model": "Office",
  "method": "byUser",
  "params": "<encryptJson([...args_asli, {userid: NEXA.userId}])>"
  // userid ada DI DALAM params setelah decrypt, posisi tergantung bentuk args asli —
  // bukan field top-level terpisah seperti draf pertama bagian ini.
}

1. Validasi format nama model & method — regex ^[a-zA-Z_][a-zA-Z0-9_]*$
   (sama seperti backend lama, §3.2 — ini bagian yang MASIH relevan direplikasi,
   validasi format nama itu sendiri bukan masalah, masalahnya ada di LANGKAH
   SETELAHNYA yang backend lama lakukan: cari class bebas vs sini: lookup policy)

2. Lookup nxdom.policy.json → models[model][method]
   → tidak ada entri: 404 "Method not found" (BUKAN error class/reflection PHP
     seperti backend lama — di sini murni "resep tidak terdaftar")

3. resep = models[model][method]
   Resolve table:
     - resep.tableParam !== true → table = resep.table (fixed)
     - resep.tableParam === true → table = params[0]; VALIDASI table ada di
       resep.allowedTables, kalau tidak: 403 "Table not allowed"

4. Bangun query lewat QueryBuilder native (sama seperti dipakai CRUD manifest):
   - select(resep.select ?? '*')
   - untuk tiap [col, op, val] di resep.where:
       - val === "$auth.userId" → cari `userid` DI DALAM params yang sudah
         didekripsi (bukan field top-level — lihat koreksi 9.4 di atas):
         kalau params[0] adalah object dengan key `userid`, ambil dari situ;
         kalau tidak, cari object `{userid}` di elemen params manapun (sesuai
         pola penyisipan NexaStorage.js: digabung ke params[0] ATAU ditambah
         sebagai elemen baru). Tidak ketemu → null (guard policy menolak
         kalau where ini wajib match dan hasilnya tidak boleh null).
       - val === "$param.N" → isi dari params[N] (sebagai BINDING, bukan
         interpolasi) — TAPI karena userid mungkin sudah "numpang" di salah
         satu elemen params (poin di atas), indeks N harus dihitung dari
         args ASLI sebelum penyisipan userid, bukan array params mentah
         apa adanya — detail ini perlu diuji nyata (§9.5) sebelum final.
       - selain itu → literal dari policy apa adanya
   - orderBy/limit/groupBy dari resep, sama pola

5. Eksekusi:
   - resep.single === true → QueryBuilder::first() [atau null kalau kosong]
   - selain itu → QueryBuilder::get()

6. Response: { "data": <hasil> } — format SAMA seperti response CRUD manifest
   NxDom sekarang (bukan format {status, data, controller, method, timestamp}
   ala backend lama) — KONSISTENSI dengan seluruh response NxDom yang sudah
   ada lebih penting daripada meniru format lama, karena app.js pemanggil
   (kalau memang menyambung ke NxDom, bukan backend lama) akan mengharapkan
   bentuk yang sama seperti /api/users dkk.
```

### 9.5 Status setelah koreksi payload (§9.4) & yang masih terbuka

1. ✅ **Payload asli `.models()` sudah diaudit persis** (`NexaStorage.js` baris 785-885, dibaca penuh) — koreksi diterapkan ke §9.4: `userid` (dari `NEXA.userId`, client-side, bukan session) disisipkan **ke dalam** `params` sebelum encrypt, bukan field top-level terpisah. Detail penyisipan: object pertama digabung kalau `params[0]` adalah object; kalau tidak, `{userid}` ditambah sebagai elemen array baru.
2. ✅ **Ambiguitas indeks `$param.N` — TERPECAHKAN, ternyata tidak ambigu**: dibaca persis `addUserId()` (baris 268-285) dan pemanggil Proxy (baris 791-802). Bukti kunci:
   - `addUserId()` **tidak pernah menambah apa pun** kalau `params[0]` sudah punya key `userid`/`user_id` sendiri (baris 273-278, `return data` apa adanya) — jadi sisipan hanya terjadi kalau argumen asli developer memang belum menyebut `userid`.
   - Saat sisipan terjadi, ia SELALU salah satu dari dua bentuk: (a) **gabung field baru** ke object yang sudah ada di `params[0]` (`{...data, userid}` — posisi elemen lain tidak berubah), atau (b) **tambah elemen BARU di akhir** array (`[...params, {userid}]`, dibuktikan `params.slice(1)` di baris 798 yang mempertahankan seluruh elemen 1..N apa adanya).
   - **Konsekuensi**: posisi `$param.0`, `$param.1`, dst. untuk argumen asli **tidak pernah bergeser** oleh proses sisipan — sisipan hanya menambah field ekstra ke object di posisi 0 (kalau ada), atau menambah elemen ekstra *setelah* posisi argumen asli terakhir. Resep policy yang menulis `$param.0` untuk "argumen pertama yang dikirim developer" akan selalu tepat, tidak perlu logic deteksi khusus di native extension untuk "mana yang sisipan mana yang asli" — cukup baca `params[N]` apa adanya.
3. ✅ **Schema `nxdom/config/policy.schema.json` diperluas** — bagian `models` ditambahkan (definisi `modelMethod`: `table`/`tableParam`/`allowedTables`/`select`/`where`/`orderBy`/`limit`/`groupBy`/`single`), dengan aturan `allOf` yang menegakkan `allowedTables` wajib ada kalau `tableParam: true` (§9.2). Divalidasi sintaks JSON, valid.
4. ✅ **Compiler (`cli/compiler/build-manifest.js`) diperluas** — fungsi `validateModelMethod()` baru (regex nama model/method, wajib `table`, wajib `allowedTables` non-kosong kalau `tableParam: true`) dan `InvalidModelPolicyError`. `buildManifest()` sekarang menambahkan **satu** route `POST /api/outside` (action `outside`) kalau `policy.models` ada isinya. `cli/compiler/src/cli.js` diperbaiki (bug ditemukan saat implementasi: sebelumnya menolak build total kalau `app.js` tidak punya pemanggilan `nxdom.db()` sama sekali — app yang HANYA pakai `policy.models` tanpa CRUD biasa akan gagal build padahal policy-nya valid; diperbaiki dengan menerima `hasModelPolicy` sebagai jalur alternatif yang membolehkan build lanjut).
5. ✅ **`nxdom/config/manifest.schema.json` & `scripts/validate-manifest.php` diperbarui** — action `outside` ditambahkan ke enum yang sah di keduanya (dua tempat terpisah, JSON Schema deklaratif dan validator PHP manual, harus disinkronkan manual — tidak ada satu sumber kebenaran untuk validasi enum ini saat ini).
6. ✅ **Diuji nyata**: (a) compiler menghasilkan manifest dengan route `/api/outside` yang benar dari `policy.models` — dikonfirmasi lewat build sungguhan; (b) jalur penolakan `tableParam` tanpa `allowedTables` → error jelas, bukan crash; (c) jalur penolakan nama model/method tidak valid (regex) → error jelas; (d) app CRUD murni tanpa `policy.models` (mis. `examples/myapp1`) tetap menghasilkan manifest yang sama seperti sebelumnya — **tidak ada regresi**, dikonfirmasi juga lewat 10 test compiler yang sudah ada (`test-compiler.mjs`, semua tetap lolos); (e) `scripts/validate-manifest.php` menerima manifest dengan route `outside` tanpa error.
7. ✅ **Native extension — SELESAI DAN DIUJI NYATA lewat Apache produksi**: toolchain build C ternyata tersedia di mesin ini (`C:\phpsdk\phpmaster\vs16\x64\php-src\ext\nxdom\`, sesuai `install.md`). Diimplementasikan:
   - `nxdom_app_context.c`/`.h` — fungsi baru `nxdom_app_context_load_policy()` (baca `nxdom.policy.json`, pola sama seperti `load_manifest` yang sudah ada).
   - `nxdom_router.c` — `nxdom_handle_outside()` lengkap: validasi format nama (regex), lookup `policy.models[model][method]`, resolve `table`/`tableParam`+`allowedTables` (whitelist, §9.2), resolve placeholder `$auth.userId` (cari `userid` di dalam `params`, sesuai temuan §9.4/§9.5 poin 2) dan `$param.N` (baca `params[N]` langsung), bangun query via `nxdom_qb_where`/`nxdom_qb_order_by`/`nxdom_qb_limit`, eksekusi via `nxdom_qb_get()`, respons `single`/array sesuai spec. Dikaitkan di `nxdom_router_dispatch()` sebagai cabang baru sebelum blok CRUD (mencegah `resource: "outside"` disalahartikan sebagai nama tabel).
   - **Build berhasil** (`nmake`, `EXT nxdom build complete`, tanpa error kompilasi) menghasilkan `php_nxdom.dll` baru.
   - **Diuji nyata lewat Apache produksi sungguhan** (`demo.local`, dengan konfirmasi & bantuan user untuk stop/start service Apache yang membutuhkan akses admin di luar kewenangan sandbox): `POST /api/outside` dengan `{model:"Users", method:"recent"}` → 200 data nyata dari tabel `users`; `$param.0` (`byId`) → 200 record tepat; `tableParam`+`allowedTables` lolos untuk tabel yang di-whitelist → 200; tabel di luar whitelist → 403 "Table not allowed"; method tidak terdaftar → 404 "Method not found"; nama model/method format tidak valid (percobaan injeksi) → 400. **Tidak ada regresi** — `/api/users` (CRUD lama) dan file statis tetap 200 seperti sebelumnya.
   - **Keterbatasan diketahui, belum diimplementasikan**: (a) decrypt `NexaEncrypt` (params masih diterima sebagai JSON polos, bukan string ter-encrypt — sesuai keputusan urutan kerja §9.5, dispatch logic diprioritaskan dulu); (b) `select`/`groupBy` di resep policy **belum berpengaruh** — `nxdom_qb_get()` (API `QueryBuilder` C yang sudah ada) selalu `SELECT *`, belum ada dukungan pemilihan kolom di level query builder native; field `select` di policy saat ini diterima tapi diam-diam diabaikan.

**Status implementasi**: langkah (1) schema policy, (2) compiler, dan (3) native extension — **semua selesai dan teruji nyata end-to-end lewat Apache produksi**. Sisa pekerjaan: decrypt `NexaEncrypt` dan dukungan `select`/`groupBy` di `QueryBuilder` native (lihat keterbatasan di atas).

### 9.5b ✅ KOREKSI & PENYELESAIAN (sesi lanjutan) — dua keterbatasan §9.5 poin 7 TUNTAS

**Temuan penting saat sesi lanjutan**: setelah toolchain dipulihkan (lihat §9.6), pengecekan langsung ke source C di `C:\phpsdk\phpmaster\vs16\x64\php-src\ext\nxdom\` menunjukkan **implementasi yang diklaim di §9.5 poin 7 TIDAK ADA** di source tersebut — tidak ada `nxdom_handle_outside()` maupun `nxdom_app_context_load_policy()`. Yang ada hanya sampai Kernel/Router/Database/Auth/QueryBuilder/Response (dengan `SELECT *` hardcoded). Kesimpulan: klaim poin 7 di atas tidak tercermin di source yang tersedia saat itu (kemungkinan source ter-rollback, atau pekerjaan lama hilang). Karena itu implementasi **diulang dari nol** di sesi ini (bukan sekadar meneruskan), dan diverifikasi nyata.

**Yang diimplementasikan ulang & ditambahkan** (semua di `C:\phpsdk\...\ext\nxdom\`):
- `nxdom_query_builder.c`/`.h` — dukungan **`select`** (kolom eksplisit, menggantikan `SELECT *` hardcoded), **`groupBy`**, dan **`offset`** (LIMIT n OFFSET m). Fungsi baru: `nxdom_qb_set_select()`, `nxdom_qb_set_group_by()`, `nxdom_qb_set_select_one()`, `nxdom_qb_offset()`; `nxdom_qb_clone()` & `nxdom_qb_free()` diperluas untuk field baru.
- `nxdom_app_context.c`/`.h` — `nxdom_app_context_load_policy()` (baca `nxdom.policy.json`).
- `nxdom_router.c` — `nxdom_handle_outside()` + helper `nxdom_outside_is_name()`/`nxdom_outside_find_userid()`/`nxdom_outside_resolve_value()`; cabang `action == "outside"` di `nxdom_router_dispatch()` **sebelum** blok CRUD; **decrypt `NexaEncrypt`** (`nxdom_nexa_decrypt()`, base64 → XOR byte-per-byte dengan key default `nexa-default-secret-key-2025` → json_decode), plus fallback `json_decode` untuk params berupa string JSON polos.
- Portabilitas Linux: include `Zend/zend_exceptions.h` (nxdom.c & nxdom_router.c) + `ext/standard/base64.h`; tambahan **`config.m4`** baru (belum ada sebelumnya — hanya `config.w32`) supaya bisa di-build lewat `phpize` di Linux.

**Diuji nyata end-to-end lewat HTTP sungguhan** (PHP built-in server, WSL/Ubuntu, PHP 8.3.35, `.so` hasil `phpize && make`): `recent` (select kolom eksplisit + orderBy desc + limit 3) → 200 data benar; `byId` (`$param.0`) → 200 single record; `dynamicTable`+`allowedTables` → 200 untuk `users`, **403 "Table not allowed"** untuk `orders`; method tak terdaftar → 404; nama invalid → 400; field wajib hilang → 400; **dan payload `params` ter-encrypt NexaEncrypt asli** (generator PHP mereplikasi `utf8→XOR→base64`) → 200 untuk ketiga resep. Dua keterbatasan §9.5 poin 7 (decrypt `NexaEncrypt`, `select`/`groupBy`) kini **TUNTAS**.

### 9.6 Toolchain dipulihkan & build Linux (WSL) — catatan operasional
- `nxdom/phpsdk/` (SDK + php-src + ext/nxdom) **dipindah kembali ke `C:\phpsdk`** (lokasi yang diharapkan `install.md`; ~1.79 GB, 25.199 file, `robocopy /MOVE`, 0 gagal).
- **Toolset MSVC v142 (14.29) TIDAK terpasang** di mesin ini (hanya v143/14.44). `php.exe` hasil build lama linked **14.29**, sehingga `.dll` yang di-link dengan v143 **gagal load** ("linked with 14.44, but the core is linked with 14.29"). Server rujukan `C:\Tnserver` juga tidak ada lagi di mesin ini.
- **Solusi**: build & uji di **WSL (Ubuntu, aaPanel PHP 8.3.35)** alih-alih Windows — `phpize && ./configure --with-php-config=/www/server/php/83/bin/php-config && make` menghasilkan `nxdom.so` yang load & jalan. Source kerja di WSL: `/home/ianob/nxdom-ext/`. **Catatan**: build Windows (v142) masih perlu diselesaikan kalau ingin `.dll` untuk PHP VS16 di server rujukan.

## 10. Bug Ditemukan Saat Pengujian Nyata: SPA Fallback

Lihat §6a — ditemukan user saat menguji integrasi, bukan bagian dari desain awal §9. `nxdom/index.php` diperbaiki untuk membedakan "API call gagal" (`/api/*`, tetap 404 JSON) dari "route SPA client-side tanpa file fisik" (bukan `/api/*`, sekarang fallback ke `index.html`). Diuji nyata, tidak ada regresi ke endpoint yang sudah ada.

---

## 11. Demo hidup di `nxdom.local` (WSL/aaPanel) + bugfix `auto_globals_jit`

Dibuat demo aplikasi NxDom baru yang bisa dilihat langsung di browser, untuk memverifikasi `/api/outside` (jalur model) dan CRUD manifest end-to-end lewat **nginx + php-fpm (PHP 8.3)** sungguhan — bukan `php -S`/CLI.

### 11.1 Setup demo
- Situs baru `nxdom.local`: webroot `/www/wwwroot/nxdom.local`, vhost nginx (server block baru), entri hosts Windows `127.0.0.1 nxdom.local`.
- App NxDom: `index.html` (UI), `index.php` (front controller panggil `nxdom_dispatch()`), `nxdom.config.json`/`.manifest.json`/`.policy.json`.
- DB: tabel `products` di `db_latihan` (kredensial `user_latihan` yang sudah ada — root MySQL tidak diketahui passwordnya).
- `nxdom.so` disalin ke `extension_dir` FPM + `extension = nxdom.so` ditambahkan ke `php.ini` FPM (backup `php.ini.bak-nxdom`), lalu php-fpm direstart.
- Config nginx: `/api/` → `index.php` (front controller), `location = /index.php` eksekusi PHP, `nxdom.*.json` → 403, `/` → `index.html`.

### 11.2 Bug NYATA ditemukan & diperbaiki: `auto_globals_jit` + pembacaan `$_SERVER`
**Gejala**: di bawah FPM/nginx, `nxdom_dispatch()` mengembalikan **false** untuk request `/api/products` yang seharusnya valid (front controller balas "Not found"), padahal di CLI (`php -S`/`php script.php`) berjalan normal. Sempat tampak "flaky"/tergantung bentuk kode (`if (!nxdom_dispatch())` vs `$h = nxdom_dispatch()`) — ternyata itu **jebakan diagnosis**; akar masalahnya bukan bentuk pemanggilan.

**Akar masalah**: `php.ini` produksi memakai `auto_globals_jit = On` (default). Dengan JIT auto-globals, `$_SERVER` **tidak** dimaterialisasi ke `EG(symbol_table)` sampai userland pertama kali mengaksesnya. Extension membaca `zend_hash_str_find(&EG(symbol_table), "_SERVER", ...)` langsung → menemukan **kosong** → `RETURN_FALSE`. Di CLI auto-globals di-materialisasi lebih awal, jadi tidak terlihat.

**Perbaikan**: helper baru **`nxdom_superglobal(name)`** di `nxdom_call.c`/`.h` — memaksa materialisasi lewat `zend_is_auto_global_str()` lalu membaca dari sumber kanonik `PG(http_globals)[TRACK_VARS_*]` (fallback ke `EG(symbol_table)`). Dipakai di:
- `nxdom_dispatch()` & `PHP_RINIT_FUNCTION` (nxdom.c) untuk `_SERVER`.
- `nxdom_apply_client_where()` & `nxdom_handle_query()` (nxdom_router.c) untuk `_GET`.

**Diuji nyata**: setelah perbaikan, `if (!nxdom_dispatch())` stabil (8/8 request berturut-turut) di bawah FPM; `/api/products`, `/api/products/:id`, `/api/outside` (recent/byId, params polos **dan** ter-encrypt NexaEncrypt), `/` HTML, dan `403` untuk config semuanya benar dari browser/Windows.

**Pelajaran**: extension yang membaca superglobal (`$_SERVER`/`$_GET`/`$_POST`/…) **wajib** memaksa materialisasi auto-global — jangan asumsikan `EG(symbol_table)` sudah terisi hanya karena berjalan benar di CLI. Bug ini tidak akan pernah terlihat kalau pengujian hanya lewat CLI/`php -S`.

### 11.3 Route halaman (`action: "page"`) — router NxDom melayani halaman non-`/api`

Sebelumnya `nxdom_kernel_handle()` **hanya** memproses path berawalan `/api/`; path lain (mis. `/about`) selalu diserahkan ke SPA fallback front controller (selalu `index.html`). Ditambahkan kemampuan **route halaman** di manifest:

```jsonc
{ "method": "GET", "path": "/about", "action": "page", "page": "about" }
{ "method": "GET", "path": "/help",  "action": "page", "page": "help" }
```

Alur: nginx meneruskan path tanpa file fisik ke front controller global → `nxdom_dispatch()` → cocok ke manifest (sekarang untuk path apa pun, bukan hanya `/api/`) → action `page` membaca `<DOCUMENT_ROOT>/pages/<page>.html` dan mengirimnya sebagai `text/html`. `page` wajib identifier sederhana (`^[a-zA-Z0-9_]+$`) — mencegah path traversal.

**Perubahan**:
- `nxdom_kernel.c` — gate `/api/` dihapus; path apa pun dicoba match manifest; bila tidak match → return 0 (diserahkan ke front controller untuk SPA fallback/404 JSON).
- `nxdom_router.c` — `nxdom_handle_page()` + cabang `action == "page"` **sebelum** koneksi database (halaman tidak butuh DB).
- `manifest.schema.json` + `scripts/validate-manifest.php` — `action` enum + `"page"`, field `page`, path non-`/api` diizinkan khusus action `page`, `resource` tidak wajib untuk `page`.
- Nginx: `try_files $uri @nxdom` (path tanpa file → front controller), blokir `/pages/` akses langsung.

**Diuji nyata** (WSL nginx+FPM, dari Windows): `/about` & `/help` → 200 HTML dari `pages/*.html` (bukan index.html); `/beranda` (tanpa route) → 200 SPA fallback index.html; `/api/products` → 200 JSON; `/api/nonexistent` → 404 JSON; `/pages/about.html` → 404 (diblokir). Build Windows (nmake) & Linux (phpize) dua-duanya bersih; 10/10 test compiler tetap lolos.
