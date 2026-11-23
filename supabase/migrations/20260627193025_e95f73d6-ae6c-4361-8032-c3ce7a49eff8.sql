
CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _cart_total numeric DEFAULT 0)
RETURNS TABLE(
  valid boolean,
  error text,
  code text,
  discount_type text,
  discount_value numeric,
  min_order_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _c public.coupons%ROWTYPE;
  _min numeric;
BEGIN
  SELECT * INTO _c FROM public.coupons WHERE upper(coupons.code) = upper(_code) LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'INVALID_CODE'::text, NULL::text, NULL::text, NULL::numeric, NULL::numeric;
    RETURN;
  END IF;

  IF NOT COALESCE(_c.enabled, false) THEN
    RETURN QUERY SELECT false, 'DISABLED'::text, _c.code, _c.discount_type, _c.discount_value, NULL::numeric;
    RETURN;
  END IF;

  IF _c.start_date IS NOT NULL AND _c.start_date > now() THEN
    RETURN QUERY SELECT false, 'NOT_STARTED'::text, _c.code, _c.discount_type, _c.discount_value, NULL::numeric;
    RETURN;
  END IF;

  IF (_c.expires_at IS NOT NULL AND _c.expires_at < now())
     OR (_c.end_date IS NOT NULL AND _c.end_date < now()) THEN
    RETURN QUERY SELECT false, 'EXPIRED'::text, _c.code, _c.discount_type, _c.discount_value, NULL::numeric;
    RETURN;
  END IF;

  IF _c.max_uses IS NOT NULL AND COALESCE(_c.used_count, 0) >= _c.max_uses THEN
    RETURN QUERY SELECT false, 'LIMIT_REACHED'::text, _c.code, _c.discount_type, _c.discount_value, NULL::numeric;
    RETURN;
  END IF;

  _min := COALESCE(NULLIF(_c.min_order_amount, 0), _c.min_cart_total, 0);
  IF _min > 0 AND COALESCE(_cart_total, 0) < _min THEN
    RETURN QUERY SELECT false, 'MIN_ORDER'::text, _c.code, _c.discount_type, _c.discount_value, _min;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text, _c.code, _c.discount_type, _c.discount_value, _min;
END $$;

GRANT EXECUTE ON FUNCTION public.validate_coupon(text, numeric) TO anon, authenticated, service_role;
