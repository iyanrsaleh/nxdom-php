import { parse } from 'acorn';
import { simple } from 'acorn-walk';

/**
 * Compiler NxDom v1 — cakupan pola yang DIDUKUNG (lihat Plan.md M6):
 *   nxdom.db("<resource>").get()          -> { resource, action: "query" }
 *   nxdom.db("<resource>").find(id)       -> { resource, action: "get" }
 *   nxdom.db("<resource>").create(data)   -> { resource, action: "create" }
 *   nxdom.db("<resource>").update(id, d)  -> { resource, action: "update" }
 *   nxdom.db("<resource>").delete(id)     -> { resource, action: "delete" }
 *   nxdom.auth.register/login/logout/me() -> { resource: "auth", action }
 *
 * TIDAK didukung (v1) — ditolak eksplisit, bukan diam-diam diabaikan:
 *   - argumen resource bukan string literal (mis. variabel, template literal
 *     dinamis) -> tidak bisa ditentukan saat compile-time.
 *   - pemanggilan chain lewat variabel perantara, mis.
 *     `const q = nxdom.db("users"); q.get();` -> analisis statis sederhana
 *     ini tidak melacak alias variabel.
 *   - import selain `import nxdom from "..."` (default import) — named
 *     import atau alias lain tidak dikenali.
 *
 * Developer yang butuh pola di luar ini harus menulis nxdom.manifest.json
 * secara manual untuk route tsb (seperti M0-M5 sebelum compiler ada).
 */

const DB_ACTIONS = {
  get: 'query',
  find: 'get',
  create: 'create',
  update: 'update',
  delete: 'delete',
};

const AUTH_ACTIONS = ['register', 'login', 'logout', 'me'];

export class UnsupportedPatternError extends Error {
  constructor(message, node) {
    super(message);
    this.name = 'UnsupportedPatternError';
    this.loc = node?.loc ?? null;
  }
}

/**
 * @param {string} source kode app.js
 * @returns {{ calls: Array<{resource: string, action: string}>, importAlias: string|null }}
 */
export function analyze(source) {
  const ast = parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
  });

  let importAlias = null;
  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration' && node.source.value === '@nxdom/client') {
      const def = node.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
      if (def) importAlias = def.local.name;
    }
  }

  if (!importAlias) {
    return { calls: [], importAlias: null };
  }

  const calls = [];
  const seen = new Set();

  simple(ast, {
    CallExpression(node) {
      const call = tryMatchDbCall(node, importAlias) ?? tryMatchAuthCall(node, importAlias);
      if (!call) return;

      const key = `${call.method}:${call.action}:${call.resource}`;
      if (seen.has(key)) return;
      seen.add(key);
      calls.push(call);
    },
  });

  return { calls, importAlias };
}

/**
 * Cocokkan nxdom.db("resource").<method>(...), termasuk saat ada
 * chain constraints dinamis (.where()/.orderBy()/.limit(), lihat M5) di
 * antara nxdom.db(...) dan method akhir, mis.:
 *   nxdom.db("users").where("active", true).orderBy("name").get()
 * Method chain di tengah TIDAK memengaruhi manifest (constraints dinamis
 * itu urusan per-request, bukan kontrak route) — compiler hanya perlu
 * menembusnya untuk sampai ke resource literal di akar chain.
 */
const CHAINABLE_METHODS = ['where', 'orderBy', 'limit'];

function tryMatchDbCall(node, alias) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return null;

  const method = callee.property.name;
  if (!(method in DB_ACTIONS)) return null;

  const dbCall = findDbRoot(callee.object, alias);
  if (!dbCall) return null;

  const resourceArg = dbCall.arguments[0];
  if (!resourceArg || resourceArg.type !== 'Literal' || typeof resourceArg.value !== 'string') {
    throw new UnsupportedPatternError(
      `nxdom.db(...) dipanggil dengan argumen bukan string literal — tidak bisa dianalisis statis. Tulis manifest manual untuk route ini.`,
      dbCall
    );
  }

  return { resource: resourceArg.value, action: DB_ACTIONS[method], method: 'db' };
}

/**
 * Telusuri mundur lewat chain .where()/.orderBy()/.limit() sampai
 * menemukan pemanggilan akar nxdom.db(...), atau null bila node bukan
 * bagian dari chain tsb sama sekali.
 */
function findDbRoot(node, alias) {
  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    node.callee.object.type === 'Identifier' &&
    node.callee.object.name === alias &&
    node.callee.property.name === 'db'
  ) {
    return node;
  }

  if (
    node.type === 'CallExpression' &&
    node.callee.type === 'MemberExpression' &&
    CHAINABLE_METHODS.includes(node.callee.property.name)
  ) {
    return findDbRoot(node.callee.object, alias);
  }

  return null;
}

/**
 * Cocokkan nxdom.auth.<method>(...)
 */
function tryMatchAuthCall(node, alias) {
  const callee = node.callee;
  if (callee.type !== 'MemberExpression') return null;

  const method = callee.property.name;
  if (!AUTH_ACTIONS.includes(method)) return null;

  const authObj = callee.object;
  if (
    authObj.type !== 'MemberExpression' ||
    authObj.object.type !== 'Identifier' ||
    authObj.object.name !== alias ||
    authObj.property.name !== 'auth'
  ) {
    return null;
  }

  return { resource: 'auth', action: method, method: 'auth' };
}
