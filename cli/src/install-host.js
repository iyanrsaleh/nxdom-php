import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * nxdom-php install-host [--php <path>]
 *
 * Deteksi environment hosting Linux (aaPanel / CyberPanel / plain) dan
 * CETAK langkah + perintah `sudo` persis untuk memasang extension nxdom
 * (.so) — TIDAK mengubah sistem sendiri (keputusan desain, lihat
 * cli/README.md). Semua perubahan (salin .so, edit php.ini, rewrite,
 * restart service) butuh akses admin, jadi perintahnya dicetak untuk
 * dijalankan admin, bukan dieksekusi otomatis.
 *
 * Untuk Windows (php_nxdom.dll) gunakan `nxdom-php install --php <path>`
 * (lihat cli/README.md), bukan command ini.
 */

const FRONT_CONTROLLER = `<?php
// Front controller GLOBAL NxDom (dipasang sekali per server). Lihat nxdom/README.md.
if (function_exists('nxdom_dispatch') && nxdom_dispatch()) { exit; }
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
if (strncmp($path, '/api/', 5) !== 0) {
    $indexHtml = $_SERVER['DOCUMENT_ROOT'] . '/index.html';
    if (is_file($indexHtml)) { header('Content-Type: text/html; charset=utf-8'); readfile($indexHtml); exit; }
}
http_response_code(404);
header('Content-Type: application/json');
echo json_encode(['error' => 'Not found']);
`;

function run(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

/** Deteksi panel hosting dari keberadaan path khas. */
function detectPanel() {
  if (existsSync('/www/server/panel')) return 'aaPanel';
  if (existsSync('/usr/local/CyberCP') || existsSync('/usr/local/lsws')) return 'CyberPanel';
  return 'plain';
}

/**
 * Temukan kandidat php binary. Prioritas: --php eksplisit; selain itu scan
 * lokasi umum aaPanel ('/www/server/php/<ver>/bin/php'), CyberPanel/LSPHP
 * (folder lsphp* di '/usr/local/lsws'), lalu 'php' di PATH.
 */
function findPhpBinaries(explicit) {
  if (explicit) {
    return existsSync(explicit) ? [explicit] : [];
  }

  const found = [];
  const pushIfFile = (p) => {
    try {
      if (existsSync(p) && statSync(p).isFile()) found.push(p);
    } catch { /* abaikan */ }
  };

  const scanDir = (base, sub) => {
    try {
      for (const entry of readdirSync(base)) {
        pushIfFile(join(base, entry, sub, 'php'));
      }
    } catch { /* folder tidak ada */ }
  };

  scanDir('/www/server/php', join('bin')); // aaPanel: /www/server/php/83/bin/php
  try {
    for (const entry of readdirSync('/usr/local/lsws')) {
      if (entry.startsWith('lsphp')) {
        pushIfFile(join('/usr/local/lsws', entry, 'bin', 'php'));
      }
    }
  } catch { /* bukan CyberPanel/LSWS */ }

  const pathPhp = run('sh', ['-c', 'command -v php']);
  if (pathPhp) pushIfFile(pathPhp);

  return [...new Set(found)];
}

function phpInfo(phpBin) {
  const out = run(phpBin, ['-i']);
  if (!out) return null;
  const get = (label) => {
    const m = out.match(new RegExp(`^${label}\\s*=>\\s*([^\\r\\n]+?)(?:\\s*=>.*)?$`, 'm'));
    return m ? m[1].trim() : null;
  };
  return {
    version: get('PHP Version'),
    build: get('PHP Extension Build'),
    extensionDir: get('extension_dir'),
    phpIni: get('Loaded Configuration File'),
  };
}

export function installHost(phpBinArg) {
  if (process.platform === 'win32') {
    console.log(
      `[nxdom-php] install-host untuk hosting Linux (aaPanel/CyberPanel).\n` +
      `Di Windows, gunakan: nxdom-php install --php <path-ke-php.exe>\n`
    );
    return;
  }

  const panel = detectPanel();
  const phpBins = findPhpBinaries(phpBinArg);

  console.log(`[nxdom-php] install-host — deteksi environment hosting Linux`);
  console.log(`  Panel terdeteksi : ${panel}`);

  if (phpBins.length === 0) {
    console.log(`\n  Tidak ada instalasi PHP yang terdeteksi.`);
    console.log(`  Tentukan manual: nxdom-php install-host --php /path/ke/php`);
    return;
  }

  console.log(`\n  Instalasi PHP ditemukan (${phpBins.length}):`);
  const infos = [];
  const seen = new Set();
  for (const bin of phpBins) {
    const info = phpInfo(bin);
    // Dedup: beberapa path (mis. /usr/bin/php symlink ke /www/server/php/83)
    // menunjuk instalasi yang sama — kunci pakai extension_dir + php.ini.
    if (info) {
      const key = `${info.extensionDir}|${info.phpIni}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    infos.push({ bin, info });
    if (info) {
      console.log(`  - ${bin}`);
      console.log(`      versi        : ${info.version ?? '?'}`);
      console.log(`      extension_dir: ${info.extensionDir ?? '(tidak terbaca)'}`);
      console.log(`      php.ini (CLI): ${info.phpIni ?? '(tidak terbaca)'}`);
      console.log(`      build        : ${info.build ?? '?'}`);
    } else {
      console.log(`  - ${bin}  (php -i gagal dibaca)`);
    }
  }

  console.log(`\n  CATATAN: 'php.ini (CLI)' di atas dari php CLI — server web (FPM/OLS)`);
  console.log(`  memakai php.ini TERPISAH (mis. '<dir-php>/etc/php.ini'), dan itulah yang`);
  console.log(`  perlu diedit untuk membuat extension aktif di web.`);
  console.log(`\n  CATATAN ABI: nxdom.so harus cocok dengan build PHP target.`);
  console.log(`  Build Linux terhadap PHP resmi (phpize) — LSPHP (CyberPanel) mungkin`);
  console.log(`  perlu rebuild terpisah (lihat Apache.md). Cek baris 'build' di atas.`);

  console.log(`\n${'='.repeat(64)}`);
  console.log(`  PERINTAH PEMASANGAN (jalankan sebagai admin/sudo) — BELUM dijalankan`);
  console.log(`${'='.repeat(64)}\n`);

  console.log(`# 1. Salin extension .so ke extension_dir tiap PHP:`);
  for (const { bin, info } of infos) {
    if (info?.extensionDir) {
      console.log(`sudo cp nxdom.so "${info.extensionDir}/nxdom.so"   # untuk ${bin}`);
    }
  }

  console.log(`\n# 2. Daftarkan 'extension=nxdom' di php.ini (idempotent):`);
  for (const { info } of infos) {
    if (!info?.phpIni) continue;
    // php.ini FPM = nama 'php.ini' di direktori yang sama dengan php-cli.ini
    // (server web memakai yang ini; CLI yang dibaca php -i adalah php-cli.ini).
    const fpmIni = info.phpIni.replace(/php-cli\.ini$/, 'php.ini').replace(/php-cli\.ini$/i, 'php.ini');
    const target = fpmIni !== info.phpIni ? fpmIni : info.phpIni;
    console.log(`#   (web memakai: ${target})`);
    console.log(`grep -q '^extension *= *nxdom' "${target}" || echo 'extension = nxdom.so' | sudo tee -a "${target}"`);
  }

  console.log(`\n# 3. Front controller GLOBAL (sekali per server, di luar webroot):`);
  console.log(`sudo mkdir -p /www/nxdom && sudo tee /www/nxdom/index.php > /dev/null <<'PHP'`);
  console.log(FRONT_CONTROLLER.trimEnd());
  console.log(`PHP`);

  console.log(`\n# 4. Rewrite vhost (generik, tiap vhost app NxDom):`);
  console.log(`#   lokasi  → file rewrite generik`);
  console.log(`#   nginx   → /www/server/panel/vhost/nginx/<domain>.conf`);
  console.log(`#   Apache  → .htaccess domain / Include Editor`);
  console.log(`#   OLS     → WebAdmin Console → Virtual Host → Rewrite tab`);
  console.log(`#   contoh blok (nginx):`);
  console.log(`#     location ~ ^/nxdom\\.(config|manifest|policy)\\.json$ { return 403; }`);
  console.log(`#     location ^~ /pages/ { return 404; }`);
  console.log(`#     location / { try_files $uri @nxdom; }`);
  console.log(`#     location @nxdom { include fastcgi_params;`);
  console.log(`#       fastcgi_param SCRIPT_FILENAME /www/nxdom/index.php;`);
  console.log(`#       fastcgi_param SCRIPT_NAME /nxdom/index.php;`);
  console.log(`#       fastcgi_pass unix:/tmp/php-cgi-<VER>.sock; }`);

  console.log(`\n# 5. Restart service PHP:`);
  if (panel === 'aaPanel') {
    console.log(`sudo /etc/init.d/php-fpm-<VER> restart`);
    console.log(`sudo /etc/init.d/nginx reload`);
  } else if (panel === 'CyberPanel') {
    console.log(`sudo systemctl restart lsws`);
    console.log(`# (LSPHP: gunakan php.ini & extension_dir LSPHP, bukan PHP resmi)`);
  } else {
    console.log(`sudo systemctl restart php*-fpm  # atau sesuai service PHP`);
  }

  console.log(`\n# 6. Verifikasi:`);
  for (const { bin } of infos) {
    console.log(`"${bin}" -m | grep nxdom`);
  }

  console.log(`\n[nxdom-php] install-host selesai (hanya deteksi + cetak; tidak ada perubahan sistem).`);
}
