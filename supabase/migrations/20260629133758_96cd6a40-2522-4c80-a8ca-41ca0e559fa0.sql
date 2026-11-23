-- 1. Add pause flag for CAPI logging
ALTER TABLE public.tracking_pixels
  ADD COLUMN IF NOT EXISTS logging_paused boolean NOT NULL DEFAULT false;

-- 2. Re-create purge to use TRUNCATE (bypasses RLS unambiguously, fast, safe)
CREATE OR REPLACE FUNCTION public.meta_capi_purge_all()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;
  SELECT count(*) INTO v_count FROM public.capi_event_logs;
  TRUNCATE TABLE public.capi_event_logs;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.meta_capi_purge_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meta_capi_purge_all() TO authenticated;