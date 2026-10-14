import { NexaFetch, nexaFetch } from "./NexaFetch.js";
import NexaEncrypt from "./NexaEncrypt.js";
import NexaModels from "./NexaModels.js";
import { NexaFederated } from "./NexaFederated.js";
import { IndexedDBManager } from "./IndexDB.js";
import { LocalStorageManager } from "./localStorage.js";

/**
 * Circuit breaker untuk endpoint /outside.
 * Jika satu request gagal (network error), semua request berikutnya langsung skip
 * selama COOLDOWN_MS tanpa mencoba HTTP — mencegah banjir net::ERR_EMPTY_RESPONSE
 * di DevTools saat backend offline.
 */
let _outsideCbUntil = 0;
const OUTSIDE_CB_COOLDOWN = 30000;

function _isOutsideCircuitOpen() {
  return Date.now() < _outsideCbUntil;
}

function _tripOutsideCircuit() {
  _outsideCbUntil = Date.now() + OUTSIDE_CB_COOLDOWN;
}

/** Reset circuit breaker — panggil saat NEXA.apiBase diganti */
function _resetOutsideCircuit() {
  _outsideCbUntil = 0;
}

// Pasang interceptor global di nexaFetch — blokir request /outside SEBELUM fetch()
// agar Chrome tidak mencetak net::ERR_EMPTY_RESPONSE ke DevTools.
// Interceptor ini melindungi SEMUA kode (package proxy, models, get, post, dll).
try {
  nexaFetch.addRequestInterceptor(function _nexaOutsideCircuitBreaker(config) {
    if (!config || typeof config.url !== 'string') return config;
    if (config.method !== 'POST') return config;
    if (!config.url.includes('/outside')) return config;
    if (!_isOutsideCircuitOpen()) return config;
    const remain = Math.round((_outsideCbUntil - Date.now()) / 1000);
    const err = new Error(`Backend offline (circuit breaker, coba lagi ${remain}s)`);
    err.name = 'CircuitBreakerError';
    throw err;
  });
  // Trip circuit pada network error dari SEMUA jalur (package proxy, models, dll)
  nexaFetch.onError(function _nexaOutsideCircuitTripper(err) {
    if (!err) return;
    if (err.name === 'TypeError' || /Failed to fetch|NetworkError|ERR_EMPTY_RESPONSE|ERR_CONNECTION/i.test(String(err?.message || err))) {
      _tripOutsideCircuit();
    }
  });
} catch (_) {
  /* abaikan jika nexaFetch belum siap */
}

// Helper function to normalize URL paths and avoid double slashes
function normalizeUrl(...parts) {
  return parts
    .map((part, index) => {
      if (index === 0) {
        // For the first part (base URL), remove trailing slash
        return part.replace(/\/+$/, "");
      } else {
        // For other parts, remove leading and trailing slashes
        return part.replace(/^\/+|\/+$/g, "");
      }
    })
    .join("/");
}

// Singleton IndexedDB instance — cache respons API (opsi webWorker.indexedDB)
const NEXA_STORAGE_CACHE_DB = "NexaStorageAPICache";
const NEXA_STORAGE_CACHE_STORE = "nexa_api_response";
/** Versi DB cache API — terpisah dari DB utama `nexaui-*` (NXUI.ref / buckets). */
const NEXA_API_CACHE_DB_VERSION = 1;
let nexaApiCacheOpenPromise = null;

/**
 * Buka IndexedDB khusus cache respons package/api **tanpa** memanggil `IndexedDBManager.init`.
 * `IndexedDBManager` adalah singleton: `init(dbName)` mengganti `this.db` — jika cache memakai DB lain,
 * pointer utama tertimpa sehingga `NXUI.ref.get("bucketsStore", …)` membaca DB salah / data hilang.
 */
function openNexaApiCacheDatabase() {
  if (nexaApiCacheOpenPromise) return nexaApiCacheOpenPromise;
  if (typeof indexedDB === "undefined") {
    nexaApiCacheOpenPromise = Promise.reject(
      new Error("indexedDB unavailable")
    );
    return nexaApiCacheOpenPromise;
  }
  nexaApiCacheOpenPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(
      NEXA_STORAGE_CACHE_DB,
      NEXA_API_CACHE_DB_VERSION
    );
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(NEXA_STORAGE_CACHE_STORE)) {
        db.createObjectStore(NEXA_STORAGE_CACHE_STORE, { keyPath: "id" });
      }
    };
  });
  return nexaApiCacheOpenPromise;
}

function nexaApiCacheGetRow(id) {
  return openNexaApiCacheDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(NEXA_STORAGE_CACHE_STORE, "readonly");
          const store = tx.objectStore(NEXA_STORAGE_CACHE_STORE);
          const r = store.get(id);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        } catch (e) {
          reject(e);
        }
      })
  );
}

function nexaApiCachePutRow(row) {
  return openNexaApiCacheDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        try {
          const tx = db.transaction(NEXA_STORAGE_CACHE_STORE, "readwrite");
          const store = tx.objectStore(NEXA_STORAGE_CACHE_STORE);
          const r = store.put(row);
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        } catch (e) {
          reject(e);
        }
      })
  );
}

/** JSON stringify dengan key objek diurutkan — untuk kunci cache stabil */
function nexaStableStringify(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map((v) => nexaStableStringify(v)).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + nexaStableStringify(value[k]))
      .join(",") +
    "}"
  );
}

function nexaHashCacheKey(obj) {
  const s = nexaStableStringify(obj) + "|v1";
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return "ns" + (h >>> 0).toString(36);
}

export function nexaWebWorkerGetConfig() {
  if (typeof window === "undefined" || !window.nexaPage) return null;
  return window.nexaPage.webWorker || window.nexaPage.worker || null;
}

function nexaWebWorkerRouteMatchesPattern(route, pattern) {
  const r = String(route || "").trim();
  const p = String(pattern || "").trim();
  if (!r || !p) return false;
  return r === p || r.startsWith(p + "/");
}

function nexaWebWorkerCurrentRouteMatchesList(list) {
  if (!Array.isArray(list) || list.length === 0) return false;
  const route =
    typeof window !== "undefined" &&
    window.nexaRoute &&
    typeof window.nexaRoute.currentRoute === "string"
      ? window.nexaRoute.currentRoute.trim()
      : "";
  if (!route) return false;
  return list.some((pat) => nexaWebWorkerRouteMatchesPattern(route, pat));
}

/** storage efektif: global true, atau global false + rute di skip */
export function nexaWebWorkerEffectiveStorage(w) {
  if (!w) return false;
  if (w.storage !== false) return true;
  return nexaWebWorkerCurrentRouteMatchesList(w.skip);
}

/** indexedDB efektif: global true, atau global false + rute di skipIndexedDB (jika ada) atau skip */
export function nexaWebWorkerEffectiveIndexedDB(w) {
  if (!w) return false;
  if (w.indexedDB === true) return true;
  if (w.indexedDB !== false) return false;
  const list =
    Array.isArray(w.skipIndexedDB) && w.skipIndexedDB.length > 0
      ? w.skipIndexedDB
      : w.skip;
  return nexaWebWorkerCurrentRouteMatchesList(list);
}

export function Storage() {
  const nexaEncrypt = new NexaEncrypt("nexa-default-secret-key-2025");

  const normalizeUrl = (url) => {
    if (!url) return url;
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      url = url.replace(/^http:\/\//i, 'https://');
    }
    url = url.replace(/([^:]\/)\/+/g, '$1');
    return url;
  };

  const getBaseURL = () => normalizeUrl(normalizeUrl(NEXA.apiBase || '') + "/outside");
  const getCURL = () => normalizeUrl(NEXA.apiBase || '');
  const getBaseAPI = () => normalizeUrl(NEXA.apiBase || '');
  const normalizedApiBase = normalizeUrl(NEXA.apiBase || '');
  const CURL = normalizedApiBase;
  const baseAPI = normalizedApiBase;
  const userid =NEXA.userId;
  const settext = NEXA.controllers.packages + "Controllers";
  let CapitalControllers = settext.charAt(0).toUpperCase() + settext.slice(1);
  // console.log('getBaseURL:', CURL);

  // ✅ Helper: Hapus double slash kecuali setelah "http(s):"
  const cleanURL = (url) => {
    // First normalize (HTTPS conversion), then fix double slashes
    return normalizeUrl(url);
  };

  // ✅ Helper: Gabung URL dengan aman
  const joinURL = (...parts) => {
    if (parts.length === 0) return '';
    if (parts.length === 1) return normalizeUrl(String(parts[0]));
    
    const firstPart = String(parts[0] || '');
    const restParts = parts.slice(1)
      .filter(part => part) // Remove empty parts
      .map(part => String(part).replace(/^\/+|\/+$/g, '')); // Remove leading/trailing slashes
    
    // If first part is a full URL (http:// or https://)
    if (firstPart.match(/^https?:\/\//)) {
      const baseUrl = firstPart.replace(/\/+$/, ''); // Remove trailing slashes
      const path = restParts.join('/');
      return normalizeUrl(path ? baseUrl + '/' + path : baseUrl);
    }
    
    // Otherwise, treat as relative path
    const allParts = [firstPart.replace(/^\/+|\/+$/g, ''), ...restParts]
      .filter(part => part);
    return normalizeUrl('/' + allParts.join('/'));
  };

  // ✅ Helper: Cek apakah userid valid (tidak false/null/undefined)
  const hasValidUserId = () => {
    return userid !== null && userid !== undefined && userid !== false;
  };

  // ✅ Helper: Tambahkan userid dari sesi hanya jika payload belum menyetel userid / user_id
  const addUserId = (data) => {
    if (data === null || data === undefined) {
      return hasValidUserId() ? { userid } : data;
    }
    if (typeof data === 'object' && !Array.isArray(data) && !(data instanceof FormData)) {
      if (
        Object.prototype.hasOwnProperty.call(data, "userid") ||
        Object.prototype.hasOwnProperty.call(data, "user_id")
      ) {
        return data;
      }
      if (!hasValidUserId()) {
        return data;
      }
      return { ...data, userid };
    }
    return data;
  };

  /** true jika row berupa URL absolut (http/https) — dipakai untuk endpoint dari NEXA.typicode dll. */
  const isAbsoluteUrl = (s) => /^https?:\/\//i.test(String(s || "").trim());
  /** Rantai url/api: jika row sudah absolut, gabung row + method saja; jika tidak, gabung base + row + method. */
  const chainUrl = (base, row, method) =>
    isAbsoluteUrl(row) ? joinURL(row, method) : joinURL(base, row, method);

  const workerDebugEnabled = () => {
    const webWorkerPage =
      typeof window !== "undefined" &&
      window.nexaPage &&
      (window.nexaPage.webWorker || window.nexaPage.worker);
    if (!webWorkerPage) return false;
    if (webWorkerPage.debug === true) return true;
    try {
      return (
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("nexaWorkerDebug") === "1"
      );
    } catch (e2) {
      return false;
    }
  };

  const shouldUseStorageWorker = () => {
    const webWorkerPage =
      typeof window !== "undefined" &&
      window.nexaPage &&
      (window.nexaPage.webWorker || window.nexaPage.worker);
    return (
      webWorkerPage &&
      webWorkerPage.enabled &&
      webWorkerPage.storage !== false &&
      typeof window !== "undefined" &&
      window.NXUI &&
      window.NXUI.nexaWorker &&
      typeof window.NXUI.nexaWorker.request === "function"
    );
  };

  /** Cache IndexedDB + stale-while-revalidate — aktif jika webWorker.indexedDB === true */
  const shouldUseStorageCache = () => {
    if (typeof indexedDB === "undefined") return false;
    const w =
      typeof window !== "undefined" &&
      window.nexaPage &&
      (window.nexaPage.webWorker || window.nexaPage.worker);
    if (!w || !w.enabled || w.storage === false) return false;
    return w.indexedDB === true;
  };

  /** TTL cache (ms). 0 = tidak pernah kedaluwarsa menurut waktu. Default 24 jam jika tidak diset. */
  const getStorageCacheTtlMs = () => {
    const w =
      typeof window !== "undefined" &&
      window.nexaPage &&
      (window.nexaPage.webWorker || window.nexaPage.worker);
    if (!w) return 86400000;
    const v = w.storageCacheTtlMs;
    if (v === 0 || v === false) return 0;
    if (typeof v === "number" && v > 0) return v;
    return 86400000;
  };

  /** Entri cache masih dalam TTL; tanpa cachedAt valid dianggap kedaluwarsa (data lama sebelum TTL). */
  const isStorageCacheRowFresh = (row) => {
    if (!row || row.payload === undefined || row.payload === null) return false;
    const ttl = getStorageCacheTtlMs();
    if (ttl <= 0) return true;
    const t = row.cachedAt;
    if (typeof t !== "number" || !Number.isFinite(t)) return false;
    return Date.now() - t <= ttl;
  };

  const refreshStorageCacheInBackground = async (cacheId, fetchImpl, cacheKeyObj) => {
    try {
      const fresh = await fetchImpl();
      const prevRow = await nexaApiCacheGetRow(cacheId);
      const prevStr = prevRow ? JSON.stringify(prevRow.payload) : "";
      const freshStr = JSON.stringify(fresh);
      if (prevStr !== freshStr) {
        await nexaApiCachePutRow({
          id: cacheId,
          payload: fresh,
          meta: cacheKeyObj,
          cachedAt: Date.now(),
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("nexa-storage-cache-update", {
              detail: { cacheKey: cacheKeyObj, data: fresh, id: cacheId },
            })
          );
        }
      }
    } catch (e) {
      /* jaringan gagal di background — abaikan */
    }
  };

  /**
   * Stale-while-revalidate + TTL: cache segar (cachedAt + TTL) → kembalikan segera + refresh background; kedaluwarsa → fetch dulu lalu simpan.
   */
  const cachedJsonFetch = async (cacheKeyObj, fetchImpl) => {
    if (!shouldUseStorageCache()) {
      return fetchImpl();
    }
    try {
      const cacheId = nexaHashCacheKey(cacheKeyObj);
      const row = await nexaApiCacheGetRow(cacheId);
      if (isStorageCacheRowFresh(row)) {
        const clone = JSON.parse(JSON.stringify(row.payload));
        queueMicrotask(() =>
          refreshStorageCacheInBackground(cacheId, fetchImpl, cacheKeyObj)
        );
        return clone;
      }
    } catch (e) {
      /* lanjut ke jaringan */
    }
    const fresh = await fetchImpl();
    try {
      const cacheId = nexaHashCacheKey(cacheKeyObj);
      await nexaApiCachePutRow({
        id: cacheId,
        payload: fresh,
        meta: cacheKeyObj,
        cachedAt: Date.now(),
      });
    } catch (e2) {
      /* simpan cache gagal — tetap kembalikan fresh */
    }
    return fresh;
  };

  /**
   * GET/POST lewat NexaWebWorker jika webWorker.storage aktif, fallback nexaFetch (sama pola dengan Storage.package).
   * @param {object} [fetchOptions] hanya dipakai pada fallback POST (argumen ke-3 nexaFetch.post).
   * @param {object|null} [cacheKeyData] jika diset dan webWorker.indexedDB === true → cache IndexedDB (SWR).
   */
  const rawWorkerFetchJson = async (url, method, bodyPayload, fetchOptions) => {
    const m = (method || "POST").toUpperCase();
    const isGet = m === "GET" || m === "HEAD" || m === "OPTIONS";

    // Circuit breaker: jika /outside sedang cooldown, lempar langsung tanpa HTTP request
    if (!isGet && url.includes('/outside') && _isOutsideCircuitOpen()) {
      const remain = Math.round((_outsideCbUntil - Date.now()) / 1000);
      const err = new Error(`Backend offline (circuit breaker, coba lagi ${remain}s)`);
      err.name = 'CircuitBreakerError';
      throw err;
    }

    if (shouldUseStorageWorker()) {
      try {
        if (workerDebugEnabled()) {
          // console.info("[NexaWorker] Storage." + m, url);
        }
        return await window.NXUI.nexaWorker.request(url, {
          method: m,
          body: isGet ? undefined : bodyPayload,
        });
      } catch (e1) {
        if (workerDebugEnabled()) {
          console.warn("[NexaWorker] fallback nexaFetch:", e1);
        }
      }
    }
    if (isGet) {
      return nexaFetch.get(url, bodyPayload || {});
    }
    try {
      return await nexaFetch.post(url, bodyPayload, fetchOptions || {});
    } catch (networkErr) {
      // Trip circuit breaker untuk network errors — hindari banjir ERR_EMPTY_RESPONSE
      if (networkErr?.name === 'TypeError' || /Failed to fetch|NetworkError|ERR_EMPTY_RESPONSE|ERR_CONNECTION/i.test(String(networkErr?.message || networkErr))) {
        _tripOutsideCircuit();
      }
      throw networkErr;
    }
  };

  const workerFetchJson = async (
    url,
    method,
    bodyPayload,
    fetchOptions,
    cacheKeyData = null
  ) => {
    const impl = () =>
      rawWorkerFetchJson(url, method, bodyPayload, fetchOptions);
    if (!cacheKeyData) return impl();
    return cachedJsonFetch(cacheKeyData, impl);
  };

  const storageObject = {
    /**
     * Query builder tabel (NexaModels) — setara `new NexaModels().Storage(table)`.
     * Beda dari `models("Name")` yang memanggil class PHP lewat /nx/outside.
     * @param {string} tableName nama tabel SQL
     * @returns {NexaModels}
     */
    model: function (tableName) {
      return new NexaModels().Storage(tableName);
    },

    /**
     * Federated bucket — konfigurasi store (nexaStore / fallback) lewat NexaFederated.
     * @param {object} app minimal `{ id }` + query shape (alias, tabelName, operasi, …)
     * @returns {{ get, set, del, upt, getRealtime, analysis, federated }}
     */
    buckets: function (app) {
      const config =
        typeof app === "string"
          ? { id: app }
          : app && typeof app === "object"
            ? app
            : { id: app };
      const fed = new NexaFederated(config);
      return {
        get: (data) => fed.get(data),
        set: (data, hasFile) => fed.set(data, hasFile),
        del: (data) => fed.del(data),
        upt: (data, id, hasFileType) => fed.upt(data, id, hasFileType),
        getRealtime: (data, callback) => fed.getRealtime(data, callback),
        analysis: (natKey) => fed.analysis(natKey),
        federated: fed,
      };
    },

    // Basic API method with method chaining support
    url: function (row, options = {}) {
      if (
        typeof options === "undefined" ||
        (typeof options === "object" && Object.keys(options).length === 0)
      ) {
        return new Proxy(
          {},
          {
            get: function (target, method) {
              return async function (data) {
                try {
                  const url = chainUrl(getCURL(), row, method);
                  const body = addUserId(data || {});
                  const result = await workerFetchJson(
                    url,
                    "POST",
                    body,
                    {},
                    {
                      kind: "url",
                      row,
                      subMethod: String(method),
                      body: nexaStableStringify(body),
                      uid: userid,
                    }
                  );
                  return result;
                } catch (error) {
                  console.error("API Error:", error);
                  throw error;
                }
              };
            },
          }
        );
      }

      return (async function () {
        try {
          const url = row;
          const payload = addUserId(options);
          const data = await workerFetchJson(url, "POST", payload, {}, {
            kind: "url_once",
            url,
            body: nexaStableStringify(payload),
            uid: userid,
          });
          return data;
        } catch (error) {
          console.error("API Error:", error);
          throw error;
        }
      })();
    },

    // Basic API method with method chaining support (baseAPI)
    api: function (row, options = {}) {
      if (
        typeof options === "undefined" ||
        (typeof options === "object" && Object.keys(options).length === 0)
      ) {
        return new Proxy(
          {},
          {
            get: function (target, method) {
              return async function (data) {
                try {
                  const url = chainUrl(getBaseAPI(), row, method);
                  const body = addUserId(data || {});
                  const result = await workerFetchJson(
                    url,
                    "POST",
                    body,
                    {},
                    {
                      kind: "api",
                      row,
                      subMethod: String(method),
                      body: nexaStableStringify(body),
                      uid: userid,
                    }
                  );
                  return result;
                } catch (error) {
                  console.error("API Error:", error);
                  throw error;
                }
              };
            },
          }
        );
      }

      return (async function () {
        try {
          const url = isAbsoluteUrl(row) ? normalizeUrl(String(row).trim()) : joinURL(getBaseAPI(), row);
          const payload = addUserId(options);
          const data = await workerFetchJson(url, "POST", payload, {}, {
            kind: "api_once",
            url,
            body: nexaStableStringify(payload),
            uid: userid,
          });
          return data;
        } catch (error) {
          console.error("API Error:", error);
          throw error;
        }
      })();
    },

    get: async function (row, options = {}) {
      try {
        const url = isAbsoluteUrl(row)
          ? normalizeUrl(String(row).trim())
          : joinURL(getBaseURL(), row);
        const opts = addUserId(options);
        const data = await workerFetchJson(url, "GET", opts, {}, {
          kind: "get",
          url,
          opt: nexaStableStringify(opts),
          uid: userid,
        });
        return data;
      } catch (error) {
        console.error("GET Error:", error);
        throw error;
      }
    },

    post: async function (row, endpoints, options = {}) {
      try {
        const url = joinURL(getBaseURL(), row);
        const ep = addUserId(endpoints);
        const data = await workerFetchJson(
          url,
          "POST",
          ep,
          addUserId(options),
          {
            kind: "post",
            row,
            body: nexaStableStringify(ep),
            uid: userid,
          }
        );
        return data;
      } catch (error) {
        console.error("POST Error:", error);
        throw error;
      }
    },
    // Dynamic package → POST ke OutsideController::index (routeToController)
    // packageName memetakan ke class PHP: "example" → "ExampleControllers" → ExampleController
 package: function (packageName) {
      const packageControllers = packageName + "Controllers";
      const capitalizedControllers =
        packageControllers.charAt(0).toUpperCase() +
        packageControllers.slice(1);

      const outsideEndpoint = getBaseURL();

      // Return a proxy object that can handle method calls directly
      return new Proxy(
        {},
        {
          get: function (target, method) {
            return async function (data) {
              try {
                const raw = data && typeof data === "object" ? { ...data } : {};
                const isPreview =
                  raw.__preview === true ||
                  raw.__dryRun === true;
                delete raw.__preview;
                delete raw.__dryRun;

                const dataWithUserId = addUserId(raw);

                if (isPreview) {
                  return {
                    preview: true,
                    postUrl: outsideEndpoint,
                    controllers: capitalizedControllers,
                    method: String(method),
                    payloadPreview: dataWithUserId,
                    hint:
                      "Tanpa POST. Hapus __preview untuk mengirim. Pastikan nama paket = slug controller (contoh: example → ExampleController).",
                  };
                }

                const webWorkerPage =
                  typeof window !== "undefined" &&
                  window.nexaPage &&
                  (window.nexaPage.webWorker || window.nexaPage.worker);
                const useWorker =
                  webWorkerPage &&
                  webWorkerPage.enabled &&
                  webWorkerPage.storage !== false &&
                  window.NXUI &&
                  window.NXUI.nexaWorker;

                let workerDebug = false;
                if (typeof window !== "undefined" && webWorkerPage) {
                  workerDebug = webWorkerPage.debug === true;
                  if (!workerDebug) {
                    try {
                      workerDebug =
                        new URLSearchParams(window.location.search).get("nexaWorkerDebug") === "1";
                    } catch (e2) {
                      workerDebug = false;
                    }
                  }
                }

                const cacheKeyObj = {
                  kind: "package",
                  c: capitalizedControllers,
                  m: String(method),
                  b: nexaStableStringify(dataWithUserId),
                  uid: userid,
                };

                const fetchImpl = async () => {
                  const dataKey = {
                    controllers: capitalizedControllers,
                    method: method,
                    params: await nexaEncrypt.encryptJson(dataWithUserId),
                  };
                  let result;
                  if (useWorker) {
                    if (workerDebug) {
                      console.info(
                        "[NexaWorker] Storage.package →",
                        String(method),
                        outsideEndpoint
                      );
                    }
                    try {
                      result = await window.NXUI.nexaWorker.post(
                        outsideEndpoint,
                        dataKey
                      );
                    } catch (e1) {
                      if (workerDebug) {
                        console.warn("[NexaWorker] fallback nexaFetch:", e1);
                      }
                      result = await nexaFetch.post(outsideEndpoint, dataKey, {});
                    }
                  } else {
                    result = await nexaFetch.post(outsideEndpoint, dataKey, {});
                  }
                  return result;
                };

                return await cachedJsonFetch(cacheKeyObj, fetchImpl);
              } catch (error) {
                // Background fetch gagal (backend offline / timeout saat refresh) — jangan cemari console
                if (error?.name === 'TypeError' && /failed to fetch|networkerror/i.test(error.message || '')) {
                  console.warn("POST background fetch gagal:", error.message);
                } else {
                  console.warn("POST Error:", error);
                }
                throw error;
              }
            };
          },
        }
      );
    },
  models: function (row, endpoints, options = {}) {
  // Jika endpoints tidak diberikan, return proxy
  if (endpoints === undefined) {
    return new Proxy(
      {},
      {
        get: function (target, method) {
          return async function (...params) {
            try {
              // Tambahkan userid ke params sebelum di-encrypt
              let paramsWithUserId = params;
              if (hasValidUserId()) {
                if (params.length > 0 && typeof params[0] === 'object' && !Array.isArray(params[0])) {
                  paramsWithUserId = [addUserId(params[0]), ...params.slice(1)];
                } else {
                  paramsWithUserId = [...params, { userid: userid }];
                }
              }
              
              const dataKey = {
                model: row,
                method: method,
                params: await nexaEncrypt.encryptJson(paramsWithUserId),
              };
              const cacheKeyObj = {
                kind: "models",
                model: row,
                method: String(method),
                params: nexaStableStringify(paramsWithUserId),
                uid: userid,
              };
              return await workerFetchJson(
                getBaseURL(),
                "POST",
                dataKey,
                options,
                cacheKeyObj
              );
            } catch (error) {
              // Background fetch gagal (backend offline / timeout saat refresh) — cukup warn
              if (error?.name === 'TypeError' && /failed to fetch|networkerror/i.test(error.message || '')) {
                console.warn("POST background fetch gagal:", error.message);
              } else {
                console.warn("POST Error:", error);
              }
              throw error;
            }
          };
        },
      }
    );
  }

  // Mode pemanggilan langsung (tanpa Proxy)
  return (async function () {
    try {
      // Samakan dengan cabang Proxy: params array → [...params, { userid }], bukan spread ke objek (yang merusak [1] → {0:1})
      const raw = endpoints && endpoints.params;
      let paramsWithUserId;
      if (Array.isArray(raw)) {
        paramsWithUserId = hasValidUserId() ? [...raw, { userid }] : raw;
      } else if (
        raw !== undefined &&
        raw !== null &&
        typeof raw === "object" &&
        !Array.isArray(raw)
      ) {
        paramsWithUserId = hasValidUserId() ? addUserId({ ...raw }) : raw;
      } else if (raw !== undefined && raw !== null) {
        paramsWithUserId = hasValidUserId() ? [raw, { userid }] : [raw];
      } else {
        paramsWithUserId = hasValidUserId() ? [{ userid }] : [];
      }

      const dataKey = {
        model: row,
        method: endpoints.method,
        ...endpoints,
        params: await nexaEncrypt.encryptJson(paramsWithUserId),
      };

      const cacheKeyObj = {
        kind: "models",
        model: row,
        method: String(endpoints.method),
        params: nexaStableStringify(paramsWithUserId),
        uid: userid,
      };

      const data = await workerFetchJson(
        getBaseURL(),
        "POST",
        dataKey,
        options,
        cacheKeyObj
      );
      return data;
    } catch (error) {
      console.error("POST Error:", error);
      throw error;
    }
  })();
},


    // Basic POST method
    events: function (row, endpoints, options = {}) {
      const controllers = cleanURL(NEXA.controllers.packages + "/FetchEvents");

      // If endpoints is not provided, return a proxy object for method chaining
      if (endpoints === undefined) {
        return new Proxy(
          {},
          {
            get: function (target, method) {
              return async function (data) {
                try {
                  // Tambahkan userid ke data sebelum di-encrypt
                  const dataWithUserId = hasValidUserId() 
                    ? { ...(data || {}), userid: userid }
                    : (data || {});
                  
                  const dataKey = {
                    path: convertToPath(
                      row + method.charAt(0).toUpperCase() + method.slice(1)
                    ),
                    data: await nexaEncrypt.encryptJson(dataWithUserId),
                  };

                  const result = await nexaFetch.post(
                    controllers,
                    dataKey,
                    options
                  );
                  return result;
                } catch (error) {
                  console.error("POST Error:", error);
                  throw error;
                }
              };
            },
          }
        );
      }

      // Original functionality for object-based calls
      return (async function () {
        try {
          // Tambahkan userid ke endpoints sebelum di-encrypt
          const endpointsWithUserId = hasValidUserId() 
            ? { ...(endpoints || {}), userid: userid }
            : (endpoints || {});
          
          const dataKey = {
            path: convertToPath(row),
            data: await nexaEncrypt.encryptJson(endpointsWithUserId),
          };
          const data = await nexaFetch.post(controllers, dataKey, options);
          return data;
        } catch (error) {
          console.error("POST Error:", error);
          throw error;
        }
      })();
    },
    // PUT method
    put: async function (row, data, options = {}) {
      try {
        const url = joinURL(NEXA.apiBase, row);
         const result = await nexaFetch.put(url, addUserId(data), addUserId(options));
        return result;
      } catch (error) {
        console.error("PUT Error:", error);
        throw error;
      }
    },

    sdk: async function (row, data) {
      try {
        const url = joinURL(NEXA.apiBase, row);
        const defaultHeaders = {
            headers: {
              "Content-Type": "application/json",
              "Authorization":data?.Authorization,
            }
        };
         const result = await nexaFetch.put(url, addUserId(data.data), addUserId(defaultHeaders));
        return result;
      } catch (error) {
        console.error("PUT Error:", error);
        throw error;
      }
    },


    sdk2: async function (row, data) {
      try {
        const url = `${data.endpoint}/api/${row}`;

        const headers = {
          "Content-Type": "application/json",
          "Authorization": data?.Authorization,
        };

        const options = {
          method: "PUT",
          headers,
          body: JSON.stringify(data.data)
        };

        const response = await fetch(url, options);

        if (!response.ok) {
          throw new Error("Request Failed: " + response.status);
        }

        return await response.json();

      } catch (error) {
        console.error("PUT Error:", error);
        throw error;
      }
    },


    // DELETE method
    delete: async function (row, options = {}) {
      try {
        const url = joinURL(getBaseURL(), row);
        const result = await nexaFetch.delete(url, addUserId(options));
        return result;
      } catch (error) {
        console.error("DELETE Error:", error);
        throw error;
      }
    },
    // Helper function
    helper: function () {
      return NEXA.controllers;
    },

    // IndexedDB functionality - reference to singleton
    indexedDB: IndexedDBManager,

    // localStorage functionality - reference to LocalStorageManager
    localStorage: LocalStorageManager(),

    // Cross-storage utilities
    sync: {
      // Sync data from localStorage to IndexedDB
      localStorageToIndexedDB: async function (options = {}) {
        try {
          const {
            prefix = "",
            storeName = "localStorage_sync",
            overwrite = false,
            clearTarget = false,
          } = options;

          // Ensure store exists in IndexedDB
          if (!IndexedDBManager.hasStore(storeName)) {
            await IndexedDBManager.addStores([storeName]);
          }

          // Clear target store if requested
          if (clearTarget) {
            const allData = await IndexedDBManager.getAll(storeName);
            for (const item of allData.data) {
              await IndexedDBManager.delete(storeName, item.id);
            }
          }

          // Export localStorage data
          const storage = Storage();
          const localStorageExport = await storage.localStorage.export({
            prefix,
          });
          const results = { success: [], failed: [], skipped: [] };
          let counter = 1;

          // Import to IndexedDB
          for (const [key, value] of Object.entries(localStorageExport.data)) {
            try {
              const id = `${prefix}${counter}`;

              // Check if overwrite is allowed
              if (!overwrite) {
                const existing = await IndexedDBManager.get(storeName, id);
                if (existing) {
                  results.skipped.push(key);
                  continue;
                }
              }

              await IndexedDBManager.set(storeName, {
                id: id,
                originalKey: key,
                value: value,
                syncDate: new Date().toISOString(),
              });

              results.success.push(key);
              counter++;
            } catch (error) {
              console.error(`Failed to sync key "${key}":`, error);
              results.failed.push({ key, error: error.message });
            }
          }

          return {
            success: true,
            synced: results.success.length,
            failed: results.failed.length,
            skipped: results.skipped.length,
            details: results,
            targetStore: storeName,
          };
        } catch (error) {
          console.error("localStorage to IndexedDB sync error:", error);
          throw error;
        }
      },

      // Sync data from IndexedDB to localStorage
      indexedDBToLocalStorage: async function (storeName, options = {}) {
        try {
          const {
            prefix = "",
            overwrite = false,
            clearTarget = false,
          } = options;

          // Clear localStorage with prefix if requested
          if (clearTarget && prefix) {
            await Storage().localStorage.clearPrefix(prefix);
          } else if (clearTarget) {
            localStorage.clear();
          }

          // Export IndexedDB data
          const indexedDBExport = await IndexedDBManager.export([storeName]);
          const results = { success: [], failed: [], skipped: [] };

          // Import to localStorage
          const storeData = indexedDBExport.data[storeName] || [];

          for (const item of storeData) {
            try {
              const key = prefix
                ? `${prefix}${item.originalKey || item.id}`
                : item.originalKey || item.id;

              // Check if overwrite is allowed
              if (!overwrite && localStorage.getItem(key) !== null) {
                results.skipped.push(key);
                continue;
              }

              const value = item.originalKey ? item.value : item;
              const storage = Storage();
              await storage.localStorage.set(key, value);
              results.success.push(key);
            } catch (error) {
              console.error(`Failed to sync item "${item.id}":`, error);
              results.failed.push({ item: item.id, error: error.message });
            }
          }

          return {
            success: true,
            synced: results.success.length,
            failed: results.failed.length,
            skipped: results.skipped.length,
            details: results,
            sourceStore: storeName,
          };
        } catch (error) {
          console.error("IndexedDB to localStorage sync error:", error);
          throw error;
        }
      },

      // Two-way sync between storages
      bidirectional: async function (indexedDBStore, options = {}) {
        try {
          const {
            localStoragePrefix = "",
            strategy = "newer", // "newer", "localStorage", "indexedDB"
            onConflict = null,
          } = options;

          const results = {
            toIndexedDB: null,
            toLocalStorage: null,
            conflicts: [],
          };

          if (strategy === "localStorage") {
            results.toIndexedDB = await this.localStorageToIndexedDB({
              prefix: localStoragePrefix,
              storeName: indexedDBStore,
              overwrite: true,
            });
          } else if (strategy === "indexedDB") {
            results.toLocalStorage = await this.indexedDBToLocalStorage(
              indexedDBStore,
              {
                prefix: localStoragePrefix,
                overwrite: true,
              }
            );
          } else if (strategy === "newer") {
            // Compare timestamps and sync newer data
            // This is a simplified implementation
            console.warn(
              "Newer strategy not fully implemented, defaulting to localStorage priority"
            );
            results.toIndexedDB = await this.localStorageToIndexedDB({
              prefix: localStoragePrefix,
              storeName: indexedDBStore,
              overwrite: true,
            });
          }

          return results;
        } catch (error) {
          console.error("Bidirectional sync error:", error);
          throw error;
        }
      },
    },

    // Storage comparison and analysis
    compare: {
      // Compare sizes between storages
      getSizes: async function () {
        try {
          const storage = Storage();
          const localStorageSize = storage.localStorage.getSize();
          const indexedDBInfo = IndexedDBManager.getInfo();

          return {
            localStorage: {
              size: localStorageSize,
              itemCount: localStorage.length,
              estimatedSize: `${(localStorageSize / 1024).toFixed(2)} KB`,
            },
            indexedDB: {
              isInitialized: indexedDBInfo.isInitialized,
              dbName: indexedDBInfo.dbName,
              version: indexedDBInfo.version,
              storeCount: indexedDBInfo.availableStores.length,
              stores: indexedDBInfo.availableStores,
            },
          };
        } catch (error) {
          console.error("Storage comparison error:", error);
          throw error;
        }
      },

      // Check storage health
      healthCheck: async function () {
        const storage = Storage();
        const localStorageHealth = storage.localStorage.healthCheck();

        const health = {
          ...localStorageHealth,
          indexedDB: { available: false, error: null, stores: [] },
        };

        // Test IndexedDB
        try {
          if (IndexedDBManager.db) {
            health.indexedDB.available = true;
            health.indexedDB.stores = Array.from(
              IndexedDBManager.db.objectStoreNames
            );
          } else {
            health.indexedDB.error = "Database not initialized";
          }
        } catch (error) {
          health.indexedDB.error = error.message;
        }

        return health;
      },
    },
  };

  // Wrap storageObject dengan Proxy untuk menangkap method dinamis
  // Ini memungkinkan pemanggilan seperti Storage().product() atau Storage().anyPackage()
  const proxy = new Proxy(storageObject, {
    get(target, property) {
      if (property in target) {
        return target[property];
      }
      return function() {
        return target.package(property);
      };
    }
  });

  // Attach async drive() and drivePackage() helpers to the proxy (not inside object literal)
  proxy.drive = async function(options = {}) {
    const userId = (typeof NEXA !== 'undefined' && NEXA.oauth && NEXA.oauth.id) ? NEXA.oauth.id : userid;
    const payload = { ...options, userid: userId };
    return await proxy.package('drive').drive(payload);
  };
  proxy.drivePackage = function() {
    return proxy.package('drive');
  };

  /**
   * NXUI.Storage().cloud() — upload file ke server via Express /upload/*
   *
   * Usage:
   *   // Upload avatar (buka file picker, simpan ke assets/drive/avatar/)
   *   const res = await NXUI.Storage().cloud().avatar();
   *
   *   // Upload file umum (buka file picker, simpan ke assets/drive/{tabel}/)
   *   const res = await NXUI.Storage().cloud().add({ tabel: 'kontak' });
   *   const res = await NXUI.Storage().cloud().add({ tabel: 'news', field: 'images' });
   *
   * Options untuk add():
   *   tabel    — nama tabel/folder tujuan (default: 'file')
   *   field    — nama kolom DB yang akan diupdate (opsional)
   *   userid   — override user ID (default: NEXA.oauth.id)
   *   accept   — file accept string, e.g. 'image/*' (default: '*')
   *   multiple — boolean, izinkan multi-file (default: false)
   */
  proxy.cloud = function() {
    const _resolveUserId = () => {
      if (typeof NEXA !== 'undefined' && NEXA.oauth && NEXA.oauth.id) return NEXA.oauth.id;
      return userid;
    };

    /** Buka file picker dan kembalikan File(s) yang dipilih. */
    const _pickFile = (accept = '*', multiple = false) => new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = !!multiple;
      input.style.display = 'none';
      document.body.appendChild(input);

      const cleanup = () => { try { document.body.removeChild(input); } catch (_) {} };

      input.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        cleanup();
        resolve(multiple ? files : (files[0] || null));
      });
      // Jika user cancel (tidak memilih file)
      input.addEventListener('cancel', () => { cleanup(); resolve(null); });
      // Fallback cancel via blur (browser lama)
      window.addEventListener('focus', function handler() {
        window.removeEventListener('focus', handler);
        setTimeout(() => { if (!input.files || input.files.length === 0) { cleanup(); resolve(null); } }, 400);
      }, { once: true });

      input.click();
    });

    /** POST FormData ke endpoint Node, kembalikan JSON dari PHP. */
    const _postFormData = async (endpoint, formData) => {
      // Nyatakan package aktif — SAMA seperti jalur XHR `Background()`
      // di bawah. Express memilih endpoint dari header ini kalau ada
      // (`resolvePackageFromHeader`), karena deteksi lewat Referer gagal
      // saat request datang dari halaman selain halaman package
      // (mis. submit lewat chat).
      //
      // OPSIONAL: tanpa `NEXA.packageId`, header tidak dikirim dan
      // perilakunya sama persis seperti sebelumnya.
      const headers = {};
      try {
        const pkgAktif = globalThis.NEXA?.packageId;
        if (pkgAktif) headers['x-nexa-package'] = String(pkgAktif);
      } catch (_) { /* header opsional */ }

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        // JANGAN set Content-Type manual: fetch harus menyusunnya
        // sendiri untuk multipart (butuh boundary).
        ...(Object.keys(headers).length ? { headers } : {}),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    };

    /**
     * NexaValidation mengumpulkan file sebagai `{ name, size, type, content: number[] }`
     * (bukan File). Konversi ke File/Blob untuk FormData / XHR.
     */
    const _serializedFileToUploadBlob = (v) => {
      if (v == null) return null;
      if (v instanceof File) return v;
      if (typeof Blob !== 'undefined' && v instanceof Blob) return v;
      if (typeof v !== 'object' || !Array.isArray(v.content)) return null;
      const len = v.content.length;
      if (len === 0) return null;
      const u8 = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        const n = v.content[i];
        if (typeof n !== 'number' || !Number.isFinite(n)) return null;
        u8[i] = n & 0xff;
      }
      const mime =
        typeof v.type === 'string' && v.type.trim() !== ''
          ? v.type
          : 'application/octet-stream';
      const fname =
        typeof v.name === 'string' && v.name !== '' ? v.name : 'upload.bin';
      const blob = new Blob([u8], { type: mime });
      if (typeof File === 'function') {
        try {
          return new File([blob], fname, { type: mime });
        } catch (_) {
          /* fall through */
        }
      }
      try {
        Object.defineProperty(blob, 'name', { value: fname });
      } catch (_) {
        /* noop */
      }
      return blob;
    };

    /** Satu File/Blob atau array; termasuk bentuk ter-serialisasi NexaValidation. */
    const _normalizeUploadFileList = (raw) => {
      if (raw == null) return [];
      if (raw instanceof File) return [raw];
      if (typeof Blob !== 'undefined' && raw instanceof Blob) return [raw];
      const one = _serializedFileToUploadBlob(raw);
      if (one) return [one];
      if (!Array.isArray(raw)) return [];
      const out = [];
      for (const item of raw) {
        if (item instanceof File) out.push(item);
        else if (typeof Blob !== 'undefined' && item instanceof Blob) out.push(item);
        else {
          const s = _serializedFileToUploadBlob(item);
          if (s) out.push(s);
        }
      }
      return out;
    };

    const _formDataAppendFiles = (fd, files) => {
      files.forEach((f) => {
        const nm =
          f && typeof f.name === 'string' && f.name !== '' ? f.name : 'upload.bin';
        fd.append('file', f, nm);
      });
    };

    return {
      /**
       * Upload avatar — POST ke /api/cloud/avatar (multipart → CloudController::avatar)
       * @param {object} [options]
       * @param {File}   [options.file]   — File yang sudah dipilih (opsional, jika tidak ada akan buka picker)
       * @param {number|string} [options.userid] — override userid
       * @returns {Promise<{success,avatar_url,...}>}
       */
      avatar: async function(options = {}) {
        const uid   = options.userid ?? _resolveUserId();
        const file  = options.file instanceof File
          ? options.file
          : await _pickFile('image/*');

        if (!file) return { success: false, message: 'Tidak ada file dipilih' };

        const fd = new FormData();
        fd.append('file',   file, file.name);
        fd.append('userid', String(uid ?? ''));
        fd.append('id',     String(uid ?? ''));
        fd.append('tabel',  'user');

        return _postFormData('/api/cloud/avatar', fd);
      },

      /**
       * Upload file umum — POST ke /api/cloud/add (multipart → CloudController::add)
       * @param {object} [options]
       * @param {string} [options.tabel]   — nama tabel/folder (default: 'file')
       * @param {string} [options.field]   — kolom DB yang akan diupdate (opsional)
       * @param {number|string} [options.userid] — override userid
       * @param {string} [options.accept]  — file accept filter (default: '*')
       * @param {boolean} [options.multiple] — izinkan multi-file
       * @param {File|File[]} [options.file] — File yang sudah dipilih (opsional)
       * @returns {Promise<{success,url,thumbnails,...}>}
       */
      add: async function(options = {}) {
        const uid    = options.userid ?? _resolveUserId();
        const tabel  = options.tabel  ?? 'file';
        const field  = options.field  ?? null;
        const accept = options.accept ?? '*';
        const multi  = !!options.multiple;

        let files = _normalizeUploadFileList(options.file);
        if (files.length === 0) {
          const picked = await _pickFile(accept, multi);
          if (!picked) return { success: false, message: 'Tidak ada file dipilih' };
          files = Array.isArray(picked) ? picked : [picked];
        }

        if (files.length === 0) return { success: false, message: 'Tidak ada file dipilih' };

        const fd = new FormData();
        _formDataAppendFiles(fd, files);
        fd.append('userid',        String(uid   ?? ''));
        fd.append('id',            String(uid   ?? ''));
        fd.append('tabel',         String(tabel));
        if (field) fd.append('field', String(field));

        return _postFormData('/api/cloud/add', fd);
      },

      /**
       * Upload file besar di background — tidak memblokir UI.
       * Menggunakan XMLHttpRequest agar ada progress event.
       *
       * @param {object} options  — sama seperti add()
       * @param {function} [options.onProgress]  — cb(percent, loaded, total)
       * @param {function} [options.onSuccess]   — cb(result)
       * @param {function} [options.onError]     — cb(error)
       * @returns {XMLHttpRequest}  — bisa di-abort() jika perlu
       *
       * @example
       * const xhr = NXUI.Storage().cloud().Background({
       *   tabel: 'kontak',
       *   file: res.data.foto,
       *   onProgress: (pct) => console.log(pct + '%'),
       *   onSuccess:  (r)   => Notif.show({ type: 'success', title: r.message }),
       *   onError:    (err) => Notif.show({ type: 'error',   title: err.message }),
       * });
       */
      Background: function(options = {}) {
        const uid         = options.userid       ?? _resolveUserId();
        const tabel       = options.tabel        ?? 'file';
        const field       = options.field        ?? null;   // string kolom file ATAU object kolom tambahan
        const fieldupload = options.fielduploade ?? options.fieldupload ?? 'file'; // nama kolom file di DB
        const accept      = options.accept       ?? '*';
        const multi       = !!options.multiple;

        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const onSuccess  = typeof options.onSuccess  === 'function' ? options.onSuccess  : null;
        const onError    = typeof options.onError    === 'function' ? options.onError    : null;

        const _doUpload = (files) => {
          if (!files || files.length === 0) {
            onError && onError(new Error('Tidak ada file dipilih'));
            return null;
          }

          const fd = new FormData();
          _formDataAppendFiles(fd, files);
          const rowId = options.id ?? null; // jika ada → UPDATE, tanpa → INSERT
          fd.append('userid',        String(uid   ?? ''));
          fd.append('id',            rowId !== null ? String(rowId) : String(uid ?? ''));
          fd.append('row_id',        rowId !== null ? String(rowId) : '');
          fd.append('tabel',         String(tabel));
          fd.append('fieldupload',   String(fieldupload));
          // field: string = kolom file (legacy), object = kolom-kolom tambahan
          if (field !== null && typeof field === 'object') {
            fd.append('fields', JSON.stringify(field));
          } else if (typeof field === 'string' && field) {
            fd.append('fieldupload', field);
          }
          const xhr = new XMLHttpRequest();

          if (onProgress && xhr.upload) {
            xhr.upload.addEventListener('progress', (e) => {
              if (e.lengthComputable) {
                const pct = Math.round((e.loaded / e.total) * 100);
                onProgress(pct, e.loaded, e.total);
              }
            });
          }

          xhr.addEventListener('load', () => {
            try {
              if (xhr.status < 200 || xhr.status >= 300) {
                const snippet = xhr.responseText.slice(0, 160).replace(/\s+/g, ' ');
                onError && onError(new Error(`HTTP ${xhr.status}${snippet ? `: ${snippet}` : ''}`));
                return;
              }
              const result = JSON.parse(xhr.responseText);
              onSuccess && onSuccess(result);
            } catch (e) {
              onError && onError(new Error('Response bukan JSON: ' + xhr.responseText.slice(0, 100)));
            }
          });

          xhr.addEventListener('error', () => {
            onError && onError(new Error('Network error saat upload'));
          });

          xhr.addEventListener('abort', () => {
            onError && onError(new Error('Upload dibatalkan'));
          });

          xhr.open('POST', '/api/cloud/add');

          // Nyatakan package aktif ke Express (index.js
          // `resolvePackageFromHeader`). Deteksi lewat Referer TIDAK
          // bekerja untuk XHR ini kalau user sedang di halaman lain —
          // mis. submit dari CHAT: Referer-nya halaman chat, bukan
          // `#distro/package/{id}`, dan `/api` balas 502 "package aktif
          // tidak terdeteksi".
          //
          // `socketPackageMemory` juga tidak menolong: browser memakai
          // koneksi TCP berbeda untuk POST ini, jadi memorinya kosong.
          //
          // OPSIONAL — hanya dikirim kalau `NEXA.packageId` diisi.
          // Tanpa itu perilakunya sama seperti sebelumnya (deteksi
          // Referer), jadi pemakaian lama tidak berubah.
          try {
            const pkgAktif = globalThis.NEXA?.packageId;
            if (pkgAktif) xhr.setRequestHeader('x-nexa-package', String(pkgAktif));
          } catch (_) { /* header opsional — jangan gagalkan upload */ }

          xhr.send(fd);
          return xhr;
        };

        const ready = _normalizeUploadFileList(options.file);
        if (ready.length > 0) {
          return _doUpload(ready);
        }

        // Buka picker dulu (async), lalu upload di background
        _pickFile(accept, multi).then(picked => {
          if (!picked) { onError && onError(new Error('Tidak ada file dipilih')); return; }
          _doUpload(Array.isArray(picked) ? picked : [picked]);
        });

        return null; // xhr belum ada saat picker belum selesai
      },

      /** Alias `Background` — nama lama di template (XHR + onProgress / onSuccess / onError). */
      addBackground(options = {}) {
        return this.Background(options);
      },

      /**
       * Update file pada record existing — POST ke /api/cloud/update
       * Gunakan ini jika record sudah ada di DB dan hanya file-nya yang diganti.
       *
       * @param {object} options
       * @param {string} options.tabel   — nama tabel (wajib)
       * @param {number|string} options.id — id row yang akan diupdate (wajib)
       * @param {string} [options.field] — kolom file di DB (default: 'file')
       * @param {File}   [options.file]  — File object (opsional, buka picker jika kosong)
       *
       * @example
       * const res = await NXUI.Storage().cloud().update({ tabel:'demo', id:5, file: res.data.foto });
       */
      update: async function(options = {}) {
        const uid   = options.userid ?? _resolveUserId();
        const tabel = options.tabel  ?? null;
        const id    = options.id     ?? uid;
        const field = options.field  ?? 'file';

        if (!tabel || !id) return { success: false, message: 'Parameter tabel dan id wajib diisi' };

        let files = _normalizeUploadFileList(options.file);
        if (files.length === 0) {
          const picked = await _pickFile(options.accept ?? '*', false);
          if (!picked) return { success: false, message: 'Tidak ada file dipilih' };
          files = [picked];
        }

        if (files.length === 0) return { success: false, message: 'Tidak ada file dipilih' };

        const fd = new FormData();
        const f0 = files[0];
        const nm =
          f0 && typeof f0.name === 'string' && f0.name !== '' ? f0.name : 'upload.bin';
        fd.append('file', f0, nm);
        fd.append('userid',       String(uid   ?? ''));
        fd.append('id',           String(id));
        fd.append('tabel',        String(tabel));
        fd.append('field',        String(field));

        return _postFormData('/api/cloud/update', fd);
      },
    };
  };

  // Expose _resetOutsideCircuit di proxy untuk api-scope.js
  proxy.resetOutsideCircuit = _resetOutsideCircuit;

  return proxy;
}

function convertToPath(str) {
  const match = str.match(/^([A-Z][a-z]+)([A-Z].*)$/);
  if (!match) return str;
  return `${match[1]}/${match[2].charAt(0).toLowerCase()}${match[2].slice(1)}`;
}
// Baru
