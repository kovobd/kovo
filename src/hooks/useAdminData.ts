import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { attachImagesToProducts } from "@/lib/productMedia";
import { bumpStorefrontVersion } from "@/lib/storefrontCache";

// ── Query Keys ──
export const adminKeys = {
  products: ["admin", "products"] as const,
  categories: ["admin", "categories"] as const,
  brands: ["admin", "brands"] as const,
  tags: ["admin", "tags"] as const,
  orders: ["admin", "orders"] as const,
  customers: ["admin", "customers"] as const,
  coupons: ["admin", "coupons"] as const,
  enabledCoupons: ["admin", "coupons", "enabled"] as const,
  deliveryPartners: ["admin", "delivery-partners", "enabled"] as const,
  steadfastBalance: ["admin", "steadfast-balance"] as const,
  dashboard: (filter: string) => ["admin", "dashboard", filter] as const,
};

const PRODUCT_LIST_COLS = "id,name,slug,price,sale_price,base_price,compare_price,status,is_new_arrival,stock,featured,best_seller,sort_order,category_id,brand_id,rating,review_count,show_offers,show_shipping_info,show_stock_status,show_brand,option_groups,sku,short_description,description,created_at,reminder_enabled,reminder_days,reminder_notes";
const ORDER_LIST_COLS = "id,order_number,customer_name,customer_email,customer_phone,customer_city,shipping_address,items,subtotal,shipping_cost,discount_amount,coupon_code,total,payment_method,payment_status,order_status,tracking_number,delivery_partner,notes,created_at,updated_at";
const CATEGORY_COLS = "id,name,slug,image_url,parent_id,sort_order,level,category_type,path,full_slug,featured_image_url,enabled,meta_title,meta_description";
const BRAND_COLS = "id,name,slug,logo_url,image_url,description,enabled,sort_order";
const CUSTOMER_LIST_COLS = "id,name,email,phone,city,total_orders,total_spent,created_at";
const COUPON_COLS = "id,code,discount_type,discount_value,min_cart_total,min_order_amount,max_uses,used_count,enabled,start_date,end_date,expires_at,created_at";
const DELIVERY_PARTNER_COLS = "id,name,slug,enabled,config";


// ── Products ──
export function useAdminProducts() {
  return useQuery({
    queryKey: adminKeys.products,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_LIST_COLS)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = await attachImagesToProducts((data ?? []) as any[]);

      // Aggregate variant pricing & stock so the admin list reflects reality.
      const ids = rows.map((r: any) => r.id);
      if (ids.length) {
        const { data: vars } = await supabase
          .from("product_variants")
          .select("product_id, price, sale_price, stock, active")
          .in("product_id", ids);
        const map = new Map<string, { min: number; max: number; stock: number; count: number }>();
        (vars ?? []).forEach((v: any) => {
          if (v.active === false) return;
          const eff = v.sale_price && Number(v.sale_price) > 0 ? Number(v.sale_price) : Number(v.price ?? 0);
          const cur = map.get(v.product_id) ?? { min: Infinity, max: -Infinity, stock: 0, count: 0 };
          if (eff > 0) {
            cur.min = Math.min(cur.min, eff);
            cur.max = Math.max(cur.max, eff);
          }
          cur.stock += Number(v.stock ?? 0);
          cur.count += 1;
          map.set(v.product_id, cur);
        });
        rows.forEach((r: any) => {
          const agg = map.get(r.id);
          if (agg && agg.count > 0) {
            r._hasVariants = true;
            r._variantCount = agg.count;
            r._variantStock = agg.stock;
            r._variantPriceMin = Number.isFinite(agg.min) ? agg.min : null;
            r._variantPriceMax = Number.isFinite(agg.max) ? agg.max : null;
            // Override displayed stock to reflect aggregate.
            r.stock = agg.stock;
          }
        });
      }
      return rows;
    },
    staleTime: 180_000,
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const r1 = await supabase.from("product_tabs").delete().eq("product_id", id);
      if (r1.error) throw r1.error;
      const r2 = await supabase.from("product_faqs").delete().eq("product_id", id);
      if (r2.error) throw r2.error;
      const r3 = await supabase.from("products").delete().eq("id", id);
      if (r3.error) throw r3.error;
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: adminKeys.products });
      const prev = qc.getQueryData(adminKeys.products);
      qc.setQueryData(adminKeys.products, (old: any[]) => old?.filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_, __, ctx) => ctx?.prev && qc.setQueryData(adminKeys.products, ctx.prev),
    onSuccess: () => { bumpStorefrontVersion(); },
    onSettled: () => qc.invalidateQueries({ queryKey: adminKeys.products }),
  });
}

export function useToggleProductField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: boolean }) => {
      await supabase.from("products").update({ [field]: value } as any).eq("id", id);
    },
    onMutate: async ({ id, field, value }) => {
      await qc.cancelQueries({ queryKey: adminKeys.products });
      const prev = qc.getQueryData(adminKeys.products);
      qc.setQueryData(adminKeys.products, (old: any[]) =>
        old?.map((p) => (p.id === id ? { ...p, [field]: value } : p))
      );
      return { prev };
    },
    onError: (_, __, ctx) => ctx?.prev && qc.setQueryData(adminKeys.products, ctx.prev),
    onSuccess: () => { bumpStorefrontVersion(); },
  });
}

// ── Categories ──
export function useAdminCategories() {
  return useQuery({
    queryKey: adminKeys.categories,
    queryFn: async () => {
      const [catRes, prodRes] = await Promise.all([
        supabase.from("categories").select(CATEGORY_COLS).order("sort_order"),
        supabase.from("products").select("category_id").limit(5000),
      ]);
      const counts: Record<string, number> = {};
      (prodRes.data ?? []).forEach((p: any) => {
        if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
      });
      return { categories: catRes.data ?? [], productCounts: counts };
    },
    staleTime: 180_000,
    gcTime: 600_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
}

// ── Brands ──
export function useAdminBrands() {
  return useQuery({
    queryKey: adminKeys.brands,
    queryFn: async () => {
      const [brandRes, prodRes] = await Promise.all([
        supabase.from("brands").select(BRAND_COLS).order("sort_order"),
        supabase.from("products").select("brand_id").limit(5000),
      ]);
      const counts: Record<string, number> = {};
      (prodRes.data ?? []).forEach((p: any) => {
        if (p.brand_id) counts[p.brand_id] = (counts[p.brand_id] || 0) + 1;
      });
      return { brands: brandRes.data ?? [], productCounts: counts };
    },
    staleTime: 180_000,
    gcTime: 600_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
}

// ── Tags ──
export function useAdminTags() {
  return useQuery({
    queryKey: adminKeys.tags,
    queryFn: async () => {
      const [tagRes, ptRes] = await Promise.all([
        supabase.from("tags").select("id,name,slug,sort_order").order("sort_order").order("name"),
        supabase.from("product_tags").select("tag_id"),
      ]);
      const counts: Record<string, number> = {};
      (ptRes.data ?? []).forEach((r: any) => {
        counts[r.tag_id] = (counts[r.tag_id] || 0) + 1;
      });
      return { tags: tagRes.data ?? [], productCounts: counts };
    },
    staleTime: 180_000,
    gcTime: 600_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
}


// ── Orders ──
export function useAdminOrders() {
  return useQuery({
    queryKey: adminKeys.orders,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(ORDER_LIST_COLS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

// ── Customers ──
export function useAdminCustomers() {
  return useQuery({
    queryKey: adminKeys.customers,
    queryFn: async () => {
      const { data } = await supabase
        .from("customers")
        .select(CUSTOMER_LIST_COLS)
        .order("created_at", { ascending: false })
        .limit(500);
      return data ?? [];
    },
    staleTime: 180_000,
  });
}

// ── Coupons ──
export function useAdminCoupons() {
  return useQuery({
    queryKey: adminKeys.coupons,
    queryFn: async () => {
      const { data } = await supabase
        .from("coupons")
        .select(COUPON_COLS)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
    staleTime: 180_000,
  });
}

// ── Dashboard Stats (DEPRECATED) ──
// The dashboard now reads from the `get_dashboard_full` RPC via
// `useDashboardMetrics`. This hook is intentionally removed to prevent
// large client-side aggregation. Re-add only if you have a non-dashboard
// consumer that absolutely needs the raw lists.

// ── Shared lookups (cached, no refetch on every detail open) ──
export function useEnabledCoupons() {
  return useQuery({
    queryKey: adminKeys.enabledCoupons,
    queryFn: async () => {
      const { data } = await supabase.from("coupons").select(COUPON_COLS).eq("enabled", true).limit(200);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useEnabledDeliveryPartners() {
  return useQuery({
    queryKey: adminKeys.deliveryPartners,
    queryFn: async () => {
      const { data } = await supabase.from("delivery_partners").select(DELIVERY_PARTNER_COLS).eq("enabled", true);
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useSteadfastBalance() {
  return useQuery({
    queryKey: adminKeys.steadfastBalance,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("steadfast-proxy", { body: { action: "get_balance" } });
      if (error) return { balance: null, error: error.message };
      const d = data as any;
      if (d?.error) return { balance: null, error: d.error as string };
      const bal = d?.current_balance ?? d?.balance ?? null;
      return { balance: bal != null ? Number(bal) : null, error: null as string | null };
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// ── Orders pagination (server-side) ──
export type AdminOrderFilters = {
  status: string;       // 'all' or specific status
  search: string;       // free-text; '' = no search
  payment: string;      // 'all' or specific status
  dateFilter: string;   // 'all' | 'today' | '7d' | '30d'
};

export type AdminOrdersPage = {
  rows: any[];
  total: number;
  page: number;
  page_size: number;
};

const ORDER_STATUS_KEYS = ["all", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;
const EMPTY_STATUS_COUNTS: Record<string, number> = Object.fromEntries(ORDER_STATUS_KEYS.map(k => [k, 0]));

function dateFilterToIso(df: string): string | null {
  if (!df || df === "all") return null;
  const d = new Date();
  if (df === "today") d.setHours(0, 0, 0, 0);
  else if (df === "7d") d.setDate(d.getDate() - 7);
  else if (df === "30d") d.setDate(d.getDate() - 30);
  else return null;
  return d.toISOString();
}

function rpcArgsForFilters(f: AdminOrderFilters, includeStatus: boolean) {
  const base: Record<string, any> = {
    _search: f.search?.trim() ? f.search.trim() : null,
    _payment_status: !f.payment || f.payment === "all" ? null : f.payment,
    _date_from: dateFilterToIso(f.dateFilter),
    _date_to: null,
  };
  if (includeStatus) {
    base._status = !f.status || f.status === "all" ? null : f.status;
  }
  return base;
}

export function useAdminOrdersPage(filters: AdminOrderFilters, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...adminKeys.orders, "page", { ...filters, page, pageSize }],
    queryFn: async (): Promise<AdminOrdersPage> => {
      const { data, error } = await supabase.rpc("get_admin_orders_page", {
        _page: page,
        _page_size: pageSize,
        ...rpcArgsForFilters(filters, true),
      } as any);
      if (error) throw error;
      const d = (data as any) || {};
      return {
        rows: Array.isArray(d.rows) ? d.rows : [],
        total: Number(d.total ?? 0),
        page: Number(d.page ?? page),
        page_size: Number(d.page_size ?? pageSize),
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useAdminOrderStatusCounts(filters: Omit<AdminOrderFilters, "status">) {
  return useQuery({
    queryKey: [...adminKeys.orders, "counts", filters],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("get_admin_order_status_counts", {
        _search: filters.search?.trim() ? filters.search.trim() : null,
        _payment_status: !filters.payment || filters.payment === "all" ? null : filters.payment,
        _date_from: dateFilterToIso(filters.dateFilter),
        _date_to: null,
      } as any);
      if (error) throw error;
      return { ...EMPTY_STATUS_COUNTS, ...((data as any) || {}) };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

// Fetch every row matching the given filters by paging through the RPC.
// Used for CSV export so a 50-row UI page doesn't truncate the file.
export async function fetchAllFilteredOrders(filters: AdminOrderFilters): Promise<any[]> {
  const PAGE = 200;
  const rows: any[] = [];
  let page = 1;
  // hard safety cap: 20 pages × 200 = 4000 rows
  while (page <= 20) {
    const { data, error } = await supabase.rpc("get_admin_orders_page", {
      _page: page,
      _page_size: PAGE,
      ...rpcArgsForFilters(filters, true),
    } as any);
    if (error) throw error;
    const d = (data as any) || {};
    const batch: any[] = Array.isArray(d.rows) ? d.rows : [];
    rows.push(...batch);
    const total = Number(d.total ?? rows.length);
    if (rows.length >= total || batch.length < PAGE) break;
    page++;
  }
  return rows;
}

// ── Incomplete Orders pagination ──
export type AdminIncompleteFilters = {
  status: "all" | "pending" | "contacted" | "recovered";
  search: string;
};

export type AdminIncompletePage = {
  rows: any[];
  total: number;
  page: number;
  page_size: number;
};

const EMPTY_INCOMPLETE_COUNTS: Record<string, number> = {
  all: 0, pending: 0, contacted: 0, recovered: 0,
};

export const incompleteKeys = {
  root: ["admin", "incomplete-orders"] as const,
  page: (f: AdminIncompleteFilters, page: number, size: number) =>
    ["admin", "incomplete-orders", "page", { ...f, page, size }] as const,
  counts: (search: string) =>
    ["admin", "incomplete-orders", "counts", { search }] as const,
  stats: ["admin", "incomplete-orders", "stats"] as const,
};

export function useAdminIncompleteOrdersPage(
  filters: AdminIncompleteFilters,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: incompleteKeys.page(filters, page, pageSize),
    queryFn: async (): Promise<AdminIncompletePage> => {
      const { data, error } = await supabase.rpc("get_admin_incomplete_orders_page" as any, {
        _page: page,
        _page_size: pageSize,
        _status: !filters.status || filters.status === "all" ? null : filters.status,
        _search: filters.search?.trim() ? filters.search.trim() : null,
      } as any);
      if (error) throw error;
      const d = (data as any) || {};
      return {
        rows: Array.isArray(d.rows) ? d.rows : [],
        total: Number(d.total ?? 0),
        page: Number(d.page ?? page),
        page_size: Number(d.page_size ?? pageSize),
      };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useAdminIncompleteOrderCounts(search: string) {
  return useQuery({
    queryKey: incompleteKeys.counts(search),
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase.rpc("get_admin_incomplete_order_counts" as any, {
        _search: search?.trim() ? search.trim() : null,
      } as any);
      if (error) throw error;
      return { ...EMPTY_INCOMPLETE_COUNTS, ...((data as any) || {}) };
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useAdminIncompleteOrderStats() {
  return useQuery({
    queryKey: incompleteKeys.stats,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_admin_incomplete_order_stats");
      if (error) throw error;
      const d = (data as any) || {};
      return {
        total: Number(d.total ?? 0),
        recovered: Number(d.recovered ?? 0),
        rate: Number(d.rate ?? 0),
        abandonedValue: Number(d.abandonedValue ?? 0),
        topAbandoned: Array.isArray(d.topAbandoned) ? d.topAbandoned : [],
      };
    },
    staleTime: 60_000,
  });
}



