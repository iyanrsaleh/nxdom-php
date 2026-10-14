// Export function untuk route 'blog'
const DEFAULT_BLOG_META = {
  title: "Blog | devjs",
  description: "Artikel blog.",
};

export async function blog(page, route) {
  route.register(page, async (routeName, container, routeMeta = DEFAULT_BLOG_META, style, nav = {}) => {
    console.log("📍 Navigating to:", routeName, routeMeta, nav);
    // baseRoute / subRoute dari argumen ke-5 (bukan routeMeta)
    const baseRoute = nav.baseRoute || page;
    const subRoute = nav.subRoute != null && nav.subRoute !== '' ? nav.subRoute : null;

    // Jika ada sub-route, tampilkan konten sub-route (sama pola seperti posdip/templates/assets/berita.js)
    if (subRoute) {

      const d = NXUI.findBySlug(await NXUI.Storage().get(NEXA.typicode), subRoute, { pubdate: "02/07/2026", prefix: "berita" });
      if (d) {
        route.routeMetaByRoute.set(page, {
          title: `${d.title} | devjs`,
          description: `Album ${d.albumId || "-"} - Photo ${d.id || "-"}`,
        });
      } else {
        route.routeMetaByRoute.set(page, { ...DEFAULT_BLOG_META });
      }

      container.innerHTML = `
          <article class="nx-page">
            <h1 class="nx-page__title">${d ? d.title : "Artikel tidak ditemukan"}</h1>
            ${d?.thumbnailUrl ? `<p class="nx-page__lead"><strong>Thumbnail:</strong> ${d.thumbnailUrl}</p>` : ""}
            ${d?.albumId ? `<p class="nx-page__lead"><strong>Album:</strong> ${d.albumId}</p>` : ""}
            <p class="nx-page__meta"><span class="nx-page__label">Route:</span> ${routeName}</p>
            <p class="nx-page__meta"><span class="nx-page__label">Slug:</span> ${subRoute}</p>
            <hr class="nx-page__rule" />
            <nav class="nx-page__nav">
              <a href="/blog">← Kembali ke blog</a>
            </nav>
          </article>
        `;
    } else {
      route.routeMetaByRoute.set(page, { ...DEFAULT_BLOG_META });
      const items = await NXUI.Storage().get(NEXA.typicode);
      container.innerHTML = `
          <article class="nx-page">
            <h1 class="nx-page__title">Guides Page</h1>
            <p class="nx-page__lead">Ini adalah halaman Guides.</p>
            <p class="nx-page__meta"><span class="nx-page__label">Route:</span> ${routeName}</p>
            <div class="nx-page__blog-list">
              ${items.map((item) => {
                const slug = NXUI.createSlug('02/07/2026', item.title, item.id, "berita");
                return `
                <article class="nx-page__blog-card">
                  <a class="nx-page__blog-card-title" href="/blog/${slug}">${item.title}</a>
                </article>`;
              }).join("")}
            </div>
            <hr class="nx-page__rule" />
            <h2 class="nx-page__subtitle">Daftar Sub-Routes</h2>
            <p class="nx-page__hint">Buka artikel lewat tautan di atas.</p>
          </article>
        `;
    }
  });
}

