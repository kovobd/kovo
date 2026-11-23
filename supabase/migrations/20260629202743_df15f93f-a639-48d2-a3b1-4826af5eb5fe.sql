
-- Harden R2 cleanup queue: restore grace period, monitoring stats, manual retry, coverage audit

-- Add grace period to the claim function so admins have ~2 minutes to restore/undo
-- a deletion before the worker actually removes the file from R2. Combined with
-- the existing r2_ref_in_use() guard this gives belt-and-suspenders protection.
CREATE OR REPLACE FUNCTION public.r2_claim_queue_batch(_limit int DEFAULT 50)
RETURNS TABLE(id bigint, ref text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.r2_deletion_queue q
    WHERE q.processed_at IS NULL
      AND q.queued_at < now() - interval '2 minutes'   -- restore grace window
      AND (q.claimed_at IS NULL OR q.claimed_at < now() - interval '5 minutes')
      AND q.attempts < 8
    ORDER BY q.queued_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.r2_deletion_queue q
     SET claimed_at = now(),
         attempts   = q.attempts + 1
    FROM picked
   WHERE q.id = picked.id
  RETURNING q.id, q.ref;
END $$;
GRANT EXECUTE ON FUNCTION public.r2_claim_queue_batch(int) TO service_role;

-- Aggregate health stats for the admin monitoring dashboard.
CREATE OR REPLACE FUNCTION public.r2_queue_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total',           count(*),
    'pending',         count(*) FILTER (WHERE processed_at IS NULL AND attempts < 8),
    'in_grace',        count(*) FILTER (WHERE processed_at IS NULL AND queued_at >= now() - interval '2 minutes'),
    'processed',       count(*) FILTER (WHERE processed_at IS NOT NULL),
    'failed',          count(*) FILTER (WHERE processed_at IS NULL AND attempts >= 8),
    'retrying',        count(*) FILTER (WHERE processed_at IS NULL AND attempts BETWEEN 1 AND 7),
    'oldest_pending',  (SELECT min(queued_at) FROM public.r2_deletion_queue WHERE processed_at IS NULL AND attempts < 8),
    'processed_24h',   count(*) FILTER (WHERE processed_at >= now() - interval '24 hours'),
    'queued_24h',      count(*) FILTER (WHERE queued_at >= now() - interval '24 hours')
  )
  INTO v_result
  FROM public.r2_deletion_queue;

  RETURN COALESCE(v_result, '{}'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.r2_queue_stats() TO authenticated, service_role;

-- Reset failed items so the worker re-attempts them. Pass NULL to retry every failure.
CREATE OR REPLACE FUNCTION public.r2_retry_failed(_ids bigint[] DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.r2_deletion_queue
     SET attempts   = 0,
         claimed_at = NULL,
         last_error = NULL
   WHERE processed_at IS NULL
     AND (_ids IS NULL OR id = ANY(_ids));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.r2_retry_failed(bigint[]) TO authenticated, service_role;

-- Drop processed rows older than 7 days to keep the queue small. Returns deleted count.
CREATE OR REPLACE FUNCTION public.r2_prune_processed(_older_than interval DEFAULT interval '7 days')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.r2_deletion_queue
   WHERE processed_at IS NOT NULL
     AND processed_at < now() - _older_than;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.r2_prune_processed(interval) TO authenticated, service_role;

-- Coverage audit: scan every public.* text/jsonb column for r2:/r2o: refs and
-- report which tables actually hold media references. Admin UI cross-checks
-- this against the trigger list to surface any uncovered tables.
CREATE OR REPLACE FUNCTION public.r2_coverage_audit()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_tables_with_refs text[] := ARRAY[]::text[];
  v_tables_with_trigger text[] := ARRAY[]::text[];
  v_has_refs boolean;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Tables that currently have the cleanup trigger attached.
  SELECT COALESCE(array_agg(DISTINCT c.relname), ARRAY[]::text[])
    INTO v_tables_with_trigger
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND t.tgname = 'trg_r2_cleanup'
     AND NOT t.tgisinternal;

  -- Walk every public table and check whether any row contains r2:/r2o: text.
  FOR r IN
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type   = 'BASE TABLE'
       AND table_name NOT IN ('r2_deletion_queue','media_audit_log')
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE row_to_json(%I.*)::text ~ ''r2o?:[A-Za-z0-9_./-]+'' LIMIT 1)',
        r.table_name, r.table_name
      ) INTO v_has_refs;
      IF v_has_refs THEN
        v_tables_with_refs := v_tables_with_refs || r.table_name;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- ignore inaccessible tables
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'tables_with_refs', v_tables_with_refs,
    'tables_with_trigger', v_tables_with_trigger,
    'uncovered', (
      SELECT COALESCE(array_agg(t), ARRAY[]::text[])
        FROM unnest(v_tables_with_refs) t
       WHERE t <> ALL(v_tables_with_trigger)
    )
  );
END $$;
GRANT EXECUTE ON FUNCTION public.r2_coverage_audit() TO authenticated, service_role;

-- Allow admins to read failed/recent rows in the queue UI (existing SELECT policy
-- already restricts to admin/staff via is_admin_or_staff).
