/* Gothic Vault service worker
 * - Precaches the app shell on install
 * - Runtime caches build assets, fonts, and R2 images with stale-while-revalidate
 * - Versioned cache name so a new deploy supersedes stale entries
 */
const VERSION = "v3-gv";
const STATIC_CACHE = `gv-static-${VERSION}`;
const RUNTIME_CACHE = `gv-runtime-${VERSION}`;
const IMAGE_CACHE = `gv-img-${VERSION}`;

const SHELL = ["/", "/favicon.ico", "/site.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function staleWhileRevalidate(req, cacheName) {
  return caches.open(cacheName).then((cache) =>
    cache.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && (res.type === "basic" || res.type === "cors")) {
            cache.put(req, res.clone()).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Never intercept Supabase API/edge-function calls (they manage their own caching/auth).
  if (url.hostname.endsWith(".supabase.co")) return;

  // Hashed build assets — cache-first, long-lived
  if (url.origin === self.location.origin && /\/assets\/.+\.(js|css|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, STATIC_CACHE));
    return;
  }

  // R2 / CDN images — SWR
  if (url.hostname.endsWith(".r2.dev") || /\.(?:png|jpe?g|webp|avif|svg|gif)(\?|$)/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, IMAGE_CACHE));
    return;
  }

  // Same-origin static (favicon, manifest)
  if (url.origin === self.location.origin && /\.(?:ico|webmanifest|png|svg)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req, RUNTIME_CACHE));
    return;
  }
});
