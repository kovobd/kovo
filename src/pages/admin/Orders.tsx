import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAdminOrdersPage,
  useAdminOrderStatusCounts,
  fetchAllFilteredOrders,
  adminKeys,
  type AdminOrderFilters,
  type AdminOrdersPage,
} from "@/hooks/useAdminData";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, Pencil, Save, X, Plus, FileText, Printer, Search, Truck, Gift, Tag,
  Grid3X3, List, Check, Download, CheckSquare, Square, Clock, Package, CircleCheck,
  CircleX, Loader2, ArrowRight, Copy, Phone, Mail, MapPin, Trash2, CreditCard, User
} from "lucide-react";
import { dashboardKeys } from "@/hooks/useDashboardMetrics";
import { CURRENCY_SYMBOL } from "@/lib/currency";
const printInvoice = async (...args: Parameters<typeof import("@/lib/invoice").printInvoice>) => {
  const mod = await import("@/lib/invoice");
  return mod.printInvoice(...args);
};

import {
  getAllProductOffers,
  calculateAppliedOffers,
  type ProductOffer,
} from "@/lib/productOffers";
import type { CartItem } from "@/data/cartStore";
import { cn } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/cdnImage";
import BdCourierCard from "@/components/admin/BdCourierCard";
import OrderForm from "./components/OrderForm";
import { SearchableSelect } from "@/components/admin/SearchableSelect";
import { loadPathaoCities, loadPathaoZones, loadPathaoAreas } from "@/lib/pathaoLocations";
import { computeDiscountAmount } from "@/lib/discount";

const statusOptions = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"];
const paymentStatuses = ["pending", "paid", "failed", "refunded"];

const STATUS_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  all: { icon: Package, color: "text-foreground", bg: "bg-foreground text-background", label: "All" },
  pending: { icon: Clock, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400", label: "Pending" },
  confirmed: { icon: Check, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400", label: "Confirmed" },
  processing: { icon: Loader2, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400", label: "Processing" },
  shipped: { icon: Truck, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400", label: "Shipped" },
  delivered: { icon: CircleCheck, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400", label: "Delivered" },
  cancelled: { icon: CircleX, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400", label: "Cancel" },
};

const paymentColor = (s: string) => {
  switch (s) {
    case "paid": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "failed": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "refunded": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
  }
};

const DEFAULT_PAGE_SIZE = 50;

const Orders = () => {
  const qc = useQueryClient();
  const statusTabsScrollRef = useRef<HTMLDivElement>(null);
  const statusTabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // ── Pagination + filter state (declared before hooks that depend on them) ──
  const [searchQuery, setSearchQuery] = useState("");
  const [statusTab, setStatusTab] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const filters = useMemo<AdminOrderFilters>(
    () => ({ status: statusTab, search: searchQuery, payment: paymentFilter, dateFilter }),
    [statusTab, searchQuery, paymentFilter, dateFilter]
  );
  const countsFilters = useMemo(
    () => ({ search: searchQuery, payment: paymentFilter, dateFilter }),
    [searchQuery, paymentFilter, dateFilter]
  );

  // Reset to page 1 whenever filters change.
  useEffect(() => { setPage(1); }, [statusTab, searchQuery, paymentFilter, dateFilter, pageSize]);

  // Mobile: scroll active status tab into view on selection.
  useEffect(() => {
    const container = statusTabsScrollRef.current;
    const activeBtn = statusTabRefs.current.get(statusTab);
    if (!container || !activeBtn) return;
    // Only run the auto-scroll on narrow viewports where horizontal scrolling is active.
    if (window.innerWidth >= 640) return;
    const containerRect = container.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();
    const currentScroll = container.scrollLeft;
    const offset = btnRect.left - containerRect.left + currentScroll;
    const center = offset - containerRect.width / 2 + btnRect.width / 2;
    container.scrollTo({ left: Math.max(0, center), behavior: "smooth" });
  }, [statusTab]);

  const { data: pageData, isLoading: loading, isFetching } = useAdminOrdersPage(filters, page, pageSize);
  const { data: statusCountsData } = useAdminOrderStatusCounts(countsFilters);

  const orders: any[] = pageData?.rows ?? [];
  const totalRows = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const statusCounts: Record<string, number> =
    statusCountsData ?? { all: 0, pending: 0, confirmed: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };

  // ── Helpers to patch the paged query cache without refetching ──
  const patchOrderInCache = useCallback((orderId: string, patch: Record<string, any>) => {
    qc.setQueriesData<AdminOrdersPage>(
      { queryKey: [...adminKeys.orders, "page"] },
      (old) => {
        if (!old?.rows) return old as any;
        return { ...old, rows: old.rows.map((o: any) => (o.id === orderId ? { ...o, ...patch } : o)) };
      }
    );
  }, [qc]);
  const patchManyOrdersInCache = useCallback((ids: string[], patch: Record<string, any>) => {
    const idSet = new Set(ids);
    qc.setQueriesData<AdminOrdersPage>(
      { queryKey: [...adminKeys.orders, "page"] },
      (old) => {
        if (!old?.rows) return old as any;
        return { ...old, rows: old.rows.map((o: any) => (idSet.has(o.id) ? { ...o, ...patch } : o)) };
      }
    );
  }, [qc]);



  const [products, setProducts] = useState<any[]>([]);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [productOffers, setProductOffers] = useState<ProductOffer[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [creating, setCreating] = useState(false);
  // productSearch / viewMode are now form-local state inside OrderForm.
  const [sendingToCourier, setSendingToCourier] = useState(false);
  const [courierDialogOpen, setCourierDialogOpen] = useState(false);
  const [courierOverrides, setCourierOverrides] = useState({ pathao_city_id: "", pathao_zone_id: "", pathao_area_id: "" });
  const [pathaoCities, setPathaoCities] = useState<{ id: number; name: string }[]>([]);
  const [pathaoZones, setPathaoZones] = useState<{ id: number; name: string }[]>([]);
  const [pathaoAreas, setPathaoAreas] = useState<{ id: number; name: string }[]>([]);
  const [pathaoLoading, setPathaoLoading] = useState(false);

  // Filter state is declared at the top of the component (drives pagination hooks).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPayment, setBulkPayment] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [activeCourier, setActiveCourier] = useState<{ slug: string; name: string } | null>(null);
  const [courierWarning, setCourierWarning] = useState("No courier integration is connected.");
  const { toast: courierToast } = useToast();

  const invalidateDashboard = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["admin", "dashboard-full"] });
  }, [qc]);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkStatus("");
    setBulkPayment("");
  }, []);

  const courierConnected = !!activeCourier;
  const courierSupportsBulk = activeCourier?.slug === "steadfast";
  const courierSupportsLocationOverride = activeCourier?.slug === "pathao";

  const pushPendingToCourier = async () => {
    if (!activeCourier) {
      courierToast({ title: "Courier not connected", description: courierWarning, variant: "destructive" });
      return;
    }
    if (!courierSupportsBulk) {
      courierToast({ title: "Bulk push not supported", description: `${activeCourier.name} does not support bulk push.`, variant: "destructive" });
      return;
    }
    setBulkBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("steadfast-proxy", { body: { action: "bulk_create" } });
      if (error) throw error;
      if ((data as any)?.skipped === "not_connected") {
        courierToast({ title: "Courier not connected", description: "Connect a courier in Settings → Courier API.", variant: "destructive" });
        return;
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      const count = (data as any)?.count ?? 0;
      const total = (data as any)?.total ?? 0;
      courierToast({ title: "Courier sync complete", description: `${count}/${total} orders pushed` });
      qc.invalidateQueries({ queryKey: adminKeys.orders });
    } catch (e: any) {
      const message = e?.message || "Courier push failed";
      courierToast({
        title: /not active/i.test(message) ? "Courier account inactive" : "Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const [deliveryZones, setDeliveryZones] = useState<import("@/lib/checkoutOptions").DeliveryZone[]>([]);
  const [newOrder, setNewOrder] = useState<any>({
    customer_name: "", customer_email: "", customer_phone: "",
    shipping_address: { country: "Bangladesh", district: "", city: "", line1: "" },
    items: [] as any[],
    shipping_cost: 0, discount_amount: 0, discount_type: "fixed", coupon_code: "", notes: "",
    payment_method: "cod",
    order_status: "pending", payment_status: "pending",
  });
  const { toast } = useToast();

  const fetchOrders = useCallback(async () => {
    qc.invalidateQueries({ queryKey: adminKeys.orders });
  }, [qc]);

  useEffect(() => {
    import("@/lib/productMedia").then(async ({ attachImagesToProducts }) => {
      const { ensureAdminProductsLite } = await import("@/hooks/useAdminProductsLite");
      Promise.all([
        ensureAdminProductsLite().then(async (rows) => setProducts(await attachImagesToProducts(rows ?? []) as any)),
        supabase.from("coupons").select("id,code,discount_type,discount_value,min_cart_total,min_order_amount,max_uses,used_count,enabled,start_date,end_date,expires_at").eq("enabled", true).then(r => setCoupons(r.data ?? [])),
        getAllProductOffers().then(setProductOffers),
        import("@/lib/checkoutOptions").then(({ fetchActiveDeliveryZones }) => fetchActiveDeliveryZones().then(setDeliveryZones)),
      ]);
    });
  }, []);

  useEffect(() => {
    const loadActiveCourier = async () => {
      const { data } = await supabase
        .from("delivery_partners")
        .select("slug, name, enabled, config")
        .eq("enabled", true);
      const partners = (data as any[]) || [];
      const isConnected = (p: any) => {
        const cfg = p?.config || {};
        if (p?.slug === "steadfast") return cfg.connected === true && !!cfg.api_key && !!cfg.secret_key;
        if (p?.slug === "pathao") return !!(cfg.client_id && cfg.client_secret && cfg.username && cfg.password);
        if (p?.slug === "redx") return !!cfg.api_token;
        return !!cfg.api_token;
      };
      const connected = partners.find(isConnected);
      if (connected) {
        setActiveCourier({ slug: connected.slug, name: connected.name || connected.slug });
        setCourierWarning("");
      } else if (partners.length > 0) {
        setActiveCourier(null);
        setCourierWarning(
          partners[0]?.config?.connection_error ||
            "A courier is enabled but credentials are incomplete. Finish setup in Settings → Courier API.",
        );
      } else {
        setActiveCourier(null);
        setCourierWarning("No courier integration is connected.");
      }
    };
    loadActiveCourier();

    // Visibility-paused realtime: pause subscription while the tab is hidden
    // (same pattern as useAdminNotifications) so background tabs don't keep a
    // realtime connection open and rack up usage.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const subscribe = () => {
      if (channel) return;
      channel = supabase
        .channel(`delivery_partners-active:${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "delivery_partners" }, loadActiveCourier)
        .subscribe();
    };
    const unsubscribe = () => {
      if (channel) { supabase.removeChannel(channel); channel = null; }
    };
    const onVis = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible") { subscribe(); loadActiveCourier(); }
      else unsubscribe();
    };
    if (typeof document !== "undefined" && document.visibilityState === "visible") subscribe();
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis);
    const onFocus = () => loadActiveCourier();
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribe();
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, []);


  // statusCounts comes from useAdminOrderStatusCounts (server-computed, respects current filters).

  // Quick status update
  const quickStatusUpdate = async (orderId: string, newStatus: string) => {
    const { error } = await supabase.from("orders").update({ order_status: newStatus }).eq("id", orderId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      patchOrderInCache(orderId, { order_status: newStatus });
      qc.invalidateQueries({ queryKey: [...adminKeys.orders, "counts"] });
      if (selected?.id === orderId) setSelected((prev: any) => ({ ...prev, order_status: newStatus }));
      toast({ title: `Status → ${newStatus}` });
    }
  };

  const quickPaymentUpdate = async (orderId: string, newStatus: string) => {
    const { data, error } = await supabase.from("orders").update({ payment_status: newStatus }).eq("id", orderId).select("paid_at, updated_at").maybeSingle();
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const patch: any = { payment_status: newStatus, ...(data || {}) };
      patchOrderInCache(orderId, patch);
      if (selected?.id === orderId) setSelected((prev: any) => ({ ...prev, ...patch }));
      invalidateDashboard();
      toast({ title: `Payment → ${newStatus}` });
    }
  };

  const softDeleteOrder = async (orderId: string) => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("orders").update({ deleted_at: new Date().toISOString() }).eq("id", orderId);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: adminKeys.orders });
      invalidateDashboard();
      setDeleteOpen(false);
      setSelected(null);
      toast({ title: "Order deleted" });
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleBulkPaymentUpdate = async () => {
    if (!bulkPayment || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    const { error } = await supabase.from("orders").update({ payment_status: bulkPayment }).in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      patchManyOrdersInCache(ids, { payment_status: bulkPayment });
      qc.invalidateQueries({ queryKey: adminKeys.orders });
      invalidateDashboard();
      setBulkPayment("");
      toast({ title: `${ids.length} payment${ids.length !== 1 ? "s" : ""} → ${bulkPayment}` });
      exitSelectionMode();
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    const { error } = await supabase.from("orders").update({ deleted_at: new Date().toISOString() }).in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      qc.invalidateQueries({ queryKey: adminKeys.orders });
      invalidateDashboard();
      setBulkDeleteOpen(false);
      exitSelectionMode();
      toast({ title: `${ids.length} order${ids.length !== 1 ? "s" : ""} deleted` });
    }
  };

  const sendToCourier = async (order: any, overrides?: { pathao_city_id?: string; pathao_zone_id?: string; pathao_area_id?: string }) => {
    if (!activeCourier) {
      toast({ title: "Courier not connected", description: courierWarning, variant: "destructive" });
      return;
    }
    setSendingToCourier(true);
    try {
      if (activeCourier.slug === "steadfast") {
        const { data, error } = await supabase.functions.invoke("steadfast-proxy", { body: { action: "create_order", orderId: order.id } });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        if ((data as any)?.skipped === "not_connected") throw new Error("Connect a courier in Settings → Courier API.");
        const c = (data as any)?.consignment || {};
        const trackingCode = c.tracking_code || c.consignment_id || order.steadfast_tracking_code || order.steadfast_consignment_id;
        const updated = {
          ...order,
          steadfast_consignment_id: c.consignment_id ? String(c.consignment_id) : order.steadfast_consignment_id,
          steadfast_tracking_code: c.tracking_code ?? order.steadfast_tracking_code,
          steadfast_status: c.status ?? order.steadfast_status ?? "in_review",
          delivery_partner: "steadfast",
          tracking_number: trackingCode || order.tracking_number,
          courier_sync_failed: false,
          courier_last_error: null,
        };
        setSelected(updated);
        patchOrderInCache(order.id, updated);
        qc.invalidateQueries({ queryKey: adminKeys.orders });
        toast({ title: "Sent to courier", description: trackingCode ? `Tracking: ${trackingCode}` : "Order submitted" });
        return;
      }

      const { data: allPartners } = await supabase.from("delivery_partners").select("id,name,slug,enabled,config").eq("enabled", true);
      const enabledPartners = (allPartners as any[]) || [];
      const partner = enabledPartners.find((p) => p.slug === activeCourier.slug)
        || enabledPartners.find((p) => p.slug === "pathao")
        || enabledPartners.find((p) => p.slug === "redx");
      if (!partner) {
        toast({ title: "No courier configured", description: "Enable a courier in Settings → Courier API", variant: "destructive" });
        return;
      }
      const addr = order.shipping_address || {};
      const fullAddress = [addr.line1, addr.city, addr.district, addr.country].filter(Boolean).join(", ");
      const itemDesc = ((order.items as any[]) || []).map((i: any) => `${i.name} x${i.quantity}`).join(", ");
      const totalQty = ((order.items as any[]) || []).reduce((s: number, i: any) => s + (i.quantity || 1), 0);
      const resp = await supabase.functions.invoke("courier-proxy", {
        body: {
          action: "send_order", partner_id: partner.id,
          order_data: {
            order_number: order.order_number, customer_name: order.customer_name,
            customer_phone: order.customer_phone || "", full_address: fullAddress,
            city: addr.city || "", district: addr.district || "", notes: order.notes || "",
            total_quantity: totalQty, item_description: itemDesc, total: order.total,
            ...(overrides?.pathao_city_id ? { pathao_city_id: overrides.pathao_city_id } : {}),
            ...(overrides?.pathao_zone_id ? { pathao_zone_id: overrides.pathao_zone_id } : {}),
            ...(overrides?.pathao_area_id ? { pathao_area_id: overrides.pathao_area_id } : {}),
          },
        },
      });
      const result = resp.data;
      if (result?.success && result?.tracking_id) {
        const { error: upErr } = await supabase.from("orders").update({ tracking_number: result.tracking_id, order_status: "confirmed" }).eq("id", order.id);
        if (upErr) {
          toast({ title: "Tracking saved on courier but not locally", description: upErr.message, variant: "destructive" });
        } else {
          const updated = { ...order, tracking_number: result.tracking_id, order_status: "confirmed" };
          setSelected(updated);
          patchOrderInCache(order.id, { tracking_number: result.tracking_id, order_status: "confirmed" });
          qc.invalidateQueries({ queryKey: [...adminKeys.orders, "counts"] });
          toast({ title: "Sent to courier", description: result.message });
        }
      } else {
        toast({ title: "Courier error", description: result?.message || result?.error || "Unknown error", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingToCourier(false);
      setCourierDialogOpen(false);
    }
  };


  const startEdit = () => {
    setEditData({
      customer_name: selected.customer_name,
      customer_email: selected.customer_email,
      customer_phone: selected.customer_phone || "",
      shipping_address: selected.shipping_address || { country: "Bangladesh", district: "", city: "", line1: "", landmark: "" },
      items: JSON.parse(JSON.stringify((selected.items || []).filter((i: any) => !i.is_free_gift))),
      shipping_cost: Number(selected.shipping_cost) || 0,
      discount_amount: Number(selected.discount_amount) || 0,
      discount_type: (selected as any).discount_type || "fixed",
      coupon_code: selected.coupon_code || "",
      notes: selected.notes || "",
      order_status: selected.order_status,
      payment_status: selected.payment_status,
    });
    setEditing(true);
  };

  // Offer + coupon helpers
  const productNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { m[p.id] = p.name; });
    return m;
  }, [products]);

  const productPriceMap = useMemo(() => {
    const m: Record<string, number> = {};
    products.forEach(p => { m[p.id] = p.sale_price && p.sale_price < p.price ? p.sale_price : p.price; });
    return m;
  }, [products]);

  const productImageMap = useMemo(() => {
    const m: Record<string, string> = {};
    products.forEach(p => { m[p.id] = p.images?.[0] || ""; });
    return m;
  }, [products]);

  const toCartItems = (items: any[]): CartItem[] =>
    items.filter((i: any) => !i.is_free_gift).map((i: any) => ({
      id: i.product_id || i.id || "",
      productId: i.product_id || i.id || "",
      name: i.name,
      price: Number(i.price),
      image: i.image || "",
      quantity: i.quantity || 1,
    }));

  const computeOffers = (items: any[]) => {
    const cartItems = toCartItems(items);
    const appliedOffers = calculateAppliedOffers(cartItems, productOffers, productNameMap, productPriceMap);
    const offerDiscount = appliedOffers.reduce((s, o) => s + o.discountAmount, 0);
    const freeGiftItems = appliedOffers.flatMap(ao =>
      ao.freeItems.map(f => ({
        product_id: f.productId, name: f.productName, quantity: f.quantity, price: 0,
        image: productImageMap[f.productId] || "", is_free_gift: true, offer_text: ao.displayText,
      }))
    );
    return { appliedOffers, freeGiftItems, offerDiscount };
  };

  const computeCouponDiscount = (data: any) => {
    if (!data.coupon_code) return 0;
    const coupon = coupons.find(c => c.code.toLowerCase() === data.coupon_code.toLowerCase());
    if (!coupon) return 0;
    const subtotal = data.items.reduce((sum: number, item: any) => sum + (Number(item.price) * (item.quantity || 1)), 0);
    if (coupon.min_order_amount && subtotal < Number(coupon.min_order_amount)) return 0;
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return 0;
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return 0;
    if (coupon.discount_type === "percentage") return Math.round(subtotal * Number(coupon.discount_value) / 100);
    return Math.min(Number(coupon.discount_value), subtotal);
  };

  const saveEdit = async () => {
    if (!selected || formSaving) return;
    setFormSaving(true);
    try {
      const { appliedOffers, freeGiftItems, offerDiscount } = computeOffers(editData.items);
      const couponDisc = computeCouponDiscount(editData);
      const subtotal = editData.items.reduce((sum: number, item: any) => sum + (Number(item.price) * (item.quantity || 1)), 0);
      const manualDisc = computeDiscountAmount(editData.discount_type, editData.discount_amount, subtotal);
      const totalDiscount = Math.min(subtotal, offerDiscount + couponDisc + manualDisc);
      const total = Math.max(0, subtotal - totalDiscount + Number(editData.shipping_cost));
      const allItems = [...editData.items, ...freeGiftItems];

      // Compute net stock delta vs. the saved order so admin edits don't
      // silently desync inventory. We only decrement on net increases —
      // reductions/removals are NOT auto-restocked (admin should adjust
      // stock manually to avoid double-counting cancellations).
      const keyOf = (i: any) => `${i.product_id || i.id || ""}::${i.variant_id || ""}`;
      const oldMap = new Map<string, number>();
      ((selected.items as any[]) || []).forEach((i: any) => {
        const k = keyOf(i);
        if (!k.startsWith("::")) oldMap.set(k, (oldMap.get(k) || 0) + (Number(i.quantity) || 0));
      });
      const newMap = new Map<string, number>();
      allItems.forEach((i: any) => {
        const k = keyOf(i);
        if (!k.startsWith("::")) newMap.set(k, (newMap.get(k) || 0) + (Number(i.quantity) || 0));
      });
      const stockDeltas: { product_id: string; variant_id: string | null; delta: number }[] = [];
      newMap.forEach((qty, k) => {
        const delta = qty - (oldMap.get(k) || 0);
        if (delta > 0) {
          const [product_id, variant_id] = k.split("::");
          stockDeltas.push({ product_id, variant_id: variant_id || null, delta });
        }
      });

      const { error } = await supabase.from("orders").update({
        customer_name: editData.customer_name, customer_email: editData.customer_email,
        customer_phone: editData.customer_phone || null, shipping_address: editData.shipping_address,
        items: allItems, subtotal, shipping_cost: editData.shipping_cost,
        discount_amount: totalDiscount, coupon_code: editData.coupon_code || null, total,
        notes: editData.notes || null, order_status: editData.order_status, payment_status: editData.payment_status,
        payment_method: editData.payment_method || "cod",
      }).eq("id", selected.id);

      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        if (stockDeltas.length > 0) {
          await Promise.all(stockDeltas.map((s) =>
            s.variant_id
              ? supabase.rpc("decrement_variant_stock", { _variant_id: s.variant_id, _quantity: s.delta })
              : supabase.rpc("decrement_product_stock", { _product_id: s.product_id, _quantity: s.delta })
          ));
        }
        const updated = { ...selected, ...editData, items: allItems, subtotal, total, discount_amount: totalDiscount };
        setSelected(updated);
        patchOrderInCache(selected.id, { ...editData, items: allItems, subtotal, total, discount_amount: totalDiscount });
        qc.invalidateQueries({ queryKey: [...adminKeys.orders, "counts"] });
        setEditing(false);
        toast({ title: "Order updated" });
      }
    } finally {
      setFormSaving(false);
    }
  };






  const createOrder = async () => {
    if (formSaving) return;
    if (!newOrder.customer_name || !newOrder.customer_phone) {
      toast({ title: "Please fill customer name and phone", variant: "destructive" });
      return;
    }
    if (newOrder.customer_phone.length !== 11) {
      toast({ title: "Phone number must be 11 digits", variant: "destructive" });
      return;
    }
    if (newOrder.items.length === 0) {
      toast({ title: "Please add at least one item", variant: "destructive" });
      return;
    }
    setFormSaving(true);
    try {
    const { freeGiftItems, offerDiscount } = computeOffers(newOrder.items);
    const couponDisc = computeCouponDiscount(newOrder);
    const { data: orderNumberRpc, error: numErr } = await supabase.rpc("next_order_number");
    if (numErr || !orderNumberRpc) {
      toast({ title: "Could not generate order number", description: numErr?.message || "Try again", variant: "destructive" });
      setFormSaving(false);
      return;
    }
    const orderNumber = orderNumberRpc as string;
    const subtotal = newOrder.items.reduce((sum: number, item: any) => sum + (Number(item.price) * (item.quantity || 1)), 0);
    const manualDisc = computeDiscountAmount(newOrder.discount_type, newOrder.discount_amount, subtotal);
    const totalDiscount = Math.min(subtotal, offerDiscount + couponDisc + manualDisc);
    const total = Math.max(0, subtotal - totalDiscount + Number(newOrder.shipping_cost));
    const allItems = [...newOrder.items.filter((i: any) => i.name), ...freeGiftItems];

    const { error } = await supabase.from("orders").insert({
      order_number: orderNumber, customer_name: newOrder.customer_name,
      customer_email: newOrder.customer_email, customer_phone: newOrder.customer_phone || null,
      shipping_address: newOrder.shipping_address, items: allItems, subtotal,
      shipping_cost: newOrder.shipping_cost, discount_amount: totalDiscount,
      coupon_code: newOrder.coupon_code || null, total, notes: newOrder.notes || null,
      order_status: newOrder.order_status, payment_status: newOrder.payment_status,
      payment_method: newOrder.payment_method || "cod",
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await Promise.all(
        allItems.filter((i: any) => i.product_id && i.quantity).map((i: any) =>
          i.variant_id
            ? supabase.rpc("decrement_variant_stock", { _variant_id: i.variant_id, _quantity: i.quantity || 1 })
            : supabase.rpc("decrement_product_stock", { _product_id: i.product_id, _quantity: i.quantity || 1 })
        )
      );
      if (newOrder.coupon_code && couponDisc > 0) await supabase.rpc("increment_coupon_usage", { _code: newOrder.coupon_code });
      if (newOrder.customer_email) await supabase.rpc("subscribe_newsletter", { _email: newOrder.customer_email });
      await supabase.rpc("upsert_checkout_customer", {
        _name: newOrder.customer_name, _email: newOrder.customer_email,
        _phone: newOrder.customer_phone || "", _order_total: total,
      });
      toast({ title: "Order created", description: `Order #${orderNumber}` });
      setCreating(false);
      setNewOrder({
        customer_name: "", customer_email: "", customer_phone: "",
        shipping_address: { country: "Bangladesh", district: "", city: "", line1: "" },
        items: [], shipping_cost: 0, discount_amount: 0, discount_type: "fixed", coupon_code: "", notes: "",
        payment_method: "cod",
        order_status: "pending", payment_status: "pending",
      });
      fetchOrders();
    }
    } finally {
      setFormSaving(false);
    }
  };

  // OrderForm is now a standalone memoized component (src/pages/admin/components/OrderForm.tsx)


  // `orders` already comes pre-filtered + paginated from the server.
  // Keep a compatibility alias so the rendering JSX below stays readable.
  const filteredOrders = orders;

  // Page-scoped bulk selection: clear selection whenever the visible page changes
  // (different filters, different page, different size).
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, [page, pageSize, statusTab, searchQuery, paymentFilter, dateFilter]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const toggleSelectAll = () => {
    const pageIds = filteredOrders.map(o => o.id);
    const allSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(pageIds));
  };

  const handleBulkStatusUpdate = async () => {
    if (!bulkStatus || selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    setBulkBusy(true);
    const { error } = await supabase.from("orders").update({ order_status: bulkStatus }).in("id", ids);
    setBulkBusy(false);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      patchManyOrdersInCache(ids, { order_status: bulkStatus });
      qc.invalidateQueries({ queryKey: adminKeys.orders });
      invalidateDashboard();
      setBulkStatus("");
      toast({ title: `${ids.length} order${ids.length !== 1 ? "s" : ""} → ${bulkStatus}` });
      exitSelectionMode();
    }
  };

  const [exporting, setExporting] = useState(false);
  const exportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const allRows = await fetchAllFilteredOrders(filters);
      const rows = allRows.map((o: any) => ({
        "Order #": o.order_number, "Date": new Date(o.created_at).toLocaleDateString(),
        "Customer": o.customer_name, "Email": o.customer_email || "", "Phone": o.customer_phone || "",
        "Items": ((o.items || []) as any[]).map((i: any) => `${i.name} x${i.quantity || 1}`).join("; "),
        "Subtotal": o.subtotal, "Discount": o.discount_amount || 0, "Shipping": o.shipping_cost,
        "Total": o.total, "Status": o.order_status, "Payment": o.payment_status,
        "Tracking": o.tracking_number || "", "Coupon": o.coupon_code || "",
      }));
      if (rows.length === 0) {
        toast({ title: "Nothing to export", description: "No orders match the current filters" });
        return;
      }
      const headers = Object.keys(rows[0]);
      const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (err: any) {
      toast({ title: "Export failed", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!" });
  };

  // ── ORDER DETAIL VIEW ──
  if (creating) return <OrderForm data={newOrder} setData={setNewOrder} onSave={createOrder} onCancel={() => setCreating(false)} title="Create Manual Order" saving={formSaving} products={products} coupons={coupons} productOffers={productOffers} deliveryZones={deliveryZones} />;
  if (selected && editing) return <OrderForm data={editData} setData={setEditData} onSave={saveEdit} onCancel={() => setEditing(false)} title={`Edit Order ${selected.order_number}`} saving={formSaving} products={products} coupons={coupons} productOffers={productOffers} deliveryZones={deliveryZones} />;

  if (selected) {
    const addr = selected.shipping_address || {};
    const items = selected.items || [];
    const regularItems = items.filter((i: any) => !i.is_free_gift);
    const giftItems = items.filter((i: any) => i.is_free_gift);
    const currentStatusIdx = statusOptions.indexOf(selected.order_status);
    const nextStatus = currentStatusIdx >= 0 && currentStatusIdx < statusOptions.length - 2 ? statusOptions[currentStatusIdx + 1] : null;
    const StatusIcon = STATUS_CONFIG[selected.order_status]?.icon || Package;

    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setEditing(false); }} className="rounded-[4px] gap-1.5 -ml-2 h-9 text-[12px]">
            <ChevronLeft size={14} /> Orders
          </Button>
          <div className="flex gap-1.5 sm:gap-2 flex-wrap">
            {courierConnected && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setCourierOverrides({ pathao_city_id: "", pathao_zone_id: "", pathao_area_id: "" }); setCourierDialogOpen(true); }}
                disabled={sendingToCourier}
                className="rounded-[4px] gap-1.5 text-[12px] h-9 px-2.5 sm:px-3"
              >
                <Truck size={13} /> <span className="hidden sm:inline">{sendingToCourier ? "Sending..." : "Send to Courier"}</span><span className="sm:hidden">{sendingToCourier ? "…" : "Courier"}</span>
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => printInvoice({ order: selected })} className="rounded-[4px] gap-1.5 text-[12px] h-9 px-2.5 sm:px-3"><FileText size={13} /><span className="hidden sm:inline">Invoice</span></Button>
            <Button size="sm" variant="outline" onClick={() => printInvoice({ order: selected }, "receipt")} className="rounded-[4px] gap-1.5 text-[12px] h-9 px-2.5 sm:px-3"><Printer size={13} /><span className="hidden sm:inline">Receipt</span></Button>
            <Button size="sm" onClick={startEdit} className="rounded-[4px] gap-1.5 text-[12px] h-9 px-2.5 sm:px-3"><Pencil size={13} /> <span className="hidden sm:inline">Edit</span></Button>
            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)} className="rounded-[4px] gap-1.5 text-[12px] h-9 px-2.5 sm:px-3"><Trash2 size={13} /><span className="hidden sm:inline">Delete</span></Button>
          </div>
        </div>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent className="rounded-2xl max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete this order?</DialogTitle>
            </DialogHeader>
            <p className="text-[13px] text-muted-foreground">Order #{selected.order_number} will be removed from your list. This cannot be undone.</p>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)} className="rounded-xl text-[12px]">Cancel</Button>
              <Button variant="destructive" size="sm" disabled={deleting} onClick={() => softDeleteOrder(selected.id)} className="rounded-xl text-[12px] gap-1.5">
                {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5 max-w-6xl mb-3">
          <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80 mb-2.5">Order</h3>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-[13px] sm:text-[14px] text-foreground truncate leading-tight min-w-0">
              Order #{selected.order_number}
            </span>
            <span className="text-[13px] sm:text-[14px] text-foreground tabular-nums shrink-0">
              {CURRENCY_SYMBOL}{Number(selected.total).toLocaleString()}
            </span>
          </div>
          <div className="text-[12.5px] text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-0.5 mt-2.5">
            <span className={cn("inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[3px] text-[10.5px] font-medium", STATUS_CONFIG[selected.order_status]?.bg)}>
              <StatusIcon size={10} /> {STATUS_CONFIG[selected.order_status]?.label ?? selected.order_status}
            </span>
            <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded-[3px] text-[10.5px] font-medium capitalize", paymentColor(selected.payment_status || "pending"))}>
              {selected.payment_status || "pending"}
            </span>
            <span className="text-muted-foreground/50">•</span>
            <span className="tabular-nums">{new Date(selected.created_at).toLocaleString()}</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-10 gap-3 max-w-6xl">
          <div className="lg:col-span-7 space-y-3">
            {/* Status timeline */}
            <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
              <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80 mb-2.5">Status timeline</h3>
              <div className="flex flex-wrap items-center gap-1.5">
                {statusOptions.filter(s => s !== "cancelled").map((s, i, arr) => {
                  const config = STATUS_CONFIG[s];
                  const Icon = config.icon;
                  const isActive = selected.order_status === s;
                  const isPast = statusOptions.indexOf(selected.order_status) > i;
                  const isCancelled = selected.order_status === "cancelled";
                  return (
                    <div key={s} className="flex items-center">
                      <button
                        onClick={() => quickStatusUpdate(selected.id, s)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-[4px] text-[11px] font-medium border transition-colors whitespace-nowrap",
                          isActive && !isCancelled
                            ? "bg-foreground text-background border-foreground"
                            : isPast && !isCancelled
                              ? "bg-background border-border text-foreground"
                              : "bg-background border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                      >
                        <Icon size={12} />
                        {config.label}
                      </button>
                      {i < arr.length - 1 && <ArrowRight size={10} className="mx-0.5 text-muted-foreground/30 shrink-0 hidden sm:inline" />}
                    </div>
                  );
                })}
              </div>
              {selected.order_status === "cancelled" && (
                <div className="mt-3 flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 text-[11px] font-medium w-fit border border-red-200/60 dark:border-red-900/40">
                  <CircleX size={12} /> Cancelled
                </div>
              )}
              {nextStatus && selected.order_status !== "cancelled" && (
                <Button size="sm" onClick={() => quickStatusUpdate(selected.id, nextStatus)} className="mt-3 gap-1.5 text-[12px] rounded-[4px] h-9 w-full sm:w-auto px-4">
                  <ArrowRight size={13} /> Move to {nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                </Button>
              )}
            </div>


            {/* Items */}
            <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80">Items</h3>
                <span className="text-[11px] text-muted-foreground/70 tabular-nums">{regularItems.length} item{regularItems.length !== 1 ? "s" : ""}</span>
              </div>
              <div className="divide-y divide-border/40">
                {regularItems.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    {item.image ? (
                      <img src={resolveImageSrc(item.image, 400)} alt="" loading="lazy" className="w-12 h-12 rounded-[4px] object-cover border border-border/40 shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-[4px] bg-muted/60 flex items-center justify-center shrink-0"><Package size={14} className="text-muted-foreground/50" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-foreground line-clamp-2 leading-snug">{item.name}</p>
                      <p className="text-[11.5px] text-muted-foreground/70 mt-0.5 tabular-nums">
                        {CURRENCY_SYMBOL}{Number(item.price).toLocaleString()}{item.variant ? ` · ${item.variant}` : ""} · Qty {item.quantity || 1}
                      </p>
                    </div>
                    <span className="text-[13.5px] font-semibold text-foreground tabular-nums shrink-0">{CURRENCY_SYMBOL}{Number(item.price * (item.quantity || 1)).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              {giftItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {giftItems.map((item: any, i: number) => (
                    <div key={`gift-${i}`} className="flex items-center gap-2.5 py-2 px-2.5 bg-muted/30 rounded-[4px] border border-border/40">
                      {item.image && <img src={resolveImageSrc(item.image, 400)} alt="" loading="lazy" className="w-10 h-10 rounded-[3px] object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-foreground line-clamp-2 leading-snug">{item.name}</p>
                        <span className="text-[10.5px] text-muted-foreground/80 font-medium">Free gift</span>
                      </div>
                      <span className="text-[12px] text-muted-foreground/70 shrink-0 tabular-nums">×{item.quantity || 1}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 pt-3 border-t border-border/40 space-y-1 text-[12.5px]">
                <div className="flex justify-between"><span className="text-muted-foreground/80">Subtotal</span><span className="tabular-nums">{CURRENCY_SYMBOL}{Number(selected.subtotal).toLocaleString()}</span></div>
                {Number(selected.discount_amount) > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground/80">Discount{selected.coupon_code ? ` (${selected.coupon_code})` : ""}</span><span className="tabular-nums">-{CURRENCY_SYMBOL}{Number(selected.discount_amount).toLocaleString()}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground/80">Shipping</span><span className="tabular-nums">{CURRENCY_SYMBOL}{Number(selected.shipping_cost).toLocaleString()}</span></div>
                <div className="flex justify-between items-baseline pt-1.5 mt-1.5 border-t border-border/40"><span className="text-[12px] font-medium text-foreground">Total</span><span className="text-[16px] font-semibold tabular-nums text-foreground">{CURRENCY_SYMBOL}{Number(selected.total).toLocaleString()}</span></div>
              </div>
            </div>

            {selected.notes && (
              <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
                <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80 mb-2">Notes</h3>
                <p className="text-[13px] text-muted-foreground/90 whitespace-pre-line leading-relaxed">{selected.notes}</p>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-3 space-y-3">
            {/* Customer */}
            <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
              <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80 mb-2.5">Customer</h3>
              <p className="text-[14px] font-medium text-foreground leading-tight truncate">{selected.customer_name || "—"}</p>
              <div className="mt-2 space-y-0.5">
                {selected.customer_phone && (
                  <button onClick={() => copyToClipboard(selected.customer_phone)} aria-label="Copy phone number" className="group flex items-center gap-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors w-full min-w-0">
                    <span className="truncate flex-1 text-left tabular-nums">{selected.customer_phone}</span>
                    <Copy size={11} className="shrink-0 opacity-60 transition-opacity" />
                  </button>
                )}
                {selected.customer_email && (
                  <button onClick={() => copyToClipboard(selected.customer_email)} aria-label="Copy email address" className="group flex items-center gap-2 text-[12.5px] text-muted-foreground hover:text-foreground transition-colors w-full min-w-0">
                    <span className="truncate flex-1 text-left">{selected.customer_email}</span>
                    <Copy size={11} className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                )}
              </div>
            </div>

            {(addr.line1 || addr.city) && (
              <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
                <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80 mb-2">Shipping address</h3>
                <address className="not-italic text-[12.5px] text-muted-foreground leading-relaxed space-y-0.5">
                  {addr.line1 && <div className="text-foreground">{addr.line1}</div>}
                  {(addr.city || addr.district) && <div>{[addr.city, addr.district].filter(Boolean).join(", ")}</div>}
                  {addr.country && <div className="text-muted-foreground/70">{addr.country}</div>}
                </address>
              </div>
            )}

            {/* Payment */}
            <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
              <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80 mb-2.5">Payment</h3>
              <div className="space-y-1.5 text-[12.5px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/80">Method</span>
                  <span className="font-medium text-foreground capitalize">{(selected.payment_method || "cod").replace(/_/g, " ")}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/80">Status</span>
                  <Select value={selected.payment_status || "pending"} onValueChange={v => quickPaymentUpdate(selected.id, v)}>
                    <SelectTrigger className="w-[130px] h-8 text-[12px] rounded-[4px]"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-[4px]">{paymentStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/80 shrink-0">Transaction ID</span>
                  <span className="font-medium text-foreground truncate">{selected.transaction_id || "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/80 shrink-0">Paid at</span>
                  <span className="font-medium text-foreground tabular-nums text-right">{selected.paid_at ? new Date(selected.paid_at).toLocaleString() : "—"}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/80 shrink-0">Updated</span>
                  <span className="text-muted-foreground tabular-nums text-right">{selected.updated_at ? new Date(selected.updated_at).toLocaleString() : "—"}</span>
                </div>
                {selected.tracking_number && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground/80 shrink-0">Tracking</span>
                    <button onClick={() => copyToClipboard(selected.tracking_number)} aria-label="Copy tracking number" className="font-medium text-foreground flex items-center gap-1.5 hover:text-primary transition-colors min-w-0">
                      <span className="truncate">{selected.tracking_number}</span> <Copy size={11} className="shrink-0" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Courier */}
            <div className="bg-background border border-border/60 rounded-[4px] p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <h3 className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground/80">Courier</h3>
                <span className={cn(
                  "inline-flex items-center gap-1.5 text-[10.5px] font-medium",
                  courierConnected ? "text-green-700 dark:text-green-400" : "text-muted-foreground/70"
                )}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", courierConnected ? "bg-green-500" : "bg-muted-foreground/40")} />
                  {courierConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              <div className="text-[12.5px] space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground/80">Partner</span>
                  <span className="font-medium text-foreground">{activeCourier?.name || "—"}</span>
                </div>
                {(selected.steadfast_tracking_code || selected.steadfast_consignment_id) && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground/80 shrink-0">Reference</span>
                    <button onClick={() => copyToClipboard(selected.steadfast_tracking_code || selected.steadfast_consignment_id)} aria-label="Copy courier reference" className="font-medium text-foreground hover:text-primary flex items-center gap-1.5 min-w-0 transition-colors">
                      <span className="truncate">{selected.steadfast_tracking_code || selected.steadfast_consignment_id}</span> <Copy size={10} className="shrink-0" />
                    </button>
                  </div>
                )}
                {selected.steadfast_status && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground/80">Status</span>
                    <span className="font-medium text-foreground capitalize">{selected.steadfast_status}</span>
                  </div>
                )}
                {selected.courier_last_error && <p className="text-[11.5px] text-destructive bg-destructive/10 rounded-[4px] px-2.5 py-1.5">{selected.courier_last_error}</p>}
              </div>
              {courierConnected ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setCourierOverrides({ pathao_city_id: "", pathao_zone_id: "", pathao_area_id: "" }); setCourierDialogOpen(true); }}
                  disabled={sendingToCourier}
                  className="w-full rounded-[4px] gap-1.5 text-[12px] h-9 mt-3"
                >
                  <Truck size={13} />
                  {sendingToCourier
                    ? "Sending…"
                    : (selected.steadfast_tracking_code || selected.steadfast_consignment_id ? "Resend to courier" : "Send to courier")}
                </Button>
              ) : (
                <p className="text-[11.5px] text-muted-foreground/70 leading-relaxed mt-2">Connect a courier in <span className="text-foreground font-medium">Settings → Courier API</span> to enable shipping integrations.</p>
              )}
            </div>

            <BdCourierCard phone={selected.customer_phone} orderId={selected.id} />
          </div>
        </div>

        {/* Courier Send Dialog with Pathao Location Dropdowns */}
        <Dialog open={courierDialogOpen} onOpenChange={setCourierDialogOpen}>
          <DialogContent className="rounded-2xl max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Truck size={16} /> Send to Courier
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-muted/40 rounded-xl p-3 space-y-1">
                <p className="text-[12px] font-medium text-foreground">{selected.customer_name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {[selected.shipping_address?.line1, selected.shipping_address?.city, selected.shipping_address?.district].filter(Boolean).join(", ")}
                </p>
                <p className="text-[11px] text-muted-foreground">District: {selected.shipping_address?.district || "—"} · City: {selected.shipping_address?.city || "—"}</p>
              </div>

              {!courierConnected && (
                <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-[11px] text-destructive">Courier not connected — {courierWarning}</p>
              )}

              {courierSupportsLocationOverride && <div className="border border-border/40 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground">
                    <MapPin size={13} /> Pathao Location Override
                  </div>
                  <Button
                    type="button" variant="outline" size="sm"
                    className="rounded-lg text-[11px] h-7 gap-1 bg-background text-foreground hover:bg-surface-light border-border/40"
                    disabled={pathaoLoading}
                    onClick={async () => {
                      setPathaoLoading(true);
                      try {
                        // Manual click = allow a hard refresh when cities are already cached.
                        const items = await loadPathaoCities(pathaoCities.length > 0);
                        setPathaoCities(items);
                        setPathaoZones([]); setPathaoAreas([]);
                        setCourierOverrides({ pathao_city_id: "", pathao_zone_id: "", pathao_area_id: "" });
                        toast({ title: `${items.length} cities loaded` });
                      } catch (e: any) {
                        toast({ title: "Failed to load cities", description: e?.message, variant: "destructive" });
                      } finally { setPathaoLoading(false); }
                    }}
                  >
                    {pathaoLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                    {pathaoCities.length > 0 ? "Refresh Locations" : "Fetch Locations"}
                  </Button>
                </div>

                {pathaoCities.length > 0 ? (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-[11px] text-muted-foreground">City</Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={courierOverrides.pathao_city_id}
                          placeholder="Select city…"
                          searchPlaceholder="Search city…"
                          options={pathaoCities.map(c => ({ value: String(c.id), label: c.name }))}
                          onValueChange={async (v) => {
                            setCourierOverrides(p => ({ ...p, pathao_city_id: v, pathao_zone_id: "", pathao_area_id: "" }));
                            setPathaoZones([]); setPathaoAreas([]);
                            try {
                              setPathaoZones(await loadPathaoZones(v));
                            } catch (err: any) {
                              toast({ title: "Failed to load zones", description: err?.message, variant: "destructive" });
                            }
                          }}
                        />
                      </div>
                    </div>
                    {pathaoZones.length > 0 && (
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Zone</Label>
                        <div className="mt-1">
                          <SearchableSelect
                            value={courierOverrides.pathao_zone_id}
                            placeholder="Select zone…"
                            searchPlaceholder="Search zone…"
                            options={pathaoZones.map(z => ({ value: String(z.id), label: z.name }))}
                            onValueChange={async (v) => {
                              setCourierOverrides(p => ({ ...p, pathao_zone_id: v, pathao_area_id: "" }));
                              setPathaoAreas([]);
                              try {
                                setPathaoAreas(await loadPathaoAreas(v));
                              } catch (err: any) {
                                toast({ title: "Failed to load areas", description: err?.message, variant: "destructive" });
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                    {pathaoAreas.length > 0 && (
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Area</Label>
                        <div className="mt-1">
                          <SearchableSelect
                            value={courierOverrides.pathao_area_id}
                            placeholder="Select area…"
                            searchPlaceholder="Search area…"
                            options={pathaoAreas.map(a => ({ value: String(a.id), label: a.name }))}
                            onValueChange={v => setCourierOverrides(p => ({ ...p, pathao_area_id: v }))}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground/60">Click "Fetch Locations" to load Pathao cities, then select city → zone → area. Leave empty for auto-detection.</p>
                )}
              </div>}
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setCourierDialogOpen(false)} className="rounded-xl text-[12px] bg-background text-foreground hover:bg-surface-light border-border/40">Cancel</Button>
              <Button
                size="sm"
                onClick={() => {
                  const overrides = courierOverrides.pathao_city_id || courierOverrides.pathao_zone_id
                    ? courierOverrides : undefined;
                  sendToCourier(selected, overrides);
                }}
                disabled={sendingToCourier || !courierConnected}
                className="rounded-xl text-[12px] gap-1.5"
              >
                {sendingToCourier ? <><Loader2 size={13} className="animate-spin" /> Sending...</> : <><Truck size={13} /> Send</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── ORDER LIST VIEW ──
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Orders</h1>
          <p className="text-[13px] text-muted-foreground/60 mt-0.5">{orders.length} total orders</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={exportCSV} className="rounded-xl gap-1.5 text-[12px]"><Download size={13} /> CSV</Button>
          {courierConnected && courierSupportsBulk && (
            <Button size="sm" variant="outline" onClick={pushPendingToCourier} disabled={bulkBusy} className="rounded-xl gap-1.5 text-[12px]"><Truck size={13} /> {bulkBusy ? "Sending…" : "Push pending to Courier"}</Button>
          )}
          <Button size="sm" onClick={() => setCreating(true)} className="rounded-xl gap-1.5 text-[12px]"><Plus size={13} /> Manual Order</Button>
        </div>
      </div>


      {/* Status Tabs — mobile: single horizontal scroll row; desktop+: wrap unchanged */}
      <div
        ref={statusTabsScrollRef}
        className="flex gap-2 mb-5 sm:flex-wrap overflow-x-auto sm:overflow-visible scrollbar-hide pb-1 sm:pb-0 scroll-smooth"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {["all", ...statusOptions].map(s => {
          const config = STATUS_CONFIG[s];
          const Icon = config.icon;
          const count = statusCounts[s] || 0;
          const isActive = statusTab === s;
          return (
            <button
              key={s}
              ref={el => { if (el) statusTabRefs.current.set(s, el); }}
              onClick={() => { setStatusTab(s); setSelectedIds(new Set()); }}
              className={cn(
                "h-10 px-4 rounded-lg border text-[13px] font-medium transition-all flex items-center gap-1.5 shadow-none flex-shrink-0",
                isActive
                  ? "bg-[#f3f4f6] dark:bg-zinc-800/80 text-foreground font-semibold border-border"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground"
              )}
            >
              <Icon size={13} />
              {config.label}
              <span className={cn(
                "ml-0.5 text-[10px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums",
                isActive ? "bg-foreground/10 text-foreground" : "bg-foreground/5 text-muted-foreground/60"
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5">
        <div className="relative flex-1 min-w-0">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/40" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search order #, name, phone, email..." className="pl-9 rounded-xl" />
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
          <Select value={paymentFilter} onValueChange={setPaymentFilter}>
            <SelectTrigger className="w-full sm:w-[130px] h-10 text-[12px] rounded-xl"><SelectValue placeholder="Payment" /></SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All payments</SelectItem>
              {paymentStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-full sm:w-[120px] h-10 text-[12px] rounded-xl"><SelectValue placeholder="Date" /></SelectTrigger>
            <SelectContent className="rounded-xl">
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Select value={String(pageSize)} onValueChange={v => setPageSize(Number(v))}>
            <SelectTrigger className="w-full sm:w-[110px] h-10 text-[12px] rounded-xl tabular-nums">
              <SelectValue>Show {pageSize}</SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)} className="text-[12px]">Show {n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Count + Select / Done */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[12px] text-muted-foreground/60">
          {totalRows === 0
            ? "0 orders"
            : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, totalRows)} of ${totalRows.toLocaleString()} order${totalRows !== 1 ? "s" : ""}`}
          {isFetching && !loading ? " · refreshing…" : ""}
        </p>
        {filteredOrders.length > 0 && (
          selectionMode ? (
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-8 rounded-xl text-[12px]" onClick={toggleSelectAll}>
                {selectedIds.size === filteredOrders.length ? "Deselect All" : "Select All"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 rounded-xl text-[12px]" onClick={exitSelectionMode}>Done</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" className="h-8 rounded-xl text-[12px]" onClick={() => setSelectionMode(true)}>Select</Button>
          )
        )}
      </div>

      {/* Sticky bulk action bar */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="sticky top-2 z-30 mb-4 bg-background/95 backdrop-blur border border-border/50 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <span className="text-[13px] font-medium text-foreground shrink-0">{selectedIds.size} selected</span>
          <div className="grid grid-cols-1 sm:flex sm:items-center gap-2 sm:gap-2 flex-1">
            <Select value={bulkStatus} onValueChange={setBulkStatus}>
              <SelectTrigger className="h-9 sm:w-[160px] text-[12px] rounded-xl"><SelectValue placeholder="Order status" /></SelectTrigger>
              <SelectContent className="rounded-xl">{statusOptions.map(s => <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!bulkStatus || bulkBusy} onClick={handleBulkStatusUpdate} className="h-9 text-[12px] rounded-xl">Apply</Button>
            <Select value={bulkPayment} onValueChange={setBulkPayment}>
              <SelectTrigger className="h-9 sm:w-[160px] text-[12px] rounded-xl"><SelectValue placeholder="Payment status" /></SelectTrigger>
              <SelectContent className="rounded-xl">{paymentStatuses.map(s => <SelectItem key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" variant="outline" disabled={!bulkPayment || bulkBusy} onClick={handleBulkPaymentUpdate} className="h-9 text-[12px] rounded-xl">Apply</Button>
            <Button size="sm" variant="destructive" disabled={bulkBusy} onClick={() => setBulkDeleteOpen(true)} className="h-9 text-[12px] rounded-xl gap-1.5"><Trash2 size={13} /> Delete</Button>
          </div>
          <Button size="sm" variant="ghost" onClick={exitSelectionMode} className="h-9 text-[12px] rounded-xl sm:ml-auto">Done</Button>
        </div>
      )}

      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} order{selectedIds.size !== 1 ? "s" : ""}?</DialogTitle>
          </DialogHeader>
          <p className="text-[13px] text-muted-foreground">This cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkDeleteOpen(false)} className="rounded-xl text-[12px]">Cancel</Button>
            <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={handleBulkDelete} className="rounded-xl text-[12px] gap-1.5">
              {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {loading ? (
        <div className="bg-background rounded-2xl border border-border/40 overflow-hidden">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border/20 last:border-0">
              <Skeleton className="w-4 h-4 rounded" />
              <div className="flex-1 space-y-2"><Skeleton className="h-4 w-28" /><Skeleton className="h-3 w-36" /></div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
          ))}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground/50">
          <Package size={36} className="mx-auto mb-4 opacity-20" />
          <p className="text-[14px] font-medium">{totalRows === 0 ? "No orders match your filters" : "No orders on this page"}</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden sm:block bg-background rounded-2xl border border-border/40 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border/30">
                    {selectionMode && (
                      <th className="px-4 py-3.5 w-8">
                        <button onClick={toggleSelectAll} aria-label={selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? "Deselect all orders" : "Select all orders"} className="text-muted-foreground/40 hover:text-foreground">
                          {selectedIds.size === filteredOrders.length && filteredOrders.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                        </button>
                      </th>
                    )}
                    <th className="text-left px-4 py-3.5 font-medium text-muted-foreground/50 text-[12px] uppercase tracking-wide">Order</th>
                    <th className="text-left px-4 py-3.5 font-medium text-muted-foreground/50 text-[12px] uppercase tracking-wide">Customer</th>
                    <th className="text-left px-4 py-3.5 font-medium text-muted-foreground/50 text-[12px] uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3.5 font-medium text-muted-foreground/50 text-[12px] uppercase tracking-wide">Payment</th>
                    <th className="text-left px-4 py-3.5 font-medium text-muted-foreground/50 text-[12px] uppercase tracking-wide">Total</th>
                    <th className="text-left px-4 py-3.5 font-medium text-muted-foreground/50 text-[12px] uppercase tracking-wide">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map(o => {
                    const orderStatus = o.order_status || "pending";
                    const paymentStatus = o.payment_status || "pending";
                    const config = STATUS_CONFIG[orderStatus] || STATUS_CONFIG.pending;
                    return (
                      <tr key={o.id} className="border-b border-border/15 last:border-0 hover:bg-muted/30 transition-colors cursor-pointer">
                        {selectionMode && (
                          <td className="px-4 py-3.5" onClick={e => { e.stopPropagation(); toggleSelect(o.id); }}>
                            <button className="text-muted-foreground/40 hover:text-foreground" aria-label={`${selectedIds.has(o.id) ? "Deselect" : "Select"} order ${o.order_number}`} aria-pressed={selectedIds.has(o.id)}>
                              {selectedIds.has(o.id) ? <CheckSquare size={16} className="text-foreground" /> : <Square size={16} />}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3.5" onClick={() => setSelected(o)}>
                          <span className="font-medium text-foreground">{o.order_number}</span>
                          <p className="text-[11px] text-muted-foreground/40">{((o.items || []) as any[]).length} item{((o.items || []) as any[]).length !== 1 ? "s" : ""}</p>
                        </td>
                        <td className="px-4 py-3.5" onClick={() => setSelected(o)}>
                          <span className="text-foreground/80">{o.customer_name}</span>
                          {o.customer_phone && <p className="text-[11px] text-muted-foreground/40">{o.customer_phone}</p>}
                        </td>
                        <td className="px-4 py-3.5" onClick={() => setSelected(o)}>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full capitalize ${config.bg}`}>
                            <config.icon size={10} />{orderStatus}
                          </span>
                        </td>
                        <td className="px-4 py-3.5" onClick={() => setSelected(o)}>
                          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full capitalize ${paymentColor(paymentStatus)}`}>{paymentStatus}</span>
                        </td>
                        <td className="px-4 py-3.5 text-left font-medium text-foreground tabular-nums" onClick={() => setSelected(o)}>
                          {CURRENCY_SYMBOL}{Number(o.total).toLocaleString()}
                        </td>
                        <td className="px-4 py-3.5 text-left text-muted-foreground/50 text-[12px]" onClick={() => setSelected(o)}>
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden space-y-2">
            {filteredOrders.map(o => {
              const orderStatus = o.order_status || "pending";
              const paymentStatus = o.payment_status || "pending";
              const config = STATUS_CONFIG[orderStatus] || STATUS_CONFIG.pending;
              return (
                <div key={o.id} onClick={() => selectionMode ? toggleSelect(o.id) : setSelected(o)} className={`bg-background rounded-2xl border p-4 active:bg-muted/30 transition-colors cursor-pointer ${selectionMode && selectedIds.has(o.id) ? "border-foreground/50" : "border-border/40"}`}>
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {selectionMode && (selectedIds.has(o.id) ? <CheckSquare size={15} className="text-foreground shrink-0" /> : <Square size={15} className="text-muted-foreground/40 shrink-0" />)}
                      <span className="text-[13px] font-semibold text-foreground truncate">#{o.order_number}</span>
                    </div>
                    <span className="text-[14px] font-semibold text-foreground tabular-nums">{CURRENCY_SYMBOL}{Number(o.total).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] text-foreground/70">{o.customer_name}</span>
                    <span className="text-[11px] text-muted-foreground/50">{new Date(o.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${config.bg}`}>
                      <config.icon size={9} />{orderStatus}
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${paymentColor(paymentStatus)}`}>{paymentStatus}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {totalRows > pageSize && (
        <div className="flex items-center justify-between gap-3 mt-4">
          <p className="text-[12px] text-muted-foreground/60 tabular-nums">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-8 rounded-xl text-[12px]"
              disabled={page <= 1 || isFetching} onClick={() => setPage(1)} aria-label="First page">« First</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-xl text-[12px]"
              disabled={page <= 1 || isFetching} onClick={() => setPage(p => Math.max(1, p - 1))} aria-label="Previous page">‹ Prev</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-xl text-[12px]"
              disabled={page >= totalPages || isFetching} onClick={() => setPage(p => Math.min(totalPages, p + 1))} aria-label="Next page">Next ›</Button>
            <Button size="sm" variant="outline" className="h-8 rounded-xl text-[12px]"
              disabled={page >= totalPages || isFetching} onClick={() => setPage(totalPages)} aria-label="Last page">Last »</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
