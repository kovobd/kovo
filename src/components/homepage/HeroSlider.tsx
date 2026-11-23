import { memo, useState, useEffect, useCallback, useRef } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { Link } from "react-router-dom";
import { resolveImageSrc, getR2Base } from "@/lib/cdnImage";
import { heroImageAttrs, HERO_MOBILE_QUERY } from "@/lib/imageUrls";
import { useViewportHint } from "@/lib/viewportHint";

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

const MOBILE_QUERY = HERO_MOBILE_QUERY;
const useIsMobile = () => {
  // On a server-rendered page, start from the server's phone/desktop guess so
  // hydration matches its HTML (the effect below corrects it if the screen
  // disagrees). Otherwise read the viewport synchronously so phones never
  // start downloading the desktop hero image on the first render.
  const hint = useViewportHint();
  const [m, setM] = useState(() =>
    hint ?? (typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches),
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
};

type EmblaApi = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>;

/**
 * Autoplay moves on only once the next slide's photo has finished loading
 * (or failed), so a slide never arrives as an empty frame on a slow
 * connection; it just waits for the next tick.
 */
function nextSlideReady(api: EmblaApi): boolean {
  const slides = api.slideNodes();
  if (slides.length < 2) return true;
  const next = slides[(api.selectedScrollSnap() + 1) % slides.length];
  const imgs = next ? Array.from(next.querySelectorAll("img")) : [];
  return imgs.length > 0 && imgs.every((img) => img.complete);
}

const HeroBlankFrame = ({ isMobile }: { isMobile: boolean }) => (
  <section className={`relative w-full ${isMobile ? "aspect-[9/16] max-h-[85svh]" : "aspect-[16/9] max-h-[calc(100svh-92px)]"} bg-secondary`} aria-hidden />
);

// Memoised: a slide change re-renders the slider, and each slide must keep
// its <img> element (a new one shows the empty frame until it decodes).
const SlideOverlay = memo(function SlideOverlay({ slide, priority, isMobile }: { slide: HeroSlide; priority: boolean; isMobile: boolean }) {
  const mode: InteractionMode = (slide.interaction_mode as InteractionMode) || "buttons";
  const rawSrc = (isMobile && slide.mobile_image_url) || slide.image_url;
  const showButtons = mode === "buttons" || mode === "both";
  const imageIsLink = (mode === "image" || mode === "both") && !!slide.image_click_link;

  const altText = [slide.headline, slide.subheadline].filter(Boolean).join(" — ")
    || "Kovo collection";

  // Responsive sizes: full-viewport hero. Mobile ~100vw at portrait aspect,
  // desktop ~100vw capped by the 16:9 hero frame.
  const sizes = isMobile ? "100vw" : "(min-width: 1280px) 1600px, 100vw";

  // Same attributes the Worker uses to preload the first slide from the HTML.
  const attrs = heroImageAttrs(slide, isMobile, getR2Base());
  const imgNode = (
      <img
        // sizes/srcSet before src so the browser never fetches src first.
        sizes={attrs?.srcSet ? attrs.sizes : undefined}
        srcSet={attrs?.srcSet}
        src={attrs?.src ?? resolveImageSrc(rawSrc, isMobile ? 800 : 1600)}
        alt={altText}
        width={isMobile ? 900 : 1600}
        height={isMobile ? 1600 : 900}
        className="absolute inset-0 w-full h-full object-cover"
        // Later slides are only mounted once the page has loaded (see
        // laterSlidesReady), so they download straight away, ready before
        // they slide in. ("lazy" waited until a slide was on screen, showing
        // the empty frame while it loaded.)
        loading="eager"
        decoding="async"
        {...(priority ? { fetchpriority: "high" as const } : { fetchpriority: "low" as const })}
      />
  );

  return (
    // Light placeholder, not black, behind a photo that is still loading.
    <div className="relative w-full h-full overflow-hidden bg-secondary">
      {/* Not a wrapper component declared in here: that would be a new
          component type on every render, so React would replace the <img>
          (and flash the empty frame) each time the slide changed. */}
      {imageIsLink ? (
        <Link to={slide.image_click_link!} className="absolute inset-0 block">{imgNode}</Link>
      ) : (
        imgNode
      )}

      {(slide.headline || slide.subheadline || showButtons) && (
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/65 via-black/20 to-transparent" />
      )}

      {(slide.headline || slide.subheadline || (showButtons && (slide.button1_text || slide.button2_text))) && (
        <div className="absolute inset-0 flex items-end justify-start pointer-events-none pb-16 sm:pb-20 lg:pb-24">
          <div className="w-full px-6 sm:px-10 lg:px-16 max-w-3xl text-left text-white flex flex-col items-start gap-3 sm:gap-4 kovo-enter">
            {slide.headline && (
              <h2 className="font-display font-medium text-white leading-[1.08] tracking-[-0.01em] text-[30px] sm:text-[44px] lg:text-[56px] max-w-[16ch] text-balance"
                  style={{ textShadow: "0 2px 24px rgba(0,0,0,0.35)" }}>
                {slide.headline}
              </h2>
            )}
            {slide.subheadline && (
              <p className="text-[13px] sm:text-[15px] lg:text-[16px] max-w-xl leading-relaxed opacity-90">
                {slide.subheadline}
              </p>
            )}
            {showButtons && (slide.button1_text || slide.button2_text) && (
              <div className="pointer-events-auto mt-3 flex flex-wrap items-center justify-start gap-3">
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
});

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
  // Slides after the first wait until the page has loaded, so the first
  // hero image gets the whole connection.
  const [laterSlidesReady, setLaterSlidesReady] = useState(false);
  useEffect(() => {
    const ready = () => setTimeout(() => setLaterSlidesReady(true), 1200);
    if (document.readyState === "complete") { const t = ready(); return () => clearTimeout(t); }
    let t: ReturnType<typeof setTimeout> | undefined;
    const onLoad = () => { t = ready(); };
    window.addEventListener("load", onLoad, { once: true });
    return () => { window.removeEventListener("load", onLoad); if (t) clearTimeout(t); };
  }, []);
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
      if (!hoverRef.current && nextSlideReady(emblaApi)) emblaApi.scrollNext();
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
            <div className="embla__slide flex-[0_0_100%] min-w-0 relative h-full bg-secondary" key={slide.id}>
              {(index === 0 || laterSlidesReady || index === activeIndex) && (
                <SlideOverlay slide={slide} priority={index === 0} isMobile={isMobile} />
              )}
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-6 right-6 sm:right-10 lg:right-16 flex gap-2 z-10">
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
      if (!hoverRef.current && nextSlideReady(emblaApi)) emblaApi.scrollNext();
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
        <div className="absolute bottom-6 right-6 sm:right-10 lg:right-16 flex gap-2 z-10">
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
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-black/65 via-black/20 to-transparent" />
      )}

      {(settings.video_headline || settings.video_subheadline || showButtons) && (
        <div className="absolute inset-0 flex items-end justify-start pointer-events-none pb-16 sm:pb-20 lg:pb-24">
          <div className="w-full px-6 sm:px-10 lg:px-16 max-w-3xl text-left text-white flex flex-col items-start gap-3 sm:gap-4 kovo-enter">
            {settings.video_headline && (
              <h2 className="font-display font-medium text-white leading-[1.08] tracking-[-0.01em] text-[30px] sm:text-[44px] lg:text-[56px] max-w-[16ch] text-balance"
                  style={{ textShadow: "0 2px 24px rgba(0,0,0,0.35)" }}>
                {settings.video_headline}
              </h2>
            )}
            {settings.video_subheadline && (
              <p className="text-[13px] sm:text-[15px] lg:text-[16px] max-w-xl leading-relaxed opacity-90">
                {settings.video_subheadline}
              </p>
            )}
            {showButtons && (
              <div className="pointer-events-auto mt-3 flex flex-wrap items-center justify-start gap-3">
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
