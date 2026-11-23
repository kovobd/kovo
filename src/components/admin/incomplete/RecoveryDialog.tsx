import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, Minus, Package, Sparkles, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { resolveImageSrc } from "@/lib/cdnImage";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { fetchActiveDeliveryZones, type DeliveryZone } from "@/lib/checkoutOptions";
import { computeDiscountAmount, type DiscountType } from "@/lib/discount";
import OrderEditorDialog, { type IncompleteRowLite } from "@/components/admin/orders/OrderEditorDialog";

export type IncompleteRow = {
  id: string;
  customer_name: string | null;
  phone: string;
  email: string | null;
  address: Record<string, any>;
  cart_items: any[];
  subtotal: number;
  delivery_charge: number;
  total: number;
  coupon: string | null;
  payment_method: string | null;
  recovered: boolean;
  converted_order_id: string | null;
  recovery_notes?: string | null;
};

type Mode = "view" | "edit" | "recover";

interface Props {
  row: IncompleteRow | null;
  mode: Mode;
  onClose: () => void;
}

const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const LegacyViewEditDialog = ({ row, mode, onClose }: Props) => {
  const qc = useQueryClient();
  const isView = mode === "view";
  const isRecover = mode === "recover";

  const [items, setItems] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [line1, setLine1] = useState("");
  const [city, setCity] = useState("");
  const [zone, setZone] = useState("");
  const [shipping, setShipping] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<DiscountType>("fixed");
  const [coupon, setCoupon] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_type: string; discount_value: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [payment, setPayment] = useState("cod");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [zones, setZones] = useState<DeliveryZone[]>([]);

  useEffect(() => {
    fetchActiveDeliveryZones().then(setZones).catch(() => setZones([]));
  }, []);

  useEffect(() => {
    if (!row) {
      // Reset on close so re-opening the same row in a different mode reseeds cleanly.
      setItems([]); setName(""); setPhone(""); setEmail("");
      setLine1(""); setCity(""); setZone("");
      setShipping(0); setDiscount(0); setDiscountType("fixed"); setCoupon(""); setAppliedCoupon(null); setPayment("cod"); setNotes("");
      return;
    }
    setItems(Array.isArray(row.cart_items) ? row.cart_items.map((it: any) => ({ ...it })) : []);
    setName(row.customer_name ?? "");
    setPhone(row.phone ?? "");
    setEmail(row.email ?? "");
    const addr = row.address ?? {};
    setLine1(addr.line1 ?? addr.address ?? "");
    setCity(addr.city ?? "");
    setZone(addr.delivery_zone ?? addr.zone ?? "");
    setShipping(num(row.delivery_charge));
    setDiscount(0);
    setCoupon(row.coupon ?? "");
    setAppliedCoupon(null);
    setPayment(row.payment_method ?? "cod");
    setNotes("");
  }, [row?.id, mode]);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + num(it.sale_price ?? it.price) * num(it.quantity, 1), 0),
    [items],
  );
  const matchedZone = useMemo(
    () => zones.find((z) => z.zone_name?.toLowerCase() === zone.trim().toLowerCase()) ?? null,
    [zones, zone],
  );

  // Auto-derive shipping from selected zone (respects free-delivery threshold).
  useEffect(() => {
    if (isView || !matchedZone) return;
    const freeMin = Number(matchedZone.free_delivery_minimum) || 0;
    const free = freeMin > 0 && subtotal >= freeMin;
    setShipping(free ? 0 : Number(matchedZone.delivery_charge) || 0);
  }, [matchedZone, subtotal, isView]);

  // Coupon discount is derived (kept separate from manual discount).
  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const d = appliedCoupon.discount_type === "percentage"
      ? Math.round((subtotal * Number(appliedCoupon.discount_value || 0)) / 100)
      : Number(appliedCoupon.discount_value || 0);
    return Math.max(0, Math.min(d, subtotal));
  }, [appliedCoupon, subtotal]);

  const manualDiscount = computeDiscountAmount(discountType, discount, subtotal);
  const totalDiscount = Math.min(subtotal, manualDiscount + couponDiscount);
  const total = Math.max(0, subtotal + num(shipping) - totalDiscount);
  const itemCount = useMemo(() => items.reduce((s, it) => s + num(it.quantity, 1), 0), [items]);

  if (!row) return null;

  const setQty = (i: number, q: number) => {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, quantity: Math.max(1, q) } : it)));
  };
  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));

  const buildAddress = () => ({ ...(row.address ?? {}), line1, city, delivery_zone: zone });

  const copyToClipboard = (text: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success("Copied!");
  };

  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (!code) {
      toast.error("Enter a coupon code");
      return;
    }
    setCouponLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)("validate_coupon", {
        _code: code,
        _cart_total: subtotal,
      });
      if (error) throw error;
      const r: any = Array.isArray(data) ? data[0] : data;
      if (!r || !r.valid) {
        const reason = r?.error;
        const msg =
          reason === "INVALID_CODE" ? "Invalid coupon code"
          : reason === "DISABLED" ? "Coupon is no longer active"
          : reason === "NOT_STARTED" ? "Coupon isn't active yet"
          : reason === "EXPIRED" ? "Coupon has expired"
          : reason === "LIMIT_REACHED" ? "Coupon has reached its usage limit"
          : reason === "MIN_ORDER" && r?.min_order_amount != null
            ? `Minimum order ${CURRENCY_SYMBOL}${Number(r.min_order_amount).toLocaleString()} required`
            : "Invalid coupon code";
        toast.error(msg);
        setAppliedCoupon(null);
        return;
      }
      setAppliedCoupon({ code: r.code, discount_type: r.discount_type, discount_value: Number(r.discount_value) });
      setCoupon(r.code);
      toast.success(`Coupon applied — ${r.discount_type === "percentage" ? `${r.discount_value}% off` : `${CURRENCY_SYMBOL}${r.discount_value} off`}`);
    } catch (e: any) {
      toast.error(e.message ?? "Could not validate coupon");
    } finally {
      setCouponLoading(false);
    }
  };

  const clearCoupon = () => {
    setAppliedCoupon(null);
    setCoupon("");
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("incomplete_orders")
        .update({
          customer_name: name,
          email,
          phone: phone.replace(/\D/g, ""),
          address: buildAddress() as any,
          cart_items: items as any,
          subtotal,
          delivery_charge: shipping,
          total,
          coupon: coupon || null,
          payment_method: payment,
        })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("Incomplete cart updated");
      qc.invalidateQueries({ queryKey: ["admin", "incomplete-orders"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleRecover = async () => {
    if (row.recovered) {
      toast.error("Already recovered");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await (supabase.rpc as any)("recover_incomplete_order", {
        _incomplete_id: row.id,
        _payload: {
          customer_name: name,
          customer_phone: phone,
          customer_email: email || null,
          customer_address: line1,
          customer_city: city,
          shipping_address: buildAddress(),
          items,
          subtotal,
          discount_amount: totalDiscount,
          shipping_cost: shipping,
          total,
          payment_method: payment,
          coupon_code: coupon || null,
          recovery_notes: notes || null,
        } as any,
      });
      if (error) throw error;
      const result = data as any;
      toast.success(
        result?.already_recovered
          ? `Already recovered as ${result.order_number}`
          : `Order ${result?.order_number ?? ""} created`,
      );
      qc.invalidateQueries({ queryKey: ["admin", "incomplete-orders"] });
      qc.invalidateQueries({ queryKey: ["admin", "orders"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Recovery failed");
    } finally {
      setSaving(false);
    }
  };

  const title = isView ? "Incomplete order" : mode === "edit" ? "Edit incomplete order" : "Recover incomplete order";

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-hidden p-0 rounded-[4px] gap-0 flex flex-col border-border/60">
        {/* Header — customer-profile style */}
        <DialogHeader className="px-5 sm:px-6 pt-5 pb-4 border-b border-border/40 space-y-1.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <DialogTitle className="text-[18px] sm:text-[20px] font-semibold text-foreground truncate leading-tight min-w-0">
              {name || "Unknown customer"}
            </DialogTitle>
            <span
              className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[10.5px] font-medium shrink-0",
                row.recovered
                  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
              )}
            >
              {row.recovered ? "Recovered" : "Abandoned"}
            </span>
          </div>
          <div className="text-[12.5px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {phone ? (
              <button onClick={() => copyToClipboard(phone)} aria-label="Copy phone number" className="group inline-flex items-center gap-1.5 text-foreground hover:text-foreground transition-colors">
                <span className="tabular-nums">{phone}</span>
                <Copy size={11} className="shrink-0 opacity-60 transition-opacity" />
              </button>
            ) : (
              <span className="tabular-nums text-foreground">—</span>
            )}
            {email && <><span className="text-muted-foreground/50">•</span><span className="truncate">{email}</span></>}
            <span className="text-muted-foreground/50">•</span>
            <span>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
            <span className="text-muted-foreground/50">•</span>
            <span>{title}</span>
          </div>
        </DialogHeader>

        <div className="px-5 sm:px-6 py-4 space-y-3 overflow-y-auto flex-1 min-h-0">
          {/* Customer */}
          <Card title="Customer">
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} disabled={isView} className="h-9 rounded-[4px] text-[13px]" /></Field>
              <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={isView} className="h-9 rounded-[4px] text-[13px] tabular-nums" /></Field>
              <Field label="Email" className="sm:col-span-2"><Input value={email} onChange={(e) => setEmail(e.target.value)} disabled={isView} className="h-9 rounded-[4px] text-[13px]" /></Field>
              <Field label="Full address" className="sm:col-span-2"><Input value={line1} onChange={(e) => setLine1(e.target.value)} disabled={isView} className="h-9 rounded-[4px] text-[13px]" /></Field>
              <Field label="Shipment zone">
                <Select value={zone} onValueChange={setZone} disabled={isView}>
                  <SelectTrigger className="h-9 rounded-[4px] text-[13px]">
                    <SelectValue placeholder={zones.length ? "Select a zone" : "Loading zones…"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-[4px]">
                    {zones.map((z) => (
                      <SelectItem key={z.id} value={z.zone_name}>
                        {z.zone_name} · {CURRENCY_SYMBOL}{Number(z.delivery_charge).toLocaleString()}
                      </SelectItem>
                    ))}
                    {zone && !zones.some((z) => z.zone_name === zone) && (
                      <SelectItem value={zone}>{zone} (legacy)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Payment">
                <Select value={payment} onValueChange={setPayment} disabled={isView}>
                  <SelectTrigger className="h-9 rounded-[4px] text-[13px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="rounded-[4px]">
                    <SelectItem value="cod">Cash on Delivery</SelectItem>
                    <SelectItem value="bkash">bKash</SelectItem>
                    <SelectItem value="nagad">Nagad</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </Card>

          {/* Items */}
          <Card title="Items" count={items.length}>
            {items.length === 0 ? (
              <div className="text-center py-6 text-[12px] text-muted-foreground/70">No items in this cart.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {items.map((it, i) => {
                  const price = num(it.sale_price ?? it.price);
                  const qty = num(it.quantity, 1);
                  return (
                    <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      {it.image ? (
                        <img src={resolveImageSrc(it.image, 400)} alt="" loading="lazy" className="w-12 h-12 rounded-[4px] object-cover border border-border/40 shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-[4px] bg-muted/60 flex items-center justify-center shrink-0">
                          <Package size={14} className="text-muted-foreground/50" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium truncate text-foreground leading-snug">{it.name ?? "Item"}</p>
                        <p className="text-[11.5px] text-muted-foreground/70 tabular-nums mt-0.5">
                          {CURRENCY_SYMBOL}{price.toLocaleString()} · Qty {qty}
                        </p>
                      </div>
                      <span className="text-[13.5px] font-semibold tabular-nums shrink-0 text-foreground">{CURRENCY_SYMBOL}{(price * qty).toLocaleString()}</span>
                      {!isView && (
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          <button onClick={() => setQty(i, qty - 1)} aria-label="Decrease quantity" className="h-7 w-7 rounded-[4px] border border-border/60 hover:bg-muted flex items-center justify-center transition-colors"><Minus size={12} /></button>
                          <span className="w-6 text-center text-[12px] tabular-nums font-medium">{qty}</span>
                          <button onClick={() => setQty(i, qty + 1)} aria-label="Increase quantity" className="h-7 w-7 rounded-[4px] border border-border/60 hover:bg-muted flex items-center justify-center transition-colors"><Plus size={12} /></button>
                          <button onClick={() => removeItem(i)} aria-label="Remove item" className="h-7 w-7 rounded-[4px] text-destructive hover:bg-destructive/10 flex items-center justify-center ml-0.5 transition-colors"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Totals */}
          <Card title="Totals">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Shipping (from zone)">
                <Input
                  type="number"
                  value={shipping}
                  onChange={(e) => setShipping(num(e.target.value))}
                  readOnly={isView || !isRecover}
                  disabled={isView || !isRecover}
                  className="h-9 rounded-[4px] text-[13px] tabular-nums"
                />
              </Field>
              <Field label="Discount (manual)">
                <div className="flex gap-1.5">
                  <Select value={discountType} onValueChange={(v) => setDiscountType(v as DiscountType)} disabled={isView || !isRecover}>
                    <SelectTrigger className="h-9 w-[104px] shrink-0 rounded-[4px] text-[13px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-[4px]">
                      <SelectItem value="fixed">{CURRENCY_SYMBOL}</SelectItem>
                      <SelectItem value="percentage">%</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    max={discountType === "percentage" ? 100 : undefined}
                    value={discount}
                    onChange={(e) => setDiscount(num(e.target.value))}
                    disabled={isView || !isRecover}
                    placeholder={discountType === "percentage" ? "0–100" : "0"}
                    className="h-9 rounded-[4px] text-[13px] tabular-nums"
                  />
                </div>
              </Field>
              <Field label="Coupon">
                <div className="flex gap-1.5">
                  <Input
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value.toUpperCase())}
                    disabled={isView || !!appliedCoupon}
                    placeholder="CODE"
                    className="h-9 rounded-[4px] text-[13px] uppercase"
                  />
                  {appliedCoupon ? (
                    <Button type="button" size="sm" variant="outline" onClick={clearCoupon} disabled={isView} className="h-9 rounded-[4px] text-[12px] shrink-0">
                      Clear
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={applyCoupon} disabled={isView || couponLoading || !coupon.trim()} className="h-9 rounded-[4px] text-[12px] shrink-0">
                      {couponLoading ? "…" : "Apply"}
                    </Button>
                  )}
                </div>
              </Field>
            </div>
            <div className="mt-3 pt-3 border-t border-border/40 space-y-1 text-[12.5px]">
              <Row label="Subtotal" value={subtotal} />
              <Row label="Shipping" value={num(shipping)} />
              {totalDiscount > 0 && (
                <Row
                  label={appliedCoupon ? `Discount (incl. coupon ${appliedCoupon.code})` : "Discount"}
                  value={-totalDiscount}
                  accent
                />
              )}
              <div className="flex justify-between items-baseline pt-1.5 mt-1.5 border-t border-border/40">
                <span className="text-[12px] font-medium text-foreground">Total</span>
                <span className="text-[16px] font-semibold tabular-nums text-foreground">{CURRENCY_SYMBOL}{total.toLocaleString()}</span>
              </div>
            </div>
          </Card>

          {isRecover && (
            <Card title="Recovery notes">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Optional context for the order log"
                className="rounded-[4px] text-[13px] resize-none"
              />
            </Card>
          )}
        </div>

        <DialogFooter className="px-5 sm:px-6 py-3 border-t border-border/40 gap-2 bg-background">
          <Button variant="outline" onClick={onClose} size="sm" className="rounded-[4px] text-[12px] h-9">Close</Button>
          {mode === "edit" && (
            <Button onClick={handleSaveEdit} disabled={saving} size="sm" className="rounded-[4px] text-[12px] h-9 gap-1.5">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
          {mode === "recover" && (
            <Button onClick={handleRecover} disabled={saving || row.recovered} size="sm" className="rounded-[4px] text-[12px] h-9 gap-1.5">
              <Sparkles size={12} />
              {row.recovered ? "Already recovered" : saving ? "Recovering…" : "Confirm & create order"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const Card = ({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) => (
  <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
    <div className="flex items-center justify-between mb-2.5">
      <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80">{title}</h3>
      {typeof count === "number" && (
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">{count} item{count !== 1 ? "s" : ""}</span>
      )}
    </div>
    {children}
  </div>
);

const Row = ({ label, value, accent }: { label: string; value: number; accent?: boolean }) => (
  <div className="flex justify-between items-baseline">
    <span className="text-muted-foreground/80">{label}</span>
    <span className={cn("tabular-nums", accent ? "text-primary font-medium" : "text-foreground")}>
      {value < 0 ? "-" : ""}{CURRENCY_SYMBOL}{Math.abs(value).toLocaleString()}
    </span>
  </div>
);

const Field = ({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={cn("space-y-1", className)}>
    <Label className="text-[10.5px] uppercase tracking-wide text-muted-foreground/70 font-medium">{label}</Label>
    {children}
  </div>
);

// Wrapper: "recover" mode delegates to the shared OrderEditorDialog so that
// both Create Same Order and Recover Incomplete Order stay in lock-step.
// "view" and "edit" continue to use the existing in-place implementation.
const RecoveryDialog = ({ row, mode, onClose }: Props) => {
  if (mode === "recover") {
    const seed: IncompleteRowLite | null = row
      ? {
          id: row.id,
          customer_name: row.customer_name,
          phone: row.phone,
          email: row.email,
          address: row.address,
          cart_items: row.cart_items,
          delivery_charge: row.delivery_charge,
          coupon: row.coupon,
          payment_method: row.payment_method,
          recovered: row.recovered,
        }
      : null;
    return (
      <OrderEditorDialog
        open={!!row}
        onClose={onClose}
        source={seed ? { kind: "recover", row: seed } : null}
      />
    );
  }
  return <LegacyViewEditDialog row={row} mode={mode} onClose={onClose} />;
};

export default RecoveryDialog;
