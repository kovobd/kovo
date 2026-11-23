/** Storefront identity. Change these two values to rebrand or move domains. */
export const SITE_NAME = "Kovo";

/** Public origin used for canonical URLs and structured data. VITE_SITE_URL overrides it. */
export const SITE_URL: string = (
  (import.meta.env.VITE_SITE_URL as string | undefined) || "https://kovobd.com"
).replace(/\/$/, "");
