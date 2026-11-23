import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PublicApi } from "@/lib/publicApi";
import { useStorefrontVersion } from "@/lib/storefrontCache";
import { trackPageView } from "@/lib/trackingEvents";
import { setMetaTrackingEnabled } from "@/lib/trackingConfig";
import { setRuntimeR2Base } from "@/lib/cdnImage";

interface FooterData {
  store_name: string;
  description: string;
  email: string;
  phone: string;
  address: string;
  copyright_text: string;
  social_links: any[];
  quick_links: any[];
  customer_care_links: any[];
  newsletter_enabled: boolean;
}

interface LayoutData {
  logoDesktop: string | null;
  logoMobile: string | null;
  logoFooter: string | null;
  whatsapp: { phone_number: string; enabled: boolean; radar_animation: boolean } | null;
  announcement: { enabled: boolean; text: string; link: string | null; bg_color: string; text_color: string; dismissible: boolean } | null;
  announcements: { id: string; enabled: boolean; text: string; link: string | null; bg_color: string; text_color: string; dismissible: boolean; sort_order: number }[];
  announcementSettings: { direction: 'left' | 'right'; speed: number } | null;
  footer: FooterData | null;
  floatingIcons: { id: string; label: string; url: string; icon_url: string | null; bg_color: string; icon_color?: string; preset_key?: string | null; sort_order: number; enabled: boolean }[];
  floatingSettings: { enabled: boolean; radar_animation: boolean; expand_icon_url: string | null; animation_style?: string; animation_intensity?: string } | null;
  cardButtons: { showViewDetails: boolean; showAddToCart: boolean; showBuyNow: boolean; primary: "view_details" | "add_to_cart" };
  directOrderChannels: { id: string; enabled: boolean; label: string; identifier: string; message_template: string; sort_order: number }[];
  loaded: boolean;
}

const LayoutDataContext = createContext<LayoutData>({
  logoDesktop: null,
  logoMobile: null,
  logoFooter: null,
  whatsapp: null,
  announcement: null,
  announcements: [],
  announcementSettings: { direction: 'left', speed: 5 },
  footer: null,
  floatingIcons: [],
  floatingSettings: null,
  cardButtons: { showViewDetails: true, showAddToCart: true, showBuyNow: true, primary: "view_details" },
  directOrderChannels: [],
  loaded: false,
});

export const useLayoutData = () => useContext(LayoutDataContext);

const EMPTY_PIXELS: any[] = [];

export const LayoutDataProvider = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const pixelsInjected = useRef(false);
  const firstPageView = useRef(true);

  useEffect(() => {
    // `fbq('init', …)` auto-fires the first PageView in the browser. Skip our
    // manual browser fire for the initial load to avoid 2× PageView; CAPI still
    // sends a server PageView so the funnel is intact.
    trackPageView({ skipBrowser: firstPageView.current });
    firstPageView.current = false;
  }, [location.pathname]);

  const storefrontVersion = useStorefrontVersion();
  const { data: layout } = useQuery({
    queryKey: ["public-layout", storefrontVersion ?? "v0"],
    queryFn: () => PublicApi.layout(storefrontVersion),
    // Layout very rarely changes; cache aggressively.
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });

  const loaded = layout !== undefined;
  const r2PublicBaseUrl = (layout as any)?.r2PublicBaseUrl as string | undefined;

  useEffect(() => {
    if (r2PublicBaseUrl) setRuntimeR2Base(r2PublicBaseUrl);
  }, [r2PublicBaseUrl]);

  const design = (layout as any)?.design ?? null;
  const shop = (layout as any)?.shopSettings ?? {};
  // Stable reference: a fresh `[]` each render re-ran the pixel effects below.
  const pixels: any[] = (layout as any)?.trackingPixels ?? EMPTY_PIXELS;

  useEffect(() => {
    if (!loaded) return;
    // Cache Meta tracking availability so CAPI calls are skipped when no
    // Facebook pixel is configured for the project.
    const hasMeta = pixels.some((p: any) => p?.platform === "facebook" && p?.pixel_id);
    setMetaTrackingEnabled(hasMeta);
  }, [loaded, pixels]);

  useEffect(() => {
    if (!pixels || pixels.length === 0 || pixelsInjected.current) return;
    pixelsInjected.current = true;

    const injectPixel = (px: any) => {
      if (!px.pixel_id) return;
      if (px.platform === "facebook") {
        // Stable per-visitor external_id for Advanced Matching (mirrors what
        // CAPI sends server-side, hashed). Improves Event Match Quality.
        let extId = "";
        try {
          extId = localStorage.getItem("__sas_eid") || "";
          if (!extId) { extId = crypto.randomUUID(); localStorage.setItem("__sas_eid", extId); }
        } catch {}
        const amBlock = px.advanced_matching !== false && extId
          ? `,{external_id:'${extId}'}` : "";
        const script = document.createElement("script");
        script.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${px.pixel_id}'${amBlock});`;
        document.head.appendChild(script);
      }
      if (px.platform === "google_analytics") {
        const loader = document.createElement("script");
        loader.async = true;
        loader.src = `https://www.googletagmanager.com/gtag/js?id=${px.pixel_id}`;
        document.head.appendChild(loader);
        const init = document.createElement("script");
        init.innerHTML = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${px.pixel_id}');`;
        document.head.appendChild(init);
      }
      if (px.platform === "tiktok") {
        const script = document.createElement("script");
        script.innerHTML = `!function(w,d,t){w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement("script");o.type="text/javascript";o.async=!0;o.src=i+"?sdkid="+e+"&lib="+t;var a=document.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};ttq.load('${px.pixel_id}');ttq.page()}(window,document,'ttq');`;
        document.head.appendChild(script);
      }
    };

    const ric = (cb: () => void) =>
      "requestIdleCallback" in window
        ? (window as any).requestIdleCallback(cb, { timeout: 2000 })
        : globalThis.setTimeout(cb, 100);

    const inject = (i = 0) => {
      if (i >= pixels.length) return;
      injectPixel(pixels[i]);
      ric(() => inject(i + 1));
    };
    ric(() => inject(0));
  }, [pixels]);

  const value: LayoutData = {
    logoDesktop: design?.logo_desktop_url ?? null,
    logoMobile: design?.logo_mobile_url ?? null,
    logoFooter: design?.logo_footer_url ?? null,
    whatsapp: (layout as any)?.whatsapp ?? null,
    announcement: (layout as any)?.announcement ?? null,
    announcements: (layout as any)?.announcements ?? [],
    announcementSettings: (layout as any)?.announcementSettings ?? { direction: 'left', speed: 5 },
    footer: (layout as any)?.footer ?? null,
    floatingIcons: (layout as any)?.floatingIcons ?? [],
    floatingSettings: (layout as any)?.floatingSettings ?? null,
    cardButtons: {
      showViewDetails: shop.card_show_view_details !== false,
      showAddToCart: shop.card_show_add_to_cart !== false,
      showBuyNow: shop.card_show_buy_now !== false,
      primary: shop.card_cta_mode === "add_to_cart" ? "add_to_cart" : "view_details",
    },
    directOrderChannels: (layout as any)?.directOrderChannels ?? [],
    loaded,
  };

  return <LayoutDataContext.Provider value={value}>{children}</LayoutDataContext.Provider>;
};
