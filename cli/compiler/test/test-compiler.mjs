import { analyze, UnsupportedPatternError } from '../src/analyze.js';
import { buildManifest, PolicyMissingError } from '../src/build-manifest.js';

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

// 1. Tanpa import @nxdom/client -> tidak ada calls, importAlias null
{
  const { calls, importAlias } = analyze('const x = 1;');
  assert(importAlias === null && calls.length === 0, 'kode tanpa import nxdom -> tidak ada calls');
}

// 2. Import dengan alias custom tetap dikenali (default import, bukan nama fix)
{
  const src = `
    import client from '@nxdom/client';
    client.db('posts').get();
  `;
  const { calls } = analyze(src);
  assert(
    calls.length === 1 && calls[0].resource === 'posts' && calls[0].action === 'query',
    'default import dengan alias custom (client) tetap dikenali'
  );
}

// 3. Chain .where().orderBy().limit().get() tetap terdeteksi sebagai query
{
  const src = `
    import nxdom from '@nxdom/client';
    nxdom.db('users').where('active', true).orderBy('name').limit(10).get();
  `;
  const { calls } = analyze(src);
  assert(
    calls.length === 1 && calls[0].resource === 'users' && calls[0].action === 'query',
    'chain where().orderBy().limit().get() -> query (bug M6 yang sudah diperbaiki)'
  );
}

// 4. Dedup: pemanggilan resource+action yang sama berkali-kali -> satu route
{
  const src = `
    import nxdom from '@nxdom/client';
    nxdom.db('users').get();
    nxdom.db('users').where('x', 1).get();
    nxdom.db('users').find(1);
  `;
  const { calls } = analyze(src);
  assert(calls.length === 2, 'dedup: query dipanggil 2x + get 1x -> 2 calls unik');
}

// 5. Resource bukan string literal -> UnsupportedPatternError
{
  const src = `
    import nxdom from '@nxdom/client';
    const table = 'users';
    nxdom.db(table).get();
  `;
  try {
    analyze(src);
    assert(false, 'resource dari variabel harus melempar UnsupportedPatternError');
  } catch (e) {
    assert(e instanceof UnsupportedPatternError, 'resource dari variabel -> UnsupportedPatternError');
  }
}

// 6. auth.* calls dikenali
{
  const src = `
    import nxdom from '@nxdom/client';
    nxdom.auth.login({});
    nxdom.auth.me();
  `;
  const { calls } = analyze(src);
  assert(
    calls.length === 2 && calls.every((c) => c.resource === 'auth'),
    'nxdom.auth.login()/me() dikenali sebagai resource "auth"'
  );
}

// 7. buildManifest: create tanpa policy -> PolicyMissingError
{
  const calls = [{ resource: 'users', action: 'create' }];
  try {
    buildManifest(calls, { resources: {} });
    assert(false, 'create tanpa policy harus melempar PolicyMissingError');
  } catch (e) {
    assert(e instanceof PolicyMissingError, 'create tanpa policy fillable -> PolicyMissingError (cegah mass-assignment)');
  }
}

// 8. buildManifest: query/get/delete tanpa policy tetap boleh (tidak wajib)
{
  const calls = [
    { resource: 'users', action: 'query' },
    { resource: 'users', action: 'get' },
    { resource: 'users', action: 'delete' },
  ];
  const manifest = buildManifest(calls, { resources: {} });
  assert(manifest.routes.length === 3, 'query/get/delete tanpa policy tetap dibangun (tidak wajib fillable)');
}

// 9. buildManifest: auth flag dari policy masuk ke route.auth
{
  const calls = [{ resource: 'users', action: 'update' }];
  const policy = { resources: { users: { update: { auth: true, fillable: ['name'] } } } };
  const manifest = buildManifest(calls, policy);
  assert(manifest.routes[0].auth === true, 'policy.auth=true -> route.auth=true');
  assert(
    JSON.stringify(manifest.routes[0].constraints.fillable) === JSON.stringify(['name']),
    'policy.fillable masuk ke route.constraints.fillable'
  );
}

console.log(`\n${passed} lolos, ${failed} gagal`);
process.exit(failed > 0 ? 1 : 0);
