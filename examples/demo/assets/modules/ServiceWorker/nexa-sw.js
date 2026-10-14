/**
 * Salinan logika /sw.js — registrasi utama pakai /sw.js (scope '/').
 * @see ../../../../sw.js
 */
const DEFAULT_SYNC_TAG = "nexa-background-sync";

const VERSION = "nexa-v5";
const STATIC_CACHE = `${VERSION}-static`;
const API_GET_CACHE = `${VERSION}-api-get`;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("nexa-") && !k.startsWith(VERSION))
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("sync", (event) => {
  const tag = event.tag || "";
  if (
    tag === DEFAULT_SYNC_TAG ||
    tag.startsWith("nexa-sync-") ||
    tag.startsWith("nexa-background-")
  ) {
    event.waitUntil(
      (async () => {
        const all = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        all.forEach((client) => {
          client.postMessage({
            type: "NEXA_BACKGROUND_SYNC",
            tag,
          });
        });
      })()
    );
  }
});

function isStaticAsset(url) {
  const p = url.pathname;
  if (p.startsWith("/assets/")) return true;
  if (p.startsWith("/templates/")) return true;
  if (p === "/App.js" || p === "/sw.js" || p === "/index.html") return true;
  return /\.(js|mjs|css|woff2?|ttf|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(p);
}

function isApiGetCacheable(url, request) {
  if (request.method !== "GET") return false;
  const p = url.pathname;
  if (p.includes("/api/")) return true;
  if (p.includes("/nx/")) return true;
  if (p.includes("/drive/")) return true;
  return false;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request).then((response) => {
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  });
  if (cached) {
    networkPromise.catch(() => {});
    return cached;
  }
  return networkPromise;
}

async function networkFirstApi(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      try {
        await cache.put(request, response.clone());
      } catch (e) {
        /* CORS */
      }
    }
    return response;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith("http")) return;

  if (url.pathname === "/App.js") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (isApiGetCacheable(url, request)) {
    event.respondWith(networkFirstApi(request, API_GET_CACHE));
    return;
  }
});
