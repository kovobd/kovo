import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import {
  buildSrcSet,
  getR2BaseKey,
  getR2Base,
  isR2OriginalRef,
  isR2Ref,
  isR2VariantRef,
  R2_BASE_CHANGED_EVENT,
  r2Direct,
  r2Original,
  r2Url,
  VARIANT_WIDTHS,
} from "@/lib/cdnImage";

const PLACEHOLDER_SRC = "/placeholder.svg";

export interface CdnImageProps
  extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "loading" | "decoding"> {
  /** Either a `r2:{baseKey}` ref or any legacy URL. */
  src: string | null | undefined;
  alt: string;
  /** Treat as LCP candidate: eager loading, high fetchpriority, optional preload. */
  priority?: boolean;
  /** Render `<link rel="preload">` for the WebP 800 variant when priority. */
  preload?: boolean;
  /** Hint for the browser's responsive image selector. Defaults to "100vw". */
  sizes?: string;
  /** Fires when the underlying image is loaded, including cache hits before React's load listener attaches. */
  onReady?: (img: HTMLImageElement) => void;
}

const assignRef = (ref: React.ForwardedRef<HTMLImageElement>, node: HTMLImageElement | null) => {
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
};

/**
 * CDN-aware <picture> with WebP → JPG fallback when the src is a
 * migrated R2 base key. For legacy URLs it renders a plain <img> with
 * lazy + async defaults so it is always safe to use as a drop-in.
 */
const CdnImage = forwardRef<HTMLImageElement, CdnImageProps>(function CdnImage(
  { src, alt, priority = false, preload = false, sizes = "100vw", className, width, height, onReady, onLoad, onError, ...rest },
  ref,
) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [r2Base, setR2Base] = useState(() => getR2Base());
  const loading = priority ? "eager" : "lazy";
  const decoding: "async" | "sync" = priority ? "sync" : "async";
  const fetchPriority = priority ? "high" : "low";

  const notifyIfLoaded = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) {
      onReady?.(img);
    }
  }, [onReady]);

  const setImgRef = useCallback((node: HTMLImageElement | null) => {
    imgRef.current = node;
    assignRef(ref, node);
    if (node) queueMicrotask(() => notifyIfLoaded(node));
  }, [ref, notifyIfLoaded]);

  const handleLoad = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    onLoad?.(event);
    onReady?.(event.currentTarget);
  }, [onLoad, onReady]);

  const handleError = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    // Fallback chain for r2:variant refs whose variant files may be missing
    // (e.g. fresh remix with empty bucket, or legacy variants never generated).
    if (src && isR2VariantRef(src)) {
      const key = getR2BaseKey(src);
      const original = r2Original(key);
      const direct = r2Direct(key);
      if (original && !img.src.endsWith("-original.jpg")) { img.srcset = ""; img.src = original; return; }
      if (direct && img.src !== direct) { img.srcset = ""; img.src = direct; return; }
    }
    if (img.src !== window.location.origin + PLACEHOLDER_SRC && !img.src.endsWith(PLACEHOLDER_SRC)) {
      img.srcset = "";
      img.src = PLACEHOLDER_SRC;
    }
    onError?.(event);
  }, [onError, src]);

  const preloadHref = (() => {
    if (!priority || !preload || !isR2VariantRef(src ?? null)) return null;
    return r2Url(getR2BaseKey(src!), 800, "webp");
  })();

  useEffect(() => {
    const onBaseChanged = () => setR2Base(getR2Base());
    window.addEventListener(R2_BASE_CHANGED_EVENT, onBaseChanged as EventListener);
    return () => window.removeEventListener(R2_BASE_CHANGED_EVENT, onBaseChanged as EventListener);
  }, []);

  useEffect(() => {
    if (!preloadHref) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = preloadHref;
    link.type = "image/webp";
    link.imageSrcset = buildSrcSet(getR2BaseKey(src!), "webp");
    link.imageSizes = sizes;
    document.head.appendChild(link);
    return () => {
      try { document.head.removeChild(link); } catch { /* noop */ }
    };
  }, [preloadHref, sizes, src]);

  useEffect(() => {
    notifyIfLoaded(imgRef.current);
  }, [src, notifyIfLoaded]);

  // No src yet → render nothing so any sibling shimmer/placeholder shows through.
  if (!src) return null;

  // If R2 is an r2 ref but the CDN base isn't configured, render placeholder
  // instead of a broken URL. This keeps a freshly-remixed project usable
  // before the user wires VITE_R2_PUBLIC_BASE_URL.
  if (isR2Ref(src) && !r2Base) {
    return (
      <img
        ref={setImgRef}
        src={PLACEHOLDER_SRC}
        alt={alt}
        loading={loading}
        decoding={decoding}
        className={className}
        width={width}
        height={height}
        {...rest}
      />
    );
  }

  // Legacy / external image — plain <img> with safe defaults.
  if (!isR2Ref(src) || isR2OriginalRef(src)) {
    const resolvedSrc = isR2OriginalRef(src) ? r2Direct(getR2BaseKey(src)) : src;
    if (!resolvedSrc) return null;
    return (
      <img
        ref={setImgRef}
        src={resolvedSrc}
        alt={alt}
        loading={loading}
        decoding={decoding}
        // @ts-expect-error fetchpriority is valid HTML attr
        fetchpriority={fetchPriority}
        className={className}
        width={width}
        height={height}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />
    );
  }

  if (!isR2VariantRef(src ?? null)) {
    return null;
  }

  const key = getR2BaseKey(src!);
  const fallback = r2Url(key, 800, "webp") || r2Original(key);

  return (
    <picture>
      <source type="image/webp" srcSet={buildSrcSet(key, "webp")} sizes={sizes} />
      <img
        ref={setImgRef}
        src={fallback}
        srcSet={VARIANT_WIDTHS.map((w) => `${r2Url(key, w, "webp")} ${w}w`).join(", ")}
        sizes={sizes}
        alt={alt}
        loading={loading}
        decoding={decoding}
        // @ts-expect-error fetchpriority is valid HTML attr
        fetchpriority={fetchPriority}
        className={className}
        width={width}
        height={height}
        onLoad={handleLoad}
        onError={handleError}
        {...rest}
      />
    </picture>
  );
});

export default CdnImage;
