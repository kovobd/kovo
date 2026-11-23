import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ensureR2Preconnect } from "@/lib/cdnImage";

// Runtime preconnect to the configured R2 CDN host. This keeps the connection
// hint in sync with `VITE_R2_PUBLIC_BASE_URL` after a remix (so a new project
// doesn't ship a stale preconnect pointing at the previous bucket).
ensureR2Preconnect();

// NOTE: ensure_cms_defaults() is intentionally NOT called here. It used to run
// for every visitor (an extra RPC on each session, and it could re-create
// placeholder content that an admin deleted). Admin Settings pages call
// ensureCmsDefaults({ force: true }) themselves, and the RPC is now restricted
// to signed-in users.


// Safe sessionStorage helper — never throws
const safeSession = {
  get(key: string): string | null {
    try { return sessionStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string) {
    try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
  },
};

const MODULE_LOAD_RECOVERY_KEY = "__module_load_recovered_once__";

const isModuleScriptLoadError = (msg: string) =>
  msg.includes("Importing a module script failed") ||
  msg.includes("Failed to fetch dynamically imported module") ||
  msg.includes("Loading chunk") ||
  msg.includes("Loading CSS chunk");

window.addEventListener(
  "error",
  (event) => {
    const message = event.message || "";
    const errorMessage = event.error instanceof Error ? event.error.message : "";
    const combined = message + " " + errorMessage;

    if (!isModuleScriptLoadError(combined)) return;
    if (safeSession.get(MODULE_LOAD_RECOVERY_KEY) === "1") return;

    safeSession.set(MODULE_LOAD_RECOVERY_KEY, "1");
    window.location.reload();
  },
  true
);

window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message || String(event.reason);
  if (isModuleScriptLoadError(msg) && safeSession.get(MODULE_LOAD_RECOVERY_KEY) !== "1") {
    safeSession.set(MODULE_LOAD_RECOVERY_KEY, "1");
    window.location.reload();
  }
});

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
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
