import { resolveImageSrc } from "@/lib/cdnImage";
import { uuid } from "@/lib/uuid";
import { useState, useEffect, useMemo, useRef } from "react";
import { trackInitiateCheckout, trackAddPaymentInfo, splitName } from "@/lib/trackingEvents";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftIcon, ShieldCheckIcon, TagIcon, XIcon, GiftIcon, TruckIcon } from "@/components/ui/icons";
import { useCartStore } from "@/data/cartStore";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { CURRENCY_SYMBOL, toBanglaDigits } from "@/lib/currency";
import { getAllProductOffers, calculateAppliedOffers, type ProductOffer } from "@/lib/productOffers";
import { subscribeToNewsletter } from "@/lib/newsletter";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import {
  getCheckoutSessionId,
  isValidBdPhone,
  upsertIncompleteOrder,
  markIncompleteOrderRecovered,
  clearCheckoutSession,
} from "@/lib/incompleteOrder";

import { PAYMENT_METHODS, fetchPaymentOptions, type PaymentMethod, type PaymentOptions } from "@/lib/checkoutOptions";
import { useDeliveryZones } from "@/hooks/useDeliveryZones";
import { useCartProductMeta } from "@/hooks/useCartProductMeta";

const Checkout = () => {
  useDocumentMeta({
    title: "Checkout — Kovo",
    description: "Securely complete your order with cash on delivery or other payment options. Fast delivery across Bangladesh.",
    canonicalPath: "/checkout",
    noindex: true,
  });
  const { items, totalPrice, clearCart } = useCartStore();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{ code: string; discount_type: string; discount_value: number } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [productOffers, setProductOffers] = useState<ProductOffer[]>([]);
  // Pre-seed product maps from cart items so summary renders instantly without flicker.
  // Lazy-init from cart items so the summary renders instantly on first paint.
  // Using useState lazy initializers (instead of useMemo+effect) makes intent
  // explicit and removes the need for an exhaustive-deps suppression.
  const [productNames, setProductNames] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    items.forEach((i) => { m[i.productId ?? i.id] = i.name; });
    return m;
  });
  const [productPrices, setProductPrices] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    items.forEach((i) => { m[i.productId ?? i.id] = i.price; });
    return m;
  });
  const [productImages, setProductImages] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    items.forEach((i) => { if (i.image) m[i.productId ?? i.id] = i.image; });
    return m;
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [payOptions, setPayOptions] = useState<PaymentOptions | null>(null);

  // Admin-controlled payment methods + merchant numbers (Settings → Payment).
  useEffect(() => {
    let alive = true;
    fetchPaymentOptions().then((opts) => {
      if (!alive) return;
      setPayOptions(opts);
      setPaymentMethod(opts.defaultId);
    });
    return () => { alive = false; };
  }, []);
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    country: "Bangladesh", district: "", city: "", line1: "",
    notes: "",
  });

  const [deliveryZones, setDeliveryZones] = useState<any[]>([]);
  const [zonesLoaded, setZonesLoaded] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState<string>("");
  const initiateTrackedRef = useRef(false);
  const paymentTrackedRef = useRef(false);
  const sessionIdRef = useRef<string>(getCheckoutSessionId());
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track InitiateCheckout on mount
  useEffect(() => {
    if (items.length > 0 && !initiateTrackedRef.current) {
      initiateTrackedRef.current = true;
      trackInitiateCheckout(
        items.map((i) => ({ id: i.productId ?? i.id, name: i.name, price: i.price, quantity: i.quantity })),
        totalPrice(),
        "BDT",
      );
    }
  }, [items]);

  const buildCheckoutUserData = () => {
    const { firstName, lastName } = splitName(form.name);
    return {
      email: form.email || undefined,
      phone: form.phone || undefined,
      firstName,
      lastName,
      city: form.city || undefined,
      country: form.country || undefined,
    };
  };

  const { data: zonesData } = useDeliveryZones();
  useEffect(() => {
    if (!zonesData) return;
    setDeliveryZones(zonesData as any[]);
    if (zonesData.length > 0) setSelectedZoneId((prev) => prev || zonesData[0].id);
    setZonesLoaded(true);
  }, [zonesData]);

  useEffect(() => {
    getAllProductOffers().then(setProductOffers);
  }, []);

  const matchedZone = deliveryZones.find(z => z.id === selectedZoneId) || deliveryZones[0] || null;

  const productIdKey = useMemo(() => {
    const ids = new Set<string>();
    productOffers.forEach((o) => {
      ids.add(o.product_id);
      if (o.free_product_id) ids.add(o.free_product_id);
    });
    items.forEach((i) => ids.add(i.productId ?? i.id));
    return Array.from(ids).sort().join(",");
  }, [items, productOffers]);

  const cartIds = useMemo(() => productIdKey.split(",").filter(Boolean), [productIdKey]);
  const { data: meta } = useCartProductMeta(cartIds);

  useEffect(() => {
    if (!meta) return;
    const nameMap = { ...meta.names };
    const priceMap = { ...meta.prices };
    const imgMap = { ...meta.images };
    items.forEach((i) => {
      const productId = i.productId ?? i.id;
      nameMap[productId] = nameMap[productId] || i.name;
      if (!priceMap[productId]) priceMap[productId] = i.price;
      if (!imgMap[productId] && i.image) imgMap[productId] = i.image;
    });
    setProductNames((prev) => ({ ...prev, ...nameMap }));
    setProductPrices((prev) => ({ ...prev, ...priceMap }));
    setProductImages((prev) => ({ ...prev, ...imgMap }));
  }, [meta, items]);

  // Memoize heavy derived state — recomputing on every form keystroke caused typing lag.
  const subtotal = useMemo(() => totalPrice(), [items]);
  const appliedProductOffers = useMemo(
    () => calculateAppliedOffers(items, productOffers, productNames, productPrices),
    [items, productOffers, productNames, productPrices],
  );
  const productOfferDiscount = useMemo(
    () => appliedProductOffers.reduce((sum, offer) => sum + offer.discountAmount, 0),
    [appliedProductOffers],
  );
  const hasFreeShippingOffer = useMemo(
    () => appliedProductOffers.some((o) => o.offerType === "free_shipping" || o.offerType === "buy_x_get_y_free_delivery"),
    [appliedProductOffers],
  );
  const discountedSubtotal = Math.max(0, subtotal - productOfferDiscount);
  const zoneCharge = matchedZone ? Number(matchedZone.delivery_charge) || 0 : 120;
  const zoneFreeMin = matchedZone ? Number(matchedZone.free_delivery_minimum) || 0 : 0;
  const shippingCost = hasFreeShippingOffer || (zoneFreeMin > 0 && subtotal >= zoneFreeMin) ? 0 : zoneCharge;

  const couponDiscount = appliedCoupon
    ? appliedCoupon.discount_type === "percentage"
      ? Math.round(discountedSubtotal * (appliedCoupon.discount_value / 100))
      : Math.min(appliedCoupon.discount_value, discountedSubtotal)
    : 0;

  const totalDiscount = productOfferDiscount + couponDiscount;
  const total = Math.max(0, subtotal - totalDiscount + shippingCost);

  // ── Incomplete order auto-save ──
  // Persist progress ONLY when phone is a valid BD mobile and cart is non-empty.
  // Debounced so keystrokes don't spam the database.
  useEffect(() => {
    if (!isValidBdPhone(form.phone) || items.length === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const step = !form.line1
        ? "contact_filled"
        : !matchedZone
        ? "address_filled"
        : "payment_selected";
      upsertIncompleteOrder({
        sessionId: sessionIdRef.current,
        phone: form.phone,
        customerName: form.name,
        email: form.email,
        address: {
          country: form.country,
          district: form.district,
          city: form.city,
          line1: form.line1,
          delivery_zone: matchedZone?.zone_name || "",
        },
        cartItems: items.map((i) => ({
          product_id: i.productId ?? i.id,
          name: i.name,
          variant: i.variant ?? null,
          price: i.price,
          quantity: i.quantity,
          image: i.image,
        })),
        subtotal,
        deliveryCharge: shippingCost,
        total,
        coupon: appliedCoupon?.code ?? null,
        paymentMethod,
        checkoutStep: step,
      }).catch(() => { /* silent — never block checkout UX */ });
    }, 900);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [
    form.phone, form.name, form.email, form.line1,
    form.country, form.district, form.city,
    items, subtotal, shippingCost, total, appliedCoupon, paymentMethod, matchedZone,
  ]);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    update("phone", digits);
    // Track AddPaymentInfo when user fills contact info
    if (digits.length === 11 && form.name && !paymentTrackedRef.current) {
      paymentTrackedRef.current = true;
      const { firstName, lastName } = splitName(form.name);
      trackAddPaymentInfo(totalPrice(), "BDT", {
        email: form.email || undefined,
        phone: digits,
        firstName,
        lastName,
        city: form.city || undefined,
        country: form.country || undefined,
      });
    }
  };

  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    const { data, error } = await (supabase.rpc as any)("validate_coupon", {
      _code: couponCode.trim().toUpperCase(),
      _cart_total: discountedSubtotal,
    });
    if (error) {
      toast({ title: "Could not check coupon", description: error.message, variant: "destructive" });
      setCouponLoading(false);
      return;
    }
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row || !row.valid) {
      const reason = row?.error;
      const message =
        reason === "INVALID_CODE" ? "Invalid coupon code"
        : reason === "DISABLED" ? "This coupon is no longer active"
        : reason === "NOT_STARTED" ? "This coupon isn't active yet"
        : reason === "EXPIRED" ? "This coupon has expired"
        : reason === "LIMIT_REACHED" ? "This coupon has reached its usage limit"
        : reason === "MIN_ORDER" && row?.min_order_amount != null
          ? `Minimum order of ${CURRENCY_SYMBOL}${toBanglaDigits(row.min_order_amount)} required for this coupon`
          : "Invalid coupon code";
      toast({ title: message, variant: "destructive" });
    } else {
      setAppliedCoupon({ code: row.code, discount_type: row.discount_type, discount_value: row.discount_value });
      toast({ title: `Coupon applied! ${row.discount_type === "percentage" ? `${toBanglaDigits(row.discount_value)}% off` : `${CURRENCY_SYMBOL}${toBanglaDigits(row.discount_value)} off`}` });
    }
    setCouponLoading(false);
  };

  if (items.length === 0) {
    return (
      <div className="section-padding section-spacing text-center">
        <h1 className="apple-heading-md text-foreground mb-4">Nothing to checkout</h1>
        <Link to="/shop" className="inline-flex items-center justify-center bg-foreground text-background px-8 py-4 rounded-[2px] text-sm font-medium hover:bg-foreground/90 transition-colors">
          Continue Shopping
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone || !form.line1) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }
    if (form.phone.length !== 11) {
      toast({ title: "Phone number must be 11 digits", variant: "destructive" });
      return;
    }
    if (!matchedZone) {
      toast({ title: "Please select a delivery zone", variant: "destructive" });
      return;
    }
    setSubmitting(true);

    const orderId = uuid();
    const { data: orderNumberRpc, error: numErr } = await supabase.rpc("next_order_number");
    if (numErr || !orderNumberRpc) {
      setSubmitting(false);
      toast({ title: "Could not generate order number", description: numErr?.message || "Please try again", variant: "destructive" });
      return;
    }
    const orderNumber = orderNumberRpc as string;
    const orderItems = [
      ...items.map((i) => ({
        product_id: i.productId ?? i.id,
        variant_id: i.variantId ?? null,
        name: i.name,
        variant: i.variant ?? null,
        price: i.price,
        quantity: i.quantity,
        image: i.image,
      })),
      ...appliedProductOffers.flatMap((ao) =>
        ao.freeItems.map((f) => ({
          product_id: f.productId,
          variant_id: f.variantId ?? null,
          name: f.productName,
          variant: null,
          price: 0,
          quantity: f.quantity,
          image: productImages[f.productId] || "/placeholder.svg",
          is_free_gift: true,
          offer_text: ao.displayText,
        }))
      ),
    ];

    const selectedMethod = (payOptions?.methods ?? PAYMENT_METHODS).find((p) => p.id === paymentMethod);
    const paymentLabel = selectedMethod?.label ?? "Cash on Delivery";
    const composedNotes = [`Payment: ${paymentLabel}`, form.notes].filter(Boolean).join("\n");

    const { error } = await supabase.from("orders").insert({
      id: orderId,
      order_number: orderNumber,
      customer_name: form.name,
      customer_email: form.email,
      customer_phone: form.phone,
      shipping_address: { country: form.country, district: form.district, city: form.city, line1: form.line1, delivery_zone: matchedZone?.zone_name || "" },
      items: orderItems as any,
      subtotal,
      shipping_cost: shippingCost,
      discount_amount: totalDiscount,
      coupon_code: appliedCoupon?.code || null,
      total,
      notes: composedNotes || null,
      // "cod" or the online method's id (bkash, nagad, ...): the courier
      // collects cash only for "cod".
      payment_method: (selectedMethod?.type ?? "cod") === "cod" ? "cod" : (selectedMethod?.id ?? "cod"),
      payment_status: "pending",
      order_status: "pending",
    });

    if (error) {
      setSubmitting(false);
      toast({ title: "Order failed", description: error.message, variant: "destructive" });
      return;
    }

    // Stock, coupon usage and the customer record, worked out by the database
    // from the stored order (a shopper cannot change stock or coupons directly).
    // Awaited so it is not cut off by the page change; an order is never lost
    // over it.
    // (Not in the generated types yet: migration 20261124130000.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.rpc as any)("finalize_storefront_order", { _order_id: orderId })
      .then(({ error: finErr }: { error: { message: string } | null }) => {
        if (finErr) console.warn("order finalize failed:", finErr.message);
      }, (e: unknown) => console.warn("order finalize failed:", e));

    // Store items + user data + a session-bound token so the confirmation page can
    // verify this browser actually completed *this* order (defeats forged ?order=… URLs).
    try {
      sessionStorage.setItem("last_order_items", JSON.stringify(
        items.map((i) => ({ id: i.productId ?? i.id, name: i.name, price: i.price, quantity: i.quantity }))
      ));
      sessionStorage.setItem("last_order_user", JSON.stringify(buildCheckoutUserData()));
      sessionStorage.setItem("last_order_number", String(orderNumber));
      sessionStorage.setItem("last_order_total", String(total));
    } catch {}
    clearCart();
    // Navigate immediately — confirmation screen renders instantly while side-effects run in background.
    navigate(`/order-confirmation?order=${orderNumber}&total=${total}`);

    // Fire-and-forget all post-order side-effects in parallel (don't block UX).
    (() => {
      // Mark incomplete order as recovered + reset session for the next purchase.
      markIncompleteOrderRecovered(sessionIdRef.current, form.phone, orderId)
        .catch((e) => console.warn("recovery mark failed:", e));
      clearCheckoutSession();

      if (form.email) {
        subscribeToNewsletter(form.email).catch((e) => console.warn("newsletter failed:", e));
      }

      // Courier booking is done by the admin from the Orders page (the
      // courier functions need an admin login; a call from here always failed).
    })();
  };

  return (
    <div className="section-padding section-spacing overflow-x-hidden">
      <div className="max-w-xl lg:max-w-6xl mx-auto">
        <Link to="/cart" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 sm:mb-6">
          <ArrowLeftIcon size={16} /> Back to cart
        </Link>

        <h1 className="apple-heading-md text-foreground mb-5 sm:mb-7">Checkout</h1>

        <form onSubmit={handleSubmit} className="grid lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 xl:gap-10 lg:items-start">
          <div className="space-y-6 min-w-0">
          {/* Contact */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Full name <span className="text-destructive">*</span></label>
              <Input value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Your full name" required />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Phone number <span className="text-destructive">*</span> <span className="text-muted-foreground font-normal">(11 digits)</span>
              </label>
              <Input
                value={form.phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                placeholder="01XXXXXXXXX"
                required
                inputMode="numeric"
                maxLength={11}
              />
              {form.phone.length > 0 && form.phone.length < 11 && (
                <p className="text-[11px] text-destructive mt-1">Add {toBanglaDigits(11 - form.phone.length)} more digits required</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Email <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} placeholder="you@email.com" />
            </div>
          </div>

          {/* Address */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Full address <span className="text-destructive">*</span></label>
              <Input value={form.line1} onChange={(e) => update("line1", e.target.value)} placeholder="House, road, area" required />
            </div>
          </div>

          {/* Shipment */}
          {!zonesLoaded ? (
            <div>
              <h2 className="text-sm font-medium text-foreground mb-3">Shipment <span className="text-destructive">*</span></h2>
              <div className="space-y-2.5">
                {[0, 1].map((i) => (
                  <div key={i} className="w-full h-[58px] rounded-xl border border-border/60 bg-card/30 animate-pulse" />
                ))}
              </div>
            </div>
          ) : deliveryZones.length > 0 ? (
            <div>
              <h2 className="text-sm font-medium text-foreground mb-3">Shipment <span className="text-destructive">*</span></h2>
              <div className="space-y-2.5">
                {deliveryZones.map((z) => {
                  const selected = selectedZoneId === z.id;
                  return (
                    <button
                      type="button"
                      key={z.id}
                      onClick={() => setSelectedZoneId(z.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                        selected
                          ? "border-primary bg-primary/[0.06]"
                          : "border-border hover:border-border/80 bg-card/30"
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                        {selected && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                      </span>
                      <span className="text-sm text-foreground">
                        {z.zone_name}: <span className="font-semibold">{CURRENCY_SYMBOL}{toBanglaDigits(Number(z.delivery_charge).toFixed(2))}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Payment Method */}
          <div>
            <h2 className="text-sm font-medium text-foreground mb-3">Payment Method <span className="text-destructive">*</span></h2>
            <div className="space-y-2.5">
              {(payOptions?.methods ?? PAYMENT_METHODS).map((p) => {
                const selected = paymentMethod === p.id;
                const merchantNumber = p.type === "online" ? p.receiverNumber : "";
                return (
                  <div key={p.id}>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod(p.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border text-left transition-all ${
                      selected
                        ? "border-primary bg-primary/[0.06] ring-1 ring-primary/40"
                        : "border-border hover:border-border/80 bg-card/30"
                    }`}
                  >
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${selected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {p.logo ? (
                        <img src={resolveImageSrc(p.logo)} alt="" className="w-full h-full object-cover rounded-lg" loading="lazy" />
                      ) : p.type === "cod" ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/></svg>
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{p.label}</span>
                      <span className="block text-xs text-muted-foreground">{p.description}</span>
                    </span>
                    <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? "border-primary" : "border-muted-foreground/40"}`}>
                      {selected && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                    </span>
                  </button>
                  {selected && (merchantNumber || p.instructions) ? (
                    <div className="mt-1.5 mx-1 rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                      {merchantNumber ? (
                        <span className="block font-semibold text-foreground">Send Money: {merchantNumber}</span>
                      ) : null}
                      {p.instructions ? <span className="block whitespace-pre-line">{p.instructions}</span> : null}
                    </div>
                  ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order Notes */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              Order notes <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Special delivery instructions…"
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
            />
          </div>
          </div>

          {/* Right column: Order Summary + Confirm */}
          <div className="space-y-4 mt-6 lg:mt-0 lg:sticky lg:top-24">
          {/* Order Summary */}
          <div className="glass-card rounded-2xl p-4 sm:p-5">
            <h2 className="text-base font-semibold text-foreground mb-1">Order Summary</h2>
            <div className="premium-divider mb-4" />

            {appliedProductOffers.filter(ao => ao.freeItems.length > 0 || ao.discountAmount > 0).length > 0 && (
              <div className="space-y-1.5 mb-3">
                {appliedProductOffers.filter(ao => ao.freeItems.length > 0 || ao.discountAmount > 0).map((ao) => (
                  <div key={`${ao.offerId}-${ao.offerType}`} className="bg-gradient-to-r from-[hsl(var(--gift-bg))] to-[hsl(var(--gift-bg)/0.4)] border border-[hsl(var(--gift-border))] rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                    <GiftIcon size={11} className="text-[hsl(var(--gift-accent))] flex-shrink-0" />
                    <span className="text-[10px] text-[hsl(var(--gift-text))]"><span className="font-bold">🎉</span> {ao.displayText}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-3 mb-5">
              {items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  <img src={resolveImageSrc(item.image, 400)} alt={item.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground line-clamp-1">{item.name}</p>
                    <p className="text-xs text-muted-foreground">Qty: {toBanglaDigits(item.quantity)}{item.variant ? ` · ${item.variant}` : ""}</p>
                  </div>
                  <span className="text-sm font-medium text-foreground">{CURRENCY_SYMBOL}{toBanglaDigits((item.price * item.quantity).toFixed(0))}</span>
                </div>
              ))}

              {appliedProductOffers.filter((ao) => ao.freeItems.length > 0).flatMap((ao) =>
                ao.freeItems.map((freeItem) => (
                  <div key={`free-${ao.offerId}-${freeItem.productId}`} className="flex gap-3 bg-gradient-to-r from-[hsl(var(--gift-bg))] to-[hsl(var(--gift-bg)/0.3)] rounded-lg p-2 border border-[hsl(var(--gift-border))] relative">
                     <div className="absolute -top-1.5 -right-1.5 bg-[hsl(var(--gift-accent))] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                       <GiftIcon size={8} /> Free
                    </div>
                    <img src={resolveImageSrc(productImages[freeItem.productId], 400) || "/placeholder.svg"} alt={freeItem.productName} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 opacity-90" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-1">{freeItem.productName}</p>
                      <p className="text-[10px] text-muted-foreground">🎁 Qty: {toBanglaDigits(freeItem.quantity)}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-muted-foreground line-through">{CURRENCY_SYMBOL}{toBanglaDigits(((productPrices[freeItem.productId] ?? 0) * freeItem.quantity).toFixed(0))}</span>
                      <span className="text-sm font-bold text-[hsl(var(--gift-accent))]">{CURRENCY_SYMBOL}0</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {appliedProductOffers.length > 0 && (
              <div className="border-t border-border pt-4 mb-4 space-y-2">
                {appliedProductOffers.map((offer) => (
                  <div key={`${offer.offerId}-${offer.offerType}`} className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <GiftIcon size={12} className="mt-0.5 text-foreground" />
                    <span>{offer.displayText}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border pt-4 mb-4">
              {appliedCoupon ? (
                 <div className="flex items-center justify-between bg-accent/50 rounded-lg px-3 py-2">
                   <div className="flex items-center gap-2">
                     <TagIcon size={14} className="text-accent-foreground" />
                     <span className="text-sm font-medium text-accent-foreground">{appliedCoupon.code}</span>
                   </div>
                   <button type="button" onClick={() => setAppliedCoupon(null)} className="text-muted-foreground hover:text-foreground"><XIcon size={14} /></button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Coupon code"
                    className="text-sm"
                  />
                  <button
                    type="button"
                    onClick={applyCoupon}
                    disabled={couponLoading}
                    className="px-4 py-2 bg-foreground text-background rounded-md text-sm font-medium hover:bg-foreground/90 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    {couponLoading ? "..." : "Apply"}
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border pt-4 mb-5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="text-foreground font-medium">{CURRENCY_SYMBOL}{toBanglaDigits(subtotal.toFixed(0))}</span>
              </div>
              {productOfferDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Offer discount</span>
                  <span className="text-foreground font-medium">-{CURRENCY_SYMBOL}{toBanglaDigits(productOfferDiscount.toFixed(0))}</span>
                </div>
              )}
              {couponDiscount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Coupon discount</span>
                  <span className="text-foreground font-medium">-{CURRENCY_SYMBOL}{toBanglaDigits(couponDiscount.toFixed(0))}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Delivery</span>
                {shippingCost === 0 ? (
                   <span className="inline-flex items-center gap-1 text-[hsl(var(--shipping-accent))] font-semibold text-xs">
                     <TruckIcon size={11} /> Free
                  </span>
                ) : (
                  <span className="text-foreground font-medium">{CURRENCY_SYMBOL}{toBanglaDigits(shippingCost)}</span>
                )}
              </div>
              <div className="border-t border-border pt-3 flex justify-between">
                <span className="text-sm font-semibold text-foreground">Total</span>
                <span className="text-lg font-semibold text-foreground">{CURRENCY_SYMBOL}{toBanglaDigits(total.toFixed(0))}</span>
              </div>
            </div>
          </div>

          {/* Confirm Order */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-primary text-primary-foreground py-4 rounded-[2px] text-sm font-semibold hover:bg-primary/90 transition-all duration-200 disabled:opacity-50 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.35)]"
            >
              {submitting ? "Placing order…" : "Place Order"}
            </button>
            <div className="flex items-center justify-center gap-1.5 mt-3">
              <ShieldCheckIcon size={13} className="text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {(payOptions?.methods ?? PAYMENT_METHODS).find((p) => p.id === paymentMethod)?.label} • Secure checkout
              </span>
            </div>
          </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Checkout;
