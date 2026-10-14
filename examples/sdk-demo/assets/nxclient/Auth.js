/**
 * Membungkus route auth manifest (/api/auth/register|login|logout|me).
 * Lihat nxdom/core/Auth.php untuk kontrak server-side.
 */
export class Auth {
  #http;

  constructor(http) {
    this.#http = http;
  }

  async register(data) {
    return this.#http.request('POST', '/api/auth/register', data);
  }

  async login(data) {
    return this.#http.request('POST', '/api/auth/login', data);
  }

  async logout() {
    return this.#http.request('POST', '/api/auth/logout');
  }

  async me() {
    return this.#http.request('GET', '/api/auth/me');
  }
}
