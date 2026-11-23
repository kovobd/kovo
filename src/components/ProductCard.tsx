import { Link, useNavigate } from "react-router-dom";
import { CURRENCY_SYMBOL, toBanglaDigits } from "@/lib/currency";
import { useCartStore } from "@/data/cartStore";
import { applyOfferDiscount, type ActiveOffer } from "@/lib/offers";
import type { Product } from "@/types/database";
import { useState, useCallback, memo, forwardRef, useEffect, useRef, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchProductData } from "@/lib/fetchProductData";
import { ShoppingBagIcon, ZapIcon } from "@/components/ui/icons";
import { getProductPriceRange, parseOptionGroups } from "@/lib/variants";
import { useLayoutData } from "@/components/layout/LayoutDataProvider";
import { TiltCard } from "@/components/ui/tilt-card";
import CdnImage from "@/components/ui/CdnImage";
import { getR2BaseKey, isR2OriginalRef, isR2VariantRef, resolveImageSrc } from "@/lib/cdnImage";

interface ProductCardProps {
  product: Product;
  categoryName?: string;
  offers?: ActiveOffer[];
  priority?: boolean;
  /** Optional pre-computed variant price range from product_variants rows */
  variantPriceMin?: number | null;
  variantPriceMax?: number | null;
  /** Original (non-sale) variant price range — used to render strikethrough on ranges */
  variantOrigPriceMin?: number | null;
  variantOrigPriceMax?: number | null;
  /** Optional search query — matching segments in the product name will be highlighted */
  highlightQuery?: string;
}


const highlightText = (text: string, query?: string) => {
  const q = (query ?? "").trim();
  if (!q) return text;
  try {
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${escaped})`, "ig"));
    return parts.map((part, i) =>
      part.toLowerCase() === q.toLowerCase() ? (
        <mark key={i} className="bg-primary/15 text-foreground rounded-[3px] px-0.5">{part}</mark>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  } catch {
    return text;
  }
};

const toAbsoluteImageUrl = (src: string) => {
  try {
    return new URL(src, typeof window === "undefined" ? "http://localhost" : window.location.origin).href;
  } catch {
    return src;
  }
};

const imageElementMatchesRef = (img: HTMLImageElement, imageRef: string) => {
  const currentSrc = decodeURI((img.currentSrc || img.src || "").split("?")[0]);
  if (!currentSrc) return false;

  if (isR2VariantRef(imageRef)) {
    const key = getR2BaseKey(imageRef);
    const encodedKey = encodeURI(key);
    return currentSrc.includes(`/${key}-`) || currentSrc.includes(`/${encodedKey}-`);
  }

  if (isR2OriginalRef(imageRef)) {
    const key = getR2BaseKey(imageRef);
    const encodedKey = encodeURI(key);
    const resolved = resolveImageSrc(imageRef);
    return currentSrc === toAbsoluteImageUrl(resolved).split("?")[0]
      || currentSrc.endsWith(`/${key}`)
      || currentSrc.endsWith(`/${encodedKey}`);
  }

  return currentSrc === toAbsoluteImageUrl(imageRef).split("?")[0];
};

// Module-scoped set: tracks which product IDs have already played the "crack restore"
// intro during this page's lifetime, so it runs at most once per card per load.
const gvCrackShown = new Set<string>();
// Monotonic index for stagger reveal — increments per mounted card.
let gvRevealIndex = 0;

const CornerOrnament = () => (
  <svg viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M1 1 L6 1 M1 1 L1 6" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
    <path d="M1 1 Q4 4 6 6" stroke="currentColor" strokeWidth="0.6" opacity="0.7" />
    <circle cx="6.2" cy="6.2" r="0.9" fill="currentColor" opacity="0.75" />
  </svg>
);

const ProductCard = forwardRef<HTMLAnchorElement, ProductCardProps>(({ product, categoryName, offers = [], priority = false, variantPriceMin, variantPriceMax, variantOrigPriceMin, variantOrigPriceMax, highlightQuery }, ref) => {

  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const queryClient = useQueryClient();
  const { cardButtons } = useLayoutData();
  const showViewDetails = cardButtons?.showViewDetails !== false;
  const showAddToCart = cardButtons?.showAddToCart !== false;
  const showBuyNow = cardButtons?.showBuyNow !== false;
  const anyButton = showViewDetails || showAddToCart || showBuyNow;

  const prefetchProduct = useCallback(() => {
    // Prefetch the EXACT same payload PDP expects, so navigation is instant
    // AND nothing (shipment details, variants, zones) is missing on first paint.
    // Pass `updated_at` as a cache-buster so a saved product change always hits
    // a fresh edge response while unchanged products keep CDN-caching.
    const version = (product as any).updated_at ? String((product as any).updated_at) : undefined;
    queryClient.prefetchQuery({
      queryKey: ["product", product.slug, version ?? null],
      queryFn: () => fetchProductData(product.slug, version),
      staleTime: 5 * 60 * 1000,
    });
  }, [product.slug, (product as any).updated_at, queryClient]);

  // ── Price model ───────────────────────────────────────────────────────────
  // Variant ranges from server already represent EFFECTIVE prices (sale_price else price).
  // The orig range represents the ORIGINAL (non-sale) prices, used to render strikethrough.
  const hasVariantData = variantPriceMin != null && variantPriceMax != null;
  const variantHasRange = hasVariantData && variantPriceMin !== variantPriceMax;
  const variantOrigHasRange = variantOrigPriceMin != null && variantOrigPriceMax != null && variantOrigPriceMin !== variantOrigPriceMax;
  // A variant-level sale exists when any orig price exceeds the effective.
  const variantHasSale = hasVariantData && variantOrigPriceMin != null && variantOrigPriceMax != null
    && (variantOrigPriceMin > variantPriceMin! || variantOrigPriceMax > variantPriceMax!);

  const legacyRange = getProductPriceRange(product.price, (product as any).variants);
  const variantRange = hasVariantData
    ? { min: variantPriceMin!, max: variantPriceMax!, hasRange: variantHasRange }
    : legacyRange;

  // When a product uses variants, the product-level `price` may be 0 (admin sets
  // prices per-variant). Fall back to the variant price so the card never shows ৳0.
  const effectiveProductPrice = hasVariantData
    ? (variantOrigPriceMin ?? variantPriceMin ?? product.price)
    : product.price;
  const effectiveSale = product.sale_price && product.sale_price < effectiveProductPrice ? product.sale_price : null;
  // For single-price display, prefer variant effective price if variants exist.
  const singleEffective = hasVariantData ? variantPriceMin! : (effectiveSale ?? effectiveProductPrice);
  const { finalPrice, offerName } = applyOfferDiscount(singleEffective, product.id, product.category_id, product.brand_id, offers);
  const currentPrice = finalPrice;
  const hasDiscount = currentPrice < effectiveProductPrice;
  const discountPercent = hasDiscount ? Math.round(((effectiveProductPrice - currentPrice) / effectiveProductPrice) * 100) : 0;

  const mainImage = product.images?.[0] || null;
  const secondImage = product.images?.[1] || null;
  const [hovered, setHovered] = useState(false);
  const displayImage = (hovered && secondImage ? secondImage : mainImage) ?? null;
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Record<string, true>>({});
  const imgRef = useRef<HTMLImageElement | null>(null);
  const imgLoaded = !!displayImage && loadedImages[displayImage] === true;

  const markDisplayImageLoaded = useCallback((img?: HTMLImageElement | null) => {
    if (!displayImage) return;
    if (img && (!img.complete || img.naturalWidth <= 0 || !imageElementMatchesRef(img, displayImage))) return;
    setLoadedImages((prev) => prev[displayImage] ? prev : { ...prev, [displayImage]: true });
  }, [displayImage]);

  const markDisplayImageSettled = useCallback(() => {
    if (!displayImage) return;
    setLoadedImages((prev) => prev[displayImage] ? prev : { ...prev, [displayImage]: true });
  }, [displayImage]);

  // `imgLoaded` is keyed by the actual displayed image string. Unrelated card
  // re-renders no longer reset the shimmer; only changing main/hover image does.
  // Cached images are detected from the DOM because browsers may complete before
  // React's `load` listener is attached.
  useEffect(() => {
    const el = imgRef.current;
    if (el) markDisplayImageLoaded(el);
  }, [displayImage, markDisplayImageLoaded]);

  // Viewport-based PDP prefetch — when a card scrolls into view, idly warm
  // its product payload + the PDP route chunk so the first tap is instant.
  // Skips the LCP card (priority) because it already paints immediately, and
  // bails on Save-Data / 2g to respect constrained networks.
  const linkRef = useRef<HTMLAnchorElement | null>(null);
  useEffect(() => {
    if (priority) return;
    const node = linkRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const conn = (navigator as any)?.connection;
    if (conn?.saveData) return;
    if (conn?.effectiveType && /^(slow-)?2g$/.test(conn.effectiveType)) return;
    let done = false;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting || done) continue;
        done = true;
        io.disconnect();
        const run = () => {
          prefetchProduct();
          import("@/pages/ProductDetails").catch(() => {});
        };
        if ("requestIdleCallback" in window) {
          (window as any).requestIdleCallback(run, { timeout: 1500 });
        } else {
          setTimeout(run, 200);
        }
      }
    }, { rootMargin: "300px" });
    io.observe(node);
    return () => io.disconnect();
  }, [priority, prefetchProduct]);



  // Broken → Restored crack overlay: play at most once per product per page load.
  const [showCrack] = useState(() => {
    if (typeof window === "undefined") return false;
    if (gvCrackShown.has(product.id)) return false;
    gvCrackShown.add(product.id);
    return true;
  });

  // Staggered reveal — up to ~9 cards then flatten to avoid long delays on grids.
  const revealDelay = useMemo(() => `${Math.min(gvRevealIndex++, 9) * 80}ms`, []);

  const isOutOfStock = product.stock <= 0;


  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (isOutOfStock) return;
    addItem({ id: product.id, productId: product.id, name: product.name, price: currentPrice, image: mainImage });
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1500);
  };

  const handleBuyNow = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (isOutOfStock) return;
    useCartStore.getState().clearCart();
    addItem({ id: product.id, productId: product.id, name: product.name, price: currentPrice, image: mainImage });
    navigate("/checkout");
  };

  return (
    <Link ref={(node) => { linkRef.current = node; if (typeof ref === "function") ref(node); else if (ref) (ref as any).current = node; }} to={`/product/${product.slug}`} className="group block" onMouseEnter={prefetchProduct} onTouchStart={prefetchProduct}>
      <TiltCard intensity={14} perspective={1400} className="h-full">

      <div
        className="gv-glow-border gv-reveal flex flex-col h-full rounded-[20px] sm:rounded-[24px] border border-[#2B2337] bg-[#17131F] p-2 sm:p-2.5 shadow-[0_4px_18px_-8px_rgba(0,0,0,0.55)] transition-[transform,border-color,box-shadow] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-[5px] group-hover:border-[#B89AE8]/70 group-hover:shadow-[0_22px_46px_-16px_rgba(184,154,232,0.4),0_0_0_1px_rgba(184,154,232,0.28)] [transform-style:preserve-3d]"
        style={{ ["--gv-reveal-delay" as any]: revealDelay }}
      >
        {/* Decorative gothic corner ornaments (subtle by default, brighten on hover) */}
        <span className="gv-corner gv-corner--tl"><CornerOrnament /></span>
        <span className="gv-corner gv-corner--tr"><CornerOrnament /></span>
        <span className="gv-corner gv-corner--bl"><CornerOrnament /></span>
        <span className="gv-corner gv-corner--br"><CornerOrnament /></span>

        <div className="gv-img-wrap relative aspect-[4/5] overflow-hidden rounded-[14px] sm:rounded-[18px] bg-[#08060D] ring-1 ring-[#B89AE8]/[0.08] p-[6px] sm:p-[8px] transition-shadow duration-500 group-hover:shadow-[0_24px_60px_-30px_rgba(184,154,232,0.5)]" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
          <div className="relative w-full h-full overflow-hidden rounded-[10px] sm:rounded-[12px] bg-[#0D0B12]">
          {!imgLoaded && (
            <div className="absolute inset-0 z-0 bg-muted shimmer-loading pointer-events-none" aria-hidden />
          )}
          {displayImage ? (
            <CdnImage
              ref={imgRef}
              src={displayImage}
              alt={product.name}
              className={`relative z-[1] w-full h-full object-cover transition-[transform,opacity] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.045] ${imgLoaded ? "opacity-100 gv-img-focus" : "opacity-0"}`}
              priority={priority}
              preload={priority}
              sizes="(min-width: 1024px) 25vw, 50vw"
              width={400}
              height={500}
              onReady={markDisplayImageLoaded}
              onLoad={(event) => markDisplayImageLoaded(event.currentTarget)}
              onError={markDisplayImageSettled}
            />
          ) : null}
          {/* Moonlight sweep — plays on hover */}
          <span className="gv-moon-sweep" aria-hidden />
          {/* Product image hover atmosphere: vignette + rising smoke */}
          <span className="gv-img-vignette" aria-hidden />
          <span className="gv-img-smoke" aria-hidden />

          {/* Broken → Restored crack overlay — plays once when card first mounts */}
          {showCrack && <span className="gv-crack" aria-hidden />}
          {isOutOfStock ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center bg-card text-foreground text-[10px] sm:text-[11px] font-semibold tracking-[0.12em] uppercase px-2.5 py-1 rounded-md shadow-sm">Sold out</span>
          ) : hasDiscount ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center bg-[#B89AE8] text-[#050505] text-[10px] sm:text-[11px] font-semibold tracking-[0.04em] px-2.5 py-1 rounded-md shadow-[0_4px_12px_-4px_rgba(184,154,232,0.5)]">−{discountPercent}%</span>
          ) : product.best_seller ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center bg-[#B89AE8] text-[#050505] text-[10px] sm:text-[11px] font-semibold tracking-[0.1em] uppercase px-2.5 py-1 rounded-md shadow-[0_4px_12px_-4px_rgba(184,154,232,0.5)]">Best Seller</span>
          ) : (product as any).is_new_arrival ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center border border-[#B89AE8]/60 bg-card/90 text-[#CDB5F6] text-[10px] sm:text-[11px] font-semibold tracking-[0.14em] uppercase px-2.5 py-1 rounded-md shadow-[0_4px_12px_-6px_rgba(184,154,232,0.45)] backdrop-blur-sm">New</span>
          ) : null}
          {offerName && !isOutOfStock && (
            <span className="absolute top-2.5 right-2.5 z-[4] bg-card text-foreground text-[10px] sm:text-[11px] font-medium tracking-[0.08em] uppercase px-2.5 py-1 rounded-md shadow-sm">{offerName}</span>
          )}
          </div>
        </div>

        <div className="pt-2.5 px-1 sm:px-1.5 pb-1.5 flex flex-col flex-1">
          {/* Title — uppercase, bold, editorial */}
          <h3 className="gv-card-title text-[12px] sm:text-[13px] lg:text-[14px] font-bold tracking-[0.04em] uppercase text-foreground leading-snug line-clamp-2 mb-2">
            {highlightText(product.name, highlightQuery)}
          </h3>


          {/* Variant preview (color swatches / text pills) */}
          {(() => {
            const groups = parseOptionGroups((product as any).option_groups).filter(g => g.show_on_card !== false && g.values.length > 0);
            if (groups.length === 0) return null;
            return (
              <div className="flex flex-col gap-1 mb-2">
                {groups.slice(0, 2).map((g, gi) => {
                  const visible = g.values.slice(0, 4);
                  const extra = g.values.length - visible.length;
                  const isColor = g.type === "color";
                  const isImage = g.type === "image";
                  return (
                    <div key={gi} className="flex items-center gap-1.5 flex-wrap">
                      {visible.map((val) => {
                        if (isColor) {
                          return (
                            <span
                              key={val}
                              title={val}
                              className="w-4 h-4 rounded-full border border-black/15 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                              style={{ background: g.color_map?.[val] || "#e5e5e5" }}
                            />
                          );
                        }
                        if (isImage) {
                          const idx = g.image_map?.[val];
                          const imgSrc = g.image_url_map?.[val] || (idx != null && product.images?.[idx]) || product.images?.[0];
                          if (imgSrc) {
                            return (
                              <CdnImage
                                key={val}
                                src={imgSrc}
                                alt={val}
                                title={val}
                                className="w-6 h-6 rounded-md object-cover border border-black/10 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                                width={48}
                                height={48}
                                sizes="48px"
                              />
                            );
                          }
                        }
                        return (
                          <span
                            key={val}
                            className="px-1.5 h-5 inline-flex items-center text-[10px] font-medium rounded-full border border-foreground/15 text-foreground/70 bg-background"
                          >
                            {val}
                          </span>
                        );
                      })}
                      {extra > 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground/70 tabular-nums">+{extra}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Price */}
          <div className="flex items-baseline flex-wrap gap-x-1.5 sm:gap-x-2 gap-y-0 leading-none mb-2.5">
            {variantRange.hasRange ? (
              <>
                <span className="text-[12.5px] sm:text-[14px] lg:text-[15px] font-normal text-foreground tabular-nums">
                  {CURRENCY_SYMBOL}{toBanglaDigits(variantRange.min)}<span className="mx-0.5 sm:mx-1 text-muted-foreground">–</span>{CURRENCY_SYMBOL}{toBanglaDigits(variantRange.max)}
                </span>
                {variantHasSale && variantOrigPriceMin != null && variantOrigPriceMax != null && (
                  <span className="text-[11px] sm:text-[12.5px] font-normal text-muted-foreground/55 line-through tabular-nums">
                    {variantOrigHasRange
                      ? <>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigPriceMin)}<span className="mx-0.5">–</span>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigPriceMax)}</>
                      : <>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigPriceMin)}</>}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-[12.5px] sm:text-[14px] lg:text-[15px] font-normal text-foreground tabular-nums">
                  {CURRENCY_SYMBOL}{toBanglaDigits(currentPrice)}
                </span>
                {hasDiscount && (
                  <span className="text-[11px] sm:text-[12.5px] font-normal text-muted-foreground/55 line-through tabular-nums">
                    {hasVariantData && variantHasSale && variantOrigPriceMin != null && variantOrigPriceMax != null && variantOrigHasRange
                      ? <>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigPriceMin)}<span className="mx-0.5">–</span>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigPriceMax)}</>
                      : <>{CURRENCY_SYMBOL}{toBanglaDigits(effectiveProductPrice)}</>}
                  </span>
                )}
              </>
            )}
          </div>


          {/* Actions — pill style, glass + ink */}
          {anyButton && (
            <div className="mt-auto flex flex-col gap-2.5">
              {(showViewDetails || showAddToCart) && (
                <div className={`grid gap-2 ${showViewDetails && showAddToCart ? "grid-cols-2" : "grid-cols-1"}`}>
                  {showViewDetails && (
                    <button
                      onClick={(e) => { e.preventDefault(); navigate(`/product/${product.slug}`); }}
                      className="h-9 rounded-full border border-foreground/15 hover:border-foreground/30 text-foreground/75 hover:text-foreground hover:bg-foreground/[0.03] text-[11px] sm:text-[12px] font-medium tracking-[-0.005em] active:scale-[0.97] transition-all duration-200 touch-manipulation inline-flex items-center justify-center"
                      aria-label="View details"
                    >
                      <span className="hidden xs:inline">View details</span><span className="xs:hidden">Details</span>
                    </button>
                  )}
                  {showAddToCart && (
                    <button
                      onClick={handleAddToCart}
                      disabled={isOutOfStock}
                      className="h-9 rounded-full glass-button text-foreground text-[11px] sm:text-[12px] font-medium tracking-[-0.005em] active:scale-[0.97] transition-all duration-200 touch-manipulation inline-flex items-center justify-center gap-1 sm:gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Add to Vault"
                    >
                      {addedFeedback ? <>✓ Added</> : <><ShoppingBagIcon size={12} /> <span className="hidden xs:inline">Add to Vault</span><span className="xs:hidden">Add</span></>}
                    </button>
                  )}
                </div>
              )}
              {showBuyNow && (
                <button
                  onClick={handleBuyNow}
                  disabled={isOutOfStock}
                  className="w-full h-10 rounded-full bg-[#B89AE8] text-[#050505] text-[11px] sm:text-[12px] font-semibold tracking-[0.01em] hover:bg-[#CDB5F6] hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 touch-manipulation inline-flex items-center justify-center gap-1 sm:gap-1.5 shadow-[0_8px_24px_-6px_rgba(184,154,232,0.45)] hover:shadow-[0_10px_28px_-4px_rgba(184,154,232,0.6)] disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Buy now"
                >
                  <ZapIcon size={12} /> Buy now
                </button>
              )}

            </div>
          )}
        </div>
      </div>
      </TiltCard>
    </Link>
  );
});
ProductCard.displayName = "ProductCard";

export default memo(ProductCard);
