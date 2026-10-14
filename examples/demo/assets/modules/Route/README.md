# Dokumentasi NexaRoute & NexaUI

Dokumentasi lengkap untuk penggunaan NexaRoute (Client-Side Routing) dan NexaUI (UI Framework).

---

## Daftar Isi

1. [Pengenalan](#pengenalan)
2. [Instalasi & Setup](#instalasi--setup)
3. [Konfigurasi NexaPage](#konfigurasi-nexapage)
4. [Membuat Route Handler](#membuat-route-handler)
5. [Sub-Routes (Nested Routes)](#sub-routes-nested-routes)
6. [API Reference](#api-reference)
7. [Contoh Penggunaan](#contoh-penggunaan)
8. [Best Practices](#best-practices)

---

## Pengenalan

### NexaUI
NexaUI adalah framework UI yang menyediakan berbagai utility dan komponen untuk membangun aplikasi web modern. NexaUI menyediakan:
- **NexaRoute**: Client-side routing system
- **NexaPage**: Route manager dengan auto-registration
- **NexaDropdown**: Dropdown component
- **NexaDb**: IndexedDB wrapper
- **NexaKit**: DOM manipulation utilities
- **NexaGlobal**: Global state management
- **NexaFetch**: HTTP request wrapper

### NexaRoute
NexaRoute adalah sistem routing client-side yang memungkinkan navigasi tanpa reload halaman. Fitur utama:
- ✅ Client-side routing (SPA)
- ✅ Sub-routes support (nested routes)
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

### Full Configuration dengan Spinner

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
    ]
})
```

### Parameter Konfigurasi

| Parameter | Type | Default | Deskripsi |
|-----------|------|---------|-----------|
| `pathname` | string | - | **Wajib.** Base URL aplikasi (contoh: "http://localhost/dev") |
| `containerId` | string | `'main'` | ID container element untuk menampilkan konten |
| `appRoot` | string | `'theme/app'` | Path relatif ke folder route handlers |
| `spinner` | object | `{...}` | Konfigurasi loading spinner |
| `route` | array | `[]` | Daftar nama routes yang akan diregister |

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
    route.register(page, async (routeName, container) => {
      console.log('📍 Navigating to:', routeName);
      container.innerHTML = `
        <h1>About Page</h1>
        <p>Ini adalah halaman About.</p>
        <p>Route: ${routeName}</p>
      `;
    });
}
```

### Parameter Handler Function

Handler function menerima 3 parameter:

1. **`routeName`** (string): Nama route lengkap yang sedang diakses
2. **`container`** (HTMLElement): Container element untuk menampilkan konten
3. **`routeInfo`** (object, optional): Informasi tentang route
   - `baseRoute`: Route dasar (tanpa sub-route)
   - `subRoute`: Sub-route jika ada

### Contoh Route Handler dengan Form

**File: `templates/theme/app/contact.js`**

```javascript
export async function contact(page, route) {
    route.register(page, async (routeName, container) => {
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
      
      // Setup form handler setelah DOM ter-render
      requestAnimationFrame(() => {
        const form = document.getElementById('contactForm');
        if (form) {
          form.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            console.log('Form data:', Object.fromEntries(formData));
            // Handle form submission
          });
        }
      });
    });
}
```

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
    route.register(page, async (routeName, container, routeInfo = {}) => {
      // Parse route info untuk mendapatkan sub-route
      const baseRoute = routeInfo.baseRoute || page;
      const subRoute = routeInfo.subRoute || null;
      
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

3. **Handler Execution**: Handler untuk base route akan dipanggil untuk semua sub-routes, dengan informasi sub-route di parameter `routeInfo`.

---

## Route `workspace/*` — kolom konten terpisah dari container penuh

Fitur **opsional** untuk aplikasi shell dengan kolom konten utama yang
harus tetap dikelilingi UI lain (sidebar, tab strip, titlebar) — mis. IDE,
dashboard, admin panel. Tanpa fitur ini, SETIAP navigasi mengganti isi
`containerId` sepenuhnya; `workspace/*` mengganti HANYA satu kolom di
dalamnya, shell di sekitarnya tetap utuh.

### Kontrak

Beri satu elemen di shell (halaman yang dirender ke `containerId` utama,
biasanya route pertama/`beranda`) atribut `data-nx-main="workspace"`:

```html
<!-- di dalam handler route shell, mis. templates/theme/app/beranda.js -->
<div class="app-shell">
  <aside id="sidebar">...</aside>
  <div id="nx-workspace-main" data-nx-main="workspace"></div>
</div>
```

Lalu register/navigate route dengan prefix `workspace/`:

```javascript
// templates/theme/app/settings.js
export async function settings(page, route) {
  route.register(page, async (routeName, container) => {
    container.innerHTML = `<h1>Settings</h1>`; // container = elemen [data-nx-main="workspace"]
  });
}
```

```javascript
window.NXUI.load('workspace/settings');
// atau
window.nexaRoute.navigate('workspace/settings', false);
```

`isWorkspaceRoute('workspace/settings')` → `true` (prefix `workspace/` +
minimal 1 segmen setelahnya) → `renderContainer` di dalam `navigate()`
memakai `document.querySelector('[data-nx-main="workspace"]')` alih-alih
`this.container` — sidebar/titlebar di sekitarnya TIDAK ikut dirender
ulang. Route TANPA prefix ini (`about`, `contact/data`, dst.) tidak
terpengaruh sama sekali.

### Refresh langsung ke `workspace/*` (deep link / restore IndexedDB)

Kalau route TERAKHIR yang tersimpan (refresh, atau tautan langsung ke
`#workspace/settings`) adalah rute `workspace/*`, kolom `[data-nx-main=
"workspace"]` **belum ada di DOM** — shell-nya (yang memuat elemen itu)
belum pernah dirender. `performNavigation()` mendeteksi kasus ini dan
menavigasi ke shell dulu sebelum mengisi kolom:

- Shell yang dipakai: `window.nexaPage.workspaceShell` (string, override
  eksplisit) kalau di-set, atau **route pertama yang terdaftar** di
  `App.js` sebagai fallback.
- Set `window.nexaPage.workspaceShell = 'beranda'` sebelum `new
  NXUI.Page(...)` kalau shell aplikasi BUKAN route pertama dalam daftar
  `route: [...]`.

Tanpa penanganan ini, refresh saat berada di rute `workspace/*` akan
merender kontennya ke `this.container` biasa — MENGGANTI seluruh halaman,
sidebar dan konten lain ikut hilang, persis seperti route tanpa kolom
workspace sama sekali.

### Kapan TIDAK relevan

Aplikasi tanpa elemen `[data-nx-main="workspace"]` di DOM tidak
terpengaruh — `workspaceMainEl()` mengembalikan `null`, `renderContainer`
otomatis jatuh ke `this.container` seperti route biasa. Fitur ini murni
aditif dan aman dipakai di semua project baru lewat CLI `nxdom` tanpa
mengubah perilaku project yang tidak memakainya.

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

##### `register(route, handler)`

Mendaftarkan handler untuk route tertentu.

```javascript
route.register('about', async (routeName, container) => {
    container.innerHTML = '<h1>About Page</h1>';
});
```

**Parameters:**
- `route` (string): Nama route
- `handler` (function): Function yang akan dipanggil saat route diakses
  - `routeName` (string): Nama route lengkap
  - `container` (HTMLElement): Container element
  - `routeInfo` (object, optional): Informasi route (baseRoute, subRoute)

##### `navigate(route, pushState)`

Navigasi ke route tertentu secara programmatic.

```javascript
window.nexaRoute.navigate('about');
window.nexaRoute.navigate('guides/pengenalan');
```

**Parameters:**
- `route` (string): Nama route (bisa dengan sub-route)
- `pushState` (boolean): Push ke history (default: `true`)

##### `getCurrentRoute()`

Mendapatkan route yang sedang aktif.

```javascript
const currentRoute = window.nexaRoute.getCurrentRoute();
console.log(currentRoute); // 'about' atau 'guides/pengenalan'
```

##### `buildUrl(route)`

Membangun full URL dari route.

```javascript
const url = window.nexaRoute.buildUrl('about');
console.log(url); // '/dev/about'
```

##### `getRouteFromPath(pathname)`

Mendapatkan route dari pathname.

```javascript
const route = window.nexaRoute.getRouteFromPath('/dev/guides/pengenalan');
console.log(route); // 'guides/pengenalan'
```

---

### NXUI Global Object

Setelah `NexaUI.js` di-load, object `NXUI` tersedia secara global.

#### Available Properties

```javascript
// Routing
NXUI.NexaRoute      // NexaRoute class
NXUI.NexaPage       // NexaPage class
NXUI.Page           // Alias untuk NexaPage

// Components
NXUI.NexaDropdown   // NexaDropdown class
NXUI.Dropdown       // Alias untuk NexaDropdown

// Utilities
NXUI.NexaDb         // NexaDb class
NXUI.Storage        // Storage utility
NXUI.NexaFetch      // HTTP request wrapper
NXUI.nexaFetch      // HTTP request function
NXUI.spinner        // Spinner utility
NXUI.NexaGlobal     // Global state management
NXUI.NexaKit      // DOM manipulation utilities

// Shorthand methods
NXUI.id(selector)           // Get element by ID
NXUI.class(className)       // Get elements by class
NXUI.selector(cssSelector)  // Query selector
NXUI.html(selector, value)  // Get/set HTML
```

#### Contoh Penggunaan

```javascript
// Get element by ID
const element = NXUI.id('myElement');

// Get elements by class
const elements = NXUI.class('myClass');

// Query selector
const element = NXUI.selector('#myElement');

// Set HTML
NXUI.html('#myElement', '<p>Hello World</p>');

// Get HTML
const html = NXUI.html('#myElement');
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

### 2. Membuat Route Handler

**File: `templates/theme/app/about.js`**

```javascript
export async function about(page, route) {
    route.register(page, async (routeName, container) => {
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
window.nexaRoute.navigate('about');

// Navigate ke sub-route
window.nexaRoute.navigate('guides/pengenalan');
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

### 5. Menggunakan NXUI Utilities

```javascript
// Di dalam route handler
export async function about(page, route) {
    route.register(page, async (routeName, container) => {
      container.innerHTML = `
        <div id="content">
          <h1>About Page</h1>
        </div>
      `;
      
      // Manipulasi DOM setelah render
      requestAnimationFrame(() => {
        const content = NXUI.id('content');
        if (content && content.element) {
          content.setStyle('color', 'blue');
        }
      });
    });
}
```

---

## Best Practices

### 1. Struktur File

```
templates/theme/app/
├── App.js           # Konfigurasi routes
├── about.js         # Route handler untuk 'about'
├── blog.js          # Route handler untuk 'blog'
├── guides.js        # Route handler untuk 'guides' (dengan sub-routes)
└── contact.js       # Route handler untuk 'contact'
```

### 2. Naming Convention

- File route handler harus memiliki nama yang sama dengan route
- Function export harus memiliki nama yang sama dengan route
- Gunakan camelCase untuk route names (contoh: `contactData` untuk route `'contact/data'`)

### 3. DOM Manipulation

Selalu gunakan `requestAnimationFrame` untuk manipulasi DOM setelah render:

```javascript
route.register(page, async (routeName, container) => {
  container.innerHTML = '<div id="myElement">Content</div>';
  
  // Tunggu DOM ter-update
  requestAnimationFrame(() => {
    const element = document.getElementById('myElement');
    // Manipulasi DOM di sini
  });
});
```

### 4. Sub-Routes

- Hanya register base route di `App.js`
- Gunakan parameter `routeInfo` untuk menangani sub-routes
- Berikan navigasi kembali ke base route

### 5. Error Handling

```javascript
export async function about(page, route) {
    route.register(page, async (routeName, container) => {
      try {
        // Load data
        const data = await fetchData();
        container.innerHTML = `<h1>${data.title}</h1>`;
      } catch (error) {
        console.error('Error loading page:', error);
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

- Pastikan konten penting ada di HTML awal (untuk SEO)
- Gunakan proper meta tags
- Pertimbangkan server-side rendering untuk halaman penting

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
1. Pastikan handler menerima parameter ketiga `routeInfo`
2. Cek apakah `routeInfo.subRoute` ada
3. Pastikan URL format benar: `/base-route/sub-route`

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
1. Pastikan `spinner.enabled: true` di konfigurasi
2. Cek apakah `NXUI.spinner` tersedia
3. Pastikan container element ada dan terlihat

---

## Changelog

### Version 2.0
- ✅ Sub-routes support
- ✅ Event delegation untuk link dinamis
- ✅ Improved dropdown integration
- ✅ Better error handling

---

## License

MIT License

---

## Support

Untuk pertanyaan atau bantuan, silakan buat issue di repository atau hubungi tim development.

