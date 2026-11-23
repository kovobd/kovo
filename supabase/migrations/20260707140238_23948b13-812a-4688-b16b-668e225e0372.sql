CREATE OR REPLACE FUNCTION public._media_column_exists(_table text, _column text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = _table
      AND column_name = _column
  );
$$;

CREATE OR REPLACE FUNCTION public.scrub_jsonb_media_ref(_data jsonb, _ref text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _item jsonb;
  _key text;
  _value jsonb;
  _result jsonb;
BEGIN
  IF _data IS NULL OR _ref IS NULL OR _ref = '' THEN
    RETURN _data;
  END IF;

  CASE jsonb_typeof(_data)
    WHEN 'string' THEN
      IF _data = to_jsonb(_ref) THEN
        RETURN 'null'::jsonb;
      END IF;
      RETURN _data;
    WHEN 'array' THEN
      SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
      INTO _result
      FROM (
        SELECT public.scrub_jsonb_media_ref(value, _ref) AS v
        FROM jsonb_array_elements(_data)
      ) s
      WHERE v <> 'null'::jsonb;
      RETURN _result;
    WHEN 'object' THEN
      _result := '{}'::jsonb;
      FOR _key, _value IN SELECT key, value FROM jsonb_each(_data) LOOP
        _item := public.scrub_jsonb_media_ref(_value, _ref);
        IF _item <> 'null'::jsonb THEN
          _result := _result || jsonb_build_object(_key, _item);
        END IF;
      END LOOP;
      RETURN _result;
    ELSE
      RETURN _data;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_media_usage(_ref text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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

  IF public._media_column_exists('product_variants', 'image_url') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'entity','product_variants','id',pv.id,'label',COALESCE(p.name, pv.sku, pv.id::text),'column','image_url'
    )), '[]'::jsonb) INTO _r
    FROM public.product_variants pv LEFT JOIN public.products p ON p.id = pv.product_id
    WHERE pv.image_url = _ref;
    _result := _result || _r;
  END IF;

  IF public._media_column_exists('product_variants', 'gallery') THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'entity','product_variants','id',pv.id,'label',COALESCE(p.name, pv.sku, pv.id::text),'column','gallery'
    )), '[]'::jsonb) INTO _r
    FROM public.product_variants pv LEFT JOIN public.products p ON p.id = pv.product_id
    WHERE _ref = ANY(COALESCE(pv.gallery, ARRAY[]::text[]));
    _result := _result || _r;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity','categories','id',id,'label',name,
    'column', CASE WHEN image_url = _ref THEN 'image_url' ELSE 'featured_image_url' END
  )),'[]'::jsonb) INTO _r
  FROM public.categories WHERE image_url = _ref OR featured_image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity','brands','id',id,'label',name,
    'column', CASE WHEN logo_url = _ref THEN 'logo_url' ELSE 'image_url' END
  )),'[]'::jsonb) INTO _r
  FROM public.brands WHERE logo_url = _ref OR image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','tags','id',id,'label',name,'column','icon')),'[]'::jsonb)
  INTO _r FROM public.tags WHERE icon = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity','hero_slides','id',id,'label',COALESCE(headline,id::text),
    'column', CASE WHEN image_url = _ref THEN 'image_url' ELSE 'mobile_image_url' END
  )),'[]'::jsonb) INTO _r
  FROM public.hero_slides WHERE image_url = _ref OR mobile_image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','hero_settings','id',id,'label',id,'column','poster_image_url')),'[]'::jsonb)
  INTO _r FROM public.hero_settings WHERE poster_image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','offers','id',id,'label',COALESCE(name,id::text),'column','banner_image')),'[]'::jsonb)
  INTO _r FROM public.offers WHERE banner_image = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity','testimonials','id',id,'label',COALESCE(name,id::text),
    'column', CASE WHEN image_url = _ref THEN 'image_url' ELSE 'main_image_url' END
  )),'[]'::jsonb) INTO _r
  FROM public.testimonials WHERE image_url = _ref OR main_image_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','video_testimonials','id',id,'label',COALESCE(title,id::text),'column','thumbnail_url')),'[]'::jsonb)
  INTO _r FROM public.video_testimonials WHERE thumbnail_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','site_review_media','id',id,'label',id::text,'column','r2_key')),'[]'::jsonb)
  INTO _r FROM public.site_review_media WHERE r2_key = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entity','design_settings','id',id,'label',id,
    'column', CASE
      WHEN logo_desktop_url = _ref THEN 'logo_desktop_url'
      WHEN logo_mobile_url = _ref THEN 'logo_mobile_url'
      WHEN logo_footer_url = _ref THEN 'logo_footer_url'
      ELSE 'favicon_url'
    END
  )),'[]'::jsonb) INTO _r
  FROM public.design_settings
  WHERE logo_desktop_url = _ref OR logo_mobile_url = _ref OR logo_footer_url = _ref OR favicon_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','invoice_settings','id',id,'label',id,'column','logo_url')),'[]'::jsonb)
  INTO _r FROM public.invoice_settings WHERE logo_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','floating_icons','id',id,'label',COALESCE(label,id::text),'column','icon_url')),'[]'::jsonb)
  INTO _r FROM public.floating_icons WHERE icon_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','floating_icons_settings','id',id,'label',id,'column','expand_icon_url')),'[]'::jsonb)
  INTO _r FROM public.floating_icons_settings WHERE expand_icon_url = _ref;
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','review_hero_settings','id',id,'label',id::text,'column','avatars')),'[]'::jsonb)
  INTO _r FROM public.review_hero_settings WHERE avatars::text LIKE '%' || _ref || '%';
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','homepage_sections','id',id,'label',id,'column','content')),'[]'::jsonb)
  INTO _r FROM public.homepage_sections WHERE content::text LIKE '%' || _ref || '%';
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','about_sections','id',id,'label',id,'column','content')),'[]'::jsonb)
  INTO _r FROM public.about_sections WHERE content::text LIKE '%' || _ref || '%';
  _result := _result || _r;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('entity','footer_settings','id',id,'label',id,'column','social_links')),'[]'::jsonb)
  INTO _r FROM public.footer_settings WHERE social_links::text LIKE '%' || _ref || '%';
  _result := _result || _r;

  RETURN _result;
END $$;

CREATE OR REPLACE FUNCTION public.unlink_media_references(_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  IF public._media_column_exists('product_variants', 'image_url') THEN
    UPDATE public.product_variants SET image_url = NULL WHERE image_url = _ref;
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('product_variants_image', _n);
  END IF;

  IF public._media_column_exists('product_variants', 'gallery') THEN
    UPDATE public.product_variants SET gallery = array_remove(gallery, _ref) WHERE _ref = ANY(COALESCE(gallery, ARRAY[]::text[]));
    GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('product_variants_gallery', _n);
  END IF;

  UPDATE public.categories SET image_url = NULL WHERE image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('categories_image', _n);

  UPDATE public.categories SET featured_image_url = NULL WHERE featured_image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('categories_featured', _n);

  UPDATE public.brands SET logo_url = NULL WHERE logo_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('brands_logo', _n);

  UPDATE public.brands SET image_url = NULL WHERE image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('brands_image', _n);

  UPDATE public.tags SET icon = NULL WHERE icon = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('tags', _n);

  UPDATE public.hero_slides SET image_url = NULL WHERE image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('hero_slides_image', _n);

  UPDATE public.hero_slides SET mobile_image_url = NULL WHERE mobile_image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('hero_slides_mobile', _n);

  UPDATE public.hero_settings SET poster_image_url = NULL WHERE poster_image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('hero_settings_poster', _n);

  UPDATE public.offers SET banner_image = NULL WHERE banner_image = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('offers', _n);

  UPDATE public.testimonials SET image_url = NULL WHERE image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('testimonials_image', _n);

  UPDATE public.testimonials SET main_image_url = NULL WHERE main_image_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('testimonials_main', _n);

  UPDATE public.video_testimonials SET thumbnail_url = NULL WHERE thumbnail_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('video_testimonials_thumbnail', _n);

  DELETE FROM public.site_review_media WHERE r2_key = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('site_review_media', _n);

  UPDATE public.design_settings SET logo_desktop_url = NULL WHERE logo_desktop_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('design_logo_desktop', _n);

  UPDATE public.design_settings SET logo_mobile_url = NULL WHERE logo_mobile_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('design_logo_mobile', _n);

  UPDATE public.design_settings SET logo_footer_url = NULL WHERE logo_footer_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('design_logo_footer', _n);

  UPDATE public.design_settings SET favicon_url = NULL WHERE favicon_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('design_favicon', _n);

  UPDATE public.invoice_settings SET logo_url = NULL WHERE logo_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('invoice_logo', _n);

  UPDATE public.floating_icons SET icon_url = NULL WHERE icon_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('floating_icons', _n);

  UPDATE public.floating_icons_settings SET expand_icon_url = NULL WHERE expand_icon_url = _ref;
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('floating_icons_settings', _n);

  UPDATE public.review_hero_settings
     SET avatars = public.scrub_jsonb_media_ref(avatars, _ref)
   WHERE avatars::text LIKE '%' || _ref || '%';
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('review_hero_avatars', _n);

  UPDATE public.homepage_sections
     SET content = public.scrub_jsonb_media_ref(content, _ref)
   WHERE content::text LIKE '%' || _ref || '%';
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('homepage_sections_content', _n);

  UPDATE public.about_sections
     SET content = public.scrub_jsonb_media_ref(content, _ref)
   WHERE content::text LIKE '%' || _ref || '%';
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('about_sections_content', _n);

  UPDATE public.footer_settings
     SET social_links = public.scrub_jsonb_media_ref(social_links, _ref)
   WHERE social_links::text LIKE '%' || _ref || '%';
  GET DIAGNOSTICS _n = ROW_COUNT; _counts := _counts || jsonb_build_object('footer_social_links', _n);

  RETURN _counts;
END $$;

GRANT EXECUTE ON FUNCTION public._media_column_exists(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._media_column_exists(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.scrub_jsonb_media_ref(jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scrub_jsonb_media_ref(jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.find_media_usage(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_media_usage(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlink_media_references(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_media_references(text) TO service_role;