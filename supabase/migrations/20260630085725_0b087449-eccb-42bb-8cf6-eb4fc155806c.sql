-- Expedite cleanup of queued R2 deletions by resetting attempts and pulling
-- the queued_at timestamp back so the worker picks them up immediately
-- (bypassing the normal 2-minute grace window for manual admin actions).
CREATE OR REPLACE FUNCTION public.r2_expedite(_ids bigint[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.r2_deletion_queue
     SET queued_at = now() - interval '10 minutes',
         attempts  = 0,
         last_error = NULL,
         claimed_at = NULL
   WHERE processed_at IS NULL
     AND (_ids IS NULL OR id = ANY(_ids));

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.r2_expedite(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.r2_expedite(bigint[]) TO authenticated, service_role;

-- Expedite ALL pending orphan-sweep entries (the "unused images" surfaced by
-- the orphan sweep). Returns the number of rows affected.
CREATE OR REPLACE FUNCTION public.r2_expedite_orphans()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.r2_deletion_queue
     SET queued_at = now() - interval '10 minutes',
         attempts  = 0,
         last_error = NULL,
         claimed_at = NULL
   WHERE processed_at IS NULL
     AND source_table = 'orphan_sweep';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.r2_expedite_orphans() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.r2_expedite_orphans() TO authenticated, service_role;