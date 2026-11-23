import { resolveImageSrc } from "@/lib/cdnImage";
import { Link } from "react-router-dom";
import { useState, useEffect, useMemo, lazy, Suspense, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { PublicApi } from "@/lib/publicApi";
import { useStorefrontVersion } from "@/lib/storefrontCache";
import ProductCard from "@/components/ProductCard";
import type { ActiveOffer } from "@/lib/offers";
import { CURRENCY_SYMBOL, toBanglaDigits } from "@/lib/currency";
import StarRating from "@/components/ui/StarRating";

import { SparklesIcon, GiftIcon, ArrowRightIcon } from "@/components/ui/icons";
import DynamicIcon from "@/components/ui/DynamicIcon";
import HeroSlider from "@/components/homepage/HeroSlider";
import FeaturedCategories, { type FeaturedCategory } from "@/components/homepage/FeaturedCategories";
import type { Product, HomepageSection, Testimonial, HomeFaq, WhyChooseUsCard } from "@/types/database";
const VideoReels = lazy(() => import("@/components/homepage/VideoReels"));
import { useToast } from "@/hooks/use-toast";
import { useFadeIn, useStaggerIn } from "@/hooks/useMotion";
import { ScrollScene, DeepTilt } from "@/components/ui/scroll-scene";
import { subscribeToNewsletter } from "@/lib/newsletter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import TestimonialsSection, { fromDbTestimonials } from "@/components/ui/testimonial-v2";

const LazyAccordion = lazy(() => import("@/components/ui/accordion").then(mod => ({
  default: forwardRef<HTMLDivElement, { faqs: HomeFaq[] }>(({ faqs }, ref) => (
    <mod.Accordion ref={ref} type="single" collapsible className="space-y-2">
      {faqs.map((faq) => (
        <mod.AccordionItem key={faq.id} value={faq.id} className="bg-background px-5 border border-border">
          <mod.AccordionTrigger className="text-[13px] sm:text-sm font-medium text-foreground py-4 hover:no-underline text-left">{faq.question}</mod.AccordionTrigger>
          <mod.AccordionContent className="text-[13px] sm:text-sm text-muted-foreground pb-4">{faq.answer}</mod.AccordionContent>
        </mod.AccordionItem>
      ))}
    </mod.Accordion>
  ))
})));

interface CategoryWithImage { id: string; name: string; slug: string; image_url: string | null; parent_id: string | null; }
interface Brand { id: string; name: string; slug: string; logo_url: string | null; image_url: string | null; enabled: boolean; }

const FadeSection = forwardRef<HTMLDivElement, { children: React.ReactNode; className?: string }>(({ children, className = "" }, _ref) => {
  return (
    <ScrollScene variant="cinematic" intensity={0.85} className={className}>
      {children}
    </ScrollScene>
  );
});
FadeSection.displayName = "FadeSection";

const Index = () => {
  const storefrontVersion = useStorefrontVersion();
  // ONE cached edge call replaces ~13 supabase round-trips on the homepage.
  const { data: home, isLoading } = useQuery({
    queryKey: ["public-home", storefrontVersion ?? "v0"],
    queryFn: () => PublicApi.home(storefrontVersion),
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

  const data = useMemo(() => {
    if (!home) return undefined;
    return {
      heroSlides: (home as any).heroSlides ?? [],
      heroSettings: (home as any).heroSettings ?? null,
      sections: ((home as any).sections ?? []) as HomepageSection[],
      featured: ((home as any).featured ?? []) as Product[],
      featuredVariantRanges: (home as any).variantRanges ?? {},
      categories: ((layout as any)?.categories ?? []) as CategoryWithImage[],
      brands: ((layout as any)?.brands ?? []) as Brand[],
      cardCtaMode: ((layout as any)?.shopSettings?.card_cta_mode || "view_details") as "add_to_cart" | "view_details",
      activeOffers: ((home as any).activeOffers ?? []) as ActiveOffer[],
      featuredCategories: ((home as any).featuredCategories ?? []) as FeaturedCategory[],
    };
  }, [home, layout]);

  const deferred = useMemo(() => {
    if (!home) return undefined;
    return {
      bestSellers: ((home as any).bestSellers ?? []) as Product[],
      bestSellerVariantRanges: (home as any).variantRanges ?? {},
      testimonials: ((home as any).testimonials ?? []) as Testimonial[],
      faqs: ((home as any).faqs ?? []) as HomeFaq[],
      whyCards: ((home as any).whyCards ?? []) as WhyChooseUsCard[],
      reels: (home as any).reels ?? [],
    };
  }, [home]);



  const featuredGrid = useStaggerIn<HTMLDivElement>("stagger-grid");
  const bsGrid = useStaggerIn<HTMLDivElement>("stagger-grid");
  const catGrid = useStaggerIn<HTMLDivElement>("stagger-grid");
  const whyGrid = useStaggerIn<HTMLDivElement>("stagger-grid");

  const [newsletterEmail, setNewsletterEmail] = useState("");
  const [subscribing, setSubscribing] = useState(false);
  const { toast } = useToast();

  const sections = data?.sections ?? [];
  const featured = data?.featured ?? [];
  const bestSellers = deferred?.bestSellers ?? [];
  const categories = data?.categories ?? [];
  const brands = data?.brands ?? [];
  const testimonials = deferred?.testimonials ?? [];
  const faqs = deferred?.faqs ?? [];
  const whyCards = deferred?.whyCards ?? [];
  const reels = (deferred as any)?.reels ?? [];
  const activeOffers = data?.activeOffers ?? [];

  const categoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    categories.forEach((c) => { map[c.id] = c.name; });
    return map;
  }, [categories]);

  const showcaseCategories = useMemo(() => categories.filter(c => !c.parent_id), [categories]);

  const hasLoadedHomepageData = !!home;

  const getSection = (id: string) => sections.find((s) => s.id === id);
  const isEnabled = (id: string) => getSection(id)?.enabled !== false;
  const sectionContent = (id: string): Record<string, any> => (getSection(id)?.content as any) ?? {};
  const getContent = (id: string) => (getSection(id)?.content as any) ?? {};

  const heroSettings = (data as any)?.heroSettings ?? null;
  const heroEnabled = heroSettings ? heroSettings.enabled !== false : true;
  const featuredCategories = data?.featuredCategories ?? [];

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubscribing(true);
    const result = await subscribeToNewsletter(newsletterEmail);
    setSubscribing(false);
    if (!result.ok) {
      toast({ title: "Could not subscribe", description: result.message, variant: "destructive" });
      return;
    }
    toast({ title: "Subscribed!", description: "Thanks for joining our newsletter." });
    setNewsletterEmail("");
  };

  const brandStory = getContent("brand_story");
  const featuredSection = getContent("featured");
  const bsSection = getContent("bestsellers");
  const newsletterSection = getContent("newsletter");
  const catSection = getContent("categories_showcase");
  const brandSection = getContent("brands_showcase");

  useDocumentMeta({
    title: "Kovo | Bags & Accessories in Bangladesh",
    description: "Kovo — bags and accessories, delivered across Bangladesh with cash on delivery.",
    canonicalPath: "/",
  });

  // Render the page shell immediately. Sections gate themselves on `data`/`hasLoadedHomepageData`.
  // This avoids a full blank screen flash and lets the hero/LCP image start loading as soon as
  // the homepage data resolves (typically <300ms with prefetch).

  return (
    <div style={{ minHeight: '100vh' }} className="contain-content">
      {/* Visually hidden H1 for SEO/A11y — describes the site without altering the hero design */}
      <h1 className="sr-only">Kovo — Bags and Accessories in Bangladesh</h1>
      {heroEnabled && (
        <div className="relative" data-gv-hero>
          <HeroSlider
            slides={data?.heroSlides ?? []}
            settings={heroSettings}
            loading={isLoading}
          />
        </div>
      )}


      {hasLoadedHomepageData && featuredCategories.length > 0 && (
        <ScrollScene variant="cinematic" intensity={1.1}>
          <FeaturedCategories categories={featuredCategories} categoryRefs={categories} />
        </ScrollScene>
      )}


      {/* Reserve space for sections during initial load to prevent CLS jump */}
      {!hasLoadedHomepageData && (
        <section className="py-8 sm:py-10 lg:py-14 section-padding">
          <div className="text-center mb-6 sm:mb-8 space-y-2">
            <div className="h-6 w-40 mx-auto bg-muted rounded animate-pulse" />
            <div className="h-3 w-56 mx-auto bg-muted/70 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-4 sm:gap-y-9 lg:gap-x-5 lg:gap-y-10">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="aspect-[4/5] bg-muted rounded-[20px] sm:rounded-[24px] animate-pulse" />
                <div className="pt-4 sm:pt-5 space-y-2">
                  <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-1/2 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <>
        <>
          {activeOffers.length > 0 && (
            <section className="py-6 sm:py-8 section-padding">
              <FadeSection className="text-center mb-4 sm:mb-5">
                <div className="inline-flex items-center gap-2 bg-foreground text-background px-3.5 py-1.5 rounded-[2px] text-[10px] font-bold uppercase tracking-widest mb-2.5">
                  <SparklesIcon size={12} /> Limited time offer
                </div>
                <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground">Don't miss out!</h2>
              </FadeSection>
              <FadeSection>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeOffers.map((offer) => (
                    <DeepTilt key={offer.id} intensity={12}>
                    <Link to="/shop" className="group relative overflow-hidden glass-card p-4 sm:p-5 hover:border-primary/30 transition-all duration-300 hover:-translate-y-0.5 trust-badge block h-full" style={{ transformStyle: "preserve-3d" }}>
                      <div className="flex items-center gap-2.5 mb-2" style={{ transform: "translateZ(30px)" }}>
                        <span className="inline-flex items-center gap-1 bg-foreground text-background text-[11px] font-bold px-2.5 py-1 rounded-[2px] shadow-sm">
                          <GiftIcon size={11} />
                          {toBanglaDigits(offer.discount_value)}{offer.discount_type === "percentage" ? "%" : ` ${CURRENCY_SYMBOL}`} off
                        </span>
                      </div>
                      <h3 className="text-base font-semibold text-foreground" style={{ transform: "translateZ(24px)" }}>{offer.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {offer.apply_to === "entire_store" ? "On all products" : `On selected products`}
                      </p>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-3 group-hover:gap-2 transition-all" style={{ transform: "translateZ(20px)" }}>
                        Shop now <ArrowRightIcon size={12} />
                      </span>
                    </Link>
                    </DeepTilt>
                  ))}
                </div>
              </FadeSection>
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("featured") && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding">
              <FadeSection className="text-center mb-6 sm:mb-8">
                <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground">{featuredSection.section_title || "Featured Collection"}</h2>
                {featuredSection.subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 max-w-md mx-auto">{featuredSection.subtitle}</p>}
                <div className="premium-divider max-w-[60px] mx-auto mt-4" />
              </FadeSection>
              {featured.length > 0 && (
                <div ref={featuredGrid.ref} className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-4 sm:gap-y-9 lg:gap-x-5 lg:gap-y-10 ${featuredGrid.className}`}>
                  {featured.map((p, i) => {
                    const r = data?.featuredVariantRanges?.[p.id];
                    return <ProductCard key={p.id} product={p} categoryName={p.category_id ? categoryMap[p.category_id] : undefined} offers={activeOffers} priority={i < 4} variantPriceMin={r?.min ?? null} variantPriceMax={r?.max ?? null} variantOrigPriceMin={r?.origMin ?? null} variantOrigPriceMax={r?.origMax ?? null} />;
                  })}

                </div>
              )}
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("bestsellers") && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding section-alt">
              <FadeSection className="text-center mb-6 sm:mb-8">
                <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground">{bsSection.section_title || "Best Sellers"}</h2>
                {bsSection.subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2 max-w-md mx-auto">{bsSection.subtitle}</p>}
                <div className="premium-divider max-w-[60px] mx-auto mt-4" />
              </FadeSection>
              {bestSellers.length > 0 && (
                <div ref={bsGrid.ref} className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8 sm:gap-x-4 sm:gap-y-9 lg:gap-x-5 lg:gap-y-10 ${bsGrid.className}`}>
                  {bestSellers.map((p) => {
                    const r = deferred?.bestSellerVariantRanges?.[p.id];
                    return <ProductCard key={p.id} product={p} categoryName={p.category_id ? categoryMap[p.category_id] : undefined} offers={activeOffers} variantPriceMin={r?.min ?? null} variantPriceMax={r?.max ?? null} variantOrigPriceMin={r?.origMin ?? null} variantOrigPriceMax={r?.origMax ?? null} />;
                  })}

                </div>
              )}
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("categories_showcase") && showcaseCategories.length > 0 && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding cv-auto">
              <FadeSection className="text-center mb-6 sm:mb-8">
                <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground">{catSection.section_title || "Shop by Category"}</h2>
                {catSection.subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2">{catSection.subtitle}</p>}
                <div className="premium-divider max-w-[60px] mx-auto mt-4" />
              </FadeSection>
              <div ref={catGrid.ref} className={`grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5 ${catGrid.className}`}>
                {showcaseCategories.map((cat) => (
                  <DeepTilt key={cat.id} intensity={12}>
                  <Link to={`/shop?category=${encodeURIComponent(cat.name)}`} className="group relative block aspect-[4/3] overflow-hidden bg-secondary" style={{ transformStyle: "preserve-3d" }}>
                    {cat.image_url ? (
                      <img src={resolveImageSrc(cat.image_url, 400)} alt={cat.name} className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105" loading="lazy" decoding="async" width={400} height={300} />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-foreground/5 to-foreground/10" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/15 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4" style={{ transform: "translateZ(36px)" }}>
                      <h3 className="text-[12px] sm:text-[13px] font-medium uppercase tracking-[0.16em] text-white">{cat.name}</h3>
                    </div>
                  </Link>
                  </DeepTilt>
                ))}
              </div>
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("brands_showcase") && brands.length > 0 && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding cv-auto">
              <FadeSection className="text-center mb-6 sm:mb-8">
                <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground">{brandSection.section_title || "Our Brands"}</h2>
                {brandSection.subtitle && <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 sm:mt-2">{brandSection.subtitle}</p>}
                <div className="premium-divider max-w-[60px] mx-auto mt-4" />
              </FadeSection>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
                {brands.slice(0, 12).map((brand) => {
                  const img = brand.image_url || brand.logo_url;
                  return (
                    <DeepTilt key={brand.id} intensity={12}>
                      <Link
                        to={`/shop?brand=${encodeURIComponent(brand.slug || brand.name)}`}
                        className="group relative block aspect-[4/3] overflow-hidden bg-secondary"
                        style={{ transformStyle: "preserve-3d" }}
                        aria-label={brand.name}
                      >
                        {img ? (
                          <img
                            src={resolveImageSrc(img, 400)}
                            alt={brand.name}
                            className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                            loading="lazy"
                            decoding="async"
                            width={400}
                            height={300}
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-foreground/5 to-foreground/10" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/15 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-4" style={{ transform: "translateZ(36px)" }}>
                          <h3 className="text-sm sm:text-base font-semibold text-white drop-shadow-sm">{brand.name}</h3>
                        </div>
                      </Link>
                    </DeepTilt>
                  );
                })}
              </div>
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("brand_story") && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding cv-auto">
              <div className="grid lg:grid-cols-2 gap-6 sm:gap-8 lg:gap-14 items-center">
                <FadeSection>
                  <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground mb-3 sm:mb-4">{brandStory.title || "Our Story"}</h2>
                  <div className="premium-divider max-w-[40px] mb-4" />
                  <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed mb-5 sm:mb-6">
                    {brandStory.text || ""}
                  </p>
                  {brandStory.button_link && brandStory.button_text && (
                    <Link to={brandStory.button_link} className="btn-pill-ghost">
                      {brandStory.button_text} →
                    </Link>
                  )}
                </FadeSection>
                <FadeSection>
                  <DeepTilt intensity={10}>
                    <div className="aspect-[4/3] overflow-hidden bg-secondary" style={{ transformStyle: "preserve-3d" }}>
                      <img src={resolveImageSrc(brandStory.image, 800) || "/placeholder.svg"} alt="Our Story" className="w-full h-full object-cover" loading="lazy" decoding="async" width={600} height={450} />
                    </div>
                  </DeepTilt>
                </FadeSection>
              </div>
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("featured_image") && getContent("featured_image").image && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding cv-auto">
              <FadeSection>
                <DeepTilt intensity={8}>
                  <div className="relative aspect-[4/5] sm:aspect-[16/7] lg:aspect-[16/6] overflow-hidden" style={{ transformStyle: "preserve-3d" }}>
                    <img
                      src={resolveImageSrc(getContent("featured_image").image, 1600)}
                      alt={getContent("featured_image").section_title || "Featured"}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {(getContent("featured_image").overlay ?? true) && (
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-foreground/20 to-transparent" />
                    )}
                    {(getContent("featured_image").section_title || getContent("featured_image").subtitle || getContent("featured_image").button_link) && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6" style={{ transform: "translateZ(40px)" }}>
                        {getContent("featured_image").section_title && (
                          <h2 className="text-xl sm:text-2xl lg:text-4xl font-semibold tracking-tight text-white drop-shadow-sm">
                            {getContent("featured_image").section_title}
                          </h2>
                        )}
                        {getContent("featured_image").subtitle && (
                          <p className="text-xs sm:text-sm lg:text-base text-white/85 mt-2 max-w-xl">
                            {getContent("featured_image").subtitle}
                          </p>
                        )}
                        {getContent("featured_image").button_link && getContent("featured_image").button_text && (
                          <Link
                            to={getContent("featured_image").button_link}
                            className="mt-5 inline-flex items-center gap-2 bg-white text-foreground px-7 py-3 rounded-[2px] text-[12px] font-medium uppercase tracking-[0.14em] hover:bg-white/90 active:scale-[0.98] transition-all"
                          >
                            {getContent("featured_image").button_text} <ArrowRightIcon size={14} />
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </DeepTilt>
              </FadeSection>
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("why_choose_us") && whyCards.length > 0 && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding section-alt contain-content">
              <FadeSection className="text-center mb-6 sm:mb-8">
                <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground">{sectionContent("why_choose_us").section_title || "Why Choose Us"}</h2>
                {sectionContent("why_choose_us").subtitle && <p className="text-sm text-muted-foreground mt-2">{sectionContent("why_choose_us").subtitle}</p>}
                <div className="premium-divider max-w-[60px] mx-auto mt-4" />
              </FadeSection>
              <div ref={whyGrid.ref} className={`grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 ${whyGrid.className}`}>
                {whyCards.map((card, idx) => (
                  <DeepTilt key={card.id} intensity={14}>
                  <div className="text-center p-5 sm:p-7 bg-background border border-border h-full" style={{ transformStyle: "preserve-3d" }}>
                    <div className="w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center mx-auto mb-3 sm:mb-4" style={{ animationDelay: `${idx * 0.5}s`, transform: "translateZ(40px)" }}>
                      <DynamicIcon name={card.icon_name || "Shield"} className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground mb-1.5" style={{ transform: "translateZ(28px)" }}>{card.title}</h3>
                    <p className="text-xs sm:text-[13px] text-muted-foreground leading-relaxed">{card.description}</p>
                  </div>
                  </DeepTilt>
                ))}
              </div>
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("testimonials") && testimonials.length > 0 && (
            <TestimonialsSection
              testimonials={fromDbTestimonials(testimonials)}
              title={sectionContent("testimonials").section_title || "What our customers say"}
              subtitle={sectionContent("testimonials").subtitle || "Real stories from Kovo customers."}
            />
          )}

          {hasLoadedHomepageData && isEnabled("video_reels") && reels.length > 0 && (
            <Suspense fallback={null}>
              <ScrollScene variant="cinematic" intensity={1.2}>
                <VideoReels
                  reels={reels}
                  sectionTitle={sectionContent("video_reels").section_title || "Real Customer Experiences"}
                  subtitle={sectionContent("video_reels").subtitle || "See how our community experiences the collection."}
                />
              </ScrollScene>
            </Suspense>
          )}



          {hasLoadedHomepageData && isEnabled("faq") && faqs.length > 0 && (
            <section className="py-8 sm:py-10 lg:py-14 section-padding section-alt contain-content">
              <FadeSection className="max-w-3xl mx-auto">
                <h2 className="text-[22px] sm:text-[26px] lg:text-[30px] font-medium tracking-[-0.01em] text-foreground text-center mb-2">{sectionContent("faq").section_title || "Frequently Asked Questions"}</h2>
                {sectionContent("faq").subtitle && <p className="text-sm text-muted-foreground text-center mb-2">{sectionContent("faq").subtitle}</p>}
                <div className="premium-divider max-w-[60px] mx-auto mb-6 sm:mb-8" />
                <Suspense fallback={<div className="space-y-2">{faqs.map(f => <div key={f.id} className="bg-background border border-border px-5 py-4 text-[13px] sm:text-sm font-medium text-foreground">{f.question}</div>)}</div>}>
                  <LazyAccordion faqs={faqs} />
                </Suspense>
              </FadeSection>
            </section>
          )}

          {hasLoadedHomepageData && isEnabled("newsletter") && (
            <section className="py-10 sm:py-12 lg:py-16 section-padding cv-auto">
              <FadeSection className="max-w-xl mx-auto text-center">
                <h2 className="text-lg sm:text-xl font-semibold tracking-tight text-foreground mb-2">{newsletterSection.title || newsletterSection.headline || "Stay in the Loop"}</h2>
                <p className="text-sm text-muted-foreground mb-6 sm:mb-7 leading-relaxed">
                  {newsletterSection.subtitle || newsletterSection.subtext || "Be the first to know about new launches, exclusive offers, and style tips."}
                </p>
                <form onSubmit={handleSubscribe} className="max-w-md mx-auto">
                  <div className="flex items-end justify-between gap-4 border-b border-foreground/20 pb-2">
                    <input
                      type="email"
                      placeholder={newsletterSection.placeholder || "Your email"}
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      required
                      aria-label="Email address"
                      className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-foreground/45 focus:outline-none py-1"
                    />
                    <button
                      type="submit"
                      disabled={subscribing || !newsletterEmail.trim()}
                      className="shrink-0 text-[12px] font-medium tracking-[0.22em] uppercase text-foreground/80 hover:text-foreground transition-colors disabled:opacity-50 flex items-center gap-2 py-1"
                    >
                      {subscribing ? "…" : (newsletterSection.button_text || "Join")}
                      <span aria-hidden className="text-[14px] leading-none">→</span>
                    </button>
                  </div>
                </form>

                {newsletterSection.footnote && (
                  <p className="text-xs text-muted-foreground/70 mt-3">{newsletterSection.footnote}</p>
                )}
              </FadeSection>
            </section>
          )}
        </>
      </>
    </div>
  );
};

export default Index;
