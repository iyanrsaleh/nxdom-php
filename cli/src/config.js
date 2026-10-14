import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

const CONFIG_FILENAME = '.nxdomrc.json';

function configPath(appDir) {
  return resolve(appDir, CONFIG_FILENAME);
}

/**
 * Config dev per-project (path php.exe, port) — TERPISAH dari
 * nxdom.config.json (yang berisi kredensial DB/auth app, ikut di-deploy
 * ke server). .nxdomrc.json murni preferensi mesin developer lokal
 * (path php.exe pasti beda per developer/mesin) — tidak untuk di-commit
 * ke source control bersama app (mirip .env lokal).
 */
export function readDevConfig(appDir) {
  const file = configPath(appDir);
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, 'utf-8'));
}

export function writeDevConfig(appDir, config) {
  writeFileSync(configPath(appDir), JSON.stringify(config, null, 2) + '\n');
}

/**
 * Menjawab N pertanyaan berurutan dari satu readline.Interface, dengan
 * BUFFER untuk baris yang datang sebelum ada yang menunggunya.
 *
 * Ditemukan lewat pengujian nyata (bukan asumsi): pada stdin non-TTY
 * (pipe/redirect — termasuk lingkungan agent/CI ini, juga di Windows),
 * readline bisa meng-emit BEBERAPA event 'line' secara síncron
 * berturut-turut untuk seluruh isi buffer input sekaligus, jauh lebih
 * cepat dari konsumen async (`await` + kode di antaranya) memprosesnya
 * satu per satu. Pola "satu listener, resolver diambil dari antrian
 * FIFO" (tanpa buffer) membuang baris yang tiba saat antrian resolver
 * masih kosong — persis kasus baris kedua di sini. Solusinya: baris
 * yang tiba tanpa resolver menunggu disimpan ke buffer FIFO sendiri,
 * dan setiap prompt baru mengecek buffer itu lebih dulu sebelum
 * mendaftar sebagai resolver baru.
 */
function createPromptQueue(rl) {
  const lineBuffer = [];
  const resolvers = [];
  rl.on('line', (line) => {
    const next = resolvers.shift();
    if (next) next(line.trim());
    else lineBuffer.push(line.trim());
  });
  return (question) => {
    process.stdout.write(question);
    if (lineBuffer.length > 0) {
      return Promise.resolve(lineBuffer.shift());
    }
    return new Promise((resolve) => resolvers.push(resolve));
  };
}

/**
 * Tanya interaktif path php.exe + port, simpan ke .nxdomrc.json di
 * appDir. Dipanggil hanya saat dev() tidak punya nilai dari flag/env/
 * config tersimpan sama sekali (lihat dev.js) — sekali diisi, run
 * berikutnya tidak akan menanyakan ini lagi kecuali file dihapus atau
 * `nxdom-php config` dijalankan ulang secara eksplisit.
 */
export async function promptDevConfig(existing) {
  console.log('[nxdom-php] Konfigurasi dev belum ada untuk app ini — diisi sekali, disimpan ke .nxdomrc.json.\n');

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const prompt = createPromptQueue(rl);
  try {
    const phpDefault = existing?.phpBin ?? process.env.NXDOM_PHP_BIN ?? '';
    const phpAnswer = await prompt(`  Path php.exe${phpDefault ? ` [${phpDefault}]` : ''}: `);
    const phpBin = phpAnswer || phpDefault;
    if (!phpBin) {
      throw new Error('Path php.exe wajib diisi.');
    }

    const portDefault = existing?.port ?? 8080;
    const portAnswer = await prompt(`  Port [${portDefault}]: `);
    const port = portAnswer ? Number(portAnswer) : portDefault;
    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Port tidak valid: '${portAnswer}'.`);
    }

    return { phpBin, port };
  } finally {
    rl.close();
  }
}
