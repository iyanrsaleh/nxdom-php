# sdk-demo — contoh aplikasi NxDom (SDK)

Aplikasi **murni HTML + JavaScript** yang memakai SDK `@nxdom/client` — tanpa
kode PHP di webroot. Ini contoh paling sederhana untuk memulai: CRUD tabel
`products` + memanggil endpoint model `/api/outside`.

```
sdk-demo/
├── index.html            # UI + logika (pakai SDK @nxdom/client)
├── assets/nxclient/      # SDK (salinan packages/nxdom-js/src)
├── nxdom.config.json     # konfigurasi app (DB, auth)
├── nxdom.manifest.json   # route (dibuat `nxdom-php build`, atau tulis tangan)
├── nxdom.policy.json     # kebijakan server (fillable, whitelist, model)
└── storage/              # data runtime (sqlite) — dibuat otomatis
```

Prinsip NxDom (README §6/§33/§35): aplikasi **tidak** membawa runtime NxDom.
Webroot hanya aset + konfigurasi. Extension + front controller + rewrite
dipasang **sekali di server**.

## Yang dicontohkan

| Bagian di `index.html` | SDK / endpoint |
|---|---|
| Muat daftar produk | `nxdom.db('products').get()` → `GET /api/products` |
| Tambah produk | `nxdom.db('products').create({...})` → `POST /api/products` |
| Cari by id | `nxdom.db('products').find(id)` → `GET /api/products/:id` |
| Model `recent`/`byId` | `POST /api/outside` (params ter-encrypt NexaEncrypt) |

## Menjalankan (development)

Butuh extension `nxdom` aktif di PHP. Paling mudah lewat CLI:

```bash
nxdom-php dev sdk-demo --php <path-ke-php.exe>
```

CLI akan: membangun manifest + tabel sqlite dasar (dari `policy.fillable`),
menjalankan server dev, dan watch perubahan. Buka URL yang ditampilkan.

Alur manual (tanpa CLI):

1. `nxdom-php build sdk-demo --php <php>` — hasilkan/segarkan `nxdom.manifest.json`
   dan tabel sqlite (`products` dengan kolom `name`, `price`).
2. Arahkan document root web server ke folder ini.
3. Pastikan extension `nxdom` aktif + front controller generik + rewrite
   terpasang (lihat `Apache.md` / `nxdom/README.md`).

## Di server produksi

1. Unduh extension + SDK dari halaman Release repo ini.
2. Pasang extension ke PHP (lihat `install.md` / `Apache.md`).
3. Salin folder ini ke webroot; pastikan `nxdom.config.json` memakai kredensial
   DB produksi (ganti secret `dev-only-secret-change-me`).
4. Selesai — tidak ada langkah build di server (manifests sudah ikut).

## Catatan keamanan

- Field create/update dibatasi `policy.resources.products.create.fillable`
  (`name`, `price`) — mencegah mass-assignment.
- Model `byId` memakai `$param.0` sebagai **binding** (bukan interpolasi string).
- `nxdom.*.json` harus diblokir dari akses langsung di web server (front
  controller generik sudah menanganinya).
