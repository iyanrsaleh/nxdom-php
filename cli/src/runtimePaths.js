import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAsset, isSea } from 'node:sea';

/**
 * Resolusi path aset (templates/, compiler/, packages/nxdom-js/src) yang
 * bekerja SAMA baik dijalankan sebagai `node bin/nxdom-php.js` (dev
 * normal, import.meta.url valid) maupun sebagai nxdom-php.exe hasil
 * build SEA (import.meta.url KOSONG di bundle CJS — dibuktikan lewat
 * build nyata, bukan asumsi: TypeError ERR_INVALID_ARG_TYPE saat
 * fileURLToPath(undefined) dipanggil dari dalam .exe tanpa modul ini).
 * Pola sama seperti proyek nxdom-cli terpisah (runtimePaths.js di sana)
 * — pakai `node:sea` API resmi Node 22+, bukan pkg/nexe.
 *
 * SEA config (`assets`) hanya mendukung file individual per-key, tidak
 * folder — jadi tiap file di bawah ini didaftarkan satu-satu di
 * scripts/build-exe.mjs, lalu di sini dimaterialisasikan balik ke satu
 * folder temp yang strukturnya sama seperti sumber aslinya, supaya kode
 * pemanggil (create.js/build.js) tidak perlu tahu bedanya sama sekali.
 */
function sourceCliRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

/**
 * Daftar aset yang WAJIB match persis dengan `assets` di sea-config.json
 * (dibangkitkan otomatis dari daftar ini oleh scripts/build-exe.mjs,
 * satu sumber kebenaran — bukan didaftarkan dua kali secara terpisah).
 * `key` dipakai sebagai SEA asset key DAN sebagai path relatif tujuan
 * materialisasi.
 */
export const EMBEDDED_ASSETS = [
  'templates/app/app.js',
  'templates/app/index.html',
  'templates/app/nxdom.policy.json',
  'compiler/cli.bundle.cjs',
  'nxclient/Auth.js',
  'nxclient/Http.js',
  'nxclient/index.js',
  'nxclient/QueryBuilder.js',
  'install/php_nxdom.dll',
  'scripts/ensure-schema.php',
];

let materializedRoot = null;

/**
 * Root folder tempat semua aset bisa diakses sebagai file fisik biasa:
 * folder sumber asli (mode dev), atau folder temp hasil materialisasi
 * dari SEA assets (mode .exe, dibuat sekali per proses lalu di-cache).
 */
export function assetsRoot() {
  if (!isSea()) {
    return sourceCliRoot();
  }

  if (materializedRoot) {
    return materializedRoot;
  }

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nxdom-php-assets-'));
  for (const key of EMBEDDED_ASSETS) {
    const relativeTarget = key.replace(/^nxclient\//, 'packages/nxdom-js/src/');
    const target = path.join(targetDir, relativeTarget);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(getAsset(key)));
  }
  materializedRoot = targetDir;
  return materializedRoot;
}

/** Path template app hasil `create` (folder `templates/app/`). */
export function templateDir() {
  return path.join(assetsRoot(), 'templates/app');
}

/**
 * Path entrypoint compiler, dijalankan sebagai proses Node terpisah oleh
 * build.js. Mode dev: source asli `compiler/src/cli.js` (butuh
 * node_modules compiler/ untuk acorn/acorn-walk, sudah tersedia lewat
 * npm install biasa). Mode .exe SEA: `compiler/cli.bundle.cjs` — bundle
 * esbuild yang sudah menyatukan acorn/acorn-walk ke satu file, karena
 * SEA assets memateriaisasi file individual TANPA node_modules-nya
 * (dibuktikan lewat pengujian nyata: ERR_MODULE_NOT_FOUND 'acorn' saat
 * mencoba menjalankan source asli yang belum di-bundle dari .exe).
 */
export function compilerCliPath() {
  if (!isSea()) {
    return path.join(sourceCliRoot(), 'compiler/src/cli.js');
  }
  return path.join(assetsRoot(), 'compiler/cli.bundle.cjs');
}

/** Path source @nxdom/client yang disalin ke assets/nxclient/ tiap app hasil `create`. */
export function nxclientSrcDir() {
  if (!isSea()) {
    return path.resolve(sourceCliRoot(), '../packages/nxdom-js/src');
  }
  return path.join(assetsRoot(), 'packages/nxdom-js/src');
}

/** Path bundel php_nxdom.dll, dipakai `nxdom-php install`. */
export function bundledDllPath() {
  return path.join(assetsRoot(), 'install/php_nxdom.dll');
}

/** Path ensure-schema.php, dijalankan sebagai proses PHP terpisah oleh build.js. */
export function ensureSchemaScriptPath() {
  return path.join(assetsRoot(), 'scripts/ensure-schema.php');
}
