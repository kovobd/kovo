-- Orders pagination RPCs

CREATE OR REPLACE FUNCTION public.get_admin_orders_page(
  _page int DEFAULT 1,
  _page_size int DEFAULT 50,
  _status text DEFAULT NULL,            -- 'all' or null → no status filter
  _search text DEFAULT NULL,            -- matches order_number / customer_name / customer_phone / customer_email
  _payment_status text DEFAULT NULL,    -- 'all' or null → no filter
  _date_from timestamptz DEFAULT NULL,  -- inclusive lower bound on created_at
  _date_to timestamptz DEFAULT NULL     -- inclusive upper bound on created_at
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

  _limit := GREATEST(1, LEAST(COALESCE(_page_size, 50), 200));
  _offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * _limit;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT *
      FROM public.orders o
     WHERE (_status IS NULL OR _status = 'all' OR o.order_status = _status)
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
  page AS (
    SELECT *
      FROM filtered
     ORDER BY created_at DESC
     LIMIT _limit OFFSET _offset
  )
  SELECT
    (SELECT c FROM counted),
    COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
  INTO _total, _rows
  FROM page p;

  RETURN jsonb_build_object(
    'rows', _rows,
    'total', _total,
    'page', GREATEST(1, COALESCE(_page, 1)),
    'page_size', _limit
  );
END $$;

REVOKE ALL ON FUNCTION public.get_admin_orders_page(int, int, text, text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_orders_page(int, int, text, text, text, timestamptz, timestamptz) TO authenticated, service_role;

-- Status badge counts respect the non-status filters (search, payment, date) so the tabs
-- reflect what the user is currently looking at.
CREATE OR REPLACE FUNCTION public.get_admin_order_status_counts(
  _search text DEFAULT NULL,
  _payment_status text DEFAULT NULL,
  _date_from timestamptz DEFAULT NULL,
  _date_to timestamptz DEFAULT NULL
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
    SELECT order_status
      FROM public.orders o
     WHERE (_payment_status IS NULL OR _payment_status = 'all' OR o.payment_status = _payment_status)
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
    'all',       count(*),
    'pending',   count(*) FILTER (WHERE order_status = 'pending'),
    'confirmed', count(*) FILTER (WHERE order_status = 'confirmed'),
    'processing',count(*) FILTER (WHERE order_status = 'processing'),
    'shipped',   count(*) FILTER (WHERE order_status = 'shipped'),
    'delivered', count(*) FILTER (WHERE order_status = 'delivered'),
    'cancelled', count(*) FILTER (WHERE order_status = 'cancelled')
  )
  INTO _result FROM filtered;

  RETURN COALESCE(_result, jsonb_build_object(
    'all',0,'pending',0,'confirmed',0,'processing',0,'shipped',0,'delivered',0,'cancelled',0
  ));
END $$;

REVOKE ALL ON FUNCTION public.get_admin_order_status_counts(text, text, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_order_status_counts(text, text, timestamptz, timestamptz) TO authenticated, service_role;