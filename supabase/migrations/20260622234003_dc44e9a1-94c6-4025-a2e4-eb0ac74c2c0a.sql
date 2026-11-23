
-- Paginated incomplete orders for admin
CREATE OR REPLACE FUNCTION public.get_admin_incomplete_orders_page(
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25,
  _status text DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _offset int;
  _limit int;
  _total bigint;
  _rows jsonb;
  _q text;
  _like text;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(_page_size, 25), 200));
  _offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * _limit;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT *
      FROM public.incomplete_orders o
     WHERE o.phone ~ '^01[0-9]{9}$'
       AND jsonb_typeof(o.cart_items) = 'array'
       AND jsonb_array_length(o.cart_items) > 0
       AND (
         _status IS NULL OR _status = 'all'
         OR (_status = 'pending'   AND o.recovered = false AND coalesce(o.recovery_status,'') <> 'contacted')
         OR (_status = 'contacted' AND o.recovered = false AND o.recovery_status = 'contacted')
         OR (_status = 'recovered' AND o.recovered = true)
       )
       AND (
         _q IS NULL
         OR o.phone LIKE '%' || _q || '%'
         OR lower(COALESCE(o.customer_name,'')) LIKE _like
         OR lower(COALESCE(o.email,'')) LIKE _like
       )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM filtered),
  page AS (
    SELECT * FROM filtered
     ORDER BY last_activity DESC
     LIMIT _limit OFFSET _offset
  )
  SELECT (SELECT c FROM counted),
         COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.last_activity DESC), '[]'::jsonb)
    INTO _total, _rows
    FROM page p;

  RETURN jsonb_build_object(
    'rows', _rows,
    'total', _total,
    'page', GREATEST(1, COALESCE(_page, 1)),
    'page_size', _limit
  );
END $$;

-- Status counts respecting search
CREATE OR REPLACE FUNCTION public.get_admin_incomplete_order_counts(
  _search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _q text;
  _like text;
  _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT recovered, recovery_status
      FROM public.incomplete_orders o
     WHERE o.phone ~ '^01[0-9]{9}$'
       AND jsonb_typeof(o.cart_items) = 'array'
       AND jsonb_array_length(o.cart_items) > 0
       AND (
         _q IS NULL
         OR o.phone LIKE '%' || _q || '%'
         OR lower(COALESCE(o.customer_name,'')) LIKE _like
         OR lower(COALESCE(o.email,'')) LIKE _like
       )
  )
  SELECT jsonb_build_object(
    'all',       count(*),
    'pending',   count(*) FILTER (WHERE recovered = false AND coalesce(recovery_status,'') <> 'contacted'),
    'contacted', count(*) FILTER (WHERE recovered = false AND recovery_status = 'contacted'),
    'recovered', count(*) FILTER (WHERE recovered = true)
  )
  INTO _result FROM filtered;

  RETURN COALESCE(_result, jsonb_build_object('all',0,'pending',0,'contacted',0,'recovered',0));
END $$;

-- Global stats (unfiltered) for stat cards + top abandoned products
CREATE OR REPLACE FUNCTION public.get_admin_incomplete_order_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _total bigint := 0;
  _recovered bigint := 0;
  _abandoned_value numeric := 0;
  _rate int := 0;
  _top jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT recovered, total, cart_items
      FROM public.incomplete_orders o
     WHERE o.phone ~ '^01[0-9]{9}$'
       AND jsonb_typeof(o.cart_items) = 'array'
       AND jsonb_array_length(o.cart_items) > 0
  )
  SELECT count(*),
         count(*) FILTER (WHERE recovered = true),
         COALESCE(SUM(total) FILTER (WHERE recovered = false), 0)
  INTO _total, _recovered, _abandoned_value
  FROM base;

  IF _total > 0 THEN _rate := ROUND((_recovered::numeric / _total) * 100)::int; END IF;

  WITH items AS (
    SELECT
      COALESCE(NULLIF(it->>'product_id',''), NULLIF(it->>'id',''), it->>'name') AS key,
      COALESCE(it->>'name','Unnamed') AS name,
      COALESCE(NULLIF(it->>'quantity','')::numeric, 1) AS qty
    FROM public.incomplete_orders o,
         LATERAL jsonb_array_elements(o.cart_items) it
    WHERE o.recovered = false
      AND o.phone ~ '^01[0-9]{9}$'
      AND jsonb_typeof(o.cart_items) = 'array'
      AND jsonb_array_length(o.cart_items) > 0
  ),
  agg AS (
    SELECT key, max(name) AS name, SUM(qty)::int AS count
      FROM items
     WHERE key IS NOT NULL
     GROUP BY key
     ORDER BY SUM(qty) DESC
     LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
  INTO _top FROM agg;

  RETURN jsonb_build_object(
    'total', _total,
    'recovered', _recovered,
    'rate', _rate,
    'abandonedValue', _abandoned_value,
    'topAbandoned', _top
  );
END $$;

-- Helpful index for ordering + filtering
CREATE INDEX IF NOT EXISTS idx_incomplete_orders_last_activity_desc
  ON public.incomplete_orders (last_activity DESC);

-- Bulk RPCs referenced by the page (idempotent; create if missing)
CREATE OR REPLACE FUNCTION public.bulk_mark_incomplete_contacted(_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.incomplete_orders
     SET recovery_status = 'contacted',
         last_activity = now()
   WHERE id = ANY(_ids) AND recovered = false;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_delete_incomplete(_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.incomplete_orders WHERE id = ANY(_ids);
END $$;
