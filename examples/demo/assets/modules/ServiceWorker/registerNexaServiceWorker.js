/**
 * Pendaftaran Service Worker + helper Background Sync (SyncManager).
 */

/**
 * Hapus registrasi SW yang cocok dengan scriptUrl (default /sw.js) agar tidak lagi mengontrol origin.
 * @param {{
 *   scriptUrl?: string,
 *   scope?: string,
 *   debug?: boolean
 * }} config
 * @returns {Promise<boolean>} true jika minimal satu registrasi dihapus
 */
export async function unregisterNexaServiceWorker(config = {}) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return false;
  }

  let scriptPath = "/sw.js";
  if (config.scriptUrl) {
    try {
      const base =
        typeof window !== "undefined" && window.location
          ? window.location.href
          : "http://localhost/";
      scriptPath = new URL(config.scriptUrl, base).pathname;
    } catch {
      scriptPath = config.scriptUrl.startsWith("/")
        ? config.scriptUrl
        : `/${config.scriptUrl}`;
    }
  }

  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    let removed = false;
    for (const reg of regs) {
      const sw = reg.active || reg.waiting || reg.installing;
      if (!sw || !sw.scriptURL) continue;
      let path;
      try {
        path = new URL(sw.scriptURL).pathname;
      } catch {
        continue;
      }
      if (path === scriptPath) {
        await reg.unregister();
        removed = true;
        if (config.debug) {
          console.info("[NexaServiceWorker] unregister:", path);
        }
      }
    }
    if (typeof window !== "undefined" && window.NEXA) {
      window.NEXA.serviceWorker = {
        ...(window.NEXA.serviceWorker || {}),
        ready: false,
        unregistered: removed,
      };
    }
    return removed;
  } catch (e) {
    console.warn("[NexaServiceWorker] unregister gagal:", e);
    return false;
  }
}

/**
 * @param {{
 *   enabled?: boolean,
 *   scriptUrl?: string,
 *   scope?: string,
 *   backgroundSync?: boolean,
 *   debug?: boolean
 * }} config
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
export async function initNexaServiceWorker(config = {}) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    if (config.debug) {
      console.info("[NexaServiceWorker] tidak tersedia di environment ini");
    }
    return null;
  }
  if (config.enabled === false) {
    await unregisterNexaServiceWorker(config);
    return null;
  }
  if (config.enabled !== true) {
    return null;
  }

  let scriptUrl = config.scriptUrl;
  if (!scriptUrl) {
    // Default: /sw.js di root — scope '/' hanya valid jika skrip SW dilayani dari origin root
    scriptUrl =
      typeof window !== "undefined" && window.location
        ? new URL("/sw.js", window.location.origin).href
        : "/sw.js";
  }

  const scope = config.scope != null ? config.scope : "/";

  try {
    const reg = await navigator.serviceWorker.register(scriptUrl, { scope });

    if (typeof window !== "undefined" && !window.__nexaServiceWorkerMessageHook) {
      window.__nexaServiceWorkerMessageHook = true;
      navigator.serviceWorker.addEventListener("message", (event) => {
        const d = event.data;
        if (d && d.type === "NEXA_BACKGROUND_SYNC") {
          window.dispatchEvent(
            new CustomEvent("nexaBackgroundSync", { detail: d })
          );
        }
      });
    }

    if (config.debug) {
      console.info("[NexaServiceWorker] terdaftar:", scriptUrl, "scope:", scope);
    }
    if (typeof window !== "undefined" && window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent("nexaServiceWorkerReady", {
          detail: { registration: reg, config },
        })
      );
    }
    if (typeof window !== "undefined" && window.NEXA) {
      window.NEXA.serviceWorker = {
        ...(window.NEXA.serviceWorker || {}),
        ready: true,
        scriptUrl,
        scope,
        backgroundSync: config.backgroundSync === true,
      };
    }
    return reg;
  } catch (e) {
    console.warn("[NexaServiceWorker] registrasi gagal:", e);
    if (typeof window !== "undefined" && window.NEXA) {
      window.NEXA.serviceWorker = {
        ...(window.NEXA.serviceWorker || {}),
        ready: false,
        error: String(e && e.message ? e.message : e),
      };
    }
    return null;
  }
}

/**
 * Daftarkan tugas sync (butuh HTTPS atau localhost; dukungan browser bervariasi).
 * @param {ServiceWorkerRegistration} registration
 * @param {string} [tag='nexa-background-sync']
 */
export async function registerBackgroundSync(registration, tag = "nexa-background-sync") {
  if (!registration || !registration.sync || typeof registration.sync.register !== "function") {
    return false;
  }
  try {
    await registration.sync.register(tag);
    return true;
  } catch (e) {
    console.warn("[NexaServiceWorker] sync.register gagal:", e);
    return false;
  }
}
