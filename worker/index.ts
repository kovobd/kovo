export interface Env {
  ASSETS: Fetcher;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

import { heroImageAttrs, HERO_MOBILE_QUERY } from "../src/lib/imageUrls";

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
// the public-* functions read (shop settings, products, homepage, …). The
// Worker checks it every few seconds; a cached copy stored under an older
// version is never served, so admin edits reach every visitor right away.
const VERSION_CHECK_MS = 5000;
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

/**
 * Current content version (memoised per isolate for a few seconds); null if unknown.
 * Only the resolved value is shared between requests: a Worker request may
 * not await a fetch that another request started (it throws), so each request
 * that finds the memo expired runs its own check.
 */
async function contentVersion(env: Env): Promise<string | null> {
  if (Date.now() - versionMemo.at < VERSION_CHECK_MS) return versionMemo.value;
  try {
    const v = await readContentVersion(env);
    // Keep the last known value if the check fails, rather than forgetting it.
    versionMemo = { value: v ?? versionMemo.value, at: Date.now() };
  } catch {
    /* fall through with the last known value */
  }
  return versionMemo.value;
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

  const [cached, version] = await Promise.all([cache.match(cacheKey), contentVersion(env)]);
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
async function cachedPublicText(env: Env, ctx: ExecutionContext, origin: string, fn: string, search: string): Promise<string | null> {
  const cache = caches.default;
  const cacheKey = new Request(`${origin}/api/public/${fn}${search}`, { method: "GET" });
  // Wait briefly for the version check; if it is slow, skip inlining rather
  // than risk inlining data the admin has already changed.
  const SLOW = Symbol("slow");
  const versionOrSlow = Promise.race([
    contentVersion(env),
    new Promise<typeof SLOW>((r) => setTimeout(() => r(SLOW), 400)),
  ]);
  const [cached, versionResult] = await Promise.all([cache.match(cacheKey), versionOrSlow]);
  if (versionResult === SLOW) return null;
  const version = versionResult;
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

/** The SPA shell (dist/app.html). */
function fetchShell(env: Env, request: Request, url: URL): Promise<Response> {
  return env.ASSETS.fetch(new Request(`${url.origin}/app.html`, { method: "GET", headers: request.headers }));
}

async function serveStorefrontHtml(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const page = await fetchShell(env, request, url);
  if (!(page.headers.get("Content-Type") || "").includes("text/html")) return page;

  const entries = routeData(url.pathname);
  const texts = await Promise.all(entries.map((e) => cachedPublicText(env, ctx, url.origin, e.fn, e.search)));
  const inline: string[] = [];
  entries.forEach((e, i) => {
    // The cached text is JSON; escape "<" so it cannot close the script tag.
    if (texts[i]) inline.push(`${JSON.stringify(`/api/public/${e.fn}${e.search}`)}:${texts[i]!.replace(/</g, "\\u003c")}`);
  });
  const homeIdx = entries.findIndex((e) => e.fn === "public-home");
  const preload = homeIdx >= 0 && texts[homeIdx] ? heroPreloads(texts[homeIdx]!, texts[0]) : "";
  if (!inline.length && !preload) return page;

  const headers = new Headers(page.headers);
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
        if (inline.length) el.append(`<script>window.__kovoData={${inline.join(",")}}</script>`, { html: true });
      },
    })
    .transform(new Response(page.body, { status: page.status, headers }));
  return rewritten;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

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
