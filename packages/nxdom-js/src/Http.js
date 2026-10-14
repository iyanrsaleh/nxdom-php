export class NxdomApiError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'NxdomApiError';
    this.status = status;
  }
}

/**
 * Wrapper fetch() tipis. credentials: 'include' wajib supaya cookie session
 * (lihat Auth.php di server, session di-scope per-app) ikut terkirim —
 * tanpa ini, /api/auth/me dan route auth:true selalu 401 walau sudah login.
 */
export class Http {
  #baseUrl;

  constructor(baseUrl = '') {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
  }

  async request(method, path, body) {
    const res = await fetch(this.#baseUrl + path, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      throw new NxdomApiError(res.status, payload?.error ?? `Request gagal (${res.status})`);
    }

    return payload?.data ?? payload;
  }
}
