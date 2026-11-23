import { useMemo, useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CURRENCY_SYMBOL } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/cdnImage";
import { Label } from "@/components/ui/label";
import { PageHeader, Section, EmptyState, StatusPill, Toolbar } from "@/components/admin/ui";
import StatCard from "@/components/admin/ui/StatCard";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Phone, CheckCircle2, X, Clock, Ban, Bell, AlertTriangle, TrendingUp,
  DollarSign, Download, PhoneCall, History, Plus, Minus,
  Repeat, Lock, Calendar, Eye, SlidersHorizontal, Trash2, CalendarDays,
  CalendarClock, ShoppingBag, User, Copy, Check, Package, ArrowUpDown, Search,
  Tag,
} from "lucide-react";
import OrderEditorDialog from "@/components/admin/orders/OrderEditorDialog";

type ReminderStatus =
  | "pending" | "called" | "purchased_again" | "no_response"
  | "not_interested" | "follow_up" | "interested" | "do_not_remind"
  | "superseded" | "manually_closed";

type Priority = "low" | "medium" | "high";

type TimelineEntry = { at: string; action: string; note?: string | null; status?: string | null };

interface ReminderRow {
  id: string;
  product_id: string | null;
  product_name_snapshot: string | null;
  order_id: string | null;
  order_number: string | null;
  customer_id: string | null;
  customer_phone: string;
  customer_name: string | null;
  customer_email: string | null;
  reminder_days: number;
  purchase_date: string;
  due_date: string;
  status: ReminderStatus;
  priority: Priority;
  notes: string | null;
  call_notes: string | null;
  follow_up_date: string | null;
  next_action_date: string | null;
  expected_purchase_date: string | null;
  called_at: string | null;
  resolved_at: string | null;
  completed_at: string | null;
  last_contacted_at: string | null;
  notes_timeline: TimelineEntry[] | null;
  conversion_source: string | null;
  reorder_order_id: string | null;
  reorder_amount: number | null;
  reorder_order_number?: string | null;
  created_at: string;
  updated_at: string;
}

const REMINDER_COLS = "id,product_id,product_name_snapshot,order_id,order_number,customer_id,customer_phone,customer_name,customer_email,reminder_days,purchase_date,due_date,status,priority,notes,call_notes,follow_up_date,next_action_date,expected_purchase_date,called_at,resolved_at,completed_at,last_contacted_at,notes_timeline,conversion_source,reorder_order_id,reorder_amount,created_at,updated_at";

// Append a new entry to a reminder's notes timeline (history, never overwritten)
const appendTimeline = (existing: TimelineEntry[] | null | undefined, entry: Omit<TimelineEntry, "at"> & { at?: string }): TimelineEntry[] => {
  const list = Array.isArray(existing) ? [...existing] : [];
  list.push({ at: entry.at || new Date().toISOString(), action: entry.action, note: entry.note ?? null, status: entry.status ?? null });
  return list;
};

const STATUS_LABEL: Record<ReminderStatus, string> = {
  pending: "Pending", called: "Called", purchased_again: "Purchased again",
  no_response: "No response", not_interested: "Not interested",
  follow_up: "Follow up", interested: "Interested",
  do_not_remind: "Do not remind", superseded: "Superseded",
  manually_closed: "Manually closed",
};
const STATUS_TONE: Record<ReminderStatus, any> = {
  pending: "warning", called: "info", purchased_again: "success",
  no_response: "neutral", not_interested: "danger", follow_up: "info",
  interested: "info", do_not_remind: "danger", superseded: "neutral",
  manually_closed: "neutral",
};
const PRIORITY_TONE: Record<Priority, any> = { high: "danger", medium: "warning", low: "neutral" };
const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

// Reminders that should still appear in active workflow (not closed)
const OPEN_STATUSES: ReminderStatus[] = ["pending", "called", "no_response", "follow_up", "interested"];
// Closed = reminder successfully converted via Create Same Order (purchased_again only).
const CLOSED_STATUSES: ReminderStatus[] = ["purchased_again"];


const toLocalISO = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const todayISO = () => toLocalISO(new Date());
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const addDaysISO = (n: number) => toLocalISO(addDays(new Date(), n));
const daysBetween = (a: string, b: string) => Math.floor((new Date(a).getTime() - new Date(b).getTime()) / 86400000);
// Standard Sales Pipeline date format: "20 Jun 26"
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const mon = d.toLocaleString("en-US", { month: "short" });
  const yr = String(d.getFullYear()).slice(-2);
  return `${day} ${mon} ${yr}`;
};
const fmtMoney = (n: number) => `${CURRENCY_SYMBOL}${Number(n || 0).toLocaleString()}`;
const normPhone = (p: string) => (p || "").replace(/\D/g, "");

// Date a row should be measured against (next-action-date semantics)
const refDateFor = (r: ReminderRow): string => {
  if (r.status === "follow_up" || r.status === "no_response")
    return r.next_action_date || r.follow_up_date || r.due_date;
  if (r.status === "interested") return r.expected_purchase_date || r.due_date;
  return r.due_date;
};
const lastContactOf = (r: ReminderRow): string | null =>
  r.last_contacted_at?.slice(0, 10) || r.called_at?.slice(0, 10) || null;

const reminderKeys = {
  all: ["admin", "reminders"] as const,
  page: (args: Record<string, any>) => ["admin", "reminders", "page", args] as const,
  counts: (args: Record<string, any>) => ["admin", "reminders", "counts", args] as const,
  metrics: (today: string) => ["admin", "reminders", "metrics", today] as const,
  products: ["admin", "reminders", "enabled-products"] as const,
};

type RemindersPageArgs = {
  tab: string;
  search: string;
  productId: string | "all";
  sortBy: string;
  today: string;
};

type RemindersPageResult = { rows: ReminderRow[]; total: number; page: number; page_size: number };

function useRemindersPage(args: RemindersPageArgs, page: number, pageSize: number) {
  return useQuery({
    queryKey: reminderKeys.page({ ...args, page, pageSize }),
    queryFn: async (): Promise<RemindersPageResult> => {
      const { data, error } = await (supabase.rpc as any)("get_admin_reminders_page", {
        _tab: args.tab,
        _page: page,
        _page_size: pageSize,
        _today: args.today,
        _search: args.search?.trim() ? args.search.trim() : null,
        _product_id: args.productId && args.productId !== "all" ? args.productId : null,
        _sort: args.sortBy || "due_date",
      });
      if (error) throw error;
      const d = (data as any) || {};
      return {
        rows: Array.isArray(d.rows) ? (d.rows as ReminderRow[]) : [],
        total: Number(d.total ?? 0),
        page: Number(d.page ?? page),
        page_size: Number(d.page_size ?? pageSize),
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

function useRemindersTabCounts(today: string, search: string, productId: string | "all") {
  return useQuery({
    queryKey: reminderKeys.counts({ today, search, productId }),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_admin_reminder_tab_counts", {
        _today: today,
        _search: search?.trim() ? search.trim() : null,
        _product_id: productId && productId !== "all" ? productId : null,
      });
      if (error) throw error;
      const d: any = data || {};
      return {
        today: Number(d.today ?? 0),
        missed: Number(d.missed ?? 0),
        noResponse: Number(d.noResponse ?? 0),
        followUp: Number(d.followUp ?? 0),
        notInterested: Number(d.notInterested ?? 0),
        doNotRemind: Number(d.doNotRemind ?? 0),
        upcoming: Number(d.upcoming ?? 0),
        closed: Number(d.closed ?? 0),
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

function useRemindersMetrics(today: string) {
  return useQuery({
    queryKey: reminderKeys.metrics(today),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_admin_reminder_metrics", { _today: today });
      if (error) throw error;
      const d: any = data || {};
      return {
        todayCount: Number(d.todayCount ?? 0),
        missedCount: Number(d.missedCount ?? 0),
        upcomingCount: Number(d.upcomingCount ?? 0),
        completed: Number(d.completed ?? 0),
        conversion: Number(d.conversion ?? 0),
        revenue: Number(d.revenue ?? 0),
        avgReorder: Number(d.avgReorder ?? 0),
      };
    },
    staleTime: 60_000,
  });
}

// Fetch every row matching the given filters by paging through the page RPC.
// Used for CSV export so a 25-row UI page doesn't truncate the file.
async function fetchAllReminders(args: RemindersPageArgs): Promise<ReminderRow[]> {
  const BATCH = 200;
  const out: ReminderRow[] = [];
  let page = 1;
  while (page <= 25) { // safety cap: 25 × 200 = 5000 rows
    const { data, error } = await (supabase.rpc as any)("get_admin_reminders_page", {
      _tab: args.tab,
      _page: page,
      _page_size: BATCH,
      _today: args.today,
      _search: args.search?.trim() ? args.search.trim() : null,
      _product_id: args.productId && args.productId !== "all" ? args.productId : null,
      _sort: args.sortBy || "due_date",
    });
    if (error) throw error;
    const d: any = data || {};
    const batch: ReminderRow[] = Array.isArray(d.rows) ? d.rows : [];
    out.push(...batch);
    const total = Number(d.total ?? out.length);
    if (out.length >= total || batch.length < BATCH) break;
    page++;
  }
  return out;
}

function useReminderProductIds() {
  return useQuery({
    queryKey: reminderKeys.products,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id,name,reminder_days,reminder_enabled")
        .eq("reminder_enabled", true)
        .order("name", { ascending: true })
        .limit(5000);
      const ids = new Set<string>();
      const daysMap: Record<string, number> = {};
      const nameMap: Record<string, string> = {};
      (data ?? []).forEach((p: any) => {
        ids.add(p.id);
        if (p.reminder_days) daysMap[p.id] = Number(p.reminder_days);
        if (p.name) nameMap[p.id] = p.name;
      });
      return { ids, daysMap, nameMap };
    },
    staleTime: 5 * 60_000,
  });
}


function useRecentOrders() {
  return useQuery({
    queryKey: ["admin", "reminders", "recent-orders"],
    queryFn: async () => {
      const from = addDays(new Date(), -100).toISOString();
      const { data } = await supabase
        .from("orders")
        .select("id,order_number,customer_name,customer_phone,total,items,created_at,order_status")
        .gte("created_at", from)
        .order("created_at", { ascending: false })
        .limit(1000);
      return data ?? [];
    },
    staleTime: 60_000,
  });
}


// Pull customer aggregates for sorting / Missed tab columns
function useCustomerAggregates(phones: string[]) {
  const key = useMemo(() => [...new Set(phones)].sort().join(","), [phones]);
  return useQuery({
    queryKey: ["admin", "reminders", "cust-aggs", key],
    enabled: phones.length > 0,
    queryFn: async () => {
      const list = [...new Set(phones)].filter(Boolean);
      const { data } = await supabase.from("customers")
        .select("phone,total_orders,total_spent")
        .in("phone", list);
      const map: Record<string, { total_orders: number; total_spent: number }> = {};
      (data ?? []).forEach((c: any) => {
        map[normPhone(c.phone)] = {
          total_orders: Number(c.total_orders) || 0,
          total_spent: Number(c.total_spent) || 0,
        };
      });
      return map;
    },
    staleTime: 60_000,
  });
}

// Live catalog snapshot for the products referenced by reminders. Reminders
// store only product_id; everything displayed (name, image, price, stock,
// status) comes from this map so renames or restocks always reflect.
type LiveProduct = {
  id: string;
  name: string;
  image: string | null;
  price: number;
  stock: number;
  active: boolean;
  hasVariants: boolean;
  variantsActive: number;
};

function useProductLiveMap(productIds: string[]) {
  const key = useMemo(() => [...new Set(productIds)].sort().join(","), [productIds]);
  return useQuery({
    queryKey: ["admin", "reminders", "product-live", key],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const list = [...new Set(productIds)].filter(Boolean);
      const [{ data: prods }, { data: vars }, { data: media }] = await Promise.all([
        supabase.from("products").select("id,name,price,sale_price,stock,status").in("id", list),
        supabase.from("product_variants").select("product_id,price,sale_price,active,stock").in("product_id", list),
        supabase.from("product_media").select("product_id,image_url,sort_order,variant_id").in("product_id", list).order("sort_order"),
      ]);
      const firstImg: Record<string, string> = {};
      (media ?? []).forEach((m: any) => {
        if (m.variant_id || !m.product_id) return;
        if (!firstImg[m.product_id]) firstImg[m.product_id] = m.image_url;
      });
      const variantAgg: Record<string, { minPrice: number; stock: number; count: number }> = {};
      (vars ?? []).forEach((v: any) => {
        if (v.active === false) return;
        const sale = v.sale_price != null ? Number(v.sale_price) : null;
        const base = Number(v.price) || 0;
        const eff = sale && sale > 0 && sale < base ? sale : base;
        const agg = variantAgg[v.product_id] ?? { minPrice: 0, stock: 0, count: 0 };
        if (eff > 0 && (agg.minPrice === 0 || eff < agg.minPrice)) agg.minPrice = eff;
        agg.stock += Number(v.stock) || 0;
        agg.count += 1;
        variantAgg[v.product_id] = agg;
      });
      const map: Record<string, LiveProduct> = {};
      (prods ?? []).forEach((p: any) => {
        const sale = p.sale_price != null ? Number(p.sale_price) : null;
        const base = Number(p.price) || 0;
        const productEff = sale && sale > 0 && sale < base ? sale : base;
        const agg = variantAgg[p.id];
        const hasVariants = !!agg && agg.count > 0;
        map[p.id] = {
          id: p.id,
          name: p.name,
          image: firstImg[p.id] || null,
          price: productEff > 0 ? productEff : (agg?.minPrice ?? 0),
          stock: hasVariants ? agg.stock : (Number(p.stock) || 0),
          active: (p.status ?? "active") === "active",
          hasVariants,
          variantsActive: agg?.count ?? 0,
        };
      });
      return map;
    },
    staleTime: 60_000,
  });
}

// Back-compat: legacy hook used by other call sites — keeps the same shape.
function useProductPriceMap(productIds: string[]) {
  const q = useProductLiveMap(productIds);
  const data = useMemo(() => {
    const out: Record<string, number> = {};
    Object.values(q.data ?? {}).forEach((p) => { out[p.id] = p.price; });
    return out;
  }, [q.data]);
  return { ...q, data } as any;
}


function useUpdateReminder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<ReminderRow> }) => {
      const { error } = await supabase.from("product_reminders" as any).update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: reminderKeys.all }),
  });
}

// Map of reminder.id → exact line selling price (unit price of the reordered
// item from its source order, variant-aware). Falls back to undefined when
// the order/item is no longer resolvable, so callers can degrade to the
// product-level price map.
function useReminderLinePriceMap(rows: ReminderRow[]) {
  const pairs = useMemo(() => {
    const seen = new Set<string>();
    const out: { reminderId: string; orderId: string; productId: string | null; nameSnap: string | null }[] = [];
    for (const r of rows) {
      if (!r.order_id) continue;
      const k = `${r.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ reminderId: r.id, orderId: r.order_id, productId: r.product_id, nameSnap: r.product_name_snapshot });
    }
    return out;
  }, [rows]);
  const orderIds = useMemo(() => [...new Set(pairs.map((p) => p.orderId))].sort(), [pairs]);
  const key = orderIds.join(",");
  return useQuery({
    queryKey: ["admin", "reminders", "line-prices", key],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("id,items").in("id", orderIds);
      const itemsByOrder = new Map<string, any[]>();
      (data ?? []).forEach((o: any) => itemsByOrder.set(o.id, Array.isArray(o.items) ? o.items : []));
      const map: Record<string, number> = {};
      for (const p of pairs) {
        const items = itemsByOrder.get(p.orderId);
        if (!items) continue;
        const match = items.find((it: any) =>
          (p.productId && (it.product_id === p.productId || it.id === p.productId))
          || (p.nameSnap && it.name === p.nameSnap)
        );
        if (match && Number(match.price) > 0) map[p.reminderId] = Number(match.price);
      }
      return map;
    },
    staleTime: 5 * 60_000,
  });
}


function AdminField({ label, children, className, required }: { label: string; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={className}>
      <label className="text-[10.5px] font-semibold uppercase tracking-[0.08em] block mb-1.5" style={{ color: "hsl(var(--a-soft))" }}>
        {label}{required && <span style={{ color: "hsl(var(--a-danger))" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const AdminInput = (props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) => {
  const { className = "", style, ...rest } = props;
  return (
    <Input
      {...rest}
      className={`h-9 rounded-md text-[12.5px] ${className}`}
      style={{
        background: "hsl(var(--a-canvas-2))",
        borderColor: "hsl(var(--a-stroke))",
        color: "hsl(var(--a-ink))",
        ...(style as any),
      }}
    />
  );
};

const AdminTextarea = (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => {
  const { className = "", style, ...rest } = props;
  return (
    <Textarea
      {...rest}
      className={`resize-none rounded-md text-[13px] ${className}`}
      style={{
        background: "hsl(var(--a-canvas-2))",
        borderColor: "hsl(var(--a-stroke))",
        color: "hsl(var(--a-ink))",
        ...(style as any),
      }}
    />
  );
};

// ── Action dialog ───────────────────────────────────────
type PipelineTab =
  | "due_today" | "missed" | "upcoming"
  | "no_response" | "follow_up" | "not_interested"
  | "do_not_remind" | "closed" | "recent_purchases" | "deleted";

const tabFor = (r: ReminderRow): PipelineTab => {
  if (r.status === "purchased_again") return "recent_purchases";
  if (r.status === "manually_closed") return "closed";
  if (r.status === "do_not_remind") return "do_not_remind";
  if (r.status === "not_interested") return "not_interested";
  if (r.status === "follow_up") return "follow_up";
  if (r.status === "no_response") return "no_response";
  if (r.status === "superseded") return "deleted";
  const d = refDateFor(r);
  const t = todayISO();
  if (d === t) return "due_today";
  if (d < t) return "missed";
  return "upcoming";
};

const PIPELINE_BUTTONS: { value: PipelineTab; label: string; icon: any; destructive?: boolean }[] = [
  { value: "no_response",       label: "No Response",      icon: X },
  { value: "follow_up",         label: "Follow Up",        icon: Clock },
  { value: "not_interested",    label: "Not Interested",   icon: Ban },
  { value: "do_not_remind",     label: "Do Not Remind",    icon: Lock, destructive: true },
];

// Last purchase info hook
function useLastPurchase(reminder: ReminderRow | null) {
  return useQuery({
    queryKey: ["admin", "reminders", "last-purchase", reminder?.order_id ?? reminder?.id],
    enabled: !!reminder,
    queryFn: async () => {
      if (!reminder) return null;
      let orderRow: any = null;
      if (reminder.order_id) {
        const { data } = await supabase.from("orders")
          .select("id,order_number,items,total,created_at,order_status")
          .eq("id", reminder.order_id).maybeSingle();
        orderRow = data;
      }
      let line: { name: string; price: number; quantity: number } | null = null;
      if (orderRow && Array.isArray(orderRow.items)) {
        const match = orderRow.items.find((it: any) =>
          (reminder.product_id && (it.product_id === reminder.product_id || it.id === reminder.product_id))
          || (it.name && reminder.product_name_snapshot && it.name === reminder.product_name_snapshot)
        );
        if (match) line = { name: match.name, price: Number(match.price) || 0, quantity: Number(match.quantity) || 1 };
      }
      return { order: orderRow, line };
    },
    staleTime: 60_000,
  });
}

// Conversion (re-order) info hook — fetches the order created via "Create Same Order"
function useReorderOrder(reminder: ReminderRow | null) {
  return useQuery({
    queryKey: ["admin", "reminders", "reorder-order", reminder?.reorder_order_id],
    enabled: !!reminder?.reorder_order_id,
    queryFn: async () => {
      if (!reminder?.reorder_order_id) return null;
      const { data } = await supabase.from("orders")
        .select("id,order_number,total,created_at,order_status")
        .eq("id", reminder.reorder_order_id).maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });
}

function ActionDialog({
  reminder, open, onClose, onCreateOrder, forceFullPipeline,
}: {
  reminder: ReminderRow | null; open: boolean; onClose: () => void;
  onCreateOrder: (r: ReminderRow) => void;
  forceFullPipeline?: boolean;
}) {
  const { toast } = useToast();
  const update = useUpdateReminder();
  const [reminderDate, setReminderDate] = useState(todayISO());
  const [followUpDate, setFollowUpDate] = useState(addDaysISO(3));
  const [retryDate, setRetryDate] = useState(addDaysISO(2));
  const [callNote, setCallNote] = useState("");
  const [showFollowUpPicker, setShowFollowUpPicker] = useState(false);
  const [showRetryPicker, setShowRetryPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCreateOrder, setConfirmCreateOrder] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: lastPurchase } = useLastPurchase(reminder);

  useEffect(() => {
    if (reminder) {
      const isReactivating = reminder.status === "not_interested" || reminder.status === "do_not_remind";
      const editable = isReactivating
        ? addDaysISO(3)
        : (reminder.status === "no_response" || reminder.status === "follow_up"
            ? (reminder.next_action_date || reminder.follow_up_date || reminder.due_date)
            : reminder.due_date);
      setReminderDate(editable || todayISO());
      setFollowUpDate(reminder.next_action_date || reminder.follow_up_date || addDaysISO(3));
      setRetryDate(reminder.next_action_date || addDaysISO(2));
      setCallNote("");
      setShowFollowUpPicker(false);
      setShowRetryPicker(false);
      setConfirmDelete(false);
      setConfirmCreateOrder(false);
    }
  }, [reminder]);


  const { data: reorderOrder } = useReorderOrder(reminder);

  if (!reminder) return null;

  const isClosed = reminder.status === "purchased_again";
  const currentTab = tabFor(reminder);
  // Secondary tabs: simplified dialog (no status pipeline buttons, only date/create/delete).
  // When opened from the Due Today tab, always show the full pipeline regardless of current status.
  const isSecondary =
    !forceFullPipeline && (
      currentTab === "missed" ||
      currentTab === "no_response" ||
      currentTab === "follow_up" ||
      currentTab === "not_interested" ||
      currentTab === "do_not_remind"
    );
  const isSchedulingTab = !forceFullPipeline && (currentTab === "no_response" || currentTab === "follow_up");
  const currentEditableDate = isSchedulingTab
    ? (reminder.next_action_date || reminder.follow_up_date || reminder.due_date)
    : reminder.due_date;
  const dirtyDate = reminderDate !== currentEditableDate;
  const dateLabel =
    currentTab === "no_response" ? "Retry date"
    : currentTab === "follow_up" ? "Follow-up date"
    : "Reminder date";

  const saveReminderDate = async () => {
    if (!dirtyDate) return;
    setSaving(true);
    const stamp = new Date().toISOString();
    try {
      let patch: Partial<ReminderRow>;
      if (currentTab === "no_response") {
        // Keep status — reminder stays in No Response tab until retry date arrives.
        patch = {
          next_action_date: reminderDate,
          notes_timeline: appendTimeline(reminder.notes_timeline, {
            at: stamp,
            action: `Retry Date Changed · ${fmtDate(reminder.next_action_date)} → ${fmtDate(reminderDate)}`,
            status: "no_response",
          }),
        };
      } else if (currentTab === "follow_up") {
        // Keep status — reminder stays in Follow Up tab until follow-up date arrives.
        patch = {
          next_action_date: reminderDate,
          follow_up_date: reminderDate,
          notes_timeline: appendTimeline(reminder.notes_timeline, {
            at: stamp,
            action: `Follow-up Date Changed · ${fmtDate(reminder.next_action_date || reminder.follow_up_date)} → ${fmtDate(reminderDate)}`,
            status: "follow_up",
          }),
        };
      } else {
        // Active tabs OR not_interested / do_not_remind (reactivate): reset to pending.
        patch = {
          due_date: reminderDate,
          status: "pending",
          called_at: null,
          completed_at: null,
          resolved_at: null,
          next_action_date: null,
          follow_up_date: null,
          notes_timeline: appendTimeline(reminder.notes_timeline, {
            at: stamp,
            action: `Reminder Date Changed · ${fmtDate(reminder.due_date)} → ${fmtDate(reminderDate)}`,
            status: "pending",
          }),
        };
      }
      await update.mutateAsync({ id: reminder.id, patch });
      toast({ title: "Reminder date updated successfully", description: fmtDate(reminderDate) });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const applyPipelineTab = async (tab: PipelineTab) => {
    const stamp = new Date().toISOString();
    let patch: Partial<ReminderRow> = {};
    let msg = "";

    switch (tab) {
      case "no_response":
        // Mandatory retry date — open inline picker.
        setShowRetryPicker(true);
        setShowFollowUpPicker(false);
        return;
      case "follow_up":
        // Mandatory follow-up date — open inline picker.
        setShowFollowUpPicker(true);
        setShowRetryPicker(false);
        return;
      case "not_interested":
        patch = {
          status: "not_interested",
          completed_at: stamp,
          resolved_at: stamp,
          last_contacted_at: stamp,
          call_notes: callNote || null,
          notes_timeline: appendTimeline(reminder.notes_timeline, { at: stamp, action: "Not Interested", note: callNote || null, status: "not_interested" }),
        };
        msg = "Status updated successfully";
        break;
      case "do_not_remind":
        patch = {
          status: "do_not_remind",
          completed_at: stamp,
          resolved_at: stamp,
          last_contacted_at: stamp,
          call_notes: callNote || null,
          notes_timeline: appendTimeline(reminder.notes_timeline, { at: stamp, action: "Do Not Remind", note: callNote || null, status: "do_not_remind" }),
        };
        msg = "Status updated successfully";
        break;
      default:
        return;
    }

    setSaving(true);
    try {
      await update.mutateAsync({ id: reminder.id, patch });
      toast({ title: msg });
      setCallNote("");
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const saveRetry = async () => {
    if (!retryDate || retryDate < todayISO()) {
      toast({ title: "Retry date must be today or later", variant: "destructive" });
      return;
    }
    setSaving(true);
    const stamp = new Date().toISOString();
    try {
      await update.mutateAsync({
        id: reminder.id,
        patch: {
          status: "no_response",
          next_action_date: retryDate,
          called_at: reminder.called_at ?? stamp,
          last_contacted_at: stamp,
          call_notes: callNote || null,
          notes_timeline: appendTimeline(reminder.notes_timeline, { at: stamp, action: `No Response · retry ${fmtDate(retryDate)}`, note: callNote || null, status: "no_response" }),
        },
      });
      toast({ title: "Status updated successfully", description: `No Response · retry ${fmtDate(retryDate)}` });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };


  const saveFollowUp = async () => {
    if (!followUpDate || followUpDate < todayISO()) {
      toast({ title: "Follow-up date must be today or later", variant: "destructive" });
      return;
    }
    setSaving(true);
    const stamp = new Date().toISOString();
    try {
      await update.mutateAsync({
        id: reminder.id,
        patch: {
          status: "follow_up",
          follow_up_date: followUpDate,
          next_action_date: followUpDate,
          called_at: reminder.called_at ?? stamp,
          last_contacted_at: stamp,
          call_notes: callNote || null,
          notes_timeline: appendTimeline(reminder.notes_timeline, { at: stamp, action: `Follow Up · ${fmtDate(followUpDate)}`, note: callNote || null, status: "follow_up" }),
        },
      });
      toast({ title: "Status updated successfully", description: `Follow Up · ${fmtDate(followUpDate)}` });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };



  const doDelete = async () => {
    setSaving(true);
    const stamp = new Date().toISOString();
    try {
      // Soft-delete: mark superseded with resolved_at
      await update.mutateAsync({
        id: reminder.id,
        patch: {
          status: "superseded",
          resolved_at: stamp,
          completed_at: stamp,
          notes_timeline: appendTimeline(reminder.notes_timeline, { at: stamp, action: "Reminder Deleted", status: "superseded" }),
        },
      });
      toast({ title: "Reminder deleted" });
      onClose();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Build history timeline: merge persisted notes_timeline (CRM call log) with system events.
  // Chronology rule: the reminder is created at purchase time and scheduled for a future due date —
  // so "Reminder Created" uses purchase_date (not the DB created_at, which may differ if backfilled).
  const history: { date: string; label: string; note?: string | null; icon: any }[] = [];
  const createdStamp = reminder.purchase_date || reminder.created_at;
  if (reminder.purchase_date) {
    history.push({ date: reminder.purchase_date, label: `Order Placed${reminder.order_number ? ` · #${reminder.order_number}` : ""}`, icon: ShoppingBag });
  }
  if (createdStamp) {
    history.push({ date: createdStamp, label: `Reminder Created · due ${fmtDate(reminder.due_date)}`, icon: Bell });
  }
  (reminder.notes_timeline ?? []).forEach((t) => {
    const lower = t.action?.toLowerCase() || "";
    const icon = lower.includes("follow") ? Clock
      : lower.includes("no response") ? PhoneCall
      : lower.includes("not interested") ? Ban
      : lower.includes("do not remind") ? Lock
      : lower.includes("date changed") ? CalendarDays
      : lower.includes("deleted") ? Trash2
      : lower.includes("order") || lower.includes("reorder") || lower.includes("converted") ? Repeat
      : CheckCircle2;
    history.push({ date: t.at, label: t.action, note: t.note, icon });
  });
  if (reminder.reorder_order_id && reminder.reorder_amount && !(reminder.notes_timeline ?? []).some(t => /order/i.test(t.action))) {
    history.push({ date: reminder.resolved_at || reminder.updated_at, label: `Reminder Converted · ${fmtMoney(Number(reminder.reorder_amount))}`, icon: Repeat });
  }
  // Newest first
  history.sort((a, b) => (a.date < b.date ? 1 : -1));

  const fmtDateTime = (s: string | null) => {
    if (!s) return "—";
    const d = new Date(s);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now); yest.setDate(now.getDate() - 1);
    const isYest = d.toDateString() === yest.toDateString();
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (sameDay) return `Today · ${time}`;
    if (isYest) return `Yesterday · ${time}`;
    return `${String(d.getDate()).padStart(2, "0")} ${d.toLocaleString("en-US", { month: "short" })} ${String(d.getFullYear()).slice(-2)} · ${time}`;
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="admin-shell max-w-[540px] sm:max-w-[540px] rounded-[20px] max-h-[88vh] overflow-y-auto p-0 border-0 sm:rounded-[20px]"
        style={{
          background: "rgba(252,252,253,0.96)",
          backdropFilter: "saturate(180%) blur(28px)",
          WebkitBackdropFilter: "saturate(180%) blur(28px)",
          color: "#1d1d1f",
          boxShadow: "0 24px 64px -12px rgba(0,0,0,0.28), 0 0 0 0.5px rgba(0,0,0,0.06)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3" style={{ borderBottom: "0.5px solid rgba(0,0,0,0.08)" }}>
          <div className="flex items-center gap-2.5 flex-wrap pr-6">
            <DialogTitle className="text-[17px] font-semibold tracking-[-0.022em] truncate" style={{ color: "#1d1d1f" }}>
              {reminder.customer_name || "Customer"}
            </DialogTitle>
            <StatusPill tone={STATUS_TONE[reminder.status] || "neutral"}>{STATUS_LABEL[reminder.status] || reminder.status}</StatusPill>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]" style={{ color: "#86868b" }}>
            <span className="inline-flex items-center gap-1 tabular-nums"><Phone size={11} />{reminder.customer_phone}</span>
            <CopyButton value={reminder.customer_phone || ""} />
            {reminder.customer_email && (<><span>·</span><span className="truncate">{reminder.customer_email}</span></>)}
          </div>
        </DialogHeader>

        <div className="px-4 py-4 space-y-3.5">

          {/* Grouped snapshot — 2-column iOS-style inset list */}
          <section className="rounded-2xl overflow-hidden grid grid-cols-2"
            style={{ background: "rgba(255,255,255,0.6)", boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08)" }}>
            <AppleRow label="Product" value={reminder.product_name_snapshot || lastPurchase?.line?.name || "—"} divideRight />
            <AppleRow label="Price" value={lastPurchase?.line ? fmtMoney(lastPurchase.line.price * lastPurchase.line.quantity) : "—"} mono />
            <AppleRow label="Purchased" value={fmtDate(reminder.purchase_date)} mono divideRight />
            <AppleRow label="Re-order" value={fmtDate(refDateFor(reminder))} mono valueColor="#007aff" />
            <AppleRow label="Last contact" value={reminder.last_contacted_at ? fmtDate(reminder.last_contacted_at) : "Never"} mono last divideRight />
            <AppleRow label="Status" value={STATUS_LABEL[reminder.status] || "—"} last />
          </section>

          {/* Conversion info — closed (purchased again) reminders only */}
          {isClosed && (
            <section className="rounded-2xl overflow-hidden"
              style={{ background: "rgba(52,199,89,0.06)", boxShadow: "inset 0 0 0 0.5px rgba(52,199,89,0.25)" }}>
              <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                <CheckCircle2 size={14} style={{ color: "#34c759" }} />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "#1d8a3a" }}>
                  Conversion
                </span>
              </div>
              <div className="grid grid-cols-2">
                <AppleRow
                  label="Order ID"
                  value={reorderOrder?.order_number ? `#${reorderOrder.order_number}` : (reminder.reorder_order_id ? `#${reminder.reorder_order_id.slice(0, 8)}` : "—")}
                  mono divideRight
                />
                <AppleRow
                  label="Revenue Recovered"
                  value={reminder.reorder_amount ? fmtMoney(Number(reminder.reorder_amount)) : "—"}
                  mono valueColor="#1d8a3a"
                />
                <AppleRow
                  label="Original Reminder Date"
                  value={fmtDate(reminder.due_date)}
                  mono divideRight
                />
                <AppleRow
                  label="Last Scheduled Date"
                  value={fmtDate(reminder.next_action_date || reminder.follow_up_date || reminder.due_date)}
                  mono
                />
                <AppleRow
                  label="Conversion Date"
                  value={fmtDate(reminder.resolved_at || reminder.completed_at || reminder.updated_at)}
                  mono last
                />
              </div>
            </section>
          )}

          {/* CRM Summary — derived entirely from notes_timeline (single source of truth) */}
          {!isClosed && (() => {
            const tl = reminder.notes_timeline ?? [];
            const noRespCount = tl.filter((t) => /^no response/i.test(t.action || "")).length;
            const followUpCount = tl.filter((t) => /^follow up/i.test(t.action || "")).length;
            const lastContact = tl.length > 0 ? tl[tl.length - 1].at : reminder.last_contacted_at;
            const nextRetry = reminder.next_action_date;
            if (noRespCount === 0 && followUpCount === 0 && !lastContact && !nextRetry) return null;
            return (
              <section className="rounded-2xl overflow-hidden"
                style={{ background: "rgba(0,122,255,0.04)", boxShadow: "inset 0 0 0 0.5px rgba(0,122,255,0.18)" }}>
                <div className="px-4 pt-3 pb-2 flex items-center gap-2">
                  <PhoneCall size={14} style={{ color: "#007aff" }} />
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "#0a6fd8" }}>
                    CRM Summary
                  </span>
                </div>
                <div className="grid grid-cols-2">
                  <AppleRow label="Current Status" value={STATUS_LABEL[reminder.status] || "—"} divideRight />
                  <AppleRow label="Last Contacted" value={lastContact ? fmtDate(lastContact) : "Never"} mono />
                  <AppleRow label="No Response Count" value={String(noRespCount)} mono divideRight />
                  <AppleRow label="Follow Up Count" value={String(followUpCount)} mono />
                  <AppleRow label="Next Retry Date" value={nextRetry ? fmtDate(nextRetry) : "—"} mono last divideRight valueColor={nextRetry ? "#007aff" : undefined} />
                  <AppleRow label="Activity Events" value={String(tl.length)} mono last />
                </div>
              </section>
            );
          })()}

          {/* Reminder date */}
          {!isClosed && (
          <section className="rounded-2xl p-3.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{ background: "rgba(255,255,255,0.6)", boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08)" }}>
            <div className="flex items-center gap-2">
              <CalendarDays size={14} style={{ color: "#86868b" }} />
              <span className="text-[13px] font-medium" style={{ color: "#1d1d1f" }}>{dateLabel}</span>
            </div>
            <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
              <DatePill value={reminderDate} onChange={setReminderDate} min={isSchedulingTab ? todayISO() : undefined} />
              <Button
                type="button"
                size="sm"
                disabled={!dirtyDate || saving}
                onClick={saveReminderDate}
                className="h-8 px-3.5 rounded-lg text-[13px] font-medium disabled:opacity-40 transition-opacity"
                style={{ background: "#007aff", color: "white", border: "none" }}
              >
                Save
              </Button>
            </div>
          </section>
          )}

          {/* Update status — compact unified card */}
          {!isClosed && (
          <section
            className="rounded-2xl p-2.5"
            style={{ background: "rgba(255,255,255,0.6)", boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.08)" }}
          >
            {!isSecondary && (
            <div className="flex items-center justify-between gap-2 px-1 mb-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "#86868b" }}>
                Current status
              </span>
              <span
                className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium tracking-[-0.01em] pointer-events-none select-none"
                style={{
                  background: "rgba(52,199,89,0.10)",
                  color: "#1d8a3a",
                  boxShadow: "inset 0 0 0 1px rgba(52,199,89,0.35)",
                }}
                aria-label="Current status (read-only)"
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#34c759" }} />
                {STATUS_LABEL[reminder.status] || reminder.status}
              </span>
            </div>
            )}

            {!isSecondary && (() => {
              const changeOptions = PIPELINE_BUTTONS.filter((b) => b.value !== currentTab);
              if (changeOptions.length === 0) return null;
              return (
                <>
                  <div className="px-1 mb-1.5">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em]" style={{ color: "#86868b" }}>
                      Change status to
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {changeOptions.map((b) => {
                      const isDanger = b.destructive;
                      const accent = isDanger ? "#ff3b30" : "#1d1d1f";
                      return (
                        <button
                          key={b.value}
                          type="button"
                          disabled={saving}
                          onClick={() => applyPipelineTab(b.value)}
                          style={{
                            background: "rgba(255,255,255,0.85)",
                            color: "#1d1d1f",
                            boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.06)",
                          }}
                          className="group flex items-center justify-center gap-1.5 rounded-lg px-2.5 h-9 text-[12.5px] font-medium transition-all duration-150 hover:-translate-y-[1px] hover:shadow-sm disabled:opacity-50 disabled:hover:translate-y-0"
                        >
                          <b.icon size={12} style={{ opacity: 0.7, color: accent }} />
                          <span className="truncate tracking-[-0.01em]">{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              );
            })()}


            {(showFollowUpPicker || showRetryPicker) && (
              <div className="mt-2.5 p-3 rounded-xl space-y-3 sm:space-y-2"
                style={{ background: "rgba(0,122,255,0.06)", boxShadow: "inset 0 0 0 0.5px rgba(0,122,255,0.2)" }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <Clock size={13} style={{ color: "#007aff" }} />
                    <span className="text-[13px] font-medium" style={{ color: "#1d1d1f" }}>
                      {showRetryPicker ? "Retry date" : "Follow-up date"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
                    <DatePill
                      value={showRetryPicker ? retryDate : followUpDate}
                      onChange={(v) => showRetryPicker ? setRetryDate(v) : setFollowUpDate(v)}
                      min={todayISO()}
                    />
                    <div className="flex items-center gap-1.5">
                      <Button
                        disabled={
                          saving ||
                          (showRetryPicker ? !retryDate || retryDate < todayISO() : !followUpDate || followUpDate < todayISO())
                        }
                        onClick={showRetryPicker ? saveRetry : saveFollowUp}
                        className="h-8 px-3.5 text-[13px] rounded-lg disabled:opacity-40"
                        style={{ background: "#007aff", color: "white", border: "none" }}
                      >Schedule</Button>
                      <button
                        onClick={() => { setShowFollowUpPicker(false); setShowRetryPicker(false); setCallNote(""); }}
                        className="h-8 px-2 text-[13px]" style={{ color: "#007aff" }}
                      >Cancel</button>
                    </div>
                  </div>
                </div>
                <AdminTextarea
                  rows={2}
                  placeholder="Call notes (optional)"
                  value={callNote}
                  onChange={(e) => setCallNote(e.target.value)}
                  style={{ background: "rgba(255,255,255,0.8)", border: "none", borderRadius: "10px", fontSize: "13px" }}
                />
              </div>
            )}

            {!isSecondary && (
              <div className="my-2 h-px" style={{ background: "rgba(0,0,0,0.06)" }} />
            )}


            {/* Primary + danger actions */}
            <div className="flex items-stretch gap-2">
              {!confirmCreateOrder ? (
                <button
                  type="button"
                  onClick={() => setConfirmCreateOrder(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl h-11 sm:h-10 text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200 hover:-translate-y-[1px] active:translate-y-0"
                  style={{
                    background: "linear-gradient(180deg, #0a84ff 0%, #007aff 100%)",
                    color: "white",
                    boxShadow: "0 1px 2px rgba(0,122,255,0.4), 0 4px 12px -2px rgba(0,122,255,0.35), inset 0 0.5px 0 rgba(255,255,255,0.3)",
                  }}
                >
                  <Repeat size={14} /> Create same order
                </button>
              ) : (
                <div className="flex-1 flex items-center gap-1 px-1.5 rounded-xl h-11 sm:h-10"
                  style={{ background: "rgba(0,122,255,0.08)", boxShadow: "inset 0 0 0 0.5px rgba(0,122,255,0.25)" }}>
                  <button onClick={() => { setConfirmCreateOrder(false); onCreateOrder(reminder); }} className="h-8 sm:h-7 px-3 rounded-lg text-[13px] font-medium flex-1" style={{ background: "#007aff", color: "white" }}>Confirm</button>
                  <button onClick={() => setConfirmCreateOrder(false)} className="h-8 sm:h-7 px-2 text-[13px]" style={{ color: "#007aff" }}>Cancel</button>
                </div>
              )}
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  aria-label="Delete reminder"
                  title="Delete reminder"
                  className="flex items-center justify-center rounded-xl h-11 sm:h-10 w-11 sm:w-10 transition-all duration-200 hover:-translate-y-[1px]"
                  style={{
                    background: "rgba(255,255,255,0.85)",
                    boxShadow: "inset 0 0 0 0.5px rgba(255,59,48,0.25)",
                    color: "#ff3b30",
                  }}
                >
                  <Trash2 size={15} />
                </button>
              ) : (
                <div className="flex items-center gap-1 px-1.5 rounded-xl h-11 sm:h-10"
                  style={{ background: "rgba(255,59,48,0.08)", boxShadow: "inset 0 0 0 0.5px rgba(255,59,48,0.25)" }}>
                  <button disabled={saving} onClick={doDelete} className="h-8 sm:h-7 px-3 rounded-lg text-[13px] font-medium" style={{ background: "#ff3b30", color: "white" }}>Delete</button>
                  <button onClick={() => setConfirmDelete(false)} className="h-8 sm:h-7 px-2 text-[13px]" style={{ color: "#007aff" }}>Cancel</button>
                </div>
              )}
            </div>
          </section>
          )}

          {/* Activity timeline */}
          <section>
            <div className="flex items-center justify-between px-1 mb-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] inline-flex items-center gap-1.5" style={{ color: "#86868b" }}>
                <History size={11} /> Activity
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: "#86868b" }}>{history.length} {history.length === 1 ? "event" : "events"}</span>
            </div>
            {history.length === 0 ? (
              <div className="text-[13px] px-4 py-3 rounded-xl text-center" style={{ background: "rgba(0,0,0,0.025)", color: "#86868b" }}>No activity yet.</div>
            ) : (
              <ol className="relative pl-1">
                {/* vertical rail */}
                <span aria-hidden className="absolute left-[14px] top-2 bottom-2 w-px" style={{ background: "rgba(0,0,0,0.08)" }} />
                {history.map((h, i) => (
                  <li key={i} className="relative flex items-center gap-3 py-2 pr-1">
                    <div className="relative z-10 w-[28px] h-[28px] rounded-full flex items-center justify-center shrink-0"
                      style={{ background: "white", color: "#007aff", boxShadow: "0 0 0 0.5px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)" }}>
                      <h.icon size={12} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium truncate leading-none" style={{ color: "#1d1d1f" }}>{h.label}</span>
                        <span className="tabular-nums shrink-0 text-[11px]" style={{ color: "#a1a1a6" }}>{fmtDateTime(h.date)}</span>
                      </div>
                      {h.note && (
                        <div className="mt-1 text-[12.5px] leading-snug" style={{ color: "#6e6e73" }}>“{h.note}”</div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InfoTile({ label, value, mono, highlight }: { label: string; value: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="rounded-md px-3 py-2.5" style={{
      background: highlight ? "hsl(var(--a-highlight))" : "hsl(var(--a-surface))",
      border: `1px solid ${highlight ? "hsl(var(--a-stroke-strong))" : "hsl(var(--a-stroke))"}`,
    }}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: "hsl(var(--a-soft))" }}>{label}</div>
      <div className={`text-[13px] font-medium mt-1 truncate ${mono ? "tabular-nums" : ""}`} style={{ color: "hsl(var(--a-ink))" }} title={value}>
        {value}
      </div>
    </div>
  );
}

function DatePill({ value, onChange, min }: { value: string; onChange: (v: string) => void; min?: string }) {
  const [open, setOpen] = useState(false);
  const parsed = value ? new Date(value + "T00:00:00") : undefined;
  const display = parsed
    ? `${String(parsed.getDate()).padStart(2, "0")} ${parsed.toLocaleString("en-US", { month: "short" })} ${String(parsed.getFullYear()).slice(-2)}`
    : "Select date";
  const minDate = min ? new Date(min + "T00:00:00") : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="h-8 px-3 rounded-lg text-[13px] font-medium inline-flex items-center gap-1.5 transition-colors hover:bg-[rgba(120,120,128,0.18)]"
          style={{ background: "rgba(120,120,128,0.12)", color: "#1d1d1f" }}
        >
          <CalendarDays size={13} style={{ color: "#86868b" }} />
          <span className="tabular-nums">{display}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-auto p-0 rounded-xl border border-border/60 overflow-hidden bg-popover shadow-xl pointer-events-auto"
      >
        <CalendarPicker
          mode="single"
          selected={parsed}
          onSelect={(d) => {
            if (d) {
              const y = d.getFullYear();
              const m = String(d.getMonth() + 1).padStart(2, "0");
              const day = String(d.getDate()).padStart(2, "0");
              onChange(`${y}-${m}-${day}`);
              setOpen(false);
            }
          }}
          disabled={minDate ? { before: minDate } : undefined}
          initialFocus
          className="pointer-events-auto"
        />
      </PopoverContent>

    </Popover>
  );
}

function AppleRow({ label, value, mono, last, valueColor, divideRight }: { label: string; value: string; mono?: boolean; last?: boolean; valueColor?: string; divideRight?: boolean }) {
  return (
    <div className="px-4 py-2.5 flex items-center gap-3 min-h-[40px] min-w-0"
      style={{
        borderBottom: last ? "none" : "0.5px solid rgba(0,0,0,0.08)",
        borderRight: divideRight ? "0.5px solid rgba(0,0,0,0.08)" : "none",
      }}>
      <span className="text-[12.5px] shrink-0" style={{ color: "#86868b" }}>{label}</span>
      <span className={`ml-auto text-[13px] font-medium text-right truncate ${mono ? "tabular-nums" : ""}`}
        style={{ color: valueColor || "#1d1d1f" }} title={value}>
        {value}
      </span>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        });
      }}
      title={copied ? "Copied" : "Copy phone"}
      className="inline-flex items-center justify-center w-5 h-5 rounded-md transition-colors hover:bg-[rgba(0,0,0,0.06)]"
      style={{ color: copied ? "#34c759" : "#86868b" }}
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

function InfoCell({ label, value, mono, accent }: { label: string; value: string; mono?: boolean; accent?: boolean }) {
  return (
    <div className="px-2.5 py-1.5 border-r border-b [&:nth-child(3n)]:border-r-0 [&:nth-last-child(-n+3)]:border-b-0"
      style={{ borderColor: "hsl(var(--a-divider))", background: accent ? "hsl(var(--a-highlight))" : "transparent" }}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.08em]" style={{ color: "hsl(var(--a-soft))" }}>{label}</div>
      <div className={`text-[12px] font-medium mt-0.5 truncate ${mono ? "tabular-nums" : ""}`} style={{ color: "hsl(var(--a-ink))" }} title={value}>
        {value}
      </div>
    </div>
  );
}

// ── Manual reminder dialog ──────────────────────────────
function ManualReminderDialog({
  open, onClose, prefillPhone, prefillName,
}: { open: boolean; onClose: () => void; prefillPhone?: string; prefillName?: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [productId, setProductId] = useState<string>("");
  const [days, setDays] = useState<number>(30);
  const [dueDate, setDueDate] = useState<string>(addDaysISO(30));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["admin", "reminders", "products-for-manual"],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from("products")
        .select("id,name,reminder_days,reminder_notes,reminder_enabled").order("name");
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (open) {
      setName(prefillName || ""); setPhone(prefillPhone || ""); setEmail("");
      setProductId(""); setDays(30);
      setDueDate(addDaysISO(30));
      setNotes("");
    }
  }, [open, prefillPhone, prefillName]);

  useEffect(() => {
    const p = products.find((x: any) => x.id === productId);
    if (p) {
      const d = Number(p.reminder_days) || 30;
      setDays(d);
      setDueDate(addDaysISO(d));
      if (!notes) setNotes(p.reminder_notes || "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const submit = async () => {
    const digits = normPhone(phone);
    if (!digits || digits.length < 10) { toast({ title: "Valid phone required", variant: "destructive" }); return; }
    if (!productId) { toast({ title: "Pick a product", variant: "destructive" }); return; }
    const clampedDays = Math.min(365, Math.max(1, Number(days) || 1));
    if (!dueDate || dueDate < todayISO()) {
      toast({ title: "Due date must be today or later", variant: "destructive" });
      return;
    }
    const prod: any = products.find((x: any) => x.id === productId);
    setSaving(true);
    // Exact normalized-phone match — avoid mis-attributing to a customer
    // who happens to share trailing digits.
    const last10 = digits.slice(-10);
    const { data: candidates } = await supabase.from("customers")
      .select("id,phone,total_orders").ilike("phone", `%${last10}`).limit(20);
    const cust = (candidates ?? []).find(
      (c: any) => (c.phone || "").replace(/\D/g, "") === digits
    ) as any;
    const total = cust?.total_orders ?? 0;
    const priority: Priority = total >= 3 ? "high" : total === 2 ? "medium" : "low";
    // Supersede any existing open reminders for this phone+product to avoid duplicates.
    await supabase.from("product_reminders" as any)
      .update({ status: "superseded", resolved_at: new Date().toISOString() } as any)
      .eq("customer_phone", digits)
      .eq("product_id", productId)
      .in("status", ["pending", "called", "follow_up", "no_response", "interested"]);
    const { error } = await supabase.from("product_reminders" as any).insert({
      product_id: productId, product_name_snapshot: prod?.name ?? null,
      customer_id: cust?.id ?? null, customer_phone: digits,
      customer_name: name || null, customer_email: email || null,
      reminder_days: clampedDays, purchase_date: new Date().toISOString(),
      due_date: dueDate, status: "pending", priority, notes: notes || null,
    } as any);
    setSaving(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Reminder created" });
    qc.invalidateQueries({ queryKey: reminderKeys.all });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="admin-shell max-w-md rounded-xl p-0 border-0"
        style={{
          background: "hsl(var(--a-canvas))",
          color: "hsl(var(--a-ink))",
          boxShadow: "var(--a-shadow-pop)",
          border: "1px solid hsl(var(--a-stroke))",
        }}
      >
        <DialogHeader className="px-6 pt-5 pb-4" style={{ borderBottom: "1px solid hsl(var(--a-divider))" }}>
          <DialogTitle className="text-[13px] font-semibold uppercase" style={{ color: "hsl(var(--a-ink))", letterSpacing: "0.08em" }}>
            Create manual reminder
          </DialogTitle>
        </DialogHeader>
        <div className="px-6 py-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <AdminField label="Customer name"><AdminInput value={name} onChange={(e) => setName(e.target.value)} /></AdminField>
            <AdminField label="Phone" required><AdminInput value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01XXXXXXXXX" /></AdminField>
          </div>
          <AdminField label="Email"><AdminInput value={email} onChange={(e) => setEmail(e.target.value)} /></AdminField>
          <AdminField label="Product" required>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="h-9 text-[12.5px]"
                style={{ background: "hsl(var(--a-canvas-2))", borderColor: "hsl(var(--a-stroke))", color: "hsl(var(--a-ink))" }}>
                <SelectValue placeholder="Pick product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.reminder_enabled ? "" : " (no auto-reminder)"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </AdminField>
          <div className="grid grid-cols-2 gap-3">
            <AdminField label="Reminder after (days)">
              <AdminInput type="number" min={1} value={days} onChange={(e) => {
                const d = Math.max(1, Number(e.target.value) || 1);
                setDays(d); setDueDate(addDaysISO(d));
              }} />
            </AdminField>
            <AdminField label="Due date">
              <DatePill value={dueDate} onChange={setDueDate} min={todayISO()} />
            </AdminField>
          </div>
          <AdminField label="Notes"><AdminTextarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></AdminField>
        </div>
        <div className="px-6 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid hsl(var(--a-divider))", background: "hsl(var(--a-canvas-2))" }}>
          <button onClick={onClose} className="h-9 px-4 rounded-md text-[12.5px] font-medium hover:[background:hsl(var(--a-surface-2))]"
            style={{ background: "transparent", color: "hsl(var(--a-ink))", border: "1px solid hsl(var(--a-stroke))" }}>Cancel</button>
          <button onClick={submit} disabled={saving}
            className="h-9 px-5 rounded-md text-[12.5px] font-medium hover:opacity-90 disabled:opacity-40"
            style={{ background: "hsl(var(--a-ink))", color: "hsl(var(--a-accent-fg))", boxShadow: "var(--a-shadow-sm)" }}>
            {saving ? "Saving…" : "Create reminder"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Order editor (Create Same Order / Recover Incomplete Order) lives in
// src/components/admin/orders/OrderEditorDialog.tsx as a single source of truth.


// ── Customer drawer / sales workspace ───────────────────
const DRAWER_STATUS_ACTIONS: { value: ReminderStatus; label: string; icon: any }[] = [
  { value: "no_response", label: "No response", icon: X },
  { value: "follow_up", label: "Follow up", icon: Clock },
  { value: "not_interested", label: "Not interested", icon: Ban },
  { value: "do_not_remind", label: "Do not remind", icon: Ban },
];

function CustomerDetailDialog({
  phone, open, onClose, onAction, onAddReminder, onCreateOrder,
}: {
  phone: string | null; open: boolean; onClose: () => void;
  onAction: (r: ReminderRow) => void;
  onAddReminder: (phone: string, name?: string) => void;
  onCreateOrder: (src: { phone: string; name?: string; email?: string; orderId?: string | null; reminderId?: string | null; productId?: string | null; productName?: string | null }) => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const update = useUpdateReminder();
  const enabled = !!phone && open;
  const { data } = useQuery({
    queryKey: ["admin", "reminders", "customer", phone],
    enabled,
    queryFn: async () => {
      const digits = normPhone(phone!);
      const last10 = digits.slice(-10);
      const [{ data: cust }, { data: orders }, { data: rems }] = await Promise.all([
        supabase.from("customers").select("name,email,phone,total_orders,total_spent,city,address").ilike("phone", `%${last10}%`).limit(1).maybeSingle(),
        supabase.from("orders").select("id,order_number,total,items,created_at,order_status").ilike("customer_phone", `%${last10}%`).order("created_at", { ascending: false }).limit(50),
        supabase.from("product_reminders" as any).select(REMINDER_COLS).ilike("customer_phone", `%${last10}%`).order("due_date", { ascending: false }).limit(50),
      ]);
      return { customer: cust, orders: orders ?? [], reminders: (rems ?? []) as unknown as ReminderRow[] };
    },
  });

  const openReminders = (data?.reminders ?? []).filter((r) => OPEN_STATUSES.includes(r.status));
  const lastOrderId = (data?.orders?.[0] as any)?.id ?? null;
  const custName = (data?.customer as any)?.name;
  const custEmail = (data?.customer as any)?.email;

  const quickStatus = async (status: ReminderStatus) => {
    if (openReminders.length === 0) { toast({ title: "No open reminder to update", variant: "destructive" }); return; }
    const stamp = new Date().toISOString();
    const patch: Partial<ReminderRow> = { status };
    if (["not_interested", "do_not_remind", "purchased_again", "manually_closed"].includes(status)) {
      patch.completed_at = stamp; patch.resolved_at = stamp;
    }
    if (status === "no_response") patch.called_at = stamp;
    if (status === "follow_up") {
      toast({ title: "Open the reminder to set a callback date and notes", variant: "destructive" });
      onAction(openReminders[0]);
      return;
    }
    await Promise.all(openReminders.map((r) => update.mutateAsync({ id: r.id, patch })));
    // Note: Do Not Remind is now product-specific (enforced by the schedule_reminders_for_order trigger),
    // never customer-wide. No customer_profiles update here.

    toast({ title: `${openReminders.length} reminder(s) marked ${STATUS_LABEL[status].toLowerCase()}` });
    qc.invalidateQueries({ queryKey: reminderKeys.all });
    qc.invalidateQueries({ queryKey: ["admin", "reminders", "customer", phone] });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        className="admin-shell max-w-[820px] sm:max-w-[820px] rounded-xl max-h-[90vh] overflow-y-auto p-0 border-0"
        style={{
          background: "hsl(var(--a-canvas))",
          color: "hsl(var(--a-ink))",
          boxShadow: "var(--a-shadow-pop)",
          border: "1px solid hsl(var(--a-stroke))",
        }}
      >
        <DialogHeader className="px-6 pt-5 pb-4" style={{ borderBottom: "1px solid hsl(var(--a-divider))" }}>
          <DialogTitle className="text-[13px] font-semibold uppercase" style={{ color: "hsl(var(--a-ink))", letterSpacing: "0.08em" }}>
            Sales workspace
          </DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="p-6"><div className="h-40 a-skeleton rounded-md" /></div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[12.5px]">
              <div><div className="text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "hsl(var(--a-soft))" }}>Name</div><div className="font-medium" style={{ color: "hsl(var(--a-ink))" }}>{custName || "—"}</div></div>
              <div><div className="text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "hsl(var(--a-soft))" }}>Phone</div><div className="font-medium tabular-nums" style={{ color: "hsl(var(--a-ink))" }}>{(data.customer as any)?.phone || phone}</div></div>
              <div><div className="text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "hsl(var(--a-soft))" }}>Total orders</div><div className="font-medium tabular-nums" style={{ color: "hsl(var(--a-ink))" }}>{(data.customer as any)?.total_orders ?? data.orders.length}</div></div>
              <div><div className="text-[10.5px] uppercase tracking-[0.08em]" style={{ color: "hsl(var(--a-soft))" }}>Total spend</div><div className="font-medium tabular-nums" style={{ color: "hsl(var(--a-ink))" }}>{fmtMoney(Number((data.customer as any)?.total_spent ?? 0))}</div></div>
            </div>

            {/* Primary actions */}
            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "hsl(var(--a-soft))" }}>Close the sale</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <button onClick={() => {
                  const r = openReminders[0];
                  onCreateOrder({
                    phone: phone!,
                    name: custName,
                    email: custEmail,
                    orderId: r?.order_id ?? lastOrderId,
                    reminderId: r?.id ?? null,
                    productId: r?.product_id ?? null,
                    productName: r?.product_name_snapshot ?? null,
                  });
                }}
                  disabled={openReminders.length === 0}
                  className="h-10 rounded-md text-[12.5px] font-medium flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40"
                  style={{ background: "hsl(var(--a-ink))", color: "hsl(var(--a-accent-fg))", boxShadow: "var(--a-shadow-sm)" }}>
                  <Repeat size={13} /> Create same order
                </button>
                <button onClick={() => quickStatus("purchased_again")}
                  className="h-10 rounded-md text-[12.5px] font-medium flex items-center justify-center gap-2 hover:[background:hsl(var(--a-surface-2))]"
                  style={{ background: "hsl(var(--a-surface))", color: "hsl(var(--a-ink))", border: "1px solid hsl(var(--a-stroke))" }}>
                  <CheckCircle2 size={13} /> Purchased again
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "hsl(var(--a-soft))" }}>
                Reminder status {openReminders.length > 0 && <span style={{ color: "hsl(var(--a-muted))" }}>· applies to {openReminders.length} open</span>}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {DRAWER_STATUS_ACTIONS.map((a) => (
                  <button key={a.value} onClick={() => quickStatus(a.value)} disabled={openReminders.length === 0}
                    className="h-9 rounded-md text-[12.5px] font-medium flex items-center justify-center gap-2 hover:[background:hsl(var(--a-surface-2))] disabled:opacity-40"
                    style={{ background: "hsl(var(--a-surface))", color: "hsl(var(--a-ink))", border: "1px solid hsl(var(--a-stroke))" }}>
                    <a.icon size={13} /> {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => window.open(`tel:${phone}`)}
                className="h-9 rounded-md text-[12.5px] font-medium flex items-center justify-center gap-2 hover:[background:hsl(var(--a-surface-2))]"
                style={{ background: "hsl(var(--a-surface))", color: "hsl(var(--a-ink))", border: "1px solid hsl(var(--a-stroke))" }}>
                <Phone size={13} /> Call
              </button>
              <button onClick={() => onAddReminder(phone!, custName || undefined)}
                className="h-9 rounded-md text-[12.5px] font-medium flex items-center justify-center gap-2 hover:[background:hsl(var(--a-surface-2))]"
                style={{ background: "hsl(var(--a-surface))", color: "hsl(var(--a-ink))", border: "1px solid hsl(var(--a-stroke))" }}>
                <Plus size={13} /> Add reminder
              </button>
            </div>

            <div>
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "hsl(var(--a-soft))" }}>Purchase history</h4>
              <div className="rounded-md border divide-y text-[12px]" style={{ borderColor: "hsl(var(--a-stroke))" }}>
                {data.orders.length === 0 ? <div className="p-3" style={{ color: "hsl(var(--a-muted))" }}>No orders</div> :
                  data.orders.map((o: any) => (
                    <div key={o.id} className="p-2.5 flex justify-between">
                      <span>{o.order_number} · {fmtDate(o.created_at)}</span>
                      <span className="tabular-nums">{fmtMoney(Number(o.total))}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div>
              <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] mb-2" style={{ color: "hsl(var(--a-soft))" }}>Reminder history</h4>
              <div className="rounded-md border divide-y text-[12px]" style={{ borderColor: "hsl(var(--a-stroke))" }}>
                {data.reminders.length === 0 ? <div className="p-3" style={{ color: "hsl(var(--a-muted))" }}>No reminders</div> :
                  data.reminders.map((r) => (
                    <div key={r.id} className="p-2.5 flex justify-between items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{r.product_name_snapshot}</div>
                        <div className="text-[11px]" style={{ color: "hsl(var(--a-soft))" }}>
                          Due {fmtDate(r.due_date)}
                          {r.completed_at && <> · Completed {fmtDate(r.completed_at)}</>}
                          {r.next_action_date && r.status === "follow_up" && <> · Next {fmtDate(r.next_action_date)}</>}
                          {r.reorder_amount ? <> · {fmtMoney(Number(r.reorder_amount))}</> : null}
                        </div>
                      </div>
                      <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
                      {OPEN_STATUSES.includes(r.status) && (
                        <button className="h-7 px-2.5 rounded-md text-[11.5px] font-medium hover:[background:hsl(var(--a-surface-2))]"
                          style={{ background: "hsl(var(--a-surface))", color: "hsl(var(--a-ink))", border: "1px solid hsl(var(--a-stroke))" }}
                          onClick={() => onAction(r)}>
                          Action
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ───────────────────────────────────────────
type SortKey = "due_date" | "revenue" | "total_orders" | "days_overdue" | "order_value" | "total_spend";

const ReorderReminders = () => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useToast();

  // ── Filters / search / sort ──────────────────────────
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const [productFilter, setProductFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortKey>("due_date");
  const [activeTab, setActiveTab] = useState<string>("today");

  // Local today, recomputed at midnight, so refDate buckets stay accurate.
  const [today, setToday] = useState<string>(todayISO());
  useEffect(() => {
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      return window.setTimeout(() => {
        setToday(todayISO());
        timer = schedule();
      }, next.getTime() - now.getTime());
    };
    let timer = schedule();
    return () => window.clearTimeout(timer);
  }, []);

  // ── Dialog / selection state ─────────────────────────
  const [actionRow, setActionRow] = useState<ReminderRow | null>(null);
  const [drawerPhone, setDrawerPhone] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPrefill, setManualPrefill] = useState<{ phone?: string; name?: string }>({});
  const [orderDialog, setOrderDialog] = useState<{
    open: boolean;
    source: { phone: string; name?: string; email?: string; orderId?: string | null; reminderId?: string | null; productId?: string | null; productName?: string | null } | null;
  }>({ open: false, source: null });
  const [bulkDateOpen, setBulkDateOpen] = useState(false);
  const [bulkDate, setBulkDate] = useState<string>(addDaysISO(7));
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // Clear selection when filter/sort/tab changes — selection is page-scoped.
  useEffect(() => { setSelected(new Set()); }, [activeTab, debouncedSearch, productFilter, sortBy]);

  // Live invalidation on any product_reminders change.
  // Visibility-paused: drops the realtime channel when the tab is hidden and
  // re-subscribes (+ refetches) on visibility — same pattern as useAdminNotifications.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribe = () => {
      if (channel) return;
      channel = supabase
        .channel(`admin-product-reminders:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "product_reminders" }, () => {
          qc.invalidateQueries({ queryKey: reminderKeys.all });
        })
        .subscribe();
    };
    const unsubscribe = () => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        subscribe();
        qc.invalidateQueries({ queryKey: reminderKeys.all });
      } else unsubscribe();
    };
    if (document.visibilityState === "visible") subscribe();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      unsubscribe();
    };
  }, [qc]);

  // ── Server-side counts / metrics ─────────────────────
  const { data: counts } = useRemindersTabCounts(today, debouncedSearch, productFilter);
  const { data: metrics } = useRemindersMetrics(today);
  const { data: productMeta } = useReminderProductIds();
  const reminderDaysMap = productMeta?.daysMap ?? {};
  const productOptions = useMemo(() => {
    const m = productMeta?.nameMap ?? {};
    return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1]));
  }, [productMeta]);

  // Recent purchases tab keeps its own (small) feed.
  const { data: recentOrders = [] } = useRecentOrders();
  const recentFiltered = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return recentOrders;
    return (recentOrders as any[]).filter((o: any) =>
      `${o.customer_name || ""} ${o.customer_phone || ""} ${o.order_number || ""}`.toLowerCase().includes(q)
    );
  }, [recentOrders, debouncedSearch]);

  // ── Helpers ──────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const tabFilters: RemindersPageArgs = useMemo(
    () => ({ tab: activeTab, search: debouncedSearch, productId: productFilter, sortBy, today }),
    [activeTab, debouncedSearch, productFilter, sortBy, today],
  );

  const invalidateAll = () => qc.invalidateQueries({ queryKey: reminderKeys.all });

  // Look up selected reminder rows from the DB so bulk actions can partition by status.
  const loadSelectedRows = async (ids: string[]): Promise<ReminderRow[]> => {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("product_reminders" as any)
      .select(REMINDER_COLS)
      .in("id", ids);
    if (error) throw error;
    return (data ?? []) as unknown as ReminderRow[];
  };

  const bulkMarkCalled = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const rows = await loadSelectedRows(Array.from(selected));
      const ids = rows.filter((r) => OPEN_STATUSES.includes(r.status)).map((r) => r.id);
      if (ids.length === 0) {
        toast({ title: "No open reminders in selection", variant: "destructive" });
        return;
      }
      const stamp = new Date().toISOString();
      // Append timeline entry per row so bulk calls are auditable too.
      await Promise.all(rows.filter((r) => ids.includes(r.id)).map((r) => {
        const next = appendTimeline(r.notes_timeline, { at: stamp, action: "Marked as called (bulk)", status: "called" });
        return supabase.from("product_reminders" as any)
          .update({ status: "called", called_at: stamp, last_contacted_at: stamp, notes_timeline: next } as any)
          .eq("id", r.id);
      }));
      const error = null as any;
      if (error) throw error;
      toast({ title: `Marked ${ids.length} as called` });
      setSelected(new Set());
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkApplyDate = async () => {
    if (selected.size === 0 || !bulkDate) return;
    setBulkBusy(true);
    const stamp = new Date().toISOString();
    try {
      const rows = await loadSelectedRows(Array.from(selected));
      if (rows.length === 0) return;
      const noResp = rows.filter((r) => r.status === "no_response").map((r) => r.id);
      const follow = rows.filter((r) => r.status === "follow_up").map((r) => r.id);
      const reactivate = rows
        .filter((r) => r.status === "not_interested" || r.status === "do_not_remind")
        .map((r) => r.id);
      const active = rows
        .filter(
          (r) =>
            r.status !== "no_response" &&
            r.status !== "follow_up" &&
            r.status !== "not_interested" &&
            r.status !== "do_not_remind" &&
            r.status !== "purchased_again" &&
            r.status !== "superseded" &&
            r.status !== "manually_closed",
        )
        .map((r) => r.id);

      const tbl = () => supabase.from("product_reminders" as any);
      const errs: any[] = [];
      if (noResp.length) {
        const { error } = await tbl().update({ next_action_date: bulkDate } as any).in("id", noResp);
        if (error) errs.push(error);
      }
      if (follow.length) {
        const { error } = await tbl().update({ next_action_date: bulkDate, follow_up_date: bulkDate } as any).in("id", follow);
        if (error) errs.push(error);
      }
      if (reactivate.length) {
        const { error } = await tbl().update({
          due_date: bulkDate, status: "pending", called_at: null, completed_at: null,
          resolved_at: null, next_action_date: null, follow_up_date: null,
        } as any).in("id", reactivate);
        if (error) errs.push(error);
      }
      if (active.length) {
        const { error } = await tbl().update({
          due_date: bulkDate, status: "pending", called_at: null, completed_at: null,
          resolved_at: null, next_action_date: null, follow_up_date: null,
        } as any).in("id", active);
        if (error) errs.push(error);
      }
      if (errs.length) throw errs[0];
      await Promise.all(rows.map(async (r) => {
        const action = (r.status === "no_response")
          ? `Bulk · Retry Date Changed · ${fmtDate(r.next_action_date)} → ${fmtDate(bulkDate)}`
          : (r.status === "follow_up")
          ? `Bulk · Follow-up Date Changed · ${fmtDate(r.next_action_date || r.follow_up_date)} → ${fmtDate(bulkDate)}`
          : `Bulk · Reminder Date Changed · ${fmtDate(r.due_date)} → ${fmtDate(bulkDate)}`;
        const nextStatus = (r.status === "no_response" || r.status === "follow_up") ? r.status : "pending";
        const newTimeline = appendTimeline(r.notes_timeline, { at: stamp, action, status: nextStatus });
        await tbl().update({ notes_timeline: newTimeline } as any).eq("id", r.id);
      }));
      toast({ title: `Updated ${rows.length} reminder${rows.length === 1 ? "" : "s"}`, description: fmtDate(bulkDate) });
      setBulkDateOpen(false);
      setSelected(new Set());
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Bulk update failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    const stamp = new Date().toISOString();
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from("product_reminders" as any).update({
        status: "superseded", resolved_at: stamp, completed_at: stamp,
      } as any).in("id", ids);
      if (error) throw error;
      toast({ title: `Deleted ${ids.length} reminder${ids.length === 1 ? "" : "s"}` });
      setBulkConfirmDelete(false);
      setSelected(new Set());
      invalidateAll();
    } catch (e: any) {
      toast({ title: "Bulk delete failed", description: e.message, variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const buildCsv = (subset: ReminderRow[]) => {
    const header = ["Priority","Customer","Phone","Email","Product","Last Purchase","Due Date","Completed At","Next Action","Status","Reorder Amount","Notes"];
    const lines = subset.map((r) => [
      r.priority, r.customer_name || "", r.customer_phone, r.customer_email || "",
      r.product_name_snapshot || "", (r.purchase_date || "").slice(0,10), r.due_date,
      r.completed_at?.slice(0,10) || "", r.next_action_date || "",
      r.status, r.reorder_amount ?? 0, (r.call_notes || r.notes || "").replace(/[\r\n,]/g, " "),
    ].map((v) => `"${String(v).replace(/"/g,'""')}"`).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `reminders-${todayISO()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  const exportAll = async () => {
    setExporting(true);
    try {
      // Export current tab + filters (matches what user sees).
      const rows = await fetchAllReminders(tabFilters);
      buildCsv(rows);
      toast({ title: `Exported ${rows.length} reminder${rows.length === 1 ? "" : "s"}` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const exportSelected = async () => {
    if (selected.size === 0) return exportAll();
    setExporting(true);
    try {
      const rows = await loadSelectedRows(Array.from(selected));
      buildCsv(rows);
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const runBackfill = async () => {
    setBackfilling(true);
    const { data, error } = await supabase.rpc("backfill_product_reminders" as any, { _days: 100 });
    setBackfilling(false);
    if (error) { toast({ title: "Backfill failed", description: error.message, variant: "destructive" }); return; }
    const d = data as any;
    toast({ title: "Backfill complete", description: `Scanned ${d?.scanned ?? 0} · inserted ${d?.inserted ?? 0}` });
    invalidateAll();
  };

  const openManual = (phone?: string, name?: string) => { setManualPrefill({ phone, name }); setManualOpen(true); };

  const openOrderDialog = (
    src: { phone: string; name?: string; email?: string; orderId?: string | null; reminderId?: string | null; productId?: string | null; productName?: string | null },
  ) => {
    setDrawerPhone(null);
    setActionRow(null);
    setOrderDialog({ open: true, source: src });
  };

  const openReminderForOrder = async (orderId: string, phone: string, name?: string) => {
    const last10 = normPhone(phone).slice(-10);
    let { data } = await supabase.from("product_reminders" as any)
      .select(REMINDER_COLS).eq("order_id", orderId).limit(1);
    if (!data || data.length === 0) {
      const r = await supabase.from("product_reminders" as any)
        .select(REMINDER_COLS).ilike("customer_phone", `%${last10}%`)
        .order("due_date", { ascending: false }).limit(1);
      data = r.data ?? [];
    }
    const row = (data?.[0] ?? null) as unknown as ReminderRow | null;
    if (row) setActionRow(row);
    else openManual(phone, name);
  };

  const statCardCls = "!p-2.5 sm:!p-3.5 [&>div:first-child]:!mb-1.5 sm:[&>div:first-child]:!mb-3 [&>div:first-child>div:last-child]:!w-6 [&>div:first-child>div:last-child]:!h-6 sm:[&>div:first-child>div:last-child]:!w-8 sm:[&>div:first-child>div:last-child]:!h-8 [&>div:nth-child(2)>p]:!text-[20px] sm:[&>div:nth-child(2)>p]:!text-[30px] [&>div:last-child]:!mt-1 [&>div:last-child]:!min-h-0 sm:[&>div:last-child]:!mt-2.5";

  // Shared props every PaginatedTab needs to render the table.
  const sharedTabProps = {
    today,
    selected, onToggleSelect: toggleSelect, setSelected, selectMode,
    onAction: setActionRow,
    onOpenCustomer: (p: string) => navigate(`/admin/customers/${encodeURIComponent(normPhone(p))}`),
    onCreateOrder: openOrderDialog,
    filters: tabFilters,
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Sales"
        title="Re-order Reminders"
        subtitle="Repeat-sales pipeline: due today → called → follow-up → purchased again."
        actions={
          <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
            <Button size="sm" className="rounded-lg h-9" onClick={() => openManual()}>
              <Plus size={13} className="mr-1.5" /> New reminder
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg h-9" disabled={exporting} onClick={exportAll}>
              <Download size={13} className="mr-1.5" /> {exporting ? "Exporting…" : "Export CSV"}
            </Button>
            <Button variant="outline" size="sm" className="rounded-lg h-9" onClick={runBackfill} disabled={backfilling}>
              <History size={13} className="mr-1.5" /> {backfilling ? "Backfilling…" : "Backfill 100d"}
            </Button>
          </div>
        }
      />

      {/* Mobile-only action stack */}
      <div className="sm:hidden grid grid-cols-2 gap-2">
        <Button size="sm" className="col-span-2 rounded-lg h-10 text-[13px]" onClick={() => openManual()}>
          <Plus size={14} className="mr-1.5" /> New reminder
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg h-9 text-[12.5px]" disabled={exporting} onClick={exportAll}>
          <Download size={13} className="mr-1.5" /> {exporting ? "Exporting…" : "Export CSV"}
        </Button>
        <Button variant="outline" size="sm" className="rounded-lg h-9 text-[12.5px]" onClick={runBackfill} disabled={backfilling}>
          <History size={13} className="mr-1.5" /> {backfilling ? "Backfilling…" : "Backfill 100d"}
        </Button>
      </div>


      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <StatCard className={statCardCls} tone="warning" icon={Bell} label="Due today" value={metrics?.todayCount ?? 0} />
        <StatCard className={statCardCls} tone="danger" icon={AlertTriangle} label="Missed" value={metrics?.missedCount ?? 0} />
        <StatCard className={statCardCls} tone="info" icon={Clock} label="Upcoming" value={metrics?.upcomingCount ?? 0} />
        <StatCard className={statCardCls} tone="success" icon={CheckCircle2} label="Reorders won" value={metrics?.completed ?? 0} />
        <StatCard className={statCardCls} tone="violet" icon={TrendingUp} label={`Conv · avg ${fmtMoney(metrics?.avgReorder ?? 0)}`} value={`${metrics?.conversion ?? 0}%`} />
        <StatCard className={statCardCls} highlight icon={DollarSign} label="Revenue recovered" value={metrics?.revenue ?? 0} valuePrefix={CURRENCY_SYMBOL} />
      </div>

      {selected.size > 0 && activeTab !== "recent" && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 flex-wrap">
          <p className="text-[12.5px] font-medium">{selected.size} selected</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button size="sm" variant="outline" className="rounded-md h-8" onClick={() => { setBulkDate(addDaysISO(7)); setBulkDateOpen(true); }}>
              <CalendarDays size={12} className="mr-1.5" /> Change date
            </Button>
            <Button size="sm" variant="outline" className="rounded-md h-8" disabled={bulkBusy} onClick={bulkMarkCalled}>
              <PhoneCall size={12} className="mr-1.5" /> Mark called
            </Button>
            <Button size="sm" variant="outline" className="rounded-md h-8" disabled={exporting} onClick={exportSelected}>
              <Download size={12} className="mr-1.5" /> Export selected
            </Button>
            {!bulkConfirmDelete ? (
              <Button size="sm" variant="outline" className="rounded-md h-8 text-destructive hover:text-destructive" onClick={() => setBulkConfirmDelete(true)}>
                <Trash2 size={12} className="mr-1.5" /> Delete
              </Button>
            ) : (
              <div className="inline-flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/5 px-1.5 h-8">
                <span className="text-[11.5px] font-medium text-destructive px-1">Delete {selected.size}?</span>
                <Button size="sm" variant="destructive" className="h-6 px-2 text-[11.5px]" disabled={bulkBusy} onClick={bulkDelete}>Confirm</Button>
                <Button size="sm" variant="ghost" className="h-6 px-2 text-[11.5px]" onClick={() => setBulkConfirmDelete(false)}>Cancel</Button>
              </div>
            )}
            <Button size="sm" variant="ghost" className="rounded-md h-8" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      <Dialog open={bulkDateOpen} onOpenChange={(v) => !v && setBulkDateOpen(false)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-[16px]">Change date · {selected.size} reminder{selected.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted-foreground">
              The new date will apply to the appropriate field per reminder: retry date for <em>No Response</em>, follow-up date for <em>Follow Up</em>, and reminder date (reactivated) for others.
            </p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium">New date</span>
              <DatePill value={bulkDate} onChange={setBulkDate} min={todayISO()} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" size="sm" onClick={() => setBulkDateOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={bulkBusy || !bulkDate} onClick={bulkApplyDate}>Apply</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Section
        title="Sales pipeline"
        description="Status changes never remove records — they move to the matching tab."
      >
        <Toolbar
          search={{ value: search, onChange: setSearch, placeholder: "Search customer, phone, product…" }}
          filters={
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="h-11 sm:h-9 w-full sm:w-[160px] text-[13.5px] sm:text-[12.5px] rounded-xl sm:rounded-md pl-10 sm:pl-3 relative">
                  <Package size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground sm:hidden" />
                  <SelectValue placeholder="Product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All products</SelectItem>
                  {productOptions.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-11 sm:h-9 w-full sm:w-[170px] text-[13.5px] sm:text-[12.5px] rounded-xl sm:rounded-md pl-10 sm:pl-3 relative">
                  <ArrowUpDown size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground sm:hidden" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="due_date">Sort: Reminder date</SelectItem>
                  <SelectItem value="days_overdue">Sort: Days overdue</SelectItem>
                  <SelectItem value="order_value">Sort: Order value</SelectItem>
                  <SelectItem value="total_spend">Sort: Total spend</SelectItem>
                  <SelectItem value="total_orders">Sort: Total orders</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-3">
          {/* Responsive rectangular tabs: horizontal scroll on mobile, wrap on tablet, single row on desktop */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 min-w-0 overflow-x-auto scrollbar-hide -mx-1 px-1">
              <TabsList className="bg-transparent p-0 gap-1.5 flex flex-nowrap h-auto w-max">


                {[
                  { value: "today", label: `Due today (${counts?.today ?? 0})` },
                  { value: "noresp", label: `No response (${counts?.noResponse ?? 0})` },
                  { value: "follow", label: `Follow up (${counts?.followUp ?? 0})` },
                  { value: "lost", label: `Not interested (${counts?.notInterested ?? 0})` },
                  { value: "dnr", label: `Do not remind (${counts?.doNotRemind ?? 0})` },
                  { value: "missed", label: `Missed (${counts?.missed ?? 0})` },
                  { value: "upcoming", label: `Upcoming (${counts?.upcoming ?? 0})` },
                  { value: "closed", label: `Completed (${counts?.closed ?? 0})` },
                  { value: "recent", label: "Recent purchases" },
                ].map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="shrink-0 rounded-[3px] h-9 px-3.5 text-[12.5px] font-medium border border-border/60 bg-background text-muted-foreground hover:text-foreground hover:bg-muted/40 data-[state=active]:bg-foreground data-[state=active]:text-background data-[state=active]:border-foreground data-[state=active]:shadow-sm transition-colors lg:h-8 lg:px-3 lg:text-[12px]"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {activeTab !== "recent" && (
              <button
                type="button"
                onClick={() => { setSelectMode((v) => { if (v) setSelected(new Set()); return !v; }); }}
                className={`shrink-0 text-[12.5px] lg:text-[12px] font-medium h-9 lg:h-8 px-3.5 lg:px-3 rounded-[3px] border transition-colors ${selectMode ? "bg-foreground text-background border-foreground" : "border-border/60 text-foreground bg-background hover:bg-muted/40"}`}
              >
                {selectMode ? "Done" : "Select"}
              </button>
            )}
          </div>



          <TabsContent value="today" className="mt-4">
            <PaginatedTab {...sharedTabProps} tab="today"
              emptyIcon={<Bell size={18} />} emptyTitle="Nothing due today"
              tableProps={{ showSourceBadge: true, hideStatusBadge: true }} />
          </TabsContent>

          <TabsContent value="missed" className="mt-4">
            <PaginatedTab {...sharedTabProps} tab="missed"
              emptyIcon={<AlertTriangle size={18} />} emptyTitle="No missed reminders"
              tableProps={{ dueLabel: "Overdue", showMissed: true }} />
          </TabsContent>

          <TabsContent value="noresp" className="mt-4">
            <PaginatedTab {...sharedTabProps} tab="noresp"
              emptyIcon={<X size={18} />} emptyTitle="No 'no response' entries"
              tableProps={{ dueLabel: "Next Reminder", reminderDateLabel: "Next Reminder", hideStatusBadge: true }} />
          </TabsContent>

          <TabsContent value="follow" className="mt-4">
            <PaginatedTab {...sharedTabProps} tab="follow"
              emptyIcon={<Clock size={18} />} emptyTitle="No follow-ups scheduled"
              tableProps={{ dueLabel: "Callback", hideStatusBadge: true }} />
          </TabsContent>

          <TabsContent value="lost" className="mt-4">
            <PaginatedTab {...sharedTabProps} tab="lost"
              emptyIcon={<Ban size={18} />} emptyTitle="No 'not interested' entries"
              tableProps={{ dueLabel: "Completed", showCompleted: true }} />
          </TabsContent>

          <TabsContent value="dnr" className="mt-4">
            <PaginatedTab {...sharedTabProps} tab="dnr"
              emptyIcon={<Ban size={18} />} emptyTitle="No 'do not remind' entries"
              tableProps={{ dueLabel: "Completed", showCompleted: true }} />
          </TabsContent>

          <TabsContent value="upcoming" className="mt-4">
            <PaginatedTab {...sharedTabProps} tab="upcoming" initialPageSize={50}
              emptyIcon={<Clock size={18} />} emptyTitle="No upcoming reminders"
              tableProps={{ dueLabel: "Reminder date" }} />
          </TabsContent>

          <TabsContent value="closed" className="mt-4">
            <PaginatedClosedTab filters={tabFilters} onAction={setActionRow} />
          </TabsContent>

          <TabsContent value="recent" className="mt-4">
            {recentFiltered.length === 0 ? <EmptyState icon={<Clock size={18} />} title="No recent purchases" /> :
              <div className="overflow-x-auto rounded-xl border border-border/60">
                <table className="w-full text-[12.5px] table-fixed">
                  <thead className="bg-muted/60 border-b-2 border-border">
                    <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground [&>th]:whitespace-nowrap [&>th]:!text-center [&>th]:py-2.5">
                      <th className="px-3 py-3 w-[22%] min-w-[150px]">Customer</th>
                      <th className="px-3 py-3 w-[24%] min-w-[160px]">Product</th>
                      <th className="px-3 py-3 w-[12%] min-w-[90px]">Amount</th>
                      <th className="px-3 py-3 w-[14%] min-w-[110px]">Purchase Date</th>
                      <th className="px-3 py-3 w-[14%] min-w-[110px]">Next Reminder</th>
                      <th className="px-3 py-3 w-[70px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {recentFiltered.slice(0, 200).map((o: any) => {
                      const items: any[] = Array.isArray(o.items) ? o.items : [];
                      const first = items[0];
                      const productLabel = items.length === 0
                        ? "—"
                        : items.length === 1
                          ? (first?.name || first?.product_name || "—")
                          : `${first?.name || first?.product_name || "Item"} +${items.length - 1} more`;
                      const reorderItem = items.find((i: any) => reminderDaysMap[i?.product_id] || reminderDaysMap[i?.id]);
                      const reorderDays = reorderItem
                        ? (reminderDaysMap[reorderItem.product_id] || reminderDaysMap[reorderItem.id])
                        : null;
                      const expectedDate = reorderDays
                        ? addDays(new Date(o.created_at), Number(reorderDays)).toISOString()
                        : null;
                      return (
                        <tr key={o.id} className="hover:bg-muted/30 [&>td]:px-3 [&>td]:py-3 [&>td]:align-middle [&>td]:text-center">
                          <td className="cursor-pointer" onClick={() => navigate(`/admin/customers/${encodeURIComponent(normPhone(o.customer_phone))}`)}>
                            <div className="font-medium leading-tight truncate">{o.customer_name || "—"}</div>
                            <div className="text-muted-foreground/70 text-[10.5px] tabular-nums">{o.customer_phone}</div>
                          </td>
                          <td className="truncate" title={productLabel}>
                            <span className="block truncate">{productLabel}</span>
                          </td>
                          <td className="tabular-nums whitespace-nowrap">{fmtMoney(Number(o.total))}</td>
                          <td className="tabular-nums whitespace-nowrap">{fmtDate(o.created_at)}</td>
                          <td className="tabular-nums whitespace-nowrap">{expectedDate ? fmtDate(expectedDate) : <span className="text-muted-foreground/50">—</span>}</td>
                           <td>
                            <div className="flex justify-center">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 rounded-md hover:bg-muted/60"
                                onClick={() => openReminderForOrder(o.id, o.customer_phone, o.customer_name)}
                                title="Open reminder"
                                aria-label="Open reminder"
                              >
                                <SlidersHorizontal size={14} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>}
          </TabsContent>
        </Tabs>
      </Section>

      <ActionDialog
        reminder={actionRow}
        open={!!actionRow}
        onClose={() => setActionRow(null)}
        forceFullPipeline={activeTab === "today"}
        onCreateOrder={(r) => openOrderDialog({
          phone: r.customer_phone, name: r.customer_name || undefined,
          email: r.customer_email || undefined, orderId: r.order_id, reminderId: r.id,
          productId: r.product_id, productName: r.product_name_snapshot || undefined,
        })}
      />
      <CustomerDetailDialog
        phone={drawerPhone}
        open={!!drawerPhone}
        onClose={() => setDrawerPhone(null)}
        onAction={(r) => setActionRow(r)}
        onAddReminder={(p, n) => { setDrawerPhone(null); openManual(p, n); }}
        onCreateOrder={openOrderDialog}
      />
      <ManualReminderDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        prefillPhone={manualPrefill.phone}
        prefillName={manualPrefill.name}
      />
      <OrderEditorDialog
        open={orderDialog.open}
        onClose={() => setOrderDialog((s) => ({ ...s, open: false }))}
        source={orderDialog.source ? { kind: "reorder", ...orderDialog.source } : null}
      />


    </div>
  );
};

// ── Paginated tab subcomponent ───────────────────────────
type PaginatedTabProps = {
  tab: string;
  today: string;
  filters: RemindersPageArgs;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  setSelected: (s: Set<string>) => void;
  selectMode: boolean;
  onAction: (r: ReminderRow) => void;
  onOpenCustomer: (p: string) => void;
  onCreateOrder: (
    src: { phone: string; name?: string; email?: string; orderId?: string | null; reminderId?: string | null; productId?: string | null; productName?: string | null },
  ) => void;
  emptyIcon: React.ReactNode;
  emptyTitle: string;
  initialPageSize?: number;
  tableProps?: {
    dueLabel?: string;
    showCompleted?: boolean;
    showMissed?: boolean;
    showSourceBadge?: boolean;
    hideStatusBadge?: boolean;
    reminderDateLabel?: string;
  };
};

function PaginatedTab({
  tab, today, filters, selected, onToggleSelect, setSelected, selectMode,
  onAction, onOpenCustomer, onCreateOrder, emptyIcon, emptyTitle, initialPageSize = 25, tableProps = {},
}: PaginatedTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // Use filters for THIS tab (parent passes the active-tab filter set; override _tab here).
  const effective: RemindersPageArgs = useMemo(() => ({ ...filters, tab }), [filters, tab]);

  useEffect(() => { setPage(1); }, [effective.search, effective.productId, effective.sortBy, effective.today, pageSize]);

  const { data, isLoading, isFetching } = useRemindersPage(effective, page, pageSize);
  const rows = (data?.rows ?? []) as ReminderRow[];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  // Page-only aggregates → tiny payloads
  const phones = useMemo(() => rows.map((r) => r.customer_phone), [rows]);
  const productIds = useMemo(() => rows.map((r) => r.product_id).filter(Boolean) as string[], [rows]);
  const { data: custMap } = useCustomerAggregates(phones);
  const { data: priceMap = {} } = useProductPriceMap(productIds);
  const { data: liveMap = {} } = useProductLiveMap(productIds);
  const { data: linePriceMap = {} } = useReminderLinePriceMap(rows);


  if (isLoading && rows.length === 0) return <div className="h-40 a-skeleton rounded-xl" />;
  if (rows.length === 0) return <EmptyState icon={emptyIcon} title={emptyTitle} />;

  return (
    <div className="space-y-3">
      <ReminderTable
        rows={rows}
        today={today}
        custMap={custMap}
        priceMap={priceMap}
        liveMap={liveMap}
        linePriceMap={linePriceMap}

        onAction={onAction}
        onOpenCustomer={onOpenCustomer}
        onCreateOrder={onCreateOrder}
        selected={selected}
        onToggleSelect={onToggleSelect}
        onToggleAll={(c: boolean) => setSelected(c ? new Set(rows.map((r) => r.id)) : new Set())}
        selectMode={selectMode}
        {...tableProps}
      />
      <PaginationFooter
        page={page} pageCount={pageCount} pageSize={pageSize} total={total}
        onPage={setPage} onPageSize={setPageSize} updating={isFetching}
      />
    </div>
  );
}

// Closed tab uses its own table layout (different columns).
function PaginatedClosedTab({
  filters, onAction,
}: { filters: RemindersPageArgs; onAction: (r: ReminderRow) => void }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const effective: RemindersPageArgs = useMemo(() => ({ ...filters, tab: "closed" }), [filters]);
  useEffect(() => { setPage(1); }, [effective.search, effective.productId, effective.sortBy, effective.today, pageSize]);
  const { data, isLoading, isFetching } = useRemindersPage(effective, page, pageSize);
  const rows = (data?.rows ?? []) as (ReminderRow & { reorder_order_number?: string | null })[];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  if (isLoading && rows.length === 0) return <div className="h-40 a-skeleton rounded-xl" />;
  if (rows.length === 0) return <EmptyState icon={<CheckCircle2 size={18} />} title="No completed reminders" />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-[12.5px] table-fixed">
          <thead className="bg-muted/60 border-b-2 border-border">
            <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground [&>th]:whitespace-nowrap [&>th]:!text-center [&>th]:py-2.5">
              <th className="px-3 py-3 w-[20%] min-w-[150px]">Customer</th>
              <th className="px-3 py-3 w-[22%] min-w-[160px]">Product</th>
              <th className="px-3 py-3 w-[14%] min-w-[110px]">Original Reminder</th>
              <th className="px-3 py-3 w-[14%] min-w-[110px]">Conversion Date</th>
              <th className="px-3 py-3 w-[14%] min-w-[110px]">Order ID</th>
              <th className="px-3 py-3 w-[16%] min-w-[110px]">Revenue Recovered</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => {
              const orderLabel = r.reorder_order_number
                ? `#${r.reorder_order_number}`
                : r.reorder_order_id ? `#${r.reorder_order_id.slice(0, 8)}` : "—";
              const conversionDate = r.resolved_at || r.completed_at || r.updated_at;
              return (
                <tr
                  key={r.id}
                  onClick={() => onAction(r)}
                  className="hover:bg-muted/30 cursor-pointer [&>td]:px-3 [&>td]:py-3 [&>td]:align-middle [&>td]:text-center"
                >
                  <td>
                    <div className="font-medium leading-tight truncate">{r.customer_name || "—"}</div>
                    <div className="text-muted-foreground/70 text-[10.5px] tabular-nums">{r.customer_phone}</div>
                  </td>
                  <td className="truncate" title={r.product_name_snapshot || undefined}>
                    <span className="block truncate">{r.product_name_snapshot}</span>
                  </td>
                  <td className="tabular-nums whitespace-nowrap">{fmtDate(r.due_date)}</td>
                  <td className="tabular-nums whitespace-nowrap">{conversionDate ? fmtDate(conversionDate) : "—"}</td>
                  <td className="tabular-nums whitespace-nowrap">{orderLabel}</td>
                  <td className="tabular-nums whitespace-nowrap font-medium" style={{ color: "#1d8a3a" }}>
                    {r.reorder_amount ? fmtMoney(Number(r.reorder_amount)) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <PaginationFooter
        page={page} pageCount={pageCount} pageSize={pageSize} total={total}
        onPage={setPage} onPageSize={setPageSize} updating={isFetching}
      />
    </div>
  );
}

function PaginationFooter({
  page, pageCount, pageSize, total, onPage, onPageSize, updating,
}: {
  page: number; pageCount: number; pageSize: number; total: number;
  onPage: (p: number) => void; onPageSize: (n: number) => void; updating?: boolean;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <p className="text-[11.5px] text-muted-foreground">
        Page {page} of {pageCount} · {total} entries{updating ? " · updating…" : ""}
      </p>
      <div className="flex items-center gap-2">
        <Select value={String(pageSize)} onValueChange={(v) => onPageSize(Number(v))}>
          <SelectTrigger className="h-8 w-[110px] text-[11.5px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[25, 50, 100, 200].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => onPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="px-3 py-1.5 text-[11.5px] rounded-lg border border-border bg-background hover:bg-muted/60 disabled:opacity-40"
        >Prev</button>
        <button
          onClick={() => onPage(Math.min(pageCount, page + 1))}
          disabled={page >= pageCount}
          className="px-3 py-1.5 text-[11.5px] rounded-lg border border-border bg-background hover:bg-muted/60 disabled:opacity-40"
        >Next</button>
      </div>
    </div>
  );
}


// ── Overdue formatting & priority ───────────────────────
function formatOverdue(days: number): string {
  if (days <= 0) return "—";
  if (days < 30) return `${days} Day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30);
  const rem = days - months * 30;
  if (rem === 0) return `${months} Month${months === 1 ? "" : "s"}`;
  return `${months} Month${months === 1 ? "" : "s"} ${rem} Day${rem === 1 ? "" : "s"}`;
}
function overdueTone(days: number): "warning" | "danger" | "neutral" {
  if (days >= 31) return "danger";   // Critical
  if (days >= 8) return "danger";    // High Priority
  if (days >= 1) return "warning";   // Warning
  return "neutral";
}

// ── Shared table ────────────────────────────────────────
function ReminderTable({
  rows, today, custMap, priceMap, liveMap, linePriceMap, onAction, onOpenCustomer, onCreateOrder, selected, onToggleSelect, onToggleAll,
  dueLabel = "Due / Overdue", showCompleted = false,
  showMissed = false, showEarlyBadge = false, selectMode = false,
  showSourceBadge = false, hideStatusBadge = false,
  reminderDateLabel = "Reminder Date",
}: {
  rows: ReminderRow[]; today: string;
  custMap?: Record<string, { total_orders: number; total_spent: number }>;
  priceMap?: Record<string, number>;
  liveMap?: Record<string, LiveProduct>;
  linePriceMap?: Record<string, number>;

  onAction: (r: ReminderRow) => void;
  onOpenCustomer: (p: string) => void;
  onCreateOrder: (
    src: { phone: string; name?: string; email?: string; orderId?: string | null; reminderId?: string | null; productId?: string | null; productName?: string | null },
  ) => void;
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (checked: boolean) => void;
  dueLabel?: string;
  showCompleted?: boolean;
  showMissed?: boolean; showEarlyBadge?: boolean;
  selectMode?: boolean;
  showSourceBadge?: boolean;
  hideStatusBadge?: boolean;
  reminderDateLabel?: string;
}) {
  const update = useUpdateReminder();
  const { toast } = useToast();

  const handleStatusChange = async (r: ReminderRow, value: ReminderStatus) => {
    if (value === r.status) return;
    const stamp = new Date().toISOString();
    const patch: Partial<ReminderRow> = { status: value };
    if (value === "called" || value === "no_response") patch.called_at = stamp;
    if (["purchased_again", "manually_closed", "not_interested", "do_not_remind"].includes(value)) {
      patch.completed_at = stamp;
      patch.resolved_at = stamp;
    }
    try {
      await update.mutateAsync({ id: r.id, patch });
      toast({ title: `Moved to ${STATUS_LABEL[value]}` });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  return (
    <>
      {/* Mobile card list */}
      <div className="lg:hidden space-y-2">
        {rows.map((r) => {
          const refDate = refDateFor(r);
          const diff = daysBetween(today, refDate);
          const live = r.product_id ? liveMap?.[r.product_id] : undefined;
          const liveName = live?.name || r.product_name_snapshot || "—";
          const livePrice = live?.price ?? linePriceMap?.[r.id] ?? (r.product_id ? priceMap?.[r.product_id] : undefined);
          const latestPrice = livePrice;
          const availability: { label: string; tone: "ok" | "warn" | "bad" } | null = !r.product_id
            ? null
            : !live
              ? { label: "Deleted", tone: "bad" }
              : !live.active
                ? { label: "Inactive", tone: "warn" }
                : live.stock <= 0
                  ? { label: "Out of stock", tone: "bad" }
                  : live.stock <= 5
                    ? { label: "Low stock", tone: "warn" }
                    : { label: "In stock", tone: "ok" };


          const isSel = selectMode && selected.has(r.id);
          const handleRowClick = () => {
            if (selectMode) onToggleSelect(r.id);
            else onAction(r);
          };
          return (
            <div
              key={r.id}
              onClick={handleRowClick}
              className={`relative rounded-xl border p-3 cursor-pointer transition-colors ${isSel ? "border-foreground bg-foreground/[0.04] ring-1 ring-foreground/20" : "border-border/60 bg-background active:bg-muted/40"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className="min-w-0 flex-1"
                  onClick={(e) => { e.stopPropagation(); if (!selectMode) onOpenCustomer(r.customer_phone); else onToggleSelect(r.id); }}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-[13px] leading-tight truncate">{r.customer_name || "—"}</span>
                    {!hideStatusBadge && r.status === "no_response" && <StatusPill tone="warning" noDot>No Response</StatusPill>}
                    {!hideStatusBadge && r.status === "follow_up" && <StatusPill tone="info" noDot>Follow Up</StatusPill>}
                    {showSourceBadge && r.status === "interested" && <StatusPill tone="info" noDot>Interested</StatusPill>}
                  </div>
                  <div className="text-muted-foreground/70 text-[11px] tabular-nums mt-0.5">{r.customer_phone}</div>
                </div>
                {selectMode ? (
                  <span
                    aria-hidden
                    className={`inline-flex items-center justify-center h-5 w-5 rounded-full shrink-0 transition-colors ${isSel ? "bg-foreground text-background" : "border border-border/70 bg-background"}`}
                  >
                    {isSel && <Check size={12} strokeWidth={3} />}
                  </span>
                ) : (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 rounded-md shrink-0 hover:bg-muted/60"
                    onClick={(e) => { e.stopPropagation(); onAction(r); }}
                    aria-label="Open action"
                  >
                    <SlidersHorizontal size={15} />
                  </Button>
                )}
              </div>

              <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-foreground/80 min-w-0" title={liveName}>
                <span className="truncate">{liveName}</span>
                {availability && (
                  <span className={`shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    availability.tone === "bad" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                    availability.tone === "warn" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  }`}>{availability.label}</span>
                )}
              </div>


              <div className="mt-2 grid grid-cols-3 gap-2">
                <div className="min-w-0">
                  <div className="text-muted-foreground/60 uppercase tracking-wide text-[9px] font-medium">Price</div>
                  <div className="tabular-nums text-[11.5px] font-medium truncate">
                    {latestPrice != null ? fmtMoney(latestPrice) : "—"}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-muted-foreground/60 uppercase tracking-wide text-[9px] font-medium truncate">{reminderDateLabel}</div>
                  <div className="tabular-nums text-[11.5px] font-medium truncate">{fmtDate(refDate)}</div>
                </div>
                <div className="min-w-0">
                  <div className="text-muted-foreground/60 uppercase tracking-wide text-[9px] font-medium">Last Contact</div>
                  <div className="tabular-nums text-[11.5px] font-medium truncate">
                    {r.last_contacted_at ? fmtDate(r.last_contacted_at) : "—"}
                  </div>
                </div>
              </div>

              {showMissed && (
                <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-1.5">
                  <span className="text-[9.5px] text-muted-foreground/70 uppercase tracking-wide font-medium">Overdue by</span>
                  <StatusPill tone={overdueTone(diff)} noDot>{formatOverdue(diff)}</StatusPill>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full text-[12.5px] table-fixed">
          <thead className="bg-muted/60 border-b-2 border-border">
            <tr className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground [&>th]:whitespace-nowrap [&>th]:!text-center [&>th]:py-2.5">
              {selectMode && (
                <th className="px-3 py-3 w-[44px]">
                  <div className="flex items-center justify-center">
                    <Checkbox
                      checked={rows.length > 0 && rows.every((r) => selected.has(r.id))}
                      onCheckedChange={(c) => onToggleAll(!!c)}
                      aria-label="Select all"
                    />
                  </div>
                </th>
              )}
              {showSourceBadge && <th className="px-3 py-3 w-[110px] min-w-[100px]">Source</th>}
              <th className="px-3 py-3 w-[20%] min-w-[150px]">Customer</th>
              <th className="px-3 py-3 w-[20%] min-w-[150px]">Product</th>
              <th className="px-3 py-3 w-[10%] min-w-[80px]">Price</th>
              <th className="px-3 py-3 w-[12%] min-w-[100px]">Last Purchase</th>
              <th className="px-3 py-3 w-[12%] min-w-[100px]">{reminderDateLabel}</th>
              <th className="px-3 py-3 w-[12%] min-w-[100px]">Last Contacted</th>
              {showMissed && <th className="px-3 py-3 w-[12%] min-w-[110px]">Overdue By</th>}

              <th className="px-3 py-3 w-[70px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.map((r) => {
              const refDate = refDateFor(r);
              const diff = daysBetween(today, refDate); // positive = overdue
              const live = r.product_id ? liveMap?.[r.product_id] : undefined;
              const liveName = live?.name || r.product_name_snapshot || "—";
              const latestPrice = live?.price ?? linePriceMap?.[r.id] ?? (r.product_id ? priceMap?.[r.product_id] : undefined);
              const availability: { label: string; tone: "ok" | "warn" | "bad" } | null = !r.product_id
                ? null
                : !live
                  ? { label: "Deleted", tone: "bad" }
                  : !live.active
                    ? { label: "Inactive", tone: "warn" }
                    : live.stock <= 0
                      ? { label: "Out of stock", tone: "bad" }
                      : live.stock <= 5
                        ? { label: "Low stock", tone: "warn" }
                        : null;
              const earlyBadge = showEarlyBadge && r.status === "purchased_again" && r.completed_at
                && r.completed_at.slice(0, 10) < r.due_date;
              const handleRowClick = () => {
                if (selectMode) onToggleSelect(r.id);
                else onAction(r);
              };
              return (
                <tr
                  key={r.id}
                  onClick={handleRowClick}
                  className={`hover:bg-muted/30 [&>td]:px-3 [&>td]:py-3 [&>td]:align-middle [&>td]:text-center cursor-pointer ${selectMode && selected.has(r.id) ? "bg-muted/40" : ""}`}
                >
                  {selectMode && (
                    <td onClick={(e) => { e.stopPropagation(); onToggleSelect(r.id); }}>
                      <div className="flex items-center justify-center">
                        <Checkbox checked={selected.has(r.id)} onCheckedChange={() => onToggleSelect(r.id)} aria-label="Select row" />
                      </div>
                    </td>
                  )}
                  {showSourceBadge && (
                    <td onClick={(e) => e.stopPropagation()} className="whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        {r.status === "no_response" ? (
                          <StatusPill tone="warning" noDot className="whitespace-nowrap">No Response</StatusPill>
                        ) : r.status === "follow_up" ? (
                          <StatusPill tone="info" noDot className="whitespace-nowrap">Follow Up</StatusPill>
                        ) : r.status === "interested" ? (
                          <StatusPill tone="info" noDot className="whitespace-nowrap">Interested</StatusPill>
                        ) : (
                          <StatusPill tone="success" noDot className="whitespace-nowrap">Today</StatusPill>
                        )}
                      </div>
                    </td>
                  )}
                  <td onClick={(e) => { e.stopPropagation(); onOpenCustomer(r.customer_phone); }}>
                    <div className="flex items-center justify-center gap-1.5">
                      <span className="font-medium leading-tight truncate">{r.customer_name || "—"}</span>
                      {!hideStatusBadge && r.status === "no_response" && <StatusPill tone="warning">No Response</StatusPill>}
                      {!hideStatusBadge && r.status === "follow_up" && <StatusPill tone="info">Follow Up</StatusPill>}
                    </div>
                    <div className="text-muted-foreground/70 text-[10.5px] tabular-nums">{r.customer_phone}</div>
                  </td>

                  <td className="truncate" title={liveName}>
                    <div className="flex items-center justify-center gap-1.5 min-w-0">
                      <span className="block truncate">{liveName}</span>
                      {availability && (
                        <span className={`shrink-0 text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          availability.tone === "bad" ? "bg-red-500/10 text-red-600 dark:text-red-400" :
                          availability.tone === "warn" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" :
                          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}>{availability.label}</span>
                      )}
                    </div>
                  </td>
                  <td className="tabular-nums whitespace-nowrap">
                    {latestPrice != null ? fmtMoney(latestPrice) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="tabular-nums whitespace-nowrap">{fmtDate(r.purchase_date)}</td>
                  <td className="tabular-nums whitespace-nowrap">{fmtDate(refDate)}</td>
                  <td className="tabular-nums whitespace-nowrap">
                    {r.last_contacted_at ? fmtDate(r.last_contacted_at) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  {showMissed && (
                    <td className="whitespace-nowrap">
                      <div className="flex items-center justify-center">
                        <StatusPill tone={overdueTone(diff)} noDot>{formatOverdue(diff)}</StatusPill>
                      </div>
                    </td>
                  )}
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-center">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-md hover:bg-muted/60"
                        onClick={() => onAction(r)}
                        title="Open action"
                        aria-label="Open action"
                      >
                        <SlidersHorizontal size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default ReorderReminders;
