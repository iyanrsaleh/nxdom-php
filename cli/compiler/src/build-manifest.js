/**
 * Gabungkan hasil analyze() (path/method/resource/action dari app.js) dengan
 * nxdom.policy.json (fillable/auth/whitelist) menjadi nxdom.manifest.json
 * sesuai nxdom/config/manifest.schema.json. Lihat Plan.md Bagian 5 (M6).
 */

const ROUTE_TEMPLATE = {
  query: (resource) => ({ method: 'GET', path: `/api/${resource}` }),
  get: (resource) => ({ method: 'GET', path: `/api/${resource}/:id`, params: ['id'] }),
  create: (resource) => ({ method: 'POST', path: `/api/${resource}` }),
  update: (resource) => ({ method: 'PUT', path: `/api/${resource}/:id`, params: ['id'] }),
  delete: (resource) => ({ method: 'DELETE', path: `/api/${resource}/:id`, params: ['id'] }),
  register: () => ({ method: 'POST', path: '/api/auth/register' }),
  login: () => ({ method: 'POST', path: '/api/auth/login' }),
  logout: () => ({ method: 'POST', path: '/api/auth/logout' }),
  me: () => ({ method: 'GET', path: '/api/auth/me' }),
};

/**
 * Action yang WAJIB punya entri policy eksplisit sebelum boleh masuk
 * manifest — karena tanpa fillable, create/update bisa menerima field
 * apa saja dari body (mass-assignment). query/get/delete boleh tanpa
 * policy (delete tidak menulis data, get/query tidak fillable).
 */
const POLICY_REQUIRED_ACTIONS = ['create', 'update'];

export class PolicyMissingError extends Error {
  constructor(resource, action) {
    super(
      `Resource '${resource}' dipakai dengan action '${action}' di app.js, tapi tidak ada kebijakan ` +
      `nxdom.policy.json (resources.${resource}.${action}). Build ditolak untuk mencegah endpoint ` +
      `create/update tanpa whitelist fillable (mass-assignment). Tambahkan entri policy atau tulis ` +
      `manifest manual untuk route ini.`
    );
    this.name = 'PolicyMissingError';
    this.resource = resource;
    this.action = action;
  }
}

/**
 * Validasi struktur nxdom.policy.json.models saat build — Plan_02.md §9.5
 * poin 3. Beda dari policy.resources: ini TIDAK berasal dari analisis AST
 * app.js (Storage()/NXUI ada di luar cakupan analyze.js, yang hanya kenal
 * pola `@nxdom/client`/`nxdom.db()`) — dibaca LANGSUNG dari policy.json,
 * tanpa perlu "dipakai" di app.js dulu seperti resources biasa.
 */
const NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export class InvalidModelPolicyError extends Error {
  constructor(model, method, reason) {
    super(`nxdom.policy.json models.${model}.${method} tidak valid: ${reason}`);
    this.name = 'InvalidModelPolicyError';
    this.model = model;
    this.method = method;
  }
}

function validateModelMethod(model, method, spec) {
  if (!NAME_PATTERN.test(model)) {
    throw new InvalidModelPolicyError(model, method, `nama model '${model}' tidak valid (harus ${NAME_PATTERN})`);
  }
  if (!NAME_PATTERN.test(method)) {
    throw new InvalidModelPolicyError(model, method, `nama method '${method}' tidak valid (harus ${NAME_PATTERN})`);
  }
  if (!spec.table) {
    throw new InvalidModelPolicyError(model, method, `'table' wajib ada`);
  }
  if (spec.tableParam === true) {
    // 'table' berisi placeholder (mis. "$param.0"), bukan nama tabel literal
    // — validasi nama sebenarnya dilakukan runtime terhadap 'allowedTables'.
    if (!Array.isArray(spec.allowedTables) || spec.allowedTables.length === 0) {
      throw new InvalidModelPolicyError(
        model, method,
        `'tableParam: true' wajib disertai 'allowedTables' non-kosong (whitelist tabel — Plan_02.md §9.2, mencegah client memilih tabel arbitrer)`
      );
    }
    for (const t of spec.allowedTables) {
      if (!NAME_PATTERN.test(t)) {
        throw new InvalidModelPolicyError(model, method, `'allowedTables' berisi nama tabel tidak valid: '${t}'`);
      }
    }
  } else if (!NAME_PATTERN.test(spec.table)) {
    throw new InvalidModelPolicyError(model, method, `'table' harus match ${NAME_PATTERN} (kecuali 'tableParam: true')`);
  }
}

export function buildManifest(calls, policy) {
  const routes = [];

  for (const { resource, action } of calls) {
    const resourcePolicy = policy?.resources?.[resource] ?? {};
    const actionPolicy = resourcePolicy[action];

    if (POLICY_REQUIRED_ACTIONS.includes(action) && !actionPolicy) {
      throw new PolicyMissingError(resource, action);
    }

    const template = ROUTE_TEMPLATE[action](resource);
    const route = { ...template, resource, action };

    if (actionPolicy) {
      const { auth, ...constraints } = actionPolicy;
      if (auth) route.auth = true;
      if (Object.keys(constraints).length > 0) route.constraints = constraints;
    }

    routes.push(route);
  }

  if (policy?.models && Object.keys(policy.models).length > 0) {
    for (const [model, methods] of Object.entries(policy.models)) {
      for (const [method, spec] of Object.entries(methods)) {
        validateModelMethod(model, method, spec);
      }
    }

    // Satu route generik untuk SEMUA kombinasi model+method — dispatch-nya
    // baca body {model, method, params} saat runtime dan cocokkan ke resep
    // nxdom.policy.json.models, bukan satu route manifest per kombinasi
    // (lihat Plan_02.md §9.3 untuk alasan lengkap).
    routes.push({ method: 'POST', path: '/api/outside', resource: 'outside', action: 'outside' });
  }

  return { version: 1, routes };
}
