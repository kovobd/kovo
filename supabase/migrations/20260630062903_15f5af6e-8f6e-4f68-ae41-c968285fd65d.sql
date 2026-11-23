
-- ============================================================
-- R2 orphan-sweep tracking
-- ============================================================

CREATE TABLE IF NOT EXISTS public.r2_orphan_sweep_runs (
  id              bigserial PRIMARY KEY,
  started_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz,
  scanned         int NOT NULL DEFAULT 0,
  orphans_found   int NOT NULL DEFAULT 0,
  orphans_queued  int NOT NULL DEFAULT 0,
  grace_hours     int NOT NULL DEFAULT 24,
  error           text
);

GRANT SELECT ON public.r2_orphan_sweep_runs TO authenticated;
GRANT ALL    ON public.r2_orphan_sweep_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.r2_orphan_sweep_runs_id_seq TO service_role;

ALTER TABLE public.r2_orphan_sweep_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read sweep runs" ON public.r2_orphan_sweep_runs;
CREATE POLICY "admins read sweep runs" ON public.r2_orphan_sweep_runs
  FOR SELECT TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_r2_sweep_runs_started
  ON public.r2_orphan_sweep_runs (started_at DESC);

-- ------------------------------------------------------------
-- Batch usage check. Given a list of candidate R2 refs, return
-- the subset that is still referenced anywhere in the database.
-- Scans each known media-bearing table once (cheap) using the
-- same regex as r2_coverage_audit, intersected with the input.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.r2_refs_in_use(_refs text[])
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tbl text;
  v_found text[];
  v_used text[] := ARRAY[]::text[];
  v_tables text[] := ARRAY[
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
  IF _refs IS NULL OR array_length(_refs, 1) IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_tbl
    ) THEN
      BEGIN
        EXECUTE format(
          'SELECT COALESCE(array_agg(DISTINCT m[1]), ARRAY[]::text[])
             FROM (SELECT row_to_json(t.*)::text AS body FROM public.%I t) s,
                  LATERAL regexp_matches(s.body, ''(r2o?:[A-Za-z0-9_./-]+)'', ''g'') m
            WHERE m[1] = ANY($1)',
          v_tbl
        ) INTO v_found USING _refs;
        IF v_found IS NOT NULL AND array_length(v_found, 1) > 0 THEN
          v_used := v_used || v_found;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- ignore tables that can't be scanned
        NULL;
      END;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
    INTO v_used
    FROM unnest(v_used) x;
  RETURN v_used;
END $$;

GRANT EXECUTE ON FUNCTION public.r2_refs_in_use(text[]) TO service_role, authenticated;

-- ------------------------------------------------------------
-- Record the result of one sweep run.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.r2_orphan_sweep_record(
  _scanned int,
  _orphans_found int,
  _orphans_queued int,
  _grace_hours int DEFAULT 24,
  _error text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.r2_orphan_sweep_runs
    (finished_at, scanned, orphans_found, orphans_queued, grace_hours, error)
  VALUES
    (now(), COALESCE(_scanned, 0), COALESCE(_orphans_found, 0),
     COALESCE(_orphans_queued, 0), COALESCE(_grace_hours, 24), _error)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

GRANT EXECUTE ON FUNCTION public.r2_orphan_sweep_record(int, int, int, int, text)
  TO service_role;

-- ------------------------------------------------------------
-- Dashboard status: last run + queued orphans currently waiting.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.r2_orphan_sweep_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last jsonb;
  v_queued_orphans int;
  v_total_runs int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(r) INTO v_last
    FROM (
      SELECT id, started_at, finished_at, scanned, orphans_found,
             orphans_queued, grace_hours, error
        FROM public.r2_orphan_sweep_runs
       ORDER BY started_at DESC
       LIMIT 1
    ) r;

  SELECT count(*) INTO v_queued_orphans
    FROM public.r2_deletion_queue
   WHERE source_table = 'orphan_sweep'
     AND processed_at IS NULL
     AND attempts < 8;

  SELECT count(*) INTO v_total_runs FROM public.r2_orphan_sweep_runs;

  RETURN jsonb_build_object(
    'last_run', v_last,
    'queued_orphans', COALESCE(v_queued_orphans, 0),
    'total_runs', COALESCE(v_total_runs, 0)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.r2_orphan_sweep_status() TO authenticated, service_role;
