import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAdminCoupons, adminKeys } from "@/hooks/useAdminData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, X, Pencil, Copy, Tag } from "lucide-react";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { PageHeader, StatusPill } from "@/components/admin/ui";

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number | null;
  max_uses: number | null;
  used_count: number;
  enabled: boolean;
  expires_at: string | null;
  created_at: string;
}

type FormState = {
  code: string;
  discount_type: string;
  discount_value: number;
  min_order_amount: number;
  max_uses: string;
  expires_at: string;
};

const emptyForm: FormState = {
  code: "", discount_type: "percentage", discount_value: 10,
  min_order_amount: 0, max_uses: "", expires_at: "",
};

const CouponManager = () => {
  const { data: couponsData, isLoading: loading } = useAdminCoupons();
  const coupons = (couponsData ?? []) as Coupon[];
  const qc = useQueryClient();
  const [view, setView] = useState<"list" | "add" | "edit">("list");
  const [editId, setEditId] = useState<string | null>(null);
  const [originalExpiresAt, setOriginalExpiresAt] = useState<string>("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { toast } = useToast();

  const validate = (): boolean => {
    if (!form.code.trim()) {
      toast({ title: "Coupon code is required", variant: "destructive" }); return false;
    }
    if (form.code.trim().length < 3) {
      toast({ title: "Code must be at least 3 characters", variant: "destructive" }); return false;
    }
    if (!Number.isFinite(form.discount_value) || form.discount_value <= 0) {
      toast({ title: "Discount value must be greater than 0", variant: "destructive" }); return false;
    }
    if (form.discount_type === "percentage" && form.discount_value > 100) {
      toast({ title: "Percentage discount cannot exceed 100%", variant: "destructive" }); return false;
    }
    if (form.max_uses && parseInt(form.max_uses) <= 0) {
      toast({ title: "Max uses must be a positive number", variant: "destructive" }); return false;
    }
    // Only block past-dated expiries if the user actually changed the value.
    // Otherwise editing an already-expired coupon (e.g. to bump max_uses) is impossible.
    if (form.expires_at && form.expires_at !== originalExpiresAt && new Date(form.expires_at) < new Date()) {
      toast({ title: "Expiry date must be in the future", variant: "destructive" }); return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);

    const payload = {
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      min_order_amount: form.min_order_amount || 0,
      max_uses: form.max_uses ? parseInt(form.max_uses) : null,
      expires_at: form.expires_at || null,
    };

    let error;
    if (view === "edit" && editId) {
      ({ error } = await supabase.from("coupons").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("coupons").insert(payload));
    }

    setSaving(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: view === "edit" ? "Coupon updated" : "Coupon created" });
      resetForm();
      qc.invalidateQueries({ queryKey: adminKeys.coupons });
    }
  };

  const resetForm = () => {
    setView("list");
    setEditId(null);
    setOriginalExpiresAt("");
    setForm(emptyForm);
  };

  const startEdit = (c: Coupon) => {
    setEditId(c.id);
    const expiresLocal = c.expires_at ? c.expires_at.slice(0, 16) : "";
    setOriginalExpiresAt(expiresLocal);
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_order_amount: c.min_order_amount ?? 0,
      max_uses: c.max_uses ? String(c.max_uses) : "",
      expires_at: expiresLocal,
    });
    setView("edit");
  };

  const duplicateCoupon = (c: Coupon) => {
    setForm({
      code: c.code + "_COPY",
      discount_type: c.discount_type,
      discount_value: c.discount_value,
      min_order_amount: c.min_order_amount ?? 0,
      max_uses: c.max_uses ? String(c.max_uses) : "",
      expires_at: "",
    });
    setView("add");
  };

  const toggleEnabled = async (id: string, enabled: boolean) => {
    const prev = qc.getQueryData(adminKeys.coupons);
    // Optimistic
    qc.setQueryData(adminKeys.coupons, (old: any[]) => old?.map((c) => c.id === id ? { ...c, enabled } : c));
    const { error } = await supabase.from("coupons").update({ enabled }).eq("id", id);
    if (error) {
      qc.setQueryData(adminKeys.coupons, prev);
      toast({ title: "Failed to update coupon", description: error.message, variant: "destructive" });
    }
  };

  const confirmDeleteCoupon = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    const prev = qc.getQueryData(adminKeys.coupons);
    // Optimistic
    qc.setQueryData(adminKeys.coupons, (old: any[]) => old?.filter((c) => c.id !== id));
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (error) {
      qc.setQueryData(adminKeys.coupons, prev);
      toast({ title: "Failed to delete coupon", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Coupon deleted" });
    }
  };

  const getCouponStatus = (c: Coupon): { label: string; tone: "neutral" | "success" | "warning" | "danger" } => {
    if (!c.enabled) return { label: "Disabled", tone: "neutral" };
    if (c.expires_at && new Date(c.expires_at) < new Date()) return { label: "Expired", tone: "danger" };
    if (c.max_uses && c.used_count >= c.max_uses) return { label: "Limit reached", tone: "danger" };
    return { label: "Active", tone: "success" };
  };

  // Stats
  const activeCoupons = coupons.filter(c => {
    if (!c.enabled) return false;
    if (c.expires_at && new Date(c.expires_at) < new Date()) return false;
    if (c.max_uses && c.used_count >= c.max_uses) return false;
    return true;
  }).length;
  const totalUsed = coupons.reduce((sum, c) => sum + c.used_count, 0);

  if (view === "add" || view === "edit") {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-foreground">{view === "edit" ? "Edit Coupon" : "Create Coupon"}</h1>
          <Button variant="ghost" size="sm" onClick={resetForm}><X size={16} className="mr-1" /> Cancel</Button>
        </div>
        <div className="grid gap-5 max-w-lg">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Coupon Code *</label>
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. SAVE20" className="font-mono" />
            <p className="text-xs text-muted-foreground mt-1">Customers enter this code at checkout</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Discount Type</label>
              <Select value={form.discount_type} onValueChange={(v) => setForm({ ...form, discount_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed Amount ({CURRENCY_SYMBOL})</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Value {form.discount_type === "percentage" ? "(%)" : `(${CURRENCY_SYMBOL})`}
              </label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.discount_value}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setForm({ ...form, discount_value: Number.isFinite(v) ? v : 0 });
                }}
                min={1}
                max={form.discount_type === "percentage" ? 100 : undefined}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Min Order ({CURRENCY_SYMBOL})</label>
              <Input type="number" inputMode="decimal" value={form.min_order_amount} onChange={(e) => { const v = parseFloat(e.target.value); setForm({ ...form, min_order_amount: Number.isFinite(v) ? v : 0 }); }} min={0} />
              <p className="text-xs text-muted-foreground mt-1">0 = no minimum</p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Max Uses</label>
              <Input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: e.target.value })} placeholder="Unlimited" min={1} />
              <p className="text-xs text-muted-foreground mt-1">Empty = unlimited</p>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Expires At</label>
            <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
            <p className="text-xs text-muted-foreground mt-1">Leave empty for no expiry</p>
          </div>

          {/* Preview */}
          <div className="bg-secondary/50 rounded-xl p-4 border border-border">
            <p className="text-xs font-medium text-muted-foreground mb-2">Preview</p>
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-foreground" />
              <span className="font-mono font-semibold text-foreground">{form.code || "CODE"}</span>
              <span className="text-sm text-muted-foreground">—</span>
              <span className="text-sm text-foreground">
                {form.discount_type === "percentage" ? `${form.discount_value}% off` : `${CURRENCY_SYMBOL}${form.discount_value} off`}
              </span>
            </div>
            {form.min_order_amount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">on orders above {CURRENCY_SYMBOL}{form.min_order_amount}</p>
            )}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : view === "edit" ? "Update Coupon" : "Create Coupon"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Coupons"
        subtitle={`${coupons.length} total · ${activeCoupons} active · ${totalUsed} redemptions`}
        actions={
          <Button size="sm" onClick={() => setView("add")}><Plus size={14} className="mr-1" /> New</Button>
        }
      />


      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-background rounded-xl border border-border p-4">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-3 w-56" />
            </div>
          ))}
        </div>
      ) : coupons.length === 0 ? (
        <div className="text-center py-12 bg-background rounded-xl border border-border">
          <Tag size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No coupons yet. Create your first coupon to start offering discounts.</p>
          <Button size="sm" onClick={() => setView("add")}><Plus size={14} className="mr-1" /> Create Coupon</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {coupons.map((c) => {
            const status = getCouponStatus(c);
            return (
              <div key={c.id} className="bg-background rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold text-foreground font-mono">{c.code}</span>
                      <StatusPill tone={status.tone} className="text-[10px]">{status.label}</StatusPill>
                      <span className="text-xs text-muted-foreground">
                        {c.discount_type === "percentage" ? `${c.discount_value}% off` : `${CURRENCY_SYMBOL}${c.discount_value} off`}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                      {(c.min_order_amount ?? 0) > 0 && <span>Min: {CURRENCY_SYMBOL}{c.min_order_amount}</span>}
                      <span>Used: {c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</span>
                      {c.expires_at && (
                        <span className={new Date(c.expires_at) < new Date() ? "text-destructive" : ""}>
                          {new Date(c.expires_at) < new Date() ? "Expired" : "Expires"}: {new Date(c.expires_at).toLocaleDateString()}
                        </span>
                      )}
                      <span>Created: {new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch checked={c.enabled} onCheckedChange={(v) => toggleEnabled(c.id, v)} aria-label={`${c.enabled ? "Disable" : "Enable"} coupon ${c.code}`} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => startEdit(c)} aria-label={`Edit coupon ${c.code}`}>
                      <Pencil size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => duplicateCoupon(c)} aria-label={`Duplicate coupon ${c.code}`}>
                      <Copy size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setPendingDeleteId(c.id)} aria-label={`Delete coupon ${c.code}`}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(o) => !o && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this coupon?</AlertDialogTitle>
            <AlertDialogDescription>
              This is permanent. Customers will no longer be able to redeem this code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteCoupon} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default CouponManager;
