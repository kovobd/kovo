
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
  WITH d AS (DELETE FROM public.capi_event_logs RETURNING 1)
  SELECT count(*) INTO v_count FROM d;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.meta_capi_purge_all() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meta_capi_purge_all() TO authenticated;
