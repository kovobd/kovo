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

export function bumpStorefrontVersion(): string {
  const v = String(Date.now());
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

import { useEffect, useState } from "react";

export function useStorefrontVersion(): string | undefined {
  const [v, setV] = useState<string | undefined>(() => getStorefrontVersion());
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
