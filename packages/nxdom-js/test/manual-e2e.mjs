/**
 * Uji manual M5: SDK nxdom (Node fetch) terhadap server PHP nyata
 * (php -S + nxdom/router.php, app examples/demo).
 *
 * Node global fetch tidak punya cookie jar seperti browser, jadi test ini
 * menyuntik cookie jar sederhana lewat monkeypatch fetch sebelum import SDK
 * — SDK sendiri tetap kode browser biasa (credentials: 'include'), ini
 * hanya kebutuhan lingkungan Node untuk keperluan pengujian.
 *
 * Usage: node packages/nxdom-js/test/manual-e2e.mjs http://127.0.0.1:8099
 */

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:8099';

let cookieJar = '';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const headers = new Headers(options.headers);
  if (cookieJar) headers.set('Cookie', cookieJar);

  const res = await originalFetch(url, { ...options, headers });

  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    cookieJar = setCookie.split(';')[0];
  }

  return res;
};

const { createClient, NxdomApiError } = await import('../src/index.js');
const nxdom = createClient(baseUrl);

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`OK   - ${label}`);
    passed++;
  } else {
    console.log(`FAIL - ${label}`);
    failed++;
  }
}

async function expectApiError(promise, expectedStatus, label) {
  try {
    await promise;
    assert(false, `${label} (harusnya melempar NxdomApiError ${expectedStatus})`);
  } catch (e) {
    assert(e instanceof NxdomApiError && e.status === expectedStatus, `${label} -> ${e.status} ${e.message}`);
  }
}

// 1. query dasar + constraints manifest (active=true, limit, orderBy desc)
const users = await nxdom.db('users').get();
assert(Array.isArray(users) && users.length === 2, "db('users').get() -> 2 baris (Ayu, Budi; Citra inactive)");

// 2. where tambahan whitelisted (name), AND dengan active=true dari manifest
const filtered = await nxdom.db('users').where('name', 'like', '%Budi%').get();
assert(filtered.length === 1 && filtered[0].name === 'Budi', "where('name','like','%Budi%') -> hanya Budi");

// 3. where pada kolom di luar whitelist -> 403 dari server
await expectApiError(nxdom.db('users').where('id', '=', 1).get(), 403, "where('id', ...) ditolak (bukan whitelist)");

// 4. orderBy whitelisted menggantikan orderBy manifest
const ordered = await nxdom.db('users').orderBy('name', 'asc').get();
assert(ordered[0].name === 'Ayu' && ordered[1].name === 'Budi', "orderBy('name','asc') -> Ayu, Budi");

// 5. find by id
const one = await nxdom.db('users').find(1);
assert(one.name === 'Ayu', 'find(1) -> Ayu');

await expectApiError(nxdom.db('users').find(999), 404, 'find(999) -> 404');

// 6. auth: me sebelum login -> 401
await expectApiError(nxdom.auth.me(), 401, 'auth.me() sebelum login -> 401');

// 7. register + login
const emailUnique = `sdk-${Date.now()}@example.com`;
const registered = await nxdom.auth.register({ email: emailUnique, password: 'rahasia123', name: 'SDK Test' });
assert(registered.email === emailUnique, 'auth.register() sukses');

await expectApiError(
  nxdom.auth.login({ email: emailUnique, password: 'salah' }),
  401,
  'auth.login() password salah -> 401'
);

const me = await nxdom.auth.login({ email: emailUnique, password: 'rahasia123' });
assert(me.email === emailUnique, 'auth.login() sukses, sesi aktif');

const meAgain = await nxdom.auth.me();
assert(meAgain.email === emailUnique, 'auth.me() setelah login -> user yang sama');

// 8. route auth:true (update) berhasil dengan sesi aktif
const updated = await nxdom.db('users').update(1, { name: 'Ayu via SDK' });
assert(updated.name === 'Ayu via SDK', 'db().update() pada route auth:true sukses dengan sesi aktif');

// 9. logout lalu route auth:true ditolak lagi
await nxdom.auth.logout();
await expectApiError(nxdom.auth.me(), 401, 'auth.me() setelah logout -> 401');
await expectApiError(nxdom.db('users').update(1, { name: 'Should Fail' }), 401, 'update() setelah logout -> 401');

console.log(`\n${passed} lolos, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
