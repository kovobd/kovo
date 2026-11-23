ALTER TABLE public.tracking_pixels
  ADD COLUMN IF NOT EXISTS logging_paused boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_meta_logging_paused(_paused boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  UPDATE public.tracking_pixels
  SET logging_paused = COALESCE(_paused, false)
  WHERE platform = 'facebook';

  GET DIAGNOSTICS v_exists = ROW_COUNT;

  IF NOT v_exists THEN
    INSERT INTO public.tracking_pixels (platform, pixel_id, enabled, logging_paused)
    VALUES ('facebook', '', false, COALESCE(_paused, false));
  END IF;

  RETURN COALESCE(_paused, false);
END;
$$;

REVOKE ALL ON FUNCTION public.set_meta_logging_paused(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_meta_logging_paused(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.log_browser_pixel_event(
  p_event_name text,
  p_event_id text,
  p_custom_data jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value numeric;
  v_currency text;
  v_order_id text;
  v_product_ids text[];
  v_logging_paused boolean;
BEGIN
  IF p_event_name IS NULL OR p_event_id IS NULL THEN
    RETURN;
  END IF;
  IF length(p_event_name) > 64 OR length(p_event_id) > 128 THEN
    RETURN;
  END IF;
  IF p_event_name NOT IN ('PageView','ViewContent','Search','AddToCart','InitiateCheckout','AddPaymentInfo','Purchase','Lead','CompleteRegistration') THEN
    RETURN;
  END IF;

  SELECT COALESCE(bool_or(logging_paused), false)
  INTO v_logging_paused
  FROM public.tracking_pixels
  WHERE platform = 'facebook';

  IF COALESCE(v_logging_paused, false) THEN
    RETURN;
  END IF;

  BEGIN
    v_value := NULLIF(p_custom_data->>'value','')::numeric;
  EXCEPTION WHEN OTHERS THEN
    v_value := NULL;
  END;
  v_currency := p_custom_data->>'currency';
  v_order_id := p_custom_data->>'order_id';
  BEGIN
    SELECT array_agg(x::text) INTO v_product_ids
    FROM jsonb_array_elements_text(p_custom_data->'content_ids') AS x;
  EXCEPTION WHEN OTHERS THEN v_product_ids := NULL;
  END;

  INSERT INTO public.capi_event_logs
    (event_name, event_id, status, source, order_id, product_ids, value, currency, payload)
  VALUES
    (p_event_name, p_event_id, 'sent', 'browser', v_order_id, v_product_ids, v_value, v_currency,
     jsonb_build_object('custom_data', p_custom_data));
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_browser_pixel_event(text, text, jsonb) TO anon, authenticated;