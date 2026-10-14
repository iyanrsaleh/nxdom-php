/** Tanpa SDK Firebase — aman di-parse saat offline; dipakai NexaFederated sebelum dynamic import NexaFirebase. */
export function getFirebaseConfig() {
  const g = typeof globalThis !== "undefined" ? globalThis : {};
  const n = g.NEXA;
  if (!n) return null;
  const db = n.firebaseConfig;
  return db && typeof db === "object" ? db : null;
}

export function isFirebaseConfigured() {
  return getFirebaseConfig() != null;
}
