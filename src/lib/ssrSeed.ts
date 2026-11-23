// Puts the storefront data the Worker embedded in the page (window.__kovoData,
// keyed by /api/public/... URL) into a React Query cache under the exact keys
// the pages read.
//
// Used in two places, which must agree exactly for hydration to work:
//  - the Worker, before rendering a page to HTML (src/entry-server.tsx);
//  - the browser, before hydrating that HTML (src/main.tsx).
// If a key or a data shape here differs from what a page's useQuery uses, the
// page renders its loading state instead and hydration falls back to a
// client render.
import type { QueryClient } from "@tanstack/react-query";
import { toProductPageData } from "@/lib/fetchProductData";
import { setRuntimeR2Base } from "@/lib/cdnImage";

/** The version slot of the storefront query keys before an admin bump (see storefrontCache.ts). */
const V0 = "v0";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InlineData = Record<string, { data?: any } | undefined>;

export function seedStorefrontQueries(client: QueryClient, inline: InlineData): void {
  for (const [url, payload] of Object.entries(inline)) {
    const data = payload?.data;
    if (data == null) continue;
    // Same side effect as publicGet() in src/lib/publicApi.ts.
    if (data.r2PublicBaseUrl) setRuntimeR2Base(data.r2PublicBaseUrl);

    const u = new URL(url, "https://kovo.invalid");
    switch (u.pathname) {
      case "/api/public/public-layout":
        client.setQueryData(["public-layout", V0], data);
        break;
      case "/api/public/public-home":
        client.setQueryData(["public-home", V0], data);
        break;
      case "/api/public/public-shop":
        client.setQueryData(["public-shop", V0], data);
        break;
      case "/api/public/public-product": {
        const slug = u.searchParams.get("slug");
        const page = toProductPageData(data);
        // ProductDetails keys on the route param and a version that is null
        // on a direct landing (no shop list cached yet), as here.
        if (slug && page) client.setQueryData(["product", slug, null], page);
        break;
      }
    }
  }
}
