/**
 * Memperbarui <title> dan meta di <head> dari klien (setelah navigasi SPA).
 * Skema mengikuti template server: templates/theme/header.html (Primary, OG, Twitter, itemprop).
 * Crawler / pratinjau sosial bisa tetap melihat HTML awal — untuk SEO penuh perlu SSR/prerender.
 */

function findMeta(attr, key) {
  const metas = document.head.querySelectorAll("meta");
  for (const m of metas) {
    if (m.getAttribute(attr) === key) {
      return m;
    }
  }
  return null;
}

function ensureMetaByAttribute(attr, key, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  let el = findMeta(attr, key);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", String(value));
}

function ensureMetaItemprop(prop, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  let el = document.head.querySelector(`meta[itemprop="${prop}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("itemprop", prop);
    document.head.appendChild(el);
  }
  el.setAttribute("content", String(value));
}

/**
 * @param {object} opts
 * @param {string} [opts.title] — &lt;title&gt;, meta name="title", OG/Twitter title
 * @param {string} [opts.description] — meta description, OG, Twitter, itemprop
 * @param {string} [opts.keywords] — meta name="keywords"
 * @param {string} [opts.appName] — author, og:site_name, apple-mobile-web-app-title
 * @param {string} [opts.robots] — default "index, follow"
 * @param {string} [opts.language] — default "Indonesian"
 * @param {string} [opts.revisitAfter] — default "7 days"
 * @param {string} [opts.canonical] — link rel="canonical"
 * @param {string} [opts.ogType] — default "website"
 * @param {string} [opts.ogTitle] — default ke title
 * @param {string} [opts.ogDescription] — default ke description
 * @param {string} [opts.ogImage] — URL absolut disarankan
 * @param {string|number} [opts.ogImageWidth] — default 1200
 * @param {string|number} [opts.ogImageHeight] — default 630
 * @param {string} [opts.ogUrl] — default location.href
 * @param {string} [opts.ogLocale] — default "id_ID"
 * @param {string} [opts.twitterCard] — default "summary_large_image"
 * @param {string} [opts.twitterUrl] — default ke ogUrl
 * @param {string} [opts.twitterTitle] — default ke ogTitle
 * @param {string} [opts.twitterDescription] — default ke ogDescription
 * @param {string} [opts.twitterImage] — default ke ogImage
 * @param {string} [opts.themeColor] — meta theme-color, default "#2563eb"
 */
export function setPageMeta(opts = {}) {
  const {
    title,
    description,
    keywords,
    appName,
    robots = "index, follow",
    language = "Indonesian",
    revisitAfter = "7 days",
    canonical,
    ogType = "website",
    ogTitle,
    ogDescription,
    ogImage,
    ogImageWidth = 1200,
    ogImageHeight = 630,
    ogUrl,
    ogLocale = "id_ID",
    twitterCard = "summary_large_image",
    twitterUrl,
    twitterTitle,
    twitterDescription,
    twitterImage,
    themeColor = "#2563eb",
  } = opts;

  const ogT = ogTitle ?? title;
  const ogD = ogDescription ?? description;
  const ogU =
    ogUrl ?? (typeof location !== "undefined" ? location.href : "");
  const twU = twitterUrl ?? ogU;
  const twT = twitterTitle ?? ogT;
  const twD = twitterDescription ?? ogD;
  const twI = twitterImage ?? ogImage;

  if (title != null && title !== "") {
    document.title = title;
  }

  /* Primary — sejajar header.html */
  ensureMetaByAttribute("name", "title", title);
  ensureMetaByAttribute("name", "description", description);
  ensureMetaByAttribute("name", "keywords", keywords);
  if (appName) {
    ensureMetaByAttribute("name", "author", appName);
  }
  ensureMetaByAttribute("name", "robots", robots);
  ensureMetaByAttribute("name", "language", language);
  ensureMetaByAttribute("name", "revisit-after", revisitAfter);

  /* Open Graph */
  ensureMetaByAttribute("property", "og:type", ogType);
  ensureMetaByAttribute("property", "og:url", ogU);
  ensureMetaByAttribute("property", "og:title", ogT);
  ensureMetaByAttribute("property", "og:description", ogD);
  if (ogImage) {
    ensureMetaByAttribute("property", "og:image", ogImage);
  }
  ensureMetaByAttribute("property", "og:image:width", String(ogImageWidth));
  ensureMetaByAttribute("property", "og:image:height", String(ogImageHeight));
  if (appName) {
    ensureMetaByAttribute("property", "og:site_name", appName);
  }
  ensureMetaByAttribute("property", "og:locale", ogLocale);

  /* Twitter Card */
  ensureMetaByAttribute("name", "twitter:card", twitterCard);
  ensureMetaByAttribute("name", "twitter:url", twU);
  ensureMetaByAttribute("name", "twitter:title", twT);
  ensureMetaByAttribute("name", "twitter:description", twD);
  if (twI) {
    ensureMetaByAttribute("name", "twitter:image", twI);
  }

  /* Additional (PWA-ish) */
  ensureMetaByAttribute("name", "theme-color", themeColor);
  ensureMetaByAttribute("name", "apple-mobile-web-app-capable", "yes");
  ensureMetaByAttribute(
    "name",
    "apple-mobile-web-app-status-bar-style",
    "black-translucent"
  );
  if (appName) {
    ensureMetaByAttribute("name", "apple-mobile-web-app-title", appName);
  }

  /* Schema.org helpers (microdata) */
  ensureMetaItemprop("name", title);
  ensureMetaItemprop("description", description);

  if (canonical) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      document.head.appendChild(link);
    }
    link.setAttribute("href", canonical);
  }
}
