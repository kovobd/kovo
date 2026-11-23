
ALTER TABLE public.featured_categories DROP COLUMN IF EXISTS image_url;

CREATE OR REPLACE FUNCTION public.find_media_usage(_ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb := '[]'::jsonb;
  _r jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _ref IS NULL OR _ref = '' THEN RETURN _result; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity','product_media','id',pm.id,'label',COALESCE(p.name, pm.id::text),'column','image_url'
  )), '[]'::jsonb) INTO _r
  FROM public.product_media pm LEFT JOIN public.products p ON p.id = pm.product_id
  WHERE pm.image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity','categories','id',id,'label',name,
    'column', CASE WHEN image_url = _ref THEN 'image_url' ELSE 'featured_image_url' END
  )),'[]'::jsonb) INTO _r
  FROM public.categories WHERE image_url = _ref OR featured_image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','brands','id',id,'label',name,'column','logo_url')),'[]'::jsonb)
  INTO _r FROM public.brands WHERE logo_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','tags','id',id,'label',name,'column','icon')),'[]'::jsonb)
  INTO _r FROM public.tags WHERE icon = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','hero_slides','id',id,'label',COALESCE(title,id::text),'column','image_url')),'[]'::jsonb)
  INTO _r FROM public.hero_slides WHERE image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','offers','id',id,'label',COALESCE(title,id::text),'column','banner_image')),'[]'::jsonb)
  INTO _r FROM public.offers WHERE banner_image = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','homepage_sections','id',id,'label',id,'column','content')),'[]'::jsonb)
  INTO _r FROM public.homepage_sections WHERE content::text LIKE '%'||_ref||'%';
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','announcement_bar','id',id,'label',id,'column','content')),'[]'::jsonb)
  INTO _r FROM public.announcement_bar WHERE content::text LIKE '%'||_ref||'%';
  _result := _result || _r;

  RETURN _result;
END $function$;
