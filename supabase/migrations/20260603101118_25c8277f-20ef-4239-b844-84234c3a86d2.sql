
-- =====================================================================
-- Phase 1 migration: indexes + dashboard materialized view + pg_cron
-- =====================================================================

-- ---------- Indexes (IF NOT EXISTS, idempotent) ----------
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_category_sort ON public.products(category_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(sort_order) WHERE featured = true;
CREATE INDEX IF NOT EXISTS idx_products_best_seller ON public.products(sort_order) WHERE best_seller = true;
CREATE INDEX IF NOT EXISTS idx_products_new_arrival ON public.products(sort_order) WHERE is_new_arrival = true;
CREATE INDEX IF NOT EXISTS idx_products_created_desc ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_status ON public.products(status);

CREATE INDEX IF NOT EXISTS idx_product_media_product_sort ON public.product_media(product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_active ON public.product_variants(product_id) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_product_offers_product_enabled ON public.product_offers(product_id) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_reviews_product_created ON public.reviews(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_status ON public.orders(created_at DESC, order_status);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);

CREATE INDEX IF NOT EXISTS idx_hero_slides_enabled_sort ON public.hero_slides(sort_order) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_featured_categories_enabled_sort ON public.featured_categories(sort_order) WHERE enabled = true;
CREATE INDEX IF NOT EXISTS idx_video_testimonials_enabled_sort ON public.video_testimonials(sort_order) WHERE enabled = true;

-- ---------- Extensions for cron ----------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------- Materialized view: dashboard metrics ----------
DROP MATERIALIZED VIEW IF EXISTS public.mv_dashboard_metrics;
CREATE MATERIALIZED VIEW public.mv_dashboard_metrics AS
WITH base AS (
  SELECT
    COALESCE(total, 0)::numeric AS total,
    order_status,
    payment_status,
    created_at
  FROM public.orders
),
agg AS (
  SELECT
    COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE) AS orders_today,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS orders_7d,
    COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days') AS orders_30d,
    COUNT(*) AS orders_total,
    COALESCE(SUM(total) FILTER (WHERE created_at::date = CURRENT_DATE), 0) AS revenue_today,
    COALESCE(SUM(total) FILTER (WHERE created_at >= now() - interval '7 days'), 0) AS revenue_7d,
    COALESCE(SUM(total) FILTER (WHERE created_at >= now() - interval '30 days'), 0) AS revenue_30d,
    COALESCE(SUM(total), 0) AS revenue_total,
    COUNT(*) FILTER (WHERE order_status = 'pending') AS pending_count,
    COUNT(*) FILTER (WHERE order_status = 'processing') AS processing_count,
    COUNT(*) FILTER (WHERE order_status = 'shipped') AS shipped_count,
    COUNT(*) FILTER (WHERE order_status = 'delivered') AS delivered_count,
    COUNT(*) FILTER (WHERE order_status = 'cancelled') AS cancelled_count
  FROM base
),
stock AS (
  SELECT
    COUNT(*) FILTER (WHERE stock <= 5 AND stock > 0) AS low_stock_count,
    COUNT(*) FILTER (WHERE stock = 0) AS out_of_stock_count,
    COUNT(*) AS products_total
  FROM public.products
),
customers AS (
  SELECT COUNT(*) AS customers_total FROM public.customers
),
incomp AS (
  SELECT COUNT(*) AS incomplete_orders_count
  FROM public.incomplete_orders WHERE recovered = false
)
SELECT
  1 AS id,
  agg.*,
  stock.low_stock_count,
  stock.out_of_stock_count,
  stock.products_total,
  customers.customers_total,
  incomp.incomplete_orders_count,
  now() AS refreshed_at
FROM agg, stock, customers, incomp;

CREATE UNIQUE INDEX IF NOT EXISTS mv_dashboard_metrics_pk ON public.mv_dashboard_metrics(id);

-- ---------- Materialized view: top products last 30 days ----------
DROP MATERIALIZED VIEW IF EXISTS public.mv_top_products_30d;
CREATE MATERIALIZED VIEW public.mv_top_products_30d AS
SELECT
  (item->>'id')::uuid AS product_id,
  MIN(item->>'name') AS product_name,
  SUM(COALESCE((item->>'quantity')::int, 1)) AS units_sold,
  SUM(COALESCE((item->>'quantity')::int, 1) * COALESCE((item->>'price')::numeric, 0)) AS revenue
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(o.items) AS item
WHERE o.created_at >= now() - interval '30 days'
  AND o.order_status <> 'cancelled'
  AND (item->>'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY (item->>'id')::uuid
ORDER BY units_sold DESC
LIMIT 20;

CREATE UNIQUE INDEX IF NOT EXISTS mv_top_products_30d_pk ON public.mv_top_products_30d(product_id);

-- ---------- Admin-only RPC to read dashboard metrics ----------
CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _row jsonb; _top jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT to_jsonb(m) INTO _row FROM public.mv_dashboard_metrics m LIMIT 1;
  SELECT jsonb_agg(to_jsonb(t)) INTO _top FROM public.mv_top_products_30d t;
  RETURN jsonb_build_object('metrics', _row, 'top_products', COALESCE(_top, '[]'::jsonb));
END $$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_metrics() FROM anon;

-- ---------- Initial populate ----------
REFRESH MATERIALIZED VIEW public.mv_dashboard_metrics;
REFRESH MATERIALIZED VIEW public.mv_top_products_30d;

-- ---------- Schedule refresh every 5 minutes ----------
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('refresh-dashboard-metrics','refresh-top-products');

SELECT cron.schedule(
  'refresh-dashboard-metrics',
  '*/5 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_dashboard_metrics; $$
);

SELECT cron.schedule(
  'refresh-top-products',
  '*/15 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_top_products_30d; $$
);
