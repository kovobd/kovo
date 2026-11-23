// Comprehensive Meta Pixel + GA4 + TikTok tracking with CAPI support, advanced matching & event deduplication
import { supabase } from "@/integrations/supabase/client";
import { isMetaTrackingEnabled } from "@/lib/trackingConfig";



const win = typeof window !== "undefined" ? (window as any) : null;
const fbq = (...args: any[]) => win?.fbq?.(...args);
const gtag = (...args: any[]) => win?.gtag?.(...args);
// TikTok script is injected lazily by LayoutDataProvider, so `window.ttq` is
// undefined at module-load. Resolve it on every call instead of capturing once.
// Always return a callable so `ttq.track(...)` is safe even before ttq loads.
const noop = () => {};
const ttq: any = new Proxy({}, {
  get: (_t, prop: string) => {
    const t = win?.ttq;
    if (!t) return noop;
    const v = t[prop];
    return typeof v === "function" ? v.bind(t) : (v ?? noop);
  },
});

const genEventId = (): string =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// ─── Advanced Matching Helpers ──────────────────────────────────

const getCookie = (name: string): string => {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp("(^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[2]) : "";
};

const setCookie = (name: string, value: string, days = 90) => {
  if (typeof document === "undefined") return;
  const exp = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${exp}; path=/; SameSite=Lax`;
};

/** Capture fbclid from URL on load and synthesize _fbc cookie if missing */
const ensureFbc = () => {
  if (typeof window === "undefined") return;
  if (getCookie("_fbc")) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const fbclid = params.get("fbclid");
    if (fbclid) setCookie("_fbc", `fb.1.${Date.now()}.${fbclid}`);
  } catch {}
};
if (typeof window !== "undefined") ensureFbc();

/** Stable per-visitor anonymous ID for advanced matching */
const getExternalId = (): string => {
  if (typeof localStorage === "undefined") return "";
  try {
    let id = localStorage.getItem("__sas_eid");
    if (!id) {
      id = genEventId();
      localStorage.setItem("__sas_eid", id);
    }
    return id;
  } catch {
    return "";
  }
};

const buildUserData = (extra?: Record<string, any>) => {
  const ud: Record<string, any> = {
    fbp: getCookie("_fbp") || undefined,
    fbc: getCookie("_fbc") || undefined,
    external_id: getExternalId() || undefined,
  };
  if (extra) {
    if (extra.email) ud.em = String(extra.email).trim().toLowerCase();
    if (extra.phone) ud.ph = String(extra.phone).replace(/\D/g, "");
    if (extra.firstName) ud.fn = String(extra.firstName).trim().toLowerCase();
    if (extra.lastName) ud.ln = String(extra.lastName).trim().toLowerCase();
    if (extra.city) ud.ct = String(extra.city).replace(/\s+/g, "").toLowerCase();
    if (extra.country) ud.country = String(extra.country).trim().toLowerCase();
  }
  // Strip undefined
  Object.keys(ud).forEach((k) => ud[k] === undefined && delete ud[k]);
  return ud;
};

/** Split full name into first/last for matching */
export const splitName = (fullName?: string) => {
  if (!fullName) return { firstName: undefined, lastName: undefined };
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: undefined };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

/** Best-effort log of the browser pixel fire so the admin Inspector shows browser events. */
const logBrowserPixel = (eventName: string, eventId: string, customData: Record<string, any>) => {
  if (typeof window === "undefined") return;
  const run = () => {
    supabase.rpc("log_browser_pixel_event" as any, {
      p_event_name: eventName,
      p_event_id: eventId,
      p_custom_data: customData || {},
    }).then(() => {}, () => {});
  };
  if ("requestIdleCallback" in window) (window as any).requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 0);
};

/** Fire-and-forget CAPI call via supabase edge function (non-blocking, project-aware) */
const sendCAPI = (
  eventName: string,
  eventId: string,
  customData: Record<string, any>,
  userData?: Record<string, any>,
  eventTime?: number,
) => {
  logBrowserPixel(eventName, eventId, customData);
  // Skip the network round-trip entirely when we already know no Meta pixel
  // is configured. `null` = layout not yet resolved → still send so we don't
  // miss the first PageView race.
  if (isMetaTrackingEnabled() === false) return;
  const ts = eventTime ?? Math.floor(Date.now() / 1000);
  const run = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("meta-capi", {
        body: {
          event_name: eventName,
          event_id: eventId,
          event_time: ts,
          event_source_url: typeof window !== "undefined" ? window.location.href : "",
          referrer: typeof document !== "undefined" ? document.referrer || "" : "",
          custom_data: customData,
          user_data: userData || {},
        },
      });
      if (error) {
        console.warn("[CAPI]", eventName, eventId, "invoke error:", error.message);
      } else if (data && (data as any).success === false && !(data as any).skipped) {
        console.warn("[CAPI]", eventName, eventId, "delivery failed:", (data as any).error || (data as any).result);
      }
    } catch (err) {
      console.warn("[CAPI]", eventName, eventId, "network error:", err);
    }
  };
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    (window as any).requestIdleCallback(run, { timeout: 2000 });
  } else {
    setTimeout(run, 0);
  }
};




// ─── Standard Events ────────────────────────────────────────────

export const trackPageView = (opts?: { skipBrowser?: boolean }) => {
  const eventId = genEventId();
  if (!opts?.skipBrowser) {
    fbq("track", "PageView", {}, { eventID: eventId });
    gtag("event", "page_view");
    ttq?.track("Pageview");
  }
  sendCAPI("PageView", eventId, {}, buildUserData());
};

export const trackViewContent = (product: {
  id: string; name: string; price: number; category?: string; currency?: string;
}) => {
  const eventId = genEventId();
  const currency = product.currency || "BDT";
  const data = {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    value: Number(product.price),
    currency,
  };
  fbq("track", "ViewContent", data, { eventID: eventId });
  gtag("event", "view_item", {
    items: [{ item_id: product.id, item_name: product.name, price: product.price }],
    currency,
    value: product.price,
  });
  ttq?.track("ViewContent", { content_id: product.id, content_name: product.name, value: product.price, currency });
  sendCAPI("ViewContent", eventId, data, buildUserData());
};

export const trackSearch = (query: string) => {
  if (!query.trim()) return;
  const eventId = genEventId();
  const data = { search_string: query };
  fbq("track", "Search", data, { eventID: eventId });
  gtag("event", "search", { search_term: query });
  ttq?.track("Search", { query });
  sendCAPI("Search", eventId, data, buildUserData());
};

// AddToCart burst-throttle (per-product, 500ms)
const atcLast: Record<string, number> = {};
export const trackAddToCart = (product: {
  id: string; name: string; price: number; quantity: number; currency?: string; variant?: string;
}) => {
  const now = Date.now();
  if (atcLast[product.id] && now - atcLast[product.id] < 500) return;
  atcLast[product.id] = now;

  const eventId = genEventId();
  const currency = product.currency || "BDT";
  const price = Number(product.price);
  const qty = Number(product.quantity);
  const value = price * qty;
  const data = {
    content_ids: [product.id],
    content_name: product.name,
    content_type: "product",
    contents: [{ id: product.id, quantity: qty, item_price: price }],
    value,
    currency,
    num_items: qty,
  };
  fbq("track", "AddToCart", data, { eventID: eventId });
  gtag("event", "add_to_cart", {
    items: [{ item_id: product.id, item_name: product.name, price, quantity: qty }],
    currency,
    value,
  });
  ttq?.track("AddToCart", { content_id: product.id, content_name: product.name, value, currency, quantity: qty });
  sendCAPI("AddToCart", eventId, data, buildUserData());
};

export type CheckoutUserData = {
  email?: string; phone?: string; firstName?: string; lastName?: string; city?: string; country?: string;
};

export const trackInitiateCheckout = (
  items: { id: string; name: string; price: number; quantity: number }[],
  value: number,
  currency = "BDT",
  userData?: CheckoutUserData,
) => {
  const eventId = genEventId();
  const data = {
    content_ids: items.map((i) => i.id),
    content_type: "product",
    contents: items.map((i) => ({ id: i.id, quantity: Number(i.quantity), item_price: Number(i.price) })),
    value: Number(value),
    currency,
    num_items: items.reduce((s, i) => s + Number(i.quantity), 0),
  };
  fbq("track", "InitiateCheckout", data, { eventID: eventId });
  gtag("event", "begin_checkout", {
    items: items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
    currency,
    value,
  });
  ttq?.track("InitiateCheckout", { value, currency });
  sendCAPI("InitiateCheckout", eventId, data, buildUserData(userData));
};

export const trackAddPaymentInfo = (value: number, currency = "BDT", userData?: CheckoutUserData) => {
  const eventId = genEventId();
  const data = { value: Number(value), currency };
  fbq("track", "AddPaymentInfo", data, { eventID: eventId });
  gtag("event", "add_payment_info", { currency, value });
  sendCAPI("AddPaymentInfo", eventId, data, buildUserData(userData));
};

/** Deterministic event_id per order so browser refresh OR server retry never duplicates. */
const purchaseEventId = (orderNumber: string) => `purchase_${orderNumber}`;
const purchaseFiredKey = (orderNumber: string) => `__fb_purchase_${orderNumber}`;

export const trackPurchase = (orderData: {
  orderNumber: string;
  total: number;
  currency?: string;
  items?: { id: string; name: string; price: number; quantity: number }[];
  userData?: CheckoutUserData;
}) => {
  if (!orderData.orderNumber || !(Number(orderData.total) > 0)) return;
  // Idempotency guard: prevent re-fire on refresh / back-nav
  try {
    if (typeof localStorage !== "undefined") {
      const k = purchaseFiredKey(orderData.orderNumber);
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, String(Date.now()));
    }
  } catch {}

  const eventId = purchaseEventId(orderData.orderNumber);
  const currency = orderData.currency || "BDT";
  const items = orderData.items || [];
  const data: Record<string, any> = {
    content_ids: items.length ? items.map((i) => i.id) : [orderData.orderNumber],
    content_type: "product",
    contents: items.length
      ? items.map((i) => ({ id: i.id, quantity: Number(i.quantity), item_price: Number(i.price) }))
      : undefined,
    value: Number(orderData.total),
    currency,
    order_id: orderData.orderNumber,
    num_items: items.reduce((s, i) => s + Number(i.quantity), 0) || 1,
  };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  fbq("track", "Purchase", data, { eventID: eventId });
  gtag("event", "purchase", {
    transaction_id: orderData.orderNumber,
    value: orderData.total,
    currency,
    items: items.map((i) => ({ item_id: i.id, item_name: i.name, price: i.price, quantity: i.quantity })),
  });
  ttq?.track("CompletePayment", { value: orderData.total, currency, content_id: orderData.orderNumber });
  sendCAPI("Purchase", eventId, data, buildUserData(orderData.userData));
};

export const trackLead = (formData?: { email?: string; phone?: string }) => {
  const eventId = genEventId();
  fbq("track", "Lead", {}, { eventID: eventId });
  gtag("event", "generate_lead");
  ttq?.track("SubmitForm");
  sendCAPI("Lead", eventId, {}, buildUserData(formData));
};

export const trackCompleteRegistration = (userData?: { email?: string }) => {
  const eventId = genEventId();
  fbq("track", "CompleteRegistration", {}, { eventID: eventId });
  gtag("event", "sign_up");
  ttq?.track("CompleteRegistration");
  sendCAPI("CompleteRegistration", eventId, {}, buildUserData(userData));
};

