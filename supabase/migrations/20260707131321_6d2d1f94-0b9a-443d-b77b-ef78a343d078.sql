
CREATE OR REPLACE FUNCTION public.unlink_media_references(_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _counts jsonb := '{}'::jsonb;
  _n integer;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _ref IS NULL OR _ref = '' THEN RETURN _counts; END IF;

  DELETE FROM public.product_media WHERE image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('product_media', _n);

  UPDATE public.categories SET image_url = NULL WHERE image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('categories_image', _n);

  UPDATE public.categories SET featured_image_url = NULL WHERE featured_image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('categories_featured', _n);

  UPDATE public.brands SET logo_url = NULL WHERE logo_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('brands', _n);

  UPDATE public.tags SET icon = NULL WHERE icon = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('tags', _n);

  UPDATE public.hero_slides SET image_url = NULL WHERE image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('hero_slides', _n);

  UPDATE public.offers SET banner_image = NULL WHERE banner_image = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('offers', _n);

  RETURN _counts;
END $function$;

GRANT EXECUTE ON FUNCTION public.unlink_media_references(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_media_references(text) TO service_role;
