/**
 * NexaRoute2 - Minimal Routing Class (Core Only)
 * Versi minimal untuk routing yang bisa digunakan di web lain
 * Hanya berisi fungsi routing inti tanpa dependensi spesifik
 */

import {
    resolveHistoryRoute,
    resolveHistorySegment,
    resolveWorkspaceHistoryRoute,
} from '../history-route-guard.js';

/** Escape teks untuk ditampilkan di &lt;pre&gt; error (debug). */
function nexaEscapeHtmlRouteError(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export class NexaRoute {
    constructor(containerId = 'main', options = {}) {
        this.containerId = containerId; // Simpan containerId untuk digunakan spinner
        this.container = document.getElementById(containerId);
        this.routes = new Map();
        this.routeStyles = new Map(); // Store style config untuk setiap route
        /** @type {Map<string, object>} meta SEO/OG per kunci rute (diset lewat register) */
        this.routeMetaByRoute = new Map();
        this.currentRoute = null;
        this.originalContent = null; // Store original content untuk restore
        
        // IndexedDB (wajib - default enabled)
        this.enableIndexedDB = options.enableIndexedDB !== false; // Default: true
        this.db = null; 
        this.dbReady = false;
        
        // Spinner configuration dari options
        this.spinnerConfig = options.spinner || {
            enabled: true, // Default: enabled
            type: 'overlay', // 'overlay' untuk tengah layar, 'inline' untuk dalam container
            size: 'medium',
            color: '#007bff',
            position: 'center',
            message: '',
            centerScreen: true // Tampilkan di tengah layar (default: true)
        };
        
        // Route change callback dari options
        this.onRouteChange = options.onRoute || options.onRouteChange || null;

        /** Jika true, atau window.NEXA_DEBUG_ROUTES, atau ?nexaDebug=1 → tampilkan stack error di UI (dev). */
        this.debugRouteErrors = options.debugRouteErrors === true;

        /** Fallback meta SEO dari NXUI.Page (disalurkan ke onRoute / nxui:routeChange) */
        this.defaultRouteMeta = options.defaultRouteMeta != null ? options.defaultRouteMeta : null;
        
        // Path folder SPA di URL (tanpa slash), mis. "myapp" untuk /myapp/contact — beda dari getBasePath() NEXA.url
        this.skipInitNavigation = options.skipInitNavigation === true;

        this.mountPath = (options.mountPath || '').replace(/^\/+|\/+$/g, '');

        // Spinner instance untuk loading indicator
        this.spinner = null;

        // Initialize
        this.init();
    }

    /**
     * Segment mount SPA (opsi mountPath atau window.nexaPage.mountPath)
     */
    getMountPath() {
        if (this.mountPath) {
            return this.mountPath;
        }
        if (typeof window !== 'undefined' && window.nexaPage && window.nexaPage.mountPath) {
            return String(window.nexaPage.mountPath).replace(/^\/+|\/+$/g, '');
        }
        return '';
    }

    /**
     * Hilangkan prefix mount dari string route, mis. "myapp/contact" → "contact"
     */
    stripMountPath(route) {
        if (!route) {
            return route;
        }
        const m = this.getMountPath();
        if (!m) {
            return route;
        }
        if (route === m) {
            return '';
        }
        if (route.startsWith(m + '/')) {
            return route.substring(m.length + 1);
        }
        return route;
    }

    /**
     * Tampilkan detail error di halaman (bukan hanya konsol): aktif jika
     * debugRouteErrors, window.NEXA_DEBUG_ROUTES, atau query ?nexaDebug=1
     */
    isRouteErrorDebugVisible() {
        if (typeof window !== 'undefined' && window.NEXA_DEBUG_ROUTES === true) {
            return true;
        }
        if (this.debugRouteErrors === true) {
            return true;
        }
        try {
            if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('nexaDebug') === '1') {
                return true;
            }
        } catch (e) { /* ignore */ }
        return false;
    }

    /**
     * Blok HTML debug untuk pesan error rute (teks di-escape).
     */
    formatRouteErrorDebugBlock(error) {
        const msg = error && error.message ? error.message : String(error);
        const stack = error && error.stack ? error.stack : '';
        const body = nexaEscapeHtmlRouteError(msg + (stack ? '\n\n' + stack : ''));
        return `
            <details style="margin-top:1rem;text-align:left;max-width:720px;margin-left:auto;margin-right:auto;">
                <summary style="cursor:pointer;color:#b91c1c;">Detail error (mode debug)</summary>
                <pre style="margin-top:0.5rem;max-height:280px;overflow:auto;background:#f3f4f6;padding:1rem;border-radius:6px;font-size:11px;line-height:1.35;white-space:pre-wrap;word-break:break-word;">${body}</pre>
                <p style="font-size:12px;color:#6b7280;">Matikan: hapus <code>?nexaDebug=1</code> dan set <code>debugRouteErrors</code> / <code>NEXA_DEBUG_ROUTES</code> ke false.</p>
            </details>`;
    }

    /**
     * Initialize IndexedDB untuk pelacakan route (wajib)
     * Diaktifkan secara default untuk persistent route tracking
     * Hanya menunggu NXUI.ref yang sudah diinisialisasi di NexaUI.js
     * Jangan membuat instance NexaDb baru untuk menghindari version conflict
     */
    async initDatabase() {
        if (!this.enableIndexedDB) return;
        
        try {
            this.db = await NXUI.getDb();
            if (this.db) {
                this.dbReady = true;
            }
        } catch (error) {
            this.dbReady = false;
        }
    }

    /**
     * Save route ke IndexedDB (wajib)
     * Menyimpan route terakhir untuk restore saat page refresh
     */
    async saveRoute(route) {
        if (!this.enableIndexedDB) return;
        
        try {
            // Buat URL yang benar berdasarkan route name
            const path = this.buildUrl(route);
            const url = window.location.origin + path;
            
            const ref = (typeof window !== 'undefined' && window.NXUI && window.NXUI.ref && typeof window.NXUI.ref.set === 'function')
                ? window.NXUI.ref
                : (typeof NXUI !== 'undefined' && NXUI.ref && typeof NXUI.ref.set === 'function' ? NXUI.ref : null);

            if (ref) {
                await ref.set('bucketsRoute', {
                    id: 'lastRoute',
                    route: route,
                    url: url,
                    timestamp: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                this._appendHistory(ref, route, url);
                return;
            }
            
            // Jika belum tersedia, tunggu dengan interval cepat (maksimal 1 detik)
            let attempts = 0;
            while (attempts < 20) {
                await new Promise(resolve => setTimeout(resolve, 50));
                
                const ref2 = (typeof window !== 'undefined' && window.NXUI && window.NXUI.ref && typeof window.NXUI.ref.set === 'function')
                    ? window.NXUI.ref
                    : (typeof NXUI !== 'undefined' && NXUI.ref && typeof NXUI.ref.set === 'function' ? NXUI.ref : null);

                if (ref2) {
                    await ref2.set('bucketsRoute', {
                        id: 'lastRoute',
                        route: route,
                        url: url,
                        timestamp: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });
                    this._appendHistory(ref2, route, url);
                    return;
                }
                
                attempts++;
            }
        } catch (error) {
            // Silent fail - route tracking is optional
        }
    }

    /**
     * Tambahkan entry ke history aktivitas rute di bucketsStore.
     * History disimpan sebagai array (max 200 entry, FIFO) di key 'history'.
     * @param {object} ref  - NXUI.ref instance
     * @param {string} route - kunci agregasi (mis. workspace atau canonical/query-select)
     * @param {string} url
     * @param {object} [meta] - opsional: parentId, actionId, label, actionName, baseRoute, title
     */
    _isHistoryIndexRoute(route, meta = null) {
        const r = String(route || '').trim().toLowerCase();
        if (!r || r === 'beranda') return true;
        const last = r.split('/').filter(Boolean).pop() || '';
        if (last === 'welcome' || last === 'history' || last === 'home') return true;
        if (r === 'history' || r.endsWith('/history')) return true;
        const actionId = meta && meta.actionId != null ? String(meta.actionId).trim().toLowerCase() : '';
        if (actionId === 'welcome' || actionId === 'history') return true;
        return false;
    }

    async _appendHistory(ref, route, url, meta = null) {
        try {
            if (this._isHistoryIndexRoute(route, meta)) return;

            const resolved = await resolveHistoryRoute(route, ref);
            if (resolved === null) return;
            const routeForHistory = resolved;

            const now = new Date().toISOString();
            const existing = await ref.get('bucketsStore', 'history');
            const entries = Array.isArray(existing?.entries) ? existing.entries : [];

            const entry = {
                route: routeForHistory,
                url,
                title: (meta && meta.title) || document.title || routeForHistory,
                timestamp: now,
            };
            if (meta && typeof meta === 'object') {
                const keys = ['parentId', 'actionName', 'label', 'baseRoute', 'appName'];
                for (const k of keys) {
                    if (meta[k] != null && String(meta[k]).trim() !== '') entry[k] = meta[k];
                }
                const appHint = String(meta.appName || meta.appname || '').trim();
                if (meta.actionId != null && String(meta.actionId).trim() !== '') {
                    const resolvedAction = await resolveHistorySegment(meta.actionId, ref, appHint);
                    if (resolvedAction !== null) entry.actionId = resolvedAction;
                }
            }

            entries.push(entry);

            // Batasi 200 entry terbaru
            if (entries.length > 200) {
                entries.splice(0, entries.length - 200);
            }

            await ref.set('bucketsStore', {
                id: 'history',
                entries,
                updatedAt: now,
            });
        } catch (_) {
            // Silent fail
        }
    }

    /**
     * Catat navigasi di dalam shell Workspace (sidebar tools) agar Preferences History tidak hanya "workspace".
     * Dipanggil dari templates/Workspace/navigation.js setelah tools bucket diset.
     * @param {object} detail - payload ternormalisasi (parentId, actionId, label, …)
     */
    async appendWorkspaceActivity(detail) {
        if (!this.enableIndexedDB || !detail || typeof detail !== 'object') return;

        const parentId = String(detail.parentId || detail.parentMenuId || '').trim().toLowerCase();
        const actionId = String(detail.actionId || detail.key || '').trim();
        if (!parentId && !actionId) return;

        const routeKey = parentId && actionId ? `${parentId}/${actionId}` : (actionId || parentId);
        if (!routeKey) return;

        const path =
            (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '/';
        const url =
            (typeof window !== 'undefined' && window.location && window.location.origin)
                ? window.location.origin + path
                : routeKey;

        const ref =
            (typeof window !== 'undefined' && window.NXUI && window.NXUI.ref && typeof window.NXUI.ref.get === 'function')
                ? window.NXUI.ref
                : (typeof NXUI !== 'undefined' && NXUI.ref && typeof NXUI.ref.get === 'function' ? NXUI.ref : null);
        if (!ref) return;

        const label = String(detail.label || '').trim();
        const actionName = String(detail.actionName || '').trim();
        const prettyTitle =
            label && parentId
                ? `${parentId.charAt(0).toUpperCase() + parentId.slice(1)} · ${label}`
                : (label || routeKey);

        const appName = String(detail.appName || detail.appname || '').trim();
        const historyRoute = await resolveWorkspaceHistoryRoute(routeKey, detail, ref);
        if (historyRoute === null) return;

        await this._appendHistory(ref, historyRoute, url, {
            parentId,
            actionId,
            actionName,
            label,
            appName,
            baseRoute: 'workspace',
            title: prettyTitle,
        });
    }

    /**
     * Load route terakhir dari IndexedDB (wajib)
     * Mengembalikan route terakhir yang disimpan untuk restore
     */
    async loadLastRoute() {
        if (!this.enableIndexedDB) return null;
        
        try {
            // Prioritas 1: Langsung akses IndexedDB tanpa menunggu NXUI.ref
            // Data sudah jelas ada, langsung akses untuk kecepatan maksimal
            const directResult = await this.loadLastRouteDirect();
            if (directResult) {
                return directResult;
            }
            
            // Prioritas 2: Coba gunakan NXUI.ref jika tersedia (tanpa delay)
            if (typeof window !== 'undefined' && window.NXUI && window.NXUI.ref && typeof window.NXUI.ref.get === 'function') {
                const lastRoute = await window.NXUI.ref.get('bucketsRoute', 'lastRoute');
                return lastRoute ? lastRoute.route : null;
            }
            
            // Prioritas 3: Cek global NXUI.ref
            if (typeof NXUI !== 'undefined' && NXUI.ref && typeof NXUI.ref.get === 'function') {
                const lastRoute = await NXUI.ref.get('bucketsRoute', 'lastRoute');
                return lastRoute ? lastRoute.route : null;
            }
            
            return null;
        } catch (error) {
            // Silent fail - route tracking is optional
            return null;
        }
    }
    
    /**
     * Akses IndexedDB langsung tanpa menunggu NXUI.ref
     * Digunakan saat data sudah jelas ada dan tidak perlu menunggu
     */
    async loadLastRouteDirect() {
        try {
            // Dapatkan database name dari NEXA.url
            if (!window.NEXA || !window.NEXA.url) {
                return null;
            }
            
            const dbName = (() => {
                const dname = window.NEXA.url;
                let base64 = btoa(unescape(encodeURIComponent(dname)));
                base64 = base64.replace(/=/g, "");
                return "nexaui-" + base64;
            })();
            
            // Dapatkan versi dari NexaDb jika tersedia
            let dbVersion = 2; // Default fallback
            if (window.NXUI && window.NXUI.NexaDb) {
                try {
                    const db = new window.NXUI.NexaDb();
                    dbVersion = db.dbVersion || 2;
                } catch (e) {
                    // Silent fail, gunakan default
                }
            }
            
            // Langsung buka IndexedDB tanpa menunggu (gunakan versi dari NexaDb)
            return new Promise((resolve) => {
                const request = indexedDB.open(dbName, dbVersion);
                
                request.onsuccess = async (event) => {
                    const db = event.target.result;
                    
                    // Cek apakah store 'bucketsRoute' ada
                    if (!db.objectStoreNames.contains('bucketsRoute')) {
                        db.close();
                        resolve(null);
                        return;
                    }
                    
                    try {
                        const transaction = db.transaction(['bucketsRoute'], 'readonly');
                        const store = transaction.objectStore('bucketsRoute');
                        const getRequest = store.get('lastRoute');
                        
                        getRequest.onsuccess = async () => {
                            const result = getRequest.result;
                            db.close();
                            
                            if (result) {
                                // Decrypt jika perlu (cek apakah ada _encrypted flag)
                                if (result._encrypted && window.NXUI && window.NXUI.Storage) {
                                    try {
                                        const storage = window.NXUI.Storage();
                                        if (storage && storage.indexedDB && storage.indexedDB.decryptDataFields) {
                                            const decrypted = await storage.indexedDB.decryptDataFields(result);
                                            resolve(decrypted ? decrypted.route : null);
                                            return;
                                        }
                                    } catch (e) {
                                        // Jika decrypt gagal, gunakan data asli
                                    }
                                }
                                resolve(result.route || null);
                            } else {
                                resolve(null);
                            }
                        };
                        
                        getRequest.onerror = () => {
                            db.close();
                            resolve(null);
                        };
                    } catch (error) {
                        db.close();
                        resolve(null);
                    }
                };
                
                request.onerror = () => {
                    resolve(null);
                };
                
                // Timeout setelah 100ms jika masih loading (lebih cepat)
                setTimeout(() => {
                    if (request.readyState === 'pending') {
                        resolve(null);
                    }
                }, 100);
            });
        } catch (error) {
            return null;
        }
    }

    /**
     * Initialize route system
     * 
     * IndexedDB diaktifkan secara default untuk persistent route tracking.
     * Nonaktifkan dengan: new NexaRoute('main', { enableIndexedDB: false })
     */
    async init() {
        // nexaSubRoute dll. tidak perlu auto-navigate — navigasi dikendalikan oleh _handleSubruteGroup
        if (this.skipInitNavigation === true) {
            setTimeout(() => this.setupClickHandlers(), 200);
            return;
        }

        // Initialize IndexedDB secara async (non-blocking)
        // Jangan await karena akan blocking navigasi
        if (this.enableIndexedDB) {
            this.initDatabase(); // Jangan await, biarkan berjalan di background
        }
        
        // Save original content setelah DOM ready
        setTimeout(() => {
            if (this.container && !this.originalContent) {
                this.originalContent = this.container.innerHTML;
            }
        }, 100);
        
        // Setup click handlers untuk navigation links
        this.setupClickHandlers();
        
        // Handle browser back/forward button
        window.addEventListener('popstate', async (e) => {
            const nested = e.state && typeof e.state.nestedPackage === 'string'
                ? e.state.nestedPackage
                : (e.state && isPackageNxpackageRoute(e.state.route) ? e.state.route : null);
            const shell = e.state && typeof e.state.shell === 'string' ? e.state.shell : null;
            if (nested) {
                window.__nexaPendingNestedPackage = nested;
            }
            if (shell) {
                window.__nexaPendingPackageShell = shell;
            }
            const currentPath = window.location.href;
            const route = this.getRouteFromUrl(currentPath)
                || (e.state && typeof e.state.route === 'string' ? e.state.route : null);
            if (!route) return;

            // Route "package/{…}" (kontrak <div id="nxpackage"
            // data-nx-package="{nama}">) dirender langsung ke this.container
            // biasa (lihat renderContainer di performNavigation/navigate:
            // fallback ke this.container kalau #nxhome tidak ada di DOM).
            // Dulu di sini ada percobaan navigate('distro/grafis') dulu
            // (untuk route package MAUPUN distro/*) — DIHAPUS: sistem
            // distro (templates/distro/*) bukan bagian nxkasir, cuma
            // menghasilkan probe 404 berantai di proyek tanpa distro.

            // #package/X + shell induk: restore settings dulu lalu nested (cermin #nxhome)
            // Scoped ke package target (id="nxpackage" boleh duplikat di DOM
            // kalau 2+ App Window terbuka bersamaan — lihat komentar §performNavigation).
            const popstateTargetPkg = getPackageNameFromRoute(route);
            const popstateNxpackageEl = popstateTargetPkg
                ? document.querySelector(`#nxpackage[data-nx-package="${popstateTargetPkg}"]`)
                : null;
            if (
                isPackageNxpackageRoute(route)
                && !(popstateNxpackageEl || document.getElementById('nxpackage'))
            ) {
                const shellCandidate = shell || window.__nexaPendingPackageShell;
                const shellToUse = resolvePendingPackageShell(
                    route,
                    shellCandidate && samePackageRoute(shellCandidate, route)
                        ? shellCandidate
                        : null,
                    readPersistedNestedRecord(),
                );
                if (shellToUse) {
                    window.__nexaPendingNestedPackage = route;
                    window.__nexaPendingPackageShell = shellToUse;
                    await this.navigate(shellToUse, false);
                    window.__nexaPendingNestedPackage = null;
                    return;
                }
            }

            const sameMount = (popstateNxpackageEl || document.getElementById('nxpackage'))
                && isPackageNxpackageRoute(route);
            if (sameMount) {
                await this.navigate(route, false);
                window.__nexaPendingNestedPackage = null;
                return;
            }

            await this.navigate(route, false);
            window.__nexaPendingNestedPackage = null;
        });

        // Load route dari URL atau IndexedDB saat pertama kali load
        // Gunakan href dari window.location untuk extract route
        const currentPath = window.location.href;
        const urlRoute = this.getRouteFromUrl(currentPath);
        let initialRoute = null;
        
        if (urlRoute) {
            // URL sudah menunjukkan route tertentu (termasuk subRoute), gunakan itu
            // Ini penting untuk refresh di subRoute seperti /tentang/pengenalan
            initialRoute = urlRoute;
        } else if (this.enableIndexedDB) {
            // Jika tidak ada route di URL, load last route dari IndexedDB
            const savedRoute = await this.loadLastRoute();
            if (savedRoute) {
                // Gunakan savedRoute (termasuk subRoute jika ada)
                initialRoute = savedRoute;
            } else {
                // Jika lastRoute kosong (pertama kali kunjung), gunakan route pertama dari registrasi
                let firstRoute = null;
                if (typeof window.nexaPage !== 'undefined' && window.nexaPage.registeredRoutes && window.nexaPage.registeredRoutes.length > 0) {
                    firstRoute = firstRegisteredRouteName() || window.nexaPage.registeredRoutes[0];
                    if (firstRoute === NEXA_ROUTE_AUTOLOAD_TOKEN) {
                        firstRoute = firstRegisteredRouteName();
                    }
                } else if (this.routes.size > 0) {
                    // Fallback: ambil route pertama yang sudah terdaftar
                    firstRoute = Array.from(this.routes.keys())[0];
                }
                
                // Gunakan route pertama sebagai default
                if (firstRoute) {
                    initialRoute = firstRoute;
                }
            }
        }
        
        // Navigate ke initialRoute - pastikan handler sudah terdaftar
        if (initialRoute) {
            const performNavigation = async () => {
                // NexaPage (App.js) sering load setelah NexaRoute — tunggu mountPath lalu parse ulang URL
                for (let w = 0; w < 60; w++) {
                    if (typeof window !== 'undefined' && window.nexaPage && window.nexaPage.mountPath !== undefined) {
                        break;
                    }
                    await new Promise((r) => setTimeout(r, 50));
                }
                if (typeof window !== 'undefined' && window.nexaPage && window.nexaPage.mountPath) {
                    this.mountPath = String(window.nexaPage.mountPath).replace(/^\/+|\/+$/g, '');
                }
                const freshFromUrl = this.getRouteFromUrl(window.location.href);
                const routeToUse =
                    freshFromUrl !== null && freshFromUrl !== '' ? freshFromUrl : initialRoute;

                // Sama pola #nxhome: rute konten ada di URL. Untuk #package/…
                // shell induk (settings) disimpan terpisah; snapshot SEBELUM
                // navigate grafis (itu wipe history.state).
                const histShell = window.history.state && typeof window.history.state.shell === 'string'
                    ? window.history.state.shell
                    : null;
                const persisted = readPersistedNestedRecord();
                if (isPackageNxpackageRoute(routeToUse)) {
                    window.__nexaPendingNestedPackage = routeToUse;
                    // Jangan pakai shell package lain dari sessionStorage (Components vs Settings).
                    window.__nexaPendingPackageShell = resolvePendingPackageShell(
                        routeToUse,
                        histShell,
                        persisted,
                    );
                } else {
                    window.__nexaPendingNestedPackage = readPendingNestedPackage(routeToUse);
                    const pendingNested = window.__nexaPendingNestedPackage;
                    if (pendingNested && isPackageNxpackageRoute(pendingNested)) {
                        window.__nexaPendingPackageShell = resolvePendingPackageShell(
                            pendingNested,
                            histShell,
                            persisted,
                        );
                    } else {
                        window.__nexaPendingPackageShell =
                            (histShell && samePackageRoute(histShell, routeToUse) ? histShell : null)
                            || (persisted && persisted.shell && samePackageRoute(persisted.shell, routeToUse)
                                ? persisted.shell
                                : null)
                            || null;
                    }
                }

                // Pastikan container ada
                if (!this.container) {
                    this.container = document.getElementById(this.containerId);
                }

                if (!this.container) {
                    return false;
                }

                // Parse route untuk mendapatkan base route (sama seperti di navigate())
                // Ini penting untuk subRoute seperti 'tentang/pengenalan' atau 'open/dataset/slug'
                const routeParts = routeToUse.split('/');
                let baseRoute = null;
                let handler = null;
                
                // Cari handler dengan mencoba route terpanjang dulu, lalu route yang lebih pendek
                // Contoh: 'open/dataset/slug-123' -> coba 'open/dataset/slug-123', lalu 'open/dataset', lalu 'open'
                for (let i = routeParts.length; i > 0; i--) {
                    const candidateRoute = routeParts.slice(0, i).join('/');
                    handler = this.routes.get(candidateRoute);
                    
                    if (handler) {
                        baseRoute = candidateRoute;
                        break;
                    }
                }
                
                // Jika handler tidak ditemukan, coba dengan route pertama saja
                if (!handler) {
                    baseRoute = routeParts[0];
                    handler = this.routes.get(baseRoute);
                }
                
                // Jika handler belum terdaftar, tunggu sampai terdaftar (maksimal 5 detik)
                // Ini penting untuk route dengan slash seperti 'open/dataset' yang perlu waktu untuk load file
                if (!handler && isRouteAutoloadEnabled()) {
                    await loadRouteModule(routeToUse, window.nexaPage?.appRoot);
                    for (let i = routeParts.length; i > 0; i--) {
                        const candidateRoute = routeParts.slice(0, i).join('/');
                        handler = this.routes.get(candidateRoute);
                        if (handler) {
                            baseRoute = candidateRoute;
                            break;
                        }
                    }
                }

                if (!handler) {
                    // Coba semua kemungkinan baseRoute (dari terpanjang ke terpendek)
                    const possibleRoutes = [];
                    for (let i = routeParts.length; i > 0; i--) {
                        possibleRoutes.push(routeParts.slice(0, i).join('/'));
                    }
                    possibleRoutes.push(routeParts[0]); // Tambahkan route pertama sebagai fallback
                    
                    for (let i = 0; i < 100; i++) {
                        await new Promise(resolve => setTimeout(resolve, 50));

                        if (!handler && isRouteAutoloadEnabled()) {
                            await loadRouteModule(routeToUse, window.nexaPage?.appRoot);
                        }
                        
                        // Coba semua kemungkinan route
                        for (const candidateRoute of possibleRoutes) {
                            handler = this.routes.get(candidateRoute);
                            if (handler) {
                                baseRoute = candidateRoute;
                                break;
                            }
                        }
                        
                        if (handler) {
                            break;
                        }
                    }
                }
                
                // Jika handler sudah terdaftar, navigate dengan route penuh (termasuk subRoute)
                if (handler) {
                    // Refresh langsung ke #workspace/… — kolom Utama
                    // ([data-nx-main="workspace"]) belum ada karena shell-nya
                    // belum pernah dirender pada fresh load/refresh. Muat
                    // shell dulu (window.nexaPage?.workspaceShell, atau rute
                    // pertama yang terdaftar di App.js sebagai fallback),
                    // lalu route workspace aslinya (routeToUse, di bawah)
                    // menyusul mengisi kolom itu. Tanpa ini, route workspace
                    // dirender ke this.container biasa dan MENGGANTI seluruh
                    // halaman — sidebar/tabs/toolbar shell ikut hilang.
                    if (isWorkspaceRoute(routeToUse) && !workspaceMainEl()) {
                        const workspaceShell =
                            (typeof window.nexaPage?.workspaceShell === 'string' && window.nexaPage.workspaceShell.trim())
                            || firstRegisteredRouteName()
                            || null;
                        if (workspaceShell) {
                            await this.navigate(workspaceShell, false);
                        }
                    }

                    // #package/… refresh: restore shell package yang SAMA dengan URL.
                    // Scoped ke package target (id="nxpackage" boleh duplikat di
                    // DOM kalau 2+ App Window terbuka — lihat §performNavigation).
                    const initialLoadTargetPkg = getPackageNameFromRoute(routeToUse);
                    const initialLoadNxpackageEl = initialLoadTargetPkg
                        ? document.querySelector(`#nxpackage[data-nx-package="${initialLoadTargetPkg}"]`)
                        : null;
                    if (
                        isPackageNxpackageRoute(routeToUse)
                        && !(initialLoadNxpackageEl || document.getElementById('nxpackage'))
                    ) {
                        const shellToUse = resolvePendingPackageShell(
                            routeToUse,
                            window.__nexaPendingPackageShell,
                            readPersistedNestedRecord(),
                        );
                        if (shellToUse) {
                            window.__nexaPendingNestedPackage = routeToUse;
                            window.__nexaPendingPackageShell = shellToUse;
                            await this.navigate(shellToUse, false);
                            return true;
                        }
                    }

                    await this.navigate(routeToUse, false);
                    return true;
                }

                return false;
            };
            
            // Mulai navigasi
            performNavigation().catch(error => {
                console.error('Navigation error:', error);
            });
        }
    }

    /**
     * Register route dengan handler
     * @param {string} route - Route path
     * @param {Function|Object} handlerOrConfig - Handler function atau config object
     *   Jika Object: { handler: Function, style: Object }
     *   Jika Function: Handler function langsung
     * @param {Object} style - Style configuration (optional, jika handler adalah function)
     *   Style config object:
     *   - container: { nx: boolean } - Konfigurasi container
     *   - rows: Array - Array konfigurasi rows dengan columns
     *   - useContainer: boolean - Apakah menggunakan container wrapper
     * 
     * Handler signature: async (routeName, container, routeMeta, style, nav) => {}
     *   - routeMeta: object dari register(…, routeMeta) atau undefined (boleh default di callback)
     *   - style: Object konfigurasi NXUI.grid (optional)
     *   - nav: { baseRoute, subRoute }
     * 
     * @example
     * // Register dengan style config
     * route.register('about', async (routeName, container, routeMeta, style, nav) => {
     *   if (style) {
     *     route.applyGridStyle(container, style);
     *   }
     * }, {
     *   useContainer: true,
     *   container: { nx: true },
     *   rows: [
     *     { columns: [{ cols: 12, content: '<h1>About</h1>' }] }
     *   ]
     * });
     * 
     * @example
     * // Register dengan config object
     * route.register('about', {
     *   handler: async (routeName, container, routeMeta, style, nav) => {
     *     if (style) route.applyGridStyle(container, style);
     *   },
     *   style: {
     *     useContainer: true,
     *     rows: [...]
     *   }
     * });
     */
    /**
     * @param {string} route
     * @param {Function|object} handlerOrConfig
     * @param {object|null} [style]
     * @param {object} [routeMeta] — meta halaman (title, description, …); juga bisa lewat handlerOrConfig.routeMeta
     */
    register(route, handlerOrConfig, style = null, routeMeta = undefined) {
        let handler;
        let routeStyle = null;
        let meta = routeMeta;

        // Handle jika handlerOrConfig adalah object dengan handler dan style
        if (typeof handlerOrConfig === 'object' && handlerOrConfig !== null && handlerOrConfig.handler) {
            handler = handlerOrConfig.handler;
            routeStyle = handlerOrConfig.style || null;
            if (handlerOrConfig.routeMeta !== undefined) {
                meta = handlerOrConfig.routeMeta;
            }
        } else if (typeof handlerOrConfig === 'function') {
            // Handler adalah function langsung
            handler = handlerOrConfig;
            routeStyle = style;
        } else {
            // Invalid handler for route
            return;
        }

        // Simpan handler dan style
        this.routes.set(route, handler);
        if (routeStyle) {
            this.routeStyles.set(route, routeStyle);
        }
        if (meta !== undefined && meta !== null) {
            this.routeMetaByRoute.set(route, meta);
        }
    }

    /**
     * Register route dengan template path secara dinamis
     * Method ini membuat handler otomatis yang menggunakan NXUI.NexaHtml().html()
     * untuk load template, sehingga tidak perlu membuat file manual seperti beranda.js
     * 
     * @param {string} route - Route path (misalnya: 'beranda', 'about', 'guides')
     * @param {string|Function|Object} templatePath - Path template file atau function/object untuk dynamic path
     *   - String: Path template statis (misalnya: 'docs/fundamental/pengenalan-framework.html')
     *   - Function: Function yang menerima context dan mengembalikan path (function(context) => string)
     *     context berisi: { route, baseRoute, subRoute, ... }
     *   - Object: { base: 'path/base.html', sub: 'path/sub/{subRoute}.html' } untuk base route dan sub-route
     * @param {Object} options - Options untuk template loading
     * @param {Object|Function} options.variables - Variables yang akan dikirim ke template
     *   - Object: Variables statis (default: {})
     *   - Function: Function yang menerima context dan mengembalikan variables (function(context) => object)
     * @param {string} options.template - Template name (default: 'theme')
     * @param {Object} options.htmlOptions - Options untuk html() method (default: {})
     * @param {Function} options.beforeLoad - Callback sebelum template di-load (async function(route, container, context))
     * @param {Function} options.afterLoad - Callback setelah template di-load (async function(route, container, context, content))
     * @param {Function} options.onError - Callback jika error (function(error, route, container))
     * 
     * @example
     * // Register route sederhana dengan template path statis
     * nexaRoute.registerTemplate('beranda', 'docs/fundamental/pengenalan-framework.html');
     * 
     * @example
     * // Register route dengan sub-route menggunakan function
     * nexaRoute.registerTemplate('guides', (context) => {
     *   const { subRoute } = context;
     *   if (subRoute) {
     *     return `docs/guides/${subRoute}.html`;
     *   }
     *   return 'docs/guides/index.html';
     * });
     * 
     * @example
     * // Register route dengan sub-route menggunakan object
     * nexaRoute.registerTemplate('guides', {
     *   base: 'docs/guides/index.html',
     *   sub: 'docs/guides/{subRoute}.html'
     * });
     * 
     * @example
     * // Register route dengan variables dinamis
     * nexaRoute.registerTemplate('guides', (context) => {
     *   return context.subRoute ? `docs/guides/${context.subRoute}.html` : 'docs/guides/index.html';
     * }, {
     *   variables: (context) => ({
     *     title: context.subRoute ? `Guide: ${context.subRoute}` : 'Guides',
     *     subRoute: context.subRoute
     *   })
     * });
     */
    registerTemplate(route, templatePath, options = {}) {
        const {
            variables = {},
            template = 'theme',
            htmlOptions = {},
            beforeLoad = null,
            afterLoad = null,
            onError = null
        } = options;

        // Buat handler yang akan menggunakan NXUI.NexaHtml().html()
        // Signature diselaraskan dengan navigate(): (routeName, container, routeMeta, style, nav)
        const handler = async (routeName, container, routeMeta, style, nav = {}) => {
            const context = {
                baseRoute: nav.baseRoute,
                subRoute: nav.subRoute,
                route: routeName,
                routeMeta: routeMeta !== undefined ? routeMeta : undefined
            };
            try {
                // Call beforeLoad callback jika ada
                if (beforeLoad && typeof beforeLoad === 'function') {
                    await beforeLoad(routeName, container, context);
                }

                // Pastikan NXUI.NexaHtml (factory eventload) tersedia
                if (typeof window.NXUI === 'undefined' || typeof window.NXUI.NexaHtml !== 'function') {
                    throw new Error('NXUI.NexaHtml is not available. Make sure NXUI is properly loaded.');
                }

                const htmlDom = window.NXUI.NexaHtml();

                // Resolve template path berdasarkan tipe
                let resolvedTemplatePath = templatePath;
                
                if (typeof templatePath === 'function') {
                    // Template path adalah function, panggil dengan context
                    resolvedTemplatePath = templatePath(context);
                } else if (typeof templatePath === 'object' && templatePath !== null) {
                    // Template path adalah object dengan base dan sub
                    const { base, sub } = templatePath;
                    const { subRoute } = context;
                    
                    if (subRoute && sub) {
                        // Ganti placeholder {subRoute} dengan nilai subRoute
                        resolvedTemplatePath = sub.replace('{subRoute}', subRoute);
                    } else if (base) {
                        resolvedTemplatePath = base;
                    } else {
                        throw new Error('Template path object must have "base" or "sub" property');
                    }
                }

                // Resolve variables berdasarkan tipe
                let resolvedVariables = {};
                if (typeof variables === 'function') {
                    // Variables adalah function, panggil dengan context
                    resolvedVariables = variables(context);
                } else if (typeof variables === 'object' && variables !== null) {
                    // Variables adalah object, merge dengan context
                    resolvedVariables = {
                        ...variables,
                        route: routeName,
                        ...context
                    };
                }

                // Merge variables dengan route info
                const templateVariables = {
                    ...resolvedVariables,
                    route: routeName,
                    baseRoute: context.baseRoute || route,
                    subRoute: context.subRoute || null
                };

                // Load template dengan variables
                let content;
                try {
                    content = await htmlDom.html(resolvedTemplatePath, templateVariables, template, htmlOptions);
                    
                    // Jika response memiliki success: false, berarti ada error
                    if (content && content.success === false) {
                        throw new Error('Template load failed');
                    }
                } catch (htmlError) {
                    // Jika file tidak ditemukan atau error, tampilkan fallback content
                    // Jangan throw error untuk menghindari console error
                    content = {
                        content: `
                            <div class="error-message" style="padding: 2rem; text-align: center;">
                                <h2>Halaman Tidak Ditemukan</h2>
                                <p>File template tidak ditemukan: <code>${resolvedTemplatePath}</code></p>
                                <p><a href="/beranda" style="color: #007bff;">← Kembali ke Dokumentasi</a></p>
                            </div>
                        `
                    };
                }

                // Set content ke container
                if (content && content.content) {
                    container.innerHTML = content.content;
                } else if (typeof content === 'string') {
                    container.innerHTML = content;
                } else {
                    // Fallback jika content format tidak valid
                    container.innerHTML = `
                        <div class="error-message" style="padding: 2rem; text-align: center;">
                            <h2>Konten Tidak Valid</h2>
                            <p>Format konten tidak valid untuk halaman ini.</p>
                            <p><a href="/beranda" style="color: #007bff;">← Kembali ke Dokumentasi</a></p>
                        </div>
                    `;
                }

                // Call afterLoad callback jika ada
                if (afterLoad && typeof afterLoad === 'function') {
                    await afterLoad(routeName, container, context, content);
                }
            } catch (error) {
                console.error('[NexaRoute] register handler error', { routeName, error });
                if (error && error.stack) {
                    console.error(error.stack);
                }
                // Call onError callback jika ada
                if (onError && typeof onError === 'function') {
                    onError(error, routeName, container);
                } else {
                    const debugExtra = this.isRouteErrorDebugVisible()
                        ? this.formatRouteErrorDebugBlock(error)
                        : '';
                    // Default error fallback - user-friendly message
                    container.innerHTML = `
                        <div class="error-message" style="padding: 2rem; text-align: center;">
                            <h2>Halaman Tidak Dapat Dimuat</h2>
                            <p>Terjadi kesalahan saat memuat halaman "${routeName}".</p>
                            <p>Silakan coba lagi atau kembali ke halaman sebelumnya.</p>
                            <p>Buka <strong>DevTools → Console</strong> untuk log detail (selalu).</p>
                            <p>
                                <a href="/docs" style="color: #007bff; margin-right: 1rem;">← Dokumentasi</a>
                                <a href="/" style="color: #007bff;">← Beranda</a>
                            </p>
                            ${debugExtra}
                        </div>
                    `;
                }
            }
        };

        // Register handler ke routes
        this.register(route, handler);
    }

    /**
     * Navigate ke route tertentu
     * Mendukung sub-routes seperti 'guides/pengenalan', 'guides/MVC', dll
     * @param {string} route - Route path (bisa dengan sub-route seperti 'guides/pengenalan')
     * @param {boolean} pushState - Apakah push ke history (default: true)
     */

    /**
     * Tangani navigasi ke grup subrute (mis. 'contact/home').
     * Memastikan host route (mis. 'workspace') dirender lebih dulu,
     * lalu merender sub-route di dalam nexaSubRoute (#mainpage).
     */
    async _handleSubruteGroup(fullRoute, groupKey, subKey, pushState, cfg) {
        // Hanya main nexaRoute yang boleh menangani subrute group
        if (this !== window.nexaRoute) return;
        const targetSub     = subKey || cfg[groupKey][0];
        const hostRoutes    = Array.isArray(cfg.route) ? cfg.route : [];
        const subContId     = cfg.containerId;
        const previousRoute = this.currentRoute;
        const path          = this.buildUrl(fullRoute);

        // Helper: cek apakah sub-container sudah ada di DOM
        const subElExists = () => !!document.getElementById(subContId);

        // Langkah 1: render host HANYA jika sub-container belum ada di DOM.
        // Jangan re-render hanya karena currentRoute bukan host — cukup cek DOM.
        if (!subElExists()) {
            if (hostRoutes.length > 0) {
                const hostRoute   = hostRoutes[0];
                let   hostHandler = this.routes.get(hostRoute);
                if (!hostHandler) hostHandler = await this.waitForRoute(hostRoute);
                if (hostHandler) {
                    if (this.container) this.container.innerHTML = '';
                    const hostMeta = this.routeMetaByRoute.get(hostRoute);
                    try {
                        await hostHandler(
                            hostRoute, this.container, hostMeta,
                            this.routeStyles.get(hostRoute) || null,
                            { baseRoute: hostRoute, subRoute: null }
                        );
                    } catch (e) { console.error('[NexaRoute] subrute host error', e); }
                }
            } else {
                // Tidak ada host — buat shell sendiri
                if (this.container) this.container.innerHTML = `<div id="${subContId}"></div>`;
            }
        }

        // Langkah 2: tunggu nexaSubRoute tersedia (registerAllRoutes mungkin belum selesai)
        if (!window.nexaSubRoute) {
            let _w = 0;
            while (!window.nexaSubRoute && _w < 3000) {
                await new Promise(r => setTimeout(r, 50)); _w += 50;
            }
        }

        // Langkah 3: tunggu #subContId muncul di DOM (host render mungkin async)
        let subEl = document.getElementById(subContId);
        if (!subEl) {
            let _w = 0;
            while (!subEl && _w < 3000) {
                await new Promise(r => setTimeout(r, 50)); _w += 50;
                subEl = document.getElementById(subContId);
            }
        }

        // Langkah 4: render sub-route di dalam sub-container
        if (window.nexaSubRoute && subEl) {
            window.nexaSubRoute.container    = subEl;
            window.nexaSubRoute.currentRoute = null; // paksa re-render
            await window.nexaSubRoute.navigate(targetSub, false);
        }

        // Langkah 5: update state, URL, IndexedDB
        this.currentRoute = fullRoute;
        if (pushState) {
            window.history.pushState({ route: fullRoute }, '', path);
        } else {
            try {
                const cp = new URL(window.location.href).pathname;
                if (cp !== path) window.history.replaceState({ route: fullRoute }, '', path);
            } catch (_) {}
        }
        if (this.enableIndexedDB) await this.saveRoute(fullRoute);
        this.updateActiveNav(fullRoute);
        requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('nxui:routeChange', {
                detail: {
                    route: fullRoute, baseRoute: groupKey, subRoute: subKey, path,
                    previousRoute, isSubRouteNavigation: false,
                    routeMeta: null, defaultRouteMeta: this.defaultRouteMeta,
                }
            }));
        });
        if (this.onRouteChange) {
            try {
                this.onRouteChange({
                    route: fullRoute, baseRoute: groupKey, subRoute: subKey, path,
                    previousRoute, container: this.container,
                    routeMeta: null, defaultRouteMeta: this.defaultRouteMeta,
                });
            } catch (_) {}
        }
    }

    async navigate(route, pushState = true) {
        if (this.currentRoute === route) return;

        // Re-lookup container jika belum ada (lazy init untuk sub-container seperti nexaSubRoute)
        if (!this.container && this.containerId) {
            this.container = document.getElementById(this.containerId);
        }
        if (!this.container) return;

        // ── Subrute group: delegasi ke _handleSubruteGroup — hanya untuk nexaRoute utama ──
        if (this === window.nexaRoute) {
            const _nxCfg  = window.nexaPage?.subrutes;
            if (_nxCfg && typeof _nxCfg === 'object') {
                const _firstSeg = route.split('/')[0];
                // 1. Direct match: 'contact/about' → groupKey='contact'
                if (Array.isArray(_nxCfg[_firstSeg])) {
                    const _subKey = route.includes('/') ? route.split('/').slice(1).join('/') : null;
                    await this._handleSubruteGroup(route, _firstSeg, _subKey, pushState, _nxCfg);
                    return;
                }
                // 2. Reverse lookup: 'about' ada di dalam salah satu subrute list
                //    → redirect ke 'contact/about' agar subrute system mengambil alih
                for (const [_gk, _sl] of Object.entries(_nxCfg)) {
                    if (_gk === 'containerId' || _gk === 'route' || !Array.isArray(_sl)) continue;
                    if (_sl.includes(route)) {
                        await this._handleSubruteGroup(`${_gk}/${route}`, _gk, route, pushState, _nxCfg);
                        return;
                    }
                }
            }
        }

        // Parse route untuk mendapatkan base route dan sub-route
        // Handle nested routes dengan mencari route terpanjang yang terdaftar
        const routeParts = route.split('/');
        let baseRoute = null;
        let subRoute = null;
        let handler = null;
        
        // Cari handler dengan mencoba route terpanjang dulu, lalu route yang lebih pendek
        // Contoh: route = "docs/fundamental/pengenalan-framework"
        // Coba: "docs/fundamental/pengenalan-framework" -> tidak ada
        // Coba: "docs/fundamental" -> ada! (terdaftar)
        // baseRoute = "docs/fundamental", subRoute = "pengenalan-framework"
        for (let i = routeParts.length; i > 0; i--) {
            const candidateRoute = routeParts.slice(0, i).join('/');
            handler = this.routes.get(candidateRoute);
            
            if (handler) {
                baseRoute = candidateRoute;
                subRoute = i < routeParts.length ? routeParts.slice(i).join('/') : null;
                break;
            }
        }
        
        // Jika handler tidak ditemukan, coba dengan route pertama saja (untuk backward compatibility)
        if (!handler) {
            baseRoute = routeParts[0];
            subRoute = routeParts.length > 1 ? routeParts.slice(1).join('/') : null;
            handler = this.routes.get(baseRoute);
        }
        
        if (!handler && isRouteAutoloadEnabled()) {
            await loadRouteModule(route, window.nexaPage?.appRoot);
            for (let i = routeParts.length; i > 0; i--) {
                const candidateRoute = routeParts.slice(0, i).join('/');
                handler = this.routes.get(candidateRoute);
                if (handler) {
                    baseRoute = candidateRoute;
                    subRoute =
                        i < routeParts.length ? routeParts.slice(i).join('/') : null;
                    break;
                }
            }
        }

        if (!handler) {
            // Route belum terdaftar, tunggu sampai terdaftar (maksimal 5 detik)
            // Untuk route dengan slash seperti 'open/dataset', coba semua kemungkinan route
            const possibleRoutes = [];
            for (let i = routeParts.length; i > 0; i--) {
                possibleRoutes.push(routeParts.slice(0, i).join('/'));
            }
            possibleRoutes.push(routeParts[0]); // Tambahkan route pertama sebagai fallback
            
            handler = await this.waitForAnyRoute(possibleRoutes);
            if (handler) {
                // Update baseRoute sesuai dengan route yang ditemukan
                for (const candidateRoute of possibleRoutes) {
                    if (this.routes.get(candidateRoute) === handler) {
                        baseRoute = candidateRoute;
                        subRoute = route.startsWith(candidateRoute + '/') 
                            ? route.substring(candidateRoute.length + 1) 
                            : null;
                        break;
                    }
                }
            }
        }
        
        // Jika handler masih tidak ditemukan, coba lagi dengan retry mechanism
        if (!handler) {
            // Retry sekali lagi dengan delay lebih pendek
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Coba lagi semua kemungkinan route
            const possibleRoutes = [];
            for (let i = routeParts.length; i > 0; i--) {
                possibleRoutes.push(routeParts.slice(0, i).join('/'));
            }
            possibleRoutes.push(routeParts[0]);
            
            for (const candidateRoute of possibleRoutes) {
                handler = this.routes.get(candidateRoute);
                if (handler) {
                    baseRoute = candidateRoute;
                    subRoute = route.startsWith(candidateRoute + '/') 
                        ? route.substring(candidateRoute.length + 1) 
                        : null;
                    break;
                }
            }
            
            // Jika masih tidak ada, tunggu sekali lagi
            if (!handler) {
                handler = await this.waitForAnyRoute(possibleRoutes);
                if (handler) {
                    for (const candidateRoute of possibleRoutes) {
                        if (this.routes.get(candidateRoute) === handler) {
                            baseRoute = candidateRoute;
                            subRoute = route.startsWith(candidateRoute + '/') 
                                ? route.substring(candidateRoute.length + 1) 
                                : null;
                            break;
                        }
                    }
                }
            }
        }
        
        if (handler) {
            // Simpan previous route sebelum update
            const previousRoute = this.currentRoute;

            // Cek apakah ini navigasi subRoute dalam baseRoute yang sama
            // Untuk transisi yang lebih smooth seperti tabs
            const currentBaseRoute = previousRoute ? previousRoute.split('/')[0] : null;
            const isSubRouteNavigation = currentBaseRoute && baseRoute === currentBaseRoute && previousRoute !== route;
            
            // Cek apakah ada subRoute (untuk refresh atau first load dengan subRoute)
            const hasSubRoute = subRoute !== null && subRoute !== undefined;

            // Snapshot SEBELUM clear/render: #nxpackage MILIK PACKAGE TARGET
            // sudah ada? Ada + route #package/… = isi mount di dalam shell
            // distro (settings). URL/currentRoute tetap di shell — refresh
            // tidak loncat ke tables/index.
            // id="nxpackage" BOLEH DUPLIKAT di DOM kalau 2+ App Window (mis.
            // Settings DAN Components) terbuka bersamaan (multi-window) —
            // document.getElementById('nxpackage') HANYA menemukan elemen
            // PERTAMA di DOM, bisa jadi milik window LAIN yang bukan target.
            // Query dengan selector [data-nx-package="{target}"] supaya
            // SELALU menemukan elemen milik package yang benar, apa pun
            // urutannya di DOM (kontrak: tiap shell package WAJIB menulis
            // `<div id="nxpackage" data-nx-package="{nama}">`).
            // Fallback ke getElementById('nxpackage') + this._packageShellRoute
            // HANYA kalau elemen belum sempat diberi atribut (shell lama
            // yang belum di-update ikut kontrak ini).
            const targetPkg = getPackageNameFromRoute(route);
            const nxpackageEl = typeof document !== 'undefined'
                ? (targetPkg && document.querySelector(`#nxpackage[data-nx-package="${targetPkg}"]`))
                    || document.getElementById('nxpackage')
                : null;
            const nxpackageOwnerPkg = nxpackageEl
                ? (nxpackageEl.getAttribute('data-nx-package') || null)
                : null;
            const nxpackageExistedBefore = !!nxpackageEl
                && (nxpackageOwnerPkg
                    ? (!!targetPkg && nxpackageOwnerPkg === targetPkg)
                    : samePackageRoute(this._packageShellRoute, route));
            const isNestedPackageFill =
                isPackageNxpackageRoute(route) && nxpackageExistedBefore;
            // Route workspace/* yang kolomnya SUDAH ada = mengisi kolom
            // Utama shell, bukan pindah halaman — diperlakukan sama dengan
            // nested package fill (shell tetap route aktif).
            const isWorkspaceFill = isWorkspaceRoute(route) && !!workspaceMainEl();

            // Nested fill: jangan ganti currentRoute (tetap settings / shell distro)
            if (!isNestedPackageFill && !isWorkspaceFill) {
                this.currentRoute = route;
            }

            // Buka shell package (index) → catat shell aktif; buang persist package lain.
            const openedShellPkg = getPackageShellNameForHomeAutoload(route);
            if (openedShellPkg && !isNestedPackageFill) {
                this._packageShellRoute = route;
                const pending = window.__nexaPendingNestedPackage;
                if (pending && samePackageRoute(route, pending)) {
                    persistNestedPackage(route, pending);
                } else {
                    // Shell baru (mis. Settings setelah Components) — jangan warisi nested lama.
                    clearPersistedNestedPackage();
                    if (pending && !samePackageRoute(route, pending)) {
                        window.__nexaPendingNestedPackage = null;
                    }
                }
            }
            
            // Build URL dengan base path
            const path = this.buildUrl(route);

            // Hide + destroy spinner lama (sebelum clear container)
            // Jangan cuma hide + null — node .nxui-spinner bisa tertinggal di app body.
            if (this.spinner) {
                try {
                    if (typeof this.spinner.destroy === 'function') {
                        this.spinner.destroy();
                    } else if (typeof this.spinner.hide === 'function') {
                        this.spinner.hide();
                    }
                } catch (e) {
                    // Ignore error
                }
            }
            this.spinner = null;
            this.clearOrphanWorkAreaSpinners();

            // Route "package/{…}" → #nxpackage HANYA jika package user sudah
            // memasang elemen itu UNTUK PACKAGE YANG SAMA (nxpackageExistedBefore
            // sudah memverifikasi ini di atas, lihat komentarnya) — bukan cuma
            // elemen itu eksis. #nxpackage milik package LAIN (mis. Settings)
            // TIDAK BOLEH dipakai untuk render Components; harus lewat #nxhome
            // dulu supaya shell components/index.js benar-benar dipasang ulang.
            // Route "distro/{file}" (bukan grafis) → #nxhome.
            // "distro/grafis" → container utama (NXHOME).
            // Route "workspace/{…}" → kolom [data-nx-main="workspace"]
            // (kolom Utama shell, opsional — lihat isWorkspaceRoute()'s
            // header). Dicek PERTAMA supaya tidak tersangkut cabang
            // package/distro; kalau kolomnya tidak ada di DOM, jatuh ke
            // container utama seperti route biasa.
            let renderContainer = isWorkspaceRoute(route)
                ? (workspaceMainEl() || this.container)
                : isPackageNxpackageRoute(route)
                ? (nxpackageExistedBefore && nxpackageEl
                    || document.getElementById('nxhome')
                    || this.container)
                : isDistroNxhomeRoute(route)
                ? (document.getElementById('nxhome') || this.container)
                : this.container;

            // App window di #nxhome: siapkan bingkai DULU, baru clear TARGET isi.
            // Jangan clear #nxhome dulu (itu menghancurkan bingkai → kedip / seolah 2 konten).
            if (
                typeof window.nxPrepareAppWindowContainer === 'function'
                && renderContainer
                && !isSubRouteNavigation
            ) {
                try {
                    const prepared = await window.nxPrepareAppWindowContainer({
                        route,
                        container: renderContainer,
                        isNestedPackageFill,
                        previousRoute,
                    });
                    if (prepared && prepared.container) {
                        renderContainer = prepared.container;
                    }
                } catch (prepErr) {
                    console.warn('[NexaRoute] nxPrepareAppWindowContainer:', prepErr);
                }
            }

            // Clear HANYA render target (body window ATAU #nxhome/#nxpackage biasa)
            if (!isSubRouteNavigation && renderContainer) {
                renderContainer.innerHTML = '';
            }
            // Update URL + history — cermin #nxhome:
            // konten nested → URL = package/tables (rute sebelumnya di URL),
            // state.shell = settings (induk yang memasang #nxpackage).
            if (isNestedPackageFill) {
                let shellRoute = this._packageShellRoute || previousRoute || this.currentRoute;
                if (!samePackageRoute(shellRoute, route)) {
                    shellRoute = inferPackageShellRoute(route) || shellRoute;
                }
                const contentPath = this.buildUrl(route);
                const state = { route, shell: shellRoute, nestedPackage: route };
                this._packageShellRoute = shellRoute;
                this._nestedPackageRoute = route;
                this.currentRoute = route;
                persistNestedPackage(shellRoute, route);
                if (pushState) {
                    window.history.pushState(state, '', contentPath);
                } else {
                    window.history.replaceState(state, '', contentPath);
                }
                if (this.enableIndexedDB) {
                    await this.saveRoute(route);
                }
            } else {
                const state = { route };
                const prev = window.history.state;
                const pending = window.__nexaPendingNestedPackage;
                if (
                    prev
                    && typeof prev.nestedPackage === 'string'
                    && prev.route === route
                ) {
                    state.nestedPackage = prev.nestedPackage;
                    if (prev.shell) state.shell = prev.shell;
                } else if (typeof pending === 'string' && isPackageNxpackageRoute(pending)) {
                    state.nestedPackage = pending;
                    if (window.__nexaPendingPackageShell) {
                        state.shell = window.__nexaPendingPackageShell;
                    }
                } else {
                    this._nestedPackageRoute = null;
                    const r = String(route || '');
                    if (!r.startsWith('distro/') && !isPackageNxpackageRoute(r)) {
                        clearPersistedNestedPackage();
                        this._packageShellRoute = null;
                    }
                }
                if (pushState) {
                    window.history.pushState(state, '', path);
                } else {
                    const currentHref = window.location.href;
                    const currentPath = new URL(currentHref).pathname;
                    if (currentPath !== path) {
                        window.history.replaceState(state, '', path);
                    } else {
                        window.history.replaceState(state, '', currentHref);
                    }
                }

                if (this.enableIndexedDB) {
                    await this.saveRoute(route);
                }
            }
            
            // Untuk subRoute navigation, gunakan delay minimum untuk spinner
            // Ini membuat transisi lebih smooth seperti tabs tanpa berkedip
            const spinnerDelay = isSubRouteNavigation ? 150 : 0; // Delay 150ms untuk subRoute
            let spinnerTimeout = null;
            let spinnerShown = false;

            // Tampilkan spinner SEBELUM handler (sinkron jika tanpa delay).
            // Jangan pakai requestAnimationFrame untuk kasus delay=0: handler async yang selesai
            // sangat cepat bisa selesai sebelum frame berikutnya sehingga spinner tidak pernah terlihat.
            if (spinnerDelay > 0) {
                spinnerTimeout = setTimeout(() => {
                    if (!spinnerShown) {
                        this.showSpinner();
                        spinnerShown = true;
                    }
                }, spinnerDelay);
            } else {
                this.showSpinner();
                spinnerShown = true;
            }

            // Validasi lisensi otomatis jika credential:true (kecuali route publik)
            const _publicRoutes = new Set(['licenses', 'signup', 'beranda', 'dashboard/signin', 'dashboard/signup', 'dashboard/forgot']);
            if (window.nexaPage?.credential === true && !_publicRoutes.has(baseRoute) && !_publicRoutes.has(route)) {
              if (typeof window.NXUI?.checkLicense === 'function') {
                const cred = await window.NXUI.checkLicense();
                if (!cred) return;
              }
            }

            // Start handler execution
            const routeMetaForHandler = this.routeMetaByRoute.get(baseRoute);
            const handlerPromise = handler(
                route,
                renderContainer,
                routeMetaForHandler,
                this.routeStyles.get(baseRoute) || null,
                { baseRoute, subRoute }
            );

            // Tunggu handler selesai
            try {
                await handlerPromise;
                // Autoload home.js HANYA jika shell baru memasang #nxpackage
                // (belum ada sebelum navigate). #package/tables ke mount yang
                // sudah ada → bukan shell, jangan minta tables/home.js.
                //
                // this.currentRoute !== route: route handler INI (mis. sebuah
                // route "beranda" yang isinya cuma redirect, lihat
                // templates/beranda.js) bisa saja melakukan navigate() lain
                // SECARA NESTED di dalam dirinya sendiri (await NXUI.load(...))
                // SEBELUM handlerPromise di baris await ini resolve — begitu
                // nested navigate() itu (dan seluruh rantai autoload di
                // dalamnya) selesai, this.currentRoute sudah berubah ke route
                // TUJUAN nested itu, BUKAN `route` (asal) lagi. Tanpa guard
                // ini, autoloadPackageHomeIfNeeded(route, ...) di sini
                // tetap dipanggil dengan `route` yang SUDAH USANG (mis.
                // "beranda") — getPackageShellNameForHomeAutoload() menganggap
                // route 1-segmen itu shell package sendiri, memicu navigate()
                // KEDUA yang tidak diminta (ke "package/beranda/home") yang
                // pada gilirannya memicu ULANG redirect beranda.js, menimpa
                // #nxpackage yang baru saja diisi dengan benar oleh rantai
                // navigasi PERTAMA — bug nyata, ditemukan lewat console.log
                // stack trace saat startup (bukan navigasi biasa/klik user),
                // di project konsultan (D:\konsultan).
                if (!this._packageHomeAutoloadLock && this.currentRoute === route) {
                    await this.autoloadPackageHomeIfNeeded(
                        route,
                        renderContainer,
                        nxpackageExistedBefore,
                    );
                }
            } catch (error) {
                console.error('[NexaRoute] navigate handler error', { route, baseRoute, subRoute, error });
                if (error && error.stack) {
                    console.error(error.stack);
                }
                if (renderContainer) {
                    const debugExtra = this.isRouteErrorDebugVisible()
                        ? this.formatRouteErrorDebugBlock(error)
                        : '';
                    renderContainer.innerHTML = `
                        <div class="error-message" style="padding: 1rem;">
                            <p>Terjadi kesalahan saat memuat halaman. Silakan coba lagi.</p>
                            <p style="font-size:0.9rem;color:#555;">Lihat <strong>Console</strong> (F12) untuk detail error.</p>
                            ${debugExtra}
                        </div>
                    `;
                }
            }
            
            // Cancel spinner timeout jika handler sudah selesai sebelum delay
            if (spinnerTimeout) {
                clearTimeout(spinnerTimeout);
            }
            
            // Jika spinner sudah muncul, tunggu sedikit sebelum hide untuk smooth transition
            if (spinnerShown) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Hide spinner SETELAH handler selesai
            requestAnimationFrame(() => {
                this.hideSpinner();
            });
            
            // Nested fill: event tetap pakai rute konten (cermin #nxhome / distro/X)
            const routeForUi = route;
            const baseForUi = baseRoute;

            // Update active state pada navigation
            this.updateActiveNav(routeForUi);
            
            // Dispatch custom event untuk route change
            // Event ini bisa digunakan oleh komponen lain (seperti Sidebar) untuk update state
            requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('nxui:routeChange', {
                    detail: {
                        route: routeForUi,
                        baseRoute: baseForUi,
                        subRoute: subRoute,
                        path: path,
                        previousRoute: previousRoute,
                        isSubRouteNavigation: isSubRouteNavigation,
                        nestedPackage: isNestedPackageFill ? route : null,
                        packageShell: isNestedPackageFill ? this._packageShellRoute : null,
                        routeMeta: this.routeMetaByRoute.get(baseForUi) || null,
                        defaultRouteMeta: this.defaultRouteMeta
                    }
                }));
            });
            
            // Call callback jika ada
            if (this.onRouteChange && typeof this.onRouteChange === 'function') {
                try {
                    // Call callback dengan route info
                    this.onRouteChange({
                        route: routeForUi,
                        baseRoute: baseForUi,
                        subRoute: subRoute,
                        path: path,
                        previousRoute: previousRoute,
                        isSubRouteNavigation: isSubRouteNavigation,
                        nestedPackage: isNestedPackageFill ? route : null,
                        packageShell: isNestedPackageFill ? this._packageShellRoute : null,
                        container: this.container,
                        routeMeta: this.routeMetaByRoute.get(baseForUi) || null,
                        defaultRouteMeta: this.defaultRouteMeta
                    });
                } catch (error) {
                    console.error('Error in onRouteChange callback:', error);
                }
            }
        } else {
        }
    }

    /**
     * home.js hanya jika shell package BARU memasang #nxpackage.
     * Refresh: isi dari history.state / sessionStorage / __nexaPendingNestedPackage
     * (klik pushState terakhir), bukan selalu home.
     */
    async autoloadPackageHomeIfNeeded(openedRoute, renderContainer, nxpackageExistedBefore) {
        if (this._packageHomeAutoloadLock) return;
        // Mount sudah ada sebelum klik → navigasi konten, bukan buka shell
        if (nxpackageExistedBefore) return;
        if (!renderContainer || renderContainer.id === 'nxpackage') return;

        const pkg = getPackageShellNameForHomeAutoload(openedRoute);
        if (!pkg) return;

        await Promise.resolve();
        // Scoped ke renderContainer (App Window body shell yang BARU
        // dirender) — BUKAN document.getElementById('nxpackage') global.
        // id="nxpackage" BOLEH duplikat di DOM kalau 2+ App Window (mis.
        // Settings + Components) terbuka bersamaan (multi-window); query
        // global cuma menemukan yang PERTAMA di DOM, bisa salah window.
        const mount = renderContainer && typeof renderContainer.querySelector === 'function'
            ? renderContainer.querySelector('#nxpackage')
            : null;
        // Package ini tidak memasang #nxpackage (mis. tables) → skip
        if (!mount) return;

        const homeName = (Array.isArray(window.nexaPage?.packageRoutes)
            ? window.nexaPage.packageRoutes
            : []
        ).find((n) => n && n !== 'autoload') || 'home';
        const homeRoute = `package/${pkg}/${homeName}`;

        // Pending dari refresh (sebelum grafis wipe state) atau history.state
        let pendingNested = window.__nexaPendingNestedPackage;
        if (!pendingNested || !isPackageNxpackageRoute(pendingNested)) {
            pendingNested = window.history.state
                && typeof window.history.state.nestedPackage === 'string'
                && isPackageNxpackageRoute(window.history.state.nestedPackage)
                ? window.history.state.nestedPackage
                : null;
        }
        if (!pendingNested) {
            pendingNested = readPendingNestedPackage(this.currentRoute || openedRoute);
        }
        // Nested harus package yang sama dengan shell yang baru dibuka.
        if (pendingNested && !samePackageRoute(openedRoute, pendingNested)) {
            pendingNested = null;
            window.__nexaPendingNestedPackage = null;
        }
        // State lama berawalan "distro/" (mis. tersisa dari sessionStorage
        // sebelum route ini disesuaikan tanpa sistem distro) tidak pernah
        // valid di sini — nxkasir tidak punya templates/distro/*, navigate()
        // ke situ cuma probe 404 berantai. Buang, pakai homeRoute biasa.
        if (pendingNested && pendingNested.split('/')[0] === 'distro') {
            pendingNested = null;
            window.__nexaPendingNestedPackage = null;
            clearPersistedNestedPackage();
        }
        const targetRoute = pendingNested || homeRoute;

        this._packageHomeAutoloadLock = true;
        try {
            await this.navigate(targetRoute, false);
            window.__nexaPendingNestedPackage = null;
        } catch (err) {
            console.warn(
                `[NexaRoute] #nxpackage di package/${pkg} gagal muat ${targetRoute}:`,
                err && err.message ? err.message : err,
            );
        } finally {
            this._packageHomeAutoloadLock = false;
        }
    }

    /**
     * Muat ulang route aktif tanpa klik navigasi (bypass guard `navigate` yang melewati route sama).
     * Contoh: setelah simpan data, panggil `await window.nexaRoute.refresh()` atau `await NXUI.Refresh.refresh()`.
     *
     * @param {object} [options]
     * @param {string} [options.route] — Jika diisi, muat ulang route ini (bukan `currentRoute`).
     * @param {boolean} [options.pushState=false] — Jika true, `history.pushState`; default replace agar tidak menumpuk history.
     * @param {boolean} [options.hard=false] — Jika true, `window.location.reload()` (reload penuh browser, bukan SPA).
     * @returns {Promise<void>}
     */
    async refresh(options = {}) {
        if (options && options.hard === true && typeof window !== 'undefined' && typeof window.location !== 'undefined') {
            window.location.reload();
            return;
        }
        const route =
            typeof options.route === 'string' && options.route.trim() !== ''
                ? options.route.trim()
                : this.currentRoute;
        if (!route) {
            return;
        }
        const pushState = options.pushState === true;
        if (this.currentRoute === route) {
            this.currentRoute = null;
        }
        await this.navigate(route, pushState);
    }

    /**
     * Host spinner di work area (#nxhome / app window) — bukan viewport penuh.
     * NXHOME + launcher kiri (Development/index.js) menggeser pusat visual;
     * overlay `body`/`position:fixed` terlihat “nyempil” di sudut app window.
     * @returns {HTMLElement|null}
     */
    resolveWorkAreaSpinnerHost() {
        if (typeof document === 'undefined') return null;
        const home = document.getElementById('nxhome');
        if (!home) return null;
        const win =
            home.querySelector('.nx-app-window:not(.nx-app-window--minimized)') ||
            document.querySelector('#nxhome .nx-app-window:not(.nx-app-window--minimized)');
        const body = win && win.querySelector
            ? win.querySelector('.nx-app-window__body')
            : null;
        return body || win || home;
    }

    /**
     * Paksa .nxui-spinner mengisi host (tengah geometris app window / #nxhome).
     * Jangan set display:!important — hide() memakai display:none tanpa important.
     * @param {HTMLElement} host
     */
    pinSpinnerToHost(host) {
        if (!host) return;
        const cs = window.getComputedStyle(host);
        if (cs.position === 'static') {
            host.style.position = 'relative';
        }
        const el = host.querySelector(':scope > .nxui-spinner');
        if (!el) return;
        el.style.setProperty('position', 'absolute', 'important');
        el.style.setProperty('inset', '0', 'important');
        el.style.setProperty('top', '0', 'important');
        el.style.setProperty('left', '0', 'important');
        el.style.setProperty('right', '0', 'important');
        el.style.setProperty('bottom', '0', 'important');
        el.style.setProperty('width', '100%', 'important');
        el.style.setProperty('height', '100%', 'important');
        el.style.setProperty('min-height', '0', 'important');
        el.style.setProperty('padding', '0', 'important');
        el.style.setProperty('margin', '0', 'important');
        // display tanpa !important — hide() harus bisa set none
        el.style.display = 'flex';
        el.style.setProperty('align-items', 'center', 'important');
        el.style.setProperty('justify-content', 'center', 'important');
        el.style.setProperty('flex-direction', 'column', 'important');
        el.style.setProperty('box-sizing', 'border-box', 'important');
        el.style.setProperty('background', 'transparent', 'important');
        el.style.setProperty('pointer-events', 'none', 'important');
        el.style.setProperty('z-index', '60', 'important');
        el.style.setProperty('transform', 'none', 'important');
    }

    /**
     * Show spinner untuk loading indicator (synchronous - langsung muncul)
     * Jika work area (#nxhome / app window) ada → tengah host itu (bukan viewport).
     * Else jika centerScreen: true → overlay body (tengah layar).
     * Else → inline di containerId.
     */
    showSpinner() {
        // Cek apakah spinner diaktifkan
        if (this.spinnerConfig && this.spinnerConfig.enabled === false) {
            return;
        }
        
        // Cek apakah NXUI.spinner tersedia
        if (typeof window.NXUI === 'undefined' || typeof window.NXUI.spinner !== 'function') {
            return; // Silent fail
        }
        
        try {
            // Selalu buat spinner baru karena container sudah di-clear
            // Reset spinner instance untuk memastikan dibuat ulang
            if (this.spinner && typeof this.spinner.destroy === 'function') {
                try {
                    this.spinner.destroy();
                } catch (e) {
                    // Ignore
                }
            }
            this.spinner = null;

            const workHost = this.resolveWorkAreaSpinnerHost();
            const centerScreen = (this.spinnerConfig && this.spinnerConfig.centerScreen !== false) ? true : false;

            let spinnerType;
            let spinnerTarget;

            if (workHost) {
                // Distro NXHOME: pusatkan di app window / #nxhome
                spinnerType = 'inline';
                spinnerTarget = workHost;
            } else if (centerScreen) {
                spinnerType = 'overlay';
                spinnerTarget = 'body';
            } else {
                spinnerType = (this.spinnerConfig && this.spinnerConfig.type) || 'inline';
                spinnerTarget = `#${this.containerId}`;
                if (!this.container) {
                    this.container = document.getElementById(this.containerId);
                    if (!this.container) {
                        return; // Silent fail
                    }
                }
                if (this.container && this.container.offsetHeight === 0) {
                    this.container.style.minHeight = '200px';
                }
            }
            
            const spinnerOptions = {
                target: spinnerTarget,
                type: spinnerType,
                size: (this.spinnerConfig && this.spinnerConfig.size) || 'medium',
                color: (this.spinnerConfig && this.spinnerConfig.color) || '#007bff',
                position: (this.spinnerConfig && this.spinnerConfig.position) || 'center',
                message: (this.spinnerConfig && this.spinnerConfig.message) || '',
                autoShow: false,
            };
            
            this.spinner = window.NXUI.spinner(spinnerOptions);
            
            // Show spinner LANGSUNG (synchronous)
            if (this.spinner && typeof this.spinner.show === 'function') {
                this.spinner.show();
            }
            if (workHost) {
                this.pinSpinnerToHost(workHost);
            }
        } catch (error) {
            // Silent fail - jangan ganggu eksekusi
        }
    }

    /**
     * Show spinner secara asynchronous untuk memastikan spinner muncul sebelum handler dieksekusi
     * @returns {Promise} Promise yang resolve setelah spinner muncul
     */
    async showSpinnerAsync() {
        return new Promise((resolve) => {
            // Panggil showSpinner synchronous dulu
            this.showSpinner();
            
            // Gunakan requestAnimationFrame untuk memastikan DOM sudah update
            requestAnimationFrame(() => {
                // Tambahkan delay kecil untuk memastikan spinner benar-benar terlihat
                setTimeout(() => {
                    resolve();
                }, 10);
            });
        });
    }

    /**
     * Tunggu content benar-benar ter-render dan terlihat di container
     * Mengecek apakah elemen-elemen sudah ter-render di DOM, bukan hanya innerHTML
     * @returns {Promise} Promise yang resolve setelah content ter-render
     */
    async waitForContentRendered() {
        return new Promise((resolve) => {
            if (!this.container) {
                resolve();
                return;
            }

            let checkCount = 0;
            const maxChecks = 60; // Maksimal 3 detik (60 * 50ms)

            // Cek apakah content sudah ter-render
            const checkContent = () => {
                checkCount++;
                
                // Cek apakah container memiliki content
                const hasContent = this.container && this.container.innerHTML.trim().length > 0;
                
                if (hasContent) {
                    // Cek apakah ada elemen yang sudah ter-render di DOM
                    const hasRenderedElements = this.container.children.length > 0 || 
                                                this.container.querySelector('*') !== null;
                    
                    // Cek apakah container sudah memiliki tinggi (menandakan content terlihat)
                    const hasHeight = this.container.offsetHeight > 0 || 
                                     this.container.scrollHeight > 0;
                    
                    if (hasRenderedElements && hasHeight) {
                        // Content sudah ter-render dan terlihat
                        // Tunggu sedikit untuk memastikan semua render selesai
                        requestAnimationFrame(() => {
                            requestAnimationFrame(() => {
                                resolve();
                            });
                        });
                        return;
                    }
                }
                
                // Jika belum ter-render dan belum mencapai max checks, cek lagi
                if (checkCount < maxChecks) {
                    setTimeout(checkContent, 50);
                } else {
                    // Timeout, resolve anyway
                    resolve();
                }
            };

            // Mulai cek content setelah delay kecil
            setTimeout(checkContent, 10);
        });
    }

    /**
     * Hapus sisa .nxui-spinner di host work area (setelah destroy gagal / orphan).
     */
    clearOrphanWorkAreaSpinners() {
        try {
            const host = this.resolveWorkAreaSpinnerHost();
            if (!host) return;
            host.querySelectorAll(':scope > .nxui-spinner').forEach((el) => {
                try {
                    el.remove();
                } catch (_) {
                    /* ignore */
                }
            });
        } catch (_) {
            /* ignore */
        }
    }

    /**
     * Hide spinner — destroy + lepas dari DOM (penting untuk host app window).
     * hide() saja bisa gagal kalau style display di-pin dengan !important.
     */
    hideSpinner() {
        if (this.spinner) {
            try {
                if (typeof this.spinner.destroy === 'function') {
                    this.spinner.destroy();
                } else if (typeof this.spinner.hide === 'function') {
                    this.spinner.hide();
                }
            } catch (error) {
                // Silent fail
            }
            this.spinner = null;
        }
        this.clearOrphanWorkAreaSpinners();
    }

    /**
     * Tunggu route terdaftar (untuk handle refresh saat routes belum terdaftar)
     * @param {string} route - Route yang ditunggu
     * @returns {Promise<Function|null>} Handler function atau null jika timeout
     */
    async waitForRoute(route) {
        return new Promise((resolve) => {
            let checkCount = 0;
            const maxChecks = 100; // Maksimal 5 detik (100 * 50ms)
            
            const checkRoute = () => {
                checkCount++;
                const handler = this.routes.get(route);
                
                if (handler) {
                    // Route sudah terdaftar
                    resolve(handler);
                } else if (checkCount < maxChecks) {
                    // Route belum terdaftar, cek lagi setelah 50ms
                    setTimeout(checkRoute, 50);
                } else {
                    // Timeout, resolve dengan null
                    resolve(null);
                }
            };
            
            // Mulai cek route
            checkRoute();
        });
    }

    /**
     * Tunggu salah satu route terdaftar (untuk handle route dengan slash seperti 'open/dataset')
     * @param {Array<string>} routes - Array route yang ditunggu (dari terpanjang ke terpendek)
     * @returns {Promise<Function|null>} Handler function atau null jika timeout
     */
    async waitForAnyRoute(routes) {
        return new Promise((resolve) => {
            let checkCount = 0;
            const maxChecks = 100; // Maksimal 5 detik (100 * 50ms)
            
            const checkRoutes = () => {
                checkCount++;
                
                // Cek semua route dari array (prioritas dari terpanjang ke terpendek)
                for (const route of routes) {
                    const handler = this.routes.get(route);
                    if (handler) {
                        // Route sudah terdaftar
                        resolve(handler);
                        return;
                    }
                }
                
                // Jika belum ada yang terdaftar dan belum timeout, cek lagi
                if (checkCount < maxChecks) {
                    setTimeout(checkRoutes, 50);
                } else {
                    // Timeout, resolve dengan null
                    resolve(null);
                }
            };
            
            // Mulai cek routes
            checkRoutes();
        });
    }

    /**
     * Restore original content (home)
     */
    restoreOriginalContent() {
        if (!this.container || !this.originalContent) return;
        this.container.innerHTML = this.originalContent;
        this.setupClickHandlers();
        // Pastikan spinner disembunyikan saat restore
        this.hideSpinner();
    }

    /**
     * Setup click handlers untuk elemen yang bisa diklik
     * Mendukung: href="#route", href="/route", dan href="http://localhost/dev/route"
     * Menggunakan event delegation untuk menangani link yang di-render dinamis
     * Override method ini untuk custom click handlers
     */
    setupClickHandlers() {
        // Helper function untuk remove leading slash
        const removeLeadingSlash = (str) => {
            return str.replace(/^\/+/, '');
        };
        
        // Helper function untuk extract route dari berbagai format href
        const extractRoute = (href) => {
            if (!href || href === '#') return null;
            
            // Hash routing: #path
            if (href.startsWith('#')) {
                return href.substring(1);
            }
            
            const basePath = this.getBasePath();
            
            // Full URL: http://localhost/dev/path
            if (href.startsWith('http://') || href.startsWith('https://')) {
                try {
                    const url = new URL(href);
                    const urlPathname = url.pathname;
                    let route = removeLeadingSlash(urlPathname);
                    
                    // Remove base path jika ada di awal route
                    if (basePath && route.startsWith(basePath + '/')) {
                        route = route.substring(basePath.length + 1);
                    } else if (route === basePath) {
                        return null;
                    }
                    
                    // Pastikan tidak ada double base path
                    // Jika route masih mengandung base path, remove lagi
                    if (basePath && route.startsWith(basePath + '/')) {
                        route = route.substring(basePath.length + 1);
                    }
                    
                    route = this.stripMountPath(route);
                    return route || null;
                } catch (e) {
                    return null;
                }
            }
            
            // Relative path: /path
            if (href.startsWith('/')) {
                let route = removeLeadingSlash(href);
                
                // Remove base path jika ada di awal route
                if (basePath && route.startsWith(basePath + '/')) {
                    route = route.substring(basePath.length + 1);
                } else if (route === basePath) {
                    return null;
                }
                
                // Pastikan tidak ada double base path
                // Jika route masih mengandung base path, remove lagi
                if (basePath && route.startsWith(basePath + '/')) {
                    route = route.substring(basePath.length + 1);
                }
                
                route = this.stripMountPath(route);
                return route || null;
            }

            // Relative ke <base href="/myapp/">: "beranda", "contact/data" (tanpa "/" di depan di HTML)
            // Tanpa cabang ini extractRoute null → preventDefault tidak jalan → full page load (bukan SPA)
            {
                const raw = href.split("?")[0].trim();
                if (
                    raw &&
                    !raw.startsWith("/") &&
                    !raw.startsWith("#") &&
                    !raw.startsWith("http://") &&
                    !raw.startsWith("https://") &&
                    !raw.startsWith("mailto:") &&
                    !raw.startsWith("tel:") &&
                    !raw.startsWith("javascript:") &&
                    !raw.startsWith("data:") &&
                    !raw.startsWith("blob:") &&
                    !/^[a-z][a-z0-9+.-]*:/i.test(raw)
                ) {
                    let route = raw.replace(/^\.\//, "");
                    route = this.stripMountPath(route);
                    return route || null;
                }
            }

            return null;
        };
        
        // Hapus event listener lama jika ada (untuk menghindari duplikasi)
        // Pastikan menggunakan capture phase yang sama dengan saat menambahkan
        if (this._clickHandler) {
            document.removeEventListener('click', this._clickHandler, true);
        }
        
        // Buat handler function dan simpan sebagai property untuk bisa di-remove nanti
        this._clickHandler = (e) => {
            // Skip jika klik pada dropdown trigger (bukan link) - biarkan dropdown handler menangani
            const dropdownTrigger = e.target.closest('.nav-dropdown-link, .version-dropdown');
            if (dropdownTrigger && !e.target.closest('a')) {
                // Ini adalah klik pada dropdown trigger, biarkan dropdown handler yang menangani
                // Jangan stop propagation agar dropdown handler bisa bekerja
                return;
            }

            // Cek apakah target adalah link atau di dalam link
            const link = e.target.closest('a');
            if (!link) return;

            /* Zona markdown (doc/chat) — ditangani markdownCore.mjs, bukan SPA */
            if (link.closest('[data-nx-markdown-preview], [data-nx-markdown-chat]')) {
                return;
            }

                // Electron: tautan bertanda + preload IPC → jendela baru di main.
                if (
                    link.hasAttribute('data-nexa-electron-window') &&
                    typeof window !== 'undefined' &&
                    typeof window.electronAPI?.openRouteWindow === 'function'
                ) {
                    return;
                }
            
                const href = link.getAttribute('href');
                
                // Skip jika href kosong atau hanya '#'
                if (!href || href === '#') return;

                /* Anchor halaman (#slug) menuju elemen ber-id — biarkan scroll browser, jangan jadikan route SPA */
                if (href.startsWith('#') && href.length > 1) {
                    const frag = decodeURIComponent(href.slice(1));
                    let anchorEl = null;
                    try {
                        anchorEl = document.getElementById(frag);
                    } catch (err) {
                        anchorEl = null;
                    }
                    if (!anchorEl && typeof CSS !== 'undefined' && CSS.escape) {
                        try {
                            anchorEl = document.querySelector('[id="' + CSS.escape(frag) + '"]');
                        } catch (err2) {
                            anchorEl = null;
                        }
                    }
                    if (anchorEl) {
                        return;
                    }
                }
                
                // Skip external links (links ke domain lain)
                if (href.startsWith('http://') || href.startsWith('https://')) {
                    try {
                        const url = new URL(href);
                        const currentOrigin = window.location.origin;
                        // Jika origin berbeda, biarkan browser default (external link)
                        if (url.origin !== currentOrigin) {
                            return;
                        }
                    } catch (e) {
                        // Invalid URL, skip
                        return;
                    }
                }
                
                // Skip jika href adalah mailto:, tel:, javascript:, blob:, data:, dll
                if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:') || href.startsWith('blob:') || href.startsWith('data:')) {
                    return;
                }
                
                // Biarkan browser default behavior untuk new tab (Ctrl+Click, Middle click, dll)
                if (e.ctrlKey || e.metaKey || e.button === 1 || e.button === 2) {
                    return; // Allow browser default - akan menggunakan full URL tanpa hash
                }
                
                // Extract route dari href
                const route = extractRoute.call(this, href);
                if (!route) {
                    return;
                }

                // Intercept jika route atau salah satu prefiksnya terdaftar (sub-route: guides/pengenalan → handler "guides")
                const hasRegisteredHandler = (r) => {
                    if (!r) return false;
                    if (this.routes.has(r)) return true;
                    const parts = r.split('/');
                    for (let i = parts.length; i > 0; i--) {
                        const candidate = parts.slice(0, i).join('/');
                        if (this.routes.has(candidate)) return true;
                    }
                    return false;
                };
                if (!hasRegisteredHandler(route) && !isRouteAutoloadEnabled()) {
                    return; // Bukan rute SPA — perilaku browser normal
                }
                
            // Prevent default untuk rute terdaftar atau autoload (templates/*.js)
                e.preventDefault();
            // Hanya stop propagation untuk link, bukan untuk dropdown trigger
            e.stopPropagation();
            
                // Tutup dropdown jika link ada di dalam dropdown menu
                const dropdownMenu = link.closest('.nav-dropdown-menu, .dropdown-menu');
                if (dropdownMenu) {
                    // Cari instance NexaDropdown yang sesuai dan tutup dengan benar
                    if (typeof window.NXUI !== 'undefined' && window.NXUI.NexaDropdown) {
                        const dropdownInstance = window.NXUI.NexaDropdown.getInstanceByMenu(dropdownMenu);
                        if (dropdownInstance) {
                            dropdownInstance.close();
                        } else {
                            // Fallback: tutup secara langsung jika instance tidak ditemukan
                            dropdownMenu.classList.remove('show');
                        }
                    } else {
                        // Fallback: tutup secara langsung jika NXUI belum tersedia
                        dropdownMenu.classList.remove('show');
                    }
                }
                
                // Navigate ke route. Jika href = route aktif, navigate() no-op (guard di navigate).
                // Panggil refresh() agar klik menu yang sama memuat ulang view (penting untuk dev).
                    setTimeout(async () => {
                        if (!hasRegisteredHandler(route) && isRouteAutoloadEnabled()) {
                            await loadRouteModule(route, window.nexaPage?.appRoot);
                        }
                        if (this.currentRoute === route) {
                            this.refresh();
                        } else {
                            this.navigate(route);
                        }
                    }, 50);
        };
        
        // Gunakan event delegation pada document dengan capture phase untuk memastikan handler dipanggil lebih awal
        // Ini penting untuk menangkap event sebelum handler lain (seperti dropdown) memprosesnya
        document.addEventListener('click', this._clickHandler, true);
    }

    /**
     * Get base path dari NEXA.url
     * 
     * Hanya mengambil base path dari NEXA.url jika ada path di URL.
     * Jika NEXA.url tidak memiliki path (hanya origin), return null.
     * Jangan pernah mengambil base path dari window.location.pathname karena itu akan berubah-ubah.
     * 
     * @returns {string|null} - Base path atau null jika tidak ada
     * 
     * @example
     * // Jika NEXA.url = 'http://localhost:8000' (tanpa path)
     * getBasePath() // Returns: null
     * 
     * // Jika NEXA.url = 'http://localhost/posdip'
     * getBasePath() // Returns: 'posdip'
     * 
     * // Jika NEXA.url = 'http://localhost/posdip/about'
     * getBasePath() // Returns: 'posdip' (hanya segment pertama)
     */
    getBasePath() {
        // Hanya gunakan NEXA.url, jangan pernah fallback ke window.location.pathname
        if (typeof NEXA !== 'undefined' && NEXA.url) {
            try {
                const urlObj = new URL(NEXA.url);
                const pathSegments = urlObj.pathname.split('/').filter(s => s);
                // Hanya return base path jika ada path di URL
                if (pathSegments.length > 0) {
                    return pathSegments[0];
                }
                // Jika tidak ada path di URL, return null
                return null;
            } catch (e) {
                // Fallback parsing jika URL() constructor gagal
                const match = NEXA.url.match(/\/\/([^\/]+)\/([^\/]+)/);
                if (match && match[2]) {
                    return match[2];
                }
                // Jika tidak ada path di URL, return null
                return null;
            }
        }
        
        // Jika NEXA.url tidak tersedia, return null (jangan gunakan window.location.pathname)
        return null;
    }

    /**
     * Build full URL dengan base path
     * Mendukung sub-routes seperti 'guides/pengenalan', 'guides/MVC', dll
     * @param {string} route - Route path (bisa dengan sub-route)
     * @returns {string} - Full URL path
     * 
     * @example
     * buildUrl('guides') // Returns: '/dev/guides'
     * buildUrl('guides/pengenalan') // Returns: '/dev/guides/pengenalan'
     */
    buildUrl(route) {
        const basePath = this.getBasePath();
        const mount = this.getMountPath();
        if (basePath) {
            return `/${basePath}/${route}`;
        }
        if (mount) {
            return `/${mount}/${route}`;
        }
        return `/${route}`;
    }

    /**
     * Get route from full URL (pathname ATAU hash SPA).
     * Klik memakai href="#package/settings" — saat refresh, hash HARUS
     * dibaca; kalau hanya pathname (`/`), jatuh ke IndexedDB/home.
     * @param {string} url - Full URL atau pathname
     * @returns {string|null}
     *
     * @example
     * getRouteFromUrl('http://localhost:8000/guides') // 'guides'
     * getRouteFromUrl('http://localhost/#package/settings') // 'package/settings'
     */
    getRouteFromUrl(url) {
        if (!url || url === '/' || url === '') {
            return null;
        }

        let pathname = '';
        let hash = '';

        if (url.startsWith('http://') || url.startsWith('https://')) {
            try {
                const urlObj = new URL(url);
                pathname = urlObj.pathname;
                hash = (urlObj.hash || '').replace(/^#/, '').trim();
            } catch (e) {
                pathname = url;
            }
        } else if (url.startsWith('#')) {
            hash = url.substring(1).trim();
        } else {
            pathname = url;
            const hi = url.indexOf('#');
            if (hi >= 0) {
                hash = url.substring(hi + 1).trim();
                pathname = url.substring(0, hi);
            }
        }

        // Hash yang terlihat seperti route SPA (bukan anchor #section)
        const hashRoute = hash.split('?')[0].replace(/^\/+|\/+$/g, '');
        const hashLooksLikeRoute = !!(
            hashRoute
            && (
                hashRoute.includes('/')
                || /^(distro|package|beranda|boot|instal|docs|dashboard)\b/i.test(hashRoute)
            )
        );
        if (hashLooksLikeRoute) {
            return this.stripMountPath(hashRoute) || null;
        }

        if (!pathname || pathname === '/' || pathname === '') {
            return null;
        }

        let route = pathname.startsWith('/') ? pathname.substring(1) : pathname;
        route = route.endsWith('/') ? route.slice(0, -1) : route;

        const basePath = this.getBasePath();

        if (basePath && route.startsWith(basePath + '/')) {
            route = route.substring(basePath.length + 1);
        } else if (route === basePath) {
            return null;
        }

        if (basePath && route.startsWith(basePath + '/')) {
            route = route.substring(basePath.length + 1);
        }

        route = this.stripMountPath(route);

        return route || null;
    }

    /**
     * Alias untuk backward compatibility
     * @deprecated Gunakan getRouteFromUrl() sebagai gantinya
     */
    getRouteFromPath(pathname) {
        return this.getRouteFromUrl(pathname);
    }

    /**
     * Convert string to URL-friendly slug
     * @param {string} text - Text to convert
     * @returns {string} - Slug
     */
    slugify(text) {
        return text
            .toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-')     // Replace spaces with hyphens
            .replace(/-+/g, '-')       // Replace multiple hyphens with single
            .trim();
    }

    /**
     * Update active state pada navigation
     * Berlaku untuk semua link dengan hash routing (href^="#")
     * @param {string} route - Current route
     */
    updateActiveNav(route) {
        // Remove active class dari semua links dengan hash routing
        document.querySelectorAll('a[href^="#"]').forEach(link => {
            link.classList.remove('active');
        });

        // Add active class ke current route (berlaku untuk semua elemen <a>)
        const activeLinks = document.querySelectorAll(`a[href="#${route}"]`);
        activeLinks.forEach(link => {
            link.classList.add('active');
        });
    }

    /**
     * Get current route
     * @returns {string} - Current route
     */
    getCurrentRoute() {
        return this.currentRoute;
    }

    /**
     * Helper method untuk apply grid style menggunakan NXUI.grid
     * Method ini memudahkan penggunaan NXUI.grid untuk styling layout
     * 
     * @param {HTMLElement} container - Container element
     * @param {Object} style - Style configuration object
     * @param {boolean} style.useContainer - Apakah menggunakan container wrapper (default: true)
     * @param {Object} style.container - Container options { nx: boolean } (default: { nx: true })
     * @param {Array} style.rows - Array konfigurasi rows dengan columns
     *   Setiap row object berisi:
     *   - columns: Array - Array konfigurasi columns
     *   - nx: boolean - Gunakan nx-row (default: true)
     *   - spacing: string - Row spacing (xs, sm)
     *   - justify: string - Justify content (center, start, end, between, around)
     *   - align: string - Align items (center, start, end)
     * 
     * @returns {HTMLElement} - Root element (container atau container yang dibuat)
     * 
     * @example
     * // Di dalam route handler
     * route.register('about', async (routeName, container, routeMeta, style, nav) => {
     *   // Apply style
     *   const gridRoot = route.applyGridStyle(container, {
     *     useContainer: true,
     *     container: { nx: true },
     *     rows: [
     *       {
     *         columns: [
     *           { cols: 12, content: '<h1>About Page</h1>', textAlign: 'center' }
     *         ]
     *       },
     *       {
     *         columns: [
     *           { cols: 8, content: '<p>Main content</p>' },
     *           { cols: 4, content: '<div class="sidebar"></div>' }
     *         ]
     *       }
     *     ]
     *   });
     * });
     */
    async applyGridStyle(container, style = {}) {
        // Pastikan container ada
        if (!container) {
            console.warn('applyGridStyle: container is null or undefined');
            return null;
        }

        // Pastikan NXUI.grid tersedia
        if (typeof window.NXUI === 'undefined' || !window.NXUI.grid) {
            console.warn('applyGridStyle: NXUI.grid is not available');
            // Fallback: tampilkan style rows sebagai HTML biasa
            if (style && style.rows && Array.isArray(style.rows)) {
                let html = '';
                style.rows.forEach(row => {
                    if (row.columns && Array.isArray(row.columns)) {
                        html += '<div class="row">';
                        row.columns.forEach(col => {
                            const cols = col.cols || 12;
                            html += `<div class="col-${cols}">${col.content || ''}</div>`;
                        });
                        html += '</div>';
                    }
                });
                container.innerHTML = html;
            }
            return container;
        }

        // Clear container terlebih dahulu
        // Ini penting untuk memastikan konten lama dihapus sebelum grid baru dibuat
        if (container) {
            container.innerHTML = '';
        }

        // Pastikan style valid
        if (!style || typeof style !== 'object') {
            console.warn('applyGridStyle: style is not a valid object');
            return container;
        }

        try {
            // Apply grid style
            const gridConfig = {
                parent: container,
                useContainer: style.useContainer !== false, // Default: true
                container: style.container || { nx: true },
                rows: style.rows || []
            };

            // Pastikan rows ada dan valid
            if (!gridConfig.rows || !Array.isArray(gridConfig.rows) || gridConfig.rows.length === 0) {
                console.warn('applyGridStyle: rows is empty or invalid');
                return container;
            }

            const result = await window.NXUI.grid.createGrid(gridConfig);
            
            // Pastikan result valid
            if (!result) {
                console.warn('applyGridStyle: createGrid returned null or undefined');
                return container;
            }
            
            return result;
        } catch (error) {
            console.error('Error in applyGridStyle:', error);
            // Fallback: tampilkan error message atau fallback HTML
            if (container) {
                // Coba render rows sebagai HTML biasa sebagai fallback
                if (style && style.rows && Array.isArray(style.rows) && style.rows.length > 0) {
                    let html = '';
                    style.rows.forEach(row => {
                        if (row.columns && Array.isArray(row.columns)) {
                            html += '<div class="row">';
                            row.columns.forEach(col => {
                                const cols = col.cols || 12;
                                html += `<div class="col-${cols}">${col.content || ''}</div>`;
                            });
                            html += '</div>';
                        }
                    });
                    container.innerHTML = html;
                } else {
                    container.innerHTML = `
                        <div style="padding: 2rem; color: red;">
                            <h2>Error applying grid style</h2>
                            <p>${error.message}</p>
                        </div>
                    `;
                }
            }
            return container;
        }
    }

    /**
     * Helper method untuk membuat grid layout sederhana
     * Method ini adalah wrapper yang lebih sederhana untuk applyGridStyle
     * 
     * @param {HTMLElement} container - Container element
     * @param {Array} rows - Array konfigurasi rows dengan columns
     * @param {Object} options - Options tambahan
     * @param {boolean} options.useContainer - Apakah menggunakan container (default: true)
     * @param {boolean} options.nx - Gunakan nx-container (default: true)
     * 
     * @returns {HTMLElement} - Root element
     * 
     * @example
     * route.register('about', async (routeName, container, routeMeta, style, nav) => {
     *   route.createGridLayout(container, [
     *     {
     *       columns: [
     *         { cols: 12, content: '<h1>Title</h1>' }
     *       ]
     *     },
     *     {
     *       columns: [
     *         { cols: 6, content: '<p>Left</p>' },
     *         { cols: 6, content: '<p>Right</p>' }
     *       ]
     *     }
     *   ]);
     * });
     */
    createGridLayout(container, rows = [], options = {}) {
        return this.applyGridStyle(container, {
            useContainer: options.useContainer !== false,
            container: { nx: options.nx !== false },
            rows: rows
        });
    }

    /**
     * Pasang NXUI.Layer (kartu + sortable) di container rute dengan satu pemanggilan.
     * Mengisi `.nx-row` dengan id stabil `page_<baseRoute>` (atau custom), lalu `Container` + `drop()`.
     *
     * @param {object} options
     * @param {HTMLElement} options.container - Elemen target handler (biasanya argumen `container` dari register)
     * @param {object} [options.nav] - `{ baseRoute, subRoute }` dari handler (untuk default id baris)
     * @param {string} [options.page] - Kunci route register; dipakai jika `baseRoute` tidak diisi
     * @param {string} [options.baseRoute] - Override segmen untuk id (default: `nav.baseRoute` ?? `page`)
     * @param {string} [options.rowId] - Id penuh elemen `.nx-row` (tanpa `#`); mengabaikan `idPrefix` / baseRoute
     * @param {string} [options.idPrefix] - Awalan id (default: `'page_'`)
     * @param {Array|Function} options.content - Array konfigurasi kartu untuk `NexaLayer.Container`, atau
     *   `async (ctx) => array` dengan ctx: `{ rowId, rowSelector, height, nav, baseRoute }`
     * @param {number} [options.delay=100] - Penundaan sebelum init (DOM siap / layout)
     * @param {string} [options.heightSelector='#main'] - Selector untuk `NXUI.Dimensi.height` bila `height` / `dimensi` tidak dipakai
     * @param {number|string} [options.height] - Tinggi kartu; jika diisi, lewati perhitungan Dimensi
     * @param {Array} [options.dimensi] - Argumen untuk `NXUI.Dimensi().height`:
     *   - Panjang penuh: `["#main", 390, "vh"]` → `height("#main", 390, "vh")` (elemen pertama string selector).
     *   - Singkat: `[390, "vh"]` → `height("#" + containerId, 390, "vh")` memakai `NexaRoute` `containerId` (sama seperti `App.js` `containerId: 'main'` → `#main`).
     *   - `[390]` → subtract 390, unit `px`. Opsional ke-3: `options` ke `height()`.
     * @param {string} [options.dragClass='nx-dragging'] - Opsi NXUI.Layer
     * @param {string} [options.dropClass='nx-drop-zone'] - Opsi NXUI.Layer
     * @param {object} [options.layer] - Spread tambahan ke `new NXUI.Layer({ ... })` — sertakan **`showHeader` / `showFooter`** bila perlu default global; **per kartu** atur di item `content`: **`header: false`** / **`footer: false`** (lihat `NexaLayer.Container`).
     * @returns {Promise<{ render: object, rowId: string, rowSelector: string }|null>}
     *
     * @example
     * route.register('contact/data', async (routeName, container, routeMeta, style, nav) => {
     *   await route.Layer({
     *     container,
     *     nav,
     *     page: 'contact/data',
     *     content: async ({ height }) => [cardA(height), cardB(height)],
     *   });
     * });
     */
    async Layer(options = {}) {
        const NX = (typeof window !== 'undefined' && window.NXUI)
            ? window.NXUI
            : (typeof NXUI !== 'undefined' ? NXUI : null);
        if (!NX || typeof NX.Layer !== 'function') {
            console.warn('NexaRoute.Layer: NXUI.Layer is not available');
            return null;
        }

        const {
            container,
            nav = {},
            page: pageKey,
            baseRoute: baseRouteOpt,
            rowId: rowIdExplicit,
            idPrefix = 'page_',
            content,
            delay = 100,
            heightSelector: heightSelectorOpt,
            height: heightOverride,
            dimensi: dimensiTuple,
            dragClass = 'nx-dragging',
            dropClass = 'nx-drop-zone',
            layer: layerExtra = {},
        } = options;

        if (!container) {
            console.warn('NexaRoute.Layer: options.container is required');
            return null;
        }

        const heightSelector = heightSelectorOpt !== undefined && heightSelectorOpt !== null
            ? heightSelectorOpt
            : `#${this.containerId}`;

        const baseRaw = baseRouteOpt !== undefined && baseRouteOpt !== null
            ? String(baseRouteOpt)
            : (nav.baseRoute != null ? String(nav.baseRoute) : (pageKey != null ? String(pageKey) : ''));
        const safeBase = baseRaw.replace(/[^a-zA-Z0-9_-]/g, '_');
        const rowId = rowIdExplicit || `${idPrefix}${safeBase}`;
        const rowSelector = `#${rowId}`;

        let height = heightOverride;
        if (height === undefined && NX.Dimensi) {
            try {
                const dimensi = new NX.Dimensi();
                if (Array.isArray(dimensiTuple) && dimensiTuple.length >= 1) {
                    const first = dimensiTuple[0];
                    let sel;
                    let sub;
                    let unit = 'px';
                    let heightOpts = {};

                    if (typeof first === 'string') {
                        sel = first;
                        sub = dimensiTuple.length >= 2 ? dimensiTuple[1] : 0;
                        unit = dimensiTuple.length >= 3 ? dimensiTuple[2] : 'px';
                        const fourth = dimensiTuple[3];
                        if (fourth !== undefined && typeof fourth === 'object' && fourth !== null && !Array.isArray(fourth)) {
                            heightOpts = fourth;
                        }
                    } else if (typeof first === 'number') {
                        sel = heightSelector;
                        sub = first;
                        if (dimensiTuple.length >= 2) {
                            if (typeof dimensiTuple[1] === 'string') {
                                unit = dimensiTuple[1];
                                if (dimensiTuple.length >= 3 && typeof dimensiTuple[2] === 'object' && dimensiTuple[2] !== null && !Array.isArray(dimensiTuple[2])) {
                                    heightOpts = dimensiTuple[2];
                                }
                            } else if (typeof dimensiTuple[1] === 'object' && dimensiTuple[1] !== null && !Array.isArray(dimensiTuple[1])) {
                                heightOpts = dimensiTuple[1];
                            }
                        }
                    } else {
                        throw new Error('NexaRoute.Layer: dimensi[0] must be a selector string or a number (subtract)');
                    }
                    height = dimensi.height(sel, sub, unit, heightOpts);
                } else {
                    height = dimensi.height(heightSelector, 390, 'vh');
                }
            } catch (e) {
                height = undefined;
            }
        }

        const resolveItems = async () => {
            const ctx = {
                rowId,
                rowSelector,
                height,
                nav,
                baseRoute: baseRaw,
            };
            if (typeof content === 'function') {
                return await content(ctx);
            }
            return content;
        };

        container.innerHTML = `<div class="nx-row" id="${rowId}"></div>`;

        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    const items = await resolveItems();
                    if (!items || !Array.isArray(items)) {
                        throw new Error('NexaRoute.Layer: content must be an array or async function returning an array');
                    }
                    const render = new NX.Layer({
                        container: rowSelector,
                        dragClass,
                        dropClass,
                        ...layerExtra,
                    });
                    const template = render.Container({
                        container: rowSelector,
                        content: items,
                    });
                    NX.id(rowId).innerHTML = template;
                    render.drop();
                    resolve({ render, rowId, rowSelector });
                } catch (err) {
                    console.error('NexaRoute.Layer:', err);
                    reject(err);
                }
            }, delay);
        });
    }
}

// Export untuk ES6 modules
// export default NexaRoute;
// export { NexaRoute };

// Auto-initialize jika script di-load langsung
// Tunggu NXUI siap sebelum inisialisasi
function initNexaRoute() {
    // Tunggu NXUI tersedia (dari NexaUI.js)
    function waitForNXUI() {
        if (typeof window.NXUI !== 'undefined' && window.NXUI.NexaDb) {
            // NXUI sudah tersedia, tapi jangan buat NexaRoute di sini
            // Biarkan NXUI.Page yang membuat dengan spinner config yang benar
            // Hanya dispatch event jika nexaRoute belum ada
            if (typeof window.nexaRoute === 'undefined') {
                // Buat instance sementara tanpa config, akan di-update oleh NXUI.Page
                window.nexaRoute = new NexaRoute('main');
            }
            
            // Dispatch event bahwa NexaRoute sudah siap
            window.dispatchEvent(new CustomEvent('nexaRouteReady'));
        } else {
            // NXUI belum tersedia, coba lagi setelah 100ms
            setTimeout(waitForNXUI, 100);
        }
    }

    // Mulai menunggu NXUI
    waitForNXUI();
}

// Tunggu event nxuiReady atau langsung init jika NXUI sudah tersedia
if (typeof window.NXUI !== 'undefined' && window.NXUI.NexaDb) {
    // NXUI sudah tersedia, langsung init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNexaRoute);
    } else {
        initNexaRoute();
    }
} else {
    // Tunggu event nxuiReady dari NexaUI.js
    window.addEventListener('nxuiReady', () => {
        initNexaRoute();
    });
    
    // Fallback: juga coba init setelah DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(initNexaRoute, 500);
        });
    } else {
        setTimeout(initNexaRoute, 500);
    }
}

/** Token di App.js `route: [..., "autoload"]` — muat templates/{nama}.js on-demand (tanpa daftar manual). */
const NEXA_ROUTE_AUTOLOAD_TOKEN = 'autoload';

function routeConfigName(routeConfig) {
  if (routeConfig == null) return '';
  if (typeof routeConfig === 'object') {
    return String(routeConfig.route ?? routeConfig).trim();
  }
  return String(routeConfig).trim();
}

function isRouteAutoloadEnabled() {
  return (
    typeof window !== 'undefined' &&
    window.nexaPage &&
    window.nexaPage.routeAutoload === true
  );
}

function firstRegisteredRouteName() {
  const list = window.nexaPage?.registeredRoutes;
  if (!Array.isArray(list) || list.length === 0) return null;
  for (const rc of list) {
    const name = routeConfigName(rc);
    if (name && name !== NEXA_ROUTE_AUTOLOAD_TOKEN) return name;
  }
  return null;
}

/** Cache URL → path dasar modul (hindari probe berulang saat refresh). */
function getAutoloadBaseCache() {
  if (typeof window === 'undefined' || !window.nexaPage) return null;
  if (!window.nexaPage._autoloadBaseCache) {
    window.nexaPage._autoloadBaseCache = new Map();
  }
  return window.nexaPage._autoloadBaseCache;
}

function rememberAutoloadBase(routeName, base) {
  const cache = getAutoloadBaseCache();
  if (!cache || !base) return;
  // Simpan HANYA untuk route persis + sub-route di bawah base yang benar-benar dimuat.
  // Jangan simpan untuk setiap prefix: `profil/sejarah` tidak boleh membuat kunci `profil`,
  // karena route saudara (`profil/visi/misi`, `profil/wilayah`) akan salah me-recall base ini
  // lalu dianggap "sudah dimuat" sehingga modulnya tidak pernah di-import.
  cache.set(String(routeName), base);
  cache.set(String(base), base);
}

function recallAutoloadBase(routeName) {
  const cache = getAutoloadBaseCache();
  if (!cache) return null;
  const name = String(routeName);
  const exact = cache.get(name);
  if (exact) return exact;
  // Prefix hanya sah jika base tersimpan benar-benar mencakup route ini
  // (mis. base "docs/fundamental" untuk route "docs/fundamental/pengenalan").
  const parts = name.split('/');
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join('/');
    const hit = cache.get(prefix);
    if (hit && (hit === prefix || name.startsWith(hit + '/'))) return hit;
  }
  return null;
}

/**
 * Urutan kandidat path dasar modul (minim probe).
 * /page/contoh/v1/token/dll → coba page/contoh dulu, bukan setiap segmen subRoute.
 */
function autoloadBaseCandidates(parts) {
  const n = parts.length;
  if (n === 0) return [];

  const seen = new Set();
  const out = [];
  const add = (base) => {
    const b = String(base || '').trim();
    if (b && !seen.has(b)) {
      seen.add(b);
      out.push(b);
    }
  };

  if (n === 1) {
    add(parts[0]);
    return out;
  }
  if (n === 2) {
    add(parts.join('/'));
    add(parts[0]);
    return out;
  }

  add(parts.slice(0, 2).join('/'));
  for (let i = n - 1; i >= 2; i--) {
    add(parts.slice(0, i).join('/'));
  }
  add(parts.join('/'));
  add(parts[0]);
  return out;
}

const autoloadExistsMemo = new Map();

function isJsModuleResponse(res) {
  if (!res || !res.ok) return false;
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('text/html')) return false;
  return (
    ct.includes('javascript') ||
    ct.includes('ecmascript') ||
    ct.includes('module')
  );
}

/**
 * Cek apakah templates/{actionPath} ada (HEAD; memo per sesi).
 */
async function templateModuleExists(appRoot, actionPath) {
  const root = String(appRoot || 'templates').replace(/^\/+|\/+$/g, '');
  const path = String(actionPath || '').replace(/^\//, '');
  if (!path.endsWith('.js')) return false;

  const memoKey = `${root}/${path}`;
  if (autoloadExistsMemo.has(memoKey)) {
    return autoloadExistsMemo.get(memoKey);
  }

  const url = `/${root}/${path}`;
  let exists = false;

  try {
    let res = await fetch(url, {
      method: 'HEAD',
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
      });
    }
    exists = isJsModuleResponse(res);
  } catch (e) {
    exists = false;
  }

  autoloadExistsMemo.set(memoKey, exists);
  return exists;
}

async function resolveAutoloadTemplateBase(parts, appRoot) {
  const root = String(appRoot || 'templates').replace(/^\/+|\/+$/g, '');
  const candidates = autoloadBaseCandidates(parts);

  for (const base of candidates) {
    if (await templateModuleExists(root, base + '.js')) {
      return base;
    }
  }
  return null;
}

async function importAutoloadBase(base, appRoot, route) {
  const root = String(appRoot || 'templates').replace(/^\/+|\/+$/g, '');
  const action = base + '.js';

  try {
    const ok = await contentIndex(
      {
        action,
        exportName: base.replace(/\//g, '_'),
        page: base,
      },
      root,
      route,
      { noFlatFallback: true, silentMissing: true }
    );
    return ok !== false && route.routes.has(base);
  } catch (e) {
    return false;
  }
}

/**
 * Penyingkatan URL untuk file di dalam extension aktif: href="/distro/{file}"
 * (2 segmen) otomatis di-resolve ke templates/distro/{id}/{file}.js — {id}
 * dibaca dari distroGrafis (IndexedDB, disimpan saat install extension lewat
 * repoUrl.js/terminal.js). Tanpa ini, penulis extension harus hardcode nama
 * foldernya sendiri di setiap href (mis. "/distro/Development/cotoh") —
 * merepotkan dan rapuh kalau folder di-rename. "distro/grafis" dikecualikan
 * karena itu route NXHOME utama (lihat templates/distro/grafis.js), bukan
 * file di dalam extension.
 *
 * CATATAN (belum ditangani): alias nama asli → base tersubstitusi
 * disimpan permanen di route.routes (lihat loadRouteModule di bawah).
 * Kalau extension aktif BERGANTI (uninstall lalu install extension lain)
 * dalam satu sesi SPA yang sama tanpa full reload, alias lama tetap
 * mengarah ke handler extension SEBELUMNYA — belum ada invalidasi cache
 * saat distroGrafis berubah. Untuk sekarang aman karena satu sesi = satu
 * extension aktif; perlu diperbaiki kalau nanti ada fitur ganti extension
 * runtime tanpa reload.
 */
// Cache id extension aktif — menghindari panggilan ref.getAll('distroGrafis')
// berulang (IndexedDB, async) tiap kali resolveDistroShorthand dipanggil.
// loadRouteModule() bisa terpanggil beberapa kali berurutan untuk route yang
// sama (dua jalur berbeda di navigate()) sebelum panggilan pertama selesai —
// tanpa cache, itu memicu beberapa kali probe 404 duplikat ke path lama
// (nama pendek asli) sebelum shorthand sempat ter-resolve.
/**
 * Route yang harus dirender ke <div id="nxhome"> (di dalam NXHOME), BUKAN
 * container utama — SEMUA "distro/{sisanya}" (N segmen >= 2, lihat
 * resolveDistroShorthand: file bawaan extension, componen di package/,
 * atau sub-path apa pun di dalam extension aktif), KECUALI "distro/grafis"
 * itu sendiri (NXHOME utama) — dia yang dirender ke container utama,
 * #nxhome baru ada di DOM setelah itu selesai.
 * Dipakai konsisten di 3 titik: navigate() (renderContainer), popstate,
 * dan performNavigation() (refresh) — supaya perilakunya seragam untuk
 * ketiga jalur (klik, back/forward, refresh).
 */
function isDistroNxhomeRoute(route) {
  const parts = String(route || '').split('/');
  if (parts[0] !== 'distro' || parts.length < 2) return false;
  return !(parts.length === 2 && parts[1] === 'grafis');
}

/**
 * Route lingkungan WORKSPACE — URL "workspace/{sisanya}" (opsional; hanya
 * relevan untuk aplikasi yang punya kolom konten utama terpisah dari
 * container penuh, mis. shell IDE/dashboard dengan sidebar+tabs tetap).
 *
 * Target render: elemen ber-atribut [data-nx-main="workspace"] — kolom
 * konten utama yang dipasang halaman shell-nya (mis. kolom Utama sebuah
 * beranda.js). Halaman shell TETAP UTUH: yang diganti cuma isi kolom itu,
 * bukan seluruh container — jadi tree/sidebar di kolom lain dan toolbar
 * di titlebar tidak ikut ter-render ulang.
 *
 * Prefiks TERPISAH dari "package/" (wilayah distro) dan "distro/" (#nxhome).
 * Kalau elemen targetnya tidak ada di DOM (aplikasi tidak memakai
 * konvensi ini, atau shell belum dirender — lihat performNavigation()'s
 * "refresh langsung ke #workspace/…"), render jatuh ke container utama
 * seperti route biasa — aplikasi tanpa kolom workspace tetap bisa membuka
 * route ini tanpa error, ini murni opsional.
 */
function isWorkspaceRoute(route) {
  const parts = String(route || '').split('/');
  return parts[0] === 'workspace' && parts.length >= 2;
}

/** Elemen target render route "workspace/*" (null kalau tidak dipasang). */
function workspaceMainEl() {
  return typeof document !== 'undefined'
    ? document.querySelector('[data-nx-main="workspace"]')
    : null;
}

/**
 * Route lingkungan PACKAGE — URL "package/{sisanya}" (App.js package: [...]).
 * Target render: #nxpackage HANYA jika package user memasangnya (bukan
 * statis di NXHOME). Syarat render awal ke #nxpackage: file
 * package/{nama}/home.js wajib ada — di-autoload setelah shell index
 * selesai (lihat NexaRoute.autoloadPackageHomeIfNeeded). Fallback tanpa
 * #nxpackage → #nxhome.
 */
function isPackageNxpackageRoute(route) {
  const parts = String(route || '').split('/');
  return parts[0] === 'package' && parts.length >= 2;
}

const NESTED_PACKAGE_STORAGE_KEY = 'nexa.nestedPackage';

/**
 * Nama folder package dari route apa pun:
 *   package/settings/spinner → settings
 *   distro/Development/package/components/index → components
 */
function getPackageNameFromRoute(route) {
  const parts = String(route || '').split('/').filter(Boolean);
  if (!parts.length) return null;
  if (parts[0] === 'package' && parts[1]) return parts[1];
  const idx = parts.indexOf('package');
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return null;
}

function samePackageRoute(a, b) {
  const pa = getPackageNameFromRoute(a);
  const pb = getPackageNameFromRoute(b);
  return !!(pa && pb && pa === pb);
}

/**
 * Shell induk untuk nested "package/{name}/…" — jangan ambil shell
 * package lain. Sistem distro (templates/distro/**) bukan bagian
 * nxkasir (lihat getActiveDistroId()) — shell selalu path fisik
 * langsung: "package/{name}/index" → resolvePackageShorthand()
 * meng-strip "package/" saat dipakai → templates/{name}/index.js.
 */
function inferPackageShellRoute(nestedRoute) {
  const name = getPackageNameFromRoute(nestedRoute);
  if (!name) return null;
  return `package/${name}/index`;
}

/** Simpan nested terakhir (backup refresh — grafis wipe history.state). */
function persistNestedPackage(shellRoute, nestedRoute) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    // Tolak pasangan beda package (cegah Components “nempel” ke Settings).
    if (
      shellRoute
      && nestedRoute
      && !samePackageRoute(shellRoute, nestedRoute)
    ) {
      return;
    }
    sessionStorage.setItem(
      NESTED_PACKAGE_STORAGE_KEY,
      JSON.stringify({ shell: shellRoute, nested: nestedRoute }),
    );
  } catch (_) { /* ignore */ }
}

function clearPersistedNestedPackage() {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(NESTED_PACKAGE_STORAGE_KEY);
  } catch (_) { /* ignore */ }
}

function readPersistedNestedRecord() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = sessionStorage.getItem(NESTED_PACKAGE_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o.nested !== 'string' || !isPackageNxpackageRoute(o.nested)) {
      return null;
    }
    // Bersihkan record korup beda package
    if (o.shell && !samePackageRoute(o.shell, o.nested)) {
      clearPersistedNestedPackage();
      return null;
    }
    return {
      shell: typeof o.shell === 'string' ? o.shell : null,
      nested: o.nested,
    };
  } catch (_) {
    return null;
  }
}

/**
 * Baca nested terakhir dari history.state atau sessionStorage.
 * shellHint = route shell yang sedang di-restore (WAJIB package yang sama).
 */
function readPendingNestedPackage(shellHint) {
  const fromHist = typeof window !== 'undefined'
    && window.history
    && window.history.state
    && typeof window.history.state.nestedPackage === 'string'
    ? window.history.state.nestedPackage
    : null;
  if (
    fromHist
    && isPackageNxpackageRoute(fromHist)
    && (!shellHint || samePackageRoute(shellHint, fromHist))
  ) {
    return fromHist;
  }

  const rec = readPersistedNestedRecord();
  if (!rec) return null;
  // Tanpa hint: jangan tebak package lain — hanya jika nested jelas.
  if (!shellHint) return null;
  if (!samePackageRoute(shellHint, rec.nested)) return null;
  if (rec.shell && !samePackageRoute(shellHint, rec.shell)) return null;
  return rec.nested;
}

/**
 * Pilih shell induk untuk restore #package/… — prioritaskan URL, bukan storage usang.
 */
function resolvePendingPackageShell(nestedRoute, histShell, persisted) {
  const inferred = inferPackageShellRoute(nestedRoute);
  if (histShell && samePackageRoute(histShell, nestedRoute)) return histShell;
  if (persisted && persisted.shell && samePackageRoute(persisted.shell, nestedRoute)) {
    return persisted.shell;
  }
  return inferred;
}

/**
 * Nama folder package saat entry shell (index), bukan nested page.
 *   package/settings | package/settings/index
 *   distro/package/settings[/index]
 *   distro/{id}/package/settings[/index]
 * Bukan: package/settings/home | package/tables/about
 */
function getPackageShellNameForHomeAutoload(route) {
  const parts = String(route || '').split('/').filter(Boolean);
  if (parts[0] === 'package') {
    // package/{name}/home|about|… → bukan shell
    if (parts.length === 3 && parts[2] !== 'index') return null;
    if (parts.length === 2) return parts[1];
    if (parts.length === 3 && parts[2] === 'index') return parts[1];
    return null;
  }
  if (parts[0] === 'distro' && parts[1] === 'package') {
    if (parts.length === 3) return parts[2];
    if (parts.length === 4 && parts[3] === 'index') return parts[2];
    return null;
  }
  if (parts[0] === 'distro' && parts[2] === 'package') {
    if (parts.length === 4) return parts[3];
    if (parts.length === 5 && parts[4] === 'index') return parts[3];
    return null;
  }
  // Route path BIASA "{pkg}/index" (TANPA prefix "package/", TANPA
  // sistem distro) — kontrak href shell nxkasir (mis. "/components/index",
  // "/kasir/index"), lihat templates/beranda.js. "{pkg}" itu sendiri (folder
  // tanpa /index, mis. href "/kasir") JUGA dianggap shell — sama pola
  // "package/{name}" 2-segmen di atas.
  if (parts.length === 1 && parts[0]) {
    return parts[0];
  }
  if (parts.length === 2 && parts[1] === 'index') {
    return parts[0];
  }
  return null;
}

const _DISTRO_SHORTHAND_PREFIXES = new Set(['distro']);
let _distroActiveIdCache = null;

/**
 * Invalidate cache id distro aktif — WAJIB dipanggil setelah
 * setActiveExtension() ganti distro tanpa full reload halaman. Tanpa ini,
 * shorthand `distro/{file}` tetap memakai id lama sampai restart app
 * (module-level cache hanya diisi sekali per sesi).
 */
function clearDistroActiveIdCache() {
  _distroActiveIdCache = null;
}
if (typeof window !== 'undefined') {
  window.clearDistroActiveIdCache = clearDistroActiveIdCache;
}

/**
 * Sistem distro (templates/distro/*, shell NXHOME, ekstensi terpasang)
 * BUKAN bagian nxkasir — App.js tidak punya config `distro`/`package`,
 * tidak ada folder templates/distro/ sama sekali. SELALU return null
 * (tanpa query 'distroGrafis' ke IndexedDB) supaya setiap pemanggil
 * (resolvePackageShorthand, resolveDistroShorthand, inferPackageShellRoute,
 * dll) langsung ambil jalur fallback "tanpa distro" — route package
 * (mis. "package/components/index") resolve ke path fisik LANGSUNG di
 * appRoot ("components/index" → templates/components/index.js), TIDAK
 * PERNAH mencoba path templates/distro/**.js (yang memang tidak ada di
 * proyek ini, sumber probe 404 berantai sebelumnya).
 */
async function getActiveDistroId() {
  return null;
}

/**
 * Penyingkatan URL lingkungan package: href="#package/{sisanya}"
 * → templates/distro/{id}/package/{sisanya}.js
 * Satu segmen (mis. #package/tables) → .../package/tables/index.js
 * (konvensi entry package = index.js, sama gallery/news).
 */
async function resolvePackageShorthand(name) {
  const parts = name.split('/');
  if (parts[0] !== 'package' || parts.length < 2) {
    return name;
  }
  let rest = parts.slice(1);
  if (rest.length === 1) {
    rest = [rest[0], 'index'];
  }
  try {
    const id = await getActiveDistroId();
    if (id) return `distro/${id}/package/${rest.join('/')}`;
  } catch (_) {
    // getActiveDistroId gagal — lanjut ke fallback tanpa distro di bawah,
    // bukan return name mentah (segmen "package/" harus tetap dilepas).
  }
  // Tanpa sistem distro aktif (mis. nxkasir: App.js tidak punya config
  // `distro`/`package`, tidak pernah ada record 'distroGrafis' tersimpan)
  // — package/{sisanya} dianggap path fisik LANGSUNG di appRoot:
  // "package/components/splitpane" → "components/splitpane" →
  // templates/components/splitpane.js. Ini yang membuat folder portable
  // (dengan kontrak <div id="nxpackage" data-nx-package="{nama}">, href
  // asli "#package/{nama}/...") tetap berfungsi tanpa restrukturisasi ke
  // templates/distro/{id}/package/ — cukup diletakkan di templates/{nama}/.
  return rest.join('/');
}

async function resolveDistroShorthand(name) {
  const parts = name.split('/');
  // Aturan TUNGGAL, generik: "distro/{sisanya}" (N segmen >= 2, "sisanya"
  // boleh berisi slash apa pun — 1 segmen "distro/cotoh", 2 segmen
  // "distro/boot/componen", 3 segmen "distro/package/{componen}/{file}",
  // dst) -> {id} extension aktif disisipkan TEPAT SETELAH "distro". Path
  // fisik selalu templates/distro/{id}/{sisanya}.js — segmen setelah
  // "distro" 1:1 dengan struktur folder fisik, cuma {id} yang disisipkan.
  // "distro/grafis" DIKECUALIKAN (itu route NXHOME utama sendiri, bukan
  // file di dalam extension — lihat templates/distro/grafis.js).
  if (
    parts.length < 2 ||
    !_DISTRO_SHORTHAND_PREFIXES.has(parts[0]) ||
    (parts.length === 2 && parts[1] === 'grafis')
  ) {
    return name;
  }
  try {
    const id = await getActiveDistroId();
    if (!id) return name;
    return `distro/${id}/${parts.slice(1).join('/')}`;
  } catch (_) {
    return name;
  }
}

/**
 * Muat templates/{base}.js untuk URL bertingkat (satu import, probe terbatas).
 */
async function loadRouteModule(routeName, appRoot) {
  const originalName = String(routeName || '').trim();
  if (!originalName || originalName === NEXA_ROUTE_AUTOLOAD_TOKEN) return false;

  const route = typeof window !== 'undefined' ? window.nexaRoute : null;
  if (!route) return false;

  // package/{…} dulu (lingkungan package), baru distro/{…}
  let name = await resolvePackageShorthand(originalName);
  if (name === originalName) {
    name = await resolveDistroShorthand(originalName);
  }
  const parts = name.split('/');
  // Handler persis sudah ada → tidak perlu import lagi.
  if (route.routes.has(name)) {
    // Alias ke nama asli (mis. "package/tables" / "distro/cotoh") supaya
    // navigate() yang mencari route.routes dengan nama ASLI tetap ketemu.
    if (name !== originalName && !route.routes.has(originalName)) {
      route.routes.set(originalName, route.routes.get(name));
    }
    return true;
  }
  // Prefix hanya dianggap cukup bila memang tidak ada modul khusus untuk route ini,
  // jadi biarkan probe/import di bawah yang memutuskan (cegah route saudara saling
  // "menumpang" handler: profil/sejarah tidak boleh melayani profil/visi/misi).

  const root = String(appRoot || window.nexaPage?.appRoot || 'templates').replace(
    /^\/+|\/+$/g,
    ''
  );

  let base = recallAutoloadBase(name);
  if (base && route.routes.has(base)) {
    if (name !== originalName && !route.routes.has(originalName)) {
      route.routes.set(originalName, route.routes.get(base));
    }
    return true;
  }

  if (!base) {
    // Hasil substitusi shorthand SUDAH path lengkap — coba duluan.
    if (name !== originalName && await templateModuleExists(root, name + '.js')) {
      base = name;
    } else {
      base = await resolveAutoloadTemplateBase(parts, root);
    }
  }
  if (!base) return false;

  if (!route.routes.has(base)) {
    const loaded = await importAutoloadBase(base, root, route);
    if (!loaded) return false;
  }

  rememberAutoloadBase(name, base);
  if (name !== originalName && route.routes.has(base) && !route.routes.has(originalName)) {
    route.routes.set(originalName, route.routes.get(base));
  }
  return route.routes.has(base);
}

/**
 * "autoload" = aktifkan muat templates/{nama}.js saat navigasi ke /{nama}.
 * Tidak ada daftar file terpisah — cukup buat templates/data.js + export function data.
 */
async function expandRoutesWithAutoload(registeredRoutes) {
  const list = Array.isArray(registeredRoutes) ? registeredRoutes : [];
  const wantsAutoload = list.some(
    (rc) => routeConfigName(rc) === NEXA_ROUTE_AUTOLOAD_TOKEN
  );

  if (!wantsAutoload) {
    return list;
  }

  if (typeof window !== 'undefined') {
    if (!window.nexaPage) window.nexaPage = {};
    window.nexaPage.routeAutoload = true;
  }

  return list.filter(
    (rc) => routeConfigName(rc) !== NEXA_ROUTE_AUTOLOAD_TOKEN
  );
}

      export class NexaPage {
      constructor(config = {}) {
        // Default values jika config tidak diberikan
        this.containerId = config.containerId || 'main'; // Gunakan containerId dari config atau default 'main'
        this.appRoot = config.appRoot || 'theme/app';
        // Folder SPA di URL (mis. "myapp") agar refresh /myapp/contact → route "contact"
        this.mountPath = (config.mountPath || '').replace(/^\/+|\/+$/g, '');
        this.registeredRoutes = config.route || [
          'about',
          'blog',
          'contact',
          'contact/data',
        ];
        // Route khusus untuk konten di dalam #nxhome (extension aktif) —
        // sama pola dengan config.route, tapi ditujukan untuk file di
        // templates/distro/{id}/*.js (bukan appRoot langsung). "home" =
        // route pertama yang diregister EKSPLISIT & langsung dirender saat
        // NXHOME pertama siap (lihat registerDistroRoutes()); "autoload"
        // di sini murni penanda dokumentasi — file distro/* lain sudah
        // otomatis bisa diakses lewat mekanisme shorthand distro/{file}
        // yang sudah ada (resolveDistroShorthand), tidak butuh logic baru.
        this.distroRoutes = config.distro || null;
        // Route lingkungan package (#package/{…} → #nxpackage) — sama pola
        // config.distro, beda mount + path fisik di package/{nama}/.
        this.packageRoutes = config.package || null;
        this._routesPrepared = false;
        this.routeAutoload = (this.registeredRoutes || []).some(
          (rc) => routeConfigName(rc) === NEXA_ROUTE_AUTOLOAD_TOKEN
        );
        
        // Simpan registeredRoutes ke window.nexaPage untuk akses dari NexaRoute.init()
        if (typeof window.nexaPage === 'undefined') {
          window.nexaPage = {};
        }
        this.debugRouteErrors = config.debugRouteErrors === true;
        this.credential = config.credential === true;
        window.nexaPage.routeAutoload = this.routeAutoload;
        window.nexaPage.registeredRoutes = this.registeredRoutes
          .map((rc) => routeConfigName(rc))
          .filter((n) => n && n !== NEXA_ROUTE_AUTOLOAD_TOKEN);
        window.nexaPage.mountPath = this.mountPath;
        window.nexaPage.appRoot = this.appRoot;
        window.nexaPage.debugRouteErrors = this.debugRouteErrors;
        window.nexaPage.credential = this.credential;
        window.nexaPage.distroRoutes = this.distroRoutes;
        window.nexaPage.packageRoutes = this.packageRoutes;

        // Subrutes: nested route groups yang dirender di container berbeda
        this.subrutes = config.subrutes || null;
        window.nexaPage.subrutes = this.subrutes;

        const ep =
          config.endpoint && typeof config.endpoint === "object"
            ? config.endpoint
            : null;
        const registeredBaseUrl =
          (ep && ep.url) || config.url || config.pathname;
        const mergedUrlApi =
          ep && ep.urlApi !== undefined && String(ep.urlApi).trim() !== ""
            ? ep.urlApi
            : config.urlApi;
        this.urlApi = mergedUrlApi;
        window.nexaPage.urlApi = mergedUrlApi;
        if (ep) {
          window.nexaPage.endpoint = ep;
        }

        const webWorkerCfg =
          config.webWorker !== undefined ? config.webWorker : config.worker;
        this.webWorker = webWorkerCfg;
        window.nexaPage.webWorker = webWorkerCfg || { enabled: false };
        window.nexaPage.worker = window.nexaPage.webWorker;
        if (
          webWorkerCfg &&
          webWorkerCfg.enabled &&
          typeof window.NXUI !== "undefined" &&
          typeof window.NXUI.initNexaWorker === "function"
        ) {
          window.NXUI.initNexaWorker(webWorkerCfg);
        }

        this.serviceWorker = config.serviceWorker;
        window.nexaPage.serviceWorker = config.serviceWorker || { enabled: false };
        if (
          config.serviceWorker &&
          (config.serviceWorker.enabled === true ||
            config.serviceWorker.enabled === false) &&
          typeof window.NXUI !== "undefined" &&
          typeof window.NXUI.initNexaServiceWorker === "function"
        ) {
          window.NXUI.initNexaServiceWorker(config.serviceWorker);
        }

        const pwaCfg = config.pwa;
        if (
          pwaCfg &&
          pwaCfg.enabled !== false &&
          typeof window.NXUI !== "undefined" &&
          typeof window.NXUI.initNexaPwa === "function"
        ) {
          window.NXUI.initNexaPwa({
            enabled: true,
            manifestUrl: pwaCfg.manifestUrl || "/manifest.webmanifest",
            themeColor: pwaCfg.themeColor || "#CB2F2F",
            appleTouchIcon: pwaCfg.appleTouchIcon || "/assets/images/logo.png",
            promptUpdate: pwaCfg.promptUpdate !== false,
            onBackgroundSync: pwaCfg.onBackgroundSync,
          });
        }

        // Spinner configuration
        this.spinnerConfig = config.spinner || {
          enabled: true,
          type: 'inline',
          size: 'medium',
          color: '#007bff',
          position: 'center',
          message: ''
        };

        this.defaultRouteMeta = config.defaultRouteMeta != null ? config.defaultRouteMeta : null;

        // Route change callback
        this.onRouteChange = config.onRoute || config.onRouteChange || null;
        
        // Set url ke NEXA — endpoint.url mengalahkan config.url (integrasi multi-API)
        if (registeredBaseUrl) {
          if (typeof window.NXUI !== 'undefined' && typeof window.NXUI.updateNEXAUrl === 'function') {
            window.NXUI.updateNEXAUrl(registeredBaseUrl, mergedUrlApi);
          } else {
            // Fallback jika NXUI.updateNEXAUrl belum tersedia
            if (typeof window.NEXA === 'undefined') {
              window.NEXA = {
                url: registeredBaseUrl,
                userId: 0,
                controllers: {
                  packages: 'packages'
                }
              };
            } else {
              window.NEXA.url = registeredBaseUrl;
            }
            const baseNorm = String(registeredBaseUrl).replace(/\/+$/, '');
            if (mergedUrlApi && String(mergedUrlApi).trim() !== '') {
              window.NEXA.apiBase = String(mergedUrlApi).trim().replace(/\/+$/, '');
            } else {
              window.NEXA.apiBase = baseNorm + '/api';
            }
          }
        } else {
          // Jika url tidak diberikan, gunakan NEXA.url yang sudah ter-registrasi di NexaUI.js
          // Pastikan NEXA object tersedia (fallback jika belum ada)
          if (typeof window.NEXA === 'undefined') {
            // Fallback: gunakan origin saja (jangan gunakan pathname)
            window.NEXA = {
              url: window.location.origin || 'NexaStoreDB',
              userId: 0
            };
          }
          // Jika NEXA sudah ada, gunakan NEXA.url yang sudah ter-registrasi (tidak di-override)
        }

        const endpointSnapshot = { ...(config.endpoint || {}) };
        if (registeredBaseUrl) {
          endpointSnapshot.url = registeredBaseUrl;
        }
        if (mergedUrlApi !== undefined) {
          endpointSnapshot.urlApi = mergedUrlApi;
        }
        if (
          Object.keys(endpointSnapshot).length > 0 &&
          typeof window.NXUI !== 'undefined' &&
          typeof window.NXUI.syncNexaEndpoints === 'function'
        ) {
          window.NXUI.syncNexaEndpoints(endpointSnapshot);
        }

        this.init();
      }

      /**
       * Initialize route manager
       */
      init() {
        // Start setup - tunggu DOM ready dan NXUI siap
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            // Tunggu sedikit untuk memastikan NXUI sudah load
            setTimeout(() => this.setupRoutes(), 200);
          });
        } else {
          // DOM sudah ready, tunggu NXUI
          setTimeout(() => this.setupRoutes(), 200);
        }

        // Juga listen untuk event nxuiReady sebagai backup
        window.addEventListener('nxuiReady', () => {
          setTimeout(() => this.setupRoutes(), 100);
        }, { once: true });
      }

      /**
       * Setup routes - cek apakah nexaRoute sudah tersedia
       */
      setupRoutes() {
        // Cek apakah nexaRoute sudah tersedia
        if (typeof window.nexaRoute === 'undefined') {
          // Tunggu event nexaRouteReady atau retry
          this.checkRoute();
          
          // Listen untuk event
          window.addEventListener('nexaRouteReady', () => this.ensureContainerId(), { once: true });
          
          return;
        }

        // Pastikan containerId sesuai dengan config
        this.ensureContainerId();
      }

      /**
       * Memastikan nexaRoute menggunakan containerId yang sesuai dengan config
       */
      ensureContainerId() {
        // Jika nexaRoute sudah ada, cek apakah containerId-nya sesuai
        if (window.nexaRoute && window.nexaRoute.container) {
          const currentContainerId = window.nexaRoute.container.id;
          // Jika containerId berbeda, buat instance baru dengan containerId yang benar
          if (currentContainerId !== this.containerId) {
            window.nexaRoute = new NexaRoute(this.containerId, {
              spinner: this.spinnerConfig,
              onRoute: this.onRouteChange,
              mountPath: this.mountPath,
              defaultRouteMeta: this.defaultRouteMeta,
              debugRouteErrors: this.debugRouteErrors
            });
            
            // Dispatch event bahwa NexaRoute sudah siap dengan containerId baru
            window.dispatchEvent(new CustomEvent('nexaRouteReady'));
          } else {
            // ContainerId sama, update spinner config dan onRoute callback
            if (window.nexaRoute && this.spinnerConfig) {
              // Update spinner config dengan deep copy untuk memastikan semua property ter-update
              window.nexaRoute.spinnerConfig = { ...this.spinnerConfig };
            }
            // Update onRoute callback
            if (this.onRouteChange) {
              window.nexaRoute.onRouteChange = this.onRouteChange;
            }
            if (window.nexaRoute && this.mountPath !== undefined) {
              window.nexaRoute.mountPath = this.mountPath;
            }
            if (window.nexaRoute) {
              window.nexaRoute.defaultRouteMeta = this.defaultRouteMeta;
              window.nexaRoute.debugRouteErrors = this.debugRouteErrors;
            }
          }
        } else if (window.nexaRoute && !window.nexaRoute.container) {
          // Jika nexaRoute ada tapi container-nya null, reinitialize
          window.nexaRoute = new NexaRoute(this.containerId, {
            spinner: this.spinnerConfig,
            onRoute: this.onRouteChange,
            mountPath: this.mountPath,
            defaultRouteMeta: this.defaultRouteMeta,
            debugRouteErrors: this.debugRouteErrors
          });
          
          // Dispatch event bahwa NexaRoute sudah siap
          window.dispatchEvent(new CustomEvent('nexaRouteReady'));
        } else if (!window.nexaRoute) {
          // Jika nexaRoute belum ada, buat dengan spinner config dan onRoute callback
          window.nexaRoute = new NexaRoute(this.containerId, {
            spinner: this.spinnerConfig,
            onRoute: this.onRouteChange,
            mountPath: this.mountPath,
            defaultRouteMeta: this.defaultRouteMeta,
            debugRouteErrors: this.debugRouteErrors
          });
          
          // Dispatch event bahwa NexaRoute sudah siap
          window.dispatchEvent(new CustomEvent('nexaRouteReady'));
        }
        
        this.prepareAndRegisterAllRoutes();
      }

      async prepareAndRegisterAllRoutes() {
        if (!this._routesPrepared) {
          this.registeredRoutes = await expandRoutesWithAutoload(
            this.registeredRoutes
          );
          this._routesPrepared = true;
          if (typeof window.nexaPage !== 'undefined') {
            window.nexaPage.registeredRoutes = this.registeredRoutes.map((rc) =>
              routeConfigName(rc)
            );
          }
        }
        await this.registerAllRoutes();
      }

      /**
       * Check route availability dengan retry mechanism
       */
      checkRoute() {
        if (typeof window.nexaRoute !== 'undefined') {
          this.ensureContainerId();
        } else {
          setTimeout(() => this.checkRoute(), 100);
        }
      }

      /**
       * Register semua routes ke nexaRoute
       * Mendukung dua format:
       * 1. String sederhana: 'beranda' -> akan mencari file beranda.js
       * 2. Object dengan template: { route: 'beranda', template: 'docs/beranda.html', options: {...} } -> langsung register dengan template
       */
      async registerAllRoutes() {
        if (typeof window.nexaRoute === 'undefined') {
          return;
        }

        if (!this._routesPrepared) {
          this.registeredRoutes = await expandRoutesWithAutoload(
            this.registeredRoutes
          );
          this._routesPrepared = true;
        }

        // Initialize nexaSubRoute untuk subrutes jika dikonfigurasi
        if (this.subrutes && this.subrutes.containerId && !window.nexaSubRoute) {
          window.nexaSubRoute = new NexaRoute(this.subrutes.containerId, {
            spinner: this.spinnerConfig,
            mountPath: this.mountPath,
            defaultRouteMeta: this.defaultRouteMeta,
            debugRouteErrors: this.debugRouteErrors,
            enableIndexedDB: false,
            skipInitNavigation: true,
          });
        }
        
        // Simpan registeredRoutes ke window.nexaPage untuk akses dari NexaRoute
        // Extract route names saja (untuk kompatibilitas dengan NexaRoute.init())
        if (typeof window.nexaPage === 'undefined') {
          window.nexaPage = {};
        }
        // Extract route names dari config (bisa string atau object)
        window.nexaPage.registeredRoutes = this.registeredRoutes.map(routeConfig => {
          return typeof routeConfig === 'object' && routeConfig !== null 
            ? (routeConfig.route || routeConfig)
            : routeConfig;
        });
        
        const route = window.nexaRoute;
        
        // Pisahkan routes menjadi dua kategori:
        // 1. Routes dengan template (object dengan property template)
        // 2. Routes tanpa template (string atau object tanpa template) -> gunakan contentIndex
        const templateRoutes = [];
        const fileRoutes = [];
        
        this.registeredRoutes.forEach(routeConfig => {
          // Jika routeConfig adalah object dan memiliki property 'template'
          if (typeof routeConfig === 'object' && routeConfig !== null && routeConfig.template) {
            // Ini adalah route dengan template path
            templateRoutes.push(routeConfig);
          } else {
            // Ini adalah route tanpa template (string atau object tanpa template)
            // Akan menggunakan contentIndex untuk load file .js
            fileRoutes.push(routeConfig);
          }
        });
        
        // Register routes dengan template terlebih dahulu
        templateRoutes.forEach(routeConfig => {
          const routeName = typeof routeConfig === 'object' ? routeConfig.route : routeConfig;
          const templatePath = routeConfig.template;
          const options = routeConfig.options || {};
          
          if (routeName && templatePath) {
            route.registerTemplate(routeName, templatePath, options);
          }
        });
        
        // Register routes tanpa template menggunakan contentIndex (cara lama)
        const routeToFile = await Promise.all(fileRoutes.map(async routeConfig => {
          // Extract route name
          const routeName = typeof routeConfig === 'object' ? routeConfig.route : routeConfig;
          // Path modul: mirroring folder, mis. contact/data → templates/contact/data.js
          const actionPath = routeName + ".js";
          // Nama export: identifier valid, mis. contact_data (sama seperti pola lama flat)
          const exportName = routeName.replace(/\//g, "_");
          const data = {
            action: actionPath,
            exportName: exportName,
            page: routeName,
          };
          return await contentIndex(data, this.appRoot);
          }));
        
        // Register subrutes: parent handler + sub-route handlers pada nexaSubRoute
        if (this.subrutes) {
          const subContainerId = this.subrutes.containerId;
          const subRouteInstance = window.nexaSubRoute;

          for (const [parentKey, subList] of Object.entries(this.subrutes)) {
            // Lewati properti konfigurasi, bukan daftar sub-rute
            if (parentKey === 'containerId' || parentKey === 'route' || !Array.isArray(subList) || subList.length === 0) continue;

            // Dummy handler: agar waitForRoute(parentKey) resolve saat init.
            // navigate()._handleSubruteGroup menangani semua rendering sebenarnya.
            if (!route.routes.has(parentKey)) {
              route.register(parentKey, async () => {});
            }

            // Register handler tiap sub-route pada nexaSubRoute instance
            if (subRouteInstance) {
              await Promise.all(subList.map(async (subName) => {
                const data = {
                  action: subName + '.js',
                  exportName: subName.replace(/\//g, '_'),
                  page: subName,
                };
                await contentIndex(data, this.appRoot, subRouteInstance);
              }));
            }
          }
        }

        // Setup click handlers ulang setelah routes diregister
        if (typeof route.setupClickHandlers === 'function') {
          route.setupClickHandlers();
        }
        
        // Setelah routes terdaftar, cek apakah perlu navigate ke route jika belum ada route aktif
        // Ini untuk handle kasus pertama kali kunjung (lastRoute kosong)
        if (route) {
          const currentRoute = route.getCurrentRoute();
          const urlRoute = route.getRouteFromUrl(window.location.href);
          
          // Jika belum ada route yang aktif
          if (!currentRoute && !urlRoute) {
            // Cek apakah lastRoute kosong (pertama kali kunjung)
            let shouldNavigateToFirst = false;
            
            if (route.enableIndexedDB) {
              // Tunggu dbReady (maks 2 detik) agar tidak race dengan NexaRoute.init()
              if (!route.dbReady) {
                await new Promise(resolve => {
                  let n = 0;
                  const chk = () => (route.dbReady || n++ > 100) ? resolve() : setTimeout(chk, 20);
                  chk();
                });
              }
              // Cek ulang: mungkin NexaRoute.init() sudah navigasi saat kita menunggu
              if (route.getCurrentRoute()) {
                shouldNavigateToFirst = false;
              } else {
                try {
                  const savedRoute = await route.loadLastRoute();
                  if (!savedRoute) {
                    shouldNavigateToFirst = true;
                  }
                } catch (error) {
                  shouldNavigateToFirst = true;
                }
              }
            } else {
              // Jika IndexedDB tidak aktif, langsung gunakan route pertama
              shouldNavigateToFirst = true;
            }
            
            // Navigate ke route pertama jika diperlukan
            if (shouldNavigateToFirst && this.registeredRoutes && this.registeredRoutes.length > 0) {
              // Extract route name dari config (bisa string atau object)
              const firstRouteConfig = this.registeredRoutes[0];
              const firstRoute = typeof firstRouteConfig === 'object' && firstRouteConfig !== null 
                ? firstRouteConfig.route || firstRouteConfig 
                : firstRouteConfig;
              
              if (firstRoute) {
                // Pastikan handler sudah terdaftar sebelum navigate
                const handler = route.routes.get(firstRoute);
                if (handler) {
                  // Handler sudah terdaftar, langsung navigate tanpa delay
                  route.navigate(firstRoute, false);
                } else {
                  // Handler belum terdaftar, tunggu sebentar (maksimal 500ms)
                  let attempts = 0;
                  const waitAndNavigate = () => {
                    attempts++;
                    const checkHandler = route.routes.get(firstRoute);
                    if (checkHandler) {
                      route.navigate(firstRoute, false);
                    } else if (attempts < 10) {
                      setTimeout(waitAndNavigate, 50);
                    }
                  };
                  setTimeout(waitAndNavigate, 50);
                }
              }
            }
          }
        }
      }

      /**
       * Register route dengan template path secara dinamis
       * Method ini adalah wrapper untuk nexaRoute.registerTemplate() dengan akses ke nexaRoute instance
       * 
       * @param {string} route - Route path
       * @param {string} templatePath - Path template file
       * @param {Object} options - Options untuk template loading (lihat registerTemplate di NexaRoute)
       * 
       * @example
       * // Di dalam NexaPage instance
       * nexaPage.registerTemplateRoute('beranda', 'docs/fundamental/pengenalan-framework.html', {
       *   variables: {
       *     title: 'Home Page',
       *     description: 'Ini adalah halaman Home'
       *   }
       * });
       */
      registerTemplateRoute(route, templatePath, options = {}) {
        if (typeof window.nexaRoute === 'undefined') {
          return;
        }
        
        window.nexaRoute.registerTemplate(route, templatePath, options);
      }

      /**
       * Register multiple routes dengan template paths sekaligus
       * Method ini memudahkan registrasi banyak route dengan template paths dalam satu panggilan
       * 
       * @param {Array|Object} routesConfig - Array atau Object berisi konfigurasi routes
       *   Jika Array: [{ route: 'beranda', template: 'docs/beranda.html', options: {...} }, ...]
       *   Jika Object: { 'beranda': { template: 'docs/beranda.html', options: {...} }, ... }
       * 
       * @example
       * // Menggunakan Array
       * nexaPage.registerTemplateRoutes([
       *   { route: 'beranda', template: 'docs/beranda.html', options: { variables: { title: 'Home' } } },
       *   { route: 'about', template: 'docs/about.html' },
       *   { route: 'contact', template: 'docs/contact.html', options: { variables: { title: 'Contact' } } }
       * ]);
       * 
       * @example
       * // Menggunakan Object
       * nexaPage.registerTemplateRoutes({
       *   'beranda': { template: 'docs/beranda.html', options: { variables: { title: 'Home' } } },
       *   'about': { template: 'docs/about.html' },
       *   'contact': { template: 'docs/contact.html' }
       * });
       */
      registerTemplateRoutes(routesConfig) {
        if (typeof window.nexaRoute === 'undefined') {
          return;
        }

        // Handle Array format
        if (Array.isArray(routesConfig)) {
          routesConfig.forEach(config => {
            if (config.route && config.template) {
              window.nexaRoute.registerTemplate(config.route, config.template, config.options || {});
            }
          });
        }
        // Handle Object format
        else if (typeof routesConfig === 'object' && routesConfig !== null) {
          Object.entries(routesConfig).forEach(([route, config]) => {
            if (config && config.template) {
              window.nexaRoute.registerTemplate(route, config.template, config.options || {});
            } else if (typeof config === 'string') {
              // Jika config adalah string, treat sebagai template path
              window.nexaRoute.registerTemplate(route, config, {});
            }
          });
        }
      }
    }

    // Initialize NexaPage instance
// const NexaPage = new NexaPage();
export async function contentIndex(items, appRoot = '', routeInstance = null, options = {}) {
  const silent = options.silentMissing === true;
  const noFlat = options.noFlatFallback === true;

  try {
       if (items.page) {
          await NXUI.getDb()
      // Dynamic import: items.action = "contact/data.js" → appRoot/contact/data.js
       let module;
       try {
         module = await import(`../../../${appRoot}/${items.action}`);
       } catch (e1) {
         if (noFlat) {
           return silent ? false : getDefaultContent(items);
         }
         // Fallback: pola lama satu file flat contact_data.js di appRoot
         const flatFile = items.action.replace(/\//g, "_");
         try {
           module = await import(`../../../${appRoot}/${flatFile}`);
         } catch (e2) {
           return silent ? false : getDefaultContent(items);
         }
       }
       // Nama export: coba beberapa kandidat, dari yang paling spesifik ke paling umum:
       // 1) segmen terakhir path (mis. "profil/sejarah" → "sejarah") — pola baru, sesuai lokasi file
       // 2) items.exportName / full path dengan "_" (mis. "profil_sejarah") — pola lama, tetap didukung
       // 3) module.default
       const fullExportName =
         items.exportName ||
         items.action.replace(/\.js$/, "").replace(/\//g, "_");
       const pageSegments = String(items.page || "").split("/").filter(Boolean);
       const shortExportName = pageSegments.length
         ? pageSegments[pageSegments.length - 1]
         : "";
         const route = routeInstance || window.nexaRoute;
       const contentFunction =
         (shortExportName && module[shortExportName]) ||
         module[fullExportName] ||
         module.default;
       if (typeof contentFunction === 'function') {
         // Register handler yang bisa menerima sub-route info
         return await contentFunction(items.page, route);
       }
       return silent ? false : getDefaultContent(items);
      } else {
        return silent ? false : getDefaultContent(items);
      }
  } catch (error) {
    return silent ? false : getDefaultContent(items);
  }
}

// Fallback content jika module tidak ditemukan
function getDefaultContent(items) {
  return `
    <div class="setting-info">
      <p><strong>Setting:</strong> ${items.action}</p>
      <p><strong>Icon:</strong> <span class="material-symbols-outlined">construction</span></p>
      <p><strong>Title:</strong>title</p>
      <p><strong>Description:</strong>description</p>
    </div>
    <div class="content-placeholder">
      <p>Content untuk "${items.page}" sedang dalam pengembangan.</p>
    </div>
  `;
}


