import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircleIcon } from "@/components/ui/icons";
import { trackPurchase } from "@/lib/trackingEvents";
import { useDocumentMeta } from "@/hooks/useDocumentMeta";
import { supabase } from "@/integrations/supabase/client";

/**
 * Purchase tracking is gated by a multi-layer verification chain so a hand-crafted
 * `/order-confirmation?order=...&total=...` URL cannot trigger a fake conversion:
 *
 *   1. Session binding   — `sessionStorage.last_order_number` must match the URL
 *                          order. Set only by Checkout after a successful insert,
 *                          and confined to the originating tab.
 *   2. Server validation — `get_order_for_purchase_tracking` RPC confirms the
 *                          order row actually exists, is not cancelled, not
 *                          soft-deleted, was created within the last 24h, and
 *                          that the stored `total` matches the URL total.
 *   3. Idempotency       — `trackPurchase()` uses a deterministic event_id
 *                          (`purchase_<order>`) plus a localStorage lock, and
 *                          `meta-capi` rejects a second `delivered` send for
 *                          the same event_id server-side.
 *
 * Result: an attacker with a fabricated URL cannot fire a Purchase event on any
 * machine other than their own browser tab they already populated, and even
 * there only for a real, recent, uncancelled order matching the exact total.
 */
const OrderConfirmation = () => {
  const [params] = useSearchParams();
  const orderNumber = params.get("order") || "N/A";
  const total = Number(params.get("total") || 0);
  const [verified, setVerified] = useState<"pending" | "ok" | "blocked">("pending");

  useDocumentMeta({
    title: "Order Confirmed — Kovo",
    description: "Thank you for shopping with Kovo. Your order has been received.",
    canonicalPath: "/order-confirmation",
    noindex: true,
  });

  useEffect(() => {
    // Order confirmed → pixel confetti flourish.
    import("@/components/ambient/pixelFx/api").then((m) => m.pixelFx.confetti());
  }, []);

  useEffect(() => {
    let cancelled = false;

    const verifyAndTrack = async () => {
      if (orderNumber === "N/A" || !(total > 0)) {
        if (!cancelled) setVerified("blocked");
        return;
      }

      // Layer 1: session binding — this tab must be the one that placed the order.
      let sessionOrder: string | null = null;
      let sessionTotal: number | null = null;
      try {
        sessionOrder = sessionStorage.getItem("last_order_number");
        const t = sessionStorage.getItem("last_order_total");
        sessionTotal = t ? Number(t) : null;
      } catch {}
      if (sessionOrder !== orderNumber || sessionTotal === null || Math.abs(sessionTotal - total) > 0.01) {
        if (!cancelled) setVerified("blocked");
        return;
      }

      // Layer 2: server validation — order must exist, be live, recent, and total must match.
      const { data, error } = await supabase.rpc("get_order_for_purchase_tracking" as any, {
        p_order_number: orderNumber,
      });
      const row: any = Array.isArray(data) ? data[0] : data;
      if (error || !row) {
        if (!cancelled) setVerified("blocked");
        return;
      }
      if (row.is_deleted || row.is_cancelled) {
        if (!cancelled) setVerified("blocked");
        return;
      }
      if (Math.abs(Number(row.total) - total) > 0.01) {
        if (!cancelled) setVerified("blocked");
        return;
      }
      const ageHours = (Date.now() - new Date(row.created_at).getTime()) / 36e5;
      if (!Number.isFinite(ageHours) || ageHours > 24 || ageHours < -0.1) {
        if (!cancelled) setVerified("blocked");
        return;
      }

      // All checks passed — pull tracking context and fire Purchase.
      let items: { id: string; name: string; price: number; quantity: number }[] | undefined;
      let userData: any | undefined;
      try {
        const stored = sessionStorage.getItem("last_order_items");
        if (stored) { items = JSON.parse(stored); sessionStorage.removeItem("last_order_items"); }
        const u = sessionStorage.getItem("last_order_user");
        if (u) { userData = JSON.parse(u); sessionStorage.removeItem("last_order_user"); }
        // Clear the binding so a refresh-after-clear can't re-arm tracking.
        sessionStorage.removeItem("last_order_number");
        sessionStorage.removeItem("last_order_total");
      } catch {}

      if (cancelled) return;
      trackPurchase({ orderNumber, total: Number(row.total), items, userData });
      setVerified("ok");
    };

    verifyAndTrack();
    return () => { cancelled = true; };
  }, [orderNumber, total]);

  // `verified` is intentionally not surfaced in the UI — a successful order
  // confirmation should look identical whether or not analytics fired.
  void verified;

  return (
    <div className="section-padding py-12 sm:py-16 text-center page-enter">
      <div className="fade-up">
        <div className="w-20 h-20 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-6 animate-float">
          <CheckCircleIcon className="w-10 h-10 text-primary" />
        </div>
        <h1 className="apple-heading-md text-foreground mb-3">Order placed successfully!</h1>
        <p className="apple-body mb-2">Thank you for your order.</p>
        <p className="text-sm text-muted-foreground mb-8">
          Your order number is <strong className="text-foreground">{orderNumber}</strong>. We'll contact you shortly to confirm.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to={`/track-order?order=${orderNumber}`}
            className="inline-flex items-center justify-center border border-primary/30 text-foreground px-8 py-4 rounded-full text-sm font-medium hover:bg-primary/5 hover:border-primary/50 transition-all duration-200"
          >
            Track Order
          </Link>
          <Link
            to="/shop"
            className="inline-flex items-center justify-center bg-primary text-primary-foreground px-8 py-4 rounded-[2px] text-sm font-semibold hover:bg-primary/90 transition-all duration-200 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.35)]"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
