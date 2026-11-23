// Shared order-editor dialog used by both "Create Same Order" (reorder) and
// "Recover Incomplete Order" (recover). Single source of truth for customer,
// product, variant, coupon, manual-discount, shipping, totals & submit logic.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Trash2, Plus, Minus, Package, Search, Tag, Repeat, Sparkles,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/cdnImage";
import { recoverIncompleteOrderClient } from "@/lib/recoverIncompleteOrder";

// ── shared types ────────────────────────────────────────────────────────────
export type ProductVariantLite = {
  id: string;
  label: string;
  price: number;
  sku: string;
  stock: number;
  image: string | null;
  active: boolean;
};

export type ProductLite = {
  id: string;
  name: string;
  price: number;
  priceMin?: number;
  priceMax?: number;
  sku: string;
  stock: number;
  image: string | null;
  active: boolean;
  hasVariants: boolean;
  variants: ProductVariantLite[];
};

export type OrderItem = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  sku?: string;
  image?: string;
  variantId?: string | null;
  variant?: string | null;
  hasVariants?: boolean;
  stock?: number;
  invalidVariant?: boolean;
  productMissing?: boolean;
  inactive?: boolean;
  originalPrice?: number;
};

export type IncompleteRowLite = {
  id: string;
  customer_name: string | null;
  phone: string;
  email: string | null;
  address: Record<string, any> | null;
  cart_items: any[];
  delivery_charge: number;
  coupon: string | null;
  payment_method: string | null;
  recovered: boolean;
};

export type ReorderSource = {
  kind: "reorder";
  phone: string;
  name?: string;
  email?: string;
  orderId?: string | null;
  reminderId?: string | null;
  productId?: string | null;
  productName?: string | null;
};

export type RecoverSource = {
  kind: "recover";
  row: IncompleteRowLite;
};

export type OrderEditorSource = ReorderSource | RecoverSource;

// ── helpers ─────────────────────────────────────────────────────────────────
const fmtMoney = (n: number) => `${CURRENCY_SYMBOL}${Number(n || 0).toLocaleString()}`;
const normPhone = (p: string) => (p || "").replace(/\D/g, "");
const variantLabelFromValues = (values: any): string => {
  if (!values || typeof values !== "object") return "";
  return Object.values(values).filter(Boolean).join(" / ");
};

const CardSec = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <div className="bg-background border border-border/60 rounded-[4px] p-3 sm:p-3.5">
    <div className="flex items-center justify-between mb-2">
      <h3 className="text-[10.5px] uppercase tracking-wide font-semibold text-muted-foreground/80">{title}</h3>
      {typeof count === "number" && (
        <span className="text-[10.5px] text-muted-foreground/70 tabular-nums">{count} item{count !== 1 ? "s" : ""}</span>
      )}
    </div>
    {children}
  </div>
);

const FieldSec = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1", className)}>
    <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70 font-medium">{label}</Label>
    {children}
  </div>
);

// ── variant picker ──────────────────────────────────────────────────────────
function VariantPickerDialog({
  open, onClose, product, onPick,
}: {
  open: boolean; onClose: () => void;
  product: ProductLite | null;
  onPick: (v: ProductVariantLite) => void;
}) {
  if (!product) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md p-0 rounded-[4px] gap-0 border-border/60">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="text-[15px] font-semibold leading-tight truncate">{product.name}</DialogTitle>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">Select a variant</p>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {product.variants.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">No active variants available.</div>
          ) : (
            <div className="space-y-1">
              {product.variants.map((v) => {
                const oos = v.stock <= 0;
                const img = v.image || product.image;
                return (
                  <button
                    key={v.id}
                    type="button"
                    disabled={oos || !v.active}
                    onClick={() => onPick(v)}
                    className={cn(
                      "w-full flex items-center gap-3 px-2.5 py-2 rounded-[4px] text-left transition-colors",
                      (oos || !v.active) ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/60",
                    )}
                  >
                    {img ? (
                      <img src={resolveImageSrc(img, 400)} alt="" loading="lazy" className="w-11 h-11 rounded-[4px] object-cover border border-border/40 shrink-0" />
                    ) : (
                      <div className="w-11 h-11 rounded-[4px] bg-muted/60 flex items-center justify-center shrink-0">
                        <Package size={12} className="text-muted-foreground/60" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-medium truncate text-foreground leading-tight">{v.label || "Variant"}</p>
                      <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground/80 mt-0.5">
                        {v.sku && <span className="truncate">{v.sku}</span>}
                        {v.sku && <span className="text-muted-foreground/40">•</span>}
                        <span className="tabular-nums">Stock {v.stock}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[12.5px] font-semibold tabular-nums text-foreground">{fmtMoney(v.price)}</div>
                      {oos && (
                        <span className="inline-block mt-0.5 text-[9.5px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-[3px] bg-destructive/10 text-destructive">Out of stock</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── main dialog ─────────────────────────────────────────────────────────────
type Props = {
  open: boolean;
  onClose: () => void;
  source: OrderEditorSource | null;
  /** Optional hook called after a successful submit; receives the new order id + number. */
  onSubmitted?: (info: { orderId: string; orderNumber: string }) => void | Promise<void>;
};

export default function OrderEditorDialog({ open, onClose, source, onSubmitted }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const mode: "reorder" | "recover" = source?.kind === "recover" ? "recover" : "reorder";
  const recoverRow = source?.kind === "recover" ? source.row : null;
  const reorderSrc = source?.kind === "reorder" ? source : null;

  // ── state ────────────────────────────────────────────────────────────────
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [zoneId, setZoneId] = useState<string>("");
  const [zoneTouched, setZoneTouched] = useState(false);
  const [shippingCost, setShippingCost] = useState(0);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [notes, setNotes] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showProductResults, setShowProductResults] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Coupon
  const [couponInput, setCouponInput] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<
    { code: string; discount_type: "fixed" | "percentage"; discount_value: number } | null
  >(null);

  // Manual discount
  const [manualDiscountType, setManualDiscountType] = useState<"fixed" | "percentage">("fixed");
  const [manualDiscountInput, setManualDiscountInput] = useState("");
  const [manualDiscount, setManualDiscount] = useState<{ type: "fixed" | "percentage"; value: number } | null>(null);

  const [variantPickerFor, setVariantPickerFor] = useState<ProductLite | null>(null);

  // ── queries ──────────────────────────────────────────────────────────────
  // Reorder mode only: hydrate from customers + last order.
  const reorderEnabled = open && mode === "reorder" && !!reorderSrc?.phone;
  const { data: loaded, isLoading: loadedLoading } = useQuery({
    queryKey: ["admin", "order-editor", "reorder-source", reorderSrc?.phone, reorderSrc?.orderId, reorderSrc?.productId],
    enabled: reorderEnabled,
    queryFn: async () => {
      const last10 = normPhone(reorderSrc!.phone).slice(-10);
      const [{ data: cust }, lastOrderRes, productRes] = await Promise.all([
        supabase.from("customers")
          .select("name,email,phone,address,city")
          .ilike("phone", `%${last10}%`).limit(1).maybeSingle(),
        reorderSrc?.orderId
          ? supabase.from("orders").select("items,shipping_address,customer_address,customer_city,shipping_cost,payment_method,notes").eq("id", reorderSrc.orderId).maybeSingle()
          : supabase.from("orders").select("items,shipping_address,customer_address,customer_city,shipping_cost,payment_method,notes")
              .ilike("customer_phone", `%${last10}%`).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        reorderSrc?.productId
          ? supabase.from("products").select("id,name,price,sale_price,sku").eq("id", reorderSrc.productId).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      return { customer: cust, lastOrder: (lastOrderRes as any)?.data ?? null, product: (productRes as any)?.data ?? null };
    },
  });

  const { data: deliveryZones = [] } = useQuery({
    queryKey: ["admin", "order-editor", "delivery-zones"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("delivery_zones")
        .select("id,name,zone_name,areas,delivery_charge,free_delivery_minimum,enabled,sort_order")
        .eq("enabled", true).order("sort_order");
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  const { data: products = [] as ProductLite[] } = useQuery<ProductLite[]>({
    queryKey: ["admin", "order-editor", "products"],
    enabled: open,
    queryFn: async () => {
      const [{ data: prods }, { data: vars }, { data: media }] = await Promise.all([
        supabase.from("products").select("id,name,price,sale_price,sku,stock,status").order("name").limit(2000),
        supabase.from("product_variants")
          .select("id,product_id,option_values,price,sale_price,sku,stock,active,image_url,sort_order"),
        supabase.from("product_media").select("product_id,image_url,sort_order,variant_id").order("sort_order"),
      ]);
      const firstImg = new Map<string, string>();
      (media ?? []).forEach((m: any) => {
        if (m.variant_id) return;
        if (m.product_id && !firstImg.has(m.product_id)) firstImg.set(m.product_id, m.image_url);
      });
      const byProduct = new Map<string, ProductVariantLite[]>();
      (vars ?? []).forEach((v: any) => {
        if (!v.product_id) return;
        const list = byProduct.get(v.product_id) ?? [];
        list.push({
          id: v.id,
          label: variantLabelFromValues(v.option_values) || v.sku || "Variant",
          price: Number(v.sale_price ?? v.price) || 0,
          sku: v.sku || "",
          stock: Number(v.stock ?? 0),
          image: v.image_url || null,
          active: v.active !== false,
        });
        byProduct.set(v.product_id, list);
      });
      return (prods ?? []).map((p: any) => {
        const vlist = (byProduct.get(p.id) ?? []).sort((a, b) => a.label.localeCompare(b.label));
        const activeVars = vlist.filter((v) => v.active);
        const basePrice = Number(p.sale_price ?? p.price) || 0;
        const variantPrices = activeVars.filter((v) => v.price > 0).map((v) => v.price);
        const priceMin = variantPrices.length ? Math.min(...variantPrices) : undefined;
        const priceMax = variantPrices.length ? Math.max(...variantPrices) : undefined;
        return {
          id: p.id,
          name: p.name,
          price: basePrice > 0 ? basePrice : (priceMin ?? 0),
          priceMin,
          priceMax,
          sku: p.sku || "",
          stock: Number(p.stock ?? 0),
          image: firstImg.get(p.id) || null,
          active: (p.status ?? "active") === "active",
          hasVariants: vlist.length > 0,
          variants: vlist,
        } as ProductLite;
      });
    },
    staleTime: 5 * 60_000,
  });

  // ── seed effect ──────────────────────────────────────────────────────────
  const initRef = useRef<string | null>(null);
  useEffect(() => { if (!open) initRef.current = null; }, [open]);

  useEffect(() => {
    if (!open || !source) return;
    if (mode === "reorder" && loadedLoading) return; // wait for hydration

    const key = mode === "recover"
      ? `recover:${recoverRow!.id}`
      : `reorder:${reorderSrc!.reminderId || reorderSrc!.orderId || reorderSrc!.phone}`;
    if (initRef.current === key) return;
    initRef.current = key;

    if (mode === "recover" && recoverRow) {
      const addr = recoverRow.address ?? {};
      const flatAddr = [addr.line1 || addr.address || addr.street, addr.city]
        .filter(Boolean)
        .join(", ");
      setCustomerName(recoverRow.customer_name ?? "");
      setPhone(recoverRow.phone ?? "");
      setEmail(recoverRow.email ?? "");
      setAddress(flatAddr);
      setShippingCost(Number(recoverRow.delivery_charge) || 0);
      setZoneTouched(false);
      setPaymentMethod(recoverRow.payment_method || "cod");
      setNotes("");
      setCouponInput(recoverRow.coupon ?? "");
      setAppliedCoupon(null);
      setManualDiscountInput("");
      setManualDiscount(null);
      setManualDiscountType("fixed");
      const seeded: OrderItem[] = Array.isArray(recoverRow.cart_items)
        ? recoverRow.cart_items.map((it: any) => {
            const snapPrice = Number(it.sale_price ?? it.price) || 0;
            return {
              id: it.product_id || it.id,
              name: it.name,
              price: snapPrice,
              originalPrice: snapPrice,
              quantity: Number(it.quantity) || 1,
              sku: it.sku || "",
              image: it.image || "",
              variantId: it.variant_id || null,
              variant: it.variant || null,
            };
          })
        : [];
      setItems(seeded);
      return;
    }

    // Reorder seed
    const src = reorderSrc!;
    setCustomerName(src.name || (loaded?.customer as any)?.name || "");
    setPhone(src.phone || (loaded?.customer as any)?.phone || "");
    setEmail(src.email || (loaded?.customer as any)?.email || "");
    const lo: any = loaded?.lastOrder;
    const cust: any = loaded?.customer;
    const sa = lo?.shipping_address;
    const isObj = sa && typeof sa === "object";
    const addr = (isObj ? (sa.line1 || sa.address || sa.street) : null)
      || lo?.customer_address || cust?.address || "";
    setAddress(addr || "");
    setShippingCost(Number(lo?.shipping_cost ?? 0));
    setZoneTouched(false);
    setPaymentMethod(lo?.payment_method || "cod");
    setNotes("");
    setCouponInput("");
    setAppliedCoupon(null);
    setManualDiscountInput("");
    setManualDiscount(null);
    setManualDiscountType("fixed");

    const allLines: OrderItem[] = Array.isArray(lo?.items)
      ? lo.items
          .filter((it: any) => !it?.is_free_gift)
          .map((it: any) => {
            const snapPrice = Number(it.price) || 0;
            return {
              id: it.product_id || it.id,
              name: it.name,
              price: snapPrice,
              originalPrice: snapPrice,
              quantity: Number(it.quantity) || 1,
              sku: it.sku || "",
              image: it.image || "",
              variantId: it.variant_id || null,
              variant: it.variant || null,
            };
          })
      : [];

    if (src.productId) {
      const match = allLines.find((it) => it.id === src.productId);
      const p: any = (loaded as any)?.product;
      if (match) setItems([{ ...match, quantity: 1 }]);
      else if (p) setItems([{
        id: p.id, name: p.name,
        price: Number(p.sale_price ?? p.price) || 0,
        quantity: 1, sku: p.sku || "", image: "",
        variantId: null, variant: null,
      }]);
      else setItems([{
        id: src.productId, name: src.productName || "Product",
        price: 0, quantity: 1, sku: "", image: "",
        variantId: null, variant: null,
      }]);
    } else {
      setItems(allLines);
    }
  }, [open, source, loaded, loadedLoading, mode]);

  // Sync seeded items with live product/variant data — single source of truth.
  // Catalog dictates image, name, price, sku, stock. Snapshot is reference only.
  useEffect(() => {
    if (!open || products.length === 0) return;
    setItems((prev) => prev.map((it) => {
      const p = products.find((x) => x.id === it.id);
      if (!p) {
        // Product was deleted from catalog.
        return { ...it, productMissing: true, inactive: false, invalidVariant: false, stock: 0 };
      }
      const inactive = !p.active;
      if (p.hasVariants) {
        if (!it.variantId) {
          return {
            ...it, productMissing: false, inactive, hasVariants: true,
            name: p.name, image: p.image || it.image || undefined,
            invalidVariant: true, stock: 0,
          };
        }
        const v = p.variants.find((x) => x.id === it.variantId);
        if (!v || !v.active) {
          return {
            ...it, productMissing: false, inactive, hasVariants: true,
            name: p.name, image: p.image || it.image || undefined,
            invalidVariant: true, variant: "Variant unavailable", stock: 0,
          };
        }
        return {
          ...it, productMissing: false, inactive, hasVariants: true, invalidVariant: false,
          name: p.name, price: v.price, sku: v.sku, stock: v.stock,
          variant: v.label, image: v.image || p.image || undefined,
        };
      }
      return {
        ...it, productMissing: false, inactive,
        hasVariants: false, invalidVariant: false,
        name: p.name, price: p.price, sku: p.sku, stock: p.stock,
        variantId: null, variant: null, image: p.image || undefined,
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, products]);


  // Auto-match delivery zone from previous zone name (reorder) or row address (recover).
  useEffect(() => {
    if (!open || zoneTouched || deliveryZones.length === 0) return;
    const norm = (s: string) => (s || "").toLowerCase().trim();
    let prevZone = "";
    if (mode === "reorder") {
      const sa: any = (loaded?.lastOrder as any)?.shipping_address;
      prevZone = (sa && typeof sa === "object") ? (sa.delivery_zone || "") : "";
    } else if (recoverRow) {
      const a: any = recoverRow.address ?? {};
      prevZone = a.delivery_zone || a.zone || "";
    }
    let match: any = null;
    if (prevZone) {
      match = (deliveryZones as any[]).find((z) =>
        norm(z.zone_name) === norm(prevZone) || norm(z.name) === norm(prevZone),
      );
    }
    if (!match && address) {
      const needle = norm(address);
      match = (deliveryZones as any[]).find((z) => {
        const fields = [norm(z.name), norm(z.zone_name), ...(Array.isArray(z.areas) ? z.areas.map(norm) : [])];
        return fields.some((f) => f && needle.includes(f));
      });
    }
    if (match) setZoneId(match.id);
  }, [open, deliveryZones, loaded, address, zoneTouched, mode, recoverRow]);

  // ── derived totals ───────────────────────────────────────────────────────
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);

  const matchedZone = useMemo(
    () => (deliveryZones as any[]).find((z) => z.id === zoneId) || null,
    [deliveryZones, zoneId],
  );
  const zoneCharge = matchedZone ? Number(matchedZone.delivery_charge) || 0 : 0;
  const zoneFreeMin = matchedZone ? Number(matchedZone.free_delivery_minimum) || 0 : 0;
  const zoneShipping = (zoneFreeMin > 0 && subtotal >= zoneFreeMin) ? 0 : zoneCharge;

  useEffect(() => {
    if (matchedZone) setShippingCost(zoneShipping);
  }, [matchedZone, zoneShipping]);

  const freeShippingApplied = !!matchedZone && zoneFreeMin > 0 && subtotal >= zoneFreeMin;

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const d = appliedCoupon.discount_type === "percentage"
      ? subtotal * (Number(appliedCoupon.discount_value) || 0) / 100
      : Number(appliedCoupon.discount_value) || 0;
    return Math.max(0, Math.min(d, subtotal));
  }, [appliedCoupon, subtotal]);

  const manualDiscountAmount = useMemo(() => {
    if (!manualDiscount) return 0;
    const d = manualDiscount.type === "percentage"
      ? subtotal * (Number(manualDiscount.value) || 0) / 100
      : Number(manualDiscount.value) || 0;
    return Math.max(0, Math.min(d, subtotal));
  }, [manualDiscount, subtotal]);

  const totalDiscount = Math.min(subtotal, couponDiscount + manualDiscountAmount);
  const total = Math.max(0, subtotal + shippingCost - totalDiscount);

  // ── coupon / manual discount handlers ────────────────────────────────────
  const applyCoupon = async () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) { toast({ title: "Enter a coupon code", variant: "destructive" }); return; }
    setCouponLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("validate_coupon", { _code: code, _cart_total: subtotal });
      if (error) throw error;
      const r: any = Array.isArray(data) ? data[0] : data;
      if (!r || !r.valid) {
        const reason = r?.error;
        const msg = reason === "INVALID_CODE" ? "Invalid coupon code"
          : reason === "DISABLED" ? "Coupon is no longer active"
          : reason === "NOT_STARTED" ? "Coupon isn't active yet"
          : reason === "EXPIRED" ? "Coupon has expired"
          : reason === "LIMIT_REACHED" ? "Coupon usage limit reached"
          : reason === "MIN_ORDER" && r?.min_order_amount != null
            ? `Minimum order ${fmtMoney(Number(r.min_order_amount))} required`
            : "Invalid coupon code";
        toast({ title: msg, variant: "destructive" });
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({ code: r.code, discount_type: r.discount_type, discount_value: Number(r.discount_value) });
      setCouponInput(r.code);
      toast({ title: `Coupon applied · ${r.code}` });
    } catch (e: any) {
      toast({ title: "Could not validate coupon", description: e.message, variant: "destructive" });
    } finally {
      setCouponLoading(false);
    }
  };

  const applyManualDiscount = () => {
    const v = Number(manualDiscountInput);
    if (!Number.isFinite(v) || v <= 0) { toast({ title: "Enter a discount value", variant: "destructive" }); return; }
    if (manualDiscountType === "percentage" && v > 100) { toast({ title: "Percentage cannot exceed 100", variant: "destructive" }); return; }
    setManualDiscount({ type: manualDiscountType, value: v });
  };

  // ── add / search ─────────────────────────────────────────────────────────
  const addItem = (p: ProductLite, v: ProductVariantLite | null) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.id === p.id && (x.variantId ?? null) === (v?.id ?? null));
      if (i >= 0) {
        const next = [...prev]; next[i] = { ...next[i], quantity: next[i].quantity + 1, invalidVariant: false };
        return next;
      }
      return [...prev, {
        id: p.id, name: p.name,
        price: v ? v.price : p.price,
        quantity: 1,
        sku: v?.sku || p.sku || "",
        image: v?.image || p.image || undefined,
        variantId: v?.id ?? null,
        variant: v?.label ?? null,
        hasVariants: p.hasVariants,
        stock: v ? v.stock : p.stock,
      }];
    });
  };

  const pickProduct = (pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (!p) return;
    setProductSearch("");
    setShowProductResults(false);
    if (p.hasVariants) { setVariantPickerFor(p); return; }
    addItem(p, null);
  };

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    const base = products.filter((p) => p.active);
    if (!q) return base.slice(0, 50);
    return base.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if ((p.sku || "").toLowerCase().includes(q)) return true;
      if (p.variants.some((v) => (v.sku || "").toLowerCase().includes(q))) return true;
      return false;
    }).slice(0, 50);
  }, [products, productSearch]);

  // ── submit ───────────────────────────────────────────────────────────────
  const submit = async () => {
    if (items.length === 0) { toast({ title: "Add at least one product", variant: "destructive" }); return; }
    const digits = normPhone(phone);
    if (digits.length < 10) { toast({ title: "Valid phone required", variant: "destructive" }); return; }
    const deleted = items.find((it) => it.productMissing);
    if (deleted) {
      toast({ title: "Product deleted", description: `Remove or replace "${deleted.name}" before continuing.`, variant: "destructive" });
      return;
    }
    const inactiveItem = items.find((it) => it.inactive);
    if (inactiveItem) {
      toast({ title: "Inactive product", description: `"${inactiveItem.name}" is inactive. Reactivate or replace it.`, variant: "destructive" });
      return;
    }
    const missingVariant = items.find((it) => it.hasVariants && (!it.variantId || it.invalidVariant));
    if (missingVariant) {
      toast({ title: "Select a variant", description: `Pick an available variant for "${missingVariant.name}".`, variant: "destructive" });
      return;
    }
    const outOfStock = items.find((it) => typeof it.stock === "number" && it.stock < it.quantity);
    if (outOfStock) {
      toast({ title: "Insufficient stock", description: `${outOfStock.name}${outOfStock.variant ? ` (${outOfStock.variant})` : ""} has ${outOfStock.stock} in stock.`, variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const zoneLabel = matchedZone?.zone_name || matchedZone?.name || null;

      if (mode === "recover" && recoverRow) {
        if (recoverRow.recovered) {
          toast({ title: "Already recovered", variant: "destructive" });
          setSubmitting(false);
          return;
        }
        const result = await recoverIncompleteOrderClient({
          incompleteId: recoverRow.id,
          sessionPhone: recoverRow.phone,
          customer: {
            name: customerName || "Customer",
            phone: digits,
            email: email || null,
            address: address || null,
            city: zoneLabel,
          },
          shippingAddress: {
            country: "Bangladesh",
            line1: address || null,
            delivery_zone: zoneLabel,
          },
          items: items.map((it) => ({
            product_id: it.id,
            name: it.name,
            variant_id: it.variantId ?? null,
            variant: it.variant ?? null,
            price: it.price,
            quantity: it.quantity,
            sku: it.sku || "",
            image: it.image || "",
          })),
          subtotal,
          shippingCost,
          discountAmount: totalDiscount,
          total,
          paymentMethod,
          couponCode: appliedCoupon?.code ?? null,
          notes: notes || null,
        });
        toast({
          title: result.alreadyRecovered
            ? `Already recovered as ${result.orderNumber}`
            : `Order ${result.orderNumber} created`,
        });
        qc.invalidateQueries({ queryKey: ["admin", "incomplete-orders"] });
        qc.invalidateQueries({ queryKey: ["admin", "orders"] });
        await onSubmitted?.({ orderId: result.orderId, orderNumber: result.orderNumber });
        onClose();
        return;
      }

      // Reorder path
      const src = reorderSrc!;
      const { data: orderNumberRpc, error: numErr } = await supabase.rpc("next_order_number");
      if (numErr || !orderNumberRpc) {
        setSubmitting(false);
        toast({ title: "Could not generate order number", description: numErr?.message || "Try again", variant: "destructive" });
        return;
      }
      const orderNumber = orderNumberRpc as string;
      const orderId = crypto.randomUUID();
      const orderItems = items.map((it) => ({
        product_id: it.id, id: it.id, name: it.name,
        variant_id: it.variantId ?? null, variant: it.variant ?? null,
        price: it.price, quantity: it.quantity, sku: it.sku || "", image: it.image || "",
      }));
      const paymentLabel = ({ cod: "Cash on Delivery", bkash: "bKash", nagad: "Nagad", card: "Card", bank: "Bank Transfer" } as any)[paymentMethod] || paymentMethod;
      const reorderTag = `Reorder from reminder${src.reminderId ? ` (${src.reminderId.slice(0, 8)})` : ""}`;
      const composedNotes = [`Payment: ${paymentLabel}`, notes || reorderTag].filter(Boolean).join("\n");
      const { data: order, error } = await supabase.from("orders").insert({
        id: orderId,
        order_number: orderNumber,
        customer_name: customerName || "Customer",
        customer_email: email || null,
        customer_phone: digits,
        customer_address: address || null,
        customer_city: zoneLabel,
        shipping_address: { country: "Bangladesh", line1: address || null, delivery_zone: zoneLabel },
        items: orderItems as any,
        subtotal, shipping_cost: shippingCost, discount_amount: totalDiscount,
        coupon_code: appliedCoupon?.code ?? null,
        total, payment_method: paymentMethod, payment_status: "pending",
        order_status: "pending",
        notes: composedNotes,
      }).select().single();
      if (error) throw error;
      await Promise.all(items.map((it) =>
        it.variantId
          ? supabase.rpc("decrement_variant_stock", { _variant_id: it.variantId, _quantity: it.quantity })
          : supabase.rpc("decrement_product_stock", { _product_id: it.id, _quantity: it.quantity }),
      ));
      if (appliedCoupon?.code) {
        supabase.rpc("increment_coupon_usage", { _code: appliedCoupon.code }).then(() => {}, () => {});
      }
      await supabase.rpc("upsert_checkout_customer", {
        _name: customerName || "Customer", _email: email || null,
        _phone: digits, _order_total: total, _address: address || null, _city: zoneLabel,
      });
      if (paymentMethod === "cod" && order?.id) {
        supabase.functions
          .invoke("steadfast-proxy", { body: { action: "create_order", orderId: order.id } })
          .catch((e) => console.warn("Courier auto-push failed:", e));
      }
      toast({ title: "Order created", description: `#${orderNumber}` });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      await onSubmitted?.({ orderId: order.id, orderNumber });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ───────────────────────────────────────────────────────────────
  const itemCount = items.reduce((s, it) => s + Number(it.quantity || 1), 0);
  const title = mode === "recover" ? "Recover incomplete order" : "Create same order";
  const badgeLabel = mode === "recover" ? "Recover" : "Reorder";
  const badgeClass = mode === "recover"
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
  const submitLabel = submitting
    ? (mode === "recover" ? "Recovering…" : "Creating…")
    : (mode === "recover" ? `Confirm & create order — ${fmtMoney(total)}` : `Create order — ${fmtMoney(total)}`);
  const submitIcon = mode === "recover" ? <Sparkles size={12} /> : <Repeat size={12} />;
  const cancelLabel = mode === "recover" ? "Close" : "Cancel";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden p-0 rounded-[4px] gap-0 flex flex-col border-border/60">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-5 pt-4 pb-3 border-b border-border/40 space-y-1">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <DialogTitle className="text-[18px] sm:text-[20px] font-semibold text-foreground truncate leading-tight min-w-0">
              {customerName || (mode === "recover" ? "Unknown customer" : "New order")}
            </DialogTitle>
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[10.5px] font-medium shrink-0", badgeClass)}>
              {badgeLabel}
            </span>
          </div>
          <div className="text-[12.5px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            <span className="tabular-nums text-foreground">{phone || "—"}</span>
            {email && <><span className="text-muted-foreground/50">•</span><span className="truncate">{email}</span></>}
            <span className="text-muted-foreground/50">•</span>
            <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
            <span className="text-muted-foreground/50">•</span>
            <span>{title}</span>
          </div>
        </DialogHeader>

        <div className="px-4 sm:px-5 py-3 space-y-2.5 overflow-y-auto flex-1 min-h-0">
          {/* Customer */}
          <CardSec title="Customer">
            <div className="grid sm:grid-cols-2 gap-2.5">
              <FieldSec label="Name"><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="h-8 rounded-[4px] text-[13px]" /></FieldSec>
              <FieldSec label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-8 rounded-[4px] text-[13px] tabular-nums" /></FieldSec>
              <FieldSec label="Email" className="sm:col-span-2"><Input value={email} onChange={(e) => setEmail(e.target.value)} className="h-8 rounded-[4px] text-[13px]" /></FieldSec>
              <FieldSec label="Full address" className="sm:col-span-2"><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House, road, area, district…" className="h-8 rounded-[4px] text-[13px]" /></FieldSec>
              <FieldSec label="Shipment zone">
                <Select value={zoneId} onValueChange={(v) => { setZoneId(v); setZoneTouched(true); }}>
                  <SelectTrigger className="h-8 rounded-[4px] text-[13px]">
                    <SelectValue placeholder={deliveryZones.length ? "Select a zone" : "Loading…"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-[4px]">
                    {(deliveryZones as any[]).map((z) => (
                      <SelectItem key={z.id} value={z.id}>
                        {z.name || z.zone_name} · {fmtMoney(Number(z.delivery_charge) || 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldSec>
              <FieldSec label="Payment">
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-8 rounded-[4px] text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-[4px]">
                    <SelectItem value="cod">Cash on Delivery</SelectItem>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </FieldSec>
            </div>
          </CardSec>

          {/* Items */}
          <CardSec title="Items" count={items.length}>
            {items.length === 0 ? (
              <div className="text-center py-4 text-[12px] text-muted-foreground/70">No items yet — add products below.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {items.map((it, i) => {
                  const price = Number(it.price) || 0;
                  const qty = Number(it.quantity) || 1;
                  const productForItem = products.find((x) => x.id === it.id) || null;
                  const stockOK = !it.productMissing && typeof it.stock === "number" && it.stock >= qty;
                  const lowStock = !it.productMissing && typeof it.stock === "number" && it.stock < qty;
                  const oos = !it.productMissing && typeof it.stock === "number" && it.stock <= 0;
                  const priceChanged = typeof it.originalPrice === "number"
                    && it.originalPrice > 0 && Math.round(it.originalPrice) !== Math.round(price)
                    && !it.productMissing && !it.invalidVariant;
                  const setQty = (next: number) => setItems((p) => p.map((x, idx) => idx === i ? { ...x, quantity: Math.max(1, next) } : x));
                  const statusBadge = it.productMissing ? { label: "Deleted", cls: "bg-destructive/10 text-destructive" }
                    : it.inactive ? { label: "Inactive", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" }
                    : it.invalidVariant ? { label: "Variant unavailable", cls: "bg-destructive/10 text-destructive" }
                    : oos ? { label: "Out of stock", cls: "bg-destructive/10 text-destructive" }
                    : lowStock ? { label: "Low stock", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" }
                    : stockOK ? { label: "In stock", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" }
                    : null;
                  return (
                    <div key={`${it.id}:${it.variantId ?? "_"}:${i}`} className={cn("flex items-center gap-2.5 py-2 first:pt-0 last:pb-0", (it.productMissing || it.inactive || it.invalidVariant) && "opacity-90")}>
                      {it.image ? (
                        <img src={resolveImageSrc(it.image, 400)} alt="" loading="lazy" className="w-10 h-10 rounded-[4px] object-cover border border-border/40 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-[4px] bg-muted/60 flex items-center justify-center shrink-0">
                          <Package size={13} className="text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-medium truncate text-foreground leading-snug">{it.name}</p>
                        {it.hasVariants && it.variant && !it.invalidVariant && (
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10.5px] text-muted-foreground/80 truncate">{it.variant}</span>
                            {productForItem && productForItem.variants.filter(v => v.active).length > 1 && (
                              <button type="button" onClick={() => setVariantPickerFor(productForItem)} className="text-[10px] uppercase tracking-wider text-foreground/70 hover:text-foreground underline-offset-2 hover:underline">Change</button>
                            )}
                          </div>
                        )}
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                          {statusBadge && (
                            <span className={cn("text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded-[3px]", statusBadge.cls)}>
                              {statusBadge.label}
                            </span>
                          )}
                          {it.hasVariants && it.invalidVariant && productForItem && productForItem.variants.some(v => v.active) && (
                            <button type="button" onClick={() => setVariantPickerFor(productForItem)} className="text-[10px] uppercase tracking-wider font-medium text-foreground/80 hover:text-foreground underline-offset-2 hover:underline">Choose variant</button>
                          )}
                        </div>
                        {priceChanged && (
                          <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                            Price updated from <span className="line-through tabular-nums">{fmtMoney(it.originalPrice!)}</span> to <span className="tabular-nums text-foreground">{fmtMoney(price)}</span> based on the current catalog.
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[11.5px] tabular-nums text-muted-foreground/90">{fmtMoney(price)}</span>
                          <span className="text-[11px] text-muted-foreground/50">×</span>
                          <div className="inline-flex items-center h-7 rounded-[4px] border border-border/60 overflow-hidden">
                            <button type="button" onClick={() => setQty(qty - 1)} disabled={qty <= 1} aria-label="Decrease" className="h-full w-6 flex items-center justify-center text-foreground/70 hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-transparent transition-colors">
                              <Minus size={11} />
                            </button>
                            <span className="min-w-[28px] text-center text-[11.5px] font-medium tabular-nums select-none">{qty}</span>
                            <button type="button" onClick={() => setQty(qty + 1)} aria-label="Increase" className="h-full w-6 flex items-center justify-center text-foreground/70 hover:bg-muted/60 transition-colors">
                              <Plus size={11} />
                            </button>
                          </div>
                          {typeof it.stock === "number" && !it.productMissing && (
                            <span className={cn("text-[10px] uppercase tracking-wider tabular-nums", lowStock ? "text-destructive" : "text-muted-foreground/60")}>Stock {it.stock}</span>
                          )}
                        </div>
                      </div>
                      <span className="text-[13px] font-semibold tabular-nums shrink-0 text-foreground">{fmtMoney(price * qty)}</span>
                      <button onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))} aria-label="Remove item" className="h-7 w-7 rounded-[4px] text-destructive hover:bg-destructive/10 flex items-center justify-center shrink-0 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-2 pt-2 border-t border-border/40">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
                <Input
                  value={productSearch}
                  onChange={(e) => { setProductSearch(e.target.value); setShowProductResults(true); }}
                  onFocus={() => setShowProductResults(true)}
                  onBlur={() => setTimeout(() => setShowProductResults(false), 150)}
                  placeholder="Search products by name, SKU, or variant SKU…"
                  className="h-8 rounded-[4px] text-[13px] pl-8"
                />
                {showProductResults && filteredProducts.length > 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-background border border-border/60 rounded-[4px] shadow-lg max-h-72 overflow-y-auto">
                    {filteredProducts.slice(0, 20).map((p) => {
                      const inCart = items.filter((it) => it.id === p.id).reduce((s, it) => s + (Number(it.quantity) || 0), 0);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); pickProduct(p.id); }}
                          className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left hover:bg-muted/60 transition-colors border-b border-border/30 last:border-b-0"
                        >
                          {p.image ? (
                            <img src={resolveImageSrc(p.image, 400)} alt="" loading="lazy" className="w-9 h-9 rounded-[3px] object-cover border border-border/40 shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-[3px] bg-muted/60 flex items-center justify-center shrink-0">
                              <Package size={12} className="text-muted-foreground/60" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[12.5px] font-medium truncate text-foreground leading-tight">
                              {p.name}
                              {p.hasVariants && <span className="ml-1.5 text-[9.5px] uppercase tracking-wider text-muted-foreground/80 font-normal">· {p.variants.length} variants</span>}
                            </p>
                            {p.sku && <p className="text-[10.5px] text-muted-foreground/70 truncate">{p.sku}</p>}
                          </div>
                          <span className="text-[12px] tabular-nums text-muted-foreground shrink-0">
                            {p.hasVariants && p.priceMin != null && p.priceMax != null && p.priceMin !== p.priceMax
                              ? `${fmtMoney(p.priceMin)}–${fmtMoney(p.priceMax)}`
                              : fmtMoney(p.priceMin ?? p.price)}
                          </span>
                          {inCart > 0 && (
                            <span className="text-[10px] font-semibold bg-foreground text-background rounded-full px-1.5 py-0.5 tabular-nums shrink-0">{inCart}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
                {showProductResults && productSearch && filteredProducts.length === 0 && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-background border border-border/60 rounded-[4px] shadow-lg px-3 py-3 text-[12px] text-muted-foreground/70">
                    No products found.
                  </div>
                )}
              </div>
            </div>
          </CardSec>

          {/* Discounts */}
          <CardSec title="Discounts">
            <div className="grid sm:grid-cols-2 gap-2.5">
              <FieldSec label="Coupon code">
                {appliedCoupon ? (
                  <div className="flex items-center justify-between gap-2 h-8 px-2.5 rounded-[4px] border border-border/60 bg-muted/30">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Tag size={11} className="text-foreground/70 shrink-0" />
                      <span className="text-[12px] font-medium tabular-nums truncate">{appliedCoupon.code}</span>
                      <span className="text-[10.5px] text-muted-foreground/80 shrink-0">
                        {appliedCoupon.discount_type === "percentage" ? `${appliedCoupon.discount_value}% off` : `${fmtMoney(appliedCoupon.discount_value)} off`}
                      </span>
                    </div>
                    <button type="button" onClick={() => { setAppliedCoupon(null); setCouponInput(""); }} className="text-[10px] uppercase tracking-wider text-destructive hover:underline shrink-0">Remove</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Input value={couponInput} onChange={(e) => setCouponInput(e.target.value.toUpperCase())} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }} placeholder="Code" className="h-8 rounded-[4px] text-[13px] tabular-nums" />
                    <Button type="button" variant="outline" onClick={applyCoupon} disabled={couponLoading || !couponInput.trim()} className="h-8 min-w-[100px] px-4 rounded-[4px] text-[12px] font-medium shrink-0">{couponLoading ? "…" : "Apply"}</Button>
                  </div>
                )}
              </FieldSec>

              <FieldSec label="Manual discount">
                {manualDiscount ? (
                  <div className="flex items-center justify-between gap-2 h-8 px-2.5 rounded-[4px] border border-border/60 bg-muted/30">
                    <span className="text-[12px] font-medium tabular-nums truncate">
                      {manualDiscount.type === "percentage" ? `${manualDiscount.value}% off` : `${fmtMoney(manualDiscount.value)} off`}
                    </span>
                    <button type="button" onClick={() => { setManualDiscount(null); setManualDiscountInput(""); }} className="text-[10px] uppercase tracking-wider text-destructive hover:underline shrink-0">Remove</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <Select value={manualDiscountType} onValueChange={(v) => setManualDiscountType(v as any)}>
                      <SelectTrigger className="h-8 w-[88px] rounded-[4px] text-[12px] shrink-0"><SelectValue /></SelectTrigger>
                      <SelectContent className="rounded-[4px]">
                        <SelectItem value="fixed">Fixed</SelectItem>
                        <SelectItem value="percentage">%</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="number" min={0} value={manualDiscountInput} onChange={(e) => setManualDiscountInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyManualDiscount(); } }} placeholder={manualDiscountType === "percentage" ? "0–100" : "0"} className="h-8 rounded-[4px] text-[13px] tabular-nums" />
                    <Button type="button" variant="outline" onClick={applyManualDiscount} disabled={!manualDiscountInput.trim()} className="h-8 min-w-[100px] px-4 rounded-[4px] text-[12px] font-medium shrink-0">Apply</Button>
                  </div>
                )}
              </FieldSec>
            </div>
          </CardSec>

          {/* Order summary */}
          <CardSec title="Order summary">
            {matchedZone && (
              <div className="flex items-center justify-between text-[11px] mb-2 -mt-0.5">
                <span className="uppercase tracking-wider text-muted-foreground/70">Zone</span>
                <span className="text-foreground/80">{matchedZone.name || matchedZone.zone_name}{freeShippingApplied && <span className="ml-1.5 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Free shipping</span>}</span>
              </div>
            )}
            <div className="space-y-1 text-[12.5px]">
              <div className="flex justify-between items-baseline">
                <span className="text-muted-foreground/80">Subtotal</span>
                <span className="tabular-nums text-foreground">{fmtMoney(subtotal)}</span>
              </div>
              {totalDiscount > 0 && (
                <div className="flex justify-between items-baseline">
                  <span className="text-muted-foreground/80">Total discount</span>
                  <span className="tabular-nums text-destructive">−{fmtMoney(totalDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between items-baseline">
                <span className="text-muted-foreground/80">Shipping</span>
                <span className="tabular-nums text-foreground">{fmtMoney(shippingCost)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1.5 mt-1.5 border-t border-border/40">
                <span className="text-[12px] font-medium text-foreground">Grand total</span>
                <span className="text-[16px] font-semibold tabular-nums text-foreground">{fmtMoney(total)}</span>
              </div>
            </div>
            {matchedZone && zoneFreeMin > 0 && !freeShippingApplied && (
              <p className="text-[10.5px] mt-2 text-muted-foreground/70">Free shipping at {fmtMoney(zoneFreeMin)} — {fmtMoney(zoneFreeMin - subtotal)} away</p>
            )}
          </CardSec>

          <CardSec title="Order notes">
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Optional context for the order log" className="rounded-[4px] text-[13px] resize-y min-h-[52px]" />
          </CardSec>
        </div>

        <div className="px-4 sm:px-5 py-2.5 border-t border-border/40 gap-2 bg-background flex items-center justify-end sticky bottom-0">
          <Button variant="outline" onClick={onClose} size="sm" className="rounded-[4px] text-[12px] h-9">{cancelLabel}</Button>
          <Button onClick={submit} disabled={submitting || items.length === 0 || items.some(it => it.productMissing || it.inactive || (it.hasVariants && (!it.variantId || it.invalidVariant)) || (typeof it.stock === "number" && it.stock < it.quantity))} size="sm" className="rounded-[4px] text-[12px] h-9 gap-1.5">
            {submitIcon}
            {submitLabel}
          </Button>
        </div>
      </DialogContent>

      <VariantPickerDialog
        open={!!variantPickerFor}
        onClose={() => setVariantPickerFor(null)}
        product={variantPickerFor}
        onPick={(v) => {
          if (!variantPickerFor) return;
          addItem(variantPickerFor, v);
          setVariantPickerFor(null);
        }}
      />
    </Dialog>
  );
}
