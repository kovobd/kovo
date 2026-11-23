
-- Extended dashboard RPC: returns metrics + chart series + low_stock + recent_orders + top_products in one call
-- Adds mv_orders_daily_90d for cheap daily chart data; today hourly computed live (small set)

DROP MATERIALIZED VIEW IF EXISTS public.mv_orders_daily_90d;
CREATE MATERIALIZED VIEW public.mv_orders_daily_90d AS
SELECT
  (created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*)::int AS orders,
  COALESCE(SUM(total), 0)::numeric AS revenue
FROM public.orders
WHERE created_at >= now() - interval '90 days'
GROUP BY 1
ORDER BY 1;

CREATE UNIQUE INDEX IF NOT EXISTS mv_orders_daily_90d_pk ON public.mv_orders_daily_90d(day);
REVOKE ALL ON public.mv_orders_daily_90d FROM anon, authenticated;
GRANT SELECT ON public.mv_orders_daily_90d TO service_role;

-- Schedule (idempotent: unschedule first)
DO $$ BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'refresh-orders-daily-90d';
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'refresh-orders-daily-90d',
  '*/5 * * * *',
  $$ REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_orders_daily_90d; $$
);

REFRESH MATERIALIZED VIEW public.mv_orders_daily_90d;

-- Extended dashboard RPC
CREATE OR REPLACE FUNCTION public.get_dashboard_full(_range_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _metrics jsonb;
  _top jsonb;
  _chart jsonb;
  _low jsonb;
  _recent jsonb;
  _days int := GREATEST(1, LEAST(COALESCE(_range_days, 30), 90));
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(m) INTO _metrics FROM public.mv_dashboard_metrics m LIMIT 1;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.units_sold DESC), '[]'::jsonb)
    INTO _top FROM public.mv_top_products_30d t;

  -- Chart series
  IF _days <= 1 THEN
    -- Today hourly (small live query)
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label', to_char(h, 'HH24:00'),
      'revenue', COALESCE(rev, 0),
      'orders', COALESCE(cnt, 0)
    ) ORDER BY h), '[]'::jsonb)
    INTO _chart
    FROM generate_series(0, 23) AS h
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM created_at)::int AS hh,
             SUM(total)::numeric AS rev,
             COUNT(*)::int AS cnt
      FROM public.orders
      WHERE created_at::date = CURRENT_DATE
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

  -- Low stock
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'stock', stock
  ) ORDER BY stock ASC), '[]'::jsonb)
  INTO _low
  FROM (
    SELECT id, name, stock FROM public.products
    WHERE stock <= 5 ORDER BY stock ASC LIMIT 5
  ) s;

  -- Recent orders
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'order_number', order_number, 'customer_name', customer_name,
    'total', total, 'order_status', order_status, 'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO _recent
  FROM (
    SELECT id, order_number, customer_name, total, order_status, created_at
    FROM public.orders ORDER BY created_at DESC LIMIT 5
  ) r;

  RETURN jsonb_build_object(
    'metrics', _metrics,
    'top_products', _top,
    'chart', _chart,
    'low_stock', _low,
    'recent_orders', _recent,
    'range_days', _days
  );
END $$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_full(int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_full(int) FROM anon;
