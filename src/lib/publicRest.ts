// Fetches a read-only storefront query (src/lib/publicRestQueries.ts).
//
// On the site (kovobd.com / *.workers.dev) it comes from the Worker's edge
// cache, or straight from the page when the Worker embedded it there;
// elsewhere (local dev, Lovable preview) from Supabase directly. Always the
// anonymous view: the same rows a logged-out shopper sees.
import { restKey } from "@/lib/publicRestQueries";
import { getStorefrontVersion } from "@/lib/storefrontCache";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const USE_EDGE =
  typeof window !== "undefined" && /(^|\.)kovobd\.com$|\.workers\.dev$/.test(window.location.hostname);

const inflight = new Map<string, Promise<unknown>>();

/** Data the Worker embedded in this page for `key`, used once. */
function takeEmbedded(key: string): unknown {
  if (typeof window === "undefined" || !USE_EDGE) return undefined;
  // An admin who just saved something reads fresh copies instead.
  if (getStorefrontVersion()) return undefined;
  const store = (window as unknown as { __kovoData?: Record<string, unknown> }).__kovoData;
  const path = `/api/public/rest/${key}`;
  if (!store || !(path in store)) return undefined;
  const data = store[path];
  delete store[path];
  return data;
}

async function direct<T>(key: string): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${key}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${key.split("?")[0]} ${res.status}`);
  return (await res.json()) as T;
}

/** Rows of `query` (an entry of REST_QUERIES). */
export function publicRest<T = unknown[]>(query: string): Promise<T> {
  const key = restKey(query);
  const embedded = takeEmbedded(key);
  if (Array.isArray(embedded)) return Promise.resolve(embedded as T);

  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      if (!USE_EDGE) return await direct<T>(key);
      const v = getStorefrontVersion();
      const url = `/api/public/rest/${key}${v ? `&v=${encodeURIComponent(v)}` : ""}`;
      const res = await fetch(url).catch(() => null);
      // The edge route failing must never break the page: ask Supabase.
      if (!res || !res.ok) return await direct<T>(key);
      return (await res.json()) as T;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

/** First row of `query`, or null (like supabase-js maybeSingle()). */
export async function publicRestOne<T = Record<string, unknown>>(query: string): Promise<T | null> {
  const rows = await publicRest<T[]>(query);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
