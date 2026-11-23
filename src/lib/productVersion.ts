// Helpers for resolving the cache-buster version of a product without an extra
// network round-trip. The public-shop payload already carries `updated_at` for
// every product; we read it straight from the React Query cache when present.

import { queryClient } from "@/lib/queryClient";

/**
 * Look up `products.updated_at` for the given slug or id from the in-memory
 * public-shop cache (set by Shop.tsx and Header.tsx prefetch). Returns
 * `undefined` for direct PDP landings where the shop list hasn't been
 * fetched — those callers fall back to the standard 120s CDN cache.
 */
export function getProductVersion(slugOrId: string): string | undefined {
  if (!slugOrId) return undefined;
  try {
    const entries = queryClient.getQueriesData<any>({ queryKey: ["public-shop"] });
    for (const [, data] of entries) {
      const list = (data?.products ?? data) as any[] | undefined;
      if (!Array.isArray(list)) continue;
      const match = list.find((p) => p?.slug === slugOrId || p?.id === slugOrId);
      if (match?.updated_at) return String(match.updated_at);
    }
  } catch {
    /* ignore */
  }
  return undefined;
}
