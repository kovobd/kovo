/**
 * R2 CDN image URL helpers.
 *
 * Storage convention:
 *   - Variant-backed images are stored as `r2:{baseKey}`
 *     (e.g. `r2:products/0d5b…`). The component resolves variants:
 *       {VITE_R2_PUBLIC_BASE_URL}/{baseKey}-{size}.{ext}
 *     where size ∈ {400, 800, 1600} and ext ∈ {avif, webp, jpg}.
 *   - Migration-copied originals are stored as `r2o:{objectKey}`
 *     (e.g. `r2o:products/0d5b…`). These are served directly from R2.
 *   - Anything else (legacy supabase URLs, absolute http(s), data:, blob:)
 *     is returned unchanged — `<CdnImage>` falls back to a plain <img>.
 */

const normalizeBase = (value: string | null | undefined) => String(value || "").trim().replace(/\/+$/, "");

let runtimeR2Base = normalizeBase(import.meta.env.VITE_R2_PUBLIC_BASE_URL as string | undefined);

export const R2_BASE = runtimeR2Base;
export const R2_BASE_CHANGED_EVENT = "mvbd:r2-base-changed";

export function getR2Base(): string {
  return runtimeR2Base;
}

export function ensureR2Preconnect(base = runtimeR2Base): void {
  if (typeof document === "undefined" || !base) return;
  try {
    const origin = new URL(base).origin;
    const existing = document.querySelector(`link[rel="preconnect"][href^="${origin}"]`);
    if (existing) return;

    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = origin;
    pre.crossOrigin = "anonymous";
    document.head.appendChild(pre);

    const dns = document.createElement("link");
    dns.rel = "dns-prefetch";
    dns.href = origin;
    document.head.appendChild(dns);
  } catch {
    /* invalid URL — ignore */
  }
}

export function setRuntimeR2Base(value: string | null | undefined): boolean {
  const next = normalizeBase(value);
  if (!next || next === runtimeR2Base) return false;
  runtimeR2Base = next;
  ensureR2Preconnect(next);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(R2_BASE_CHANGED_EVENT, { detail: next }));
  }
  return true;
}

export const VARIANT_WIDTHS = [400, 800, 1600] as const;
export type VariantWidth = (typeof VARIANT_WIDTHS)[number];
export type VariantFormat = "avif" | "webp" | "jpg";

export const R2_MARKER = "r2:";
export const R2_ORIGINAL_MARKER = "r2o:";

export function isR2VariantRef(src: string | null | undefined): src is string {
  return !!src && typeof src === "string" && src.startsWith(R2_MARKER);
}

export function isR2OriginalRef(src: string | null | undefined): src is string {
  return !!src && typeof src === "string" && src.startsWith(R2_ORIGINAL_MARKER);
}

export function isR2Ref(src: string | null | undefined): src is string {
  return isR2VariantRef(src) || isR2OriginalRef(src);
}

export function getR2BaseKey(src: string): string {
  if (src.startsWith(R2_MARKER)) return src.slice(R2_MARKER.length);
  if (src.startsWith(R2_ORIGINAL_MARKER)) return src.slice(R2_ORIGINAL_MARKER.length);
  return src;
}

export function r2Url(baseKey: string, width: VariantWidth, fmt: VariantFormat): string {
  const base = getR2Base();
  if (!base) return "";
  return `${base}/${baseKey}-${width}.${fmt}`;
}

export function r2Original(baseKey: string): string {
  const base = getR2Base();
  if (!base) return "";
  return `${base}/${baseKey}-original.jpg`;
}

export function r2Direct(objectKey: string): string {
  const base = getR2Base();
  if (!base) return "";
  return `${base}/${objectKey}`;
}

/** Build srcset for a single format. */
export function buildSrcSet(baseKey: string, fmt: VariantFormat): string {
  return VARIANT_WIDTHS.map((w) => `${r2Url(baseKey, w, fmt)} ${w}w`).join(", ");
}

/** Resolve any DB value to a renderable URL (used by plain <img> consumers). */
export function resolveImageSrc(src: string | null | undefined, fallbackWidth: VariantWidth = 800): string {
  if (!src) return "/placeholder.svg";
  // If R2 CDN base URL isn't configured (e.g. fresh remix before user
  // wires VITE_R2_PUBLIC_BASE_URL), render a safe placeholder rather than
  // a broken URL like "/products/xxx-800.webp".
  if (isR2Ref(src) && !getR2Base()) return "/placeholder.svg";
  if (isR2VariantRef(src)) {
    const key = getR2BaseKey(src);
    return r2Url(key, fallbackWidth, "webp") || r2Original(key) || "/placeholder.svg";
  }
  if (isR2OriginalRef(src)) {
    return r2Direct(getR2BaseKey(src)) || "/placeholder.svg";
  }
  return src;
}

/** Fallback chain used by <img onError> to progressively try alternate variants. */
export function nextImageFallback(currentSrc: string, originalRef: string | null | undefined): string | null {
  if (!originalRef) return null;
  if (isR2VariantRef(originalRef)) {
    const key = getR2BaseKey(originalRef);
    const original = r2Original(key);
    const direct = r2Direct(key);
    // Try progressively: current -> -original.jpg -> direct base key -> placeholder
    if (!currentSrc.endsWith("-original.jpg") && original) return original;
    if (currentSrc !== direct && direct) return direct;
  }
  return "/placeholder.svg";
}
