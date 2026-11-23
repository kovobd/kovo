
ALTER TABLE public.capi_event_logs
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'server',
  ADD COLUMN IF NOT EXISTS order_id text,
  ADD COLUMN IF NOT EXISTS product_ids text[],
  ADD COLUMN IF NOT EXISTS value numeric,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS response_time_ms integer,
  ADD COLUMN IF NOT EXISTS test_mode boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS capi_event_logs_event_id_idx ON public.capi_event_logs (event_id);
CREATE INDEX IF NOT EXISTS capi_event_logs_created_at_idx ON public.capi_event_logs (created_at DESC);

GRANT SELECT ON public.capi_event_logs TO authenticated;
GRANT ALL ON public.capi_event_logs TO service_role;

-- Admin-only read policy (replace existing if needed)
DROP POLICY IF EXISTS "capi_event_logs admin read" ON public.capi_event_logs;
CREATE POLICY "capi_event_logs admin read" ON public.capi_event_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RPC: log browser pixel event (callable by anon, validated)
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

  v_value := NULLIF(p_custom_data->>'value','')::numeric;
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

-- Retention: trim to last 30 days OR 5000 rows (whichever larger)
CREATE OR REPLACE FUNCTION public.prune_capi_event_logs() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.capi_event_logs
  WHERE created_at < now() - interval '30 days'
    AND id NOT IN (SELECT id FROM public.capi_event_logs ORDER BY created_at DESC LIMIT 5000);
$$;
