// Thin fetch client for the public-* edge functions.
// - Single in-flight request per (path,query) via coalescing map
// - Honors browser HTTP cache (ETag/SWR) automatically
// - Uses anon key so the Supabase functions runtime accepts the call

import { setRuntimeR2Base } from "@/lib/cdnImage";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const inflight = new Map<string, Promise<any>>();

function buildUrl(path: string, query?: Record<string, string | undefined>): string {
  const url = new URL(`${SUPABASE_URL}/functions/v1/${path}`);
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

export async function publicGet<T = any>(
  path: string,
  query?: Record<string, string | undefined>,
  options: { fresh?: boolean } = {},
): Promise<T> {
  const url = buildUrl(path, query);
  const existing = inflight.get(url);
  if (existing) return existing as Promise<T>;

  const p = (async () => {
    try {
      const res = await fetch(url, {
        method: "GET",
        cache: options.fresh ? "no-store" : "default",
        headers: {
          apikey: ANON,
          Authorization: `Bearer ${ANON}`,
        },
      });
      if (!res.ok) throw new Error(`public-${path} ${res.status}`);
      const json = await res.json();
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
