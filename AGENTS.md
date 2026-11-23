# Architecture rules

- Keep `meta-capi` public with `verify_jwt = false`: storefront visitors use Supabase publishable API keys without a user JWT; retain origin and event validation, and keep admin tracking tools session-protected.
- Home (`/`), shop (`/shop`) and product (`/product/:slug`) pages are server-rendered by the Cloudflare Worker (`src/entry-server.tsx`, `worker/index.ts`) and then hydrated in the browser (`src/main.tsx`). The browser's first render of these pages must produce exactly the HTML the server produced:
  - Do not read `window`, `localStorage`, `sessionStorage`, `matchMedia`, the cart store, `Date.now()` or `Math.random()` while rendering anything on these pages (the header, footer and layout included). Read them in `useEffect`, or use `useBrowserValue` / `useAfterHydration` from `src/lib/hydration.ts`, which start with the server's value.
  - For phone vs desktop layout use `useViewportHint()` (`src/lib/viewportHint.tsx`) as the starting value, as `HeroSlider` does; the server renders a phone and a desktop version.
  - Things revealed by JavaScript (scroll fades, image fade-ins) start visible when `isServerOrHydrating()` is true, so content shows before scripts run.
  - Storefront data reaches these pages only through React Query keys seeded by `src/lib/ssrSeed.ts`. If a page's `useQuery` key or data shape changes, update `ssrSeed.ts` in the same change.
  - The routes and providers around them come from `src/routes/ssrRoutes.tsx`, shared by `App.tsx` and the server entry; change them there, not in one place only.
  - A response header `X-Kovo-SSR: hit | miss | off` shows whether a page arrived server-rendered. In the browser console, `[ssr] hydration mismatch` means one of the rules above was broken.
