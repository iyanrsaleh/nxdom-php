import { spawn } from 'node:child_process';
import { watch, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from './build.js';
import { readDevConfig, writeDevConfig, promptDevConfig } from './config.js';
import { isNxdomLoaded } from './install.js';

/**
 * Router PHP untuk `php -S` (dev only, BUKAN untuk produksi — lihat
 * nxdom/index.php + Apache.md untuk front controller produksi via Apache
 * module + mod_rewrite). Digenerate on-the-fly ke file sementara supaya
 * cli/ tetap satu-satunya sumber kebenaran untuk tooling development
 * (dipertimbangkan sengaja: taruh sebagai file statis terpisah di nxdom/
 * atau cli/templates/ juga bisa, tapi generate inline menghindari file
 * "diam" yang mudah basi kalau nxdom_dispatch() berubah kontrak nanti).
 *
 * Beda dari nxdom/index.php: Apache, lewat mod_rewrite (`!-f`/`!-d` di
 * nxdom-rewrite.conf), sudah memastikan file fisik tidak ada SEBELUM
 * meneruskan request ke index.php. PHP built-in server TIDAK melakukan
 * pengecekan itu untuk router script — seluruh request (termasuk file
 * statis nyata seperti index.html/app.js) selalu dilempar ke router,
 * dibuktikan lewat pengujian nyata (tanpa fallback ini, GET /index.html
 * dan GET /app.js ikut jatuh ke nxdom_dispatch() dan 404 padahal filenya
 * ada). Pola fallback ini sama seperti didokumentasikan resmi PHP untuk
 * router script CLI server: `return false` menyerahkan request ke
 * static file server bawaan php -S.
 *
 * Blokir nxdom.*.json HARUS dicek sebelum fallback file statis — kalau
 * tidak, file itu (berisi kredensial DB/auth secret) lolos sebagai
 * "file statis biasa" dan ter-serve mentah oleh php -S. Ditemukan nyata
 * sebagai regresi saat menulis versi awal router ini (lihat Plan_01.md
 * poin 1) — persis kebocoran yang sama seperti Plan.md Bagian 0F poin 2
 * di Apache, ternyata berulang juga di php -S kalau lupa dicek eksplisit.
 */
const DEV_ROUTER_PHP = `<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = $_SERVER['DOCUMENT_ROOT'] . $path;

if (preg_match('#^/nxdom\\.[a-z]+\\.json$#', $path)) {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

if ($path === '/' || is_file($file)) {
    return false;
}

if (function_exists('nxdom_dispatch') && nxdom_dispatch()) {
    exit;
}

http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Not found']);
`;

/**
 * nxdom-php dev <app-dir> [--php <path-ke-php.exe>] [--port 8080]
 *
 * 0. Tentukan phpBin/port lewat prioritas: flag CLI eksplisit > env
 *    NXDOM_PHP_BIN (khusus phpBin) > .nxdomrc.json tersimpan di app-dir >
 *    prompt interaktif sekali (hasilnya disimpan ke .nxdomrc.json supaya
 *    run berikutnya tidak ditanya lagi). Flag CLI SENGAJA tidak menimpa
 *    file tersimpan — override lewat flag hanya berlaku sekali pakai;
 *    untuk ganti nilai tersimpan, pakai `nxdom-php config` eksplisit
 *    (lihat config.js).
 * 1. Build manifest sekali (M6) sebelum server start, supaya request
 *    pertama tidak 404 karena manifest belum ada.
 * 2. Generate router PHP sementara (lihat DEV_ROUTER_PHP di atas), lalu
 *    jalankan `php -S 127.0.0.1:<port> -t <app-dir> <router-sementara>`.
 * 3. Watch app.js dan nxdom.policy.json di app-dir, rebuild manifest
 *    otomatis saat berubah (server built-in PHP tidak perlu direstart
 *    karena ia membaca ulang nxdom.manifest.json di setiap request).
 *
 * PHP tidak dibundel dengan NxDom (README §20-21: Node.js hanya untuk
 * development tooling). Extension `nxdom` sendiri harus sudah aktif di
 * php.ini (atau lewat --php yang menunjuk ke build php.exe yang sudah
 * memuat extension itu) — dev tidak mem-passing `-d extension=nxdom`
 * otomatis karena lokasi .dll/.so bervariasi per mesin, di luar kendali
 * app.
 */
export async function dev(appDir, { phpBin, port } = {}) {
  const resolvedAppDir = resolve(appDir);
  const saved = readDevConfig(resolvedAppDir);

  let php = phpBin ?? process.env.NXDOM_PHP_BIN ?? saved?.phpBin;
  let resolvedPort = port ?? saved?.port;

  if (!php || !resolvedPort) {
    const answered = await promptDevConfig(saved);
    php = php ?? answered.phpBin;
    resolvedPort = resolvedPort ?? answered.port;
    if (!saved) {
      writeDevConfig(resolvedAppDir, { phpBin: php, port: resolvedPort });
      console.log(`[nxdom-php] tersimpan ke ${resolvedAppDir}\\.nxdomrc.json (edit lewat 'nxdom-php config').\n`);
    }
  }

  const finalPort = resolvedPort ?? 8080;

  if (!isNxdomLoaded(php)) {
    console.warn(
      `[nxdom-php] PERINGATAN: extension 'nxdom' tidak terdeteksi aktif di ${php}.\n` +
      `  Server tetap dijalankan, tapi seluruh route /api/* akan gagal (404) sampai extension ini aktif.\n` +
      `  Coba: nxdom-php install --php "${php}"\n`
    );
  }

  console.log('[nxdom-php] build manifest awal...');
  build(resolvedAppDir, { phpBin: php });

  const routerDir = mkdtempSync(join(tmpdir(), 'nxdom-php-dev-'));
  const routerPhp = join(routerDir, 'router.php');
  writeFileSync(routerPhp, DEV_ROUTER_PHP);

  console.log(`[nxdom-php] starting: ${php} -S 127.0.0.1:${finalPort} -t ${resolvedAppDir} ${routerPhp}`);
  const server = spawn(php, ['-S', `127.0.0.1:${finalPort}`, '-t', resolvedAppDir, routerPhp], {
    stdio: 'inherit',
  });

  /**
   * Tanpa handler ini, spawn ENOENT (path php.exe salah/tidak ada)
   * naik sebagai 'Unhandled error event' — crash Node mentah dengan
   * stack trace internal, bukan pesan yang menjelaskan penyebabnya.
   * Ditemukan nyata saat menguji path php.exe yang salah.
   */
  server.on('error', (err) => {
    rmSync(routerDir, { recursive: true, force: true });
    if (err.code === 'ENOENT') {
      console.error(`FAIL: php.exe tidak ditemukan di: ${php}`);
    } else {
      console.error(`FAIL: gagal menjalankan php.exe: ${err.message}`);
    }
    process.exit(1);
  });

  const watchTargets = [join(resolvedAppDir, 'app.js'), join(resolvedAppDir, 'nxdom.policy.json')];
  const watchers = watchTargets.map((file) =>
    watch(file, () => {
      console.log(`[nxdom-php] perubahan terdeteksi (${file}), rebuild manifest...`);
      try {
        build(resolvedAppDir);
        console.log('[nxdom-php] manifest ter-update.');
      } catch (err) {
        console.error(`[nxdom-php] build gagal: ${err.message}`);
      }
    })
  );

  const shutdown = () => {
    watchers.forEach((w) => w.close());
    server.kill();
    rmSync(routerDir, { recursive: true, force: true });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}
