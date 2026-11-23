
-- Indexes to keep paginated queries snappy
CREATE INDEX IF NOT EXISTS idx_product_reminders_status        ON public.product_reminders (status);
CREATE INDEX IF NOT EXISTS idx_product_reminders_due_date      ON public.product_reminders (due_date);
CREATE INDEX IF NOT EXISTS idx_product_reminders_status_due    ON public.product_reminders (status, due_date);
CREATE INDEX IF NOT EXISTS idx_product_reminders_next_action   ON public.product_reminders (next_action_date);
CREATE INDEX IF NOT EXISTS idx_product_reminders_customer_phone ON public.product_reminders (customer_phone);
CREATE INDEX IF NOT EXISTS idx_product_reminders_product_id    ON public.product_reminders (product_id);
CREATE INDEX IF NOT EXISTS idx_product_reminders_reorder_amount ON public.product_reminders (reorder_amount);
CREATE INDEX IF NOT EXISTS idx_product_reminders_completed_at  ON public.product_reminders (completed_at);
CREATE INDEX IF NOT EXISTS idx_product_reminders_resolved_at   ON public.product_reminders (resolved_at);

-- ── Page RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_reminders_page(
  _tab text DEFAULT 'today',
  _page integer DEFAULT 1,
  _page_size integer DEFAULT 25,
  _today date DEFAULT NULL,
  _search text DEFAULT NULL,
  _product_id uuid DEFAULT NULL,
  _sort text DEFAULT 'due_date'
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
  _t date := COALESCE(_today, (now() AT TIME ZONE 'Asia/Dhaka')::date);
  _sort_norm text := lower(COALESCE(_sort, 'due_date'));
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(_page_size, 25), 200));
  _offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * _limit;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH base AS (
    SELECT
      r.*,
      CASE
        WHEN r.status IN ('follow_up','no_response')
          THEN COALESCE(r.next_action_date, r.follow_up_date, r.due_date)
        WHEN r.status = 'interested'
          THEN COALESCE(r.expected_purchase_date, r.due_date)
        ELSE r.due_date
      END AS ref_date,
      c.total_orders AS cust_orders,
      c.total_spent  AS cust_spent,
      ro.order_number AS reorder_order_number
    FROM public.product_reminders r
    LEFT JOIN public.customers c
      ON regexp_replace(COALESCE(c.phone,''), '\D', '', 'g')
       = regexp_replace(COALESCE(r.customer_phone,''), '\D', '', 'g')
    LEFT JOIN public.orders ro
      ON ro.id = r.reorder_order_id
  ),
  filtered AS (
    SELECT * FROM base b
     WHERE
       -- tab partitioning (mirrors the page's JS logic)
       (
         _tab = 'all'
         OR (_tab = 'today'    AND b.status IN ('pending','called','no_response','follow_up','interested') AND b.ref_date = _t)
         OR (_tab = 'missed'   AND b.status IN ('pending','called') AND b.ref_date < _t)
         OR (_tab = 'noresp'   AND b.status = 'no_response')
         OR (_tab = 'follow'   AND b.status IN ('follow_up','interested'))
         OR (_tab = 'lost'     AND b.status = 'not_interested')
         OR (_tab = 'dnr'      AND b.status = 'do_not_remind')
         OR (_tab = 'upcoming' AND b.status IN ('pending','called') AND b.ref_date > _t)
         OR (_tab = 'closed'   AND b.status = 'purchased_again')
       )
       AND (_product_id IS NULL OR b.product_id = _product_id)
       AND (
         _q IS NULL
         OR b.customer_phone LIKE '%' || _q || '%'
         OR lower(COALESCE(b.customer_name,'')) LIKE _like
         OR lower(COALESCE(b.product_name_snapshot,'')) LIKE _like
       )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM filtered),
  page AS (
    SELECT * FROM filtered
     ORDER BY
       -- days_overdue: most overdue first (smallest ref_date)
       CASE WHEN _sort_norm = 'days_overdue' THEN ref_date END ASC NULLS LAST,
       -- order_value / revenue: largest reorder_amount first
       CASE WHEN _sort_norm IN ('order_value','revenue') THEN COALESCE(reorder_amount,0) END DESC,
       -- total_orders: customer order count desc
       CASE WHEN _sort_norm = 'total_orders' THEN COALESCE(cust_orders,0) END DESC,
       -- total_spend: customer spend desc
       CASE WHEN _sort_norm = 'total_spend' THEN COALESCE(cust_spent,0) END DESC,
       -- default per-tab orderings when sort = due_date
       CASE WHEN _sort_norm = 'due_date' AND _tab = 'today'  THEN created_at END ASC,
       CASE WHEN _sort_norm = 'due_date' AND _tab = 'closed' THEN COALESCE(completed_at, resolved_at, updated_at) END DESC,
       CASE WHEN _sort_norm = 'due_date' AND _tab NOT IN ('today','closed') THEN ref_date END ASC,
       created_at ASC
     LIMIT _limit OFFSET _offset
  )
  SELECT (SELECT c FROM counted),
         COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    INTO _total, _rows
    FROM page p;

  RETURN jsonb_build_object(
    'rows', _rows,
    'total', _total,
    'page', GREATEST(1, COALESCE(_page, 1)),
    'page_size', _limit
  );
END $$;

-- ── Tab counts RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_reminder_tab_counts(
  _today date DEFAULT NULL,
  _search text DEFAULT NULL,
  _product_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _q text;
  _like text;
  _t date := COALESCE(_today, (now() AT TIME ZONE 'Asia/Dhaka')::date);
  _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH base AS (
    SELECT
      status,
      CASE
        WHEN status IN ('follow_up','no_response')
          THEN COALESCE(next_action_date, follow_up_date, due_date)
        WHEN status = 'interested'
          THEN COALESCE(expected_purchase_date, due_date)
        ELSE due_date
      END AS ref_date
    FROM public.product_reminders r
    WHERE (_product_id IS NULL OR r.product_id = _product_id)
      AND (
        _q IS NULL
        OR r.customer_phone LIKE '%' || _q || '%'
        OR lower(COALESCE(r.customer_name,'')) LIKE _like
        OR lower(COALESCE(r.product_name_snapshot,'')) LIKE _like
      )
  )
  SELECT jsonb_build_object(
    'today',         count(*) FILTER (WHERE status IN ('pending','called','no_response','follow_up','interested') AND ref_date = _t),
    'missed',        count(*) FILTER (WHERE status IN ('pending','called') AND ref_date < _t),
    'noResponse',    count(*) FILTER (WHERE status = 'no_response'),
    'followUp',      count(*) FILTER (WHERE status IN ('follow_up','interested')),
    'notInterested', count(*) FILTER (WHERE status = 'not_interested'),
    'doNotRemind',   count(*) FILTER (WHERE status = 'do_not_remind'),
    'upcoming',      count(*) FILTER (WHERE status IN ('pending','called') AND ref_date > _t),
    'closed',        count(*) FILTER (WHERE status = 'purchased_again')
  ) INTO _result FROM base;

  RETURN COALESCE(_result, jsonb_build_object(
    'today',0,'missed',0,'noResponse',0,'followUp',0,
    'notInterested',0,'doNotRemind',0,'upcoming',0,'closed',0
  ));
END $$;

-- ── KPI metrics RPC ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_reminder_metrics(
  _today date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _t date := COALESCE(_today, (now() AT TIME ZONE 'Asia/Dhaka')::date);
  _today_count int := 0;
  _missed_count int := 0;
  _upcoming_count int := 0;
  _completed int := 0;
  _conv_base int := 0;
  _conversion int := 0;
  _revenue numeric := 0;
  _avg_reorder int := 0;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT status, reorder_amount,
      CASE
        WHEN status IN ('follow_up','no_response')
          THEN COALESCE(next_action_date, follow_up_date, due_date)
        WHEN status = 'interested'
          THEN COALESCE(expected_purchase_date, due_date)
        ELSE due_date
      END AS ref_date
    FROM public.product_reminders
  )
  SELECT
    count(*) FILTER (WHERE status IN ('pending','called','no_response','follow_up','interested') AND ref_date = _t),
    count(*) FILTER (WHERE status IN ('pending','called') AND ref_date < _t),
    count(*) FILTER (WHERE status IN ('pending','called') AND ref_date > _t),
    count(*) FILTER (WHERE status = 'purchased_again'),
    count(*) FILTER (WHERE status IN ('purchased_again','not_interested','no_response','follow_up','do_not_remind')),
    COALESCE(SUM(reorder_amount) FILTER (WHERE status = 'purchased_again'), 0)
  INTO _today_count, _missed_count, _upcoming_count, _completed, _conv_base, _revenue
  FROM base;

  IF _conv_base > 0 THEN _conversion := ROUND((_completed::numeric / _conv_base) * 100)::int; END IF;
  IF _completed > 0 THEN _avg_reorder := ROUND(_revenue / _completed)::int; END IF;

  RETURN jsonb_build_object(
    'todayCount',    _today_count,
    'missedCount',   _missed_count,
    'upcomingCount', _upcoming_count,
    'completed',     _completed,
    'conversion',    _conversion,
    'revenue',       _revenue,
    'avgReorder',    _avg_reorder
  );
END $$;
