// Thin fetch client for the public-* edge functions.
// - Single in-flight request per (path,query) via coalescing map
// - Honors browser HTTP cache (ETag/SWR) automatically
// - Uses anon key so the Supabase functions runtime accepts the call

import { setRuntimeR2Base } from "@/lib/cdnImage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const inflight = new Map<string, Promise<any>>();

/**
 * On the Cloudflare Worker (kovobd.com / *.workers.dev) the public functions
 * are served from the edge cache at /api/public/*. Elsewhere (local dev,
 * Lovable preview) call Supabase directly.
 */
const USE_EDGE_PROXY =
  typeof window !== "undefined" &&
  /(^|\.)kovobd\.com$|\.workers\.dev$/.test(window.location.hostname);

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = USE_EDGE_PROXY
    ? new URL(`/api/public/${path}`, window.location.origin)
    : new URL(`${SUPABASE_URL}/functions/v1/${path}`);
  if (query) {
    Object.keys(query)
      .sort()
      .forEach((k) => {
        const v = query[k];
        if (v != null && v !== "") url.searchParams.set(k, String(v));
      });
  }
  return url.toString();
}

/** Straight to the Supabase function — used if the edge cache route fails. */
function fetchDirect(
  path: string,
  query: Record<string, string | undefined> | undefined,
  options: { fresh?: boolean },
): Promise<Response> {
  const url = new URL(`${SUPABASE_URL}/functions/v1/${path}`);
  if (query) {
    Object.keys(query).sort().forEach((k) => {
      const v = query[k];
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    });
  }
  return fetch(url.toString(), {
    method: "GET",
    cache: options.fresh ? "no-store" : "default",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
  });
}

function takeEarlyFetch(url: string): Promise<Response> | undefined {
  if (typeof window === "undefined") return undefined;
  const store = (window as unknown as { __kovoEarly?: Record<string, Promise<Response>> }).__kovoEarly;
  const p = store?.[url];
  if (p) delete store[url];
  return p;
}

export async function publicGet<T = any>(
  path: string,
  query?: Record<string, string | undefined>,
  options: { fresh?: boolean } = {},
): Promise<T> {
  const url = buildUrl(path, query);
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  // index.html starts the homepage requests before the app bundle loads.
  const early = !options.fresh ? takeEarlyFetch(url) : undefined;

  const p = (async () => {
    try {
      const res = await (early ?? fetch(url, {
        method: "GET",
        cache: options.fresh ? "no-store" : "default",
        headers: USE_EDGE_PROXY ? undefined : {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
        },
      })).catch((err) => {
        if (USE_EDGE_PROXY) return fetchDirect(path, query, options);
        throw err;
      });
      let finalRes = res;
      if (!finalRes.ok && USE_EDGE_PROXY) finalRes = await fetchDirect(path, query, options);
      if (!finalRes.ok) throw new Error(`public-${path} ${finalRes.status}`);
      const json = await finalRes.json();
      if (json?.data?.r2PublicBaseUrl) setRuntimeR2Base(json.data.r2PublicBaseUrl);
      return json.data as T;
    } finally {
      // Allow next call to refetch (browser HTTP cache absorbs duplicate hits).
      inflight.delete(url);
    }
  })();

  inflight.set(url, p);
  return p;
}

export const PublicApi = {
  layout: (version?: string) => publicGet("public-layout", version ? { v: version } : undefined),
  /**
   * `version` is an opaque cache-buster bumped from the admin panel after any
   * mutation. Including it in the URL changes both browser and CDN cache keys
   * so the response refreshes immediately after a product/category/homepage
   * edit, while unchanged content keeps hitting cache for external visitors.
   */
  home: (version?: string) => publicGet("public-home", version ? { v: version } : undefined),
  shop: (version?: string) => publicGet("public-shop", version ? { v: version } : undefined),
  product: (slug: string, version?: string) =>
    publicGet("public-product", version ? { slug, v: version } : { slug }),
};
