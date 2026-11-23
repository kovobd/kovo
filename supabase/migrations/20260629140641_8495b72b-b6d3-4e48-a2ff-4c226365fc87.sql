CREATE OR REPLACE FUNCTION public.set_meta_logging_paused(_paused boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  UPDATE public.tracking_pixels
  SET logging_paused = COALESCE(_paused, false)
  WHERE platform = 'facebook';

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    INSERT INTO public.tracking_pixels (platform, pixel_id, enabled, logging_paused)
    VALUES ('facebook', '', false, COALESCE(_paused, false));
  END IF;

  RETURN COALESCE(_paused, false);
END;
$$;

REVOKE ALL ON FUNCTION public.set_meta_logging_paused(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_meta_logging_paused(boolean) TO authenticated;