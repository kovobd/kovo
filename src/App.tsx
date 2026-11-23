import { lazy, startTransition, Suspense, useEffect, useState } from "react";
import { queryClient } from "@/lib/queryClient";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { AppFrame, lazyPage, ssrPageRoutes } from "@/routes/ssrRoutes";
import { ssrViewportHint } from "@/lib/viewportHint";

// Providers deferred until after first paint — Radix Tooltip/Toast/Sonner
// aren't needed for the initial LCP frame, so we avoid shipping them on
// the critical path.
const DeferredProviders = lazy(() => import("@/components/layout/DeferredProviders"));


// Lazy like every page: the Shop and product pages no longer download the
// homepage (hero carousel, sections). Measured on a throttled phone, the
// homepage itself is no slower (its hero photo is preloaded from the HTML).
const Index = lazyPage(() => import("./pages/Index"));
const OrderConfirmation = lazy(() => import("./pages/OrderConfirmation"));

const Shop = lazyPage(() => import("./pages/Shop"));
const ProductDetails = lazyPage(() => import("./pages/ProductDetails"));
const About = lazy(() => import("./pages/About"));
const Contact = lazy(() => import("./pages/Contact"));
const Policies = lazy(() => import("./pages/Policies"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Cart = lazy(() => import("./pages/Cart"));

const Checkout = lazy(() => import("./pages/Checkout"));

const TrackOrder = lazy(() => import("./pages/TrackOrder"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));

const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const Products = lazy(() => import("./pages/admin/Products"));
const Orders = lazy(() => import("./pages/admin/Orders"));
const Customers = lazy(() => import("./pages/admin/Customers"));
const CustomerProfile = lazy(() => import("./pages/admin/CustomerProfile"));

const CouponManager = lazy(() => import("./pages/admin/CouponManager"));
const OfferManager = lazy(() => import("./pages/admin/OfferManager"));
const UserRoles = lazy(() => import("./pages/admin/UserRoles"));
const ApiKeysManager = lazy(() => import("./pages/admin/ApiKeysManager"));
const POS = lazy(() => import("./pages/admin/POS"));
const InquiriesManager = lazy(() => import("./pages/admin/InquiriesManager"));
const EcomDriveLogs = lazy(() => import("./pages/admin/EcomDriveLogs"));
const IncompleteOrders = lazy(() => import("./pages/admin/IncompleteOrders"));
const ReorderReminders = lazy(() => import("./pages/admin/ReorderReminders"));

// Taxonomy
const TaxonomyLayout = lazy(() => import("./components/admin/TaxonomyLayout"));
const CategoryManager = lazy(() => import("./pages/admin/CategoryManager"));
const TagManager = lazy(() => import("./pages/admin/TagManager"));
const BrandManager = lazy(() => import("./pages/admin/BrandManager"));

// Settings
const SettingsLayout = lazy(() => import("./components/admin/SettingsLayout"));
const PaymentSettings = lazy(() => import("./pages/admin/PaymentSettings"));
const HomepageManager = lazy(() => import("./pages/admin/HomepageManager"));
const FeaturedCategoriesManager = lazy(() => import("./pages/admin/FeaturedCategoriesManager"));
const VideoTestimonialsManager = lazy(() => import("./pages/admin/VideoTestimonialsManager"));
const AnnouncementEditor = lazy(() => import("./components/admin/AnnouncementEditor"));
const ShopSettings = lazy(() => import("./pages/admin/ShopSettings"));
const DeliverySettings = lazy(() => import("./pages/admin/DeliverySettings"));
const DeliveryPartners = lazy(() => import("./pages/admin/DeliveryPartners"));
const TrackingPixels = lazy(() => import("./pages/admin/TrackingPixels"));
const MetaTrackingHealth = lazy(() => import("./pages/admin/MetaTrackingHealth"));
const InvoiceSettings = lazy(() => import("./pages/admin/InvoiceSettings"));
const AboutManager = lazy(() => import("./pages/admin/AboutManager"));
const ContactManager = lazy(() => import("./pages/admin/ContactManager"));
const PolicyManager = lazy(() => import("./pages/admin/PolicyManager"));
const FloatingIconsManager = lazy(() => import("./pages/admin/FloatingIconsManager"));
const DirectOrderChannels = lazy(() => import("./pages/admin/DirectOrderChannels"));
const FooterEditor = lazy(() => import("./pages/admin/FooterEditor"));
const R2Migration = lazy(() => import("./pages/admin/R2Migration"));
const R2CleanupHealth = lazy(() => import("./pages/admin/R2CleanupHealth"));
const ReviewsManager = lazy(() => import("./pages/admin/ReviewsManager"));



// queryClient is imported from "@/lib/queryClient" so non-component code
// paths (e.g. admin data loaders) can share the same cache singleton.

if (typeof window !== "undefined") {
  try {
    const persister = createSyncStoragePersister({
      storage: window.localStorage,
      key: "nam-rq-cache",
      throttleTime: 1000,
    });
    persistQueryClient({
      queryClient,
      persister,
      maxAge: 24 * 60 * 60 * 1000,
      buster: "v2",
      dehydrateOptions: {
        shouldDehydrateQuery: (q) => {
          // Only persist admin data. `layout-data` and product/home caches
          // are already served with s-maxage from Supabase Edge Functions
          // and cached via the Service Worker — double-caching creates
          // hydration jank and stale-vs-fresh flicker on repeat visits.
          const k = q.queryKey?.[0];
          return k === "admin";
        },
      },

    });
  } catch {
    // localStorage unavailable
  }
}

if (typeof window !== "undefined") {
  // Warm the pages shoppers usually open next, but only after the current page
  // has fully loaded so these downloads never compete with what is on screen.
  // Everything else is prefetched on hover/touch by the header links.
  const prefetch = () => {
    import("./pages/Shop");
    import("./pages/ProductDetails");
    import("./pages/Cart");
  };
  const schedule = () => {
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    setTimeout(() => (idle ? idle(prefetch, { timeout: 4000 }) : prefetch()), 2500);
  };
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

import {
  AboutPageSkeleton,
  ContactPageSkeleton,
  PoliciesPageSkeleton,
  CartPageSkeleton,
  CheckoutPageSkeleton,
  TrackOrderPageSkeleton,
  SimplePageSkeleton,
} from "@/components/ui/page-skeletons";

const Route$ = ({ fallback, children }: { fallback: React.ReactNode; children: React.ReactNode }) => (
  <Suspense fallback={fallback}>{children}</Suspense>
);

const SSR_PAGES = { Index, Shop, ProductDetails };

/** Loads the code of the server-rendered page at `pathname` (see lazyPage). */
export function preloadSsrPage(pathname: string): Promise<unknown> {
  if (pathname === "/") return Index.preload();
  if (pathname === "/shop") return Shop.preload();
  if (/^\/product\/[^/]+\/?$/.test(pathname)) return ProductDetails.preload();
  return Promise.resolve();
}
// Read once: the server's phone/desktop guess for a server-rendered page.
const VIEWPORT_HINT = ssrViewportHint();

const BrowserRouterWithFlags = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>{children}</BrowserRouter>
);

const A = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={null}>{children}</Suspense>
);

// Settings children render without their own page title (SettingsLayout owns it)
const settingsChild = (Component: React.ComponentType<{ hideTitle?: boolean }>) => (
  <A><Component hideTitle /></A>
);

const useAfterPaint = () => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => void }).requestIdleCallback;
    // A transition: on a server-rendered page, parts still hydrating keep
    // their server HTML instead of being re-rendered for this update.
    const ready = () => startTransition(() => setReady(true));
    if (idle) idle(ready, { timeout: 1500 });
    else setTimeout(ready, 300);
  }, []);
  return ready;
};

const App = () => {
  const providersReady = useAfterPaint();
  return (
    <AppFrame
      client={queryClient}
      deferred={providersReady && (
        <Suspense fallback={null}>
          <DeferredProviders />
        </Suspense>
      )}
      router={BrowserRouterWithFlags}
      isMobileHint={VIEWPORT_HINT}
    >
          <Routes>
            <Route element={<Layout />}>
              {/* Home, shop and product pages are server-rendered by the Worker. */}
              {ssrPageRoutes(SSR_PAGES)}
              <Route path="/about" element={<Route$ fallback={<AboutPageSkeleton />}><About /></Route$>} />
              <Route path="/contact" element={<Route$ fallback={<ContactPageSkeleton />}><Contact /></Route$>} />
              <Route path="/policies" element={<Route$ fallback={<PoliciesPageSkeleton />}><Policies /></Route$>} />
              <Route path="/policies/:tab" element={<Route$ fallback={<PoliciesPageSkeleton />}><Policies /></Route$>} />
              <Route path="/reviews" element={<Route$ fallback={<SimplePageSkeleton />}><Reviews /></Route$>} />
              <Route path="/cart" element={<Route$ fallback={<CartPageSkeleton />}><Cart /></Route$>} />

              <Route path="/checkout" element={<Route$ fallback={<CheckoutPageSkeleton />}><Checkout /></Route$>} />
              <Route path="/order-confirmation" element={<Route$ fallback={<SimplePageSkeleton />}><OrderConfirmation /></Route$>} />
              <Route path="/track-order" element={<Route$ fallback={<TrackOrderPageSkeleton />}><TrackOrder /></Route$>} />
            </Route>

            <Route path="/admin/login" element={<Route$ fallback={<SimplePageSkeleton />}><AdminLogin /></Route$>} />

            <Route path="/admin" element={<A><AdminLayout /></A>}>
              <Route index element={<A><Dashboard /></A>} />
              <Route path="products" element={<A><Products /></A>} />
              <Route path="orders" element={<A><Orders /></A>} />
              <Route path="incomplete-orders" element={<A><IncompleteOrders /></A>} />
              <Route path="customers" element={<A><Customers /></A>} />
              <Route path="customers/:phone" element={<A><CustomerProfile /></A>} />

              <Route path="reorder-reminders" element={<A><ReorderReminders /></A>} />
              <Route path="coupons" element={<A><CouponManager /></A>} />
              <Route path="offers" element={<A><OfferManager /></A>} />
              <Route path="roles" element={<A><UserRoles /></A>} />
              <Route path="pos" element={<A><POS /></A>} />
              <Route path="inquiries" element={<A><InquiriesManager /></A>} />
              <Route path="ecomdrive-logs" element={<A><EcomDriveLogs /></A>} />

              {/* Taxonomy */}
              <Route path="taxonomy" element={<A><TaxonomyLayout /></A>}>
                <Route index element={<Navigate to="/admin/taxonomy/categories" replace />} />
                <Route path="categories" element={<A><CategoryManager /></A>} />
                <Route path="tags" element={<A><TagManager /></A>} />
                <Route path="brands" element={<A><BrandManager /></A>} />

              </Route>

              {/* Settings */}
              <Route path="settings" element={<A><SettingsLayout /></A>}>
                <Route index element={<Navigate to="/admin/settings/homepage" replace />} />
                <Route path="homepage" element={settingsChild(HomepageManager)} />
                <Route path="featured-categories" element={settingsChild(FeaturedCategoriesManager)} />
                <Route path="video-testimonials" element={settingsChild(VideoTestimonialsManager)} />
                <Route path="announcement" element={<A><AnnouncementEditor /></A>} />
                <Route path="shop" element={settingsChild(ShopSettings)} />
                <Route path="delivery" element={settingsChild(DeliverySettings)} />
                <Route path="payment" element={settingsChild(PaymentSettings)} />
                <Route path="courier" element={settingsChild(DeliveryPartners)} />
                <Route path="tracking" element={settingsChild(TrackingPixels)} />
                <Route path="meta-health" element={settingsChild(MetaTrackingHealth)} />
                <Route path="invoice" element={settingsChild(InvoiceSettings)} />
                <Route path="about" element={settingsChild(AboutManager)} />
                <Route path="contact" element={settingsChild(ContactManager)} />
                <Route path="policies" element={settingsChild(PolicyManager)} />
                <Route path="reviews" element={settingsChild(ReviewsManager)} />

                <Route path="floating" element={settingsChild(FloatingIconsManager)} />
                <Route path="direct-order" element={settingsChild(DirectOrderChannels)} />
                <Route path="footer" element={settingsChild(FooterEditor)} />
                <Route path="r2-migration" element={settingsChild(R2Migration)} />
                <Route path="r2-cleanup" element={settingsChild(R2CleanupHealth)} />
                <Route path="api-keys" element={settingsChild(ApiKeysManager)} />

              </Route>

              {/* Legacy redirects */}
              <Route path="brands" element={<Navigate to="/admin/taxonomy/brands" replace />} />
              <Route path="categories" element={<Navigate to="/admin/taxonomy/categories" replace />} />
            </Route>

            <Route path="*" element={<Route$ fallback={<SimplePageSkeleton />}><NotFound /></Route$>} />
          </Routes>
    </AppFrame>
  );
};

export default App;

