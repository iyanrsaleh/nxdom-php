// Export function untuk route 'contact/data' (menjadi 'contact_data.js')
export async function about(page, route) {
  route.register(page, async (routeName, container, routeMeta = {
    title: "Contact Data | App",
    description: "Data kontak.",
  }, style, nav = {}) => {
    route.routeMetaByRoute.set(page, routeMeta);
    console.log("📍 Navigating to:", NEXA);
    container.innerHTML = `
        <article class="nx-page">
          <h1 class="nx-page__title">Contact Data Page</h1>
          <p class="nx-page__lead">Ini adalah halaman Contact Data.</p>
          <p class="nx-page__meta"><span class="nx-page__label">Route:</span> ${routeName}</p>
          <p class="nx-page__meta"><span class="nx-page__label">Title:</span> ${routeMeta.title || "—"}</p>
          <p class="nx-page__meta"><span class="nx-page__label">Description:</span> ${routeMeta.description || "—"}</p>
          <section class="nx-page__section" aria-labelledby="about-contact-heading">
            <h2 id="about-contact-heading" class="nx-page__subtitle">Contact Information</h2>
            <p>Data kontak akan ditampilkan di sini.</p>
          </section>
        </article>
      `;
  });
}
