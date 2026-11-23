import { useState, useEffect, useRef } from "react";
import { productMeta, shareImageUrl } from "@/lib/pageMeta";
import { ScrollScene } from "@/components/ui/scroll-scene";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { trackViewContent, trackAddToCart } from "@/lib/trackingEvents";
import { MinusIcon, PlusIcon, ShoppingBagIcon, ArrowLeftIcon, CheckIcon, TruckIcon, TagIcon, GiftIcon, PartyPopperIcon, ChevronDownIcon } from "@/components/ui/icons";
// Gallery thumbnails: simple wrapping row directly inline
import { useCartStore } from "@/data/cartStore";
import { CURRENCY_SYMBOL, toBanglaDigits } from "@/lib/currency";
import { simulateOffersForProduct, type ProductOffer } from "@/lib/productOffers";
import ProductCard from "@/components/ProductCard";
import StarRating from "@/components/ui/StarRating";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Product } from "@/types/database";
import {
  getProductPriceRange,
  parseOptionGroups,
  getVariantRowsPriceRange,
  resolveVariantRow,
  effectiveRowPrice,
  type VariantRow,
} from "@/lib/variants";

import { ProductDetailsSkeleton } from "@/components/ui/page-skeletons";
import CdnImage from "@/components/ui/CdnImage";
import { PDP_MAIN_IMAGE_SIZES, cdnImageAttrs } from "@/lib/imageUrls";
import { resolveImageSrc, getR2Base } from "@/lib/cdnImage";
import { useLayoutData } from "@/components/layout/LayoutDataProvider";
import DynamicIcon from "@/components/ui/DynamicIcon";

import { fetchProductData } from "@/lib/fetchProductData";
import { getProductVersion } from "@/lib/productVersion";
import { useDocumentMeta, useJsonLd } from "@/hooks/useDocumentMeta";

import ProductEntrance from "@/components/ambient/pixelFx/ProductEntrance";
import { SITE_URL } from "@/config/site";

const ProductDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [manualImagePick, setManualImagePick] = useState<string | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  
  const [addedFeedback, setAddedFeedback] = useState(false);
  const ctaRef = useRef<HTMLDivElement | null>(null);
  const galleryStickyRef = useRef<HTMLDivElement | null>(null);
  const galleryThumbsRef = useRef<HTMLDivElement | null>(null);
  const productInfoRef = useRef<HTMLDivElement | null>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  const { directOrderChannels } = useLayoutData();

  // Resolve the cache-buster version from the public-shop cache when available
  // so PDP refreshes immediately after admin edits without disabling CDN cache.
  const version = id ? getProductVersion(id) : undefined;
  const { data, isLoading } = useQuery({
    queryKey: ["product", id, version ?? null],
    queryFn: () => fetchProductData(id!, version),
    enabled: !!id,
    staleTime: 60_000,
    refetchOnReconnect: true,
  });

  const productImages = data?.product?.images;
  const productVariantImages = data?.variantRows?.map((row) => row.image_url).filter(Boolean);
  // Warm the other gallery + variant photos so swapping is instant, but only
  // once the page has loaded (they must not compete with the main photo), and
  // at the same responsive size the gallery will show (a fixed 800px copy was
  // a second download of every photo).
  const warmKey = [...(productImages ?? []), ...(productVariantImages ?? [])].join("|");
  useEffect(() => {
    const sources = [...new Set(warmKey.split("|").filter(Boolean))].slice(1);
    if (!sources.length) return;
    let cancelled = false;
    const warm = () => {
      if (cancelled) return;
      for (const src of sources) {
        const attrs = cdnImageAttrs(src, getR2Base());
        const img = new Image();
        img.decoding = "async";
        if (attrs?.srcSet) {
          img.sizes = PDP_MAIN_IMAGE_SIZES;
          img.srcset = attrs.srcSet;
        }
        img.src = attrs?.src ?? resolveImageSrc(src, 800);
      }
    };
    const idle = () => ("requestIdleCallback" in window ? window.requestIdleCallback(warm, { timeout: 3000 }) : setTimeout(warm, 1500));
    if (document.readyState === "complete") idle();
    else window.addEventListener("load", idle, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", idle);
    };
  }, [warmKey]);

  // Track ViewContent only when the user actually lands on this product.
  const product = data?.product;
  const categoryNameForTrack = data?.categoryName;
  const brandNameForMeta = (data as any)?.brandName as string | undefined;
  // Same values the Worker writes into the HTML for link previews.
  const pageMeta = productMeta(product, id);
  const cleanDescription = pageMeta.description;
  const absoluteImage = shareImageUrl(pageMeta.image, getR2Base(), SITE_URL);
  useDocumentMeta(pageMeta);

  // Product + BreadcrumbList JSON-LD — derived entirely from existing DB data.
  const productJsonLd = product
    ? (() => {
        const sale = (product as any).sale_price as number | null | undefined;
        const price = sale && sale > 0 ? sale : (product as any).price;
        const inStock = ((product as any).stock ?? 0) > 0;
        const node: any = {
          "@context": "https://schema.org",
          "@type": "Product",
          name: product.name,
          description: cleanDescription,
          sku: (product as any).sku || undefined,
          image: absoluteImage ? [absoluteImage] : undefined,
          url: `${SITE_URL}/product/${(product as any).slug || product.id}`,
          brand: brandNameForMeta ? { "@type": "Brand", name: brandNameForMeta } : undefined,
          category: categoryNameForTrack || undefined,
          offers: price != null ? {
            "@type": "Offer",
            price: Number(price).toFixed(2),
            priceCurrency: "BDT",
            availability: inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            url: `${SITE_URL}/product/${(product as any).slug || product.id}`,
          } : undefined,
        };
        const rating = (product as any).rating as number | undefined;
        const reviewCount = (product as any).review_count as number | undefined;
        if (rating && reviewCount && reviewCount > 0) {
          node.aggregateRating = {
            "@type": "AggregateRating",
            ratingValue: Number(rating).toFixed(1),
            reviewCount: reviewCount,
          };
        }
        // Strip undefined keys
        Object.keys(node).forEach((k) => node[k] === undefined && delete node[k]);
        if (node.offers) Object.keys(node.offers).forEach((k) => node.offers[k] === undefined && delete node.offers[k]);
        return node;
      })()
    : null;
  useJsonLd("ld-product", productJsonLd);

  const breadcrumbJsonLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
          { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE_URL}/shop` },
          ...(categoryNameForTrack
            ? [{ "@type": "ListItem", position: 3, name: categoryNameForTrack, item: `${SITE_URL}/shop?category=${encodeURIComponent(categoryNameForTrack)}` }]
            : []),
          { "@type": "ListItem", position: categoryNameForTrack ? 4 : 3, name: product.name, item: `${SITE_URL}/product/${(product as any).slug || product.id}` },
        ],
      }
    : null;
  useJsonLd("ld-breadcrumb", breadcrumbJsonLd);

  useEffect(() => {
    if (!product) return;
    trackViewContent({
      id: product.id,
      name: product.name,
      price: (product as any).sale_price || product.price,
      category: categoryNameForTrack || undefined,
    });
  }, [product?.id, categoryNameForTrack]);

  useEffect(() => {
    const el = ctaRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [data?.product?.id]);

  useEffect(() => {
    const sticky = galleryStickyRef.current;
    const info = productInfoRef.current;
    if (!sticky || !info) return;

    let frame = 0;
    const applyGallerySizing = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (window.innerWidth < 1024) {
          sticky.style.removeProperty("--pdp-main-image-height");
          return;
        }

        // Header is h-20 (80px) on desktop + premium gap (20px)
        const stickyTop = 100;
        const viewportPadding = 24;
        const thumbnailHeight = galleryThumbsRef.current?.getBoundingClientRect().height ?? 0;
        const thumbnailGap = thumbnailHeight > 0 ? 12 : 0;
        const stickyTopInViewport = Math.max(stickyTop, sticky.getBoundingClientRect().top);
        const availableHeight = Math.max(460, window.innerHeight - stickyTopInViewport - viewportPadding);
        const infoHeight = info.getBoundingClientRect().height;
        const desiredGalleryHeight = Math.min(infoHeight, availableHeight);
        const maxImageHeight = Math.max(360, availableHeight - thumbnailHeight - thumbnailGap);
        const imageHeight = Math.min(
          Math.max(360, desiredGalleryHeight - thumbnailHeight - thumbnailGap),
          maxImageHeight
        );

        sticky.style.setProperty("--pdp-main-image-height", `${Math.round(imageHeight)}px`);
      });
    };

    applyGallerySizing();
    window.addEventListener("resize", applyGallerySizing);
    const observer = new ResizeObserver(applyGallerySizing);
    observer.observe(info);
    if (galleryThumbsRef.current) observer.observe(galleryThumbsRef.current);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", applyGallerySizing);
      observer.disconnect();
    };
  }, [data?.product?.id, productImages?.length]);

  if (isLoading && !data) {
    return <ProductDetailsSkeleton />;
  }
  if (!data) {
    return <ProductDetailsSkeleton />;
  }

  const { categoryName, brandName, tabs, faqs, productOffers, reviews, related, variantRows, deliveryZones, showShipmentDetails, showWhyChooseUs, whyCards, productDetails } = data;
  const showBrand = (product as any).show_brand !== false;

  if (!product) {
    return (
      <div className="section-padding section-spacing text-center">
        <p className="apple-body">Product not found.</p>
        <Link to="/shop" className="inline-flex items-center gap-2 text-sm font-medium text-primary mt-4"><ArrowLeftIcon size={16} /> Back to shop</Link>
      </div>
    );
  }

  // ── Modern variant system (product_variants rows) with legacy fallback ──
  // option_groups column was dropped — derive groups from variant rows themselves.
  const declaredGroups = parseOptionGroups((product as any).option_groups);
  const derivedGroups: typeof declaredGroups = (() => {
    if (declaredGroups.length > 0) return declaredGroups;
    const map: Record<string, Set<string>> = {};
    variantRows.forEach((r) =>
      Object.entries(r.option_values || {}).forEach(([k, v]) => {
        (map[k] ||= new Set<string>()).add(String(v));
      })
    );
    return Object.entries(map).map(([name, values]) => ({
      name, values: [...values], type: "text" as const, show_on_card: true,
    }));
  })();
  const optionGroups = derivedGroups;
  const useModernVariants = optionGroups.length > 0 && variantRows.length > 0;

  // Legacy parsed variants (only used if no option_groups defined)
  const legacyVariants = useModernVariants
    ? []
    : ((product.variants as any[]) ?? []).map((v: any) => {
        const options = (v.options || []).map((o: any) =>
          typeof o === "string" ? { value: o, price: null, image_index: null } : o
        );
        return { type: v.type, same_price: v.same_price !== false, options };
      });

  const variantTypes = useModernVariants ? optionGroups.map((g) => g.name) : legacyVariants.map((v) => v.type);
  const hasUnselectedVariants = variantTypes.some((t) => !selectedVariants[t]);

  const selectedVariantSummary = variantTypes
    .map((t) => (selectedVariants[t] ? `${t}: ${selectedVariants[t]}` : null))
    .filter(Boolean)
    .join(" • ");

  const hasDiscount = product.sale_price && product.sale_price < product.price;
  const basePrice = hasDiscount ? product.sale_price! : product.price;

  // Resolve effective price + stock from selected variant row (modern) or legacy options
  let resolvedRow: VariantRow | null = null;
  let variantPrice: number | null = null;
  let variantStock: number | null = null;
  if (useModernVariants && !hasUnselectedVariants) {
    resolvedRow = resolveVariantRow(variantRows, selectedVariants);
    if (resolvedRow) {
      variantPrice = effectiveRowPrice(resolvedRow);
      variantStock = resolvedRow.stock;
    }
  } else if (!useModernVariants) {
    for (const v of legacyVariants) {
      const selected = selectedVariants[v.type];
      if (!selected || v.same_price) continue;
      const opt = v.options.find((o: any) => o.value === selected);
      if (opt?.price != null) { variantPrice = opt.price; break; }
    }
  }

  // Filtered range: respects partial selection — only rows matching all currently
  // selected option values contribute to the displayed min/max.
  const candidateVariantRows = useModernVariants
    ? variantRows.filter((r) => {
        if (r.active === false) return false;
        for (const [k, v] of Object.entries(selectedVariants)) {
          if (v && r.option_values?.[k] !== v) return false;
        }
        return true;
      })
    : [];
  const priceRange = useModernVariants
    ? getVariantRowsPriceRange(product.price, candidateVariantRows)
    : getProductPriceRange(basePrice, product.variants);

  const variantOrigRange = candidateVariantRows.length > 0
    ? candidateVariantRows.reduce(
        (acc, row) => {
          const price = Number(row.price ?? 0);
          return { min: Math.min(acc.min, price), max: Math.max(acc.max, price) };
        },
        { min: Infinity, max: -Infinity },
      )
    : null;
  const variantAnySale = candidateVariantRows.some(
    (row) => row.sale_price != null && row.sale_price > 0 && row.sale_price < row.price,
  );

  // When variants exist but none is selected yet, product.price may be 0.
  // Show the variant range, or the single shared variant price if all rows match.
  const defaultVariantPrice = useModernVariants && candidateVariantRows.length > 0 ? priceRange.min : null;
  const variantOriginalPrice = resolvedRow ? resolvedRow.price : (variantOrigRange?.min ?? product.price);
  const variantHasSale = resolvedRow != null && resolvedRow.sale_price != null && resolvedRow.sale_price > 0 && resolvedRow.sale_price < resolvedRow.price;
  const currentPrice = variantPrice ?? defaultVariantPrice ?? basePrice;
  const compareAtPrice = resolvedRow ? variantOriginalPrice : (useModernVariants && variantOrigRange ? variantOrigRange.min : product.price);
  const showCompareAt = resolvedRow ? variantHasSale : (useModernVariants ? variantAnySale && !priceRange.hasRange : (product.sale_price != null && product.sale_price < product.price));
  const discountReferencePrice = resolvedRow ? compareAtPrice : (useModernVariants && variantOrigRange ? variantOrigRange.max : compareAtPrice);
  const discountPercent = discountReferencePrice > currentPrice ? Math.round(((discountReferencePrice - currentPrice) / discountReferencePrice) * 100) : 0;
  // Show a range whenever there's no resolved single variant price AND multiple
  // candidate prices remain (no selection OR partial selection).
  const showRange = priceRange.hasRange && variantPrice == null;
  const showRangeCompareAt = showRange && useModernVariants && variantAnySale && variantOrigRange != null;
  const galleryImages = (product.images ?? []).filter((src: string) => typeof src === "string" && src.trim().length > 0);
  const hasGalleryImages = galleryImages.length > 1;
  // If the resolved variant row has its own image_url not present in the gallery,
  // display it directly so the main image always reflects the selected variant.
  const hasSelectedVariantValues = Object.values(selectedVariants).some(Boolean);
  const variantImageOverride = (() => {
    if (!useModernVariants) return null;
    if (resolvedRow?.image_url) return resolvedRow.image_url;
    if (!hasSelectedVariantValues) return null;
    // Resolve the best matching active row given the partial selection.
    const partialMatch = variantRows.find((r) => {
      if (r.active === false) return false;
      if (!r.image_url) return false;
      for (const [k, sv] of Object.entries(selectedVariants)) {
        if (sv && r.option_values?.[k] !== sv) return false;
      }
      return true;
    });
    return partialMatch?.image_url ?? null;
  })();
  const baseMainImage = galleryImages[selectedImage] || galleryImages[0] || "/placeholder.svg";
  // Manual thumbnail/arrow selection takes precedence over variant-driven image override,
  // so the user can browse all gallery images after picking a variant.
  const mainImage = manualImagePick || variantImageOverride || baseMainImage;
  const visibleProductDetails = (productDetails ?? []).filter((d: any) => String(d?.label ?? "").trim() || String(d?.value ?? "").trim());
  const allTabs = tabs.map((t: any) => ({ label: t.title, content: t.content, display_style: t.display_style || "text" }));
  // When a variant row is fully resolved, use its stock.
  // Otherwise, if the product has variants, fall back to the sum of all
  // active variant stock so a product isn't marked sold-out just because
  // the product-level stock column is 0.
  const variantTotalStock = useModernVariants
    ? variantRows.reduce((sum, r) => sum + (r.active === false ? 0 : Number(r.stock ?? 0)), 0)
    : 0;
  const effectiveStock = variantStock ?? (useModernVariants ? variantTotalStock : (product.stock ?? 0));
  const isOutOfStock = effectiveStock <= 0;
  const maxQuantity = effectiveStock > 0 ? effectiveStock : 1;

  const avgRating = reviews.length > 0 ? reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length : product.rating;

  const showShippingText = (product as any).show_shipping_info !== false;
  const showStockStatus = (product as any).show_stock_status !== false;
  const showOffers = (product as any).show_offers !== false;
  const shippingText = `${CURRENCY_SYMBOL}${toBanglaDigits(2000)} + orders ship free`;
  const stockStatusText = "In stock — ready to ship";

  const buildCartLineId = () => {
    if (!selectedVariantSummary) return product.id;
    return `${product.id}::${selectedVariantSummary}`;
  };

  const handleAddToCart = () => {
    if (isOutOfStock || hasUnselectedVariants) return;
    addItem(
      {
        id: buildCartLineId(),
        productId: product.id,
        variantId: resolvedRow?.id,
        name: product.name,
        price: currentPrice,
        image: product.images?.[0] || "/placeholder.svg",
        variant: selectedVariantSummary || undefined,
      },
      quantity
    );
    trackAddToCart({ id: product.id, name: product.name, price: currentPrice, quantity, variant: selectedVariantSummary || undefined });
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 2000);
  };

  const handleBuyNow = () => {
    if (isOutOfStock || hasUnselectedVariants) return;
    useCartStore.getState().clearCart();
    addItem(
      {
        id: buildCartLineId(),
        productId: product.id,
        variantId: resolvedRow?.id,
        name: product.name,
        price: currentPrice,
        image: product.images?.[0] || "/placeholder.svg",
        variant: selectedVariantSummary || undefined,
      },
      quantity
    );
    navigate("/checkout");
  };

  return (
    <div className="page-enter">
      <ProductEntrance />
      {/* Back link (above grid so right column aligns with image top) */}
      <div className="section-padding pt-3 pb-2 sm:pt-4 sm:pb-3 lg:pt-4 lg:pb-3">
        <div className="max-w-[1320px] mx-auto">
          <Link to="/shop" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeftIcon size={16} /> Back to shop
          </Link>
        </div>
      </div>

      <div className="fade-up">
        {/* Main product grid */}
        <div className="section-padding pb-6 sm:pb-10">
          <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-5 sm:gap-6 lg:gap-14 max-w-[1320px] mx-auto items-start lg:items-stretch">
            {/* Images */}
            <div className="md:max-w-[560px] lg:max-w-none mx-auto w-full order-1 lg:order-1 lg:self-stretch">
              <div ref={galleryStickyRef} data-pdp-gallery className="lg:sticky lg:top-[100px] lg:self-start w-full space-y-3">
              <div className="relative group">
                <div
                  key={mainImage}
                  data-pdp-main-image
                  className="aspect-[4/5] md:aspect-[3/4] md:max-h-[calc(100vh-220px)] lg:aspect-auto lg:h-[var(--pdp-main-image-height,clamp(420px,calc(100vh-220px),620px))] mx-auto rounded-2xl lg:rounded-[20px] overflow-hidden bg-secondary/20 animate-fade-in"
                >
                  <CdnImage
                    src={mainImage}
                    alt={product.name}
                    className="w-full h-full object-cover object-center md:object-contain lg:object-contain transition-transform duration-500 ease-out group-hover:scale-[1.015]"
                    priority
                    preload
                    sizes={PDP_MAIN_IMAGE_SIZES}
                    width={600}
                    height={750}
                  />
                </div>

                {hasGalleryImages && (
                  <>
                    <button
                      type="button"
                      aria-label="Previous image"
                      onClick={() => {
                        const next = (selectedImage - 1 + galleryImages.length) % galleryImages.length;
                        setSelectedImage(next);
                        setManualImagePick(galleryImages[next] ?? null);
                      }}
                      className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-background/60 hover:bg-background/90 backdrop-blur-md border border-white/30 shadow-[0_6px_18px_-10px_rgba(0,0,0,0.25)] flex items-center justify-center text-foreground/80 hover:text-primary opacity-0 group-hover:opacity-100 hover:scale-105 transition-all duration-300 ease-out"
                    >
                      <ChevronDownIcon size={14} className="rotate-90" />
                    </button>
                    <button
                      type="button"
                      aria-label="Next image"
                      onClick={() => {
                        const next = (selectedImage + 1) % galleryImages.length;
                        setSelectedImage(next);
                        setManualImagePick(galleryImages[next] ?? null);
                      }}
                      className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 z-10 h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-background/60 hover:bg-background/90 backdrop-blur-md border border-white/30 shadow-[0_6px_18px_-10px_rgba(0,0,0,0.25)] flex items-center justify-center text-foreground/80 hover:text-primary opacity-0 group-hover:opacity-100 hover:scale-105 transition-all duration-300 ease-out"
                    >
                      <ChevronDownIcon size={14} className="-rotate-90" />
                    </button>
                  </>
                )}
              </div>

              {hasGalleryImages && (
                <div ref={galleryThumbsRef} data-pdp-thumbnails className="flex flex-wrap justify-center gap-2 sm:gap-2.5 md:gap-3">
                  {galleryImages.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setSelectedImage(i); setManualImagePick(img); }}
                      aria-label={`View image ${i + 1}`}
                      aria-current={i === selectedImage}
                      className={`group/thumb w-[48px] h-[60px] sm:w-[52px] sm:h-[64px] md:w-[56px] md:h-[70px] rounded-[8px] overflow-hidden border transition-all duration-300 ease-out bg-background ${
                        i === selectedImage
                          ? "border-primary/70 shadow-[0_0_0_2px_hsl(var(--primary)/0.10),0_4px_12px_-6px_hsl(var(--primary)/0.35)]"
                          : "border-border/30 hover:border-primary/40 opacity-80 hover:opacity-100"
                      }`}
                    >
                      <img
                        src={resolveImageSrc(img, 400)}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-300 ease-out group-hover/thumb:scale-[1.06]"
                        loading="lazy"
                        decoding="async"
                        width={80}
                        height={100}
                      />
                    </button>
                  ))}
                </div>
              )}
              </div>
            </div>

            {/* Product info */}
            <div ref={productInfoRef} data-pdp-info className="space-y-4 lg:space-y-3 lg:pt-4 lg:max-w-[520px] order-2 lg:order-2">
              {(categoryName || (showBrand && brandName)) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {categoryName && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] px-2.5 py-0.5 rounded-full bg-foreground/[0.05] text-foreground/80">
                      {categoryName}
                    </span>
                  )}
                  {showBrand && brandName && (
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">
                      {brandName}
                    </span>
                  )}
                </div>
              )}
              {((product as any).is_new_arrival || (product as any).best_seller) && (
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {(product as any).best_seller && (
                    <span className="inline-flex items-center bg-foreground text-background text-[10px] font-semibold tracking-[0.14em] uppercase px-2.5 py-1 ">Best seller</span>
                  )}
                  {(product as any).is_new_arrival && (
                    <span className="inline-flex items-center border border-foreground bg-background text-foreground text-[10px] font-semibold tracking-[0.18em] uppercase px-2.5 py-1 ">New arrival</span>
                  )}
                </div>
              )}
              <h1 className="text-[26px] sm:text-3xl lg:text-[34px] xl:text-[38px] font-display font-medium tracking-[-0.01em] text-foreground leading-[1.08]">{product.name}</h1>

              {reviews.length > 0 && product.review_count > 0 && (
                <div className="flex items-center gap-2.5">
                  <StarRating rating={product.rating} />
                  <span className="text-xs text-muted-foreground">({toBanglaDigits(product.review_count)} reviews)</span>
                </div>
              )}

              {/* Price — calm, baseline-aligned */}
              <div className="flex items-baseline gap-3 lg:pt-0">
                {showRange ? (
                  <span className="text-[22px] sm:text-[24px] lg:text-[24px] font-normal text-foreground tabular-nums tracking-tight">
                    {CURRENCY_SYMBOL}{toBanglaDigits(priceRange.min)} – {CURRENCY_SYMBOL}{toBanglaDigits(priceRange.max)}
                  </span>
                ) : (
                  <span className="text-[22px] sm:text-[24px] lg:text-[24px] font-normal text-foreground tabular-nums tracking-tight">{CURRENCY_SYMBOL}{toBanglaDigits(currentPrice)}</span>
                )}
                {showCompareAt && !showRange && (
                  <>
                    <span className="text-sm text-muted-foreground/60 line-through tabular-nums font-normal">
                      {useModernVariants && variantOrigRange && variantOrigRange.min !== variantOrigRange.max
                        ? <>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigRange.min)} – {CURRENCY_SYMBOL}{toBanglaDigits(variantOrigRange.max)}</>
                        : <>{CURRENCY_SYMBOL}{toBanglaDigits(compareAtPrice)}</>}
                    </span>
                    {discountPercent > 0 && <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-foreground/70">{toBanglaDigits(discountPercent)}% off</span>}
                  </>
                )}
                {showRangeCompareAt && variantOrigRange && (
                  <span className="text-sm text-muted-foreground/60 line-through tabular-nums font-normal">
                    {variantOrigRange.min === variantOrigRange.max
                      ? <>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigRange.min)}</>
                      : <>{CURRENCY_SYMBOL}{toBanglaDigits(variantOrigRange.min)} – {CURRENCY_SYMBOL}{toBanglaDigits(variantOrigRange.max)}</>}
                  </span>
                )}
              </div>

              {product.short_description && <p className="text-sm sm:text-[15px] lg:text-[13px] text-muted-foreground leading-[1.65] lg:leading-[1.5] font-normal whitespace-pre-line">{product.short_description}</p>}



              {/* Offer badges */}
              {showOffers && productOffers.length > 0 && (
                <div className="space-y-1">
                  {productOffers.map((offer: any) => {
                    let icon = <TagIcon size={11} />;
                    let colorClass = "from-[hsl(var(--offer-bg))] to-[hsl(var(--offer-bg)/0.4)] border-[hsl(var(--offer-border))] text-[hsl(var(--offer-text))]";
                    if (["buy_x_get_y", "buy_x_get_y_same", "buy_x_get_y_diff", "buy_x_get_y_free_delivery"].includes(offer.offer_type)) {
                      icon = <GiftIcon size={11} />;
                      colorClass = "from-[hsl(var(--gift-bg))] to-[hsl(var(--gift-bg)/0.4)] border-[hsl(var(--gift-border))] text-[hsl(var(--gift-text))]";
                    } else if (["buy_x_get_discount", "buy_x_get_off", "flat_percent"].includes(offer.offer_type)) {
                      icon = <PartyPopperIcon size={11} />;
                      colorClass = "from-[hsl(var(--nudge-bg))] to-[hsl(var(--nudge-bg)/0.4)] border-[hsl(var(--nudge-border))] text-[hsl(var(--nudge-text))]";
                    }
                    return (
                      <div key={offer.id} className={`flex items-center gap-2 bg-gradient-to-r ${colorClass} border rounded-lg px-3 py-1.5`}>
                        {icon}
                        <span className="text-[11px] font-medium">{offer.display_text}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Offer gamification */}
              {showOffers && product && (() => {
                const offerProductNames: Record<string, string> = { [product.id]: product.name };
                const offerProductPrices: Record<string, string | number> = { [product.id]: currentPrice };
                productOffers.forEach((o: any) => {
                  if (o.free_product_id) {
                    offerProductNames[o.free_product_id] = offerProductNames[o.free_product_id] || "Free item";
                  }
                });
                const { applied, nearQualifying } = simulateOffersForProduct(
                  product.id, quantity, currentPrice,
                  productOffers as ProductOffer[],
                  offerProductNames,
                  offerProductPrices as Record<string, number>
                );
                return (
                  <>
                    {nearQualifying.length > 0 && (
                      <div className="space-y-1">
                        {nearQualifying.map(({ offer, needed }) => {
                          const progress = Math.round(((offer.buy_quantity! - needed) / offer.buy_quantity!) * 100);
                          return (
                            <div key={offer.id} className="bg-gradient-to-r from-[hsl(var(--nudge-bg))] to-[hsl(var(--nudge-bg)/0.4)] border border-[hsl(var(--nudge-border))] rounded-lg px-3 py-1.5 flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-[hsl(var(--nudge-accent))] flex items-center justify-center flex-shrink-0">
                                <PartyPopperIcon size={10} className="text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] text-[hsl(var(--nudge-text))]">
                                  Add <span className="font-bold text-[hsl(var(--nudge-accent))]">{toBanglaDigits(needed)} more</span> → <span className="font-semibold">{offer.display_text}</span>
                                </p>
                                <div className="mt-1 h-1 bg-[hsl(var(--nudge-border)/0.5)] rounded-full overflow-hidden">
                                  <div className="h-full bg-gradient-to-r from-[hsl(var(--nudge-accent))] to-[hsl(var(--nudge-accent)/0.7)] rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {applied.length > 0 && (
                      <div className="space-y-1">
                        {applied.map((ao) => (
                          <div key={ao.offerId} className="bg-gradient-to-r from-[hsl(var(--gift-bg))] to-[hsl(var(--gift-bg)/0.4)] border border-[hsl(var(--gift-border))] rounded-lg px-3 py-1.5 flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-[hsl(var(--gift-accent))] flex items-center justify-center flex-shrink-0">
                              <GiftIcon size={10} className="text-white" />
                            </div>
                            <div className="text-[11px] text-[hsl(var(--gift-text))] leading-snug">
                              <span className="font-bold">Unlocked!</span> {ao.displayText}
                              {ao.freeItems.length > 0 && (
                                <span className="text-[hsl(var(--gift-accent))] font-semibold"> · {ao.freeItems.map((f) => `${toBanglaDigits(f.quantity)}x ${f.productName}`).join(", ")} Free</span>
                              )}
                              {ao.discountAmount > 0 && (
                                <span className="text-[hsl(var(--gift-accent))] font-bold"> · Save {CURRENCY_SYMBOL}{toBanglaDigits(ao.discountAmount.toFixed(0))}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Variants */}
              {useModernVariants
                ? optionGroups.map((g) => {
                    const isColor = g.type === "color";
                    // Hide values that have no active variant row matching current other selections.
                    // If filtering would leave zero values, fall back to all values so the option
                    // never silently disappears from the UI.
                    const filtered = g.values.filter((val) => {
                      return variantRows.some((r) => {
                        if (r.active === false) return false;
                        if (r.option_values?.[g.name] !== val) return false;
                        for (const [k, sv] of Object.entries(selectedVariants)) {
                          if (k === g.name) continue;
                          if (sv && r.option_values?.[k] !== sv) return false;
                        }
                        return true;
                      });
                    });
                    const visibleValues = filtered.length > 0 ? filtered : g.values;
                    if (visibleValues.length === 0) return null;
                    return (
                    <div key={g.name}>
                      <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80 mb-2 block">
                        {g.name}
                        {selectedVariants[g.name] ? <span className="ml-2 text-foreground/80 font-medium normal-case tracking-normal">{selectedVariants[g.name]}</span> : ""}
                      </label>

                      <div className="flex gap-2 flex-wrap">
                        {visibleValues.map((val) => {
                          const imgIdx = g.image_map?.[val];
                          const selected = selectedVariants[g.name] === val;
                          const hex = g.color_map?.[val];
                          // Per-variant image: find an active row that matches this option value
                          // and (when possible) the current other selections, then resolve its
                          // image_url against the gallery so clicking the chip swaps the gallery image.
                          const variantImageUrl = (() => {
                            const match =
                              variantRows.find((r) => {
                                if (r.active === false) return false;
                                if (r.option_values?.[g.name] !== val) return false;
                                for (const [k, sv] of Object.entries(selectedVariants)) {
                                  if (k === g.name) continue;
                                  if (sv && r.option_values?.[k] !== sv) return false;
                                }
                                return !!r.image_url;
                              }) ||
                              variantRows.find(
                                (r) => r.active !== false && r.option_values?.[g.name] === val && !!r.image_url,
                              );
                            return match?.image_url ?? null;
                          })();
                          const onClick = () => {
                            const nextSelected = { ...selectedVariants, [g.name]: val };
                            setSelectedVariants(nextSelected);
                            // Re-engage variant-driven image when the user changes a variant.
                            setManualImagePick(null);
                            if (variantImageUrl) {
                              const target = resolveImageSrc(variantImageUrl, 800);
                              const idx = galleryImages.findIndex((src: string) => src === variantImageUrl || resolveImageSrc(src, 800) === target);
                              if (idx >= 0) setSelectedImage(idx);
                            } else if (imgIdx != null && imgIdx < (product.images?.length ?? 0)) {
                              setSelectedImage(imgIdx);
                            }
                          };
                          if (isColor) {
                            return (
                              <button
                                key={val}
                                onClick={onClick}
                                title={val}
                                aria-label={val}
                                className={`relative w-9 h-9 rounded-full border transition-all duration-200 active:scale-95 touch-manipulation ${
                                  selected
                                    ? "border-primary ring-1 ring-primary/30 ring-offset-1 ring-offset-background"
                                    : "border-border/40 hover:border-primary/40"
                                }`}
                                style={{ background: hex || "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px" }}
                              />
                            );
                          }
                          if (g.type === "image") {
                              const previewUrl = variantImageUrl
                              || (imgIdx != null ? galleryImages[imgIdx] : null)
                              || galleryImages[0];
                            return (
                              <button
                                key={val}
                                onClick={onClick}
                                title={val}
                                aria-label={val}
                                className={`relative w-12 h-12 rounded-[4px] overflow-hidden border transition-all duration-200 active:scale-95 touch-manipulation ${
                                  selected
                                    ? "border-primary ring-1 ring-primary/30 ring-offset-1 ring-offset-background"
                                    : "border-border/40 hover:border-primary/40"
                                }`}
                              >
                                {previewUrl ? (
                                  <img src={resolveImageSrc(previewUrl, 400)} alt={val} className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <span className="flex items-center justify-center w-full h-full text-[10px] text-muted-foreground">{val}</span>
                                )}
                              </button>
                            );
                          }
                          return (
                            <button
                              key={val}
                              onClick={onClick}
                              className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-[4px] text-xs border transition-all duration-200 active:scale-95 touch-manipulation ${
                                selected
                                  ? "bg-foreground text-background border-foreground"
                                  : "border-border/60 text-foreground hover:border-foreground/40"
                              }`}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    );
                  })
                : legacyVariants.map((v) => (
                    <div key={v.type}>
                      <label className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80 mb-2 block">
                        {v.type}
                        {selectedVariants[v.type] ? <span className="ml-2 text-foreground/80 font-medium normal-case tracking-normal">{selectedVariants[v.type]}</span> : ""}
                      </label>

                      <div className="flex gap-2 flex-wrap">
                        {v.options.map((opt: any) => (
                          <button
                            key={opt.value}
                            onClick={() => {
                              setSelectedVariants({ ...selectedVariants, [v.type]: opt.value });
                              setManualImagePick(null);
                              if (opt.image_index != null && opt.image_index < (product.images?.length ?? 0)) {
                                setSelectedImage(opt.image_index);
                              }
                            }}
                            className={`px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-[4px] text-xs border transition-all duration-200 active:scale-95 touch-manipulation ${
                              selectedVariants[v.type] === opt.value
                                ? "bg-foreground text-background border-foreground"
                                : "border-border/60 text-foreground hover:border-foreground/40"
                            }`}
                          >
                            {opt.value}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

              {/* CTA stack — strict order: Quantity+Add to Cart → Buy Now → WhatsApp → Messenger */}
                <div ref={ctaRef} className="flex flex-col gap-2 lg:gap-1.5 pt-2 lg:pt-1">
                {/* Quantity + Add to Cart inline */}
                <div className="flex items-stretch gap-2">
                  <div className="flex items-center border border-border/60 rounded-[4px] shrink-0 bg-background">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-9 h-11 lg:h-10 flex items-center justify-center active:bg-secondary rounded-l-[4px] transition-colors touch-manipulation" disabled={isOutOfStock || hasUnselectedVariants} aria-label="Decrease quantity"><MinusIcon size={14} /></button>
                    <span className="w-9 text-center text-sm font-medium tabular-nums">{toBanglaDigits(quantity)}</span>
                    <button onClick={() => setQuantity(Math.min(maxQuantity, quantity + 1))} className="w-9 h-11 lg:h-10 flex items-center justify-center active:bg-secondary rounded-r-[4px] transition-colors touch-manipulation" disabled={isOutOfStock || hasUnselectedVariants} aria-label="Increase quantity"><PlusIcon size={14} /></button>
                  </div>
                  <button
                    onClick={handleAddToCart}
                    disabled={isOutOfStock || hasUnselectedVariants}
                    className="flex-1 min-w-0 h-11 lg:h-10 inline-flex items-center justify-center gap-1.5 border border-foreground/80 text-foreground rounded-[4px] text-[11px] sm:text-xs font-medium tracking-[0.08em] uppercase hover:bg-foreground hover:text-background active:scale-[0.98] transition-all duration-200 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addedFeedback ? (
                      <><CheckIcon size={14} className="text-primary" /> Added</>
                    ) : (
                      <><ShoppingBagIcon size={14} /> {isOutOfStock ? "Sold out" : hasUnselectedVariants ? "Select options" : "Add to cart"}</>
                    )}
                  </button>
                </div>
                {hasUnselectedVariants && <p className="text-[11px] text-muted-foreground -mt-0.5 tracking-[0.02em]">Select options to order</p>}

                {/* Buy Now (Primary) */}
                <button
                  onClick={handleBuyNow}
                  disabled={isOutOfStock || hasUnselectedVariants}
                  className="w-full h-11 lg:h-10 inline-flex items-center justify-center gap-1.5 bg-primary text-primary-foreground rounded-[4px] text-[11px] sm:text-xs font-medium tracking-[0.1em] uppercase hover:bg-primary/90 hover:shadow-[0_14px_32px_-16px_hsl(var(--primary)/0.55)] active:scale-[0.99] transition-all duration-200 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isOutOfStock ? "Sold out" : hasUnselectedVariants ? "Select options first" : "Buy now"}
                </button>

                {/* Direct order channels (WhatsApp / Messenger) — side-by-side on desktop when both enabled */}
                {(() => {
                  const productUrl = typeof window !== "undefined" ? `${window.location.origin}/product/${product.slug}` : `/product/${product.slug}`;
                  const validChannels = directOrderChannels
                    .filter((ch) => ch.identifier && ch.identifier.trim())
                    .map((ch) => {
                      const labelLower = (ch.label || "").toLowerCase();
                      const isWa = !(labelLower.includes("messenger") || labelLower.includes("facebook"));
                      let href = "";
                      if (isWa) {
                        const num = ch.identifier.replace(/[^0-9]/g, "");
                        if (!num) return null;
                        const message = (ch.message_template || "").replace(/\{product_name\}/g, product.name).replace(/\{product_url\}/g, productUrl);
                        href = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
                      } else {
                        href = `https://m.me/${ch.identifier.trim()}?ref=${encodeURIComponent(productUrl)}`;
                      }
                      return { ch, isWa, href };
                    })
                    .filter(Boolean) as { ch: any; isWa: boolean; href: string }[];

                  if (validChannels.length === 0) return null;
                  const twoUp = validChannels.length >= 2;

                  return (
                    <div className={twoUp ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : ""}>
                      {validChannels.map(({ ch, isWa, href }) => {
                        const icon = isWa ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.8-.7-1.4-1.6-1.6-1.9-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.7.4-.2.3-.9.9-.9 2.2 0 1.3.9 2.5 1.1 2.7.1.2 1.9 2.9 4.6 4 .6.3 1.1.4 1.5.5.6.2 1.2.2 1.7.1.5-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z"/><path d="M20.5 3.5A10 10 0 0 0 3.6 17.6L2 22l4.5-1.6A10 10 0 1 0 20.5 3.5zm-8.5 16a8.3 8.3 0 0 1-4.2-1.1l-.3-.2-2.7.9.9-2.6-.2-.3a8.3 8.3 0 1 1 6.5 3.3z"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2C6.5 2 2 6.1 2 11.2c0 2.9 1.5 5.5 3.8 7.2v3.5l3.5-1.9c1 .3 2 .4 3 .4 5.5 0 10-4.1 10-9.2C22 6.1 17.5 2 12 2zm1.1 12.4-2.5-2.7-5 2.7 5.4-5.7 2.6 2.7 4.9-2.7-5.4 5.7z"/></svg>
                        );
                        return (
                          <a
                            key={ch.id}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`w-full h-11 lg:h-10 inline-flex items-center justify-center gap-1.5 rounded-[4px] text-[11px] sm:text-xs font-medium tracking-[0.06em] uppercase transition-all duration-200 active:scale-[0.98] touch-manipulation text-white ${isWa ? "bg-[#1faa55] hover:bg-[#1c9a4d]" : "bg-[#1976d2] hover:bg-[#1668bd]"}`}
                          >
                            {icon}
                            {ch.label && ch.label !== "Order on WhatsApp" && ch.label !== "Order on Messenger" ? ch.label : (isWa ? "Order on WhatsApp" : "Order on Messenger")}
                          </a>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Shipment Details — from delivery_zones, toggle via shop_settings.pdp_show_shipment_details */}
              {showShipmentDetails && deliveryZones.length > 0 && (
                <div className="rounded-xl border border-border/30 bg-gradient-to-br from-secondary/30 to-background/50 p-3 sm:p-4 lg:p-3 shadow-[0_1px_2px_hsl(var(--foreground)/0.02)]">
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground block mb-2">Shipping</span>
                  <ul className="divide-y divide-border/40">
                    {deliveryZones.map((z: any) => {
                      const freeMin = z.free_delivery_minimum ?? z.free_shipping_threshold;
                      const charge = z.delivery_charge ?? z.shipping_cost ?? 0;
                      return (
                        <li key={z.id} className="py-2 lg:py-1.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs sm:text-sm font-medium text-foreground">{z.zone_name || z.name}</p>
                            {z.estimated_days && (
                              <p className="text-[11px] text-muted-foreground">{toBanglaDigits(z.estimated_days)} day delivery</p>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs sm:text-sm font-semibold text-foreground tabular-nums">
                              {CURRENCY_SYMBOL}{toBanglaDigits(Number(charge).toFixed(0))}
                            </p>
                            {freeMin != null && Number(freeMin) > 0 && (
                              <p className="text-[10px] text-primary font-medium">
                                {CURRENCY_SYMBOL}{toBanglaDigits(Number(freeMin).toFixed(0))} + ships free
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {/* Product details — brand (first) + custom rows (admin order) + stock (last) */}
              {((showBrand && brandName) || showStockStatus || visibleProductDetails.length > 0) && (
                <div className="pt-3 lg:pt-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground block mb-2">Details</span>
                  <dl className="flex flex-col gap-y-1.5">
                    {showBrand && brandName && (
                      <div className="flex items-baseline gap-2 text-[12.5px] sm:text-[13px]">
                        <dt className="text-muted-foreground/80">Brand:</dt>
                        <dd className="text-foreground/90 font-medium">{brandName}</dd>
                      </div>
                    )}
                    {visibleProductDetails.map((d: any, index: number) => (
                      <div key={d.id} className="flex items-baseline gap-2 text-[12.5px] sm:text-[13px]">
                        <dt className="text-muted-foreground/80">{d.label || `Detail ${index + 1}`}:</dt>
                        <dd className="text-foreground/90 font-medium">{d.value}</dd>
                      </div>
                    ))}
                    {showStockStatus && (
                      <div className="flex items-center gap-2 text-[12.5px] sm:text-[13px]">
                        <span
                          className={`relative inline-flex items-center justify-center w-2 h-2 rounded-full ${effectiveStock > 10 ? "bg-success" : effectiveStock > 0 ? "bg-star" : "bg-destructive"}`}
                          aria-hidden
                        >
                          {effectiveStock > 0 && (
                            <span
                              className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${effectiveStock > 10 ? "bg-success" : "bg-star"}`}
                            />
                          )}
                        </span>
                        <span className="text-foreground/90 font-medium leading-none">
                          {effectiveStock > 10 ? stockStatusText : effectiveStock > 0 ? `Only ${toBanglaDigits(effectiveStock)} left in stock` : "Sold out"}
                        </span>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Description — moved under Details */}
              {product.description && String(product.description).trim().length > 0 && (
                <div className="pt-3 lg:pt-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground block mb-2">Description</span>
                  <p className="text-[13px] sm:text-[14px] lg:text-[13px] text-foreground/70 leading-[1.7] lg:leading-[1.55] whitespace-pre-line tracking-[-0.005em] font-normal">
                    {product.description}
                  </p>
                </div>
              )}

              {/* Tabs (accordion) — architectural divide-y */}
              {allTabs.length > 0 && (
                <div className="pt-4 lg:pt-2">
                  <Accordion type="multiple" defaultValue={[]} className="divide-y divide-foreground/10">
                    {allTabs.map((tab, i) => {
                      const content = (tab.content || "").trim();
                      const style = tab.display_style || 'text';
                      const lines = (style === 'list' || style === 'highlight' || style === 'bullet')
                        ? content.split(/\n/).map((l: string) => l.trim().replace(/^[•\-–—]\s*/, "")).filter(Boolean)
                        : [];

                      return (
                        <AccordionItem key={i} value={`tab-${i}`} className="border-b-0 px-0">
                          <AccordionTrigger className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-foreground py-4 lg:py-3 hover:no-underline [&>svg]:hidden group">
                            <span>{tab.label}</span>
                            <span className="text-base font-light text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-45">+</span>
                          </AccordionTrigger>
                          <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pb-4">
                            {(style === 'list' || style === 'bullet') ? (
                              <ul className="space-y-2 list-none p-0 m-0">
                                {lines.map((line: string, li: number) => (
                                  <li key={li} className="flex items-start gap-3 leading-[1.65]">
                                    <span className="w-[4px] h-[4px] rounded-full bg-foreground/25 mt-[6px] flex-shrink-0" />
                                    <span className="text-foreground/70">{line}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : style === 'highlight' ? (
                              <div className="space-y-1">
                                {lines.map((line: string, li: number) => (
                                  <div key={li} className="border-l-2 border-primary/30 pl-3 py-1 text-foreground/70 leading-[1.65]">
                                    {line}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="whitespace-pre-line text-foreground/70 font-normal leading-[1.7]">{content}</p>
                            )}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              )}

              {/* FAQ */}
              {faqs.length > 0 && (
                <ScrollScene variant="rise" intensity={0.8} className="w-full pt-4 lg:pt-2">
                  <div className="w-full">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80 block mb-2">Frequently Asked Questions</span>
                    <Accordion type="multiple" defaultValue={[]} className="divide-y divide-foreground/10">
                      {faqs.map((faq: any) => (
                        <AccordionItem key={faq.id} value={faq.id} className="border-b-0 px-0">
                          <AccordionTrigger className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.22em] text-foreground py-4 lg:py-3 hover:no-underline text-left [&>svg]:hidden group">
                            <span>{faq.question}</span>
                            <span className="text-base font-light text-muted-foreground transition-transform duration-300 group-data-[state=open]:rotate-45 ml-auto">+</span>
                          </AccordionTrigger>
                          <AccordionContent className="text-xs sm:text-sm text-muted-foreground leading-relaxed pb-4">
                            {faq.answer}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </ScrollScene>
              )}
            </div>
          </div>
        </div>

        {/* Reviews */}
        {reviews.length > 0 && (
          <section className="section-padding pt-4 sm:pt-6 pb-6 sm:pb-10 border-t border-foreground/10">
            <div className="max-w-[1200px] mx-auto">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/80">Reviews</span>
                <span className="text-[11px] tabular-nums text-muted-foreground/70">({toBanglaDigits(reviews.length)})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {reviews.map((review: any) => (
                  <div key={review.id} className="bg-background border border-border/60 rounded-[4px] p-3.5 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground truncate">{review.customer_name || "Verified buyer"}</p>
                        <p className="text-[11px] text-muted-foreground/70 tabular-nums">{review.created_at ? new Date(review.created_at).toLocaleDateString() : ""}</p>
                      </div>
                      <StarRating rating={review.rating} size={11} />
                    </div>
                    {(review.comment || review.review) && (
                      <p className="text-[12.5px] text-muted-foreground leading-relaxed whitespace-pre-line">"{review.comment || review.review}"</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Why Choose Us — toggle via shop_settings.pdp_show_why_choose_us */}
        {showWhyChooseUs && whyCards.length > 0 && (
          <ScrollScene variant="cinematic" intensity={0.85}>
          <section className="section-padding pb-6 sm:pb-10">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {whyCards.map((card: any, idx: number) => (
                <div key={card.id} className="text-center p-3 sm:p-4 glass-card rounded-2xl hover:-translate-y-0.5 transition-transform duration-300">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-2 sm:mb-3 animate-float" style={{ animationDelay: `${idx * 0.5}s` }}>
                    <DynamicIcon name={card.icon_name || "Shield"} className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-semibold text-foreground mb-1">{card.title}</h3>
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed">{card.description}</p>
                </div>
              ))}
            </div>
          </section>
          </ScrollScene>
        )}


        {/* Related products */}
        {related.length > 0 && (
          <ScrollScene variant="cinematic" intensity={1}>
          <div className="section-padding py-10 sm:py-14 border-t border-foreground/10">
            <h3 className="text-[11px] sm:text-xs font-semibold uppercase tracking-[0.3em] text-foreground text-center mb-6 sm:mb-8">You may also like</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 xl:gap-5">
              {related.map((p: any) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  categoryName={categoryName}
                  variantPriceMin={p._variantPriceMin ?? null}
                  variantPriceMax={p._variantPriceMax ?? null}
                  variantOrigPriceMin={p._variantOrigPriceMin ?? null}
                  variantOrigPriceMax={p._variantOrigPriceMax ?? null}
                />
              ))}

            </div>
          </div>
          </ScrollScene>
        )}
      </div>

      {/* Desktop floating purchase bar — appears when main CTA scrolls out of view */}
      <div
        className={`hidden lg:block fixed bottom-3 left-1/2 -translate-x-1/2 z-40 transition-all duration-200 ${
          showStickyBar ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-3 pointer-events-none"
        }`}
        aria-hidden={!showStickyBar}
      >
        <div className="flex items-center gap-3 pl-2.5 pr-2.5 py-1.5 rounded-full bg-background/95 backdrop-blur-xl border border-border/60 shadow-[0_14px_40px_-16px_hsl(153_64%_8%/0.32)] max-w-[700px]">
          <div className="flex items-center gap-2.5 min-w-0 pl-1">
            <img src={resolveImageSrc(mainImage, 400)} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate max-w-[200px]">{product.name}</p>
              <p className="text-xs font-semibold text-foreground tabular-nums">
                {CURRENCY_SYMBOL}{toBanglaDigits(currentPrice)}
                {showCompareAt && !showRange && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground/70 line-through font-normal">{CURRENCY_SYMBOL}{toBanglaDigits(compareAtPrice)}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleAddToCart}
              disabled={isOutOfStock || hasUnselectedVariants}
              className="h-8 px-3 inline-flex items-center justify-center gap-1.5 border border-foreground/80 text-foreground rounded-[2px] text-[11px] font-medium tracking-[0.04em] uppercase hover:bg-foreground hover:text-background transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ShoppingBagIcon size={12} /> Add to cart
            </button>
            <button
              onClick={handleBuyNow}
              disabled={isOutOfStock || hasUnselectedVariants}
              className="h-8 px-4 inline-flex items-center justify-center bg-primary text-primary-foreground rounded-[2px] text-[11px] font-semibold tracking-[0.06em] uppercase hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isOutOfStock ? "Sold out" : "Buy now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
