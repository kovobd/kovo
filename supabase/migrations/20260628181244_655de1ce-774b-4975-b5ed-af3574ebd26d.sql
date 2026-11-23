
DROP VIEW IF EXISTS public.mv_dashboard_metrics;
DROP VIEW IF EXISTS public.mv_orders_daily_90d;
DROP VIEW IF EXISTS public.mv_top_products_30d;

CREATE VIEW public.mv_dashboard_metrics AS
WITH base AS (
  SELECT COALESCE(o.total, 0::numeric) AS total,
         o.order_status, o.payment_status, o.created_at, o.paid_at
    FROM public.orders o
   WHERE o.deleted_at IS NULL
), rev AS (
  SELECT total, COALESCE(paid_at, created_at) AS rev_at
    FROM base
   WHERE order_status = 'delivered' AND payment_status = 'paid'
), agg AS (
  SELECT
    count(*) FILTER (WHERE base.created_at::date = CURRENT_DATE) AS orders_today,
    count(*) FILTER (WHERE base.created_at >= now() - interval '7 days') AS orders_7d,
    count(*) FILTER (WHERE base.created_at >= now() - interval '30 days') AS orders_30d,
    count(*) AS orders_total,
    count(*) FILTER (WHERE base.order_status = 'pending')    AS pending_count,
    count(*) FILTER (WHERE base.order_status = 'processing') AS processing_count,
    count(*) FILTER (WHERE base.order_status = 'shipped')    AS shipped_count,
    count(*) FILTER (WHERE base.order_status = 'delivered')  AS delivered_count,
    count(*) FILTER (WHERE base.order_status = 'cancelled')  AS cancelled_count
  FROM base
), rev_agg AS (
  SELECT
    COALESCE(sum(total) FILTER (WHERE rev_at::date = CURRENT_DATE), 0) AS revenue_today,
    COALESCE(sum(total) FILTER (WHERE rev_at >= now() - interval '7 days'),  0) AS revenue_7d,
    COALESCE(sum(total) FILTER (WHERE rev_at >= now() - interval '30 days'), 0) AS revenue_30d,
    COALESCE(sum(total), 0) AS revenue_total
  FROM rev
), stock AS (
  SELECT count(*) FILTER (WHERE p.stock <= 5 AND p.stock > 0) AS low_stock_count,
         count(*) FILTER (WHERE p.stock = 0) AS out_of_stock_count,
         count(*) AS products_total
    FROM public.products p
), custs AS (SELECT count(*) AS customers_total FROM public.customers),
incomp AS (SELECT count(*) AS incomplete_orders_count FROM public.incomplete_orders WHERE recovered = false)
SELECT 1 AS id,
  agg.orders_today, agg.orders_7d, agg.orders_30d, agg.orders_total,
  rev_agg.revenue_today, rev_agg.revenue_7d, rev_agg.revenue_30d, rev_agg.revenue_total,
  agg.pending_count, agg.processing_count, agg.shipped_count, agg.delivered_count, agg.cancelled_count,
  stock.low_stock_count, stock.out_of_stock_count, stock.products_total,
  custs.customers_total, incomp.incomplete_orders_count, now() AS refreshed_at
FROM agg, rev_agg, stock, custs, incomp;
GRANT SELECT ON public.mv_dashboard_metrics TO authenticated, service_role;

CREATE VIEW public.mv_orders_daily_90d AS
SELECT (COALESCE(paid_at, created_at) AT TIME ZONE 'UTC')::date AS day,
       count(*)::int AS orders,
       COALESCE(sum(total), 0) AS revenue
  FROM public.orders
 WHERE deleted_at IS NULL
   AND order_status = 'delivered'
   AND payment_status = 'paid'
   AND COALESCE(paid_at, created_at) >= now() - interval '90 days'
 GROUP BY 1
 ORDER BY 1;
GRANT SELECT ON public.mv_orders_daily_90d TO authenticated, service_role;

CREATE VIEW public.mv_top_products_30d AS
SELECT (item.value ->> 'id')::uuid AS product_id,
       min(item.value ->> 'name') AS product_name,
       sum(COALESCE((item.value ->> 'quantity')::int, 1)) AS units_sold,
       sum(COALESCE((item.value ->> 'quantity')::int, 1)::numeric
           * COALESCE((item.value ->> 'price')::numeric, 0)) AS revenue
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items) item(value)
 WHERE o.deleted_at IS NULL
   AND o.order_status = 'delivered'
   AND o.payment_status = 'paid'
   AND COALESCE(o.paid_at, o.created_at) >= now() - interval '30 days'
   AND (item.value ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 GROUP BY 1
 ORDER BY units_sold DESC
 LIMIT 20;
GRANT SELECT ON public.mv_top_products_30d TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_dashboard_full(_range_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _metrics jsonb; _top jsonb; _chart jsonb; _low jsonb; _recent jsonb;
  _days int := GREATEST(1, LEAST(COALESCE(_range_days, 30), 90));
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT to_jsonb(m) INTO _metrics FROM public.mv_dashboard_metrics m LIMIT 1;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.units_sold DESC), '[]'::jsonb)
    INTO _top FROM public.mv_top_products_30d t;

  IF _days <= 1 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label', to_char(h, 'HH24:00'),
      'revenue', COALESCE(rev, 0),
      'orders', COALESCE(cnt, 0)
    ) ORDER BY h), '[]'::jsonb)
    INTO _chart
    FROM generate_series(0, 23) AS h
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM COALESCE(paid_at, created_at))::int AS hh,
             SUM(total)::numeric AS rev,
             COUNT(*)::int AS cnt
      FROM public.orders
      WHERE deleted_at IS NULL
        AND order_status = 'delivered'
        AND payment_status = 'paid'
        AND COALESCE(paid_at, created_at)::date = CURRENT_DATE
      GROUP BY 1
    ) o ON o.hh = h
    LEFT JOIN LATERAL (SELECT o.rev, o.cnt) x ON true;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label', to_char(d, 'Mon DD'),
      'revenue', COALESCE(daily.revenue, 0),
      'orders', COALESCE(daily.orders, 0)
    ) ORDER BY d), '[]'::jsonb)
    INTO _chart
    FROM generate_series((CURRENT_DATE - (_days - 1))::date, CURRENT_DATE, interval '1 day') AS g(d)
    LEFT JOIN public.mv_orders_daily_90d daily ON daily.day = g.d::date;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'stock', stock
  ) ORDER BY stock ASC), '[]'::jsonb)
  INTO _low
  FROM (SELECT id, name, stock FROM public.products WHERE stock <= 5 ORDER BY stock ASC LIMIT 5) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'order_number', order_number, 'customer_name', customer_name,
    'total', total, 'order_status', order_status, 'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO _recent
  FROM (
    SELECT id, order_number, customer_name, total, order_status, created_at
    FROM public.orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5
  ) r;

  RETURN jsonb_build_object(
    'metrics', _metrics, 'top_products', _top, 'chart', _chart,
    'low_stock', _low, 'recent_orders', _recent, 'range_days', _days
  );
END $function$;
