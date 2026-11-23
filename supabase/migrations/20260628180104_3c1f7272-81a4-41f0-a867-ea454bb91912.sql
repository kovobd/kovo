
-- Dashboard revenue should include all non-cancelled orders (COD pending counts).
-- Base revenue date on created_at so COD is recognized at order time.
CREATE OR REPLACE VIEW public.mv_dashboard_metrics AS
WITH base AS (
  SELECT COALESCE(o.total, 0)::numeric AS total,
         o.order_status,
         o.payment_status,
         o.created_at,
         o.paid_at
    FROM public.orders o
   WHERE o.deleted_at IS NULL
), agg AS (
  SELECT
    count(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS orders_today,
    count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS orders_7d,
    count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS orders_30d,
    count(*) AS orders_total,
    COALESCE(sum(total) FILTER (WHERE order_status <> 'cancelled' AND created_at::date = CURRENT_DATE), 0) AS revenue_today,
    COALESCE(sum(total) FILTER (WHERE order_status <> 'cancelled' AND created_at >= now() - interval '7 days'), 0) AS revenue_7d,
    COALESCE(sum(total) FILTER (WHERE order_status <> 'cancelled' AND created_at >= now() - interval '30 days'), 0) AS revenue_30d,
    COALESCE(sum(total) FILTER (WHERE order_status <> 'cancelled'), 0) AS revenue_total,
    count(*) FILTER (WHERE order_status = 'pending') AS pending_count,
    count(*) FILTER (WHERE order_status = 'processing') AS processing_count,
    count(*) FILTER (WHERE order_status = 'shipped') AS shipped_count,
    count(*) FILTER (WHERE order_status = 'delivered') AS delivered_count,
    count(*) FILTER (WHERE order_status = 'cancelled') AS cancelled_count
  FROM base
), stock AS (
  SELECT count(*) FILTER (WHERE p.stock <= 5 AND p.stock > 0) AS low_stock_count,
         count(*) FILTER (WHERE p.stock = 0) AS out_of_stock_count,
         count(*) AS products_total
    FROM public.products p
), custs AS (
  SELECT count(*) AS customers_total FROM public.customers
), incomp AS (
  SELECT count(*) AS incomplete_orders_count
    FROM public.incomplete_orders WHERE recovered = false
)
SELECT 1 AS id,
       agg.orders_today, agg.orders_7d, agg.orders_30d, agg.orders_total,
       agg.revenue_today, agg.revenue_7d, agg.revenue_30d, agg.revenue_total,
       agg.pending_count, agg.processing_count, agg.shipped_count, agg.delivered_count, agg.cancelled_count,
       stock.low_stock_count, stock.out_of_stock_count, stock.products_total,
       custs.customers_total, incomp.incomplete_orders_count, now() AS refreshed_at
  FROM agg, stock, custs, incomp;

-- 90-day trend: count all non-cancelled orders by created_at.
CREATE OR REPLACE VIEW public.mv_orders_daily_90d AS
SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
       count(*)::integer AS orders,
       COALESCE(sum(total), 0)::numeric AS revenue
  FROM public.orders
 WHERE deleted_at IS NULL
   AND order_status <> 'cancelled'
   AND created_at >= now() - interval '90 days'
 GROUP BY 1
 ORDER BY 1;

-- Top products in last 30 days: include all non-cancelled orders.
CREATE OR REPLACE VIEW public.mv_top_products_30d AS
SELECT (item.value ->> 'id')::uuid AS product_id,
       min(item.value ->> 'name') AS product_name,
       sum(COALESCE((item.value ->> 'quantity')::integer, 1)) AS units_sold,
       sum(COALESCE((item.value ->> 'quantity')::integer, 1)::numeric
           * COALESCE((item.value ->> 'price')::numeric, 0)) AS revenue
  FROM public.orders o
       CROSS JOIN LATERAL jsonb_array_elements(o.items) item(value)
 WHERE o.deleted_at IS NULL
   AND o.order_status <> 'cancelled'
   AND o.created_at >= now() - interval '30 days'
   AND (item.value ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 GROUP BY 1
 ORDER BY units_sold DESC
 LIMIT 20;
