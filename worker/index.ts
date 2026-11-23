export interface Env {
  ASSETS: Fetcher;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
}

// Hard-coded fallback so /sitemap.xml works even before env vars are wired.
const DEFAULT_SUPABASE_URL = "https://nzvxkzuukibnxpfdwwol.supabase.co";

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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

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
