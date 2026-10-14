/**
 * NexaRebit — klien JS untuk API NexaRebit.php (session, /data, upload, import).
 * Sama-origin: gunakan credentials: 'include' agar cookie NEXAREBITSESSID terkirim.
 *
 * @example
 * const api = new NexaRebit('https://domain/rebit');
 * await api.connectSession({ host: 'localhost', user: 'u', password: 'p', database: 'db' });
 * const tables = await api.listTables();
 * const rows = await api.listRows('news', { page: 1, pageSize: 10, fields: ['id', 'title'] });
 */
class NexaRebit {
  /**
   * @param {string} baseUrl - Origin + path folder API tanpa slash akhir, mis. https://domain/rebit
   * @param {{ credentials?: RequestCredentials, fetch?: typeof fetch }} [options]
   */
  constructor(baseUrl, options = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.credentials = options.credentials ?? 'include';
    this._fetch = options.fetch ?? fetch.bind(globalThis);
  }

  static get version() {
    return '1.0.0';
  }

  /** @param {string} path - diawali / */
  _url(path) {
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${p}`;
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {{ json?: object, body?: BodyInit, headers?: Record<string, string> }} [opts]
   */
  async _request(method, path, opts = {}) {
    const headers = { ...opts.headers };
    let body = opts.body;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    }
    const res = await this._fetch(this._url(path), {
      method,
      credentials: this.credentials,
      headers,
      body,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text };
      }
    }
    if (!res.ok) {
      const err = new Error(
        (data && data.error) || res.statusText || `HTTP ${res.status}`
      );
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  /**
   * Simpan koneksi DB di session (cookie).
   * @param {{ host?: string, user?: string, password?: string, database?: string, dbHost?: string, dbUser?: string, dbPass?: string, dbName?: string }} cfg
   */
  connectSession(cfg) {
    return this._request('POST', '/session', { json: cfg });
  }

  /** Cek session (tanpa password di respons). */
  getSession() {
    return this._request('GET', '/session');
  }

  /** Hapus koneksi dari session. */
  deleteSession() {
    return this._request('DELETE', '/session');
  }

  /** Daftar tabel + jumlah baris + url. */
  listTables() {
    return this._request('GET', '/data');
  }

  /**
   * Bangun query string untuk GET /data/{table} (filter JSON, fields, dll.)
   * @param {NexaRebitQueryParams} [params]
   * @returns {string}
   */
  static buildDataQuery(params = {}) {
    const q = new URLSearchParams();
    if (params.page != null) q.set('page', String(params.page));
    if (params.pageSize != null) q.set('pageSize', String(params.pageSize));
    if (params.sort) q.set('sort', params.sort);
    if (params.order) q.set('order', params.order);
    if (params.filter != null && typeof params.filter === 'object') {
      q.set('filter', JSON.stringify(params.filter));
    }
    if (params.where != null && typeof params.where === 'object') {
      q.set('where', JSON.stringify(params.where));
    }
    const col = params.fields != null ? params.fields : params.columns;
    if (col != null) {
      const f = Array.isArray(col) ? col.join(',') : String(col);
      if (f) q.set('fields', f);
    }
    const s = q.toString();
    return s ? `?${s}` : '';
  }

  /**
   * Baris tabel + pagination (+ filter, sort, fields).
   * @param {string} table
   * @param {NexaRebitQueryParams} [params]
   */
  listRows(table, params) {
    const qs = NexaRebit.buildDataQuery(params || {});
    return this._request('GET', `/data/${encodeURIComponent(table)}${qs}`);
  }

  /**
   * Satu baris by id.
   * @param {string} table
   * @param {number|string} id
   * @param {string|string[]} [fields] - kolom atau array nama kolom
   */
  getRow(table, id, fields) {
    let qs = '';
    if (fields != null) {
      const f = Array.isArray(fields) ? fields.join(',') : String(fields);
      qs = f ? `?fields=${encodeURIComponent(f)}` : '';
    }
    return this._request('GET', `/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}${qs}`);
  }

  /**
   * @param {string} table
   * @param {Record<string, unknown>} row
   */
  insert(table, row) {
    return this._request('POST', `/data/${encodeURIComponent(table)}`, { json: row });
  }

  /**
   * @param {string} table
   * @param {number|string} id
   * @param {Record<string, unknown>} row
   */
  update(table, id, row) {
    return this._request('PUT', `/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`, {
      json: row,
    });
  }

  /**
   * @param {string} table
   * @param {number|string} id
   */
  deleteRow(table, id) {
    return this._request('DELETE', `/data/${encodeURIComponent(table)}/${encodeURIComponent(id)}`);
  }

  /**
   * Impor CSV/JSON multipart ke tabel.
   * @param {string} table
   * @param {File|Blob} file
   * @param {'csv'|'json'} [format]
   */
  async importFile(table, file, format) {
    const fd = new FormData();
    fd.append('file', file);
    if (format) fd.append('format', format);
    const path =
      table === 'image'
        ? `/import/${encodeURIComponent(table)}`
        : `/upload/${encodeURIComponent(table)}`;
    const res = await this._fetch(this._url(path), {
      method: 'POST',
      credentials: this.credentials,
      body: fd,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text };
      }
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  /**
   * Unggah gambar ke /upload/image atau /upload/image/{subfolder}
   * @param {File|Blob} file
   * @param {string} [imageSubfolder] - mis. "produk/thumb" (tanpa slash awal/akhir)
   */
  async uploadImage(file, imageSubfolder) {
    const fd = new FormData();
    fd.append('file', file);
    let path = '/upload/image';
    if (imageSubfolder) {
      const seg = String(imageSubfolder).replace(/^\/+|\/+$/g, '');
      if (seg) path += `/${seg.split('/').map(encodeURIComponent).join('/')}`;
    }
    const res = await this._fetch(this._url(path), {
      method: 'POST',
      credentials: this.credentials,
      body: fd,
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text };
      }
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || res.statusText || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  /**
   * URL unduhan export (buka di tab atau window.location).
   * @param {string} table
   * @param {'csv'|'json'|'excel'|'xlsx'} format
   * @param {{ page?: number, pageSize?: number }} [query]
   */
  exportUrl(table, format, query = {}) {
    const q = new URLSearchParams();
    if (query.page != null) q.set('page', String(query.page));
    if (query.pageSize != null) q.set('pageSize', String(query.pageSize));
    const qs = q.toString();
    const ext = format === 'xlsx' ? 'excel' : format;
    return `${this._url(`/api/export/${encodeURIComponent(table)}/${ext}`)}${qs ? `?${qs}` : ''}`;
  }

  /** GET /api/export/{table}/info */
  exportInfo(table, pageSize) {
    let qs = '';
    if (pageSize != null) qs = `?pageSize=${encodeURIComponent(String(pageSize))}`;
    return this._request('GET', `/api/export/${encodeURIComponent(table)}/info${qs}`);
  }
}

/**
 * @typedef {object} NexaRebitQueryParams
 * @property {number} [page]
 * @property {number} [pageSize]
 * @property {string} [sort]
 * @property {'asc'|'desc'|'ASC'|'DESC'} [order]
 * @property {Record<string, unknown>} [filter]
 * @property {Record<string, unknown>} [where]
 * @property {string|string[]} [fields]
 * @property {string|string[]} [columns] - alias sama seperti fields
 */

if (typeof globalThis !== 'undefined') {
  globalThis.NexaRebit = NexaRebit;
}

export { NexaRebit };
export default NexaRebit;
