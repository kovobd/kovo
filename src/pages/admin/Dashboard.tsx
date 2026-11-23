import { useState, lazy, Suspense } from "react";
import { useDashboardMetrics, dashboardKeys } from "@/hooks/useDashboardMetrics";
import { Package, ShoppingCart, DollarSign, Users, AlertTriangle, TrendingUp, BarChart3 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCY_SYMBOL } from "@/lib/currency";


import { PageHeader, Section, EmptyState, StatusPill } from "@/components/admin/ui";
import StatCard from "@/components/admin/ui/StatCard";

import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
import RefreshButton from "@/components/admin/RefreshButton";

const SalesChart = lazy(() => import("@/components/admin/SalesChart"));

const RANGE_MAP: Record<string, number> = { "1": 1, "7": 7, "30": 30, "90": 90 };

const Dashboard = () => {
  const [dateFilter, setDateFilter] = useState<"1" | "7" | "30" | "90">("30");
  const rangeDays = RANGE_MAP[dateFilter];
  const { data, isLoading } = useDashboardMetrics(rangeDays);

  if (isLoading || !data) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="a-skeleton h-8 w-36" />
          <div className="a-skeleton h-10 w-[140px]" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1,2,3,4].map(i => <div key={i} className="a-skeleton h-[108px] rounded-2xl" />)}
        </div>
        <div className="a-skeleton h-[72px] rounded-2xl" />
        <div className="a-skeleton h-72 rounded-2xl" />
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="a-skeleton h-56 rounded-2xl" />
          <div className="a-skeleton h-56 rounded-2xl" />
        </div>
      </div>
    );
  }

  const { metrics, top_products, chart, low_stock, recent_orders } = data;
  const fmtMoney = (n: number) => `${CURRENCY_SYMBOL}${Number(n || 0).toLocaleString()}`;
  const rangeLabel = dateFilter === "1" ? "Today" : dateFilter === "7" ? "Last 7 days" : dateFilter === "30" ? "Last 30 days" : "Last 90 days";

  // Pick revenue/orders for the active range from MV (where possible) or sum from chart.
  const rangeRevenue =
    dateFilter === "1" ? Number(metrics.revenue_today) :
    dateFilter === "7" ? Number(metrics.revenue_7d) :
    dateFilter === "30" ? Number(metrics.revenue_30d) :
    chart.reduce((s, p) => s + Number(p.revenue || 0), 0);
  const rangeOrders =
    dateFilter === "1" ? Number(metrics.orders_today) :
    dateFilter === "7" ? Number(metrics.orders_7d) :
    dateFilter === "30" ? Number(metrics.orders_30d) :
    chart.reduce((s, p) => s + Number(p.orders || 0), 0);

  const revenueSeries = chart.map(p => Number(p.revenue || 0));
  const ordersSeries  = chart.map(p => Number(p.orders  || 0));

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Mobile header — compact, stacked */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-2 mb-1">
          <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "hsl(var(--a-ink))" }}>
            Dashboard
          </h1>
          <RefreshButton queryKey={dashboardKeys.full(rangeDays)} />
        </div>
        <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
          <SelectTrigger className="w-full rounded-xl text-[13px] h-10 border-0 shadow-[var(--a-shadow-ring),var(--a-shadow-xs)] bg-[hsl(var(--a-surface))]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="1">Today</SelectItem>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Desktop / tablet header */}
      <div className="hidden sm:block">
        <PageHeader
          eyebrow="Overview"
          title="Dashboard"
          subtitle="Welcome back — here's what's happening across your store."
          actions={
            <div className="flex items-center gap-2">
              <RefreshButton queryKey={dashboardKeys.full(rangeDays)} />
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
                <SelectTrigger className="w-[148px] rounded-xl text-[13px] h-10 border-0 shadow-[var(--a-shadow-ring),var(--a-shadow-xs)] bg-[hsl(var(--a-surface))]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="1">Today</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          }
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <StatCard
          highlight index={0} icon={DollarSign} label="Revenue"
          value={rangeRevenue} valuePrefix={CURRENCY_SYMBOL}
          sub={`Today ${fmtMoney(metrics.revenue_today)}`}
          sparkline={revenueSeries.length > 1 ? revenueSeries : undefined}
        />
        <StatCard
          tone="info" index={1} icon={ShoppingCart} label="Orders"
          value={rangeOrders} sub={rangeLabel}
          sparkline={ordersSeries.length > 1 ? ordersSeries : undefined}
        />
        <StatCard
          tone="violet" index={2} icon={Package} label="Products"
          value={Number(metrics.products_total)}
        />
        <StatCard
          tone="warning" index={3} icon={Users} label="Customers"
          value={Number(metrics.customers_total)} sub="All-time"
        />
      </div>

      


      <Section title="Sales overview" description={rangeLabel}>
        <div className="h-48 sm:h-64">

          {chart.every((p) => Number(p.revenue) === 0 && Number(p.orders) === 0) ? (
            <EmptyState icon={<BarChart3 size={18} />} title="No sales in this range" description="Once orders come in, you'll see them here." />
          ) : (
            <AdminErrorBoundary
              label="SalesChart"
              fallback={(reset) => (
                <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                  <p className="text-[13px]" style={{ color: "hsl(var(--a-muted))" }}>Chart unavailable.</p>
                  <button onClick={reset} className="text-[12px] font-medium underline" style={{ color: "hsl(var(--a-ink))" }}>Retry</button>
                </div>
              )}
            >
              <Suspense fallback={<div className="a-skeleton w-full h-full rounded-xl" />}>
                <SalesChart data={chart.map(c => ({ label: c.label, revenue: Number(c.revenue), orders: Number(c.orders) }))} dense={dateFilter === "1"} />
              </Suspense>
            </AdminErrorBoundary>
          )}
        </div>
      </Section>

      <div className="grid lg:grid-cols-2 gap-3 sm:gap-4">

        <Section title="Low stock" description="Products running low (≤ 5)">
          {low_stock.length === 0 ? (
            <EmptyState icon={<AlertTriangle size={18} />} title="All good" description="No products are running low on stock." />
          ) : (
            <div className="space-y-2.5">
              {low_stock.map((p) => (
                <div key={p.id} className="flex justify-between items-center text-[13px]">
                  <span className="text-foreground/85 truncate pr-4">{p.name || p.id}</span>
                  <span className="text-destructive font-medium shrink-0 tabular-nums">{p.stock} left</span>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Best sellers" description="Top performers · last 30 days">
          {top_products.length === 0 ? (
            <EmptyState icon={<TrendingUp size={18} />} title="No data yet" description="Sales data will appear here once orders come in." />
          ) : (
            <div className="space-y-2.5">
              {top_products.slice(0, 5).map((p) => (
                <div key={p.product_id} className="flex justify-between items-center text-[13px]">
                  <span className="text-foreground/85 truncate pr-4">{p.product_name}</span>
                  <span className="text-muted-foreground/70 font-medium shrink-0 tabular-nums">{p.units_sold} sold · {fmtMoney(Number(p.revenue))}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      <Section title="Recent orders" description="Latest activity from your storefront">
        {recent_orders.length === 0 ? (
          <EmptyState icon={<ShoppingCart size={18} />} title="No orders yet" description="New orders will appear here." />
        ) : (
          <div className="divide-y divide-[hsl(var(--a-divider))] -my-2">
            {recent_orders.map((o) => {
              const tone =
                o.order_status === "delivered" ? "success" :
                o.order_status === "pending"   ? "warning" :
                o.order_status === "cancelled" ? "danger"  : "neutral";
              return (
                <div key={o.id} className="flex justify-between items-center py-3">
                  <div className="min-w-0 pr-3">
                    <p className="text-[13px] font-medium truncate" style={{ color: "hsl(var(--a-ink))" }}>{o.order_number}</p>
                    <p className="text-[12px] truncate" style={{ color: "hsl(var(--a-soft))" }}>{o.customer_name}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-[13px] font-medium tabular-nums" style={{ color: "hsl(var(--a-ink))" }}>{fmtMoney(Number(o.total))}</p>
                    <StatusPill tone={tone as any} className="capitalize">{o.order_status}</StatusPill>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </div>
  );
};

export default Dashboard;
