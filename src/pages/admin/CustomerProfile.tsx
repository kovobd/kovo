import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/admin/ui";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { adminKeys } from "@/hooks/useAdminData";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Phone, ShoppingBag, Bell, Clock, History,
  CheckCircle2, Repeat, Pencil,
} from "lucide-react";

const normPhone = (p: string) => (p || "").replace(/\D/g, "");
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
const fmtMonthYear = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "—";
const fmtDT = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};
const fmtMoney = (n: number) => `${CURRENCY_SYMBOL}${Number(n || 0).toLocaleString()}`;

const STATUS_TONE: Record<string, any> = {
  pending: "warning", called: "info", purchased_again: "success",
  no_response: "warning", not_interested: "danger", follow_up: "info",
  interested: "info", do_not_remind: "danger", superseded: "neutral",
  manually_closed: "neutral",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", called: "Called", purchased_again: "Purchased again",
  no_response: "No response", not_interested: "Not interested",
  follow_up: "Follow up", interested: "Interested",
  do_not_remind: "Do not remind", superseded: "Superseded",
  manually_closed: "Closed",
};

// ── Split queries for progressive loading ──────────────────────────────
export const customerQueryKeys = {
  profile: (digits: string) => ["admin", "crm-customer", "profile", digits] as const,
  orders: (digits: string) => ["admin", "crm-customer", "orders", digits] as const,
  reminders: (digits: string) => ["admin", "crm-customer", "reminders", digits] as const,
};

export const customerQueryFns = {
  profile: async (digits: string) => {
    const { data } = await supabase
      .from("crm_customers" as any)
      .select("*")
      .eq("phone", digits)
      .maybeSingle();
    return data as any;
  },
  orders: async (digits: string) => {
    const { data } = await supabase
      .from("orders")
      .select("id,order_number,customer_name,customer_address,customer_city,shipping_address,total,order_status,payment_status,items,created_at,notes")
      .ilike("customer_phone", `%${digits.slice(-10)}%`)
      .order("created_at", { ascending: false })
      .limit(200);
    return (data ?? []) as any[];
  },
  reminders: async (digits: string) => {
    const { data } = await supabase
      .from("product_reminders" as any)
      .select("id,product_name_snapshot,status,due_date,next_action_date,follow_up_date,call_notes,notes_timeline,conversion_source,last_contacted_at,called_at,completed_at,resolved_at,reorder_amount,reorder_order_id,order_number,purchase_date,created_at,updated_at")
      .eq("customer_phone", digits)
      .order("created_at", { ascending: false })
      .limit(500);
    return (data ?? []) as any[];
  },
};

const STALE = 60_000;

function useCustomerProfile(digits: string) {
  return useQuery({
    queryKey: customerQueryKeys.profile(digits),
    enabled: !!digits,
    queryFn: () => customerQueryFns.profile(digits),
    staleTime: STALE,
  });
}
function useCustomerOrders(digits: string) {
  return useQuery({
    queryKey: customerQueryKeys.orders(digits),
    enabled: !!digits,
    queryFn: () => customerQueryFns.orders(digits),
    staleTime: STALE,
  });
}
function useCustomerReminders(digits: string) {
  return useQuery({
    queryKey: customerQueryKeys.reminders(digits),
    enabled: !!digits,
    queryFn: () => customerQueryFns.reminders(digits),
    staleTime: STALE,
  });
}

// ── Compact KPI card (rectangular, low height) ─────────────────────────
const Kpi = ({
  icon: Icon, label, value, tone,
}: { icon: any; label: string; value: React.ReactNode; tone?: "success" | "warn" | "info" | "violet" }) => (
  <div className="bg-background border border-border/60 rounded-[4px] px-2.5 py-2 transition-colors hover:border-border">
    <div className="flex items-center gap-1 mb-0.5">
      <Icon size={11} className={cn(
        "shrink-0",
        tone === "success" ? "text-green-600" :
        tone === "warn" ? "text-amber-600" :
        tone === "info" ? "text-blue-600" :
        tone === "violet" ? "text-violet-600" :
        "text-muted-foreground/70",
      )} />
      <span className="text-[9px] sm:text-[10px] uppercase tracking-wide font-medium text-muted-foreground/70 truncate">{label}</span>
    </div>
    <p className="text-base sm:text-xl font-semibold text-foreground tabular-nums leading-tight">{value}</p>
  </div>
);

const InfoRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="grid grid-cols-[120px_1fr] gap-2 py-1 text-[12.5px]">
    <span className="text-muted-foreground/80">{label}</span>
    <span className="text-foreground">{value || "—"}</span>
  </div>
);

const CustomerProfile = () => {
  const { phone = "" } = useParams<{ phone: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const digits = normPhone(phone);

  const profileQ = useCustomerProfile(digits);
  const ordersQ = useCustomerOrders(digits);
  const remindersQ = useCustomerReminders(digits);

  // Fetch editable customer row (customers table) — separate from analytics view.
  const customerRowQ = useQuery({
    queryKey: ["admin", "customer-row", digits],
    enabled: !!digits,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select("id,name,email,phone,address,city")
        .eq("phone", digits)
        .maybeSingle();
      return data as any;
    },
    staleTime: 60_000,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", email: "", phone: "", address: "", city: "" });
  const [saving, setSaving] = useState(false);


  const profile = profileQ.data;
  const orders = ordersQ.data ?? [];
  const reminders = remindersQ.data ?? [];

  const name =
    profile?.latest_name ||
    orders[0]?.customer_name ||
    "Customer";

  // Derive delivery zone + address from most recent order
  const deliveryInfo = useMemo(() => {
    const o = orders[0];
    if (!o) return { zone: "—", address: "—" };
    const sa = (o.shipping_address as any) ?? {};
    const zone = sa.delivery_zone || "—";
    const parts = [
      sa.line1 || o.customer_address,
      sa.landmark,
      sa.district,
      sa.city || o.customer_city,
    ].filter(Boolean);
    return { zone, address: parts.length ? parts.join(", ") : "—" };
  }, [orders]);

  const metrics = useMemo(() => {
    const openCount = reminders.filter((r: any) =>
      ["pending", "called", "no_response", "follow_up", "interested"].includes(r.status)
    ).length;
    const activeFollowUps = reminders.filter((r: any) =>
      r.status === "follow_up" || r.status === "no_response"
    ).length;
    const totalFollowUps = reminders.filter((r: any) =>
      ["follow_up", "no_response", "not_interested", "do_not_remind", "purchased_again", "manually_closed"].includes(r.status)
    ).length;
    const won = reminders.filter((r: any) => r.status === "purchased_again").length;
    return { openCount, activeFollowUps, totalFollowUps, won };
  }, [reminders]);

  const timeline = useMemo(() => {
    const events: { at: string; label: string; note?: string | null; icon: any }[] = [];
    orders.forEach((o: any) =>
      events.push({ at: o.created_at, label: `Order placed · #${o.order_number} · ${fmtMoney(Number(o.total))}`, icon: ShoppingBag })
    );
    reminders.forEach((r: any) => {
      if (r.created_at) events.push({ at: r.created_at, label: `Reminder created · ${r.product_name_snapshot || "Product"}`, icon: Bell });
      (Array.isArray(r.notes_timeline) ? r.notes_timeline : []).forEach((t: any) => {
        events.push({ at: t.at, label: `${t.action} · ${r.product_name_snapshot || "Product"}`, note: t.note, icon: Clock });
      });
      if (r.status === "purchased_again" && r.completed_at && !(r.notes_timeline ?? []).length) {
        events.push({ at: r.completed_at, label: `Reorder converted · ${fmtMoney(Number(r.reorder_amount || 0))}`, icon: Repeat });
      }
    });
    return events.filter((e) => e.at).sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [orders, reminders]);

  const followUps = useMemo(
    () => reminders.filter((r: any) => r.status === "follow_up" || r.status === "no_response"),
    [reminders]
  );

  const totalOrders = profile?.total_orders ?? orders.length;
  const ltv = Number(profile?.lifetime_value || 0);

  // Seed edit form when opening dialog or when underlying data arrives.
  const openEdit = () => {
    const row = customerRowQ.data;
    const sa: any = orders[0]?.shipping_address ?? {};
    setEditForm({
      name: row?.name || name || "",
      email: row?.email || profile?.email || "",
      phone: row?.phone || digits || "",
      address: row?.address || sa.line1 || orders[0]?.customer_address || "",
      city: row?.city || sa.city || orders[0]?.customer_city || "",
    });
    setEditOpen(true);
  };

  const saveCustomer = async () => {
    if (!editForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: editForm.name.trim(),
        email: editForm.email.trim() || null,
        phone: editForm.phone.replace(/\D/g, "") || "",
        address: editForm.address.trim() || null,
        city: editForm.city.trim() || null,
      };
      let error: any = null;
      if (customerRowQ.data?.id) {
        ({ error } = await supabase.from("customers").update(payload).eq("id", customerRowQ.data.id));
      } else {
        ({ error } = await supabase.from("customers").insert(payload));
      }
      if (error) throw error;
      toast({ title: "Customer updated" });
      setEditOpen(false);
      qc.invalidateQueries({ queryKey: ["admin", "customer-row", digits] });
      qc.invalidateQueries({ queryKey: customerQueryKeys.profile(digits) });
      qc.invalidateQueries({ queryKey: adminKeys.customers });
      // If phone digits changed, navigate to new url.
      const newDigits = payload.phone;
      if (newDigits && newDigits !== digits) {
        navigate(`/admin/customers/${encodeURIComponent(newDigits)}`, { replace: true });
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl pb-10 space-y-3">
      {/* Header: name + nav, then compact meta + address */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-[18px] sm:text-[20px] font-semibold text-foreground truncate leading-tight min-w-0">{name}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={() => navigate(-1)}>
              <ArrowLeft size={13} className="mr-1.5" /> Back
            </Button>
            <Button variant="outline" size="sm" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={openEdit}>
              <Pencil size={13} className="mr-1.5" /> Edit
            </Button>
            <Button size="sm" className="h-9 px-3 rounded-[4px] text-[12px]" onClick={() => window.open(`tel:${phone}`)}>
              <Phone size={13} className="mr-1.5" /> Call
            </Button>
          </div>
        </div>

        {ordersQ.isLoading || profileQ.isLoading ? (
          <>
            <Skeleton className="h-3.5 w-80 rounded-[3px]" />
            <Skeleton className="h-3.5 w-96 rounded-[3px]" />
          </>
        ) : (
          <>
            <div className="text-[12.5px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span className="tabular-nums text-foreground">{phone}</span>
              <span className="text-muted-foreground/50">•</span>
              <span>{deliveryInfo.zone}</span>
              <span className="text-muted-foreground/50">•</span>
              <span>Customer since {fmtMonthYear(profile?.first_order_at)}</span>
            </div>
            {deliveryInfo.address && deliveryInfo.address !== "—" && (
              <div className="text-[12.5px] text-muted-foreground break-words">{deliveryInfo.address}</div>
            )}
          </>
        )}
      </div>


      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {profileQ.isLoading && ordersQ.isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-[4px]" />)
        ) : (
          <>
            <Kpi icon={ShoppingBag} label="Total orders" value={totalOrders} />
            <Kpi icon={CheckCircle2} label="Lifetime value" value={fmtMoney(ltv)} />
            <Kpi icon={Repeat} tone="success" label="Reorders won" value={remindersQ.isLoading ? "—" : metrics.won} />
            <Kpi icon={Bell} tone="warn" label="Open reminders" value={remindersQ.isLoading ? "—" : metrics.openCount} />
            <Kpi icon={Clock} tone="info" label="Active follow-ups" value={remindersQ.isLoading ? "—" : metrics.activeFollowUps} />
            <Kpi icon={History} tone="violet" label="Total follow-ups" value={remindersQ.isLoading ? "—" : metrics.totalFollowUps} />
          </>
        )}
      </div>

      {/* History tabs */}
      <Tabs defaultValue="orders" className="mt-1">
        <TabsList className="bg-transparent rounded-none h-auto p-0 gap-1 justify-start flex-wrap">
          {[
            { v: "orders", label: "Orders", count: ordersQ.isLoading ? null : orders.length },
            { v: "reminders", label: "Reminders", count: remindersQ.isLoading ? null : reminders.length },
            { v: "followups", label: "Follow-ups", count: remindersQ.isLoading ? null : followUps.length },
            { v: "timeline", label: "Timeline", count: null },
          ].map((t) => (
            <TabsTrigger
              key={t.v}
              value={t.v}
              className="h-9 px-3 text-[12px] font-medium rounded-[4px] border border-border bg-background text-muted-foreground data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground hover:text-foreground transition-colors"
            >
              <span className="leading-none">{t.label}</span>
              {t.count !== null && (
                <span className="ml-1.5 text-[11px] tabular-nums opacity-70">{t.count}</span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Orders */}
        <TabsContent value="orders" className="mt-3">
          {ordersQ.isLoading ? (
            <TableSkeleton cols={5} />
          ) : orders.length === 0 ? (
            <EmptyBox icon={ShoppingBag} text="No orders" />
          ) : (
            <div className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "38%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead className="bg-muted/60 border-b-2 border-border">
                  <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                    <th className="px-3 py-2 !text-center">Order</th>
                    <th className="px-3 py-2 !text-center">Date</th>
                    <th className="px-3 py-2 !text-center">Items</th>
                    <th className="px-3 py-2 !text-center">Status</th>
                    <th className="px-3 py-2 !text-center">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => {
                    const items: any[] = Array.isArray(o.items) ? o.items : [];
                    const first = items[0];
                    const label = items.length === 0 ? "—"
                      : items.length === 1 ? (first?.name || "—")
                      : `${first?.name || "Item"} +${items.length - 1} more`;
                    return (
                      <tr key={o.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/40">
                        <td className="px-3 py-1.5 text-center text-[12px] font-medium">
                          <Link to={`/admin/orders?q=${o.order_number}`} className="hover:underline">#{o.order_number}</Link>
                        </td>
                        <td className="px-3 py-1.5 text-center text-[12px] tabular-nums">{fmtDate(o.created_at)}</td>
                        <td className="px-3 py-1.5 text-center text-[12px] truncate">{label}</td>
                        <td className="px-3 py-1.5 text-center">
                          <StatusPill tone={o.order_status === "delivered" ? "success" : o.order_status === "cancelled" ? "danger" : "warning"}>
                            {o.order_status}
                          </StatusPill>
                        </td>
                        <td className="px-3 py-1.5 text-center text-[12px] tabular-nums font-medium">{fmtMoney(Number(o.total))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Reminders */}
        <TabsContent value="reminders" className="mt-3">
          {remindersQ.isLoading ? (
            <TableSkeleton cols={6} />
          ) : reminders.length === 0 ? (
            <EmptyBox icon={Bell} text="No reminders" />
          ) : (
            <div className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
              <table className="w-full text-sm table-fixed">
                <colgroup>
                  <col style={{ width: "26%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                </colgroup>
                <thead className="bg-muted/60 border-b-2 border-border">
                  <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground">
                    <th className="px-3 py-2 !text-center">Product</th>
                    <th className="px-3 py-2 !text-center">Due / Next</th>
                    <th className="px-3 py-2 !text-center">Status</th>
                    <th className="px-3 py-2 !text-center">Last contacted</th>
                    <th className="px-3 py-2 !text-center">Source</th>
                    <th className="px-3 py-2 !text-center">Reorder</th>
                  </tr>
                </thead>
                <tbody>
                  {reminders.map((r: any) => {
                    const src = r.conversion_source === "manual_crm" ? "Manual CRM"
                      : r.conversion_source === "website" ? "Website"
                      : r.conversion_source === "pos" ? "POS" : "—";
                    return (
                      <tr key={r.id} className="border-b border-border/40 last:border-b-0 hover:bg-muted/40">
                        <td className="px-3 py-1.5 text-center text-[12px] truncate">{r.product_name_snapshot || "—"}</td>
                        <td className="px-3 py-1.5 text-center text-[12px] tabular-nums">{fmtDate(r.next_action_date || r.follow_up_date || r.due_date)}</td>
                        <td className="px-3 py-1.5 text-center">
                          <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status] ?? r.status}</StatusPill>
                        </td>
                        <td className="px-3 py-1.5 text-center text-[12px] tabular-nums">{fmtDate(r.last_contacted_at || r.called_at)}</td>
                        <td className="px-3 py-1.5 text-center text-[12px]">
                          {r.conversion_source ? <StatusPill tone={r.conversion_source === "manual_crm" ? "success" : "info"}>{src}</StatusPill> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-1.5 text-center text-[12px] tabular-nums">{r.reorder_amount ? fmtMoney(Number(r.reorder_amount)) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Follow-ups */}
        <TabsContent value="followups" className="mt-3">
          {remindersQ.isLoading ? (
            <TableSkeleton cols={3} />
          ) : followUps.length === 0 ? (
            <EmptyBox icon={Clock} text="No follow-ups" />
          ) : (
            <div className="bg-background border border-border/60 rounded-[4px] divide-y divide-border/40">
              {followUps.map((r: any) => (
                <div key={r.id} className="px-3 py-2 flex items-center gap-3">
                  <Clock size={13} className="text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium truncate">{r.product_name_snapshot || "Product"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Scheduled {fmtDate(r.next_action_date || r.follow_up_date)} · Called {fmtDate(r.called_at)}
                      {r.call_notes && <> · {r.call_notes}</>}
                    </div>
                  </div>
                  <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{STATUS_LABEL[r.status]}</StatusPill>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="mt-3">
          {ordersQ.isLoading || remindersQ.isLoading ? (
            <TableSkeleton cols={2} />
          ) : timeline.length === 0 ? (
            <EmptyBox icon={History} text="No activity yet" />
          ) : (
            <div className="bg-background border border-border/60 rounded-[4px] divide-y divide-border/40">
              {timeline.map((t, i) => (
                <div key={i} className="px-3 py-2 text-[12px]">
                  <div className="flex items-center gap-3">
                    <t.icon size={12} className="text-muted-foreground shrink-0" />
                    <span className="flex-1 truncate">{t.label}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0 text-[11px]">{fmtDT(t.at)}</span>
                  </div>
                  {t.note && <div className="mt-1 ml-[24px] text-[11px] italic text-muted-foreground">"{t.note}"</div>}
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit customer dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-[480px] rounded-[6px]">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Name</label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="h-9 mt-1 rounded-[4px]" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Phone</label>
                <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="h-9 mt-1 rounded-[4px] tabular-nums" inputMode="tel" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">City</label>
                <Input value={editForm.city} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} className="h-9 mt-1 rounded-[4px]" />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Email</label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="h-9 mt-1 rounded-[4px]" />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Address</label>
              <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} className="h-9 mt-1 rounded-[4px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-9 rounded-[4px]" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button size="sm" className="h-9 rounded-[4px]" onClick={saveCustomer} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const TableSkeleton = ({ cols = 4 }: { cols?: number }) => (
  <div className="bg-background border border-border/60 rounded-[4px] overflow-hidden">
    <div className="bg-muted/60 border-b-2 border-border h-8" />
    <div className="divide-y divide-border/40">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="grid gap-3 px-3 py-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {Array.from({ length: cols }).map((__, j) => <Skeleton key={j} className="h-4 rounded-[3px]" />)}
        </div>
      ))}
    </div>
  </div>
);

const EmptyBox = ({ icon: Icon, text }: { icon: any; text: string }) => (
  <div className="bg-background border border-border/60 rounded-[4px] p-8 text-center">
    <Icon className="mx-auto text-muted-foreground/40 mb-2" size={22} />
    <p className="text-[12px] text-muted-foreground">{text}</p>
  </div>
);

export default CustomerProfile;
