export interface Env {
  ASSETS: Fetcher;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_R2_PUBLIC_BASE_URL?: string;
}

import { renderStorefront, SSR_BUILD_ID } from "../dist-ssr/entry-server.js";
import { heroImageAttrs, HERO_MOBILE_QUERY, cdnImageAttrs, PDP_MAIN_IMAGE_SIZES } from "../src/lib/imageUrls";

// Hard-coded fallback so /sitemap.xml works even before env vars are wired.
const DEFAULT_SUPABASE_URL = "https://pyzjuxdznayzenxjpiea.supabase.co";

const SITEMAP_HEADERS: Record<string, string> = {
  "Content-Type": "application/xml; charset=utf-8",
  // Cache at the edge for 5 min so admin edits propagate quickly while still
  // shielding the Supabase function from crawler bursts.
  "Cache-Control": "public, max-age=60, s-maxage=300",
  "X-Robots-Tag": "noindex",
};

async function proxySitemap(env: Env): Promise<Response> {
  const base = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const upstream = `${base}/functions/v1/sitemap`;
  try {
    const res = await fetch(upstream, {
      method: "GET",
      headers: { "Accept": "application/xml" },
      // Cloudflare-side caching of the upstream response.
      cf: { cacheTtl: 300, cacheEverything: true } as RequestInitCfProperties,
    });
    if (!res.ok) {
      return new Response(`Sitemap upstream error: ${res.status}`, {
        status: 502,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const body = await res.text();
    return new Response(body, { status: 200, headers: SITEMAP_HEADERS });
  } catch (err) {
    return new Response(`Sitemap proxy failure: ${(err as Error).message}`, {
      status: 502,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}


// ── Public storefront API, cached at the Cloudflare edge ────────────────────
// The public-* edge functions run in Supabase's Seoul region, ~1 s away from
// shoppers in Bangladesh. The Worker serves them from Cloudflare's local edge
// cache instead and refreshes in the background (stale-while-revalidate), so
// almost every visitor gets the storefront data in a few milliseconds.
const PUBLIC_FUNCTIONS = new Set(["public-home", "public-layout", "public-shop", "public-product"]);
const EDGE_FRESH_SECONDS: Record<string, number> = {
  "public-home": 120,
  "public-layout": 300,
  "public-shop": 120,
  "public-product": 120,
};
const EDGE_KEEP_SECONDS = 86400; // serve stale up to a day while refreshing
const STORED_AT = "x-kovo-stored-at";
const STORED_VERSION = "x-kovo-content-version";

// ── Storefront content version ─────────────────────────────────────────────
// A database trigger bumps public.storefront_version on every write to a table
// the public-* functions read (shop settings, products, homepage, …). A cached
// copy stored under an older version is never served.
//
// The version itself is kept in this data centre's edge cache, so requests
// read it locally instead of waiting on Supabase (Seoul):
//  - under VERSION_FRESH_MS old: used as is;
//  - up to VERSION_MAX_STALE_MS old (hours): used, and refreshed in the background;
//  - older or missing: refreshed before answering.
// Admin saves also POST /api/public/_refresh, which refreshes it at once, so
// the admin's next page view already shows the change.
const VERSION_FRESH_MS = 5000;
// Long, so a quiet data centre never makes a visitor wait on Supabase: the
// stale value is used once while a fresh one is fetched in the background.
// (Admin saves refresh it at once via /api/public/_refresh.)
const VERSION_MAX_STALE_MS = 6 * 3600 * 1000;
const VERSION_PATH = "/api/public/_content-version";
// Per-isolate copy of the resolved value only: a Worker request may not await
// a fetch that another request started, so promises are never shared.
let versionMemo: { value: string | null; at: number } = { value: null, at: 0 };

async function readContentVersion(env: Env): Promise<string | null> {
  const base = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(`${base}/rest/v1/storefront_version?id=eq.1&select=version`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ version: number | string }>;
    return rows?.[0]?.version != null ? String(rows[0].version) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function versionKey(origin: string): Request {
  return new Request(`${origin}${VERSION_PATH}`, { method: "GET" });
}

/** Reads the version from Supabase and stores it in this data centre's cache. */
async function refreshContentVersion(env: Env, origin: string): Promise<string | null> {
  const v = await readContentVersion(env);
  if (v) {
    versionMemo = { value: v, at: Date.now() };
    await caches.default.put(
      versionKey(origin),
      new Response(v, { headers: { "Cache-Control": "public, max-age=86400", [STORED_AT]: String(Date.now()) } }),
    ).catch(() => undefined);
  }
  return v ?? versionMemo.value;
}

/** Current content version; null if unknown (then cached copies are trusted by age). */
async function contentVersion(env: Env, ctx: ExecutionContext, origin: string): Promise<string | null> {
  const now = Date.now();
  if (versionMemo.value && now - versionMemo.at < VERSION_FRESH_MS) return versionMemo.value;
  try {
    const cached = await caches.default.match(versionKey(origin));
    if (cached) {
      const at = Number(cached.headers.get(STORED_AT) || 0);
      const value = await cached.text();
      const age = now - at;
      if (age < VERSION_FRESH_MS) {
        versionMemo = { value, at };
        return value;
      }
      if (age < VERSION_MAX_STALE_MS) {
        ctx.waitUntil(refreshContentVersion(env, origin).catch(() => undefined));
        return value;
      }
    }
    return await refreshContentVersion(env, origin);
  } catch {
    return versionMemo.value;
  }
}

/** True if a cached copy was stored under an older content version. */
function isOutdated(cached: Response, current: string | null): boolean {
  if (!current) return false;
  return cached.headers.get(STORED_VERSION) !== current;
}

async function fetchUpstream(env: Env, fn: string, search: string): Promise<Response> {
  const base = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  return fetch(`${base}/functions/v1/${fn}${search}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
}

async function storeInCache(cache: Cache, cacheKey: Request, upstream: Response, version: string | null): Promise<Response> {
  const body = await upstream.arrayBuffer();
  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${EDGE_KEEP_SECONDS}`,
    [STORED_AT]: String(Date.now()),
  });
  if (version) headers.set(STORED_VERSION, version);
  await cache.put(cacheKey, new Response(body, { status: 200, headers }));
  return new Response(body, { status: 200, headers });
}

function clientResponse(res: Response, state: string): Response {
  const headers = new Headers(res.headers);
  headers.delete(STORED_AT);
  headers.delete(STORED_VERSION);
  // Browsers revalidate every time (the edge answers in milliseconds), so a
  // visitor never keeps showing data the admin has already changed.
  headers.set("Cache-Control", "no-cache");
  headers.set("X-Kovo-Cache", state);
  return new Response(res.body, { status: res.status, headers });
}

async function proxyPublicApi(env: Env, ctx: ExecutionContext, fn: string, url: URL): Promise<Response> {
  const cache = caches.default;
  // Normalise the key: same function + same query → same cached copy.
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const cacheKey = new Request(`${url.origin}/api/public/${fn}${search}`, { method: "GET" });

  const [cached, version] = await Promise.all([cache.match(cacheKey), contentVersion(env, ctx, url.origin)]);
  if (cached && !isOutdated(cached, version)) {
    const storedAt = Number(cached.headers.get(STORED_AT) || 0);
    const ageSeconds = (Date.now() - storedAt) / 1000;
    if (ageSeconds > (EDGE_FRESH_SECONDS[fn] ?? 120)) {
      ctx.waitUntil(
        fetchUpstream(env, fn, search)
          .then((r) => (r.ok ? storeInCache(cache, cacheKey, r, version) : undefined))
          .catch(() => undefined),
      );
      return clientResponse(cached, "STALE");
    }
    return clientResponse(cached, "HIT");
  }

  // No copy, or the admin changed something since it was stored: fetch now.
  const upstream = await fetchUpstream(env, fn, search).catch(() => null);
  if (!upstream || !upstream.ok) {
    // Supabase unreachable: an outdated copy beats an error page.
    if (cached) return clientResponse(cached, "OUTDATED");
    return new Response(upstream ? upstream.body : '{"error":"upstream unreachable"}', {
      status: upstream ? upstream.status : 502,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const fresh = await storeInCache(cache, cacheKey, upstream, version);
  return clientResponse(fresh, "MISS");
}

// ── Storefront HTML with its data inlined ──────────────────────────────────
// Like a server-rendered shop, the page arrives with the data its first
// screen needs (from the edge cache only, never waiting on Supabase) and a
// preload for the hero photo, so the browser starts that download at once.
function routeData(pathname: string): { fn: string; search: string }[] {
  const out = [{ fn: "public-layout", search: "" }];
  if (pathname === "/") out.push({ fn: "public-home", search: "" });
  else if (pathname === "/shop") out.push({ fn: "public-shop", search: "" });
  else {
    const m = pathname.match(/^\/product\/([^/]+)\/?$/);
    if (m) {
      const q = new URLSearchParams();
      q.set("slug", decodeURIComponent(m[1]));
      out.push({ fn: "public-product", search: `?${q.toString()}` });
    }
  }
  return out;
}

/**
 * Cached JSON text for a public function, or null on a miss or when the copy
 * predates the latest admin change (refreshed in the background; the app then
 * fetches it from /api/public itself, which waits for the fresh copy).
 */
async function cachedPublicText(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  fn: string,
  search: string,
  version: string | null,
): Promise<string | null> {
  const cache = caches.default;
  const cacheKey = new Request(`${origin}/api/public/${fn}${search}`, { method: "GET" });
  const cached = await cache.match(cacheKey);
  const refresh = () =>
    ctx.waitUntil(
      fetchUpstream(env, fn, search)
        .then((r) => (r.ok ? storeInCache(cache, cacheKey, r, version) : undefined))
        .catch(() => undefined),
    );
  if (!cached || isOutdated(cached, version)) { refresh(); return null; }
  const ageSeconds = (Date.now() - Number(cached.headers.get(STORED_AT) || 0)) / 1000;
  if (ageSeconds > (EDGE_FRESH_SECONDS[fn] ?? 120)) refresh();
  return cached.text();
}

function heroPreloads(homeJson: string, layoutJson: string | null): string {
  try {
    const slides = JSON.parse(homeJson)?.data?.heroSlides ?? [];
    const settings = JSON.parse(homeJson)?.data?.heroSettings;
    if (!slides.length || (settings && settings.enabled === false) || settings?.hero_type === "video_hero") return "";
    const r2Base = layoutJson ? String(JSON.parse(layoutJson)?.data?.r2PublicBaseUrl || "") : "";
    // One inline script picks the phone or desktop image and preloads only
    // that one (Chrome was fetching both when using <link media=…>).
    const pick = (isMobile: boolean) => {
      const a = heroImageAttrs(slides[0], isMobile, r2Base);
      return a ? { href: a.src, srcset: a.srcSet || "", sizes: a.sizes } : null;
    };
    const options = { q: HERO_MOBILE_QUERY, m: pick(true), d: pick(false) };
    if (!options.m && !options.d) return "";
    const json = JSON.stringify(options).replace(/</g, "\\u003c");
    return (
      `<script>(function(o){try{var a=matchMedia(o.q).matches?o.m:o.d;if(!a)return;` +
      `var l=document.createElement("link");l.rel="preload";l.as="image";l.href=a.href;` +
      `if(a.srcset){l.imageSrcset=a.srcset;l.imageSizes=a.sizes;}l.fetchPriority="high";` +
      `document.head.appendChild(l);}catch(e){}})(${json})</script>`
    );
  } catch {
    return "";
  }
}

/** Preload for the product page's main photo, so it downloads while the app boots. */
function productPreload(productJson: string, layoutJson: string | null): string {
  try {
    const data = JSON.parse(productJson)?.data;
    const first = (data?.product?.images ?? []).find((s: unknown) => typeof s === "string" && s.trim());
    // A variant with its own photo may replace the first image once the app
    // picks the default variant; don't preload a photo that might not show.
    const variantPhotos = (data?.variants ?? []).some((v: { image_url?: string | null }) => !!v?.image_url);
    if (!first || variantPhotos) return "";
    const r2Base = layoutJson ? String(JSON.parse(layoutJson)?.data?.r2PublicBaseUrl || "") : "";
    const a = cdnImageAttrs(first, r2Base);
    if (!a) return "";
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    return (
      `<link rel="preload" as="image" fetchpriority="high" href="${esc(a.src)}"` +
      (a.srcSet ? ` imagesrcset="${esc(a.srcSet)}" imagesizes="${esc(PDP_MAIN_IMAGE_SIZES)}"` : "") +
      `>`
    );
  } catch {
    return "";
  }
}

// ── Server-side rendering ──────────────────────────────────────────────────
// Home, shop and product pages arrive with their HTML already rendered
// (src/entry-server.tsx), so text and layout show before any JavaScript runs;
// the browser then hydrates that HTML (src/main.tsx).
//
// A visitor never waits for a render: pages are rendered in the background
// (after the response is sent) and kept in this data centre's edge cache per
// content version, together with the exact data they were rendered from. That
// data is what gets embedded in the page, so the browser's first render
// matches the HTML. Until a render is cached, or if rendering fails, the page
// is served as before (browser-rendered).
const SSR_PREFIX = "/__kovo/ssr";
// Re-render (in the background) after this long even without an admin
// change, like the data itself, so time-based content (offers) stays current.
const SSR_FRESH_SECONDS = 120;

interface SsrEntry {
  html: string;
  texts: (string | null)[];
  /** For an empty entry: "rendering" (started; still there means it was stopped, e.g. CPU limit) or "failed: …". */
  note?: string;
}

/**
 * The location to render (path plus the query parameters that change the
 * first render), or null if this URL should not be server-rendered. Only
 * known values are accepted, so arbitrary query strings cannot create
 * unlimited renders.
 */
function ssrLocation(url: URL, layoutJson: string | null): string | null {
  const path = url.pathname;
  if (path === "/") return "/";
  if (/^\/product\/[^/]+$/.test(path)) return path;
  if (path !== "/shop") return null;
  // Shop reads ?category= and ?brand= on first render (q is applied later).
  const category = url.searchParams.get("category");
  const brand = url.searchParams.get("brand");
  if (!category && !brand) return "/shop";
  try {
    const layout = layoutJson ? JSON.parse(layoutJson)?.data : null;
    const known = (list: Array<{ name?: string; slug?: string }> | undefined, v: string | null) =>
      !v || (list ?? []).some((x) => x?.name === v || x?.slug === v);
    if (!known(layout?.categories, category) || !known(layout?.brands, brand)) return null;
  } catch {
    return null;
  }
  const q = new URLSearchParams();
  if (category) q.set("category", category);
  if (brand) q.set("brand", brand);
  return `/shop?${q.toString()}`;
}

/**
 * Phone or not, from the request headers. The hero renders a different layout
 * on phones, and the server cannot measure the screen, so it renders (and
 * caches) a phone and a desktop version; the browser starts hydration with
 * the same answer (src/lib/viewportHint.tsx). Tablets count as desktop, which
 * matches the hero's (max-width: 767px) breakpoint.
 */
function isPhone(request: Request): boolean {
  const hint = request.headers.get("sec-ch-ua-mobile");
  if (hint === "?1") return true;
  if (hint === "?0") return false;
  const ua = request.headers.get("user-agent") || "";
  return /iPhone|iPod|Android.+Mobile|Mobi/i.test(ua) && !/iPad|Tablet/i.test(ua);
}

/**
 * Cache key for a render. `build` ties it to this deploy: the page shell's
 * ETag (changes with the browser JavaScript) plus the server bundle's build
 * ID, so HTML rendered by an earlier deploy is never hydrated by this one.
 */
function ssrKey(origin: string, location: string, phone: boolean, build: string): Request {
  const sep = location.includes("?") ? "&" : "?";
  const q = new URLSearchParams({ device: phone ? "phone" : "desktop", build });
  return new Request(`${origin}${SSR_PREFIX}${location}${sep}${q.toString()}`, { method: "GET" });
}

function storeRender(key: Request, body: SsrEntry, version: string): Promise<void> {
  return caches.default.put(
    key,
    new Response(JSON.stringify(body), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${EDGE_KEEP_SECONDS}`,
        [STORED_AT]: String(Date.now()),
        [STORED_VERSION]: version,
      },
    }),
  );
}

// Renders running in this isolate (keys only: promises are never shared
// between requests), so a burst of visitors starts one render, not many.
const rendering = new Set<string>();

async function renderAndStore(
  key: Request,
  location: string,
  phone: boolean,
  entries: { fn: string; search: string }[],
  texts: string[],
  version: string,
  hasCopy: boolean,
): Promise<void> {
  if (rendering.has(key.url)) return;
  rendering.add(key.url);
  try {
    // With no copy to fall back on, first record an empty one: if this render
    // fails, or is stopped for using too much CPU, pages are served
    // browser-rendered and the render is not retried on every request.
    if (!hasCopy) await storeRender(key, { html: "", texts, note: "rendering" }, version);
    const inline: Record<string, unknown> = {};
    entries.forEach((e, i) => { inline[`/api/public/${e.fn}${e.search}`] = JSON.parse(texts[i]); });
    let html: string | null = null;
    let note = "failed: render error";
    const started = Date.now();
    try {
      html = await renderStorefront(location, inline, phone);
    } catch (err) {
      note = `failed: ${String((err as Error)?.message || err).slice(0, 120)}`;
      console.error("[ssr] render threw", location, err);
    }
    // A failed render (null) keeps or records an empty copy until it is due again.
    if (html) await storeRender(key, { html, texts, note: `rendered in ${Date.now() - started} ms` }, version);
    else if (!hasCopy) await storeRender(key, { html: "", texts, note }, version);
  } finally {
    rendering.delete(key.url);
  }
}

/** A cached render for this page and content version (refreshing it in the background when due). */
async function cachedRender(
  ctx: ExecutionContext,
  origin: string,
  location: string,
  phone: boolean,
  build: string,
  entries: { fn: string; search: string }[],
  texts: (string | null)[],
  version: string,
): Promise<{ entry: SsrEntry | null; note: string }> {
  const key = ssrKey(origin, location, phone, build);
  const hit = await caches.default.match(key);
  const current = hit && hit.headers.get(STORED_VERSION) === version ? hit : null;
  const age = current ? (Date.now() - Number(current.headers.get(STORED_AT) || 0)) / 1000 : Infinity;
  let entry: SsrEntry | null = null;
  if (current) {
    try {
      entry = (await current.json()) as SsrEntry;
    } catch {
      entry = null;
    }
  }
  const usable = !!entry?.html && entry.texts?.length === entries.length && entry.texts.every(Boolean);
  // Render now (in the background, after this response) if there is no copy
  // for this version or it is due, and the data for it is at hand.
  if (age > SSR_FRESH_SECONDS && texts.every((t): t is string => !!t)) {
    ctx.waitUntil(
      renderAndStore(key, location, phone, entries, texts as string[], version, usable).catch((err) =>
        console.error("[ssr] background render failed", location, err),
      ),
    );
  }
  return { entry: usable ? entry : null, note: entry?.note ?? (current ? "" : "none") };
}

/** The SPA shell (dist/app.html). */
function fetchShell(env: Env, request: Request, url: URL): Promise<Response> {
  return env.ASSETS.fetch(new Request(`${url.origin}/app.html`, { method: "GET", headers: request.headers }));
}

async function serveStorefrontHtml(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const page = await fetchShell(env, request, url);
  if (!(page.headers.get("Content-Type") || "").includes("text/html")) return page;

  // Wait briefly for the content version; if it is slow, skip inlining (and
  // server rendering) rather than risk serving data the admin has changed.
  const SLOW = Symbol("slow");
  const versionResult = await Promise.race([
    contentVersion(env, ctx, url.origin),
    new Promise<typeof SLOW>((r) => setTimeout(() => r(SLOW), 400)),
  ]);
  if (versionResult === SLOW) return page;
  const version = versionResult;

  const entries = routeData(url.pathname);
  let texts = await Promise.all(entries.map((e) => cachedPublicText(env, ctx, url.origin, e.fn, e.search, version)));

  // Server-rendered HTML for this page, if one is cached for the current
  // content version. Its data replaces the freshly read copy so the page and
  // the embedded data always match.
  let ssr: SsrEntry | null = null;
  let ssrState: "hit" | "miss" | "off" = "off";
  let ssrNote = "";
  const location = ssrLocation(url, texts[0]);
  const phone = isPhone(request);
  const shellTag = page.headers.get("ETag");
  // ?ssr=0 serves the page without server rendering (for comparison and diagnosis).
  if (location && version && shellTag && url.searchParams.get("ssr") !== "0") {
    const build = `${shellTag.replace(/\W/g, "")}-${SSR_BUILD_ID}`;
    try {
      const cached = await cachedRender(ctx, url.origin, location, phone, build, entries, texts, version);
      ssr = cached.entry;
      ssrNote = cached.note;
      ssrState = ssr ? "hit" : "miss";
    } catch (err) {
      console.error("[ssr] cache read failed", err);
    }
    if (ssr) texts = ssr.texts;
  }

  const inline: string[] = [];
  entries.forEach((e, i) => {
    // The cached text is JSON; escape "<" so it cannot close the script tag.
    if (texts[i]) inline.push(`${JSON.stringify(`/api/public/${e.fn}${e.search}`)}:${texts[i]!.replace(/</g, "\\u003c")}`);
  });
  const homeIdx = entries.findIndex((e) => e.fn === "public-home");
  const productIdx = entries.findIndex((e) => e.fn === "public-product");
  // A server-rendered page already has the photo's <img> near the top of the
  // HTML; a preload as well only made the browser fetch it twice.
  const preload =
    ssr ? ""
    : homeIdx >= 0 && texts[homeIdx] ? heroPreloads(texts[homeIdx]!, texts[0])
    : productIdx >= 0 && texts[productIdx] ? productPreload(texts[productIdx]!, texts[0])
    : "";
  if (!inline.length && !preload) return page;

  const headers = new Headers(page.headers);
  // Whether this page arrived server-rendered: "hit", "miss" (rendering in
  // the background for later visitors) or "off" (not a server-rendered URL).
  headers.set("X-Kovo-SSR", ssrState);
  // Diagnostics: "rendered in N ms", "rendering" (a render that never finished,
  // e.g. stopped by the CPU limit) or "failed: …".
  if (ssrNote) headers.set("X-Kovo-SSR-Note", ssrNote.replace(/[^\x20-\x7e]/g, "?"));
  headers.delete("ETag");
  headers.delete("Content-Length");
  headers.set("Cache-Control", "no-cache");
  const rewritten = new HTMLRewriter()
    // After the viewport tag: before it, phones report a 980px layout width,
    // so the screen-size check would pick the desktop image.
    .on('meta[name="viewport"]', {
      element(el) {
        if (preload) el.after(preload, { html: true });
      },
    })
    .on("head", {
      element(el) {
        if (inline.length) {
          el.append(
            `<script>window.__kovoData={${inline.join(",")}}${ssr ? `;window.__kovoSSR=true;window.__kovoSSRMobile=${phone}` : ""}</script>`,
            { html: true },
          );
        }
      },
    })
    // On a server-rendered page, start the app only after the first paint.
    // Loading it as a normal module script lets Chrome run it (and React's
    // start-up) before painting, which held the ready HTML back by ~200 ms
    // on phones. modulepreload still downloads it straight away.
    .on('script[type="module"][src]', {
      element(el) {
        if (!ssr) return;
        const src = el.getAttribute("src") || "";
        if (!/^\/assets\/[\w.-]+\.js$/.test(src)) return;
        el.replace(
          `<link rel="modulepreload" crossorigin href="${src}">` +
            `<script>(function(){var d=0;function go(){if(d)return;d=1;var s=document.createElement("script");` +
            `s.type="module";s.crossOrigin="";s.src=${JSON.stringify(src)};document.head.appendChild(s)}` +
            // rAF runs just before a paint; the timeout after it runs once that paint is done.
            // A tab opened in the background never paints, so it starts on load;
            // the long timeout is only a safety net.
            `if(document.hidden)addEventListener("load",go);else requestAnimationFrame(function(){setTimeout(go,0)});` +
            `setTimeout(go,4000)})()</script>`,
          { html: true },
        );
      },
    })
    .on("div#root", {
      element(el) {
        if (ssr) el.setInnerContent(ssr.html, { html: true });
      },
    })
    .transform(new Response(page.body, { status: page.status, headers }));
  return rewritten;
}

const R2_PROXY_PREFIX = "/__r2/";
const DEFAULT_R2_PUBLIC_BASE = "https://images.kovobd.com";

async function proxyR2Image(env: Env, key: string): Promise<Response> {
  // Image object keys only (as written by the image-upload function).
  if (!/^[\w-]+(\/[\w-]+)*\.(jpe?g|png|webp|avif|gif)$/i.test(key)) {
    return new Response("Not found", { status: 404 });
  }
  const base = (env.VITE_R2_PUBLIC_BASE_URL || DEFAULT_R2_PUBLIC_BASE).replace(/\/+$/, "");
  const upstream = await fetch(`${base}/${key}`, { cf: { cacheEverything: true } });
  if (!upstream.ok) return new Response("Not found", { status: upstream.status === 404 ? 404 : 502 });
  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // An R2 image under this site's own address. The admin's re-crop needs
    // the photo's pixels, which the browser only allows for same-origin (or
    // CORS) images, and the R2 public domain sends no CORS headers.
    if (request.method === "GET" && url.pathname.startsWith(R2_PROXY_PREFIX)) {
      return proxyR2Image(env, url.pathname.slice(R2_PROXY_PREFIX.length));
    }

    // Admin saves call this so the change shows up on the very next page view.
    if (request.method === "POST" && url.pathname === "/api/public/_refresh") {
      // Public and cheap (one tiny read), but throttled so it cannot be used
      // to hammer Supabase: at most one read per second per isolate.
      const v = Date.now() - versionMemo.at < 1000
        ? versionMemo.value
        : await refreshContentVersion(env, url.origin).catch(() => null);
      return new Response(JSON.stringify({ version: v }), {
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/public/")) {
      const fn = url.pathname.slice("/api/public/".length).replace(/\/+$/, "");
      if (PUBLIC_FUNCTIONS.has(fn)) {
        try {
          return await proxyPublicApi(env, ctx, fn, url);
        } catch {
          // Never fail the storefront over a cache problem: pass straight through.
          const r = await fetchUpstream(env, fn, url.search);
          return new Response(r.body, { status: r.status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-cache", "X-Kovo-Cache": "BYPASS" } });
        }
      }
      return new Response("Not found", { status: 404 });
    }

    // Always-fresh sitemap served from our own domain so Google Search Console
    // accepts it. Proxies the Supabase Edge Function which renders from DB on
    // every request — product/category/policy mutations are reflected
    // immediately (modulo the 60s edge cache).
    if (
      request.method === "GET" &&
      (url.pathname === "/sitemap.xml" || url.pathname === "/sitemap-live.xml")
    ) {
      return proxySitemap(env);
    }

    // Page URLs (no file extension) get the SPA shell. Static files never reach
    // this point: the asset store answers those before the Worker runs.
    const isPage = !/\.[a-z0-9]{1,5}$/i.test(url.pathname) || url.pathname.endsWith(".html");
    if ((request.method === "GET" || request.method === "HEAD") && isPage) {
      try {
        if (request.method === "GET" && routeData(url.pathname).length > 1) {
          return await serveStorefrontHtml(request, env, ctx, url);
        }
      } catch {
        /* fall through to the plain shell */
      }
      const shell = await fetchShell(env, request, url);
      const headers = new Headers(shell.headers);
      headers.set("Cache-Control", "no-cache");
      return new Response(request.method === "HEAD" ? null : shell.body, { status: 200, headers });
    }

    // Missing static file: a real 404 from the asset store.
    return env.ASSETS.fetch(request);
  },
};
