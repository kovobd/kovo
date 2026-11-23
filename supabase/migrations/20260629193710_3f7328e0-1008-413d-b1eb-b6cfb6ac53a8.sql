CREATE OR REPLACE FUNCTION public.increment_variant_stock(_variant_id uuid, _quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.product_variants
     SET stock = COALESCE(stock, 0) + GREATEST(0, COALESCE(_quantity, 0))
   WHERE id = _variant_id;
END $function$;