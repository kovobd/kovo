import { supabase } from "@/integrations/supabase/client";
import { usePagePolling } from "@/hooks/usePagePolling";

export type DashboardChartPoint = { label: string; revenue: number; orders: number };
export type DashboardLowStock = { id: string; name: string; stock: number };
export type DashboardRecentOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  total: number;
  order_status: string;
  created_at: string;
};
export type DashboardTopProduct = {
  product_id: string;
  product_name: string;
  units_sold: number;
  revenue: number;
};

export type DashboardMetricsRow = {
  orders_today: number;
  orders_7d: number;
  orders_30d: number;
  orders_total: number;
  revenue_today: number;
  revenue_7d: number;
  revenue_30d: number;
  revenue_total: number;
  pending_count: number;
  processing_count: number;
  shipped_count: number;
  delivered_count: number;
  cancelled_count: number;
  low_stock_count: number;
  out_of_stock_count: number;
  products_total: number;
  customers_total: number;
  incomplete_orders_count: number;
  refreshed_at: string;
};

export type DashboardFull = {
  metrics: DashboardMetricsRow;
  top_products: DashboardTopProduct[];
  chart: DashboardChartPoint[];
  low_stock: DashboardLowStock[];
  recent_orders: DashboardRecentOrder[];
  range_days: number;
};

export const dashboardKeys = {
  full: (rangeDays: number) => ["admin", "dashboard-full", rangeDays] as const,
};

export function useDashboardMetrics(rangeDays: number) {
  // Live order/notification badges already stream through useAdminNotifications
  // (realtime). The dashboard summary itself just needs to be reasonably fresh,
  // so we double both the cache lifetime and poll interval to halve free-tier
  // RPC load without affecting perceived liveness.
  return usePagePolling<DashboardFull>({
    queryKey: dashboardKeys.full(rangeDays),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_dashboard_full", { _range_days: rangeDays });
      if (error) throw error;
      return data as unknown as DashboardFull;
    },
    staleTime: 120_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    intervalMs: 120_000,
  });
}
