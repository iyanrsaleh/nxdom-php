#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { analyze, UnsupportedPatternError } from './analyze.js';
import { buildManifest, PolicyMissingError, InvalidModelPolicyError } from './build-manifest.js';

/**
 * Usage: node compiler/src/cli.js <path-ke-folder-app>
 * Baca <app>/app.js + <app>/nxdom.policy.json, tulis <app>/nxdom.manifest.json.
 */

const appDir = process.argv[2];
if (!appDir) {
  console.error('Usage: node cli.js <path-ke-folder-app>');
  process.exit(1);
}

const appJsPath = resolve(appDir, 'app.js');
const policyPath = resolve(appDir, 'nxdom.policy.json');
const manifestPath = resolve(appDir, 'nxdom.manifest.json');

if (!existsSync(appJsPath)) {
  console.error(`FAIL: ${appJsPath} tidak ditemukan`);
  process.exit(1);
}

const source = readFileSync(appJsPath, 'utf-8');
const policy = existsSync(policyPath)
  ? JSON.parse(readFileSync(policyPath, 'utf-8'))
  : { resources: {} };

try {
  const { calls, importAlias } = analyze(source);
  const hasModelPolicy = policy?.models && Object.keys(policy.models).length > 0;

  /* importAlias hanya WAJIB kalau app benar-benar memakai nxdom.db()/
   * nxdom.auth.*() di kode client (calls.length > 0) — app yang murni
   * memakai jalur model (policy.models, Plan_02.md §9, endpoint
   * /api/outside) TIDAK PERNAH menulis import '@nxdom/client' sama
   * sekali (kontraknya lewat NXUI Storage().models(), bukan @nxdom/client)
   * — mewajibkan import yang sengaja tidak dipakai hanya supaya compiler
   * tidak menolak adalah workaround janggal, bukan solusi yang benar. */
  if (calls.length > 0 && !importAlias) {
    console.error(`FAIL: ditemukan pemanggilan nxdom.db()/nxdom.auth.*() di ${appJsPath}, tapi tidak ada "import nxdom from '@nxdom/client'"`);
    process.exit(1);
  }

  if (calls.length === 0 && !hasModelPolicy) {
    console.error(`FAIL: tidak ada pemanggilan nxdom.db()/nxdom.auth.*() yang dikenali di ${appJsPath}, dan nxdom.policy.json tidak punya 'models' (route /api/outside)`);
    process.exit(1);
  }

  const manifest = buildManifest(calls, policy);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

  console.log(`OK: ${manifest.routes.length} route ditulis ke ${manifestPath}`);
  for (const r of manifest.routes) {
    console.log(`  ${r.method.padEnd(6)} ${r.path}`);
  }
} catch (err) {
  if (err instanceof UnsupportedPatternError || err instanceof PolicyMissingError || err instanceof InvalidModelPolicyError) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }
  throw err;
}
