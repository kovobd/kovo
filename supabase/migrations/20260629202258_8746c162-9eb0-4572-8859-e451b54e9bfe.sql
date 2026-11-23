
-- =========================================================================
-- R2 deletion queue + generic cleanup trigger
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.r2_deletion_queue (
  id          bigserial PRIMARY KEY,
  ref         text NOT NULL,
  source_table text,
  source_id    text,
  queued_at    timestamptz NOT NULL DEFAULT now(),
  attempts     int NOT NULL DEFAULT 0,
  last_error   text,
  processed_at timestamptz,
  claimed_at   timestamptz
);

GRANT SELECT ON public.r2_deletion_queue TO authenticated;
GRANT ALL    ON public.r2_deletion_queue TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.r2_deletion_queue_id_seq TO service_role;

ALTER TABLE public.r2_deletion_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read queue" ON public.r2_deletion_queue;
CREATE POLICY "admins read queue" ON public.r2_deletion_queue
  FOR SELECT TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_r2q_pending
  ON public.r2_deletion_queue (queued_at)
  WHERE processed_at IS NULL;

-- -----------------------------------------------------------------------
-- Generic trigger function: extract r2/r2o refs from OLD and NEW rows,
-- enqueue every ref present in OLD but not in NEW.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_r2_cleanup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_new text;
  v_ref text;
  v_id  text;
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    v_old := row_to_json(OLD)::text;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_new := row_to_json(NEW)::text;
  END IF;

  IF v_old IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_id := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'id')
         ELSE (to_jsonb(NEW)->>'id')
    END, '');

  FOR v_ref IN
    SELECT DISTINCT mm[1]
    FROM regexp_matches(v_old, '(r2o?:[A-Za-z0-9_./-]+)', 'g') AS mm
  LOOP
    IF v_new IS NULL OR position(v_ref IN v_new) = 0 THEN
      INSERT INTO public.r2_deletion_queue(ref, source_table, source_id)
      VALUES (v_ref, TG_TABLE_NAME, v_id);
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END $$;

-- -----------------------------------------------------------------------
-- Attach trigger to every table that may hold R2 refs.
-- -----------------------------------------------------------------------
DO $body$
DECLARE
  t text;
  tables text[] := ARRAY[
    'products','product_media','product_variants',
    'categories','brands','tags',
    'hero_slides','hero_settings','offers','featured_categories',
    'testimonials','video_testimonials','floating_icons',
    'site_reviews','site_review_media','review_hero_settings',
    'announcement_bar','homepage_sections',
    'contact_settings','invoice_settings',
    'why_choose_us_cards','about_sections',
    'design_settings','shop_settings','footer_settings',
    'direct_order_channels'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_r2_cleanup ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_r2_cleanup
           AFTER UPDATE OR DELETE ON public.%I
           FOR EACH ROW EXECUTE FUNCTION public.tg_r2_cleanup()',
        t);
    END IF;
  END LOOP;
END $body$;

-- -----------------------------------------------------------------------
-- Helper RPCs for the worker and frontend
-- -----------------------------------------------------------------------

-- Enqueue arbitrary refs (used by bulk admin operations that don't map to
-- a single row change). Admin/staff only.
CREATE OR REPLACE FUNCTION public.r2_enqueue_refs(_refs text[], _source text DEFAULT NULL, _source_id text DEFAULT NULL)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_count int := 0;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _refs IS NULL THEN RETURN 0; END IF;
  FOREACH v_ref IN ARRAY _refs LOOP
    IF v_ref ~ '^r2o?:[A-Za-z0-9_./-]+$' THEN
      INSERT INTO public.r2_deletion_queue(ref, source_table, source_id)
      VALUES (v_ref, _source, _source_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END $$;
GRANT EXECUTE ON FUNCTION public.r2_enqueue_refs(text[], text, text) TO authenticated, service_role;

-- Atomically claim a batch of pending items so two worker invocations
-- never delete the same object twice.
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

CREATE OR REPLACE FUNCTION public.r2_mark_processed(_ids bigint[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.r2_deletion_queue
     SET processed_at = now(), last_error = NULL
   WHERE id = ANY(_ids);
$$;
GRANT EXECUTE ON FUNCTION public.r2_mark_processed(bigint[]) TO service_role;

CREATE OR REPLACE FUNCTION public.r2_mark_failed(_id bigint, _err text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.r2_deletion_queue
     SET last_error = _err,
         claimed_at = NULL
   WHERE id = _id;
$$;
GRANT EXECUTE ON FUNCTION public.r2_mark_failed(bigint, text) TO service_role;

-- -----------------------------------------------------------------------
-- Schedule the worker every minute.
-- -----------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $cronblock$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'r2-cleanup-worker') THEN
    PERFORM cron.unschedule('r2-cleanup-worker');
  END IF;
  PERFORM cron.schedule(
    'r2-cleanup-worker',
    '* * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://yclhketsbkcfhjuaqghw.supabase.co/functions/v1/r2-cleanup-worker',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljbGhrZXRzYmtjZmhqdWFxZ2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTE2NDAsImV4cCI6MjA5NzcyNzY0MH0.DxrkkrKD7IhhcbcD3RivCbya26vtk7qf6HiJKyQWCqg"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );
END
$cronblock$;
