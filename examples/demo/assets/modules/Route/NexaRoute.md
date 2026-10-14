# Dokumentasi NexaRoute

Dokumentasi lengkap untuk penggunaan NexaRoute (Client-Side Routing).

---

## Daftar Isi

1. [Pengenalan](#pengenalan)
2. [Instalasi & Setup](#instalasi--setup)
3. [Konfigurasi NexaPage](#konfigurasi-nexapage)
4. [Membuat Route Handler](#membuat-route-handler)
5. [Template-Based Routing](#template-based-routing) ⭐ **NEW**
6. [Sub-Routes (Nested Routes)](#sub-routes-nested-routes)
7. [API Reference](#api-reference)
8. [Contoh Penggunaan](#contoh-penggunaan)
9. [Best Practices](#best-practices)
10. [Meta halaman dan routeMeta](#meta-halaman-dan-routemeta)

---

## Pengenalan

### NexaRoute
NexaRoute adalah sistem routing client-side yang memungkinkan navigasi tanpa reload halaman. Fitur utama:
- ✅ Client-side routing (SPA)
- ✅ Sub-routes support (nested routes)
- ✅ **Template-based routing** (tidak perlu file .js manual) ⭐ **NEW**
- ✅ **Dynamic template path** dengan sub-route support ⭐ **NEW**
- ✅ **Meta halaman per route** — `routeMeta` untuk judul/deskripsi dan callback `onRoute` (SPA / `setPageMeta`) ⭐ **NEW**
- ✅ URL history management
- ✅ IndexedDB persistence (restore route setelah refresh)
- ✅ Loading spinner integration
- ✅ Event delegation untuk link dinamis
- ✅ Auto route registration

---

## Instalasi & Setup

### 1. Import NexaUI

Pastikan file `NexaUI.js` sudah di-import di HTML:

```html
<script type="module" src="assets/js/NexaUI.js"></script>
```

### 2. Struktur Folder

```
project/
├── assets/
│   └── js/
│       ├── NexaUI.js
│       └── Route/
│           └── NexaRoute.js
└── templates/
    └── theme/
        └── app/
            ├── App.js
            ├── about.js
            ├── guides.js
            └── ...
```

### 3. Container Element

Pastikan ada container element di HTML untuk menampilkan konten route:

```html
<div id="main"></div>
```

---

## Konfigurasi NexaPage

`NexaPage` adalah class yang mengelola registrasi dan inisialisasi routes secara otomatis.

### Basic Configuration

```javascript
new NXUI.Page({
    pathname: "http://localhost/dev",  // Base URL aplikasi
    containerId: 'main',                // ID container element
    appRoot: 'templates/theme/app',     // Path ke folder route handlers
    route: [                            // Daftar routes
        'beranda',
        'about',
        'blog',
        'contact'
    ]
})
```

### Full Configuration dengan Spinner dan Route Callback

```javascript
new NXUI.Page({
    pathname: "http://localhost/dev",
    containerId: 'main',
    appRoot: 'templates/theme/app',
    spinner: {
        enabled: true,        // Aktifkan/nonaktifkan spinner
        centerScreen: true,   // Tampilkan di tengah layar
        type: 'overlay',      // 'overlay' | 'inline' | 'button'
        size: 'medium',       // 'small' | 'medium' | 'large'
        color: '#007bff',     // Warna spinner
        position: 'center',   // 'center' | 'top' | 'bottom'
        message: ''           // Pesan yang ditampilkan
    },
    route: [
        'beranda',
        'about',
        'blog',
        'contact',
        'guides',
        'components'
    ],
    // Callback untuk mengetahui route aktif saat diklik atau navigasi
    onRoute: (routeInfo) => {
        console.log('📍 Route changed:', routeInfo.route);
        console.log('  - Base Route:', routeInfo.baseRoute);
        console.log('  - Sub Route:', routeInfo.subRoute);
        console.log('  - Previous Route:', routeInfo.previousRoute);
        
        // Update active menu berdasarkan route
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        const activeLink = document.querySelector(`a[href="#${routeInfo.route}"]`);
        if (activeLink) {
            activeLink.classList.add('active');
        }
    }
})
```

### Parameter Konfigurasi

| Parameter | Type | Default | Deskripsi |
|-----------|------|---------|-----------|
| `pathname` | string | - | **Wajib.** Base URL aplikasi (contoh: "http://localhost/dev") |
| `containerId` | string | `'main'` | ID container element untuk menampilkan konten |
| `appRoot` | string | `'theme/app'` | Path relatif ke folder route handlers |
| `spinner` | object | `{...}` | Konfigurasi loading spinner |
| `route` | array | `[]` | Daftar routes (string atau object dengan template path) |
| `onRoute` | function | `null` | Callback yang dipanggil saat route berubah (lihat [Route Change Callback](#route-change-callback)) |
| `onRouteChange` | function | `null` | Alias untuk `onRoute` |

### Format Route Configuration

Route bisa berupa:
1. **String sederhana**: `'beranda'` → akan mencari file `beranda.js` di `appRoot`
2. **Object dengan template path**: `{ route: 'beranda', template: '...', options: {...} }` → langsung menggunakan template, tidak perlu file `.js`

Lihat [Template-Based Routing](#template-based-routing) untuk detail lengkap.

---

## Route Change Callback ⭐ **NEW**

NexaRoute menyediakan callback `onRoute` yang dipanggil setiap kali route berubah. Ini berguna untuk:
- Update active menu berdasarkan route aktif
- Update UI berdasarkan route
- **Memperbarui `<title>` dan meta tag** lewat `routeInfo.routeMeta` (lihat [Meta halaman dan routeMeta](#meta-halaman-dan-routemeta))
- Track route changes untuk analytics
- Conditional styling berdasarkan route

### Menggunakan Callback `onRoute`

```javascript
new NXUI.Page({
    pathname: "http://localhost/dev",
    containerId: 'main',
    appRoot: 'templates/theme/app',
    route: ['home', 'about', 'contact'],
    onRoute: (routeInfo) => {
        // routeInfo berisi informasi lengkap tentang route
        console.log('Route aktif:', routeInfo.route);
        console.log('Base route:', routeInfo.baseRoute);
        console.log('Sub route:', routeInfo.subRoute);
        console.log('Path:', routeInfo.path);
        console.log('Previous route:', routeInfo.previousRoute);
        console.log('Is subRoute navigation:', routeInfo.isSubRouteNavigation);
        
        // Update active menu
        updateActiveMenu(routeInfo.route);
        
        // Conditional styling
        if (routeInfo.route === 'dataset') {
            NXUI.id("kontak").setStyle("padding-left", "300px");
        } else {
            NXUI.id("kontak").removeStyle("padding-left");
        }
    }
});
```

### Route Info Object

Callback `onRoute` menerima object `routeInfo` dengan property berikut:

| Property | Type | Deskripsi |
|----------|------|-----------|
| `route` | string | Route lengkap (misalnya: `'dataset/pengenalan'`) |
| `baseRoute` | string | Base route (misalnya: `'dataset'`) |
| `subRoute` | string\|null | Sub route jika ada (misalnya: `'pengenalan'`), atau `null` |
| `path` | string | Full path URL (misalnya: `'/dev/dataset/pengenalan'`) |
| `previousRoute` | string\|null | Route sebelumnya, atau `null` jika ini adalah navigasi pertama |
| `isSubRouteNavigation` | boolean | `true` jika ini navigasi subRoute dalam baseRoute yang sama |
| `container` | HTMLElement | Container element untuk route |
| `routeMeta` | object\|null | Meta halaman untuk rute ini (`title`, `description`, `ogImage`, …). Diisi dari `route.routeMetaByRoute.get(baseRoute)` setelah handler menyimpan meta (lihat [Meta halaman dan routeMeta](#meta-halaman-dan-routemeta)) |

### Contoh Penggunaan

#### 1. Update Active Menu

```javascript
onRoute: (routeInfo) => {
    // Remove active class dari semua menu items
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // Add active class ke menu item yang sesuai
    const activeLink = document.querySelector(`a[href="#${routeInfo.route}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}
```

#### 2. Conditional Styling

```javascript
onRoute: (routeInfo) => {
    const kontakElement = NXUI.id("kontak");
    
    if (routeInfo.route === 'dataset') {
        kontakElement.setStyle("padding-left", "300px");
        kontakElement.setStyle("margin-left", "50px");
    } else if (routeInfo.baseRoute === 'dataset') {
        kontakElement.setStyle("padding-left", "350px");
        kontakElement.setStyle("margin-left", "50px");
    } else {
        kontakElement.removeStyle("padding-left");
        kontakElement.removeStyle("margin-left");
    }
}
```

#### 3. Track Route Changes

```javascript
onRoute: (routeInfo) => {
    // Track untuk analytics
    if (typeof gtag !== 'undefined') {
        gtag('event', 'page_view', {
            page_path: routeInfo.path,
            page_title: routeInfo.route
        });
    }
    
    // Log untuk debugging
    console.log(`Navigated from ${routeInfo.previousRoute || 'initial'} to ${routeInfo.route}`);
}
```

#### 4. Update Page Title

```javascript
onRoute: (routeInfo) => {
    const titles = {
        'home': 'Home - My App',
        'about': 'About - My App',
        'contact': 'Contact - My App',
        'dataset': 'Dataset - My App'
    };
    
    const title = titles[routeInfo.route] || titles[routeInfo.baseRoute] || 'My App';
    document.title = title;
}
```

---

## Meta halaman dan routeMeta

NexaRoute menyimpan **meta per kunci rute** di `nexaRoute.routeMetaByRoute` (`Map<string, object>`). Nilai ini dipakai saat **`navigate`** untuk:
- Argumen ketiga handler konten: `routeMeta` (bisa `undefined` jika belum diset)
- Callback **`onRoute`** dan event **`nxui:routeChange`**: field **`routeMeta`** (baca dari Map dengan kunci **`baseRoute`**)

### Menyetel meta dari file route handler (disarankan)

Di dalam callback `route.register`, **awali** handler dengan menyimpan meta yang sama dengan default parameter (agar `onRoute` / `setPageMeta` di `App.js` mendapat data **setelah** handler jalan, sebelum callback `onRoute`):

```javascript
export async function about(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "About | App",
    description: "Tentang kami.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    container.innerHTML = `<h1>About</h1>`;
  });
}
```

- **`page`**: nama rute yang sama dengan registrasi (mis. `'about'`, `'contact/data'`).
- **`routeMeta`**: objek bebas (minimal `title`, `description`; bisa ditambah `ogImage`, `keywords`, … jika dipakai `setPageMeta`).

### Alternatif: meta saat `register`

Anda juga bisa mendaftarkan meta lewat argumen keempat **`register(route, handler, style, routeMeta)`** — nilai disimpan ke Map tanpa perlu `set` di handler. Pola di atas (default + `set`) memungkinkan **satu** definisi objek di parameter callback.

### `registerTemplate`

Handler template internal membangun **`context`** untuk `beforeLoad` / `html` / `afterLoad` dari **`routeMeta`** (argumen ketiga) dan **`nav`** (`baseRoute`, `subRoute`).

---

## Route Change Event ⭐ **NEW**

Selain callback, NexaRoute juga dispatch custom event `nxui:routeChange` yang bisa digunakan oleh komponen lain (seperti Sidebar) untuk update state.

### Menggunakan Event Listener

```javascript
// Listen untuk route change event
window.addEventListener('nxui:routeChange', (event) => {
    const { route, baseRoute, subRoute, path, previousRoute, isSubRouteNavigation, routeMeta } = event.detail;
    
    console.log('Route changed:', route);
    console.log('From:', previousRoute, 'To:', route);
    
    // Update UI berdasarkan route
    updateActiveMenu(route);
    updatePageTitle(route);
});
```

### Event Detail

Event `nxui:routeChange` memiliki `detail` object dengan property yang sama seperti `routeInfo` di callback:

```javascript
{
    route: 'dataset/pengenalan',
    baseRoute: 'dataset',
    subRoute: 'pengenalan',
    path: '/dev/dataset/pengenalan',
    previousRoute: 'home',
    routeMeta: { title: '...', description: '...' }, // atau null
    isSubRouteNavigation: false
}
```

### Kapan Event Di-dispatch?

Event `nxui:routeChange` di-dispatch setiap kali:
- ✅ User mengklik link navigasi
- ✅ User refresh halaman
- ✅ User menggunakan browser back/forward button
- ✅ Route berubah secara programmatic dengan `navigate()`

### Contoh Integrasi dengan Sidebar

```javascript
// Sidebar akan otomatis update active state saat route berubah
window.addEventListener('nxui:routeChange', (event) => {
    const { route, baseRoute, subRoute } = event.detail;
    
    // Update sidebar active state
    if (typeof NXUI !== 'undefined' && NXUI.updateSidebarPath) {
        NXUI.updateSidebarPath(route);
    }
});
```

---

## Membuat Route Handler

Route handler adalah file JavaScript yang mengeksport function untuk menangani route tertentu.

### Struktur File Route Handler

File route handler harus:
1. Berada di folder yang ditentukan di `appRoot`
2. Memiliki nama yang sama dengan route (contoh: `about.js` untuk route `'about'`)
3. Mengeksport function dengan nama yang sama dengan route

### Contoh Basic Route Handler

**File: `templates/theme/app/about.js`**

```javascript
// Export function untuk route 'about'
export async function about(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "About | App",
    description: "Tentang kami.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    console.log("📍 Navigating to:", routeName, routeMeta, nav);
    container.innerHTML = `
        <h1>About Page</h1>
        <p>Ini adalah halaman About.</p>
        <p>Route: ${routeName}</p>
      `;
  });
}
```

### Parameter Handler Function (callback `route.register`)

Callback yang diteruskan ke `route.register` memiliki **lima** parameter:

1. **`routeName`** (string): Nama route lengkap yang sedang diakses
2. **`container`** (HTMLElement): Container untuk konten
3. **`routeMeta`** (object \| undefined): Meta halaman — dari `routeMetaByRoute` (Map), atau default parameter Anda jika belum ada di Map
4. **`style`** (object \| null): Konfigurasi grid / style dari `register` (opsional)
5. **`nav`** (object): `{ baseRoute, subRoute }` untuk navigasi nested

Untuk **SEO / `<title>`** dari `App.onRoute`, panggil **`route.routeMetaByRoute.set(page, routeMeta)`** di awal handler (lihat [Meta halaman dan routeMeta](#meta-halaman-dan-routemeta)).

### Contoh Route Handler dengan Form

**File: `templates/theme/app/contact.js`**

```javascript
export async function contact(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "Contact | App",
    description: "Hubungi kami.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    container.innerHTML = `
        <h1>Contact Page</h1>
        <form id="contactForm">
          <div>
            <label>Name:</label>
            <input type="text" name="name">
          </div>
          <div>
            <label>Email:</label>
            <input type="email" name="email">
          </div>
          <div>
            <label>Message:</label>
            <textarea name="message"></textarea>
          </div>
          <button type="submit">Send</button>
        </form>
      `;

    requestAnimationFrame(() => {
      const form = document.getElementById("contactForm");
      if (form) {
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const formData = new FormData(form);
          console.log("Form data:", Object.fromEntries(formData));
        });
      }
    });
  });
}
```

---

## Template-Based Routing ⭐ **NEW**

Template-based routing memungkinkan Anda mendaftarkan route langsung dengan template path tanpa perlu membuat file `.js` manual. Fitur ini sangat berguna untuk route sederhana yang hanya menampilkan template HTML.

### Format Route dengan Template Path

#### 1. Template Path Statis

```javascript
new NXUI.Page({
    pathname: "http://localhost/dev",
    containerId: 'main',
    appRoot: 'templates/theme/app',
    route: [
        {
            route: 'beranda',
            template: 'docs/fundamental/pengenalan-framework.html',
            options: {
                variables: {
                    title: 'Home Page',
                    description: 'Ini adalah halaman Home'
                }
            }
        }
    ]
})
```

**Keuntungan:**
- ✅ Tidak perlu membuat file `beranda.js`
- ✅ Langsung menggunakan template HTML yang sudah ada
- ✅ Lebih cepat dan mudah untuk route sederhana

#### 2. Template Path Dinamis (Function)

Template path bisa berupa function yang menerima `context` dan mengembalikan path template:

```javascript
{
    route: 'guides',
    template: (context) => {
        const { subRoute } = context;
        if (subRoute) {
            return `docs/guides/${subRoute}.html`;  // /guides/pengenalan -> docs/guides/pengenalan.html
        }
        return 'docs/guides/index.html';  // /guides -> docs/guides/index.html
    },
    options: {
        variables: (context) => ({
            title: context.subRoute ? `Guide: ${context.subRoute}` : 'Guides',
            subRoute: context.subRoute
        })
    }
}
```

**Context Object:**
- `route` (string): Route lengkap (misalnya: `'guides/pengenalan'`)
- `baseRoute` (string): Base route (misalnya: `'guides'`)
- `subRoute` (string|null): Sub-route jika ada (misalnya: `'pengenalan'`), atau `null`

#### 3. Template Path dengan Object Format

Format lebih sederhana untuk base dan sub-route:

```javascript
{
    route: 'guides',
    template: {
        base: 'docs/guides/index.html',  // Untuk /guides
        sub: 'docs/guides/{subRoute}.html'  // Untuk /guides/pengenalan
    },
    options: {
        variables: {
            title: 'Guides'
        }
    }
}
```

### Options Configuration

```javascript
{
    route: 'beranda',
    template: 'docs/beranda.html',
    options: {
        // Variables statis
        variables: {
            title: 'Home Page',
            description: 'Ini adalah halaman Home'
        },
        
        // Variables dinamis (function)
        variables: (context) => ({
            title: context.subRoute ? `Guide: ${context.subRoute}` : 'Guides',
            subRoute: context.subRoute
        }),
        
        // Template name (default: 'theme')
        template: 'theme',
        
        // Options untuk html() method
        htmlOptions: {},
        
        // Callback sebelum template di-load
        beforeLoad: async (route, container, context) => {
            console.log('Loading...', route);
        },
        
        // Callback setelah template di-load
        afterLoad: async (route, container, context, content) => {
            console.log('Loaded!', route);
        },
        
        // Custom error handler
        onError: (error, route, container) => {
            console.error('Error:', error);
        }
    }
}
```

### Contoh Lengkap

**File: `templates/theme/app/App.js`**

```javascript
new NXUI.Page({
    pathname: "http://localhost/dev",
    containerId: 'main',
    appRoot: 'templates/theme/app',
    route: [
        // Format 1: Template statis (tidak perlu file beranda.js)
        {
            route: 'beranda',
            template: 'docs/fundamental/pengenalan-framework.html',
            options: {
                variables: {
                    title: 'Home Page',
                    description: 'Ini adalah halaman Home'
                }
            }
        },
        
        // Format 2: String sederhana (akan mencari file about.js)
        'about',
        
        // Format 3: Template dengan sub-route dinamis
        {
            route: 'guides',
            template: (context) => {
                const { subRoute } = context;
                if (subRoute) {
                    return `docs/guides/${subRoute}.html`;
                }
                return 'docs/guides/index.html';
            },
            options: {
                variables: (context) => ({
                    title: context.subRoute ? `Guide: ${context.subRoute}` : 'Guides',
                    description: context.subRoute ? `Panduan untuk ${context.subRoute}` : 'Daftar panduan',
                    subRoute: context.subRoute
                })
            }
        },
        
        // Format 4: Template dengan object format
        {
            route: 'apis',
            template: {
                base: 'docs/api/index.html',
                sub: 'docs/api/{subRoute}.html'
            },
            options: {
                variables: {
                    title: 'APIs Documentation'
                }
            }
        }
    ]
})
```

### Kapan Menggunakan Template-Based Routing?

**Gunakan template-based routing jika:**
- ✅ Route hanya menampilkan template HTML statis
- ✅ Tidak ada logika JavaScript yang kompleks
- ✅ Ingin mengurangi jumlah file `.js` yang perlu dibuat
- ✅ Template sudah tersedia dan siap digunakan

**Gunakan file `.js` manual jika:**
- ❌ Route memerlukan logika JavaScript yang kompleks
- ❌ Perlu manipulasi DOM yang rumit setelah load
- ❌ Perlu fetch data dari API
- ❌ Perlu interaksi form yang kompleks

---

## Sub-Routes (Nested Routes)

NexaRoute mendukung sub-routes (nested routes) untuk membuat struktur URL yang lebih terorganisir.

### Contoh Sub-Routes

- Base route: `/guides`
- Sub-routes:
  - `/guides/pengenalan`
  - `/guides/MVC`
  - `/guides/komponen`

### Implementasi Sub-Routes

**File: `templates/theme/app/guides.js`**

```javascript
// Export function untuk route 'guides'
// Mendukung sub-routes seperti: /guides/pengenalan, /guides/MVC, dll
export async function guides(page, route) {
    route.register(page, async (routeName, container, routeMeta, style, nav = {}) => {
      const baseRoute = nav.baseRoute || page;
      const subRoute = nav.subRoute || null;
      
      // Jika ada sub-route, tampilkan konten sub-route
      if (subRoute) {
        container.innerHTML = `
          <h1>Guides: ${subRoute}</h1>
          <p>Ini adalah halaman Guides untuk sub-route: <strong>${subRoute}</strong></p>
          <p>Route lengkap: ${routeName}</p>
          <p>Base route: ${baseRoute}</p>
          <p>Sub-route: ${subRoute}</p>
          <hr>
          <nav>
            <a href="/guides">← Kembali ke Guides</a> |
            <a href="/guides/pengenalan">Pengenalan</a> |
            <a href="/guides/MVC">MVC</a>
          </nav>
        `;
      } else {
        // Tampilkan daftar sub-routes jika tidak ada sub-route
        container.innerHTML = `
          <h1>Guides Page</h1>
          <p>Ini adalah halaman Guides.</p>
          <p>Route: ${routeName}</p>
          <hr>
          <h2>Daftar Sub-Routes:</h2>
          <ul>
            <li><a href="/guides/pengenalan">Pengenalan</a></li>
            <li><a href="/guides/MVC">MVC Pattern</a></li>
            <li><a href="/guides/komponen">Komponen</a></li>
            <li><a href="/guides/state-management">State Management</a></li>
          </ul>
        `;
      }
    });
}
```

### Cara Kerja Sub-Routes

1. **URL Parsing**: NexaRoute secara otomatis mem-parse URL seperti `/guides/pengenalan` menjadi:
   - `baseRoute`: `'guides'`
   - `subRoute`: `'pengenalan'`

2. **Handler Registration**: Hanya base route yang perlu diregister di `App.js`:
   ```javascript
   route: [
       'guides',  // Hanya base route
       // Sub-routes tidak perlu diregister
   ]
   ```

3. **Handler Execution**: Handler untuk base route akan dipanggil untuk semua sub-routes, dengan **`nav.subRoute`** / **`nav.baseRoute`** (parameter kelima callback `register`).

### Sub-Routes dengan Template-Based Routing

Dengan template-based routing, sub-routes bisa ditangani dengan lebih mudah:

```javascript
{
    route: 'guides',
    template: (context) => {
        const { subRoute } = context;
        if (subRoute) {
            // Load template untuk sub-route
            return `docs/guides/${subRoute}.html`;
        }
        // Load template untuk base route
        return 'docs/guides/index.html';
    },
    options: {
        variables: (context) => ({
            title: context.subRoute ? `Guide: ${context.subRoute}` : 'Guides',
            subRoute: context.subRoute
        })
    }
}
```

Atau menggunakan format object:

```javascript
{
    route: 'guides',
    template: {
        base: 'docs/guides/index.html',
        sub: 'docs/guides/{subRoute}.html'
    }
}
```

---

## API Reference

### NexaPage

#### Constructor

```javascript
new NXUI.Page(config)
```

**Parameters:**
- `config.pathname` (string, required): Base URL aplikasi
- `config.containerId` (string): ID container element (default: `'main'`)
- `config.appRoot` (string): Path ke folder route handlers (default: `'theme/app'`)
- `config.spinner` (object): Konfigurasi spinner
- `config.route` (array): Daftar routes

---

### NexaRoute

#### Constructor

```javascript
new NexaRoute(containerId, options)
```

**Parameters:**
- `containerId` (string): ID container element (default: `'main'`)
- `options.enableIndexedDB` (boolean): Enable/disable IndexedDB persistence (default: `true`)
- `options.spinner` (object): Konfigurasi spinner

#### Methods

##### `register(route, handler, style?, routeMeta?)`

Mendaftarkan handler untuk route tertentu. **Signature handler** saat dieksekusi oleh `navigate`:

```text
async (routeName, container, routeMeta, style, nav) => { ... }
```

- **`nav`**: `{ baseRoute, subRoute }`
- **`routeMeta`**: object dari Map internal, atau `undefined` jika tidak diset (boleh pakai default parameter di handler)

```javascript
route.register('about', async (routeName, container, routeMeta, style, nav = {}) => {
    container.innerHTML = '<h1>About Page</h1>';
});

// Opsional: simpan meta ke Map saat register (tanpa route.routeMetaByRoute.set di handler)
route.register('about', async (routeName, container, routeMeta, style, nav = {}) => {
    container.innerHTML = '<h1>About</h1>';
}, null, { title: 'About | App', description: '...' });
```

**Parameters:**
- `route` (string): Nama route
- `handler` (function): Callback dengan argumen di atas
- `style` (object \| null, optional): Konfigurasi style / grid
- `routeMeta` (object, optional): Disimpan di **`routeMetaByRoute`** untuk `onRoute` dan argumen ketiga handler

**Properti instance terkait:** `nexaRoute.routeMetaByRoute` — `Map` kunci nama route → object meta.

##### `navigate(route, pushState)`

Navigasi ke route tertentu secara programmatic.

```javascript
nx.nexaRoute.navigate('about');
nx.nexaRoute.navigate('guides/pengenalan');
```

**Parameters:**
- `route` (string): Nama route (bisa dengan sub-route)
- `pushState` (boolean): Push ke history (default: `true`)

##### `getCurrentRoute()`

Mendapatkan route yang sedang aktif.

```javascript
const currentRoute = nx.nexaRoute.getCurrentRoute();
console.log(currentRoute); // 'about' atau 'guides/pengenalan'
```

##### `buildUrl(route)`

Membangun full URL dari route.

```javascript
const url = nx.nexaRoute.buildUrl('about');
console.log(url); // '/dev/about'
```

##### `getRouteFromPath(pathname)`

Mendapatkan route dari pathname.

```javascript
const route = nx.nexaRoute.getRouteFromPath('/dev/guides/pengenalan');
console.log(route); // 'guides/pengenalan'
```

##### `registerTemplate(route, templatePath, options)` ⭐ **NEW**

Mendaftarkan route dengan template path secara dinamis. Tidak perlu membuat file `.js` manual.

```javascript
// Template path statis
nexaRoute.registerTemplate('beranda', 'docs/beranda.html', {
    variables: { title: 'Home' }
});

// Template path dinamis (function)
nexaRoute.registerTemplate('guides', (context) => {
    return context.subRoute 
        ? `docs/guides/${context.subRoute}.html`
        : 'docs/guides/index.html';
}, {
    variables: (context) => ({
        title: context.subRoute ? `Guide: ${context.subRoute}` : 'Guides'
    })
});

// Template path dengan object format
nexaRoute.registerTemplate('guides', {
    base: 'docs/guides/index.html',
    sub: 'docs/guides/{subRoute}.html'
});
```

**Parameters:**
- `route` (string): Nama route
- `templatePath` (string|Function|Object): 
  - String: Path template statis
  - Function: Function yang menerima context dan mengembalikan path
  - Object: `{ base: '...', sub: '...' }` untuk base dan sub-route
- `options` (object, optional):
  - `variables` (object|Function): Variables untuk template
  - `template` (string): Template name (default: `'theme'`)
  - `htmlOptions` (object): Options untuk html() method
  - `beforeLoad` (Function): Callback sebelum load
  - `afterLoad` (Function): Callback setelah load
  - `onError` (Function): Error handler

---

### NexaPage Methods

#### `registerTemplateRoute(route, templatePath, options)` ⭐ **NEW**

Mendaftarkan route dengan template path (wrapper untuk `nexaRoute.registerTemplate()`).

```javascript
const nexaPage = new NXUI.Page({...});
nexaPage.registerTemplateRoute('beranda', 'docs/beranda.html', {
    variables: { title: 'Home' }
});
```

#### `registerTemplateRoutes(routesConfig)` ⭐ **NEW**

Mendaftarkan multiple routes dengan template paths sekaligus.

```javascript
// Menggunakan Array
nexaPage.registerTemplateRoutes([
    { route: 'beranda', template: 'docs/beranda.html', options: {...} },
    { route: 'about', template: 'docs/about.html' }
]);

// Menggunakan Object
nexaPage.registerTemplateRoutes({
    'beranda': { template: 'docs/beranda.html', options: {...} },
    'about': { template: 'docs/about.html' }
});
```

### NXUI Global Object (Routing)

Setelah `NexaUI.js` di-load, object `NXUI` tersedia secara global untuk routing:

```javascript
// Routing
NXUI.NexaRoute      // NexaRoute class
NXUI.NexaPage       // NexaPage class
NXUI.Page           // Alias untuk NexaPage
```

---

## Contoh Penggunaan

### 1. Setup Basic Routing

**File: `templates/theme/app/App.js`**

```javascript
new NXUI.Page({
    pathname: "http://localhost/dev",
    containerId: 'main',
    appRoot: 'templates/theme/app',
    route: [
        'beranda',
        'about',
        'blog',
        'contact'
    ]
})
```

### 1b. Setup dengan Template-Based Routing ⭐ **NEW**

**File: `templates/theme/app/App.js`**

```javascript
new NXUI.Page({
    pathname: "http://localhost/dev",
    containerId: 'main',
    appRoot: 'templates/theme/app',
    route: [
        // Template-based routing (tidak perlu file beranda.js)
        {
            route: 'beranda',
            template: 'docs/fundamental/pengenalan-framework.html',
            options: {
                variables: {
                    title: 'Home Page',
                    description: 'Ini adalah halaman Home'
                }
            }
        },
        // String sederhana (akan mencari file about.js)
        'about',
        // Template dengan sub-route
        {
            route: 'guides',
            template: (context) => {
                return context.subRoute 
                    ? `docs/guides/${context.subRoute}.html`
                    : 'docs/guides/index.html';
            }
        }
    ]
})
```

### 2. Membuat Route Handler

**File: `templates/theme/app/about.js`**

```javascript
export async function about(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "About | App",
    description: "Tentang kami.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    container.innerHTML = `
        <h1>About Page</h1>
        <p>Welcome to About page!</p>
      `;
  });
}
```

### 3. Navigasi Programmatic

```javascript
// Navigate ke route
nx.nexaRoute.navigate('about');

// Navigate ke sub-route
nx.nexaRoute.navigate('guides/pengenalan');
```

### 4. Link di HTML

```html
<!-- Relative path -->
<a href="/about">About</a>

<!-- Full URL -->
<a href="http://localhost/dev/about">About</a>

<!-- Hash routing (optional) -->
<a href="#about">About</a>
```

---

## Best Practices

### 1. Struktur File

**Dengan Template-Based Routing:**
```
templates/theme/app/
├── App.js           # Konfigurasi routes (dengan template paths)
└── about.js         # Route handler untuk 'about' (jika diperlukan)
```

**Tanpa Template-Based Routing (Traditional):**
```
templates/theme/app/
├── App.js           # Konfigurasi routes
├── about.js         # Route handler untuk 'about'
├── blog.js          # Route handler untuk 'blog'
├── guides.js        # Route handler untuk 'guides' (dengan sub-routes)
└── contact.js       # Route handler untuk 'contact'
```

**Catatan:** Dengan template-based routing, Anda tidak perlu membuat file `.js` untuk route yang hanya menampilkan template HTML.

### 2. Naming Convention

- File route handler harus memiliki nama yang sama dengan route
- Function export harus memiliki nama yang sama dengan route
- Gunakan camelCase untuk route names (contoh: `contactData` untuk route `'contact/data'`)

### 3. DOM Manipulation

Selalu gunakan `requestAnimationFrame` untuk manipulasi DOM setelah render:

```javascript
route.register(page, async (routeName, container, routeMeta = {
  title: "Halaman",
  description: "",
}, style, nav = {}) => {
  route.routeMetaByRoute.set(page, routeMeta);
  container.innerHTML = '<div id="myElement">Content</div>';

  requestAnimationFrame(() => {
    const element = document.getElementById("myElement");
    // Manipulasi DOM di sini
  });
});
```

### 4. Sub-Routes

- Hanya register base route di `App.js`
- Gunakan parameter kelima **`nav`** (`baseRoute`, `subRoute`) pada callback `register` untuk menangani sub-routes
- Berikan navigasi kembali ke base route
- **Dengan template-based routing**: Gunakan function atau object format untuk template path dinamis

### 5. Error Handling

```javascript
export async function about(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "About",
    description: "",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    try {
      const data = await fetchData();
      container.innerHTML = `<h1>${data.title}</h1>`;
    } catch (error) {
      console.error("Error loading page:", error);
      container.innerHTML = `
          <div class="error">
            <p>Terjadi kesalahan saat memuat halaman.</p>
          </div>
        `;
    }
  });
}
```

### 6. Performance

- Gunakan lazy loading untuk route handlers yang besar
- Minimalkan manipulasi DOM
- Gunakan event delegation untuk event handlers

### 7. SEO Considerations

- Pastikan konten penting ada di HTML awal (untuk crawler)
- Untuk SPA, sinkronkan **`routeMeta`** dengan `setPageMeta` (atau setara) di callback **`onRoute`** NexaPage, dengan sumber **`routeInfo.routeMeta`** — diisi dari handler lewat `route.routeMetaByRoute.set(page, routeMeta)` atau argumen keempat `register`
- Pertimbangkan server-side rendering untuk halaman yang sangat bergantung pada SEO

---

## Troubleshooting

### Route tidak terdaftar

**Masalah**: Route handler tidak dipanggil

**Solusi**:
1. Pastikan file route handler ada di folder yang benar (`appRoot`)
2. Pastikan nama file sama dengan route name
3. Pastikan function export memiliki nama yang sama dengan route
4. Cek console untuk error messages

### Sub-route tidak bekerja

**Masalah**: Sub-route tidak terdeteksi

**Solusi**:
1. Pastikan handler menerima parameter kelima **`nav`** dan baca `nav.subRoute` / `nav.baseRoute`
2. Pastikan URL format benar: `/base-route/sub-route`

### Link tidak bekerja

**Masalah**: Klik link melakukan full page reload

**Solusi**:
1. Pastikan link menggunakan format yang didukung:
   - Relative: `/about`
   - Full URL: `http://localhost/dev/about`
   - Hash: `#about`
2. Pastikan `setupClickHandlers()` sudah dipanggil
3. Cek console untuk error messages

### Spinner tidak muncul

**Masalah**: Loading spinner tidak terlihat

**Solusi**:
1. Pastikan `spinner.enabled` tidak `false` di konfigurasi `NXUI.Page` (default aktif).
2. Pastikan **`NexaUI.js`** sudah dimuat sehingga `typeof window.NXUI.spinner === 'function'` — tanpa ini `showSpinner()` keluar diam-diam.
3. Untuk **`centerScreen: false`**, pastikan elemen `#containerId` (mis. `#main`) ada; spinner inline menempel pada container itu.
4. Handler route yang **sangat cepat** (tanpa `await` berarti): spinner tetap ditampilkan **sebelum** handler dijalankan; jika masih sulit terlihat, itu karena konten selesai hampir seketika — coba navigasi ke route yang memuat data async untuk memverifikasi.

**Catatan teknis**: Spinner untuk navigasi biasa (`spinnerDelay === 0`) dipanggil **sinkron** sebelum eksekusi handler agar sempat ter-render; penjadwalan hanya lewat `requestAnimationFrame` sebelumnya bisa membuat handler selesai lebih dulu sehingga overlay tidak terlihat.

---

## Changelog

### Version 2.2
- ✅ **Spinner navigasi** — `showSpinner()` dipanggil **sebelum** handler (sinkron bila tanpa delay) agar overlay/inline sempat tampil; sebelumnya penjadwalan `requestAnimationFrame` bisa membuat handler selesai lebih dulu sehingga spinner tidak terlihat.
- ✅ **Handler signature** — Callback `register` sekarang: `(routeName, container, routeMeta, style, nav)` dengan `nav = { baseRoute, subRoute }`
- ✅ **`routeMetaByRoute`** — Map meta per rute; dipakai oleh `onRoute` / event `nxui:routeChange` (field **`routeMeta`**)
- ✅ **`register(route, handler, style?, routeMeta?)`** — Argumen opsional keempat untuk meta statis; atau **`route.routeMetaByRoute.set(page, routeMeta)`** di awal handler (pola default `routeMeta = { title, description }`)
- ✅ **`registerTemplate`** — Handler internal membangun `context` dari `routeMeta` + `nav`

### Version 2.1 ⭐ **NEW**
- ✅ **Template-based routing** - Route dengan template path tanpa file `.js` manual
- ✅ **Dynamic template path** - Template path bisa berupa function atau object
- ✅ **Sub-route support untuk template** - Mendukung sub-route dengan template path dinamis
- ✅ **Dynamic variables** - Variables bisa berupa function yang menerima context
- ✅ **Multiple route registration** - Method `registerTemplateRoutes()` untuk register banyak route sekaligus

### Version 2.0
- ✅ Sub-routes support
- ✅ Event delegation untuk link dinamis
- ✅ Better error handling

---

## License

MIT License

---

## Support

Untuk pertanyaan atau bantuan, silakan buat issue di repository atau hubungi tim development.

