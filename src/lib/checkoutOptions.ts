import { supabase } from "@/integrations/supabase/client";

export type PaymentMethod = string;
export type PaymentMethodType = "cod" | "online";

/** One admin-configured payment method (stored in payment_settings.methods). */
export interface PaymentMethodConfig {
  id: string;
  type: PaymentMethodType;
  name: string;
  description: string;
  receiver_number: string;
  logo: string;
  show_instructions: boolean;
  instructions: string;
  enabled: boolean;
  is_default: boolean;
}

/** Storefront-facing method. */
export interface CheckoutMethod {
  id: string;
  type: PaymentMethodType;
  label: string;
  description: string;
  receiverNumber: string;
  logo: string;
  instructions: string;
}

const COD_FALLBACK: CheckoutMethod = {
  id: "cod", type: "cod", label: "Cash on Delivery",
  description: "Pay in cash when your order arrives.", receiverNumber: "", logo: "", instructions: "",
};

export const PAYMENT_METHODS: CheckoutMethod[] = [
  COD_FALLBACK,
  { id: "bkash", type: "online", label: "bKash", description: "Pay via bKash (Send Money).", receiverNumber: "", logo: "", instructions: "" },
  { id: "nagad", type: "online", label: "Nagad", description: "Pay via Nagad (Send Money).", receiverNumber: "", logo: "", instructions: "" },
];

export const paymentLabel = (id: string) =>
  PAYMENT_METHODS.find((p) => p.id === id)?.label ?? id ?? "Cash on Delivery";

export interface PaymentOptions {
  /** Enabled methods, in admin order. */
  methods: CheckoutMethod[];
  /** Method preselected at checkout. */
  defaultId: string;
}

const trim = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Stable id from a method name: "bKash" -> "bkash". */
export const slugifyMethod = (name: string) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "method";

/** Normalise raw json into valid configs (drops nameless entries, one default max). */
export function normalizeMethods(raw: unknown): PaymentMethodConfig[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentMethodConfig[] = [];
  for (const r of raw as any[]) {
    if (!r || !trim(r.name)) continue;
    const type: PaymentMethodType = r.type === "cod" ? "cod" : "online";
    out.push({
      id: trim(r.id) || slugifyMethod(r.name),
      type,
      name: trim(r.name),
      description: trim(r.description),
      receiver_number: type === "online" ? trim(r.receiver_number) : "",
      logo: trim(r.logo),
      show_instructions: !!r.show_instructions,
      instructions: trim(r.instructions),
      enabled: r.enabled !== false,
      is_default: !!r.is_default,
    });
  }
  let seen = false;
  for (const m of out) { if (m.is_default) { if (seen) m.is_default = false; seen = true; } }
  return out;
}

/**
 * Maps stored methods to what checkout shows. Disabled methods are hidden;
 * if nothing usable remains, Cash on Delivery is offered so orders never block.
 * The default is the flagged enabled method, otherwise the first enabled one.
 */
export function resolvePaymentOptions(raw: unknown): PaymentOptions {
  const enabled = normalizeMethods(raw).filter((m) => m.enabled);
  if (!enabled.length) return { methods: [COD_FALLBACK], defaultId: COD_FALLBACK.id };
  const methods: CheckoutMethod[] = enabled.map((m) => ({
    id: m.id, type: m.type, label: m.name, description: m.description,
    receiverNumber: m.receiver_number, logo: m.logo,
    instructions: m.show_instructions ? m.instructions : "",
  }));
  const def = enabled.find((m) => m.is_default) ?? enabled[0];
  return { methods, defaultId: def.id };
}

let paymentOptionsCache: PaymentOptions | null = null;

export function clearPaymentOptionsCache() {
  paymentOptionsCache = null;
}

export async function fetchPaymentOptions(): Promise<PaymentOptions> {
  if (paymentOptionsCache) return paymentOptionsCache;
  const { data, error } = await supabase
    .from("payment_settings")
    .select("methods")
    .eq("id", "default")
    .maybeSingle();
  paymentOptionsCache = resolvePaymentOptions(error ? null : (data as any)?.methods);
  return paymentOptionsCache;
}

export interface DeliveryZone {
  id: string;
  zone_name: string;
  areas?: string | string[] | null;
  delivery_charge: number;
  free_delivery_minimum: number | null;
  estimated_days: string | null;
  enabled: boolean;
  sort_order: number;
}

export async function fetchActiveDeliveryZones(): Promise<DeliveryZone[]> {
  const { data } = await supabase
    .from("delivery_zones")
    .select("id,name,zone_name,areas,delivery_charge,shipping_cost,free_delivery_minimum,free_shipping_threshold,estimated_days,enabled,sort_order")
    .eq("enabled", true)
    .order("sort_order");
  return ((data as any[]) ?? []).map((z) => ({
    id: z.id,
    zone_name: z.zone_name || z.name || "",
    areas: z.areas ?? null,
    delivery_charge: Number(z.delivery_charge ?? z.shipping_cost ?? 0),
    free_delivery_minimum: z.free_delivery_minimum ?? z.free_shipping_threshold ?? null,
    estimated_days: z.estimated_days ?? null,
    enabled: !!z.enabled,
    sort_order: Number(z.sort_order ?? 0),
  }));
}

/** Returns a message describing why the methods can't be saved, or null. */
export function validateMethods(methods: PaymentMethodConfig[]): string | null {
  const idx = methods.findIndex((m) => !m.name.trim());
  if (idx >= 0) return `Method at position ${idx + 1} needs a name.`;
  const bad = methods.find((m) => m.type === "online" && m.receiver_number && !/^01\d{9}$/.test(m.receiver_number.replace(/[\s-]/g, "")));
  if (bad) return `${bad.name}: receiver number should be an 11-digit number starting with 01.`;
  if (methods.length && !methods.some((m) => m.enabled)) return "Turn on at least one payment method.";
  return null;
}
