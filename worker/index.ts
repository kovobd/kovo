export interface Env {
  ASSETS: Fetcher;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

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

async function fetchUpstream(env: Env, fn: string, search: string): Promise<Response> {
  const base = (env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
  return fetch(`${base}/functions/v1/${fn}${search}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
}

async function storeInCache(cache: Cache, cacheKey: Request, upstream: Response): Promise<Response> {
  const body = await upstream.arrayBuffer();
  const headers = new Headers({
    "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
    "Cache-Control": `public, max-age=${EDGE_KEEP_SECONDS}`,
    [STORED_AT]: String(Date.now()),
  });
  await cache.put(cacheKey, new Response(body, { status: 200, headers }));
  return new Response(body, { status: 200, headers });
}

function clientResponse(res: Response, state: string): Response {
  const headers = new Headers(res.headers);
  headers.delete(STORED_AT);
  // Browsers may reuse it for a minute; the edge copy does the heavy lifting.
  headers.set("Cache-Control", "public, max-age=60, stale-while-revalidate=600");
  headers.set("X-Kovo-Cache", state);
  return new Response(res.body, { status: res.status, headers });
}

async function proxyPublicApi(env: Env, ctx: ExecutionContext, fn: string, url: URL): Promise<Response> {
  const cache = caches.default;
  // Normalise the key: same function + same query → same cached copy.
  const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  const cacheKey = new Request(`${url.origin}/api/public/${fn}${search}`, { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) {
    const storedAt = Number(cached.headers.get(STORED_AT) || 0);
    const ageSeconds = (Date.now() - storedAt) / 1000;
    if (ageSeconds > (EDGE_FRESH_SECONDS[fn] ?? 120)) {
      ctx.waitUntil(
        fetchUpstream(env, fn, search)
          .then((r) => (r.ok ? storeInCache(cache, cacheKey, r) : undefined))
          .catch(() => undefined),
      );
      return clientResponse(cached, "STALE");
    }
    return clientResponse(cached, "HIT");
  }

  const upstream = await fetchUpstream(env, fn, search);
  if (!upstream.ok) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  const fresh = await storeInCache(cache, cacheKey, upstream);
  return clientResponse(fresh, "MISS");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname.startsWith("/api/public/")) {
      const fn = url.pathname.slice("/api/public/".length).replace(/\/+$/, "");
      if (PUBLIC_FUNCTIONS.has(fn)) return proxyPublicApi(env, ctx, fn, url);
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

    // Everything else: static assets from ./dist with SPA fallback.
    return env.ASSETS.fetch(request);
  },
};
