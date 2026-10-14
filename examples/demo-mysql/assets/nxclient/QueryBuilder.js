/**
 * Query builder sisi client. Menghasilkan query string yang dipahami
 * Router::handleQuery() di server (lihat nxdom/core/Router.php M5):
 *   ?where=kolom:operator:nilai (bisa berulang, di-AND-kan)
 *   &orderBy=kolom:arah (menggantikan orderBy manifest)
 *   &limit=N (dibatasi maxClientLimit di server)
 *
 * Constraints di sini HANYA tambahan opsional — manifest server tetap
 * menerapkan constraints wajibnya sendiri terlebih dulu dan client cuma
 * bisa menambah dalam batas whitelist (allowClientWhere/allowClientOrderBy/
 * maxClientLimit). Server menolak (403) bila kolom di luar whitelist.
 */
export class QueryBuilder {
  #http;
  #resource;
  #wheres = [];
  #orderBy = null;
  #limitValue = null;

  constructor(http, resource) {
    this.#http = http;
    this.#resource = resource;
  }

  where(column, operator, value) {
    if (arguments.length === 2) {
      value = operator;
      operator = '=';
    }
    this.#wheres.push([column, operator, value]);
    return this;
  }

  orderBy(column, direction = 'asc') {
    this.#orderBy = [column, direction];
    return this;
  }

  limit(n) {
    this.#limitValue = n;
    return this;
  }

  async get() {
    const params = new URLSearchParams();
    for (const [column, operator, value] of this.#wheres) {
      params.append('where', `${column}:${operator}:${value}`);
    }
    if (this.#orderBy) {
      params.set('orderBy', this.#orderBy.join(':'));
    }
    if (this.#limitValue != null) {
      params.set('limit', String(this.#limitValue));
    }

    const qs = params.toString();
    const path = `/api/${this.#resource}${qs ? `?${qs}` : ''}`;
    return this.#http.request('GET', path);
  }

  async find(id) {
    return this.#http.request('GET', `/api/${this.#resource}/${encodeURIComponent(id)}`);
  }

  async create(data) {
    return this.#http.request('POST', `/api/${this.#resource}`, data);
  }

  async update(id, data) {
    return this.#http.request('PUT', `/api/${this.#resource}/${encodeURIComponent(id)}`, data);
  }

  async delete(id) {
    return this.#http.request('DELETE', `/api/${this.#resource}/${encodeURIComponent(id)}`);
  }
}
