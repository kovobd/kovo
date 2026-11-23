
DROP FUNCTION IF EXISTS public.meta_capi_metrics(timestamptz);
DROP FUNCTION IF EXISTS public.meta_capi_timeseries(timestamptz);
DROP FUNCTION IF EXISTS public.meta_capi_cleanup(int);
DROP FUNCTION IF EXISTS public.meta_capi_search(text, int);

CREATE FUNCTION public.meta_capi_metrics(_since timestamptz DEFAULT (now() - interval '24 hours'))
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (SELECT * FROM public.capi_event_logs WHERE created_at >= _since),
  totals AS (
    SELECT count(*) AS total,
      count(*) FILTER (WHERE status='delivered') AS delivered,
      count(*) FILTER (WHERE status='failed') AS failed,
      count(*) FILTER (WHERE status='skipped') AS skipped,
      count(*) FILTER (WHERE source='browser') AS browser,
      count(*) FILTER (WHERE source='server') AS server,
      avg(response_time_ms) FILTER (WHERE status='delivered')::int AS avg_response_ms
    FROM base),
  per_event AS (
    SELECT event_name, count(*)::int AS total,
      count(*) FILTER (WHERE status='delivered')::int AS delivered,
      count(*) FILTER (WHERE status='failed')::int AS failed
    FROM base GROUP BY event_name),
  dedup AS (
    SELECT event_id FROM base WHERE status='delivered'
    GROUP BY event_id HAVING count(*) >= 2),
  fail_recent AS (
    SELECT bool_and(status='failed') AS streak
    FROM (SELECT status FROM base WHERE source='server' ORDER BY created_at DESC LIMIT 50) s)
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'per_event', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM per_event p), '[]'::jsonb),
    'dedupe_pairs', COALESCE((SELECT count(*) FROM dedup), 0),
    'recent_failure_streak', COALESCE((SELECT streak FROM fail_recent), false),
    'since', _since
  ) INTO _result;
  RETURN _result;
END $$;

CREATE FUNCTION public.meta_capi_timeseries(_since timestamptz DEFAULT (now() - interval '30 days'))
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', day, 'delivered', delivered, 'failed', failed, 'skipped', skipped
  ) ORDER BY day), '[]'::jsonb) INTO _result
  FROM (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
      count(*) FILTER (WHERE status='delivered')::int AS delivered,
      count(*) FILTER (WHERE status='failed')::int AS failed,
      count(*) FILTER (WHERE status='skipped')::int AS skipped
    FROM public.capi_event_logs WHERE created_at >= _since GROUP BY 1
  ) t;
  RETURN _result;
END $$;

CREATE FUNCTION public.meta_capi_cleanup(_keep_days int DEFAULT 60)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _deleted int; _floor int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _floor := GREATEST(COALESCE(_keep_days, 60), 7);
  DELETE FROM public.capi_event_logs WHERE created_at < (now() - (_floor || ' days')::interval);
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END $$;

CREATE FUNCTION public.meta_capi_search(_term text, _limit int DEFAULT 100)
RETURNS SETOF public.capi_event_logs LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT * FROM public.capi_event_logs
     WHERE _term IS NOT NULL AND _term <> ''
       AND (event_id ILIKE '%'||_term||'%' OR COALESCE(order_id,'') ILIKE '%'||_term||'%')
     ORDER BY created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
END $$;

REVOKE EXECUTE ON FUNCTION public.meta_capi_metrics(timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.meta_capi_timeseries(timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.meta_capi_cleanup(int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.meta_capi_search(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meta_capi_metrics(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meta_capi_timeseries(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meta_capi_cleanup(int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.meta_capi_search(text, int) TO authenticated, service_role;

DROP INDEX IF EXISTS public.idx_capi_logs_event_id;
DROP INDEX IF EXISTS public.idx_capi_logs_created;
CREATE INDEX IF NOT EXISTS capi_event_logs_created_status_idx
  ON public.capi_event_logs (created_at DESC, status);
CREATE INDEX IF NOT EXISTS capi_event_logs_created_event_idx
  ON public.capi_event_logs (created_at DESC, event_name);
