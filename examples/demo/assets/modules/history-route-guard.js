/**
 * Filter & normalisasi rute history — jangan simpan / tampilkan kunci nexaStore mentah (token).
 */

/** Pola id nexaStore: prefiks + underscore + angka panjang (≥1 blok digit). */
export function isNexaStoreTokenKey(seg) {
  const s = String(seg || '').trim();
  if (!s || s.includes('/')) return false;
  if (/^(home|history|beranda|welcome|all)$/i.test(s)) return false;
  return /^[a-z][a-z0-9_-]*_\d{6,}(?:_\d{6,})*$/i.test(s);
}

/** Ambil token nexaStore dari segmen route/actionId (`token` atau `token:action`). */
export function extractNexaStoreToken(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  if (isNexaStoreTokenKey(s)) return s;
  const colonIdx = s.indexOf(':');
  if (colonIdx > 0) {
    const head = s.slice(0, colonIdx);
    if (isNexaStoreTokenKey(head)) return head;
  }
  return '';
}

/** Rute mengandung token nexaStore (path atau format repository `token:action`). */
export function isHistoryTokenRoute(route) {
  const raw = String(route || '').trim();
  if (!raw) return false;
  if (extractNexaStoreToken(raw)) return true;
  return raw.split('/').filter(Boolean).some(seg => extractNexaStoreToken(seg));
}

async function lookupAppName(token, ref) {
  if (!token || !ref || typeof ref.nexaStore !== 'function') return null;
  try {
    const row = await ref.nexaStore(token).get();
    const appName = String(row?.appname || row?.appName || '').trim();
    if (!appName || isNexaStoreTokenKey(appName)) return null;
    return appName;
  } catch {
    return null;
  }
}

/** Ganti token di segmen dengan appname; pertahankan suffix `:action` bila ada. */
export async function resolveHistorySegment(seg, ref, appNameHint = '') {
  const raw = String(seg || '').trim();
  if (!raw) return raw;

  const token = extractNexaStoreToken(raw);
  if (!token) return raw;

  const hint = String(appNameHint || '').trim();
  const appName = (hint && !isNexaStoreTokenKey(hint) ? hint : null)
    || await lookupAppName(token, ref);
  if (!appName) return null;

  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0) {
    const suffix = raw.slice(colonIdx + 1);
    return suffix ? `${appName}:${suffix}` : appName;
  }
  return appName;
}

/**
 * Normalisasi rute untuk history: ganti token (termasuk `token:action`) dengan appname.
 * @returns {string|null} null = jangan simpan
 */
export async function resolveHistoryRoute(route, ref, appNameHint = '') {
  const raw = String(route || '').trim();
  if (!raw) return null;

  const tokenOnly = extractNexaStoreToken(raw);
  if (tokenOnly && raw === tokenOnly) return null;

  const segs = raw.split('/').filter(Boolean);
  if (!segs.length) return null;

  const out = [];
  for (const seg of segs) {
    const next = await resolveHistorySegment(seg, ref, appNameHint);
    if (next === null) return null;
    out.push(next);
  }
  return out.join('/');
}

/** Workspace/repository — pakai appName dari payload bila ada. */
export async function resolveWorkspaceHistoryRoute(routeKey, detail, ref) {
  const appName = String(detail?.appName || detail?.appname || '').trim();
  return resolveHistoryRoute(routeKey, ref, appName);
}

/** Migrasi entri lama: token → appname; buang yang tidak bisa di-resolve. */
export async function migrateHistoryEntries(entries, ref) {
  if (!Array.isArray(entries)) return [];

  const out = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;

    const hint = String(entry.appName || entry.appname || '').trim();
    const resolvedRoute = await resolveHistoryRoute(entry.route, ref, hint);
    if (resolvedRoute === null) continue;

    const next = { ...entry, route: resolvedRoute };

    if (entry.actionId) {
      const resolvedAction = await resolveHistorySegment(entry.actionId, ref, hint);
      if (resolvedAction === null) delete next.actionId;
      else next.actionId = resolvedAction;
    }

    out.push(next);
  }
  return out;
}

/** Hapus entri history yang masih memakai token (pembersihan sinkron). */
export function stripTokenHistoryEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(e => !isHistoryTokenRoute(e?.route) && !isHistoryTokenRoute(e?.actionId));
}
