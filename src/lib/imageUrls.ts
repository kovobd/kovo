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

/**
 * The <img> attributes for a hero slide that is not an `r2:` variant ref.
 * Returns null for variant refs (those render a <picture> with AVIF/WebP
 * sources, which a single preload cannot match).
 */
export function heroImageAttrs(
  slide: HeroImageSource,
  isMobile: boolean,
  r2Base: string,
): { src: string; srcSet?: string; sizes: string } | null {
  const raw = (isMobile && slide.mobile_image_url) || slide.image_url || "";
  if (!raw) return null;
  const sizes = isMobile ? "100vw" : "(min-width: 1280px) 1600px, 100vw";
  if (raw.startsWith("r2:")) return null;
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
