// Server-side rendering entry, bundled into the Cloudflare Worker (see the
// `build:ssr` script and worker/index.ts). Renders a storefront page to HTML
// from the same data the Worker embeds in the page, so the browser can
// hydrate it (src/main.tsx) instead of rendering from scratch.
//
// Only the home, shop and product pages are rendered here; everything else
// is rendered in the browser as before.
import { lazy, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { StaticRouter } from "react-router-dom/server";
import { Route, Routes } from "react-router-dom";
import { QueryClient } from "@tanstack/react-query";
import Layout from "@/components/layout/Layout";
import { AppFrame, ssrPageRoutes } from "@/routes/ssrRoutes";
import { seedStorefrontQueries, type InlineData } from "@/lib/ssrSeed";
import { queryClientDefaults } from "@/lib/queryClient";

declare const __SSR_BUILD_ID__: string;
/** Changes on every build of this bundle (part of the Worker's cache key). */
export const SSR_BUILD_ID: string = __SSR_BUILD_ID__;

// Lazy exactly like src/App.tsx, so the server tree has the same Suspense
// boundaries the browser hydrates. (The server bundle inlines these imports.)
const pages = {
  Index: lazy(() => import("./pages/Index")),
  Shop: lazy(() => import("./pages/Shop")),
  ProductDetails: lazy(() => import("./pages/ProductDetails")),
};

/**
 * HTML for the inside of <div id="root">, or null if the page could not be
 * rendered cleanly (the Worker then serves the normal browser-rendered page).
 * `location` is the path plus the query parameters the pages read; `isMobile`
 * is the Worker's phone/desktop guess (see src/lib/viewportHint.tsx).
 */
export async function renderStorefront(location: string, inline: InlineData, isMobile: boolean): Promise<string | null> {
  // A fresh cache per render: nothing may leak between visitors.
  const client = new QueryClient({ defaultOptions: queryClientDefaults });
  seedStorefrontQueries(client, inline);

  const Router = ({ children }: { children: ReactNode }) => (
    <StaticRouter location={location} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {children}
    </StaticRouter>
  );

  const errors: unknown[] = [];
  const stream = await renderToReadableStream(
    <AppFrame client={client} deferred={false} router={Router} isMobileHint={isMobile}>
      <Routes>
        <Route element={<Layout />}>{ssrPageRoutes(pages)}</Route>
      </Routes>
    </AppFrame>,
    { onError: (error) => { errors.push(error); } },
  );
  // Wait for every Suspense boundary (lazy pages) so the HTML is complete and
  // carries no streaming scripts.
  await stream.allReady;
  const html = await new Response(stream).text();
  client.clear();
  if (errors.length) {
    console.error("[ssr] render error", location, errors[0]);
    return null;
  }
  return html;
}
