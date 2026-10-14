import { resolve } from 'node:path';
import { create } from './create.js';
import { build } from './build.js';
import { dev } from './dev.js';
import { readDevConfig, writeDevConfig, promptDevConfig } from './config.js';
import { install } from './install.js';
import { installHost } from './install-host.js';

function parseFlags(args) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else {
      positional.push(args[i]);
    }
  }
  return { positional, flags };
}

const USAGE = `nxdom-php — CLI development NxDom (README §20)

Usage:
  nxdom-php create <name> [targetDir]   Scaffold app baru
  nxdom-php build <app-dir> [--php <path-ke-php.exe>]
                                         Compile app.js + policy -> manifest.
                                         Dengan --php (atau .nxdomrc.json/env
                                         NXDOM_PHP_BIN tersedia), juga generate
                                         tabel sqlite dasar yang belum ada.
  nxdom-php dev <app-dir> [--php <path-ke-php.exe>] [--port 8080]
                                         Build + jalankan dev server + watch.
                                         Tanpa --php/--port dan belum ada
                                         .nxdomrc.json, akan ditanya sekali
                                         secara interaktif lalu disimpan.
  nxdom-php config <app-dir>            Isi ulang .nxdomrc.json (php.exe, port)
  nxdom-php install --php <path>        Cek ABI lalu pasang extension nxdom
                                         (php_nxdom.dll bundel) ke php.exe itu
  nxdom-php install-host [--php <path>] Deteksi hosting Linux (aaPanel/CyberPanel)
                                         dan CETAK perintah sudo pemasangan
                                         extension nxdom.so (tidak mengubah sistem)
`;

/**
 * Entrypoint logic nxdom-php, dipanggil dari cli/bin/nxdom-php.js (pola
 * bin/ tipis + src/ berisi logic, konsisten dengan proyek nxdom-cli
 * terpisah di D:\\Framework\\CLI\\nxdom — lihat Plan_01.md).
 */
export async function run(argv) {
  const [, , command, ...rest] = argv;

  switch (command) {
    case 'create': {
      const { positional } = parseFlags(rest);
      const [name, targetDir] = positional;
      const appDir = create(name, targetDir);
      console.log(`OK: app '${name}' dibuat di ${appDir}`);
      return;
    }

    case 'build': {
      const { positional, flags } = parseFlags(rest);
      const [appDir = '.'] = positional;
      const resolvedAppDir = resolve(appDir);
      const phpBin = flags.php ?? process.env.NXDOM_PHP_BIN ?? readDevConfig(resolvedAppDir)?.phpBin;
      build(resolvedAppDir, { phpBin });
      return;
    }

    case 'dev': {
      const { positional, flags } = parseFlags(rest);
      const [appDir = '.'] = positional;
      await dev(appDir, { phpBin: flags.php, port: flags.port ? Number(flags.port) : undefined });
      return;
    }

    case 'config': {
      const { positional } = parseFlags(rest);
      const [appDir = '.'] = positional;
      const resolvedAppDir = resolve(appDir);
      const existing = readDevConfig(resolvedAppDir);
      const updated = await promptDevConfig(existing);
      writeDevConfig(resolvedAppDir, updated);
      console.log(`OK: konfigurasi dev disimpan ke ${resolvedAppDir}\\.nxdomrc.json`);
      return;
    }

    case 'install': {
      const { flags } = parseFlags(rest);
      install(flags.php);
      return;
    }

    case 'install-host': {
      const { flags } = parseFlags(rest);
      installHost(flags.php);
      return;
    }

    default:
      console.log(USAGE);
      process.exitCode = command ? 1 : 0;
  }
}
