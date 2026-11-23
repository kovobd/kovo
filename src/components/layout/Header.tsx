import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ShoppingBagIcon, MenuIcon, XIcon, SearchIcon, ArrowRightIcon, HomeIcon, TruckIcon, InfoIcon, MailIcon, ShieldCheckIcon, StarIcon } from "@/components/ui/icons";
import { useCartStore } from "@/data/cartStore";
import { useQueryClient, useQuery } from "@tanstack/react-query";


import BrandMark from "@/components/brand/BrandMark";
import { PublicApi } from "@/lib/publicApi";
import { useStorefrontVersion } from "@/lib/storefrontCache";
import { resolveImageSrc } from "@/lib/cdnImage";




const navLinks = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/shop" },
  { label: "Track Order", to: "/track-order" },
  { label: "About", to: "/about" },
  { label: "Reviews", to: "/reviews" },
  { label: "Contact", to: "/contact" },
  { label: "Policies", to: "/policies" },
];


const Header = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [scrolled, setScrolled] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchOverlayRef = useRef<HTMLDivElement>(null);
  const searchTriggerDesktopRef = useRef<HTMLButtonElement>(null);
  const searchTriggerMobileRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const totalItems = useCartStore((s) => s.totalItems());
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);


  // Categories come from the same `public-layout` payload the rest of the
  // layout already loads — avoids a duplicate `categories` query per visit.
  const layoutCacheKey = ["public-layout", "v0"];
  const layoutCache = queryClient.getQueryData<any>(layoutCacheKey);
  const { data: categories = [] } = useQuery({
    queryKey: ["header-categories", layoutCache ? "from-layout" : "fallback"],
    queryFn: async () => {
      const layout: any = await PublicApi.layout();
      return ((layout?.categories as any[]) ?? []).filter((c) => !c.parent_id);
    },
    staleTime: 5 * 60 * 1000,
    initialData: layoutCache
      ? ((layoutCache.categories as any[]) ?? []).filter((c: any) => !c.parent_id)
      : undefined,
  });


  // Lightweight product list for autocomplete (reuses cache if Shop has fetched).
  const { data: searchProducts = [] } = useQuery({
    queryKey: ["header-search-products"],
    queryFn: async () => {
      const shop: any = await PublicApi.shop();
      return ((shop?.products as any[]) ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        image: Array.isArray(p.images) ? p.images[0] ?? null : null,
        price: p.sale_price || p.price,
      }));
    },
    staleTime: 5 * 60 * 1000,
    enabled: searchOpen,
  });


  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return (searchProducts as any[])
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchProducts, searchQuery]);

  const highlight = (text: string, q: string) => {
    const query = q.trim();
    if (!query) return text;
    try {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const parts = text.split(new RegExp(`(${escaped})`, "ig"));
      return parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-border text-foreground rounded-[3px] px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      );
    } catch {
      return text;
    }
  };

  const storefrontVersion = useStorefrontVersion();

  // Map of route → dynamic chunk loader. Calling the loader caches the chunk
  // in the browser's module map, so when the user actually navigates the
  // <Suspense> fallback never appears.
  const routeChunkLoaders: Record<string, () => Promise<unknown>> = useMemo(() => ({
    "/shop": () => import("@/pages/Shop"),
    "/about": () => import("@/pages/About"),
    "/contact": () => import("@/pages/Contact"),
    "/policies": () => import("@/pages/Policies"),
    "/reviews": () => import("@/pages/Reviews"),
    "/cart": () => import("@/pages/Cart"),
    "/track-order": () => import("@/pages/TrackOrder"),
  }), []);

  const prefetchedRef = useRef<Set<string>>(new Set());
  const prefetchRoute = useCallback((to: string) => {
    if (prefetchedRef.current.has(to)) return;
    prefetchedRef.current.add(to);

    // 1) Warm the JS chunk for the destination route.
    const loader = routeChunkLoaders[to];
    if (loader) loader().catch(() => prefetchedRef.current.delete(to));

    // 2) Warm the data payload so the page renders instantly on mount.
    const vKey = storefrontVersion ?? "v0";
    if (to === "/shop") {
      queryClient.prefetchQuery({
        queryKey: ["public-shop", vKey],
        queryFn: () => PublicApi.shop(storefrontVersion),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
      });
    } else if (to === "/") {
      queryClient.prefetchQuery({
        queryKey: ["public-home", vKey],
        queryFn: () => PublicApi.home(storefrontVersion),
        staleTime: 5 * 60 * 1000,
        gcTime: 30 * 60 * 1000,
      });
    }
  }, [queryClient, routeChunkLoaders, storefrontVersion]);


  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const isActive = (path: string) => (path === "/" ? location.pathname === "/" : location.pathname.startsWith(path));

  const iconBtn = "inline-flex items-center justify-center w-9 h-9 rounded-full text-foreground/85 hover:text-foreground hover:bg-secondary transition-colors";

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    setMobileOpen(false);
    setSearchOpen(false);
    setSearchQuery("");
    // Preserve existing Shop filters/sort when already on /shop — just update q.
    if (location.pathname === "/shop") {
      const params = new URLSearchParams(location.search);
      params.set("q", q);
      navigate(`/shop?${params.toString()}`);
    } else {
      navigate(`/shop?q=${encodeURIComponent(q)}`);
    }
  };

  // When the overlay opens: remember previously focused element, focus the input.
  // When it closes: restore focus to the trigger (or previously focused element).
  const hasOpenedSearchRef = useRef(false);
  useEffect(() => {
    if (searchOpen) {
      hasOpenedSearchRef.current = true;
      previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
      const t = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    } else {
      // Only restore focus if the overlay was actually opened before (avoid focusing trigger on initial mount).
      if (!hasOpenedSearchRef.current) return;
      const isMobile = window.matchMedia("(max-width: 1023px)").matches;
      const trigger = isMobile ? searchTriggerMobileRef.current : searchTriggerDesktopRef.current;
      const target = trigger ?? previouslyFocusedRef.current;
      const t = setTimeout(() => target?.focus?.(), 60);
      return () => clearTimeout(t);
    }
  }, [searchOpen]);

  // ESC to close + Tab focus trap inside the overlay.
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearch();
        return;
      }
      if (e.key === "Tab") {
        const root = searchOverlayRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [searchOpen, closeSearch]);

  useEffect(() => {
    if (searchOpen) document.body.style.overflow = "hidden";
    else if (!mobileOpen) document.body.style.overflow = "";
    return () => { if (!mobileOpen) document.body.style.overflow = ""; };
  }, [searchOpen, mobileOpen]);

  const pageLinks = useMemo(() => [
    { label: "Home", to: "/", Icon: HomeIcon },
    { label: "Track Order", to: "/track-order", Icon: TruckIcon },
    { label: "About", to: "/about", Icon: InfoIcon },
    { label: "Contact", to: "/contact", Icon: MailIcon },
    { label: "Reviews", to: "/reviews", Icon: StarIcon },
    { label: "Policies", to: "/policies", Icon: ShieldCheckIcon },
  ], []);


  return (
    <>
      <header
        className={`sticky top-0 left-0 right-0 z-[70] text-foreground border-b transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300 ${
          scrolled
            ? "bg-[rgba(5,5,5,0.88)] border-[#2B2337] shadow-[0_8px_32px_-16px_rgba(0,0,0,0.7)]"
            : "bg-[rgba(5,5,5,0.75)] border-[#2B2337]/70"
        }`}
        style={{ backdropFilter: "blur(16px) saturate(160%)", WebkitBackdropFilter: "blur(16px) saturate(160%)" }}
      >
        <div className="relative">
          {/* Desktop */}
          <div className="hidden lg:grid grid-cols-[1fr_auto_1fr] items-center px-8 xl:px-12 h-24">

            <nav className="flex items-center gap-9">
              {navLinks.slice(0, 5).map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onMouseEnter={() => prefetchRoute(link.to)}
                  onFocus={() => prefetchRoute(link.to)}
                  onTouchStart={() => prefetchRoute(link.to)}
                  className={`text-[14px] font-medium tracking-[0.01em] transition-colors ${
                    isActive(link.to) ? "text-foreground" : "text-foreground/75 hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <Link to="/" className="justify-self-center flex items-center justify-center h-full py-1" aria-label="Home">
              <BrandMark size="lg" />
            </Link>

            <div className="flex items-center gap-1 justify-self-end">
              <button
                ref={searchTriggerDesktopRef}
                type="button"
                onClick={() => setSearchOpen(true)}
                className={`${iconBtn}`}
                aria-label="Search"
                aria-expanded={searchOpen}
                aria-controls="header-search-overlay"
              >
                <SearchIcon className="w-[20px] h-[20px]" />
              </button>
              <Link to="/cart" className={`${iconBtn} relative`} aria-label="Cart" data-pixelfx-target="cart">
                <ShoppingBagIcon className="w-[20px] h-[20px]" />
                {totalItems > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 bg-[#7A0F1E] text-[#F7F4FF] text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center tabular-nums shadow-[0_0_0_1px_#3A0710,0_2px_6px_-1px_rgba(122,15,30,0.7)] ring-1 ring-[#B8935A]/40">
                    {totalItems}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* Mobile + Tablet */}
          <div className="flex lg:hidden items-center justify-between px-4 h-20">

            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="p-2 -ml-2 rounded-full text-foreground/85 hover:text-foreground active:bg-secondary transition-colors"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
            >
              {mobileOpen ? <XIcon className="w-6 h-6" /> : <MenuIcon className="w-6 h-6" />}
            </button>

            <Link to="/" className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 flex items-center justify-center h-[calc(100%-8px)]" aria-label="Home">
              <BrandMark size="md" />
            </Link>

            <div className="flex items-center gap-0.5 ml-auto">
              <button
                ref={searchTriggerMobileRef}
                type="button"
                onClick={() => setSearchOpen(true)}
                className="relative p-2 -mr-1 text-foreground/85 hover:text-foreground transition-colors"
                aria-label="Search"
                aria-expanded={searchOpen}
                aria-controls="header-search-overlay"
              >
                <SearchIcon className="w-[22px] h-[22px]" />
              </button>
              <Link to="/cart" className="relative p-2 -mr-2 text-foreground/85 hover:text-foreground transition-colors" aria-label="Cart" data-pixelfx-target="cart">
                <ShoppingBagIcon className="w-[22px] h-[22px]" />
                {totalItems > 0 && (
                  <span className="absolute top-0 right-0 bg-[#7A0F1E] text-[#F7F4FF] text-[10px] font-bold min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center tabular-nums shadow-[0_0_0_1px_#3A0710,0_2px_6px_-1px_rgba(122,15,30,0.7)] ring-1 ring-[#B8935A]/40">
                    {totalItems}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile bottom-sheet menu */}
      <div
        className={`lg:hidden fixed inset-0 z-[80] ${mobileOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        {/* Dim + blur overlay */}
        <div
          onClick={() => setMobileOpen(false)}
          className={`absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity duration-300 ease-out ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Sheet */}
        <div
          ref={sheetRef}
          onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
          onTouchEnd={(e) => {
            if (touchStartY.current === null) return;
            const deltaY = e.changedTouches[0].clientY - touchStartY.current;
            if (deltaY > 60) setMobileOpen(false);
            touchStartY.current = null;
          }}
          className={`absolute left-0 right-0 bottom-0 max-h-[88vh] flex flex-col rounded-t-[28px] border-t border-x border-[#2B2337] bg-[hsl(var(--surface))] text-foreground backdrop-blur-2xl shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.7)] transition-all duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            mobileOpen ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
          }`}
          role="dialog"
          aria-modal="true"
        >
          {/* Drag handle */}
          <div className="pt-2 pb-0.5 flex justify-center shrink-0">
            <div className="w-9 h-1 rounded-full bg-border" />
          </div>

          {/* Sticky search */}
          <div className="sticky top-0 z-10 px-4 pt-2 pb-2 bg-[hsl(var(--surface))]">
            <form onSubmit={handleSearch} className="relative">
              <SearchIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/55" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search the Vault..."
                className="w-full h-11 pl-10 pr-3 rounded-[14px] bg-[#17131F] border border-[#2B2337] text-[13px] text-foreground placeholder:text-foreground/45 outline-none focus:border-[#B89AE8] focus:ring-2 focus:ring-[#B89AE8]/30 transition-colors"
              />
            </form>
          </div>

          {/* Scrollable content */}
          <div className="overflow-y-auto px-4 pb-6 pt-1 flex-1">
            {/* All Collections — featured */}
            <Link
              to="/shop"
              onClick={() => { setMobileOpen(false); prefetchRoute("/shop"); }}
              style={mobileOpen ? {
                animationName: "menu-rise",
                animationDuration: "420ms",
                animationTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
                animationFillMode: "both",
                animationDelay: "60ms",
              } : undefined}

              className="group relative flex items-center gap-3 p-2.5 rounded-xl bg-gradient-to-br from-secondary to-secondary/40 border border-border overflow-hidden transition-all duration-200 ease-out active:scale-[0.99] hover:scale-[1.02] hover:from-secondary hover:to-secondary/60 hover:border-border hover:shadow-[0_0_24px_-8px_rgba(220,200,255,0.35)]"
            >
              <div className="relative shrink-0 w-9 h-9 rounded-lg bg-gradient-to-br from-secondary to-secondary/50 border border-border flex items-center justify-center">
                <ShoppingBagIcon className="w-4 h-4 text-foreground" />
                <span className="absolute -top-1 -left-1 px-1 py-px rounded-full bg-accent text-accent-foreground text-[8px] font-bold tracking-wider leading-none">ALL</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-foreground leading-tight">All Collections</div>
                <div className="text-[11px] text-foreground/55 mt-0.5 leading-tight">Explore the Vault</div>

              </div>
              <ArrowRightIcon className="w-3.5 h-3.5 text-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-200" />
            </Link>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="mt-3.5">
                <div className="px-1.5 mb-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45 font-medium">Categories</div>
                <ul className="space-y-0.5">
                  {categories.map((cat: any, i: number) => (
                    <li
                      key={cat.id}
                      style={mobileOpen ? {
                        animationName: "menu-rise",
                        animationDuration: "380ms",
                        animationTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
                        animationFillMode: "both",
                        animationDelay: `${120 + i * 30}ms`,
                      } : undefined}
                    >
                      <Link
                        to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-[13px] text-foreground/80 hover:text-foreground hover:bg-secondary active:bg-secondary transition-colors"
                      >
                        <span>{cat.name}</span>
                        <ArrowRightIcon className="w-3 h-3 text-foreground/35" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}



            {/* Pages */}
            <div className="mt-3">
              <ul className="grid grid-cols-3 gap-1.5">
                {pageLinks.map((link, i) => {
                  const active = isActive(link.to);
                  const Icon = link.Icon;
                  return (
                    <li
                      key={link.to}
                      style={mobileOpen ? {
                        animationName: "menu-rise",
                        animationDuration: "380ms",
                        animationTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
                        animationFillMode: "both",
                        animationDelay: `${180 + (categories.length + i) * 30}ms`,
                      } : undefined}
                    >
                      <Link
                        to={link.to}
                        onTouchStart={() => prefetchRoute(link.to)}
                        onClick={() => { setMobileOpen(false); prefetchRoute(link.to); }}
                        className={`flex flex-col items-center justify-center gap-1.5 py-2.5 w-full rounded-xl transition-all duration-200 active:scale-[0.97] ${
                          active
                            ? "bg-secondary text-foreground"
                            : "bg-secondary/60 text-foreground/75 hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-[11px] font-medium leading-none text-center px-1 truncate max-w-full">{link.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>



          </div>
        </div>
      </div>

      {/* Search overlay */}
      <div
        id="header-search-overlay"
        ref={searchOverlayRef}
        className={`fixed inset-0 z-[100] ${searchOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!searchOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div
          onClick={() => setSearchOpen(false)}
          className={`absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity duration-300 ease-out ${
            searchOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute left-0 right-0 top-0 sm:top-[15vh] p-4 sm:p-0 transition-all duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            searchOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"
          }`}
        >
          <div className="max-w-2xl mx-auto sm:px-4">
            <form onSubmit={handleSearch} className="relative" role="search">
              <SearchIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/55" />
              <input
                ref={searchInputRef}
                data-testid="header-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
               placeholder="Search the Vault..."
                aria-label="Search products"
                aria-autocomplete="list"
                aria-controls="header-search-suggestions"
                className="w-full h-14 sm:h-16 pl-14 pr-14 rounded-[14px] sm:rounded-[18px] bg-[#17131F] text-foreground border border-[#2B2337] text-base sm:text-lg placeholder:text-foreground/45 outline-none focus:border-[#B89AE8] focus:ring-2 focus:ring-[#B89AE8]/30 shadow-2xl transition-all"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="p-2 rounded-full text-foreground/60 hover:text-foreground hover:bg-secondary transition-colors"
                  aria-label="Close search"
                >
                  <XIcon className="w-5 h-5" />
                </button>
              </div>

            </form>

            {/* Autocomplete suggestions / empty state */}
            {searchQuery.trim() ? (
              <div
                id="header-search-suggestions"
                className="mt-3 rounded-2xl bg-[hsl(var(--surface))]/95 border border-[#2B2337] backdrop-blur-xl overflow-hidden shadow-2xl"
                role="listbox"
              >
                {suggestions.length > 0 ? (
                  <ul className="max-h-[60vh] overflow-y-auto py-1">
                    {suggestions.map((p: any) => (
                      <li key={p.id} role="option">
                        <Link
                          to={`/product/${p.slug}`}
                          onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-secondary focus:bg-secondary focus:outline-none transition-colors"
                        >
                          <div className="w-10 h-10 rounded-lg bg-secondary border border-border overflow-hidden flex-shrink-0">
                            {p.image && (
                              <img src={resolveImageSrc(p.image, 400)} alt="" loading="lazy" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] sm:text-sm text-foreground truncate">
                              {highlight(p.name, searchQuery)}
                            </div>
                            <div className="text-[11px] text-foreground/55 tabular-nums">৳{p.price}</div>
                          </div>
                          <ArrowRightIcon className="w-3.5 h-3.5 text-foreground/40 flex-shrink-0" />
                        </Link>
                      </li>
                    ))}
                    <li className="border-t border-border mt-1">
                      <button
                        type="button"
                        onClick={(e) => handleSearch(e as any)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-[12px] text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <span>See all results for "{searchQuery.trim()}"</span>
                        <ArrowRightIcon className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  </ul>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <p className="text-[13px] text-foreground/70">
                      No products match <span className="text-foreground font-medium">"{searchQuery.trim()}"</span>
                    </p>
                    <p className="text-[11px] text-foreground/45 mt-1">Try a different keyword or browse categories below.</p>
                  </div>
                )}
              </div>
            ) : (
              categories.length > 0 && (
                <div className="mt-4 sm:mt-6 px-1">
                  <p className="text-[11px] sm:text-xs uppercase tracking-[0.16em] text-foreground/50 mb-2.5">Popular categories</p>
                  <div className="flex flex-wrap gap-2">
                    {categories.slice(0, 6).map((cat: any) => (
                      <Link
                        key={cat.id}
                        to={`/shop?category=${encodeURIComponent(cat.slug)}`}
                        onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                        className="px-3.5 py-1.5 rounded-full bg-secondary border border-border text-[13px] text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        {cat.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Header;
