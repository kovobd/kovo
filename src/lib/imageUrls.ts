/**
 * Pure image-URL helpers with no app or environment dependencies, so the
 * Cloudflare Worker can build exactly the same URLs as the React app (used to
 * preload the hero image from the HTML).
 */

/** Image CDNs that resize on the fly through `w` / `h` query parameters. */
export function isResizableUrl(src: string | null | undefined): src is string {
  return !!src && /^https:\/\/images\.unsplash\.com\//.test(src);
}

/** The same resizable image at `width` px, keeping its crop ratio. */
export function resizedUrl(src: string, width: number): string {
  try {
    const u = new URL(src);
    const w = Number(u.searchParams.get("w")) || 0;
    const h = Number(u.searchParams.get("h")) || 0;
    u.searchParams.set("w", String(width));
    if (w && h) u.searchParams.set("h", String(Math.round((h / w) * width)));
    if (!u.searchParams.has("auto")) u.searchParams.set("auto", "format");
    u.searchParams.set("q", "75");
    return u.toString();
  } catch {
    return src;
  }
}

export function resizedSrcSet(src: string, widths: readonly number[] = [400, 640, 960, 1280, 1920]): string {
  return widths.map((w) => `${resizedUrl(src, w)} ${w}w`).join(", ");
}

export const HERO_MOBILE_QUERY = "(max-width: 767px)";

export interface HeroImageSource {
  image_url?: string | null;
  mobile_image_url?: string | null;
}

/** WebP widths stored for every `r2:` image (see src/lib/r2Upload.ts). */
export const R2_VARIANT_WIDTHS = [400, 800, 1600] as const;

/** srcset for an `r2:` variant set. */
export function r2VariantSrcSet(base: string, key: string): string {
  return R2_VARIANT_WIDTHS.map((w) => `${base}/${key}-${w}.webp ${w}w`).join(", ");
}

/**
 * The <img> attributes for a hero slide, shared by the app and the Worker so
 * the HTML preload and the <img> request exactly the same file.
 */
export function heroImageAttrs(
  slide: HeroImageSource,
  isMobile: boolean,
  r2Base: string,
): { src: string; srcSet?: string; sizes: string } | null {
  const raw = (isMobile && slide.mobile_image_url) || slide.image_url || "";
  if (!raw) return null;
  const sizes = isMobile ? "100vw" : "(min-width: 1280px) 1600px, 100vw";
  if (raw.startsWith("r2:")) {
    const base = r2Base.replace(/\/+$/, "");
    const key = raw.slice(3);
    return base ? { src: `${base}/${key}-${isMobile ? 800 : 1600}.webp`, srcSet: r2VariantSrcSet(base, key), sizes } : null;
  }
  if (raw.startsWith("r2o:")) {
    const base = r2Base.replace(/\/+$/, "");
    return base ? { src: `${base}/${raw.slice(4)}`, sizes } : null;
  }
  if (isResizableUrl(raw)) {
    return {
      src: resizedUrl(raw, isMobile ? 800 : 1600),
      srcSet: resizedSrcSet(raw, isMobile ? [480, 720, 1080] : [960, 1280, 1600, 1920]),
      sizes,
    };
  }
  return { src: raw, sizes };
}

/** `sizes` of the main photo on the product page (src/pages/ProductDetails.tsx). */
export const PDP_MAIN_IMAGE_SIZES = "(max-width: 1024px) 100vw, 600px";

/**
 * What <CdnImage> requests for `raw` (src + srcset), so the Worker can preload
 * the product page's main photo with exactly the same URLs.
 */
export function cdnImageAttrs(raw: string, r2Base: string): { src: string; srcSet?: string } | null {
  if (!raw) return null;
  const base = r2Base.replace(/\/+$/, "");
  if (raw.startsWith("r2:")) {
    const key = raw.slice(3);
    return base ? { src: `${base}/${key}-800.webp`, srcSet: r2VariantSrcSet(base, key) } : null;
  }
  if (raw.startsWith("r2o:")) return base ? { src: `${base}/${raw.slice(4)}` } : null;
  if (isResizableUrl(raw)) return { src: resizedUrl(raw, 800), srcSet: resizedSrcSet(raw) };
  if (/^https?:\/\//.test(raw)) return { src: raw };
  return null;
}
