// Client-side incomplete-order recovery.
// Inserts a real order from an incomplete cart, decrements stock per line
// (variant-aware), marks the incomplete row as recovered, and best-effort
// pushes to the active courier when payment is COD.

import { uuid } from "@/lib/uuid";
import { supabase } from "@/integrations/supabase/client";

export type RecoverItem = {
  product_id: string;
  id?: string;
  name: string;
  variant_id?: string | null;
  variant?: string | null;
  price: number;
  quantity: number;
  sku?: string;
  image?: string;
};

export type RecoverPayload = {
  incompleteId: string;
  sessionPhone: string; // 11-digit BD phone from incomplete_orders.phone
  customer: {
    name: string;
    phone: string; // 11 digits
    email?: string | null;
    address?: string | null;
    city?: string | null; // zone label
  };
  shippingAddress: Record<string, unknown>;
  items: RecoverItem[];
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  couponCode?: string | null;
  notes?: string | null;
};

export type RecoverResult = {
  orderId: string;
  orderNumber: string;
  alreadyRecovered: boolean;
};

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  bank: "Bank Transfer",
};

export async function recoverIncompleteOrderClient(p: RecoverPayload): Promise<RecoverResult> {
  // 1. Re-check freshness — avoid double recovery.
  const { data: row, error: rowErr } = await supabase
    .from("incomplete_orders")
    .select("id, recovered, converted_order_id, session_id, phone")
    .eq("id", p.incompleteId)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!row) throw new Error("Incomplete order not found");
  if (row.recovered && row.converted_order_id) {
    const { data: existing } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("id", row.converted_order_id)
      .maybeSingle();
    if (existing) {
      return { orderId: existing.id, orderNumber: existing.order_number, alreadyRecovered: true };
    }
  }

  // 2. Generate order number.
  const { data: orderNumberRpc, error: numErr } = await supabase.rpc("next_order_number");
  if (numErr || !orderNumberRpc) throw numErr ?? new Error("Could not generate order number");
  const orderNumber = orderNumberRpc as string;
  const orderId = uuid();

  // 3. Insert order.
  const orderItems = p.items.map((it) => ({
    product_id: it.product_id,
    id: it.product_id,
    name: it.name,
    variant_id: it.variant_id ?? null,
    variant: it.variant ?? null,
    price: Number(it.price) || 0,
    quantity: Number(it.quantity) || 1,
    sku: it.sku ?? "",
    image: it.image ?? "",
  }));
  const paymentLabel = PAYMENT_LABEL[p.paymentMethod] ?? p.paymentMethod;
  const composedNotes = [
    `Payment: ${paymentLabel}`,
    `Recovered from incomplete cart ${p.incompleteId.slice(0, 8)}`,
    p.notes || "",
  ].filter(Boolean).join("\n");

  const { data: order, error: insertErr } = await supabase
    .from("orders")
    .insert({
      id: orderId,
      order_number: orderNumber,
      customer_name: p.customer.name || "Customer",
      customer_email: p.customer.email ?? null,
      customer_phone: p.customer.phone,
      customer_address: p.customer.address ?? null,
      customer_city: p.customer.city ?? null,
      shipping_address: p.shippingAddress as any,
      items: orderItems as any,
      subtotal: p.subtotal,
      shipping_cost: p.shippingCost,
      discount_amount: p.discountAmount,
      coupon_code: p.couponCode ?? null,
      total: p.total,
      payment_method: p.paymentMethod,
      payment_status: "pending",
      order_status: "pending",
      notes: composedNotes,
    })
    .select("id, order_number")
    .single();
  if (insertErr) throw insertErr;

  // 4. Decrement stock per line (variant-aware).
  await Promise.all(
    p.items.map((it) =>
      it.variant_id
        ? supabase.rpc("decrement_variant_stock", { _variant_id: it.variant_id, _quantity: it.quantity })
        : supabase.rpc("decrement_product_stock", { _product_id: it.product_id, _quantity: it.quantity }),
    ),
  );

  // 5. Coupon usage (best effort).
  if (p.couponCode) {
    supabase.rpc("increment_coupon_usage", { _code: p.couponCode }).then(() => {}, () => {});
  }

  // 6. Upsert customer record (best effort).
  await supabase.rpc("upsert_checkout_customer", {
    _name: p.customer.name || "Customer",
    _email: p.customer.email ?? null,
    _phone: p.customer.phone,
    _order_total: p.total,
    _address: p.customer.address ?? null,
    _city: p.customer.city ?? null,
  }).then(() => {}, () => {});

  // 7. Mark incomplete order as recovered.
  await supabase.rpc("mark_incomplete_order_recovered", {
    _session_id: row.session_id ?? "",
    _phone: row.phone ?? p.sessionPhone,
    _order_id: order.id,
  });

  // 8. Optional courier push for COD.
  if (p.paymentMethod === "cod") {
    supabase.functions
      .invoke("steadfast-proxy", { body: { action: "create_order", orderId: order.id } })
      .catch((e) => console.warn("Courier auto-push failed:", e));
  }

  return { orderId: order.id, orderNumber: order.order_number, alreadyRecovered: false };
}
