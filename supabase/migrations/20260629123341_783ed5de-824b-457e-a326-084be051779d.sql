
-- Retention setting lives on the pixel row.
ALTER TABLE public.tracking_pixels
  ADD COLUMN IF NOT EXISTS log_retention_days integer NOT NULL DEFAULT 30;

-- Aggregated metrics for the health dashboard.
CREATE OR REPLACE FUNCTION public.meta_capi_metrics(_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH base AS (
    SELECT * FROM public.capi_event_logs WHERE created_at >= _since
  ),
  totals AS (
    SELECT
      count(*) FILTER (WHERE source = 'server')::int                                       AS server_total,
      count(*) FILTER (WHERE source = 'browser')::int                                      AS browser_total,
      count(*) FILTER (WHERE source = 'server' AND status = 'delivered')::int              AS server_delivered,
      count(*) FILTER (WHERE source = 'server' AND status = 'failed')::int                 AS server_failed,
      count(*) FILTER (WHERE source = 'server' AND status = 'skipped')::int                AS server_skipped,
      count(*) FILTER (WHERE source = 'server' AND status = 'exception')::int              AS server_exception,
      count(*) FILTER (WHERE source = 'server' AND coalesce(attempts,1) > 1)::int          AS server_retried,
      avg(response_time_ms) FILTER (WHERE source = 'server' AND response_time_ms IS NOT NULL) AS avg_response_ms,
      count(*) FILTER (WHERE event_name = 'Purchase' AND source = 'server' AND status = 'delivered')::int AS purchases_delivered,
      max(created_at) FILTER (WHERE status = 'delivered' AND source = 'server')            AS last_success,
      max(created_at) FILTER (WHERE status IN ('failed','exception') AND source = 'server') AS last_failure,
      max(created_at) FILTER (WHERE event_name = 'Purchase' AND status = 'delivered')      AS last_purchase
    FROM base
  ),
  by_event AS (
    SELECT jsonb_object_agg(event_name, c) AS m FROM (
      SELECT event_name, count(*)::int c FROM base GROUP BY 1
    ) x
  ),
  dedup AS (
    -- Events with both a browser and server row using the same event_id = deduped pair.
    SELECT
      count(*) FILTER (WHERE has_browser AND has_server)::int AS deduped_pairs,
      count(*) FILTER (WHERE has_server)::int                 AS server_events
    FROM (
      SELECT
        event_id,
        bool_or(source = 'browser') AS has_browser,
        bool_or(source = 'server')  AS has_server
      FROM base
      WHERE event_id IS NOT NULL
      GROUP BY event_id
    ) g
  ),
  recent_fail_streak AS (
    -- Consecutive failures at the tail of recent server events (latest first).
    SELECT count(*)::int AS streak FROM (
      SELECT status, row_number() OVER (ORDER BY created_at DESC) rn,
        bool_and(status IN ('failed','exception')) OVER (ORDER BY created_at DESC) AS still_failing
      FROM base WHERE source = 'server' AND status IN ('delivered','failed','exception')
      LIMIT 50
    ) s WHERE still_failing
  )
  SELECT jsonb_build_object(
    'server_total',         t.server_total,
    'browser_total',        t.browser_total,
    'server_delivered',     t.server_delivered,
    'server_failed',        t.server_failed,
    'server_skipped',       t.server_skipped,
    'server_exception',     t.server_exception,
    'server_retried',       t.server_retried,
    'avg_response_ms',      coalesce(round(t.avg_response_ms)::int, 0),
    'purchases_delivered',  t.purchases_delivered,
    'last_success',         t.last_success,
    'last_failure',         t.last_failure,
    'last_purchase',        t.last_purchase,
    'by_event',             coalesce(b.m, '{}'::jsonb),
    'deduped_pairs',        d.deduped_pairs,
    'server_events_with_id',d.server_events,
    'recent_fail_streak',   coalesce(r.streak, 0)
  ) INTO result
  FROM totals t, by_event b, dedup d, recent_fail_streak r;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.meta_capi_metrics(timestamptz) TO authenticated, service_role;

-- Daily timeseries for charts.
CREATE OR REPLACE FUNCTION public.meta_capi_timeseries(_since timestamptz)
RETURNS TABLE (
  day date,
  delivered int,
  failed int,
  skipped int,
  purchases int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (created_at AT TIME ZONE 'UTC')::date AS day,
    count(*) FILTER (WHERE status = 'delivered')::int AS delivered,
    count(*) FILTER (WHERE status IN ('failed','exception'))::int AS failed,
    count(*) FILTER (WHERE status = 'skipped')::int AS skipped,
    count(*) FILTER (WHERE event_name = 'Purchase' AND status = 'delivered')::int AS purchases
  FROM public.capi_event_logs
  WHERE created_at >= _since AND source = 'server'
  GROUP BY 1
  ORDER BY 1;
$$;

GRANT EXECUTE ON FUNCTION public.meta_capi_timeseries(timestamptz) TO authenticated, service_role;

-- Retention cleanup.
CREATE OR REPLACE FUNCTION public.meta_capi_cleanup(_keep_days int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  IF _keep_days IS NULL OR _keep_days < 1 THEN
    _keep_days := 30;
  END IF;
  DELETE FROM public.capi_event_logs
   WHERE created_at < now() - make_interval(days => _keep_days);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.meta_capi_cleanup(int) TO authenticated, service_role;

-- Search helper.
CREATE OR REPLACE FUNCTION public.meta_capi_search(_query text, _limit int DEFAULT 50)
RETURNS SETOF public.capi_event_logs
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.capi_event_logs
  WHERE _query IS NULL OR _query = ''
     OR event_id ILIKE '%' || _query || '%'
     OR coalesce(order_id, '') ILIKE '%' || _query || '%'
  ORDER BY created_at DESC
  LIMIT greatest(1, least(coalesce(_limit, 50), 500));
$$;

GRANT EXECUTE ON FUNCTION public.meta_capi_search(text, int) TO authenticated, service_role;
