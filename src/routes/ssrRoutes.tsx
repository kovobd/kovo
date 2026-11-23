// The storefront pages the Cloudflare Worker renders to HTML (server-side
// rendering), shared by the browser app (src/App.tsx) and the server entry
// (src/entry-server.tsx).
//
// Hydration only works if the server and the browser build the *same* React
// tree for a page, so both get these route elements and this frame from here
// rather than each writing their own copy.
import { Suspense, type ComponentType, type ReactNode } from "react";
import { Route } from "react-router-dom";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import ScrollToTop from "@/components/ScrollToTop";
import ErrorBoundary from "@/components/ErrorBoundary";
import SchemaHealthGate from "@/components/SchemaHealthGate";
import { ShopPageSkeleton, ProductDetailsSkeleton } from "@/components/ui/page-skeletons";
import { ViewportHintContext } from "@/lib/viewportHint";

export const RouteSuspense = ({ fallback, children }: { fallback: ReactNode; children: ReactNode }) => (
  <Suspense fallback={fallback}>{children}</Suspense>
);

export interface SsrPages {
  Index: ComponentType;
  Shop: ComponentType;
  ProductDetails: ComponentType;
}

/** Route elements for the server-rendered pages (children of the Layout route). */
export function ssrPageRoutes({ Index, Shop, ProductDetails }: SsrPages) {
  return [
    <Route key="home" path="/" element={<RouteSuspense fallback={<div className="min-h-[100svh]" />}><Index /></RouteSuspense>} />,
    <Route key="shop" path="/shop" element={<RouteSuspense fallback={<ShopPageSkeleton />}><Shop /></RouteSuspense>} />,
    <Route key="product" path="/product/:id" element={<RouteSuspense fallback={<ProductDetailsSkeleton />}><ProductDetails /></RouteSuspense>} />,
  ];
}

/**
 * Everything around the router, identical on server and browser. `deferred`
 * is what the browser adds after first paint (always nothing on the server and
 * during hydration); `router` is BrowserRouter or StaticRouter with the routes.
 */
export function AppFrame({
  client,
  deferred,
  router: Router,
  isMobileHint,
  children,
}: {
  client: QueryClient;
  deferred: ReactNode;
  router: ComponentType<{ children: ReactNode }>;
  /** Phone or desktop as rendered by the server (see src/lib/viewportHint.tsx). */
  isMobileHint: boolean | null;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={client}>
        <ViewportHintContext.Provider value={isMobileHint}>
          {deferred}
          <Router>
            <ScrollToTop />
            <SchemaHealthGate>{children}</SchemaHealthGate>
          </Router>
        </ViewportHintContext.Provider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
