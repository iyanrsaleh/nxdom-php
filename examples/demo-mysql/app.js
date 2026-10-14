import nxdom from '@nxdom/client';

// Pola yang dikenali compiler NxDom v1 (lihat cli/compiler/src/analyze.js):
//   nxdom.db("<resource>").get()          -> action "query"
//   nxdom.db("<resource>").find(id)       -> action "get"
//   nxdom.db("<resource>").create(data)   -> action "create"
//   nxdom.db("<resource>").update(id, d)  -> action "update"
//   nxdom.db("<resource>").delete(id)     -> action "delete"
//   nxdom.auth.register/login/logout/me() -> auth actions
//
// .where()/.orderBy()/.limit() di sisi client TIDAK mengubah manifest —
// itu constraints dinamis per-request (lihat M5), bukan bagian kontrak
// route. Kebijakan keamanan (fillable, auth, whitelist) datang dari
// nxdom.policy.json, bukan dari kode ini (lihat Plan.md Bagian 5, M6).

export async function listActiveUsers() {
  // Filter active=true SUDAH ditetapkan server-side lewat
  // nxdom.manifest.json (constraints.where) — tidak perlu (dan tidak
  // diizinkan, lihat allowClientWhere) dikirim ulang dari client.
  return nxdom.db('users').get();
}

export async function getUser(id) {
  return nxdom.db('users').find(id);
}

export async function createUser(data) {
  return nxdom.db('users').create(data);
}

export async function updateUser(id, data) {
  return nxdom.db('users').update(id, data);
}

export async function removeUser(id) {
  return nxdom.db('users').delete(id);
}

export async function registerAndLogin(credentials) {
  await nxdom.auth.register(credentials);
  return nxdom.auth.login(credentials);
}

export async function currentUser() {
  return nxdom.auth.me();
}

export async function logout() {
  return nxdom.auth.logout();
}
