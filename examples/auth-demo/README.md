# auth-demo — contoh aplikasi NxDom dengan login

Aplikasi **murni HTML + JS** memakai SDK `@nxdom/client`, menunjukkan
authentication NxDom (register / login / me / logout) dan resource yang
dilindungi (`auth: true`).

```
auth-demo/
├── index.html            # UI: register/login/me/logout + resource terproteksi
├── assets/nxclient/      # SDK (salinan packages/nxdom-js/src)
├── nxdom.config.json     # auth.table=users, identifier=email, passwordColumn=password
├── nxdom.manifest.json   # route /api/auth/* + /api/secrets (auth: true)
├── nxdom.policy.json
└── storage/              # data runtime (sqlite) — dibuat otomatis
```

## Yang dicontohkan

| Aksi | SDK / endpoint |
|---|---|
| Register | `nxdom.auth.register({ name, email, password })` → `POST /api/auth/register` |
| Login | `nxdom.auth.login({ email, password })` → `POST /api/auth/login` |
| Sesi aktif | `nxdom.auth.me()` → `GET /api/auth/me` |
| Logout | `nxdom.auth.logout()` → `POST /api/auth/logout` |
| Data terproteksi | `nxdom.db('secrets').get()` → `GET /api/secrets` (**401** bila belum login) |

## Menjalankan (development)

```bash
nxdom-php dev examples/auth-demo --php <path-ke-php.exe>
```

CLI membangun manifest + tabel sqlite (`users` dengan kolom `email`/`password`
otomatis dari `nxdom.config.json` + `secrets`), menjalankan server dev.

## Catatan

- Sesi disimpan lewat **cookie** (`credentials: 'include'` di SDK) — bukan token
  di localStorage.
- Auth config (`table`, `identifier`, `passwordColumn`, `registerFillable`,
  `secret`) ada di `nxdom.config.json`; ganti `secret` sebelum produksi.
- `registerFillable: ["name"]` — field yang boleh diisi saat register selain
  identifier & password (cegah mass-assignment).
- Route `/api/secrets` memasang `auth: true` di manifest — NxDom menolak (401)
  sebelum menyentuh database bila sesi tidak valid.
