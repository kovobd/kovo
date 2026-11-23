import { memo, useMemo, useState, useCallback, useEffect, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  X, Save, Search, Gift, Tag, Check, Package, Layers, Plus, Minus, Pencil,
} from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import {
  calculateAppliedOffers, type ProductOffer,
} from "@/lib/productOffers";
import { PAYMENT_METHODS, type DeliveryZone } from "@/lib/checkoutOptions";
import type { CartItem } from "@/data/cartStore";
import { supabase } from "@/integrations/supabase/client";
import {
  parseOptionGroups,
  resolveVariantRow,
  effectiveRowPrice,
  type OptionGroup,
  type VariantRow,
} from "@/lib/variants";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/cdnImage";
import { computeDiscountAmount, normalizeDiscountType, type DiscountType } from "@/lib/discount";

const statusOptions = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const paymentStatuses = ["pending", "paid", "failed", "refunded"];

export interface OrderFormProps {
  data: any;
  setData: (d: any) => void;
  onSave: () => void;
  onCancel: () => void;
  title: string;
  saving?: boolean;
  products: any[];
  coupons: any[];
  productOffers: ProductOffer[];
  deliveryZones: DeliveryZone[];
}

const toCartItems = (items: any[]): CartItem[] =>
  items.filter((i: any) => !i.is_free_gift).map((i: any) => ({
    id: i.product_id || i.id || "",
    productId: i.product_id || i.id || "",
    name: i.name,
    price: Number(i.price),
    image: i.image || "",
    quantity: i.quantity || 1,
  }));

const sanitizePhone = (v: string) => v.replace(/\D/g, "").slice(0, 11);
const fmt = (n: number) => `${CURRENCY_SYMBOL}${Math.round(Number(n) || 0).toLocaleString()}`;

const variantLabel = (values: Record<string, string> | undefined | null) => {
  if (!values) return "";
  return Object.values(values).filter(Boolean).join(" / ");
};

// ─── enriched catalog with option_groups + variant rows ──────────────────────
type CatalogEntry = { option_groups: OptionGroup[]; variants: VariantRow[]; image?: string | null };
type EnrichedProduct = any & {
  hasVariants: boolean;
  optionGroups: OptionGroup[];
  variantRows: VariantRow[];
  priceMin: number;
  priceMax: number;
  aggregateStock: number;
};

function useProductCatalog(open: boolean) {
  return useQuery<Record<string, CatalogEntry>>({
    queryKey: ["admin", "order-form", "product-catalog"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const [pRes, vRes, mRes] = await Promise.all([
        supabase.from("products").select("id, option_groups"),
        supabase
          .from("product_variants")
          .select("id, product_id, option_values, price, sale_price, stock, sku, active, sort_order, image_url")
          .order("sort_order"),
        supabase
          .from("product_media")
          .select("product_id, image_url, sort_order")
          .is("variant_id", null)
          .order("sort_order"),
      ]);
      const out: Record<string, CatalogEntry> = {};
      (pRes.data ?? []).forEach((p: any) => {
        out[p.id] = { option_groups: parseOptionGroups(p.option_groups), variants: [], image: null };
      });
      (mRes.data ?? []).forEach((m: any) => {
        if (!out[m.product_id]) out[m.product_id] = { option_groups: [], variants: [], image: null };
        if (!out[m.product_id].image) out[m.product_id].image = m.image_url;
      });
      (vRes.data ?? []).forEach((v: any) => {
        const row: VariantRow = {
          id: v.id,
          product_id: v.product_id,
          option_values: v.option_values || {},
          price: Number(v.price ?? 0),
          sale_price: v.sale_price != null ? Number(v.sale_price) : null,
          stock: Number(v.stock ?? 0),
          sku: v.sku ?? "",
          active: v.active !== false,
          sort_order: Number(v.sort_order ?? 0),
          image_url: v.image_url ?? null,
        };
        if (!out[v.product_id]) out[v.product_id] = { option_groups: [], variants: [] };
        out[v.product_id].variants.push(row);
      });
      // Derive option groups from variant rows if the product didn't declare any.
      for (const pid of Object.keys(out)) {
        const entry = out[pid];
        if (entry.option_groups.length === 0 && entry.variants.length > 0) {
          const map: Record<string, Set<string>> = {};
          entry.variants.forEach((r) =>
            Object.entries(r.option_values || {}).forEach(([k, val]) => {
              (map[k] ||= new Set<string>()).add(String(val));
            }),
          );
          entry.option_groups = Object.entries(map).map(([name, values]) => ({
            name, values: [...values], type: "text", show_on_card: true,
          }));
        }
      }
      return out;
    },
  });
}

// ─── variant selector modal ──────────────────────────────────────────────────
type PendingSelection = {
  product: EnrichedProduct;
  initialValues?: Record<string, string>;
  initialQty?: number;
  cartIndex?: number; // edit mode
};

function VariantSelectorDialog({
  open, pending, onClose, onConfirm,
}: {
  open: boolean;
  pending: PendingSelection | null;
  onClose: () => void;
  onConfirm: (p: {
    product: EnrichedProduct;
    row: VariantRow;
    values: Record<string, string>;
    qty: number;
    cartIndex?: number;
  }) => void;
}) {
  const product = pending?.product ?? null;
  const groups = product?.optionGroups ?? [];
  const rows = product?.variantRows ?? [];

  const [values, setValues] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (open && pending) {
      setValues(pending.initialValues ? { ...pending.initialValues } : {});
      setQty(Math.max(1, pending.initialQty ?? 1));
    }
  }, [open, pending]);

  const allSelected = groups.length > 0 && groups.every((g) => !!values[g.name]);
  const resolvedRow = allSelected ? resolveVariantRow(rows, values) : null;
  const resolvedActive = resolvedRow?.active !== false;
  const resolvedStock = resolvedRow ? Number(resolvedRow.stock || 0) : 0;
  const resolvedPrice = resolvedRow ? effectiveRowPrice(resolvedRow) : null;
  const previewImage = resolvedRow?.image_url || product?.images?.[0] || "";

  // Disable an option value if NO active in-stock row exists with the current
  // selection + that value (partial-selection lookahead).
  const isValueAvailable = (groupName: string, value: string) => {
    const trial = { ...values, [groupName]: value };
    return rows.some((r) => {
      if (r.active === false || Number(r.stock || 0) <= 0) return false;
      return Object.entries(trial).every(([k, v]) => !v || r.option_values?.[k] === v);
    });
  };

  const canAdd = !!resolvedRow && resolvedActive && resolvedStock > 0 && qty >= 1 && qty <= resolvedStock;
  const disabledReason = !allSelected
    ? "Select all options"
    : !resolvedRow
      ? "No matching variant"
      : !resolvedActive
        ? "Variant unavailable"
        : resolvedStock <= 0
          ? "Out of stock"
          : qty > resolvedStock
            ? `Only ${resolvedStock} in stock`
            : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 rounded-2xl overflow-hidden gap-0 border-border/50">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/40">
          <DialogTitle className="text-[15px] font-semibold leading-tight truncate">
            {product?.name || "Select variant"}
          </DialogTitle>
          <p className="text-[11.5px] text-muted-foreground mt-0.5">
            {pending?.cartIndex != null ? "Edit variant selection" : "Choose options to add this product"}
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* preview */}
          <div className="flex items-center gap-3 bg-muted/40 rounded-xl p-3 border border-border/40">
            {previewImage ? (
              <img src={resolveImageSrc(previewImage, 400)} alt="" loading="eager" decoding="async" className="w-16 h-16 rounded-lg object-cover border border-border/40 shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Package size={18} className="text-muted-foreground/60" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium truncate leading-tight">{product?.name}</p>
              <div className="mt-1 text-[11px] text-muted-foreground/80 flex flex-wrap gap-x-2 gap-y-0.5 items-center">
                {resolvedRow ? (
                  <>
                    {resolvedRow.sku && <span className="tabular-nums">SKU {resolvedRow.sku}</span>}
                    <span className="tabular-nums">Stock {resolvedStock}</span>
                  </>
                ) : (
                  <span>Pick options to see SKU, price & stock</span>
                )}
              </div>
              <p className="mt-1 text-[13px] font-semibold tabular-nums">
                {resolvedPrice != null
                  ? fmt(resolvedPrice)
                  : product && (product.priceMin !== product.priceMax
                      ? `${fmt(product.priceMin)} – ${fmt(product.priceMax)}`
                      : fmt(product.priceMin))}
              </p>
            </div>
          </div>

          {/* option groups */}
          {groups.map((g) => (
            <div key={g.name} className="space-y-1.5">
              <label className="text-[11.5px] font-semibold text-muted-foreground/80 uppercase tracking-wide">
                {g.name}
                {values[g.name] && <span className="ml-1.5 normal-case tracking-normal text-foreground/80">· {values[g.name]}</span>}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {g.values.map((val) => {
                  const selected = values[g.name] === val;
                  const available = isValueAvailable(g.name, val);
                  return (
                    <button
                      key={val}
                      type="button"
                      disabled={!available && !selected}
                      onClick={() =>
                        setValues((prev) => ({ ...prev, [g.name]: prev[g.name] === val ? "" : val }))
                      }
                      className={cn(
                        "px-3 py-1.5 rounded-full text-[12px] border transition-all",
                        selected
                          ? "border-primary bg-primary/10 text-foreground font-medium"
                          : available
                            ? "border-border/60 hover:border-foreground/40 text-foreground/80"
                            : "border-border/30 text-muted-foreground/40 line-through cursor-not-allowed",
                      )}
                    >
                      {val}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* qty */}
          <div className="space-y-1.5">
            <label className="text-[11.5px] font-semibold text-muted-foreground/80 uppercase tracking-wide">Quantity</label>
            <div className="inline-flex items-center h-9 rounded-lg border border-border/60 overflow-hidden">
              <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={!canAdd && qty <= 1} className="h-full w-9 flex items-center justify-center text-foreground/70 hover:bg-muted/60 transition-colors disabled:opacity-40" aria-label="Decrease">
                <Minus size={13} />
              </button>
              <span className="min-w-[42px] text-center text-[13px] font-medium tabular-nums">{qty}</span>
              <button type="button" onClick={() => setQty((q) => (resolvedStock > 0 ? Math.min(resolvedStock, q + 1) : q + 1))} className="h-full w-9 flex items-center justify-center text-foreground/70 hover:bg-muted/60 transition-colors" aria-label="Increase">
                <Plus size={13} />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border/40 flex items-center justify-between gap-3 bg-muted/20">
          <div className="text-[11.5px] text-muted-foreground min-w-0 truncate">
            {disabledReason ?? (
              <span className="text-foreground/80">
                {variantLabel(values)} · {fmt((resolvedPrice ?? 0) * qty)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={onClose} className="rounded-lg h-8">Cancel</Button>
            <Button
              size="sm"
              disabled={!canAdd || !product}
              onClick={() => {
                if (!canAdd || !resolvedRow || !product) return;
                onConfirm({ product, row: resolvedRow, values, qty, cartIndex: pending?.cartIndex });
              }}
              className="rounded-lg h-8 gap-1.5"
            >
              <Check size={13} />
              {pending?.cartIndex != null ? "Update" : "Add to order"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── main form ───────────────────────────────────────────────────────────────
const PAGE_SIZE = 24;

function OrderFormImpl({
  data, setData, onSave, onCancel, title, saving,
  products, coupons, productOffers, deliveryZones,
}: OrderFormProps) {
  const [productSearch, setProductSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [pending, setPending] = useState<PendingSelection | null>(null);

  const { data: catalog = {}, isLoading: catalogLoading } = useProductCatalog(true);

  const enrichedProducts: EnrichedProduct[] = useMemo(() => {
    return products.map((p: any) => {
      const entry = catalog[p.id] || { option_groups: [], variants: [] };
      const activeRows = entry.variants.filter((r) => r.active !== false);
      const hasVariants = entry.option_groups.length > 0 && activeRows.length > 0;
      const base = p.sale_price && p.sale_price < p.price ? Number(p.sale_price) : Number(p.price || 0);
      const variantPrices = activeRows.map(effectiveRowPrice);
      const priceMin = hasVariants && variantPrices.length ? Math.min(...variantPrices) : base;
      const priceMax = hasVariants && variantPrices.length ? Math.max(...variantPrices) : base;
      const aggregateStock = hasVariants
        ? activeRows.reduce((s, r) => s + Number(r.stock || 0), 0)
        : Number(p.stock ?? 0);
      const images: string[] = Array.isArray(p.images) && p.images.length
        ? p.images
        : entry.image
          ? [entry.image]
          : [];
      return {
        ...p,
        images,
        hasVariants,
        optionGroups: entry.option_groups,
        variantRows: activeRows,
        priceMin,
        priceMax,
        aggregateStock,
      };
    });
  }, [products, catalog]);

  const productNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [products]);

  const productPriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach(p => {
      m[p.id] = p.sale_price && p.sale_price < p.price ? p.sale_price : p.price;
    });
    return m;
  }, [products]);

  const productImageMap = useMemo(() => {
    const m: Record<string, string> = {};
    enrichedProducts.forEach(p => { m[p.id] = p.images?.[0] || ""; });
    return m;
  }, [enrichedProducts]);

  const addr = data.shipping_address || {};
  const items = useMemo(
    () => (data.items || []).filter((i: any) => !i.is_free_gift),
    [data.items]
  );
  const paymentMethod = data.payment_method || "cod";

  const updateAddr = useCallback((field: string, value: string) => {
    setData({ ...data, shipping_address: { ...(data.shipping_address || {}), [field]: value } });
  }, [data, setData]);

  const selectZone = useCallback((zoneId: string) => {
    const z = deliveryZones.find((dz) => dz.id === zoneId);
    if (!z) return;
    setData({
      ...data,
      delivery_zone_id: z.id,
      shipping_cost: Number(z.delivery_charge) || 0,
      shipping_address: {
        ...(data.shipping_address || {}),
        delivery_zone: z.zone_name,
        country: (data.shipping_address?.country) || "Bangladesh",
      },
    });
  }, [data, setData, deliveryZones]);

  const selectedZoneId =
    data.delivery_zone_id ||
    deliveryZones.find((z) => z.zone_name === addr.delivery_zone)?.id ||
    "";

  const updateItem = useCallback((i: number, field: string, value: any) => {
    const all = data.items || [];
    const giftItems = all.filter((it: any) => it.is_free_gift);
    const baseItems = all.filter((it: any) => !it.is_free_gift);
    const newItems = [...baseItems];
    newItems[i] = { ...newItems[i], [field]: value };
    setData({ ...data, items: [...newItems, ...giftItems] });
  }, [data, setData]);

  const removeItem = useCallback((i: number) => {
    const all = data.items || [];
    const giftItems = all.filter((it: any) => it.is_free_gift);
    const baseItems = all.filter((it: any) => !it.is_free_gift);
    setData({
      ...data,
      items: [...baseItems.filter((_: any, idx: number) => idx !== i), ...giftItems],
    });
  }, [data, setData]);

  // Add or increment a simple (no-variant) product.
  const addSimpleProduct = useCallback((product: EnrichedProduct) => {
    const price = product.sale_price && product.sale_price < product.price ? product.sale_price : product.price;
    const all = data.items || [];
    const gifts = all.filter((it: any) => it.is_free_gift);
    const base = all.filter((it: any) => !it.is_free_gift);
    const existing = base.findIndex((i: any) => i.product_id === product.id && !i.variant_id);
    if (existing >= 0) {
      const next = [...base];
      next[existing] = { ...next[existing], quantity: (next[existing].quantity || 1) + 1 };
      setData({ ...data, items: [...next, ...gifts] });
    } else {
      setData({
        ...data,
        items: [
          ...base,
          {
            product_id: product.id,
            name: product.name,
            quantity: 1,
            price,
            image: product.images?.[0] || "",
            sku: product.sku || "",
          },
          ...gifts,
        ],
      });
    }
  }, [data, setData]);

  const openVariantPicker = useCallback(
    (product: EnrichedProduct, initialValues?: Record<string, string>, initialQty?: number, cartIndex?: number) => {
      setPending({ product, initialValues, initialQty, cartIndex });
    },
    [],
  );

  const handleVariantConfirm = useCallback((p: {
    product: EnrichedProduct;
    row: VariantRow;
    values: Record<string, string>;
    qty: number;
    cartIndex?: number;
  }) => {
    const { product, row, values, qty, cartIndex } = p;
    const all = data.items || [];
    const gifts = all.filter((it: any) => it.is_free_gift);
    const base = all.filter((it: any) => !it.is_free_gift);
    const lineImage = row.image_url || product.images?.[0] || "";
    const newLine = {
      product_id: product.id,
      variant_id: row.id,
      variant: variantLabel(values),
      variant_options: values,
      name: product.name,
      quantity: qty,
      price: effectiveRowPrice(row),
      image: lineImage,
      sku: row.sku || product.sku || "",
    };

    if (cartIndex != null) {
      const next = [...base];
      next[cartIndex] = { ...next[cartIndex], ...newLine };
      // Merge with any other line that already has the new variant.
      const dupIdx = next.findIndex((it: any, idx) => idx !== cartIndex && it.product_id === product.id && it.variant_id === row.id);
      if (dupIdx >= 0) {
        next[dupIdx] = { ...next[dupIdx], quantity: (next[dupIdx].quantity || 1) + qty };
        next.splice(cartIndex, 1);
      }
      setData({ ...data, items: [...next, ...gifts] });
    } else {
      const existing = base.findIndex((it: any) => it.product_id === product.id && it.variant_id === row.id);
      if (existing >= 0) {
        const next = [...base];
        next[existing] = { ...next[existing], quantity: (next[existing].quantity || 1) + qty, price: newLine.price };
        setData({ ...data, items: [...next, ...gifts] });
      } else {
        setData({ ...data, items: [...base, newLine, ...gifts] });
      }
    }
    setPending(null);
  }, [data, setData]);

  const handleProductClick = useCallback((product: EnrichedProduct) => {
    if (product.hasVariants) {
      openVariantPicker(product);
    } else {
      addSimpleProduct(product);
    }
  }, [addSimpleProduct, openVariantPicker]);

  // Search across name + product sku + variant skus.
  const deferredSearch = useDeferredValue(productSearch);
  const filteredProducts = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return enrichedProducts;
    return enrichedProducts.filter((p) => {
      if ((p.name || "").toLowerCase().includes(q)) return true;
      if ((p.sku || "").toLowerCase().includes(q)) return true;
      if (p.variantRows.some((v) => (v.sku || "").toLowerCase().includes(q))) return true;
      return false;
    });
  }, [deferredSearch, enrichedProducts]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [deferredSearch]);

  const visibleProducts = useMemo(() => filteredProducts.slice(0, visibleCount), [filteredProducts, visibleCount]);
  const canLoadMore = visibleCount < filteredProducts.length;

  const itemQtyMap = useMemo(() => {
    const m: Record<string, number> = {};
    items.forEach((i: any) => {
      const key = `${i.product_id || i.id}::${i.variant_id || ""}`;
      m[key] = (m[key] || 0) + (i.quantity || 1);
    });
    return m;
  }, [items]);

  const productCartQty = (pid: string) =>
    items.reduce((s: number, i: any) => s + ((i.product_id === pid) ? (i.quantity || 1) : 0), 0);

  // ── offers/coupon/subtotal (unchanged logic) ────────────────────────────
  const { appliedOffers, freeGiftItems, offerDiscount } = useMemo(() => {
    const cartItems = toCartItems(items);
    const applied = calculateAppliedOffers(cartItems, productOffers, productNameMap, productPriceMap);
    const discount = applied.reduce((s, o) => s + o.discountAmount, 0);
    const gifts = applied.flatMap(ao =>
      ao.freeItems.map(f => ({
        product_id: f.productId, name: f.productName, quantity: f.quantity, price: 0,
        image: productImageMap[f.productId] || "", is_free_gift: true, offer_text: ao.displayText,
      }))
    );
    return { appliedOffers: applied, freeGiftItems: gifts, offerDiscount: discount };
  }, [items, productOffers, productNameMap, productPriceMap, productImageMap]);

  const couponDisc = useMemo(() => {
    if (!data.coupon_code) return 0;
    const coupon = coupons.find(c => c.code.toLowerCase() === data.coupon_code.toLowerCase());
    if (!coupon) return 0;
    const subtotal = items.reduce((sum: number, item: any) => sum + (Number(item.price) * (item.quantity || 1)), 0);
    if (coupon.min_order_amount && subtotal < Number(coupon.min_order_amount)) return 0;
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return 0;
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return 0;
    if (coupon.discount_type === "percentage") return Math.round(subtotal * Number(coupon.discount_value) / 100);
    return Math.min(Number(coupon.discount_value), subtotal);
  }, [data.coupon_code, coupons, items]);

  const subtotal = useMemo(
    () => items.reduce((sum: number, item: any) => sum + (Number(item.price) * (item.quantity || 1)), 0),
    [items]
  );
  const manualDiscountType: DiscountType = normalizeDiscountType(data.discount_type);
  const manualDisc = useMemo(
    () => computeDiscountAmount(manualDiscountType, data.discount_amount, subtotal),
    [manualDiscountType, data.discount_amount, subtotal],
  );
  const totalDiscount = Math.min(subtotal, offerDiscount + couponDisc + manualDisc);
  const total = Math.max(0, subtotal - totalDiscount + Number(data.shipping_cost || 0));

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">{title}</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">Mirrors the storefront checkout experience.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel} className="rounded-xl gap-1.5"><X size={14} /> Cancel</Button>
      </div>

      <div className="grid gap-5 max-w-3xl">
        {/* Customer */}
        <div className="bg-background rounded-2xl border border-border/40 p-6 space-y-4">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Customer</h3>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground/70 mb-1.5 block">Full Name *</label>
            <Input value={data.customer_name || ""} onChange={e => setData({ ...data, customer_name: e.target.value })} placeholder="Customer full name" className="rounded-xl" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground/70 mb-1.5 block">Phone Number * (11 digits)</label>
            <Input value={data.customer_phone || ""} onChange={e => setData({ ...data, customer_phone: sanitizePhone(e.target.value) })} placeholder="01XXXXXXXXX" inputMode="numeric" maxLength={11} className="rounded-xl" />
          </div>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground/70 mb-1.5 block">Email (optional)</label>
            <Input type="email" value={data.customer_email || ""} onChange={e => setData({ ...data, customer_email: e.target.value })} placeholder="customer@email.com" className="rounded-xl" />
          </div>
        </div>

        {/* Address */}
        <div className="bg-background rounded-2xl border border-border/40 p-6 space-y-4">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Shipping address</h3>
          <div>
            <label className="text-[12px] font-medium text-muted-foreground/70 mb-1.5 block">Full Address *</label>
            <Input value={addr.line1 || ""} onChange={e => updateAddr("line1", e.target.value)} placeholder="House, road, area" className="rounded-xl" />
          </div>
        </div>

        {/* Shipment */}
        <div className="bg-background rounded-2xl border border-border/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Shipment *</h3>
            <span className="text-[11px] text-muted-foreground/60">From Delivery Settings</span>
          </div>
          {deliveryZones.length === 0 ? (
            <p className="text-[13px] text-muted-foreground/60">No active delivery zones. Add zones in Settings → Delivery.</p>
          ) : (
            <div className="space-y-2.5">
              {deliveryZones.map((z) => {
                const selected = selectedZoneId === z.id;
                return (
                  <button
                    type="button"
                    key={z.id}
                    onClick={() => selectZone(z.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                      selected ? "border-primary bg-primary/[0.06]" : "border-border hover:border-border/80 bg-card/30"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                      {selected && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </span>
                    <span className="text-[13px] text-foreground flex-1">
                      {z.zone_name}
                      {z.estimated_days ? <span className="text-muted-foreground/60"> · {z.estimated_days}</span> : null}
                    </span>
                    <span className="text-[13px] font-semibold tabular-nums">{CURRENCY_SYMBOL}{Number(z.delivery_charge).toFixed(0)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment Method */}
        <div className="bg-background rounded-2xl border border-border/40 p-6 space-y-4">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Payment Method *</h3>
          <div className="space-y-2.5">
            {PAYMENT_METHODS.map((p) => {
              const selected = paymentMethod === p.id;
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => setData({ ...data, payment_method: p.id })}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                    selected ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40" : "border-border hover:border-border/80 bg-card/30"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                    {selected && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-foreground">{p.label}</span>
                    <span className="block text-[11px] text-muted-foreground/60">{p.description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Internal admin: Order/Payment status */}
        <div className="bg-background rounded-2xl border border-border/40 p-6 space-y-4">
          <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Status (internal)</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[12px] text-muted-foreground/60 mb-1.5 block font-medium">Order Status</label>
              <Select value={data.order_status} onValueChange={v => setData({ ...data, order_status: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">{statusOptions.map(s => <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[12px] text-muted-foreground/60 mb-1.5 block font-medium">Payment Status</label>
              <Select value={data.payment_status} onValueChange={v => setData({ ...data, payment_status: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">{paymentStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="bg-background rounded-2xl border border-border/40 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Items</h3>
            <span className="text-[11px] text-muted-foreground/60 tabular-nums">
              {items.length} in order · {filteredProducts.length} product{filteredProducts.length === 1 ? "" : "s"}
            </span>
          </div>

          {/* Sticky search */}
          <div className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur border-b border-border/30">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              <Input
                autoFocus
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Search products by name or SKU…"
                className="pl-9 rounded-xl h-10"
              />
              {productSearch && (
                <button type="button" onClick={() => setProductSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground/70" aria-label="Clear search">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Product grid */}
          {catalogLoading && enrichedProducts.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border/40 p-2 animate-pulse">
                  <div className="w-full aspect-square rounded-lg bg-muted/60 mb-2" />
                  <div className="h-3 rounded bg-muted/60 mb-1.5" />
                  <div className="h-3 rounded bg-muted/40 w-2/3" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-[12.5px] text-muted-foreground/70 border border-dashed border-border/40 rounded-xl">
              {deferredSearch ? `No products match "${deferredSearch}".` : "No products available."}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {visibleProducts.map((p) => {
                  const inCart = productCartQty(p.id);
                  const oos = p.aggregateStock <= 0;
                  const priceLabel = p.hasVariants
                    ? (p.priceMin === p.priceMax ? fmt(p.priceMin) : `From ${fmt(p.priceMin)}`)
                    : fmt(p.priceMin);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProductClick(p)}
                      disabled={oos}
                      className={cn(
                        "relative rounded-xl border p-2 text-left transition-all group",
                        oos
                          ? "border-border/30 opacity-50 cursor-not-allowed"
                          : inCart > 0
                            ? "border-primary/60 bg-primary/[0.04] hover:border-primary"
                            : "border-border/40 hover:border-foreground/30 hover:shadow-sm",
                      )}
                    >
                      <div className="relative w-full aspect-square rounded-lg overflow-hidden bg-muted/50 mb-2">
                        {p.images?.[0] ? (
                          <img
                            src={resolveImageSrc(p.images[0], 400)}
                            alt={p.name}
                            loading="eager"
                            decoding="async"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package size={20} className="text-muted-foreground/40" />
                          </div>
                        )}
                        {p.hasVariants && (
                          <span className="absolute top-1 left-1 text-[9px] uppercase tracking-wider font-semibold bg-foreground/85 text-background px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            <Layers size={9} /> Variants
                          </span>
                        )}
                        {inCart > 0 && (
                          <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center tabular-nums">
                            {inCart}
                          </span>
                        )}
                      </div>
                      <p className="text-[11.5px] font-medium leading-tight line-clamp-2 text-foreground/90 min-h-[28px]">
                        {p.name}
                      </p>
                      <div className="mt-1 flex items-center justify-between gap-1">
                        <span className="text-[11px] font-semibold tabular-nums text-foreground">{priceLabel}</span>
                        <span className={cn(
                          "text-[9.5px] uppercase tracking-wider font-medium",
                          oos ? "text-destructive" : p.aggregateStock < 5 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                        )}>
                          {oos ? "Sold out" : `${p.aggregateStock} left`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              {canLoadMore && (
                <div className="flex justify-center pt-1">
                  <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)} className="rounded-lg h-8 text-[12px]">
                    Show more ({filteredProducts.length - visibleCount} remaining)
                  </Button>
                </div>
              )}
            </>
          )}

          {/* Selected items */}
          {items.length > 0 && <div className="border-t border-border/30 pt-3" />}
          {items.length === 0 && (
            <p className="text-[13px] text-muted-foreground/50">No items added yet — pick a product above.</p>
          )}
          {items.map((item: any, i: number) => {
            const enriched = enrichedProducts.find((p) => p.id === item.product_id) || null;
            const canEditVariant = !!enriched?.hasVariants;
            return (
              <div key={`${item.product_id}-${item.variant_id ?? ""}-${i}`} className="flex items-center gap-3 text-[13px] bg-muted/30 rounded-xl p-3">
                {item.image ? (
                  <img src={resolveImageSrc(item.image, 400)} alt={item.name || ""} loading="eager" decoding="async" className="w-10 h-10 rounded-lg object-cover" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <Package size={13} className="text-muted-foreground/50" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground/90 leading-tight">{item.name}</p>
                  {item.variant && (
                    <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{item.variant}</p>
                  )}
                  {item.sku && (
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5 tabular-nums truncate">SKU {item.sku}</p>
                  )}
                </div>
                <Input type="number" value={item.quantity || 1} onChange={e => updateItem(i, "quantity", Math.max(1, +e.target.value))} className="w-16 rounded-lg" min={1} />
                <span className="text-muted-foreground/70 whitespace-nowrap tabular-nums">{CURRENCY_SYMBOL}{item.price}</span>
                {canEditVariant && enriched && (
                  <Button variant="ghost" size="sm" onClick={() => openVariantPicker(enriched, item.variant_options || undefined, item.quantity || 1, i)} className="h-7 w-7 p-0 rounded-lg" aria-label="Edit variant">
                    <Pencil size={13} />
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => removeItem(i)} className="text-destructive h-7 w-7 p-0 rounded-lg" aria-label="Remove item"><X size={14} /></Button>
              </div>
            );
          })}

          {freeGiftItems.length > 0 && (
            <div className="space-y-2 pt-3 border-t border-border/30">
              <p className="text-[11px] font-semibold text-primary flex items-center gap-1.5"><Gift size={12} /> Free Gifts (auto-applied)</p>
              {freeGiftItems.map((g: any, i: number) => (
                <div key={`gift-${i}`} className="flex items-center gap-3 text-[13px] bg-primary/5 border border-primary/15 rounded-xl p-3">
                  {g.image && <img src={resolveImageSrc(g.image, 400)} alt={g.name || ""} loading="eager" decoding="async" className="w-9 h-9 rounded-lg object-cover" />}
                  <span className="flex-1 truncate text-foreground/80">{g.name}</span>
                  <span className="text-muted-foreground/60">×{g.quantity}</span>
                  <span className="text-primary font-medium text-[12px]">FREE</span>
                </div>
              ))}
            </div>
          )}
          {appliedOffers.length > 0 && (
            <div className="space-y-1.5 pt-3 border-t border-border/30">
              {appliedOffers.map(ao => (
                <div key={ao.offerId} className="flex items-center gap-2 text-[12px] text-primary">
                  <Tag size={10} /><span>{ao.displayText}</span>
                  {ao.discountAmount > 0 && <span className="ml-auto font-medium tabular-nums">-{CURRENCY_SYMBOL}{ao.discountAmount}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 pt-3">
            <div>
              <label className="text-[12px] text-muted-foreground/60 mb-1.5 block font-medium">Shipping Cost (override)</label>
              <Input type="number" value={data.shipping_cost ?? 0} onChange={e => setData({ ...data, shipping_cost: +e.target.value })} className="rounded-xl" />
            </div>
            <div>
              <label className="text-[12px] text-muted-foreground/60 mb-1.5 block font-medium">Coupon Code</label>
              <Input value={data.coupon_code || ""} onChange={e => setData({ ...data, coupon_code: e.target.value })} placeholder="Enter coupon" list="coupon-list" className="rounded-xl" />
              <datalist id="coupon-list">{coupons.map(c => <option key={c.id} value={c.code}>{c.discount_type === "percentage" ? `${c.discount_value}% off` : `${CURRENCY_SYMBOL}${c.discount_value} off`}</option>)}</datalist>
              {couponDisc > 0 && <p className="text-[11px] text-primary mt-1.5 flex items-center gap-1"><Check size={10} /> Saves {CURRENCY_SYMBOL}{couponDisc}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-[12px] text-muted-foreground/60 mb-1.5 block font-medium">Manual Discount</label>
              <div className="flex items-center gap-2">
                <Select
                  value={manualDiscountType}
                  onValueChange={(v) => setData({ ...data, discount_type: v })}
                >
                  <SelectTrigger className="rounded-xl w-[128px] shrink-0"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="fixed">Fixed ({CURRENCY_SYMBOL})</SelectItem>
                    <SelectItem value="percentage">Percent (%)</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  max={manualDiscountType === "percentage" ? 100 : undefined}
                  value={data.discount_amount ?? 0}
                  onChange={e => setData({ ...data, discount_amount: Math.max(0, +e.target.value || 0) })}
                  placeholder={manualDiscountType === "percentage" ? "0–100" : "0"}
                  className="rounded-xl"
                />
              </div>
              {manualDisc > 0 && (
                <p className="text-[11px] text-primary mt-1.5 flex items-center gap-1">
                  <Check size={10} /> Discount {CURRENCY_SYMBOL}{manualDisc}
                  {manualDiscountType === "percentage" ? ` (${Number(data.discount_amount) || 0}% of subtotal)` : ""}
                </p>
              )}
            </div>
          </div>
          <div className="border-t border-border/30 pt-4 space-y-2 text-[13px]">
            <div className="flex justify-between"><span className="text-muted-foreground/60">Subtotal</span><span className="tabular-nums">{CURRENCY_SYMBOL}{subtotal}</span></div>
            {offerDiscount > 0 && <div className="flex justify-between text-primary"><span>Offer Discount</span><span className="tabular-nums">-{CURRENCY_SYMBOL}{offerDiscount}</span></div>}
            {couponDisc > 0 && <div className="flex justify-between text-primary"><span>Coupon</span><span className="tabular-nums">-{CURRENCY_SYMBOL}{couponDisc}</span></div>}
            {manualDisc > 0 && <div className="flex justify-between text-primary"><span>Manual Discount{manualDiscountType === "percentage" ? ` (${Number(data.discount_amount) || 0}%)` : ""}</span><span className="tabular-nums">-{CURRENCY_SYMBOL}{manualDisc}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground/60">Shipping</span><span className="tabular-nums">{CURRENCY_SYMBOL}{Number(data.shipping_cost || 0)}</span></div>
            <div className="flex justify-between font-semibold text-[15px] pt-2 border-t border-border/30"><span>Total</span><span className="tabular-nums">{CURRENCY_SYMBOL}{total}</span></div>
          </div>
        </div>

        {/* Notes */}
        <div className="bg-background rounded-2xl border border-border/40 p-6">
          <label className="text-[12px] text-muted-foreground/60 mb-1.5 block font-medium">Order Notes (optional)</label>
          <Textarea value={data.notes || ""} onChange={e => setData({ ...data, notes: e.target.value })} rows={2} placeholder="Any special instructions" className="rounded-xl" />
        </div>

        <Button onClick={onSave} disabled={!!saving} className="rounded-xl gap-1.5"><Save size={14} /> {saving ? "Saving…" : "Save"}</Button>
      </div>

      <VariantSelectorDialog
        open={!!pending}
        pending={pending}
        onClose={() => setPending(null)}
        onConfirm={handleVariantConfirm}
      />
    </div>
  );
}

export const OrderForm = memo(OrderFormImpl);
export default OrderForm;
