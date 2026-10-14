import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { resolve } from 'node:path';
import { templateDir, nxclientSrcDir } from './runtimePaths.js';

/**
 * nxdom-php create <name> [targetDir]
 * Scaffold app baru: index.html, app.js, nxdom.config.json, nxdom.policy.json,
 * assets/nxdom-client/ (salinan @nxdom/client — lihat index.html template,
 * yang mereferensikannya lewat importmap). Tanpa salinan ini, app hasil
 * create tidak bisa jalan di browser sama sekali (import specifier
 * '@nxdom/client' di app.js tidak akan ter-resolve).
 * Tidak membuat nxdom.manifest.json — itu dihasilkan `nxdom-php build`/`dev`
 * dari app.js + policy (M6), bukan ditulis manual sejak awal.
 */
export function create(name, targetDir) {
  if (!name || !/^[a-z][a-z0-9_-]*$/.test(name)) {
    throw new Error(`Nama app tidak valid: '${name}'. Wajib lowercase, diawali huruf, mis. 'myapp'.`);
  }

  const appDir = resolve(targetDir ?? '.', name);
  if (existsSync(appDir)) {
    throw new Error(`Folder sudah ada: ${appDir}. Pilih nama lain atau hapus dulu foldernya.`);
  }

  const templateAppDir = templateDir();

  mkdirSync(appDir, { recursive: true });
  cpSync(resolve(templateAppDir, 'app.js'), resolve(appDir, 'app.js'));
  cpSync(resolve(templateAppDir, 'nxdom.policy.json'), resolve(appDir, 'nxdom.policy.json'));
  cpSync(nxclientSrcDir(), resolve(appDir, 'assets/nxclient'), { recursive: true });

  const indexHtml = readFileSync(resolve(templateAppDir, 'index.html'), 'utf-8').replaceAll('{{APP_ID}}', name);
  writeFileSync(resolve(appDir, 'index.html'), indexHtml);

  const config = {
    id: name,
    database: { driver: 'sqlite', path: 'storage/db.sqlite' },
    auth: {
      secret: `dev-only-secret-${name}-change-me`,
      sessionTtl: 7200,
      table: 'users',
      identifier: 'email',
      passwordColumn: 'password',
    },
  };
  writeFileSync(resolve(appDir, 'nxdom.config.json'), JSON.stringify(config, null, 2) + '\n');

  return appDir;
}
