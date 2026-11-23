import { useState, useEffect, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Link } from "react-router-dom";
import { resolveImageSrc, isR2VariantRef, getR2BaseKey, buildSrcSet, r2Url } from "@/lib/cdnImage";

export type InteractionMode = "buttons" | "image" | "both";

export interface HeroSlide {
  id: string;
  sort_order: number | null;
  image_url: string;
  mobile_image_url?: string | null;
  headline?: string | null;
  subheadline?: string | null;
  button1_text?: string | null;
  button1_link?: string | null;
  button2_text?: string | null;
  button2_link?: string | null;
  image_click_link?: string | null;
  interaction_mode?: InteractionMode | null;
}

export interface HeroSettings {
  hero_type: "image_slider" | "video_hero";
  hero_layout: "single" | "dual";
  enabled: boolean;
  autoplay: boolean;
  transition_speed_ms: number;
  infinite_loop: boolean;
  swipe_enabled: boolean;
  desktop_video_url?: string | null;
  mobile_video_url?: string | null;
  poster_image_url?: string | null;
  video_headline?: string | null;
  video_subheadline?: string | null;
  video_button1_text?: string | null;
  video_button1_link?: string | null;
  video_button2_text?: string | null;
  video_button2_link?: string | null;
  video_click_link?: string | null;
  video_autoplay?: boolean;
  video_loop?: boolean;
  video_muted?: boolean;
}

interface HeroSliderProps {
  slides: HeroSlide[];
  settings: HeroSettings | null;
  loading: boolean;
}

const useIsMobile = () => {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
};

const HeroBlankFrame = ({ isMobile }: { isMobile: boolean }) => (
  <section className={`relative w-full ${isMobile ? "aspect-[9/16] max-h-[85svh]" : "aspect-[16/9] max-h-[calc(100svh-92px)]"} bg-secondary`} aria-hidden />
);

const SlideOverlay = ({ slide, priority, isMobile }: { slide: HeroSlide; priority: boolean; isMobile: boolean }) => {
  const mode: InteractionMode = (slide.interaction_mode as InteractionMode) || "buttons";
  const rawSrc = (isMobile && slide.mobile_image_url) || slide.image_url;
  const showButtons = mode === "buttons" || mode === "both";
  const imageIsLink = (mode === "image" || mode === "both") && !!slide.image_click_link;

  const altText = [slide.headline, slide.subheadline].filter(Boolean).join(" — ")
    || "Kovo collection";

  // Responsive sizes: full-viewport hero. Mobile ~100vw at portrait aspect,
  // desktop ~100vw capped by the 16:9 hero frame.
  const sizes = isMobile ? "100vw" : "(min-width: 1280px) 1600px, 100vw";

  let imgNode: React.ReactNode;
  if (isR2VariantRef(rawSrc)) {
    const key = getR2BaseKey(rawSrc);
    imgNode = (
      <picture>
        <source type="image/avif" srcSet={buildSrcSet(key, "avif")} sizes={sizes} />
        <source type="image/webp" srcSet={buildSrcSet(key, "webp")} sizes={sizes} />
        <img
          src={r2Url(key, 1600, "webp")}
          alt={altText}
          className="absolute inset-0 w-full h-full object-cover"
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          width={1600}
          height={isMobile ? 2844 : 900}
          {...(priority ? { fetchpriority: "high" as const } : {})}
        />
      </picture>
    );
  } else {
    imgNode = (
      <img
        src={resolveImageSrc(rawSrc, 1600)}
        alt={altText}
        className="absolute inset-0 w-full h-full object-cover"
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        {...(priority ? { fetchpriority: "high" as const } : {})}
      />
    );
  }

  const Wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
    imageIsLink ? (
      <Link to={slide.image_click_link!} className="absolute inset-0 block">{children}</Link>
    ) : (
      <>{children}</>
    );

  return (
    <div className="relative w-full h-full overflow-hidden bg-black">
      <Wrapper>{imgNode}</Wrapper>

      {(slide.headline || slide.subheadline || showButtons) && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/10" />
      )}

      {(slide.headline || slide.subheadline || (showButtons && (slide.button1_text || slide.button2_text))) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full px-6 sm:px-10 max-w-3xl text-center text-white flex flex-col items-center gap-3 sm:gap-4">
            {slide.headline && (
              <h2 className="font-display font-medium uppercase leading-[1.05] tracking-[0.04em] text-[28px] sm:text-[44px] lg:text-[60px]"
                  style={{ fontFamily: '"Archivo Black", system-ui, sans-serif', textShadow: "0 8px 30px rgba(0,0,0,0.4)" }}>
                {slide.headline}
              </h2>
            )}
            {slide.subheadline && (
              <p className="text-[13px] sm:text-[15px] lg:text-[16px] max-w-xl leading-relaxed opacity-90">
                {slide.subheadline}
              </p>
            )}
            {showButtons && (slide.button1_text || slide.button2_text) && (
              <div className="pointer-events-auto mt-3 flex flex-wrap items-center justify-center gap-3">
                {slide.button1_text && slide.button1_link && (
                  <Link to={slide.button1_link} className="inline-flex items-center justify-center px-7 py-3 bg-white text-black text-[12px] sm:text-[13px] font-semibold tracking-[0.14em] uppercase rounded-sm hover:bg-white/90 transition-all">
                    {slide.button1_text}
                  </Link>
                )}
                {slide.button2_text && slide.button2_link && (
                  <Link to={slide.button2_link} className="inline-flex items-center justify-center px-7 py-3 border border-white/70 text-white text-[12px] sm:text-[13px] font-semibold tracking-[0.14em] uppercase rounded-sm hover:bg-white/10 backdrop-blur-sm transition-all">
                    {slide.button2_text}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const aspectClass = (isMobile: boolean) =>
  isMobile
    ? "aspect-[9/16] max-h-[85svh]"
    : "aspect-[16/9] max-h-[calc(100svh-92px)]";

const SingleSliderCarousel = ({ slides, settings, isMobile }: { slides: HeroSlide[]; settings: HeroSettings; isMobile: boolean }) => {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: settings.infinite_loop,
    duration: 30,
    watchDrag: settings.swipe_enabled,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const hoverRef = useRef(false);

  const onSelect = useCallback(() => {
    if (emblaApi) setActiveIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi || !settings.autoplay || slides.length <= 1) return;
    const interval = window.setInterval(() => {
      if (!hoverRef.current) emblaApi.scrollNext();
    }, Math.max(2000, settings.transition_speed_ms));
    return () => window.clearInterval(interval);
  }, [emblaApi, settings.autoplay, settings.transition_speed_ms, slides.length]);

  return (
    <section
      className={`relative w-full ${aspectClass(isMobile)} overflow-hidden bg-black`}
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
    >
      <div className="embla absolute inset-0" ref={emblaRef}>
        <div className="embla__container flex h-full">
          {slides.map((slide, index) => (
            <div className="embla__slide flex-[0_0_100%] min-w-0 relative h-full" key={slide.id}>
              <SlideOverlay slide={slide} priority={index === 0} isMobile={isMobile} />
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-[2px] rounded-full transition-all duration-300 ${i === activeIndex ? "bg-white w-8" : "bg-white/40 w-4"}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const DualSlider = ({ slides, settings }: { slides: HeroSlide[]; settings: HeroSettings }) => {
  // Group slides into pairs. Each "page" shows 2 side-by-side on desktop.
  const pairs: HeroSlide[][] = [];
  for (let i = 0; i < slides.length; i += 2) pairs.push(slides.slice(i, i + 2));

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: settings.infinite_loop,
    duration: 30,
    watchDrag: settings.swipe_enabled,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const hoverRef = useRef(false);

  const onSelect = useCallback(() => {
    if (emblaApi) setActiveIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi || !settings.autoplay || pairs.length <= 1) return;
    const interval = window.setInterval(() => {
      if (!hoverRef.current) emblaApi.scrollNext();
    }, Math.max(2000, settings.transition_speed_ms));
    return () => window.clearInterval(interval);
  }, [emblaApi, settings.autoplay, settings.transition_speed_ms, pairs.length]);

  return (
    <section
      className="relative w-full aspect-[32/9] max-h-[calc(100svh-92px)] overflow-hidden bg-black"
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
    >
      <div className="embla absolute inset-0" ref={emblaRef}>
        <div className="embla__container flex h-full">
          {pairs.map((pair, idx) => (
            <div className="embla__slide flex-[0_0_100%] min-w-0 relative h-full" key={idx}>
              <div className="grid grid-cols-2 h-full gap-px bg-black">
                {pair.map((s, i) => (
                  <div key={s.id} className="relative h-full overflow-hidden">
                    <SlideOverlay slide={s} priority={idx === 0 && i === 0} isMobile={false} />
                  </div>
                ))}
                {pair.length === 1 && <div className="bg-black/40" />}
              </div>
            </div>
          ))}
        </div>
      </div>

      {pairs.length > 1 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {pairs.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-[2px] rounded-full transition-all duration-300 ${i === activeIndex ? "bg-white w-8" : "bg-white/40 w-4"}`}
              aria-label={`Go to slide pair ${i + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const VideoHero = ({ settings, isMobile }: { settings: HeroSettings; isMobile: boolean }) => {
  const desktopRaw = settings.desktop_video_url || null;
  const mobileRaw = settings.mobile_video_url || null;
  const rawSrc = (isMobile && mobileRaw) || desktopRaw || mobileRaw;
  const [errored, setErrored] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => { setErrored(false); }, [rawSrc]);

  // Best-effort kick autoplay if browser blocks it momentarily
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tryPlay = () => { v.play().catch(() => {}); };
    tryPlay();
    v.addEventListener("canplay", tryPlay);
    return () => v.removeEventListener("canplay", tryPlay);
  }, [rawSrc]);

  if (!rawSrc) return <HeroBlankFrame isMobile={isMobile} />;

  const src = resolveImageSrc(rawSrc, 1600);
  const poster = settings.poster_image_url ? resolveImageSrc(settings.poster_image_url, 1600) : undefined;
  const ext = (src.split("?")[0].split(".").pop() || "").toLowerCase();
  const mimeType =
    ext === "webm" ? "video/webm" :
    ext === "mov" ? "video/quicktime" :
    "video/mp4";

  const showButtons = !!(settings.video_button1_text || settings.video_button2_text);
  const link = settings.video_click_link || null;

  const videoNode = errored ? (
    poster ? (
      <img src={poster} alt={settings.video_headline || "Hero"} className="absolute inset-0 w-full h-full object-cover" />
    ) : (
      <div className="absolute inset-0 bg-secondary" />
    )
  ) : (
    <video
      ref={videoRef}
      poster={poster}
      autoPlay={settings.video_autoplay !== false}
      loop={settings.video_loop !== false}
      muted={settings.video_muted !== false}
      playsInline
      preload="auto"
      controls={false}
      disablePictureInPicture
      onError={() => setErrored(true)}
      className="absolute inset-0 w-full h-full object-cover"
    >
      <source src={src} type={mimeType} />
    </video>
  );

  return (
    <section className={`relative w-full ${aspectClass(isMobile)} overflow-hidden bg-black`}>
      {link ? <Link to={link} className="absolute inset-0 block">{videoNode}</Link> : videoNode}

      {(settings.video_headline || settings.video_subheadline || showButtons) && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-black/10" />
      )}

      {(settings.video_headline || settings.video_subheadline || showButtons) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-full px-6 sm:px-10 max-w-3xl text-center text-white flex flex-col items-center gap-3 sm:gap-4">
            {settings.video_headline && (
              <h2 className="font-display font-medium uppercase leading-[1.05] tracking-[0.04em] text-[28px] sm:text-[44px] lg:text-[60px]"
                  style={{ fontFamily: '"Archivo Black", system-ui, sans-serif', textShadow: "0 8px 30px rgba(0,0,0,0.4)" }}>
                {settings.video_headline}
              </h2>
            )}
            {settings.video_subheadline && (
              <p className="text-[13px] sm:text-[15px] lg:text-[16px] max-w-xl leading-relaxed opacity-90">
                {settings.video_subheadline}
              </p>
            )}
            {showButtons && (
              <div className="pointer-events-auto mt-3 flex flex-wrap items-center justify-center gap-3">
                {settings.video_button1_text && settings.video_button1_link && (
                  <Link to={settings.video_button1_link} className="inline-flex items-center justify-center px-7 py-3 bg-white text-black text-[12px] sm:text-[13px] font-semibold tracking-[0.14em] uppercase rounded-sm hover:bg-white/90 transition-all">
                    {settings.video_button1_text}
                  </Link>
                )}
                {settings.video_button2_text && settings.video_button2_link && (
                  <Link to={settings.video_button2_link} className="inline-flex items-center justify-center px-7 py-3 border border-white/70 text-white text-[12px] sm:text-[13px] font-semibold tracking-[0.14em] uppercase rounded-sm hover:bg-white/10 backdrop-blur-sm transition-all">
                    {settings.video_button2_text}
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};


const HeroSlider = ({ slides, settings, loading }: HeroSliderProps) => {
  const isMobile = useIsMobile();

  if (loading) return <HeroBlankFrame isMobile={isMobile} />;
  if (!settings || !settings.enabled) return null;

  if (settings.hero_type === "video_hero") {
    return <VideoHero settings={settings} isMobile={isMobile} />;
  }

  // Image slider
  if (slides.length === 0) return <HeroBlankFrame isMobile={isMobile} />;

  // Mobile always single carousel
  if (isMobile || settings.hero_layout === "single" || slides.length < 2) {
    return <SingleSliderCarousel slides={slides} settings={settings} isMobile={isMobile} />;
  }

  return <DualSlider slides={slides} settings={settings} />;
};

export default HeroSlider;
