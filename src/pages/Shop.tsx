import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useStaggerIn } from "@/hooks/useMotion";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as SliderPrimitive from "@radix-ui/react-slider";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { SearchIcon, ChevronDownIcon, TagIcon, SlidersIcon, XIcon } from "@/components/ui/icons";
import { trackSearch } from "@/lib/trackingEvents";
import { PublicApi } from "@/lib/publicApi";
import { useStorefrontVersion } from "@/lib/storefrontCache";
import { normalizeSort } from "@/lib/shopSort";
import ProductCard from "@/components/ProductCard";
import type { ActiveOffer } from "@/lib/offers";
import { CURRENCY_SYMBOL, toBanglaDigits } from "@/lib/currency";
import type { Product, Category } from "@/types/database";

import { ShopPageSkeleton } from "@/components/ui/page-skeletons";
import { useDocumentMeta, useJsonLd } from "@/hooks/useDocumentMeta";
import { ScrollScene } from "@/components/ui/scroll-scene";
import { SITE_URL } from "@/config/site";

type Availability = "all" | "in" | "out";

const Shop = () => {
  const storefrontVersion = useStorefrontVersion();

  const { data: shopData, isLoading } = useQuery({
    queryKey: ["public-shop", storefrontVersion ?? "v0"],
    queryFn: () => PublicApi.shop(storefrontVersion),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: layout } = useQuery({
    queryKey: ["public-layout", storefrontVersion ?? "v0"],
    queryFn: () => PublicApi.layout(storefrontVersion),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: home } = useQuery({
    queryKey: ["public-home", storefrontVersion ?? "v0"],
    queryFn: () => PublicApi.home(storefrontVersion),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const data = useMemo(() => {
    if (!shopData || !layout) return undefined;
    const settings = (layout as any).shopSettings ?? {};
    return {
      products: ((shopData as any).products ?? []) as Product[],
      variantRanges: (shopData as any).variantRanges ?? {},
      categories: ((layout as any).categories ?? []) as Category[],
      brands: ((layout as any).brands ?? []) as Array<{ id: string; name: string; slug: string }>,
      settings: {
        search_enabled: settings.search_enabled !== false,
        sorting_enabled: settings.sorting_enabled !== false,
        default_sorting: normalizeSort(settings.default_sorting),
        card_cta_mode: settings.card_cta_mode || "view_details",
      },
      activeOffers: ((home as any)?.activeOffers ?? []) as ActiveOffer[],
    };
  }, [shopData, layout, home]);

  const grid = useStaggerIn<HTMLDivElement>("stagger-grid");
  const touchStartY = useRef<number | null>(null);

  const products = data?.products ?? [];
  const variantRanges = data?.variantRanges ?? {};
  const categories = data?.categories ?? [];
  const brandsList = data?.brands ?? [];
  const settings = data?.settings ?? { search_enabled: true, sorting_enabled: true, default_sorting: "featured", card_cta_mode: "view_details" };
  const activeOffers = data?.activeOffers ?? [];

  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<string>(settings.default_sorting || "featured");
  const [category, setCategory] = useState(() => searchParams.get("category") || "All");
  const [brand, setBrand] = useState(() => searchParams.get("brand") || "All");
  const [availability, setAvailability] = useState<Availability>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const getProductMinPrice = useCallback((p: Product) => {
    const r = variantRanges[p.id];
    return r?.min != null ? Number(r.min) : (p.sale_price || p.price);
  }, [variantRanges]);

  const getProductMaxPrice = useCallback((p: Product) => {
    const r = variantRanges[p.id];
    return r?.max != null ? Number(r.max) : (p.sale_price || p.price);
  }, [variantRanges]);

  // Price range from products, respecting variant-level prices.
  const priceBounds = useMemo(() => {
    if (!products.length) return { min: 0, max: 3000 };
    const prices = products.flatMap((p) => [getProductMinPrice(p), getProductMaxPrice(p)]);
    const min = Math.floor(Math.min(...prices));
    const max = Math.ceil(Math.max(...prices));
    return { min, max: Math.max(max, min + 1) };
  }, [products, getProductMinPrice, getProductMaxPrice]);

  const [priceRange, setPriceRange] = useState<[number, number]>([priceBounds.min, priceBounds.max]);
  const initedPrice = useRef(false);
  useEffect(() => {
    if (!initedPrice.current && products.length) {
      setPriceRange([priceBounds.min, priceBounds.max]);
      initedPrice.current = true;
    }
  }, [priceBounds.min, priceBounds.max, products.length]);

  useEffect(() => {
    const urlCat = searchParams.get("category");
    if (urlCat) setCategory(urlCat);
    const urlBrand = searchParams.get("brand");
    if (urlBrand) setBrand(urlBrand);
    const urlSearch = searchParams.get("q");
    if (urlSearch != null) setSearch(urlSearch);
  }, [searchParams]);

  // Sync sort with admin's configured default once settings arrive.
  const sortSynced = useRef(false);
  useEffect(() => {
    if (!sortSynced.current && data?.settings?.default_sorting) {
      setSort(data.settings.default_sorting);
      sortSynced.current = true;
    }
  }, [data?.settings?.default_sorting]);


  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length >= 3) {
      searchTimerRef.current = setTimeout(() => trackSearch(value.trim()), 800);
    }
  }, []);
  useEffect(() => () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }, []);

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [categories]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    if (category !== "All") {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
      const cat = categories.find(
        (c: any) => c.name === category || c.slug === category || norm(c.name) === norm(category),
      );
      if (cat) list = list.filter((p) => p.category_id === cat.id);
    }
    if (brand !== "All") {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
      const br = brandsList.find(
        (b: any) => b.name === brand || b.slug === brand || norm(b.name) === norm(brand),
      );
      if (br) list = list.filter((p: any) => p.brand_id === br.id);
    }
    list = list.filter((p) => {
      const min = getProductMinPrice(p);
      const max = getProductMaxPrice(p);
      return max >= priceRange[0] && min <= priceRange[1];
    });
    if (availability === "in") list = list.filter((p) => (p.stock ?? 0) > 0);
    if (availability === "out") list = list.filter((p) => (p.stock ?? 0) <= 0);
    if (sort === "price-asc") list.sort((a, b) => getProductMinPrice(a) - getProductMinPrice(b));
    if (sort === "price-desc") list.sort((a, b) => getProductMaxPrice(b) - getProductMaxPrice(a));
    if (sort === "newest") list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return list;
  }, [search, sort, category, brand, availability, priceRange, products, categories, brandsList, getProductMinPrice, getProductMaxPrice]);

  // Resolve the active category (when ?category= filter is applied) to drive SEO metadata.
  const activeCategory = useMemo(() => {
    if (category === "All") return null;
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
    return (
      categories.find(
        (c: any) => c.name === category || c.slug === category || norm(c.name) === norm(category),
      ) ?? null
    );
  }, [category, categories]);

  const seoTitle = activeCategory
    ? ((activeCategory as any).meta_title || `${(activeCategory as any).name} — Kovo`)
    : "Shop — Kovo";
  const seoDescription = activeCategory
    ? ((activeCategory as any).meta_description
        || `Browse ${(activeCategory as any).name} from Kovo. Cash on delivery across Bangladesh.`)
    : "Shop Kovo bags, wallets and accessories. Cash on delivery across Bangladesh.";
  const seoImage = activeCategory
    ? ((activeCategory as any).featured_image_url || (activeCategory as any).image_url || undefined)
    : undefined;
  const absoluteSeoImage = seoImage
    ? (seoImage.startsWith("http") ? seoImage : `${SITE_URL}${seoImage.startsWith("/") ? "" : "/"}${seoImage}`)
    : undefined;
  const canonicalPath = activeCategory
    ? `/shop?category=${encodeURIComponent((activeCategory as any).slug || (activeCategory as any).name)}`
    : "/shop";

  useDocumentMeta({
    title: seoTitle,
    description: String(seoDescription).slice(0, 160),
    canonicalPath,
    image: absoluteSeoImage,
  });

  useJsonLd("ld-collection", activeCategory ? {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: (activeCategory as any).name,
    description: String(seoDescription).slice(0, 200),
    url: `${SITE_URL}${canonicalPath}`,
  } : {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Shop",
    url: `${SITE_URL}/shop`,
  });

  useJsonLd("ld-breadcrumb-shop", {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: "Shop", item: `${SITE_URL}/shop` },
      ...(activeCategory ? [{
        "@type": "ListItem", position: 3,
        name: (activeCategory as any).name,
        item: `${SITE_URL}${canonicalPath}`,
      }] : []),
    ],
  });

  if (isLoading && !data) return <ShopPageSkeleton />;
  if (!data) return <ShopPageSkeleton />;

  const FiltersPanel = (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <SlidersIcon size={16} className="text-foreground/70" />
          <h2 className="text-base font-semibold tracking-tight text-foreground">Filters</h2>
        </div>
        <p className="text-xs text-muted-foreground">{toBanglaDigits(filtered.length)} products found</p>
      </div>

      {/* Price */}
      <div>
        <h3 className="text-sm font-medium text-foreground mb-3">Price ({CURRENCY_SYMBOL})</h3>
        <SliderPrimitive.Root
          min={priceBounds.min}
          max={priceBounds.max}
          step={Math.max(1, Math.round((priceBounds.max - priceBounds.min) / 100))}
          value={priceRange}
          onValueChange={(v) => setPriceRange([v[0], v[1]] as [number, number])}
          className="relative flex w-full touch-none select-none items-center"
        >
          <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-foreground/10">
            <SliderPrimitive.Range className="absolute h-full bg-primary" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-primary bg-background shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30" />
        </SliderPrimitive.Root>
        <div className="mt-3 rounded-full bg-foreground/[0.04] text-center py-2 text-xs text-foreground/80">
          {CURRENCY_SYMBOL}{toBanglaDigits(priceRange[0])} — {CURRENCY_SYMBOL}{toBanglaDigits(priceRange[1])}
        </div>
      </div>

      {categories.length > 0 && (
        <div className="pt-5">
          <h3 className="text-sm font-medium text-foreground mb-3">Categories</h3>
          <div className="flex flex-col gap-2.5">
            <RadioRow label="All" checked={category === "All"} onSelect={() => setCategory("All")} />
            {categories.map((c) => {
              const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
              const isActive = category === c.name || category === c.slug || norm(category) === norm(c.name);
              return (
                <RadioRow
                  key={c.id}
                  label={c.name}
                  checked={isActive}
                  onSelect={() => setCategory(c.name)}
                />
              );
            })}

          </div>
        </div>
      )}

      {brandsList.length > 0 && (
        <div className="pt-5">
          <h3 className="text-sm font-medium text-foreground mb-3">Brands</h3>
          <div className="flex flex-col gap-2.5">
            <RadioRow label="All" checked={brand === "All"} onSelect={() => setBrand("All")} />
            {brandsList.map((b: any) => {
              const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
              const isActive = brand === b.name || brand === b.slug || norm(brand) === norm(b.name);
              return (
                <RadioRow
                  key={b.id}
                  label={b.name}
                  checked={isActive}
                  onSelect={() => setBrand(b.name)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="pt-5">
        <h3 className="text-sm font-medium text-foreground mb-3">Availability</h3>
        <div className="flex flex-col gap-2.5">
          <RadioRow label="All" checked={availability === "all"} onSelect={() => setAvailability("all")} />
          <RadioRow label="In Stock" checked={availability === "in"} onSelect={() => setAvailability("in")} />
          <RadioRow label="Out of Stock" checked={availability === "out"} onSelect={() => setAvailability("out")} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="section-padding pt-6 sm:pt-10 lg:pt-14 pb-16 sm:pb-24 lg:pb-[120px] page-enter">
      <ScrollScene variant="rise" intensity={0.9}>
        <h1 className="apple-heading-lg text-foreground text-center mb-2">Shop</h1>
        <p className="apple-body text-center mb-3">Discover our full collection.</p>
        <div className="premium-divider max-w-[60px] mx-auto mb-6 sm:mb-8" />
      </ScrollScene>

      {activeOffers.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center mb-6 sm:mb-8">
          {activeOffers.map((offer) => (
            <div key={offer.id} className="inline-flex items-center gap-1.5 glass-card trust-badge px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-[11px] sm:text-xs font-medium text-foreground">
              <TagIcon size={12} className="text-primary flex-shrink-0" />
              <span className="truncate">{offer.name}: {toBanglaDigits(offer.discount_value)}{offer.discount_type === "percentage" ? "%" : ` ${CURRENCY_SYMBOL}`} off</span>
              {offer.apply_to === "entire_store" && <span className="text-muted-foreground ml-1 hidden sm:inline">all products</span>}
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      {settings.search_enabled && (
        <div className="relative max-w-2xl mx-auto mb-6 sm:mb-10">
          <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search products…"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full bg-secondary/70 border border-border/40 rounded-full pl-12 pr-5 py-3.5 text-base sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition-all"
          />
        </div>
      )}

      <div className="flex gap-6 lg:gap-8 max-w-[1400px] mx-auto">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-[260px] flex-shrink-0">
          <div className="glass-card rounded-3xl p-6 sticky top-24">
            {FiltersPanel}
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {/* Top bar: count + filter button (mobile) + sort */}
          <div className="flex items-center justify-between gap-3 mb-5 sm:mb-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="lg:hidden inline-flex items-center gap-2 rounded-full bg-secondary/70 border border-border/40 px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent/60 transition-colors"
              >
                <SlidersIcon size={16} />
                Filters
              </button>
              <p className="hidden lg:block text-sm text-muted-foreground">{toBanglaDigits(filtered.length)} products</p>
            </div>
            {settings.sorting_enabled && (
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="appearance-none bg-secondary/70 border border-border/40 rounded-full pl-4 pr-9 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 cursor-pointer transition-all"
                >
                  <option value="featured">Featured</option>
                  <option value="newest">Newest</option>
                  <option value="price-asc">Price: Low → High</option>
                  <option value="price-desc">Price: High → Low</option>
                </select>
                <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            )}
          </div>

          {filtered.length > 0 ? (
            <div ref={grid.ref} className={`grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-4 sm:gap-y-9 lg:gap-x-5 lg:gap-y-10 ${grid.className}`}>
              {filtered.map((p, i) => {
                const r = data?.variantRanges?.[p.id];
                return <ProductCard key={p.id} product={p} categoryName={p.category_id ? categoryMap[p.category_id] : undefined} offers={activeOffers} priority={i < 4} variantPriceMin={r?.min ?? null} variantPriceMax={r?.max ?? null} variantOrigPriceMin={r?.origMin ?? null} variantOrigPriceMax={r?.origMax ?? null} highlightQuery={search} />;
              })}

            </div>
          ) : (
            <div className="text-center py-20">
              {search ? (
                <>
                  <p className="apple-body">No products match <span className="font-medium text-foreground">"{search}"</span>.</p>
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-secondary/70 border border-border/40 px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/60 transition-colors"
                  >
                    <XIcon size={14} /> Clear search
                  </button>
                </>
              ) : (
                <>
                  <p className="apple-body">No products match your filters.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setCategory("All");
                      setAvailability("all");
                      setPriceRange([priceBounds.min, priceBounds.max]);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-secondary/70 border border-border/40 px-4 py-2 text-sm font-medium text-foreground hover:bg-accent/60 transition-colors"
                  >
                    <XIcon size={14} /> Reset filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filters bottom sheet */}
      <DialogPrimitive.Root open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 lg:hidden" />
          <DialogPrimitive.Content
            onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
            onTouchEnd={(e) => {
              if (touchStartY.current === null) return;
              const deltaY = e.changedTouches[0].clientY - touchStartY.current;
              if (deltaY > 60) setFiltersOpen(false);
              touchStartY.current = null;
            }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-background p-6 pb-10 shadow-2xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Filters</DialogPrimitive.Title>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-foreground/15" />
            <DialogPrimitive.Close aria-label="Close filters" className="absolute right-5 top-5 rounded-full border border-foreground/20 p-1.5 text-foreground/60 hover:bg-foreground/5 hover:border-foreground/40 transition-colors">
              <XIcon size={18} />
            </DialogPrimitive.Close>
            {FiltersPanel}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
};

const RadioRow = ({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) => (
  <button
    type="button"
    onClick={onSelect}
    className="flex items-center gap-3 text-left group"
  >
    <span
      className={`relative inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-colors ${
        checked ? "border-primary bg-primary/10" : "border-foreground/25 group-hover:border-foreground/40"
      }`}
    >
      {checked && <span className="h-2 w-2 rounded-full bg-primary" />}
    </span>
    <span className={`text-sm transition-colors ${checked ? "text-foreground font-medium" : "text-foreground/75 group-hover:text-foreground"}`}>
      {label}
    </span>
  </button>
);

export default Shop;
