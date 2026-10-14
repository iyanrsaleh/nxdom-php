import { Http, NxdomApiError } from './Http.js';
import { QueryBuilder } from './QueryBuilder.js';
import { Auth } from './Auth.js';

/**
 * SDK client NxDom (README §14: "NxDom Application API", bukan Node.js API).
 * Contoh:
 *   import nxdom from "nxdom";
 *   const users = await nxdom.db("users").where("active", true).get();
 */
export function createClient(baseUrl = '') {
  const http = new Http(baseUrl);
  const auth = new Auth(http);

  return {
    db(resource) {
      return new QueryBuilder(http, resource);
    },
    auth,
  };
}

const nxdom = createClient();

export default nxdom;
export { NxdomApiError };
