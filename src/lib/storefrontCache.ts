// Lightweight storefront cache-busting.
//
// Admin actions that change public data (products, categories, featured,
// homepage sections, etc.) call `bumpStorefrontVersion()`. Public pages read
// `getStorefrontVersion()` and pass it as `?v=` to the public-* edge functions.
// Because the `v` parameter is part of the URL, both the browser cache and the
// CDN cache key change → the next request goes through to the function instead
// of returning a stale cached payload.
//
// External visitors who never bump simply rely on the edge-cache TTL.

const KEY = "mvbd:storefrontVersion";
const EVENT = "mvbd:storefront-version-bumped";

export function getStorefrontVersion(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage.getItem(KEY) || undefined;
  } catch {
    return undefined;
  }
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Asks the Cloudflare Worker to re-read the storefront content version now,
 * so the live site shows the admin's change on the very next page view
 * (otherwise it notices within a few seconds on its own). Several saves in a
 * row send one request.
 */
function refreshLiveSite() {
  if (typeof window === "undefined") return;
  if (!/(^|\.)kovobd\.com$|\.workers\.dev$/.test(window.location.hostname)) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    fetch("/api/public/_refresh", { method: "POST", keepalive: true }).catch(() => undefined);
  }, 300);
}

export function bumpStorefrontVersion(): string {
  const v = String(Date.now());
  refreshLiveSite();
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, v);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
    } catch {
      /* ignore */
    }
  }
  return v;
}

import { startTransition, useEffect, useState } from "react";
import { useBrowserValue } from "@/lib/hydration";

export function useStorefrontVersion(): string | undefined {
  // On a server-rendered page, start without a version like the server did
  // (its data is keyed "v0"); a bumped version (admins only) is applied right
  // after mount instead, which refetches.
  const initial = useBrowserValue<string | undefined>(getStorefrontVersion, undefined);
  const [v, setV] = useState<string | undefined>(initial);
  useEffect(() => startTransition(() => setV(initial)), [initial]);
  useEffect(() => {
    const onBump = () => setV(getStorefrontVersion());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setV(e.newValue || undefined);
    };
    window.addEventListener(EVENT, onBump as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onBump as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return v;
}
