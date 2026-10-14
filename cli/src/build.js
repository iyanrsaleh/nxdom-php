import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { isSea } from 'node:sea';
import { compilerCliPath, ensureSchemaScriptPath } from './runtimePaths.js';

/**
 * nxdom-php build <app-dir> [--php <path-ke-php.exe>]
 * Wrapper tipis di atas @nxdom/compiler (M6): jalankan sebagai proses Node
 * terpisah supaya error compiler (UnsupportedPatternError/PolicyMissingError)
 * tampil apa adanya ke terminal, dan exit code mencerminkan sukses/gagal.
 *
 * Interpreter proses child: `process.execPath` di mode dev normal adalah
 * node.exe sungguhan, cocok dipakai langsung. Di mode .exe SEA,
 * `process.execPath` adalah nxdom-php.exe ITU SENDIRI (bukan node.exe) —
 * memanggilnya dengan argumen path .js compiler tidak akan menjalankan
 * compiler, melainkan nxdom-php.exe lagi dengan argumen yang tidak
 * dikenalinya. Karena itu, mode SEA wajib memakai `node` dari PATH
 * (developer yang menjalankan .exe tetap harus punya Node terpasang
 * untuk build/dev — hanya nxdom-php sendiri yang tidak butuh Node
 * terpasang untuk dijalankan).
 *
 * Setelah compile sukses, kalau `phpBin` diketahui (diberikan eksplisit,
 * atau dipanggil dari dev.js yang sudah punya php.exe resolved),
 * jalankan cli/scripts/ensure-schema.php (Plan_01.md poin 2) — generate
 * `CREATE TABLE IF NOT EXISTS` sederhana untuk resource yang tabelnya
 * belum ada, dari union fillable di manifest. Tanpa phpBin diketahui
 * sama sekali, langkah ini di-skip diam-diam (bukan error) — compile
 * manifest tetap berhasil seperti sebelumnya.
 */
export function build(appDir, { phpBin } = {}) {
  const resolvedAppDir = resolve(appDir);
  const interpreter = isSea() ? 'node' : process.execPath;
  execFileSync(interpreter, [compilerCliPath(), resolvedAppDir], { stdio: 'inherit' });

  if (phpBin) {
    execFileSync(phpBin, [ensureSchemaScriptPath(), resolvedAppDir], { stdio: 'inherit' });
  }
}
