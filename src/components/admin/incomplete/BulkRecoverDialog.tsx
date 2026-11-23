import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { toast } from "sonner";
import { recoverIncompleteOrderClient, type RecoverItem } from "@/lib/recoverIncompleteOrder";
import type { IncompleteRow } from "./RecoveryDialog";

interface Props {
  rows: IncompleteRow[];
  open: boolean;
  onClose: () => void;
}

const num = (v: any, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

const BulkRecoverDialog = ({ rows, open, onClose }: Props) => {
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);

  const eligible = rows.filter((r) => !r.recovered);

  const [failures, setFailures] = useState<{ name: string; phone: string; reason: string }[]>([]);

  const run = async () => {
    setRunning(true);
    setProgress(0);
    setFailures([]);
    const localFailures: { name: string; phone: string; reason: string }[] = [];
    let ok = 0, fail = 0;
    for (const r of eligible) {
      try {
        const items: RecoverItem[] = (Array.isArray(r.cart_items) ? r.cart_items : []).map((it: any) => ({
          product_id: it.product_id ?? it.id,
          name: it.name ?? "Item",
          variant_id: it.variant_id ?? null,
          variant: it.variant ?? null,
          price: num(it.sale_price ?? it.price),
          quantity: Math.max(1, num(it.quantity, 1)),
          sku: it.sku ?? "",
          image: it.image ?? "",
        })).filter((it) => it.product_id);

        if (items.length === 0) {
          fail++;
          localFailures.push({ name: r.customer_name || "Unnamed", phone: r.phone || "—", reason: "Cart had no valid items" });
          setProgress((p) => p + 1);
          continue;
        }

        const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
        const shipping = num(r.delivery_charge);
        const total = Math.max(0, subtotal + shipping);
        const addr = r.address ?? {};
        const zoneLabel = addr.delivery_zone ?? addr.zone ?? null;
        const flatAddr = [addr.line1 || addr.address || addr.street, addr.city].filter(Boolean).join(", ");

        await recoverIncompleteOrderClient({
          incompleteId: r.id,
          sessionPhone: r.phone,
          customer: {
            name: r.customer_name || "Customer",
            phone: (r.phone || "").replace(/\D/g, ""),
            email: r.email,
            address: flatAddr || null,
            city: zoneLabel,
          },
          shippingAddress: { country: "Bangladesh", line1: flatAddr || null, delivery_zone: zoneLabel },
          items,
          subtotal,
          shippingCost: shipping,
          discountAmount: 0,
          total,
          paymentMethod: r.payment_method || "cod",
          couponCode: r.coupon ?? null,
          notes: "Bulk recovery",
        });
        ok++;
      } catch (err: any) {
        fail++;
        localFailures.push({
          name: r.customer_name || "Unnamed",
          phone: r.phone || "—",
          reason: err?.message || "Unknown error",
        });
      }
      setProgress((p) => p + 1);
    }
    setRunning(false);
    setFailures(localFailures);
    if (fail === 0) {
      toast.success(`Recovered ${ok}`);
    } else {
      toast.error(`Recovered ${ok}, ${fail} failed`, {
        description: localFailures[0]?.reason?.slice(0, 120),
      });
    }
    qc.invalidateQueries({ queryKey: ["admin", "incomplete-orders"] });
    qc.invalidateQueries({ queryKey: ["admin", "orders"] });
    if (fail === 0) onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk recover {eligible.length} cart{eligible.length === 1 ? "" : "s"}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Each cart will be converted into a real order using its current customer, items, and shipping values.
          Stock will be decremented and an admin notification will fire per order.
        </p>
        <div className="max-h-60 overflow-y-auto border border-border/60 rounded-lg divide-y divide-border/40">
          {eligible.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-2.5 text-sm">
              <span className="truncate">{r.customer_name || "Unnamed"} · {r.phone}</span>
              <span className="tabular-nums text-muted-foreground">{CURRENCY_SYMBOL}{Math.round(Number(r.total ?? 0))}</span>
            </div>
          ))}
        </div>
        {running && (
          <p className="text-xs text-muted-foreground">Processing {progress} / {eligible.length}…</p>
        )}
        {!running && failures.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 max-h-48 overflow-y-auto">
            <p className="text-xs font-semibold text-destructive mb-1.5">{failures.length} failed</p>
            <ul className="space-y-1 text-[12px] text-destructive/90">
              {failures.map((f, idx) => (
                <li key={idx} className="leading-tight">
                  <span className="font-medium">{f.name} · {f.phone}</span>
                  <span className="block text-destructive/70">{f.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
          <Button onClick={run} disabled={running || eligible.length === 0}>
            {running ? "Recovering…" : `Recover ${eligible.length}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BulkRecoverDialog;
