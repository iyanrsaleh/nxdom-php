/**
 * Helper untuk memaksa NEXA.apiBase ke URL production atau development.
 * Dipakai oleh modul yang harus selalu pakai satu scope tertentu,
 * terlepas dari navigasi Workspace sebelumnya.
 */

/** Paksa NEXA.apiBase (dan NEXA.publik) ke production (https://nxdom.org). */
export function useProductionApi() {
  if (!window.NEXA) return;
  const prod = window.__NEXA_ENDPOINT__?.urlApi || window.NEXA._prodApiBase;
  if (prod) {
    window.NEXA._prodApiBase = window.NEXA._prodApiBase || prod;
    window.NEXA.apiBase = prod;
  }
  const prodPublik = window.__NEXA_ENDPOINT__?.publik || window.NEXA._prodPublik;
  if (prodPublik) {
    window.NEXA._prodPublik = window.NEXA._prodPublik || prodPublik;
    window.NEXA.publik = prodPublik;
  }
}

/** Paksa NEXA.apiBase ke development URL jika tersedia. */
export function useDevApi() {
  const dev = window?.__NEXA_ENDPOINT__?.development;
  if (dev && typeof dev === 'object' && dev.urlApi && window.NEXA) {
    if (!window.NEXA._prodApiBase) window.NEXA._prodApiBase = window.NEXA.apiBase;
    window.NEXA.apiBase = dev.urlApi;
  }
}

/**
 * Kembalikan userId untuk query ke development server.
 * Prioritas: dev_user_id dari config > dev_user_id dari oauth > NEXA.userId (fallback production).
 */
export function resolveDevUserId() {
  const fromConfig = window?.__NEXA_ENDPOINT__?.development?.dev_user_id
    || window?.__NEXA_ENDPOINT__?.dev_user_id;
  if (fromConfig) return fromConfig;
  const fromOauth = window?.NEXA?.oauth?.dev_user_id;
  if (fromOauth) return fromOauth;
  return window?.NEXA?.userId;
}
