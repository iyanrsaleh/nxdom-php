# @nxdom/client

SDK JavaScript untuk berkomunikasi dengan **NxDom Application API** di server (lihat `README.md` §14 di root repo — ini bukan Node.js API). Dipakai di browser lewat import map, memanggil endpoint `/api/*` yang disediakan NxDom Extension/Router di sisi PHP.

```js
import nxdom from '@nxdom/client';

const users = await nxdom.db('users').where('active', true).get();
```

## Instalasi (development)

Di `index.html` aplikasi, daftarkan lewat import map lalu import seperti modul biasa:

```html
<script type="importmap">
  { "imports": { "@nxdom/client": "./assets/nxclient/index.js" } }
</script>
<script type="module">
  import nxdom from '@nxdom/client';
</script>
```

`nxdom build` (lihat root `README.md` §25–27) yang bertanggung jawab menyalin/bundle paket ini ke `assets/` aplikasi saat deployment — source paket ada di `packages/nxdom-js/`.

## API

### `createClient(baseUrl = '')`

Named export. Membuat instance client baru, dengan endpoint API relatif terhadap `baseUrl`. Default export modul ini (`nxdom`) adalah hasil `createClient()` dengan `baseUrl` kosong (relatif terhadap origin saat ini) — cukup untuk kebanyakan kasus karena aplikasi dan API NxDom disajikan dari domain yang sama.

```js
import { createClient } from '@nxdom/client';

const nxdom = createClient('https://api.example.com');
```

### `nxdom.db(resource)`

Mengembalikan `QueryBuilder` untuk resource tertentu (mis. nama tabel/model yang diekspos lewat `nxdom.manifest.json` di server). Semua method di bawah ini `async` dan memanggil endpoint REST `/api/{resource}`.

| Method | Request | Keterangan |
|---|---|---|
| `.where(column, operator?, value)` | — | Menambah filter opsional. 2 argumen → operator default `=`. Bisa dipanggil berulang (di-AND-kan). Chainable. |
| `.orderBy(column, direction = 'asc')` | — | Menetapkan urutan opsional. Chainable. |
| `.limit(n)` | — | Membatasi jumlah hasil opsional. Chainable. |
| `.get()` | `GET /api/{resource}?where=...&orderBy=...&limit=...` | Mengeksekusi query, mengembalikan array hasil. |
| `.find(id)` | `GET /api/{resource}/{id}` | Mengambil satu record berdasarkan id. |
| `.create(data)` | `POST /api/{resource}` | Membuat record baru. |
| `.update(id, data)` | `PUT /api/{resource}/{id}` | Memperbarui record. |
| `.delete(id)` | `DELETE /api/{resource}/{id}` | Menghapus record. |

```js
const active = await nxdom.db('users').where('active', true).orderBy('name').limit(10).get();
const one = await nxdom.db('users').find(1);
const created = await nxdom.db('users').create({ name: 'Ada', email: 'ada@example.com' });
await nxdom.db('users').update(1, { name: 'Ada L.' });
await nxdom.db('users').delete(1);
```

**Penting soal `.where()`/`.orderBy()`/`.limit()`:** ini adalah *constraint tambahan opsional* di sisi client, bukan bagian dari kontrak route. Constraint wajib (mis. filter `active=true` yang harus selalu berlaku) ditetapkan di server lewat `nxdom.manifest.json` (`constraints.where`) dan **tidak bisa** ditimpa dari sini. Server memvalidasi setiap constraint client terhadap whitelist di `nxdom.policy.json` (`allowClientWhere`, `allowClientOrderBy`, `maxClientLimit`) dan menolak (403) kolom/nilai di luar whitelist tersebut.

### `nxdom.auth`

Membungkus route auth manifest.

| Method | Request | Keterangan |
|---|---|---|
| `.register(data)` | `POST /api/auth/register` | Mendaftarkan user baru. |
| `.login(data)` | `POST /api/auth/login` | Login, menyimpan session lewat cookie. |
| `.logout()` | `POST /api/auth/logout` | Mengakhiri session. |
| `.me()` | `GET /api/auth/me` | Mengambil data user yang sedang login. |

```js
await nxdom.auth.register({ name: 'Ada', email: 'ada@example.com', password: 'secret123' });
await nxdom.auth.login({ email: 'ada@example.com', password: 'secret123' });
const me = await nxdom.auth.me();
await nxdom.auth.logout();
```

Kredensial session dikirim lewat cookie (`credentials: 'include'` pada setiap request) — tanpa login terlebih dahulu, `me()` dan route apa pun yang butuh `auth: true` di manifest akan gagal dengan `401`.

### `NxdomApiError`

Named export. Semua kegagalan request (status HTTP non-2xx) dilempar sebagai instance ini, bukan resolusi promise dengan payload error.

```js
import nxdom, { NxdomApiError } from '@nxdom/client';

try {
  await nxdom.db('users').find(999);
} catch (e) {
  if (e instanceof NxdomApiError) {
    console.error(e.status, e.message); // mis. 404, "User tidak ditemukan"
  }
}
```

| Property | Tipe | Keterangan |
|---|---|---|
| `status` | `number` | Status HTTP dari response. |
| `message` | `string` | Diambil dari `payload.error` server, atau fallback `Request gagal ({status})`. |
| `name` | `string` | Selalu `'NxdomApiError'`. |

## Format response

Server diharapkan mengembalikan body JSON. Bila response berbentuk `{ "data": ... }`, SDK membuka bungkus dan mengembalikan `data`-nya langsung; bila tidak, seluruh payload dikembalikan apa adanya. Response yang gagal di-parse sebagai JSON diperlakukan sebagai `null`.

## Yang bukan tanggung jawab paket ini

- **Tidak mem-bundle runtime NxDom** — paket ini murni HTTP client tipis; seluruh logika router/database/auth/policy berjalan di NxDom Extension (native, PHP) di server.
- **Tidak menegakkan aturan keamanan** — validasi fillable, whitelist kolom, dan otorisasi selalu diputuskan ulang oleh server (`nxdom.policy.json`), sehingga client tidak bisa dipercaya untuk itu meski method-nya tersedia di sini.
