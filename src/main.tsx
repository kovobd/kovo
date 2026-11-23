import { createRoot, hydrateRoot } from "react-dom/client";
import { isModuleLoadError, reloadForNewVersion } from "@/lib/newVersionReload";
import App, { preloadSsrPage } from "./App.tsx";
import "./index.css";
import { ensureR2Preconnect } from "@/lib/cdnImage";
import { queryClient } from "@/lib/queryClient";
import { seedStorefrontQueries, type InlineData } from "@/lib/ssrSeed";
import { markHydrating } from "@/lib/hydration";

// Runtime preconnect to the configured R2 CDN host. This keeps the connection
// hint in sync with `VITE_R2_PUBLIC_BASE_URL` after a remix (so a new project
// doesn't ship a stale preconnect pointing at the previous bucket).
ensureR2Preconnect();

// NOTE: ensure_cms_defaults() is intentionally NOT called here. It used to run
// for every visitor (an extra RPC on each session, and it could re-create
// placeholder content that an admin deleted). Admin Settings pages call
// ensureCmsDefaults({ force: true }) themselves, and the RPC is now restricted
// to signed-in users.



window.addEventListener(
  "error",
  (event) => {
    const message = event.message || "";
    const errorMessage = event.error instanceof Error ? event.error.message : "";
    if (isModuleLoadError(message + " " + errorMessage)) reloadForNewVersion();
  },
  true
);

window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason);
  if (isModuleLoadError(msg)) reloadForNewVersion();
});

// Vite's own signal that a code file for the next page could not be loaded.
window.addEventListener("vite:preloadError", (event) => {
  if (reloadForNewVersion()) event.preventDefault();
});

const root = document.getElementById("root");
if (root) {
  // The Worker server-rendered this page (src/entry-server.tsx) and embedded
  // the exact data it used: put that data in the cache under the same keys,
  // then hydrate the existing HTML instead of rendering from scratch.
  const w = window as unknown as { __kovoSSR?: boolean; __kovoData?: InlineData };
  if (w.__kovoSSR && w.__kovoData && root.firstElementChild) {
    markHydrating();
    seedStorefrontQueries(queryClient, w.__kovoData);
    const hydrate = () =>
      hydrateRoot(root, <App />, {
        // A mismatch is not fatal: React re-renders that part in the browser.
        // Logged so it shows up when checking pages.
        onRecoverableError: (error) => console.warn("[ssr] hydration mismatch, re-rendered in browser:", error),
      });
    // Hydrate once (1) this page's code has loaded, so no part of the page
    // waits during hydration, and (2) the browser has painted the server
    // HTML: when the scripts arrive with the CSS, hydrating straight away
    // would hold back the first paint. Timeouts cover a slow page chunk and
    // tabs opened in the background, where animation frames do not run.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      hydrate();
    };
    const afterPaint = () => {
      requestAnimationFrame(() => setTimeout(start, 0));
      setTimeout(start, 150);
    };
    preloadSsrPage(window.location.pathname).then(afterPaint, afterPaint);
    setTimeout(start, 8000);
  } else {
    createRoot(root).render(<App />);
  }
  (window as any).__app_booted__ = true;
  try { sessionStorage.removeItem("__app_boot_recovery__"); } catch { /* ignore */ }
}

// Register service worker in production only (offline-grade caching for
// build assets + R2 images). Skipped in dev to avoid HMR collisions.
if (
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  import.meta.env.PROD
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* registration failure is non-fatal */
    });
  });
}
