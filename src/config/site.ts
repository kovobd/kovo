/** Storefront identity. Change these two values to rebrand or move domains. */
export const SITE_NAME = "Kovo";

/**
 * Public origin used for canonical URLs and structured data. Set
 * VITE_SITE_URL once the production domain is connected; until then the
 * current origin is used so links never point at another store.
 */
export const SITE_URL: string = (
  (import.meta.env.VITE_SITE_URL as string | undefined) ||
  (typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/$/, "");
