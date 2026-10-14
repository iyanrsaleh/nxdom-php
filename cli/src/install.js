import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bundledDllPath } from './runtimePaths.js';

/**
 * ABI persis yang dibutuhkan cli/install/php_nxdom.dll — nilai ini
 * HARUS diperbarui manual setiap kali .dll bundel diganti dengan hasil
 * build baru (lihat install.md untuk proses build-nya). Dibaca dari
 * `php -i` milik php.exe yang dipakai untuk build .dll ini sendiri
 * (server rujukan `C:\Tnserver\bin\php\php.exe`), bukan ditebak.
 *
 * `PHP Extension Build` (mis. "API20210902,TS,VS16") adalah satu-satunya
 * field yang benar-benar dicek ketat oleh PHP saat me-load extension —
 * ia sudah menggabungkan Zend API version, thread safety, dan compiler
 * toolset jadi satu string (install.md Bagian "Target build"). Field
 * lain (PHP Version, Architecture) ditampilkan untuk konteks/pesan
 * error yang lebih jelas ke user, bukan sebagai kriteria cek tambahan
 * yang independen.
 */
const REQUIRED_EXTENSION_BUILD = 'API20210902,TS,VS16';
const REQUIRED_ARCH = 'x64';

function phpInfo(phpBin) {
  const output = execFileSync(phpBin, ['-i'], { encoding: 'utf-8' });
  const get = (label) => {
    /**
     * Direktif ini (extension_dir, dll.) dicetak php -i sebagai TIGA
     * kolom "nama => local_value => master_value" (dibuktikan lewat
     * output nyata: "extension_dir => C:\...\ext => C:\...\ext") —
     * bukan satu kolom seperti field info biasa (PHP Version, dst.).
     * Ambil hanya kolom pertama setelah "=>", bukan sisa baris.
     */
    const match = output.match(new RegExp(`^${label}\\s*=>\\s*([^\\r\\n]+?)(?:\\s*=>.*)?$`, 'm'));
    return match ? match[1].trim() : null;
  };
  return {
    version: get('PHP Version'),
    architecture: get('Architecture'),
    extensionBuild: get('PHP Extension Build'),
    extensionDir: get('extension_dir'),
    phpIniPath: get('Loaded Configuration File'),
  };
}

/**
 * nxdom-php install --php <path-ke-php.exe>
 *
 * Mengecek apakah php.exe target ABI-cocok dengan php_nxdom.dll yang
 * dibundel (cli/install/), dan HANYA menyalin + mendaftarkan
 * `extension=nxdom` ke php.ini kalau cocok persis — menolak eksplisit
 * kalau tidak, mengarahkan ke install.md untuk build ulang sendiri
 * (native extension sangat sensitif ABI, install.md menekankan ini
 * berkali-kali: build yang tidak cocok gagal load, bukan gagal
 * sebagian).
 */
export function install(phpBin) {
  if (!phpBin) {
    throw new Error('Path php.exe wajib diisi. Contoh: nxdom-php install --php C:\\path\\ke\\php.exe');
  }
  if (!existsSync(phpBin)) {
    throw new Error(`php.exe tidak ditemukan di: ${phpBin}`);
  }
  const bundledDll = bundledDllPath();
  if (!existsSync(bundledDll)) {
    throw new Error(`Bundel php_nxdom.dll tidak ditemukan di ${bundledDll} — instalasi nxdom-php ini tidak lengkap.`);
  }

  const info = phpInfo(phpBin);

  console.log(`[nxdom-php] Target: ${phpBin}`);
  console.log(`  PHP Version         : ${info.version ?? '(tidak terbaca)'}`);
  console.log(`  Architecture        : ${info.architecture ?? '(tidak terbaca)'}`);
  console.log(`  PHP Extension Build : ${info.extensionBuild ?? '(tidak terbaca)'}`);

  if (info.extensionBuild !== REQUIRED_EXTENSION_BUILD || info.architecture !== REQUIRED_ARCH) {
    throw new Error(
      `php_nxdom.dll bundel ini TIDAK cocok dengan php.exe target.\n` +
      `  Dibutuhkan : Architecture=${REQUIRED_ARCH}, PHP Extension Build=${REQUIRED_EXTENSION_BUILD}\n` +
      `  Target     : Architecture=${info.architecture ?? '?'}, PHP Extension Build=${info.extensionBuild ?? '?'}\n\n` +
      `Native extension sangat sensitif ABI (lihat install.md Bagian "Target build") — .dll yang tidak cocok ` +
      `persis akan gagal di-load, bukan gagal sebagian. Build ulang sendiri mengikuti install.md untuk target ini, ` +
      `lalu salin hasilnya manual ke extension_dir + daftarkan 'extension=nxdom' di php.ini (lihat Apache.md Langkah 1-3).`
    );
  }

  if (!info.extensionDir || !existsSync(info.extensionDir)) {
    throw new Error(`extension_dir tidak terbaca atau tidak ada: ${info.extensionDir ?? '(kosong)'}`);
  }

  const targetDll = join(info.extensionDir, 'php_nxdom.dll');
  try {
    copyFileSync(bundledDll, targetDll);
  } catch (err) {
    if (err.code === 'EBUSY') {
      throw new Error(
        `Gagal menyalin ke ${targetDll} — file sedang terkunci.\n` +
        `Ini terjadi kalau ada proses PHP/Apache yang sedang memakai extension ini (lihat Apache.md Langkah 1). ` +
        `Hentikan Apache/proses PHP terkait dulu, lalu jalankan ulang 'nxdom-php install'.`
      );
    }
    throw err;
  }
  console.log(`\n[nxdom-php] Disalin: ${targetDll}`);

  const phpIniPath = info.phpIniPath;

  if (!phpIniPath || phpIniPath === '(none)' || !existsSync(phpIniPath)) {
    console.log(
      `\n[nxdom-php] Tidak ada php.ini aktif yang terdeteksi (Loaded Configuration File: ${phpIniPath ?? '(none)'}).\n` +
      `Tambahkan manual baris berikut ke php.ini yang dipakai php.exe ini:\n\n  extension=nxdom\n`
    );
    return;
  }

  const iniContent = readFileSync(phpIniPath, 'utf-8');
  if (/^\s*extension\s*=\s*nxdom\s*$/m.test(iniContent)) {
    console.log(`[nxdom-php] 'extension=nxdom' sudah ada di ${phpIniPath} — tidak diubah lagi.`);
  } else {
    writeFileSync(phpIniPath, iniContent.replace(/\n$/, '') + '\nextension=nxdom\n');
    console.log(`[nxdom-php] Ditambahkan 'extension=nxdom' ke ${phpIniPath}`);
  }

  console.log(`\n[nxdom-php] Verifikasi: "${phpBin}" -m | findstr nxdom`);
}

/**
 * Cek cepat apakah extension nxdom sudah termuat di php.exe tsb —
 * dipakai `dev.js` untuk memberi peringatan dini SEBELUM men-spawn
 * server (tanpa ini, kegagalan baru terlihat sebagai request /api/*
 * yang selalu 404, tanpa petunjuk penyebabnya extension belum aktif).
 */
export function isNxdomLoaded(phpBin) {
  try {
    const output = execFileSync(phpBin, ['-m'], { encoding: 'utf-8' });
    return /^nxdom$/m.test(output);
  } catch {
    return false;
  }
}
