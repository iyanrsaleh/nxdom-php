import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postject from 'postject';
import { build } from 'esbuild';
import { EMBEDDED_ASSETS } from '../src/runtimePaths.js';

/**
 * Build nxdom-php.exe sebagai Node.js Single Executable Application
 * (SEA, fitur native Node 22+ — bukan pkg/nexe pihak ketiga), pola sama
 * seperti proyek nxdom-cli terpisah (D:\Framework\CLI\nxdom\scripts\
 * build-exe.mjs).
 *
 * Beda dari nxdom-cli: nxdom-php butuh EMBED 10 file non-kode (template
 * `create`, source compiler, source @nxdom/client dari packages/nxdom-js)
 * supaya `create`/`build` tetap berfungsi dari dalam .exe — tanpa ini,
 * import.meta.url kosong di bundle CJS (dibuktikan lewat build nyata
 * sebelum perbaikan ini) membuat create.js/build.js tidak bisa menemukan
 * aset-aset itu sama sekali. Daftar file diimpor dari runtimePaths.js
 * (EMBEDDED_ASSETS) sebagai SATU sumber kebenaran — bukan didaftarkan
 * dua kali secara terpisah di sini dan di sana.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '..');

function sourcePathForAsset(key, compilerBundlePath) {
  if (key.startsWith('nxclient/')) {
    return path.join(repoRoot, 'packages/nxdom-js/src', key.slice('nxclient/'.length));
  }
  if (key === 'compiler/cli.bundle.cjs') {
    return compilerBundlePath;
  }
  return path.join(root, key);
}
const distDir = path.join(root, 'dist');
const workDir = path.join(root, '.nxdom-php-exe-build');
const bundlePath = path.join(workDir, 'nxdom-php.cjs');
const blobPath = path.join(workDir, 'nxdom-php.blob');
const seaConfigPath = path.join(workDir, 'sea-config.json');
const exePath = path.join(distDir, 'nxdom-php.exe');
const sentinelFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} selesai dengan exit code ${code}`));
    });
  });
}

async function stripWindowsSignature(filename) {
  let executable = await fs.readFile(filename);
  const peOffset = executable.readUInt32LE(0x3c);
  const optionalHeader = peOffset + 24;
  const magic = executable.readUInt16LE(optionalHeader);
  const dataDirectories = optionalHeader + (magic === 0x20b ? 112 : 96);
  const securityDirectory = dataDirectories + 4 * 8;
  const certificateOffset = executable.readUInt32LE(securityDirectory);
  const certificateSize = executable.readUInt32LE(securityDirectory + 4);

  if (!certificateOffset || !certificateSize) return;
  executable.writeUInt32LE(0, securityDirectory);
  executable.writeUInt32LE(0, securityDirectory + 4);
  if (certificateOffset + certificateSize === executable.length) {
    executable = executable.subarray(0, certificateOffset);
  }
  await fs.writeFile(filename, executable);
}

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('build-exe.mjs harus dijalankan pada Windows x64');
}
if (Number(process.versions.node.split('.')[0]) < 22) {
  throw new Error(`build-exe.mjs memerlukan Node 22+ (aktif: ${process.version})`);
}

const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));

await fs.rm(distDir, { recursive: true, force: true });
await fs.rm(workDir, { recursive: true, force: true });
await fs.mkdir(distDir, { recursive: true });
await fs.mkdir(workDir, { recursive: true });

try {
  await build({
    entryPoints: [path.join(root, 'bin', 'nxdom-php.js')],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    define: {
      __NXDOM_PHP_VERSION__: JSON.stringify(pkg.version),
    },
    logLevel: 'info',
  });

  /**
   * Bundle compiler (compiler/src/cli.js + acorn/acorn-walk) jadi SATU
   * file CJS mandiri — SEA assets memateriaisasi file individual TANPA
   * node_modules-nya, jadi source asli compiler (yang masih `import
   * 'acorn'`) tidak akan resolve saat dijalankan sebagai proses Node
   * terpisah dari dalam .exe (dibuktikan lewat pengujian nyata sebelum
   * perbaikan ini: ERR_MODULE_NOT_FOUND 'acorn').
   */
  const compilerBundlePath = path.join(workDir, 'compiler.cli.bundle.cjs');
  await build({
    entryPoints: [path.join(root, 'compiler', 'src', 'cli.js')],
    outfile: compilerBundlePath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    logLevel: 'info',
  });

  const assets = Object.fromEntries(
    EMBEDDED_ASSETS.map((key) => [key, sourcePathForAsset(key, compilerBundlePath)])
  );

  await fs.writeFile(
    seaConfigPath,
    JSON.stringify(
      {
        main: bundlePath,
        output: blobPath,
        disableExperimentalSEAWarning: true,
        useSnapshot: false,
        useCodeCache: false,
        assets,
      },
      null,
      2
    )
  );

  await run(process.execPath, ['--experimental-sea-config', seaConfigPath]);
  await fs.copyFile(process.execPath, exePath);
  await stripWindowsSignature(exePath);
  await postject.inject(exePath, 'NODE_SEA_BLOB', await fs.readFile(blobPath), { sentinelFuse });

  const executable = await fs.readFile(exePath);
  const checksum = createHash('sha256').update(executable).digest('hex');
  await fs.writeFile(path.join(distDir, 'SHA256SUMS.txt'), `${checksum}  nxdom-php.exe\n`);

  console.log(`\nSelesai: ${exePath}`);
  console.log(`SHA-256: ${checksum}`);
} finally {
  await fs.rm(workDir, { recursive: true, force: true });
}
