
-- ============================================================================
-- Orders module overhaul: audit, inventory, soft delete, paid-only revenue
-- ============================================================================

-- 1. Add new columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS restocked_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON public.orders (paid_at) WHERE payment_status = 'paid' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON public.orders (deleted_at);

-- 2. Order audit log
CREATE TABLE IF NOT EXISTS public.order_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  admin_id uuid,
  action text NOT NULL,
  previous_value jsonb,
  new_value jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_audit_order ON public.order_audit_log (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_audit_action ON public.order_audit_log (action, created_at DESC);

GRANT SELECT, INSERT ON public.order_audit_log TO authenticated;
GRANT ALL ON public.order_audit_log TO service_role;
ALTER TABLE public.order_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/staff read order audit" ON public.order_audit_log;
CREATE POLICY "Admin/staff read order audit" ON public.order_audit_log
  FOR SELECT TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin/staff insert order audit" ON public.order_audit_log;
CREATE POLICY "Admin/staff insert order audit" ON public.order_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

-- 3. Inventory transactions
CREATE TABLE IF NOT EXISTS public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  quantity_delta integer NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_tx_order ON public.inventory_transactions (order_id, reason);
-- Idempotency: only one restock-on-cancel per (order, product, variant)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inv_tx_cancel_restock
  ON public.inventory_transactions (order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE reason = 'cancel_restock';

GRANT SELECT, INSERT ON public.inventory_transactions TO authenticated;
GRANT ALL ON public.inventory_transactions TO service_role;
ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/staff read inv tx" ON public.inventory_transactions;
CREATE POLICY "Admin/staff read inv tx" ON public.inventory_transactions
  FOR SELECT TO authenticated USING (public.is_admin_or_staff(auth.uid()));

DROP POLICY IF EXISTS "Admin/staff insert inv tx" ON public.inventory_transactions;
CREATE POLICY "Admin/staff insert inv tx" ON public.inventory_transactions
  FOR INSERT TO authenticated WITH CHECK (public.is_admin_or_staff(auth.uid()));

-- 4. Payment status transition trigger (stamp paid_at + audit)
CREATE OR REPLACE FUNCTION public.orders_payment_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    -- Stamp paid_at on first entry to 'paid', keep historical timestamp afterward.
    IF NEW.payment_status = 'paid' AND OLD.payment_status <> 'paid' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;

    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (
      NEW.id, auth.uid(), 'payment_status_changed',
      jsonb_build_object('payment_status', OLD.payment_status),
      jsonb_build_object('payment_status', NEW.payment_status, 'paid_at', NEW.paid_at)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_payment_transition ON public.orders;
CREATE TRIGGER trg_orders_payment_transition
BEFORE UPDATE OF payment_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_payment_status_transition();

-- 5. Order status transition + cancel restock (idempotent)
CREATE OR REPLACE FUNCTION public.orders_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _item jsonb;
  _pid uuid;
  _vid uuid;
  _qty integer;
  _name text;
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (
      NEW.id, auth.uid(), 'order_status_changed',
      jsonb_build_object('order_status', OLD.order_status),
      jsonb_build_object('order_status', NEW.order_status)
    );

    -- Restock on transition INTO cancelled, exactly once.
    IF NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND NEW.restocked_at IS NULL THEN
      IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
        FOR _item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
          IF COALESCE((_item->>'is_free_gift')::boolean, false) THEN CONTINUE; END IF;

          BEGIN _pid := NULLIF(_item->>'product_id','')::uuid;
          EXCEPTION WHEN others THEN _pid := NULL; END;
          IF _pid IS NULL THEN
            BEGIN _pid := NULLIF(_item->>'id','')::uuid;
            EXCEPTION WHEN others THEN _pid := NULL; END;
          END IF;
          IF _pid IS NULL THEN CONTINUE; END IF;

          BEGIN _vid := NULLIF(_item->>'variant_id','')::uuid;
          EXCEPTION WHEN others THEN _vid := NULL; END;

          _qty := COALESCE(NULLIF(_item->>'quantity','')::integer, 1);
          _name := COALESCE(_item->>'name','item');
          IF _qty <= 0 THEN CONTINUE; END IF;

          -- Try to record the transaction; if duplicate, skip (already restocked).
          BEGIN
            INSERT INTO public.inventory_transactions (order_id, product_id, variant_id, quantity_delta, reason)
            VALUES (NEW.id, _pid, _vid, _qty, 'cancel_restock');
          EXCEPTION WHEN unique_violation THEN
            CONTINUE;
          END;

          UPDATE public.products SET stock = COALESCE(stock,0) + _qty WHERE id = _pid;
          IF _vid IS NOT NULL THEN
            UPDATE public.product_variants SET stock = COALESCE(stock,0) + _qty WHERE id = _vid;
          END IF;

          INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
          VALUES (NEW.id, auth.uid(), 'inventory_restored', NULL,
            jsonb_build_object('product_id', _pid, 'variant_id', _vid, 'quantity', _qty, 'name', _name));
        END LOOP;
      END IF;
      NEW.restocked_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_status_transition ON public.orders;
CREATE TRIGGER trg_orders_status_transition
BEFORE UPDATE OF order_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_status_transition();

-- 6. Soft-delete audit (when deleted_at is set)
CREATE OR REPLACE FUNCTION public.orders_soft_delete_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (NEW.id, auth.uid(), 'order_deleted', NULL,
      jsonb_build_object('order_number', NEW.order_number, 'deleted_at', NEW.deleted_at));
  ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (NEW.id, auth.uid(), 'order_restored', NULL, jsonb_build_object('order_number', NEW.order_number));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_orders_soft_delete_audit ON public.orders;
CREATE TRIGGER trg_orders_soft_delete_audit
BEFORE UPDATE OF deleted_at ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.orders_soft_delete_audit();

-- 7. Backfill paid_at for existing paid orders
UPDATE public.orders
SET paid_at = COALESCE(paid_at, updated_at, created_at)
WHERE payment_status = 'paid' AND paid_at IS NULL;

-- 8. Replace materialized views with live views (paid-only revenue, exclude deleted)
DROP MATERIALIZED VIEW IF EXISTS public.mv_dashboard_metrics CASCADE;
CREATE VIEW public.mv_dashboard_metrics AS
WITH base AS (
  SELECT
    COALESCE(o.total, 0)::numeric AS total,
    o.order_status,
    o.payment_status,
    o.created_at,
    o.paid_at
  FROM public.orders o
  WHERE o.deleted_at IS NULL
),
agg AS (
  SELECT
    count(*) FILTER (WHERE (created_at)::date = CURRENT_DATE) AS orders_today,
    count(*) FILTER (WHERE created_at >= now() - interval '7 days') AS orders_7d,
    count(*) FILTER (WHERE created_at >= now() - interval '30 days') AS orders_30d,
    count(*) AS orders_total,
    COALESCE(sum(total) FILTER (WHERE payment_status = 'paid' AND (paid_at)::date = CURRENT_DATE), 0) AS revenue_today,
    COALESCE(sum(total) FILTER (WHERE payment_status = 'paid' AND paid_at >= now() - interval '7 days'), 0) AS revenue_7d,
    COALESCE(sum(total) FILTER (WHERE payment_status = 'paid' AND paid_at >= now() - interval '30 days'), 0) AS revenue_30d,
    COALESCE(sum(total) FILTER (WHERE payment_status = 'paid'), 0) AS revenue_total,
    count(*) FILTER (WHERE order_status = 'pending') AS pending_count,
    count(*) FILTER (WHERE order_status = 'processing') AS processing_count,
    count(*) FILTER (WHERE order_status = 'shipped') AS shipped_count,
    count(*) FILTER (WHERE order_status = 'delivered') AS delivered_count,
    count(*) FILTER (WHERE order_status = 'cancelled') AS cancelled_count
  FROM base
),
stock AS (
  SELECT
    count(*) FILTER (WHERE stock <= 5 AND stock > 0) AS low_stock_count,
    count(*) FILTER (WHERE stock = 0) AS out_of_stock_count,
    count(*) AS products_total
  FROM public.products
),
custs AS (SELECT count(*) AS customers_total FROM public.customers),
incomp AS (SELECT count(*) AS incomplete_orders_count FROM public.incomplete_orders WHERE recovered = false)
SELECT
  1 AS id,
  agg.orders_today, agg.orders_7d, agg.orders_30d, agg.orders_total,
  agg.revenue_today, agg.revenue_7d, agg.revenue_30d, agg.revenue_total,
  agg.pending_count, agg.processing_count, agg.shipped_count, agg.delivered_count, agg.cancelled_count,
  stock.low_stock_count, stock.out_of_stock_count, stock.products_total,
  custs.customers_total, incomp.incomplete_orders_count,
  now() AS refreshed_at
FROM agg, stock, custs, incomp;

GRANT SELECT ON public.mv_dashboard_metrics TO authenticated, service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_orders_daily_90d CASCADE;
CREATE VIEW public.mv_orders_daily_90d AS
SELECT
  (paid_at AT TIME ZONE 'UTC')::date AS day,
  count(*)::int AS orders,
  COALESCE(sum(total), 0) AS revenue
FROM public.orders
WHERE deleted_at IS NULL
  AND payment_status = 'paid'
  AND paid_at IS NOT NULL
  AND paid_at >= now() - interval '90 days'
GROUP BY (paid_at AT TIME ZONE 'UTC')::date
ORDER BY (paid_at AT TIME ZONE 'UTC')::date;
GRANT SELECT ON public.mv_orders_daily_90d TO authenticated, service_role;

DROP MATERIALIZED VIEW IF EXISTS public.mv_top_products_30d CASCADE;
CREATE VIEW public.mv_top_products_30d AS
SELECT
  ((item.value ->> 'id'))::uuid AS product_id,
  min(item.value ->> 'name') AS product_name,
  sum(COALESCE((item.value ->> 'quantity')::int, 1)) AS units_sold,
  sum(COALESCE((item.value ->> 'quantity')::int, 1)::numeric * COALESCE((item.value ->> 'price')::numeric, 0)) AS revenue
FROM public.orders o
CROSS JOIN LATERAL jsonb_array_elements(o.items) item(value)
WHERE o.deleted_at IS NULL
  AND o.payment_status = 'paid'
  AND o.paid_at >= now() - interval '30 days'
  AND (item.value ->> 'id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
GROUP BY ((item.value ->> 'id'))::uuid
ORDER BY sum(COALESCE((item.value ->> 'quantity')::int, 1)) DESC
LIMIT 20;
GRANT SELECT ON public.mv_top_products_30d TO authenticated, service_role;

-- 9. Update admin RPCs to ignore soft-deleted orders
CREATE OR REPLACE FUNCTION public.get_admin_orders_page(_page integer DEFAULT 1, _page_size integer DEFAULT 50, _status text DEFAULT NULL::text, _search text DEFAULT NULL::text, _payment_status text DEFAULT NULL::text, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _offset int; _limit int; _total bigint; _rows jsonb; _q text; _like text;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _limit := GREATEST(1, LEAST(COALESCE(_page_size, 50), 200));
  _offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * _limit;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT * FROM public.orders o
     WHERE o.deleted_at IS NULL
       AND (_status IS NULL OR _status = 'all' OR o.order_status = _status)
       AND (_payment_status IS NULL OR _payment_status = 'all' OR o.payment_status = _payment_status)
       AND (_date_from IS NULL OR o.created_at >= _date_from)
       AND (_date_to IS NULL OR o.created_at <= _date_to)
       AND (
         _q IS NULL
         OR lower(o.order_number) LIKE _like
         OR lower(COALESCE(o.customer_name, '')) LIKE _like
         OR lower(COALESCE(o.customer_email, '')) LIKE _like
         OR COALESCE(o.customer_phone, '') LIKE '%' || _q || '%'
       )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM filtered),
  page AS (SELECT * FROM filtered ORDER BY created_at DESC LIMIT _limit OFFSET _offset)
  SELECT (SELECT c FROM counted), COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO _total, _rows FROM page p;

  RETURN jsonb_build_object('rows', _rows, 'total', _total,
    'page', GREATEST(1, COALESCE(_page, 1)), 'page_size', _limit);
END $function$;

CREATE OR REPLACE FUNCTION public.get_admin_order_status_counts(_search text DEFAULT NULL::text, _payment_status text DEFAULT NULL::text, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _q text; _like text; _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT order_status FROM public.orders o
     WHERE o.deleted_at IS NULL
       AND (_payment_status IS NULL OR _payment_status = 'all' OR o.payment_status = _payment_status)
       AND (_date_from IS NULL OR o.created_at >= _date_from)
       AND (_date_to IS NULL OR o.created_at <= _date_to)
       AND (
         _q IS NULL
         OR lower(o.order_number) LIKE _like
         OR lower(COALESCE(o.customer_name, '')) LIKE _like
         OR lower(COALESCE(o.customer_email, '')) LIKE _like
         OR COALESCE(o.customer_phone, '') LIKE '%' || _q || '%'
       )
  )
  SELECT jsonb_build_object(
    'all', count(*),
    'pending', count(*) FILTER (WHERE order_status = 'pending'),
    'confirmed', count(*) FILTER (WHERE order_status = 'confirmed'),
    'processing', count(*) FILTER (WHERE order_status = 'processing'),
    'shipped', count(*) FILTER (WHERE order_status = 'shipped'),
    'delivered', count(*) FILTER (WHERE order_status = 'delivered'),
    'cancelled', count(*) FILTER (WHERE order_status = 'cancelled')
  ) INTO _result FROM filtered;
  RETURN COALESCE(_result, jsonb_build_object('all',0,'pending',0,'confirmed',0,'processing',0,'shipped',0,'delivered',0,'cancelled',0));
END $function$;

-- 10. Recreate get_dashboard_full so it ignores deleted in low_stock/recent_orders
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
      SELECT EXTRACT(HOUR FROM paid_at)::int AS hh,
             SUM(total)::numeric AS rev,
             COUNT(*)::int AS cnt
      FROM public.orders
      WHERE deleted_at IS NULL AND payment_status = 'paid' AND paid_at::date = CURRENT_DATE
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
