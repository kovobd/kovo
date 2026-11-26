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
import CdnImage from "@/components/ui/CdnImage";
import { isServerOrHydrating } from "@/lib/hydration";
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

const ProductCard = forwardRef<HTMLAnchorElement, ProductCardProps>(({ product, categoryName, offers = [], priority = false, variantPriceMin, variantPriceMax, variantOrigPriceMin, variantOrigPriceMax, highlightQuery }, ref) => {

  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const queryClient = useQueryClient();
  const { cardButtons } = useLayoutData();
  const showViewDetails = cardButtons?.showViewDetails !== false;
  const showAddToCart = cardButtons?.showAddToCart !== false;
  const showBuyNow = cardButtons?.showBuyNow !== false;
  const anyButton = showViewDetails || showAddToCart || showBuyNow;
  const primary = cardButtons?.primary ?? "view_details";
  // Admin "Primary card button": filled when it is the only strong action,
  // outlined in the foreground colour when Buy now is the filled button.
  const primaryCls = showBuyNow
    ? "border border-foreground text-foreground hover:bg-foreground hover:text-background"
    : "bg-foreground text-background border border-foreground hover:bg-foreground/85";
  const secondaryCls = "border border-border text-foreground hover:border-foreground";

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
  // On a server-rendered page the main photo starts visible (no fade-in), so
  // it shows as soon as the browser has it, before any JavaScript runs.
  const [loadedImages, setLoadedImages] = useState<Record<string, true>>(() =>
    isServerOrHydrating() && mainImage ? { [mainImage]: true } : {},
  );
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

  const detailsButton = showViewDetails ? (
    <button
      onClick={(e) => { e.preventDefault(); navigate(`/product/${product.slug}`); }}
      className={`h-10 px-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.08em] sm:tracking-[0.12em] whitespace-nowrap active:scale-[0.98] transition-all duration-200 touch-manipulation inline-flex items-center justify-center ${primary === "view_details" ? primaryCls : secondaryCls}`}
      aria-label="View details"
    >
      <span className="hidden lg:inline">View details</span><span className="lg:hidden">Details</span>
    </button>
  ) : null;
  const cartButton = showAddToCart ? (
    <button
      onClick={handleAddToCart}
      disabled={isOutOfStock}
      className={`h-10 px-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.08em] sm:tracking-[0.12em] whitespace-nowrap active:scale-[0.98] transition-all duration-200 touch-manipulation inline-flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${primary === "add_to_cart" ? primaryCls : secondaryCls}`}
      aria-label="Add to cart"
    >
      {addedFeedback ? <>✓ Added</> : <><ShoppingBagIcon size={12} /> <span className="hidden lg:inline">Add to cart</span><span className="lg:hidden">Add</span></>}
    </button>
  ) : null;

  return (
    <Link ref={(node) => { linkRef.current = node; if (typeof ref === "function") ref(node); else if (ref) (ref as any).current = node; }} to={`/product/${product.slug}`} className="group block" onMouseEnter={prefetchProduct} onTouchStart={prefetchProduct}>
      <div className="h-full">

      <div
        className="flex flex-col h-full"
      >
        <div className="relative aspect-[4/5] overflow-hidden bg-[hsl(var(--surface))]" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
          <div className="relative w-full h-full overflow-hidden">
          {!imgLoaded && (
            <div className="absolute inset-0 z-0 bg-muted shimmer-loading pointer-events-none" aria-hidden />
          )}
          {displayImage ? (
            <CdnImage
              ref={imgRef}
              src={displayImage}
              alt={product.name}
              className={`relative z-[1] w-full h-full object-cover transition-[transform,opacity] duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03] ${imgLoaded ? "opacity-100 gv-img-focus" : "opacity-0"}`}
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
          {isOutOfStock ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center text-[10px] font-medium tracking-[0.14em] uppercase px-2 py-1 bg-background text-muted-foreground">Sold out</span>
          ) : hasDiscount ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center text-[10px] font-medium tracking-[0.14em] uppercase px-2 py-1 bg-destructive text-destructive-foreground">−{discountPercent}%</span>
          ) : product.best_seller ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center text-[10px] font-medium tracking-[0.14em] uppercase px-2 py-1 bg-foreground text-background">Best seller</span>
          ) : (product as any).is_new_arrival ? (
            <span className="absolute top-2.5 left-2.5 z-[4] inline-flex items-center text-[10px] font-medium tracking-[0.14em] uppercase px-2 py-1 bg-background text-foreground">New</span>
          ) : null}
          {offerName && !isOutOfStock && (
            <span className="absolute top-2.5 right-2.5 z-[4] bg-background text-foreground text-[10px] font-medium tracking-[0.14em] uppercase px-2 py-1">{offerName}</span>
          )}
          </div>
        </div>

        <div className="pt-3 pb-1 flex flex-col flex-1">
          <h3 className="text-[14px] sm:text-[15px] font-normal tracking-[0.01em] text-foreground leading-snug line-clamp-2 mb-1.5 underline-offset-4 decoration-1 group-hover:underline">
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
                            className="px-1.5 h-5 inline-flex items-center text-[10px] font-medium border border-foreground/15 text-foreground/70 bg-background"
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


          {/* Actions — square, small uppercase labels */}
          {anyButton && (
            <div className="mt-auto flex flex-col gap-2">
              {(showViewDetails || showAddToCart) && (
                <div className={`grid gap-2 ${showViewDetails && showAddToCart ? "grid-cols-2" : "grid-cols-1"}`}>
                  {primary === "add_to_cart" ? <>{cartButton}{detailsButton}</> : <>{detailsButton}{cartButton}</>}
                </div>
              )}
              {showBuyNow && (
                <button
                  onClick={handleBuyNow}
                  disabled={isOutOfStock}
                  className="w-full h-10 px-1 text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.08em] sm:tracking-[0.12em] whitespace-nowrap active:scale-[0.98] transition-all duration-200 touch-manipulation inline-flex items-center justify-center gap-1.5 bg-foreground text-background hover:bg-foreground/85 disabled:opacity-50 disabled:cursor-not-allowed"
                  aria-label="Buy now"
                >
                  <ZapIcon size={12} /> Buy now
                </button>
              )}

            </div>
          )}
        </div>
      </div>
      </div>
    </Link>
  );
});
ProductCard.displayName = "ProductCard";

export default memo(ProductCard);
