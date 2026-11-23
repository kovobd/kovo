CREATE OR REPLACE FUNCTION public.backfill_product_reminders(_days integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _order record;
  _item jsonb;
  _pid uuid;
  _prod record;
  _digits text;
  _cust_id uuid;
  _due date;
  _seen uuid[];
  _inserted int := 0;
  _scanned int := 0;
  _dnr boolean;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR _order IN
    SELECT id, order_number, items, customer_phone, customer_name, customer_email, created_at
      FROM public.orders
     WHERE created_at >= now() - (_days || ' days')::interval
     ORDER BY created_at ASC
  LOOP
    _scanned := _scanned + 1;
    _digits := regexp_replace(COALESCE(_order.customer_phone,''), '\D', '', 'g');
    IF _digits = '' OR _order.items IS NULL OR jsonb_typeof(_order.items) <> 'array' THEN CONTINUE; END IF;

    SELECT id INTO _cust_id FROM public.customers
      WHERE regexp_replace(COALESCE(phone,''), '\D', '', 'g') = _digits LIMIT 1;

    _seen := ARRAY[]::uuid[];
    FOR _item IN SELECT * FROM jsonb_array_elements(_order.items) LOOP
      BEGIN _pid := NULLIF(_item->>'product_id','')::uuid;
      EXCEPTION WHEN others THEN _pid := NULL; END;
      IF _pid IS NULL THEN
        BEGIN _pid := NULLIF(_item->>'id','')::uuid; EXCEPTION WHEN others THEN _pid := NULL; END;
      END IF;
      IF _pid IS NULL OR _pid = ANY(_seen) THEN CONTINUE; END IF;
      _seen := _seen || _pid;

      SELECT EXISTS (
        SELECT 1 FROM public.product_reminders
         WHERE customer_phone = _digits AND product_id = _pid AND status = 'do_not_remind'
      ) INTO _dnr;
      IF _dnr THEN CONTINUE; END IF;

      SELECT id, name, reminder_enabled, reminder_days, reminder_notes
        INTO _prod FROM public.products WHERE id = _pid;
      IF NOT FOUND OR NOT COALESCE(_prod.reminder_enabled,false) OR COALESCE(_prod.reminder_days,0) <= 0 THEN
        CONTINUE;
      END IF;

      IF EXISTS (SELECT 1 FROM public.product_reminders
                  WHERE order_id = _order.id AND product_id = _pid) THEN
        CONTINUE;
      END IF;

      _due := (_order.created_at::date + _prod.reminder_days);

      INSERT INTO public.product_reminders (
        product_id, product_name_snapshot, order_id, order_number,
        customer_id, customer_phone, customer_name, customer_email,
        reminder_days, purchase_date, due_date, status, priority, notes
      ) VALUES (
        _prod.id, _prod.name, _order.id, _order.order_number,
        _cust_id, _digits, _order.customer_name, _order.customer_email,
        _prod.reminder_days, _order.created_at, _due, 'pending', 'low', _prod.reminder_notes
      )
      ON CONFLICT DO NOTHING;
      _inserted := _inserted + 1;
    END LOOP;
  END LOOP;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_phone, product_id ORDER BY purchase_date DESC) AS rn
      FROM public.product_reminders
     WHERE status IN ('pending','called','follow_up','no_response')
  )
  UPDATE public.product_reminders r
     SET status = 'superseded', resolved_at = now()
    FROM ranked
   WHERE r.id = ranked.id AND ranked.rn > 1;

  RETURN jsonb_build_object('scanned', _scanned, 'inserted', _inserted);
END $function$
;

CREATE OR REPLACE FUNCTION public.bulk_delete_incomplete(_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  DELETE FROM public.incomplete_orders WHERE id = ANY(_ids);
END $function$
;

CREATE OR REPLACE FUNCTION public.bulk_mark_incomplete_contacted(_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.incomplete_orders
     SET recovery_status = 'contacted',
         last_activity = now()
   WHERE id = ANY(_ids) AND recovered = false;
END $function$
;

CREATE OR REPLACE FUNCTION public.bulk_update_sort_order(_table text, _ids text[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _allowed CONSTANT text[] := ARRAY[
    'products','hero_slides','announcement_bar','featured_categories','policies'
  ];
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _table IS NULL OR NOT (_table = ANY(_allowed)) THEN
    RAISE EXCEPTION 'table not allowed: %', _table;
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE public.%I AS t
        SET sort_order = u.ord
       FROM (SELECT unnest($1::text[]) AS id, generate_subscripts($1::text[], 1) AS ord) AS u
      WHERE t.id::text = u.id',
    _table
  ) USING _ids;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.bump_product_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END)
  );
  IF pid IS NOT NULL THEN
    UPDATE public.products SET updated_at = now() WHERE id = pid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cascade_category_path()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if NEW.path is distinct from OLD.path then
    update public.categories
       set path = NEW.path || substring(path from length(OLD.path) + 1),
           full_slug = NEW.path || substring(path from length(OLD.path) + 1)
     where path like OLD.path || '/%';
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.decrement_coupon_usage(_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.coupons
     SET used_count = GREATEST(0, COALESCE(used_count, 0) - 1)
   WHERE code = _code;
END $function$
;

CREATE OR REPLACE FUNCTION public.decrement_product_stock(_product_id uuid, _quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.products set stock = greatest(0, stock - _quantity) where id = _product_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.decrement_variant_stock(_variant_id uuid, _quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF _variant_id IS NULL OR COALESCE(_quantity, 0) <= 0 THEN RETURN; END IF;
  UPDATE public.product_variants
     SET stock = GREATEST(0, COALESCE(stock,0) - _quantity)
   WHERE id = _variant_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_enabled_delivery_partner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.enabled IS TRUE THEN
    UPDATE public.delivery_partners
       SET enabled = false
     WHERE id <> NEW.id
       AND enabled = true;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_single_review_media()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  existing_count int;
BEGIN
  SELECT COUNT(*) INTO existing_count
  FROM public.site_review_media
  WHERE review_id = NEW.review_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF existing_count >= 1 THEN
    RAISE EXCEPTION 'A review may only have one media attachment. Remove the existing media first.';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public._media_column_exists(_table text, _column text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = _table
      AND column_name = _column
  );
$function$
;

CREATE OR REPLACE FUNCTION public.scrub_jsonb_media_ref(_data jsonb, _ref text)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
      SELECT COALESCE(jsonb_agg(v ORDER BY ord), '[]'::jsonb)
      INTO _result
      FROM (
        SELECT public.scrub_jsonb_media_ref(value, _ref) AS v, ord
        FROM jsonb_array_elements(_data) WITH ORDINALITY AS a(value, ord)
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
$function$
;

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
END $function$
;

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
     SET avatars = COALESCE((
       SELECT jsonb_agg(elem ORDER BY ord)
       FROM jsonb_array_elements(avatars) WITH ORDINALITY AS a(elem, ord)
       WHERE COALESCE(elem->>'r2_key', '') <> _ref
     ), '[]'::jsonb)
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
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_incomplete_order_counts(_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _q text;
  _like text;
  _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT recovered, recovery_status
      FROM public.incomplete_orders o
     WHERE o.phone ~ '^01[0-9]{9}$'
       AND jsonb_typeof(o.cart_items) = 'array'
       AND jsonb_array_length(o.cart_items) > 0
       AND (
         _q IS NULL
         OR o.phone LIKE '%' || _q || '%'
         OR lower(COALESCE(o.customer_name,'')) LIKE _like
         OR lower(COALESCE(o.email,'')) LIKE _like
       )
  )
  SELECT jsonb_build_object(
    'all',       count(*),
    'pending',   count(*) FILTER (WHERE recovered = false AND coalesce(recovery_status,'') <> 'contacted'),
    'contacted', count(*) FILTER (WHERE recovered = false AND recovery_status = 'contacted'),
    'recovered', count(*) FILTER (WHERE recovered = true)
  )
  INTO _result FROM filtered;

  RETURN COALESCE(_result, jsonb_build_object('all',0,'pending',0,'contacted',0,'recovered',0));
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_incomplete_order_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _total bigint := 0;
  _recovered bigint := 0;
  _abandoned_value numeric := 0;
  _rate int := 0;
  _top jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT recovered, total, cart_items
      FROM public.incomplete_orders o
     WHERE o.phone ~ '^01[0-9]{9}$'
       AND jsonb_typeof(o.cart_items) = 'array'
       AND jsonb_array_length(o.cart_items) > 0
  )
  SELECT count(*),
         count(*) FILTER (WHERE recovered = true),
         COALESCE(SUM(total) FILTER (WHERE recovered = false), 0)
  INTO _total, _recovered, _abandoned_value
  FROM base;

  IF _total > 0 THEN _rate := ROUND((_recovered::numeric / _total) * 100)::int; END IF;

  WITH items AS (
    SELECT
      COALESCE(NULLIF(it->>'product_id',''), NULLIF(it->>'id',''), it->>'name') AS key,
      COALESCE(it->>'name','Unnamed') AS name,
      COALESCE(NULLIF(it->>'quantity','')::numeric, 1) AS qty
    FROM public.incomplete_orders o,
         LATERAL jsonb_array_elements(o.cart_items) it
    WHERE o.recovered = false
      AND o.phone ~ '^01[0-9]{9}$'
      AND jsonb_typeof(o.cart_items) = 'array'
      AND jsonb_array_length(o.cart_items) > 0
  ),
  agg AS (
    SELECT key, max(name) AS name, SUM(qty)::int AS count
      FROM items
     WHERE key IS NOT NULL
     GROUP BY key
     ORDER BY SUM(qty) DESC
     LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', name, 'count', count) ORDER BY count DESC), '[]'::jsonb)
  INTO _top FROM agg;

  RETURN jsonb_build_object(
    'total', _total,
    'recovered', _recovered,
    'rate', _rate,
    'abandonedValue', _abandoned_value,
    'topAbandoned', _top
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_incomplete_orders_page(_page integer DEFAULT 1, _page_size integer DEFAULT 25, _status text DEFAULT NULL::text, _search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _offset int;
  _limit int;
  _total bigint;
  _rows jsonb;
  _q text;
  _like text;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(_page_size, 25), 200));
  _offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * _limit;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT *
      FROM public.incomplete_orders o
     WHERE o.phone ~ '^01[0-9]{9}$'
       AND jsonb_typeof(o.cart_items) = 'array'
       AND jsonb_array_length(o.cart_items) > 0
       AND (
         _status IS NULL OR _status = 'all'
         OR (_status = 'pending'   AND o.recovered = false AND coalesce(o.recovery_status,'') <> 'contacted')
         OR (_status = 'contacted' AND o.recovered = false AND o.recovery_status = 'contacted')
         OR (_status = 'recovered' AND o.recovered = true)
       )
       AND (
         _q IS NULL
         OR o.phone LIKE '%' || _q || '%'
         OR lower(COALESCE(o.customer_name,'')) LIKE _like
         OR lower(COALESCE(o.email,'')) LIKE _like
       )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM filtered),
  page AS (
    SELECT * FROM filtered
     ORDER BY last_activity DESC
     LIMIT _limit OFFSET _offset
  )
  SELECT (SELECT c FROM counted),
         COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.last_activity DESC), '[]'::jsonb)
    INTO _total, _rows
    FROM page p;

  RETURN jsonb_build_object(
    'rows', _rows,
    'total', _total,
    'page', GREATEST(1, COALESCE(_page, 1)),
    'page_size', _limit
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_order_status_counts(_search text DEFAULT NULL::text, _payment_status text DEFAULT NULL::text, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _q text; _like text; _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT order_status FROM public.orders o
     WHERE o.deleted_at IS NULL
       AND (_payment_status IS NULL OR _payment_status = 'all' OR o.payment_status = _payment_status)
       AND (_date_from IS NULL OR o.created_at >= _date_from)
       AND (_date_to IS NULL OR o.created_at <= _date_to)
       AND (
         _q IS NULL
         OR lower(o.order_number) LIKE _like
         OR lower(COALESCE(o.customer_name, '')) LIKE _like
         OR lower(COALESCE(o.customer_email, '')) LIKE _like
         OR COALESCE(o.customer_phone, '') LIKE '%' || _q || '%'
       )
  )
  SELECT jsonb_build_object(
    'all', count(*),
    'pending', count(*) FILTER (WHERE order_status = 'pending'),
    'confirmed', count(*) FILTER (WHERE order_status = 'confirmed'),
    'processing', count(*) FILTER (WHERE order_status = 'processing'),
    'shipped', count(*) FILTER (WHERE order_status = 'shipped'),
    'delivered', count(*) FILTER (WHERE order_status = 'delivered'),
    'cancelled', count(*) FILTER (WHERE order_status = 'cancelled')
  ) INTO _result FROM filtered;
  RETURN COALESCE(_result, jsonb_build_object('all',0,'pending',0,'confirmed',0,'processing',0,'shipped',0,'delivered',0,'cancelled',0));
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_orders_page(_page integer DEFAULT 1, _page_size integer DEFAULT 50, _status text DEFAULT NULL::text, _search text DEFAULT NULL::text, _payment_status text DEFAULT NULL::text, _date_from timestamp with time zone DEFAULT NULL::timestamp with time zone, _date_to timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _offset int; _limit int; _total bigint; _rows jsonb; _q text; _like text;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _limit := GREATEST(1, LEAST(COALESCE(_page_size, 50), 200));
  _offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * _limit;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH filtered AS (
    SELECT * FROM public.orders o
     WHERE o.deleted_at IS NULL
       AND (_status IS NULL OR _status = 'all' OR o.order_status = _status)
       AND (_payment_status IS NULL OR _payment_status = 'all' OR o.payment_status = _payment_status)
       AND (_date_from IS NULL OR o.created_at >= _date_from)
       AND (_date_to IS NULL OR o.created_at <= _date_to)
       AND (
         _q IS NULL
         OR lower(o.order_number) LIKE _like
         OR lower(COALESCE(o.customer_name, '')) LIKE _like
         OR lower(COALESCE(o.customer_email, '')) LIKE _like
         OR COALESCE(o.customer_phone, '') LIKE '%' || _q || '%'
       )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM filtered),
  page AS (SELECT * FROM filtered ORDER BY created_at DESC LIMIT _limit OFFSET _offset)
  SELECT (SELECT c FROM counted), COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC), '[]'::jsonb)
    INTO _total, _rows FROM page p;

  RETURN jsonb_build_object('rows', _rows, 'total', _total,
    'page', GREATEST(1, COALESCE(_page, 1)), 'page_size', _limit);
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_reminder_metrics(_today date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _t date := COALESCE(_today, (now() AT TIME ZONE 'Asia/Dhaka')::date);
  _today_count int := 0;
  _missed_count int := 0;
  _upcoming_count int := 0;
  _completed int := 0;
  _conv_base int := 0;
  _conversion int := 0;
  _revenue numeric := 0;
  _avg_reorder int := 0;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH base AS (
    SELECT status, reorder_amount,
      CASE
        WHEN status IN ('follow_up','no_response')
          THEN COALESCE(next_action_date, follow_up_date, due_date)
        WHEN status = 'interested'
          THEN COALESCE(expected_purchase_date, due_date)
        ELSE due_date
      END AS ref_date
    FROM public.product_reminders
  )
  SELECT
    count(*) FILTER (WHERE status IN ('pending','called','no_response','follow_up','interested') AND ref_date = _t),
    count(*) FILTER (WHERE status IN ('pending','called') AND ref_date < _t),
    count(*) FILTER (WHERE status IN ('pending','called') AND ref_date > _t),
    count(*) FILTER (WHERE status = 'purchased_again'),
    count(*) FILTER (WHERE status IN ('purchased_again','not_interested','no_response','follow_up','do_not_remind')),
    COALESCE(SUM(reorder_amount) FILTER (WHERE status = 'purchased_again'), 0)
  INTO _today_count, _missed_count, _upcoming_count, _completed, _conv_base, _revenue
  FROM base;

  IF _conv_base > 0 THEN _conversion := ROUND((_completed::numeric / _conv_base) * 100)::int; END IF;
  IF _completed > 0 THEN _avg_reorder := ROUND(_revenue / _completed)::int; END IF;

  RETURN jsonb_build_object(
    'todayCount',    _today_count,
    'missedCount',   _missed_count,
    'upcomingCount', _upcoming_count,
    'completed',     _completed,
    'conversion',    _conversion,
    'revenue',       _revenue,
    'avgReorder',    _avg_reorder
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_reminder_tab_counts(_today date DEFAULT NULL::date, _search text DEFAULT NULL::text, _product_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _q text;
  _like text;
  _t date := COALESCE(_today, (now() AT TIME ZONE 'Asia/Dhaka')::date);
  _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH base AS (
    SELECT
      status,
      CASE
        WHEN status IN ('follow_up','no_response')
          THEN COALESCE(next_action_date, follow_up_date, due_date)
        WHEN status = 'interested'
          THEN COALESCE(expected_purchase_date, due_date)
        ELSE due_date
      END AS ref_date
    FROM public.product_reminders r
    WHERE (_product_id IS NULL OR r.product_id = _product_id)
      AND (
        _q IS NULL
        OR r.customer_phone LIKE '%' || _q || '%'
        OR lower(COALESCE(r.customer_name,'')) LIKE _like
        OR lower(COALESCE(r.product_name_snapshot,'')) LIKE _like
      )
  )
  SELECT jsonb_build_object(
    'today',         count(*) FILTER (WHERE status IN ('pending','called','no_response','follow_up','interested') AND ref_date = _t),
    'missed',        count(*) FILTER (WHERE status IN ('pending','called') AND ref_date < _t),
    'noResponse',    count(*) FILTER (WHERE status = 'no_response'),
    'followUp',      count(*) FILTER (WHERE status IN ('follow_up','interested')),
    'notInterested', count(*) FILTER (WHERE status = 'not_interested'),
    'doNotRemind',   count(*) FILTER (WHERE status = 'do_not_remind'),
    'upcoming',      count(*) FILTER (WHERE status IN ('pending','called') AND ref_date > _t),
    'closed',        count(*) FILTER (WHERE status = 'purchased_again')
  ) INTO _result FROM base;

  RETURN COALESCE(_result, jsonb_build_object(
    'today',0,'missed',0,'noResponse',0,'followUp',0,
    'notInterested',0,'doNotRemind',0,'upcoming',0,'closed',0
  ));
END $function$
;

CREATE OR REPLACE FUNCTION public.get_admin_reminders_page(_tab text DEFAULT 'today'::text, _page integer DEFAULT 1, _page_size integer DEFAULT 25, _today date DEFAULT NULL::date, _search text DEFAULT NULL::text, _product_id uuid DEFAULT NULL::uuid, _sort text DEFAULT 'due_date'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _offset int;
  _limit int;
  _total bigint;
  _rows jsonb;
  _q text;
  _like text;
  _t date := COALESCE(_today, (now() AT TIME ZONE 'Asia/Dhaka')::date);
  _sort_norm text := lower(COALESCE(_sort, 'due_date'));
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  _limit := GREATEST(1, LEAST(COALESCE(_page_size, 25), 200));
  _offset := GREATEST(0, (COALESCE(_page, 1) - 1)) * _limit;
  _q := NULLIF(trim(COALESCE(_search, '')), '');
  _like := '%' || lower(_q) || '%';

  WITH base AS (
    SELECT
      r.*,
      CASE
        WHEN r.status IN ('follow_up','no_response')
          THEN COALESCE(r.next_action_date, r.follow_up_date, r.due_date)
        WHEN r.status = 'interested'
          THEN COALESCE(r.expected_purchase_date, r.due_date)
        ELSE r.due_date
      END AS ref_date,
      c.total_orders AS cust_orders,
      c.total_spent  AS cust_spent,
      ro.order_number AS reorder_order_number
    FROM public.product_reminders r
    LEFT JOIN public.customers c
      ON regexp_replace(COALESCE(c.phone,''), '\D', '', 'g')
       = regexp_replace(COALESCE(r.customer_phone,''), '\D', '', 'g')
    LEFT JOIN public.orders ro
      ON ro.id = r.reorder_order_id
  ),
  filtered AS (
    SELECT * FROM base b
     WHERE
       -- tab partitioning (mirrors the page's JS logic)
       (
         _tab = 'all'
         OR (_tab = 'today'    AND b.status IN ('pending','called','no_response','follow_up','interested') AND b.ref_date = _t)
         OR (_tab = 'missed'   AND b.status IN ('pending','called') AND b.ref_date < _t)
         OR (_tab = 'noresp'   AND b.status = 'no_response')
         OR (_tab = 'follow'   AND b.status IN ('follow_up','interested'))
         OR (_tab = 'lost'     AND b.status = 'not_interested')
         OR (_tab = 'dnr'      AND b.status = 'do_not_remind')
         OR (_tab = 'upcoming' AND b.status IN ('pending','called') AND b.ref_date > _t)
         OR (_tab = 'closed'   AND b.status = 'purchased_again')
       )
       AND (_product_id IS NULL OR b.product_id = _product_id)
       AND (
         _q IS NULL
         OR b.customer_phone LIKE '%' || _q || '%'
         OR lower(COALESCE(b.customer_name,'')) LIKE _like
         OR lower(COALESCE(b.product_name_snapshot,'')) LIKE _like
       )
  ),
  counted AS (SELECT count(*)::bigint AS c FROM filtered),
  page AS (
    SELECT * FROM filtered
     ORDER BY
       -- days_overdue: most overdue first (smallest ref_date)
       CASE WHEN _sort_norm = 'days_overdue' THEN ref_date END ASC NULLS LAST,
       -- order_value / revenue: largest reorder_amount first
       CASE WHEN _sort_norm IN ('order_value','revenue') THEN COALESCE(reorder_amount,0) END DESC,
       -- total_orders: customer order count desc
       CASE WHEN _sort_norm = 'total_orders' THEN COALESCE(cust_orders,0) END DESC,
       -- total_spend: customer spend desc
       CASE WHEN _sort_norm = 'total_spend' THEN COALESCE(cust_spent,0) END DESC,
       -- default per-tab orderings when sort = due_date
       CASE WHEN _sort_norm = 'due_date' AND _tab = 'today'  THEN created_at END ASC,
       CASE WHEN _sort_norm = 'due_date' AND _tab = 'closed' THEN COALESCE(completed_at, resolved_at, updated_at) END DESC,
       CASE WHEN _sort_norm = 'due_date' AND _tab NOT IN ('today','closed') THEN ref_date END ASC,
       created_at ASC
     LIMIT _limit OFFSET _offset
  )
  SELECT (SELECT c FROM counted),
         COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    INTO _total, _rows
    FROM page p;

  RETURN jsonb_build_object(
    'rows', _rows,
    'total', _total,
    'page', GREATEST(1, COALESCE(_page, 1)),
    'page_size', _limit
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.get_clarity_project_id()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT clarity_project_id FROM public.intelligence_settings WHERE id = 1
$function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_full(_range_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _metrics jsonb; _top jsonb; _chart jsonb; _low jsonb; _recent jsonb;
  _days int := GREATEST(1, LEAST(COALESCE(_range_days, 30), 90));
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT to_jsonb(m) INTO _metrics FROM public.mv_dashboard_metrics m LIMIT 1;
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.units_sold DESC), '[]'::jsonb)
    INTO _top FROM public.mv_top_products_30d t;

  IF _days <= 1 THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label', to_char(h, 'HH24:00'),
      'revenue', COALESCE(rev, 0),
      'orders', COALESCE(cnt, 0)
    ) ORDER BY h), '[]'::jsonb)
    INTO _chart
    FROM generate_series(0, 23) AS h
    LEFT JOIN (
      SELECT EXTRACT(HOUR FROM COALESCE(paid_at, created_at))::int AS hh,
             SUM(total)::numeric AS rev,
             COUNT(*)::int AS cnt
      FROM public.orders
      WHERE deleted_at IS NULL
        AND order_status = 'delivered'
        AND payment_status = 'paid'
        AND COALESCE(paid_at, created_at)::date = CURRENT_DATE
      GROUP BY 1
    ) o ON o.hh = h
    LEFT JOIN LATERAL (SELECT o.rev, o.cnt) x ON true;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'label', to_char(d, 'Mon DD'),
      'revenue', COALESCE(daily.revenue, 0),
      'orders', COALESCE(daily.orders, 0)
    ) ORDER BY d), '[]'::jsonb)
    INTO _chart
    FROM generate_series((CURRENT_DATE - (_days - 1))::date, CURRENT_DATE, interval '1 day') AS g(d)
    LEFT JOIN public.mv_orders_daily_90d daily ON daily.day = g.d::date;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name, 'stock', stock
  ) ORDER BY stock ASC), '[]'::jsonb)
  INTO _low
  FROM (SELECT id, name, stock FROM public.products WHERE stock <= 5 ORDER BY stock ASC LIMIT 5) s;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'order_number', order_number, 'customer_name', customer_name,
    'total', total, 'order_status', order_status, 'created_at', created_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
  INTO _recent
  FROM (
    SELECT id, order_number, customer_name, total, order_status, created_at
    FROM public.orders WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5
  ) r;

  RETURN jsonb_build_object(
    'metrics', _metrics, 'top_products', _top, 'chart', _chart,
    'low_stock', _low, 'recent_orders', _recent, 'range_days', _days
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row jsonb; _top jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT to_jsonb(m) INTO _row FROM public.mv_dashboard_metrics m LIMIT 1;
  SELECT jsonb_agg(to_jsonb(t)) INTO _top FROM public.mv_top_products_30d t;
  RETURN jsonb_build_object('metrics', _row, 'top_products', COALESCE(_top, '[]'::jsonb));
END $function$
;

CREATE OR REPLACE FUNCTION public.get_order_for_purchase_tracking(p_order_number text)
 RETURNS TABLE(order_number text, total numeric, order_status text, payment_status text, is_deleted boolean, is_cancelled boolean, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    o.order_number,
    o.total,
    o.order_status,
    o.payment_status,
    (o.deleted_at IS NOT NULL) AS is_deleted,
    (o.order_status = 'cancelled') AS is_cancelled,
    o.created_at
  FROM public.orders o
  WHERE o.order_number = p_order_number
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_contact_settings()
 RETURNS TABLE(id text, page_title text, page_intro text, phone_number text, email_address text, show_address boolean, business_address text, phone_field_enabled boolean, submit_button_text text, social_section_enabled boolean, social_links jsonb, faq_shortcut_enabled boolean, faq_shortcut_items jsonb, map_enabled boolean, map_embed text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, page_title, page_intro, phone_number, email_address, show_address,
         business_address, phone_field_enabled, submit_button_text,
         social_section_enabled, social_links, faq_shortcut_enabled,
         faq_shortcut_items, map_enabled, map_embed
  FROM public.contact_settings WHERE id = 'default' LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.get_public_tracking_pixels()
 RETURNS TABLE(platform text, pixel_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select platform, pixel_id from public.tracking_pixels where enabled = true and pixel_id <> '';
$function$
;

CREATE OR REPLACE FUNCTION public.get_reminder_attention_counts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _today date := (now() AT TIME ZONE 'Asia/Dhaka')::date; _due int; _missed int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT count(*) INTO _due FROM public.product_reminders
   WHERE status IN ('pending','called','follow_up','interested','no_response')
     AND COALESCE(
           CASE WHEN status IN ('follow_up','no_response') THEN COALESCE(next_action_date, follow_up_date, due_date)
                WHEN status = 'interested' THEN COALESCE(expected_purchase_date, due_date)
                ELSE due_date END,
           due_date
         ) = _today;

  SELECT count(*) INTO _missed FROM public.product_reminders
   WHERE status IN ('pending','called')
     AND due_date < _today;

  RETURN jsonb_build_object('dueToday', _due, 'missed', _missed, 'total', _due + _missed);
END $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$function$
;

CREATE OR REPLACE FUNCTION public.increment_coupon_usage(_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.coupons set used_count = used_count + 1 where code = _code;
end $function$
;

CREATE OR REPLACE FUNCTION public.increment_product_stock(_product_id uuid, _quantity integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.products
     SET stock = COALESCE(stock, 0) + GREATEST(0, COALESCE(_quantity, 0))
   WHERE id = _product_id;
END $function$
;

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
END $function$
;

CREATE OR REPLACE FUNCTION public.is_admin_or_staff(_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','staff'))
$function$
;

CREATE OR REPLACE FUNCTION public.log_browser_pixel_event(p_event_name text, p_event_id text, p_custom_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.maintain_category_hierarchy()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare parent_record record;
begin
  if NEW.parent_id is null then
    NEW.level := 1;
    NEW.category_type := 'category';
    NEW.path := NEW.slug;
    NEW.full_slug := NEW.slug;
  else
    select level, path into parent_record from public.categories where id = NEW.parent_id;
    if parent_record.level >= 3 then
      raise exception 'Maximum category depth is 3 (category -> subcategory -> child)';
    end if;
    NEW.level := parent_record.level + 1;
    NEW.category_type := case NEW.level when 1 then 'category'::public.category_type
                                         when 2 then 'subcategory'::public.category_type
                                         else 'child'::public.category_type end;
    NEW.path := parent_record.path || '/' || NEW.slug;
    NEW.full_slug := NEW.path;
  end if;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_admin_notifications_seen(_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin_or_staff(auth.uid()) then return; end if;
  update public.admin_notifications
     set admin_seen = true, seen_at = now()
   where admin_seen = false
     and (_type is null or type = _type);
end $function$
;

CREATE OR REPLACE FUNCTION public.mark_incomplete_order_recovered(_session_id text, _phone text, _order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
begin
  if _digits !~ '^01[0-9]{9}$' then return; end if;
  update public.incomplete_orders
     set recovered = true,
         recovery_status = 'recovered',
         converted_order_id = _order_id,
         last_activity = now()
   where phone = _digits
     and (session_id = _session_id or _session_id is null)
     and recovered = false;
end $function$
;

CREATE OR REPLACE FUNCTION public.meta_capi_cleanup(_keep_days integer DEFAULT 60)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _deleted int; _floor int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _floor := GREATEST(COALESCE(_keep_days, 60), 7);
  DELETE FROM public.capi_event_logs WHERE created_at < (now() - (_floor || ' days')::interval);
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END $function$
;

CREATE OR REPLACE FUNCTION public.meta_capi_metrics(_since timestamp with time zone DEFAULT (now() - '24:00:00'::interval))
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  WITH base AS (SELECT * FROM public.capi_event_logs WHERE created_at >= _since),
  totals AS (
    SELECT count(*) AS total,
      count(*) FILTER (WHERE status='delivered') AS delivered,
      count(*) FILTER (WHERE status='failed') AS failed,
      count(*) FILTER (WHERE status='skipped') AS skipped,
      count(*) FILTER (WHERE source='browser') AS browser,
      count(*) FILTER (WHERE source='server') AS server,
      avg(response_time_ms) FILTER (WHERE status='delivered')::int AS avg_response_ms
    FROM base),
  per_event AS (
    SELECT event_name, count(*)::int AS total,
      count(*) FILTER (WHERE status='delivered')::int AS delivered,
      count(*) FILTER (WHERE status='failed')::int AS failed
    FROM base GROUP BY event_name),
  dedup AS (
    SELECT event_id FROM base WHERE status='delivered'
    GROUP BY event_id HAVING count(*) >= 2),
  fail_recent AS (
    SELECT bool_and(status='failed') AS streak
    FROM (SELECT status FROM base WHERE source='server' ORDER BY created_at DESC LIMIT 50) s)
  SELECT jsonb_build_object(
    'totals', (SELECT to_jsonb(t) FROM totals t),
    'per_event', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM per_event p), '[]'::jsonb),
    'dedupe_pairs', COALESCE((SELECT count(*) FROM dedup), 0),
    'recent_failure_streak', COALESCE((SELECT streak FROM fail_recent), false),
    'since', _since
  ) INTO _result;
  RETURN _result;
END $function$
;

CREATE OR REPLACE FUNCTION public.meta_capi_purge_all()
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.meta_capi_search(_term text, _limit integer DEFAULT 100)
 RETURNS SETOF capi_event_logs
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
    SELECT * FROM public.capi_event_logs
     WHERE _term IS NOT NULL AND _term <> ''
       AND (event_id ILIKE '%'||_term||'%' OR COALESCE(order_id,'') ILIKE '%'||_term||'%')
     ORDER BY created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit, 100), 500));
END $function$
;

CREATE OR REPLACE FUNCTION public.meta_capi_timeseries(_since timestamp with time zone DEFAULT (now() - '30 days'::interval))
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'day', day, 'delivered', delivered, 'failed', failed, 'skipped', skipped
  ) ORDER BY day), '[]'::jsonb) INTO _result
  FROM (
    SELECT (created_at AT TIME ZONE 'UTC')::date AS day,
      count(*) FILTER (WHERE status='delivered')::int AS delivered,
      count(*) FILTER (WHERE status='failed')::int AS failed,
      count(*) FILTER (WHERE status='skipped')::int AS skipped
    FROM public.capi_event_logs WHERE created_at >= _since GROUP BY 1
  ) t;
  RETURN _result;
END $function$
;

CREATE OR REPLACE FUNCTION public.next_order_number()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _candidate text;
  _attempts int := 0;
BEGIN
  LOOP
    _candidate := nextval('public.order_number_seq')::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = _candidate);
    _attempts := _attempts + 1;
    IF _attempts > 50 THEN
      RAISE EXCEPTION 'Could not allocate unique order number after 50 attempts';
    END IF;
  END LOOP;
  RETURN _candidate;
END $function$
;

CREATE OR REPLACE FUNCTION public.notify_new_incomplete_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.admin_notifications (type, reference_id, customer_name, amount, title, message, url)
  values (
    'incomplete_order', new.id, new.customer_name, coalesce(new.total, 0),
    'New incomplete order',
    coalesce(new.customer_name, 'Customer') || ' · ' || coalesce(new.phone, ''),
    '/admin/incomplete-orders'
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.notify_new_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.admin_notifications (type, reference_id, customer_name, amount, title, message, url)
  values (
    'order', new.id, new.customer_name, coalesce(new.total, 0),
    'New order received',
    coalesce(new.order_number, '') || ' · ' || coalesce(new.customer_name, 'Customer'),
    '/admin/orders'
  );
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.orders_payment_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
    -- Stamp paid_at on first entry to 'paid', keep historical timestamp afterward.
    IF NEW.payment_status = 'paid' AND OLD.payment_status <> 'paid' AND NEW.paid_at IS NULL THEN
      NEW.paid_at := now();
    END IF;

    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (
      NEW.id, auth.uid(), 'payment_status_changed',
      jsonb_build_object('payment_status', OLD.payment_status),
      jsonb_build_object('payment_status', NEW.payment_status, 'paid_at', NEW.paid_at)
    );
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.orders_soft_delete_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (NEW.id, auth.uid(), 'order_deleted', NULL,
      jsonb_build_object('order_number', NEW.order_number, 'deleted_at', NEW.deleted_at));
  ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (NEW.id, auth.uid(), 'order_restored', NULL, jsonb_build_object('order_number', NEW.order_number));
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.orders_status_transition()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _pid uuid;
  _vid uuid;
  _qty integer;
  _name text;
BEGIN
  IF NEW.order_status IS DISTINCT FROM OLD.order_status THEN
    INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
    VALUES (
      NEW.id, auth.uid(), 'order_status_changed',
      jsonb_build_object('order_status', OLD.order_status),
      jsonb_build_object('order_status', NEW.order_status)
    );

    IF NEW.order_status = 'cancelled' AND OLD.order_status <> 'cancelled' AND NEW.restocked_at IS NULL THEN
      IF NEW.items IS NOT NULL AND jsonb_typeof(NEW.items) = 'array' THEN
        FOR _item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
          -- Restock BOTH purchased and free-gift items (we deducted both on order placement).
          BEGIN _pid := NULLIF(_item->>'product_id','')::uuid;
          EXCEPTION WHEN others THEN _pid := NULL; END;
          IF _pid IS NULL THEN
            BEGIN _pid := NULLIF(_item->>'id','')::uuid;
            EXCEPTION WHEN others THEN _pid := NULL; END;
          END IF;
          IF _pid IS NULL THEN CONTINUE; END IF;

          BEGIN _vid := NULLIF(_item->>'variant_id','')::uuid;
          EXCEPTION WHEN others THEN _vid := NULL; END;

          _qty := COALESCE(NULLIF(_item->>'quantity','')::integer, 1);
          _name := COALESCE(_item->>'name','item');
          IF _qty <= 0 THEN CONTINUE; END IF;

          BEGIN
            INSERT INTO public.inventory_transactions (order_id, product_id, variant_id, quantity_delta, reason)
            VALUES (NEW.id, _pid, _vid, _qty, 'cancel_restock');
          EXCEPTION WHEN unique_violation THEN
            CONTINUE;
          END;

          -- Restock the exact variant when one is known, otherwise the product.
          IF _vid IS NOT NULL THEN
            UPDATE public.product_variants SET stock = COALESCE(stock,0) + _qty WHERE id = _vid;
          ELSE
            UPDATE public.products SET stock = COALESCE(stock,0) + _qty WHERE id = _pid;
          END IF;

          INSERT INTO public.order_audit_log (order_id, admin_id, action, previous_value, new_value)
          VALUES (NEW.id, auth.uid(), 'inventory_restored', NULL,
            jsonb_build_object('product_id', _pid, 'variant_id', _vid, 'quantity', _qty, 'name', _name,
                               'is_free_gift', COALESCE((_item->>'is_free_gift')::boolean, false)));
        END LOOP;
      END IF;
      NEW.restocked_at := now();
    END IF;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.prune_admin_notifications()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare _deleted integer := 0; _n integer;
begin
  delete from public.admin_notifications
   where admin_seen = true and created_at < now() - interval '7 days';
  get diagnostics _n = row_count; _deleted := _deleted + _n;

  delete from public.admin_notifications
   where created_at < now() - interval '30 days';
  get diagnostics _n = row_count; _deleted := _deleted + _n;

  return _deleted;
end $function$
;

CREATE OR REPLACE FUNCTION public.prune_capi_event_logs()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  DELETE FROM public.capi_event_logs
  WHERE created_at < now() - interval '30 days'
    AND id NOT IN (SELECT id FROM public.capi_event_logs ORDER BY created_at DESC LIMIT 5000);
$function$
;

CREATE OR REPLACE FUNCTION public.r2_claim_queue_batch(_limit integer DEFAULT 50)
 RETURNS TABLE(id bigint, ref text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT q.id
    FROM public.r2_deletion_queue q
    WHERE q.processed_at IS NULL
      AND q.queued_at < now() - interval '2 minutes'   -- restore grace window
      AND (q.claimed_at IS NULL OR q.claimed_at < now() - interval '5 minutes')
      AND q.attempts < 8
    ORDER BY q.queued_at ASC
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.r2_deletion_queue q
     SET claimed_at = now(),
         attempts   = q.attempts + 1
    FROM picked
   WHERE q.id = picked.id
  RETURNING q.id, q.ref;
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_coverage_audit()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_tables_with_refs text[] := ARRAY[]::text[];
  v_tables_with_trigger text[] := ARRAY[]::text[];
  v_has_refs boolean;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Tables that currently have the cleanup trigger attached.
  SELECT COALESCE(array_agg(DISTINCT c.relname), ARRAY[]::text[])
    INTO v_tables_with_trigger
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND t.tgname = 'trg_r2_cleanup'
     AND NOT t.tgisinternal;

  -- Walk every public table and check whether any row contains r2:/r2o: text.
  FOR r IN
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_type   = 'BASE TABLE'
       AND table_name NOT IN ('r2_deletion_queue','media_audit_log')
  LOOP
    BEGIN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE row_to_json(%I.*)::text ~ ''r2o?:[A-Za-z0-9_./-]+'' LIMIT 1)',
        r.table_name, r.table_name
      ) INTO v_has_refs;
      IF v_has_refs THEN
        v_tables_with_refs := v_tables_with_refs || r.table_name;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- ignore inaccessible tables
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'tables_with_refs', v_tables_with_refs,
    'tables_with_trigger', v_tables_with_trigger,
    'uncovered', (
      SELECT COALESCE(array_agg(t), ARRAY[]::text[])
        FROM unnest(v_tables_with_refs) t
       WHERE t <> ALL(v_tables_with_trigger)
    )
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_enqueue_refs(_refs text[], _source text DEFAULT NULL::text, _source_id text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ref text;
  v_count int := 0;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _refs IS NULL THEN RETURN 0; END IF;
  FOREACH v_ref IN ARRAY _refs LOOP
    IF v_ref ~ '^r2o?:[A-Za-z0-9_./-]+$' THEN
      INSERT INTO public.r2_deletion_queue(ref, source_table, source_id)
      VALUES (v_ref, _source, _source_id);
      v_count := v_count + 1;
    END IF;
  END LOOP;
  RETURN v_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_mark_failed(_id bigint, _err text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.r2_deletion_queue
     SET last_error = _err,
         claimed_at = NULL
   WHERE id = _id;
$function$
;

CREATE OR REPLACE FUNCTION public.r2_mark_processed(_ids bigint[])
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  UPDATE public.r2_deletion_queue
     SET processed_at = now(), last_error = NULL
   WHERE id = ANY(_ids);
$function$
;

CREATE OR REPLACE FUNCTION public.r2_orphan_sweep_record(_scanned integer, _orphans_found integer, _orphans_queued integer, _grace_hours integer DEFAULT 24, _error text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id bigint;
BEGIN
  INSERT INTO public.r2_orphan_sweep_runs
    (finished_at, scanned, orphans_found, orphans_queued, grace_hours, error)
  VALUES
    (now(), COALESCE(_scanned, 0), COALESCE(_orphans_found, 0),
     COALESCE(_orphans_queued, 0), COALESCE(_grace_hours, 24), _error)
  RETURNING id INTO v_id;
  RETURN v_id;
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_orphan_sweep_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_last jsonb;
  v_queued_orphans int;
  v_total_runs int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT to_jsonb(r) INTO v_last
    FROM (
      SELECT id, started_at, finished_at, scanned, orphans_found,
             orphans_queued, grace_hours, error
        FROM public.r2_orphan_sweep_runs
       ORDER BY started_at DESC
       LIMIT 1
    ) r;

  SELECT count(*) INTO v_queued_orphans
    FROM public.r2_deletion_queue
   WHERE source_table = 'orphan_sweep'
     AND processed_at IS NULL
     AND attempts < 8;

  SELECT count(*) INTO v_total_runs FROM public.r2_orphan_sweep_runs;

  RETURN jsonb_build_object(
    'last_run', v_last,
    'queued_orphans', COALESCE(v_queued_orphans, 0),
    'total_runs', COALESCE(v_total_runs, 0)
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_prune_processed(_older_than interval DEFAULT '7 days'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.r2_deletion_queue
   WHERE processed_at IS NOT NULL
     AND processed_at < now() - _older_than;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_queue_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'total',           count(*),
    'pending',         count(*) FILTER (WHERE processed_at IS NULL AND attempts < 8),
    'in_grace',        count(*) FILTER (WHERE processed_at IS NULL AND queued_at >= now() - interval '2 minutes'),
    'processed',       count(*) FILTER (WHERE processed_at IS NOT NULL),
    'failed',          count(*) FILTER (WHERE processed_at IS NULL AND attempts >= 8),
    'retrying',        count(*) FILTER (WHERE processed_at IS NULL AND attempts BETWEEN 1 AND 7),
    'oldest_pending',  (SELECT min(queued_at) FROM public.r2_deletion_queue WHERE processed_at IS NULL AND attempts < 8),
    'processed_24h',   count(*) FILTER (WHERE processed_at >= now() - interval '24 hours'),
    'queued_24h',      count(*) FILTER (WHERE queued_at >= now() - interval '24 hours')
  )
  INTO v_result
  FROM public.r2_deletion_queue;

  RETURN COALESCE(v_result, '{}'::jsonb);
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_ref_in_use(_ref text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tbl text;
  v_found boolean;
  v_tables text[] := ARRAY[
    'products','product_media','product_variants',
    'categories','brands','tags',
    'hero_slides','hero_settings','offers','featured_categories',
    'testimonials','video_testimonials','floating_icons',
    'site_reviews','site_review_media','review_hero_settings',
    'announcement_bar','homepage_sections',
    'contact_settings','invoice_settings',
    'why_choose_us_cards','about_sections',
    'design_settings','shop_settings','footer_settings',
    'direct_order_channels'
  ];
BEGIN
  IF _ref IS NULL OR _ref = '' THEN RETURN false; END IF;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_tbl
    ) THEN
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE position(%L IN row_to_json(%I.*)::text) > 0)',
        v_tbl, _ref, v_tbl
      ) INTO v_found;
      IF v_found THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_refs_in_use(_refs text[])
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tbl text;
  v_found text[];
  v_used text[] := ARRAY[]::text[];
  v_tables text[] := ARRAY[
    'products','product_media','product_variants',
    'categories','brands','tags',
    'hero_slides','hero_settings','offers','featured_categories',
    'testimonials','video_testimonials','floating_icons',
    'site_reviews','site_review_media','review_hero_settings',
    'announcement_bar','homepage_sections',
    'contact_settings','invoice_settings',
    'why_choose_us_cards','about_sections',
    'design_settings','shop_settings','footer_settings',
    'direct_order_channels'
  ];
BEGIN
  IF _refs IS NULL OR array_length(_refs, 1) IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  FOREACH v_tbl IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_tbl
    ) THEN
      BEGIN
        EXECUTE format(
          'SELECT COALESCE(array_agg(DISTINCT m[1]), ARRAY[]::text[])
             FROM (SELECT row_to_json(t.*)::text AS body FROM public.%I t) s,
                  LATERAL regexp_matches(s.body, ''(r2o?:[A-Za-z0-9_./-]+)'', ''g'') m
            WHERE m[1] = ANY($1)',
          v_tbl
        ) INTO v_found USING _refs;
        IF v_found IS NOT NULL AND array_length(v_found, 1) > 0 THEN
          v_used := v_used || v_found;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- ignore tables that can't be scanned
        NULL;
      END;
    END IF;
  END LOOP;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::text[])
    INTO v_used
    FROM unnest(v_used) x;
  RETURN v_used;
END $function$
;

CREATE OR REPLACE FUNCTION public.r2_retry_failed(_ids bigint[] DEFAULT NULL::bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.r2_deletion_queue
     SET attempts   = 0,
         claimed_at = NULL,
         last_error = NULL
   WHERE processed_at IS NULL
     AND (_ids IS NULL OR id = ANY(_ids));

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.refresh_intelligence_aggregates(_days integer DEFAULT 7)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _from DATE := (CURRENT_DATE - GREATEST(_days,1));
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) AND auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- daily_aggregates from orders + events
  INSERT INTO public.daily_aggregates AS d (day, visitors, sessions, pageviews, product_views, add_to_carts, checkouts, purchases, delivered, revenue, delivered_revenue, new_customers, repeat_customers, updated_at)
  SELECT
    g::date AS day,
    COALESCE((SELECT COUNT(DISTINCT visitor_id) FROM public.sessions WHERE started_at::date = g::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.sessions WHERE started_at::date = g::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.analytics_events WHERE event_name='page_view' AND created_at::date = g::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.analytics_events WHERE event_name='view_item' AND created_at::date = g::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.analytics_events WHERE event_name='add_to_cart' AND created_at::date = g::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.analytics_events WHERE event_name='begin_checkout' AND created_at::date = g::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.orders WHERE created_at::date = g::date), 0),
    COALESCE((SELECT COUNT(*) FROM public.orders WHERE created_at::date = g::date AND order_status='delivered'), 0),
    COALESCE((SELECT SUM(total) FROM public.orders WHERE created_at::date = g::date), 0),
    COALESCE((SELECT SUM(total) FROM public.orders WHERE created_at::date = g::date AND order_status='delivered'), 0),
    0, 0,
    now()
  FROM generate_series(_from, CURRENT_DATE, interval '1 day') g
  ON CONFLICT (day) DO UPDATE SET
    visitors = EXCLUDED.visitors,
    sessions = EXCLUDED.sessions,
    pageviews = EXCLUDED.pageviews,
    product_views = EXCLUDED.product_views,
    add_to_carts = EXCLUDED.add_to_carts,
    checkouts = EXCLUDED.checkouts,
    purchases = EXCLUDED.purchases,
    delivered = EXCLUDED.delivered,
    revenue = EXCLUDED.revenue,
    delivered_revenue = EXCLUDED.delivered_revenue,
    updated_at = now();

  -- product_analytics from events + orders
  INSERT INTO public.product_analytics (product_id, day, views, add_to_cart, checkout_starts, purchases, delivered, returned, revenue, delivered_revenue)
  SELECT
    e.product_id, e.created_at::date,
    COUNT(*) FILTER (WHERE e.event_name='view_item'),
    COUNT(*) FILTER (WHERE e.event_name='add_to_cart'),
    COUNT(*) FILTER (WHERE e.event_name='begin_checkout'),
    0,0,0,0,0
  FROM public.analytics_events e
  WHERE e.product_id IS NOT NULL AND e.created_at::date >= _from
  GROUP BY e.product_id, e.created_at::date
  ON CONFLICT (product_id, day) DO UPDATE SET
    views = EXCLUDED.views,
    add_to_cart = EXCLUDED.add_to_cart,
    checkout_starts = EXCLUDED.checkout_starts;
END $function$
;

CREATE OR REPLACE FUNCTION public.replace_product_media_and_tags(_product_id uuid, _images jsonb DEFAULT '[]'::jsonb, _tag_ids uuid[] DEFAULT ARRAY[]::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _img_count int := 0;
  _tag_count int := 0;
  _img text;
  _idx int := 0;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _product_id IS NULL THEN
    RAISE EXCEPTION 'product_id required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  -- product-level images only (preserve variant images)
  DELETE FROM public.product_media
   WHERE product_id = _product_id AND variant_id IS NULL;

  IF _images IS NOT NULL AND jsonb_typeof(_images) = 'array' THEN
    FOR _img IN SELECT jsonb_array_elements_text(_images) LOOP
      IF _img IS NOT NULL AND length(trim(_img)) > 0 THEN
        INSERT INTO public.product_media (product_id, image_url, sort_order, type)
        VALUES (_product_id, _img, _idx, 'image');
        _idx := _idx + 1;
        _img_count := _img_count + 1;
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.product_tags WHERE product_id = _product_id;
  IF _tag_ids IS NOT NULL AND array_length(_tag_ids, 1) > 0 THEN
    INSERT INTO public.product_tags (product_id, tag_id)
    SELECT _product_id, t FROM unnest(_tag_ids) AS t
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _tag_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', _product_id,
    'images_written', _img_count,
    'tags_written', _tag_count
  );
END $function$
;

CREATE OR REPLACE FUNCTION public.reverse_customer_order(_email text, _order_total numeric)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NULLIF(_email, '') IS NULL THEN RETURN; END IF;
  UPDATE public.customers
     SET total_orders = GREATEST(0, COALESCE(total_orders, 0) - 1),
         total_spent  = GREATEST(0, COALESCE(total_spent, 0) - COALESCE(_order_total, 0)),
         updated_at = now()
   WHERE email = _email;
END $function$
;

CREATE OR REPLACE FUNCTION public.schedule_reminders_for_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _pid uuid;
  _vid uuid;
  _prod record;
  _var record;
  _eff_days integer;
  _eff_notes text;
  _variant_explicitly_disabled boolean;
  _digits text;
  _cust_id uuid;
  _cust_total int;
  _priority public.reminder_priority;
  _due date;
  _line_amount numeric;
  _qty numeric;
  _seen uuid[] := ARRAY[]::uuid[];
  _dnr_product boolean := false;
  _src text;
BEGIN
  _digits := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
  IF _digits = '' THEN RETURN NEW; END IF;

  -- Prefer the explicit is_pos column; fall back to notes-based detection for safety.
  _src := CASE
    WHEN COALESCE(NEW.is_pos, false) THEN 'pos'
    WHEN COALESCE(NEW.notes, '') ILIKE '%Reorder from reminder%' THEN 'manual_crm'
    WHEN COALESCE(NEW.notes, '') ILIKE '%POS%' THEN 'pos'
    ELSE 'website'
  END;

  SELECT id, total_orders INTO _cust_id, _cust_total
    FROM public.customers
   WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = _digits
   LIMIT 1;

  _cust_total := COALESCE(_cust_total, 0) + 1;
  _priority := CASE
    WHEN _cust_total >= 3 THEN 'high'::public.reminder_priority
    WHEN _cust_total = 2 THEN 'medium'::public.reminder_priority
    ELSE 'low'::public.reminder_priority
  END;

  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN RETURN NEW; END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
    BEGIN _pid := NULLIF(_item->>'product_id','')::uuid;
    EXCEPTION WHEN others THEN _pid := NULL; END;
    IF _pid IS NULL THEN
      BEGIN _pid := NULLIF(_item->>'id','')::uuid; EXCEPTION WHEN others THEN _pid := NULL; END;
    END IF;
    IF _pid IS NULL THEN CONTINUE; END IF;
    IF _pid = ANY(_seen) THEN CONTINUE; END IF;
    _seen := _seen || _pid;

    BEGIN _vid := NULLIF(_item->>'variant_id','')::uuid;
    EXCEPTION WHEN others THEN _vid := NULL; END;

    SELECT EXISTS (
      SELECT 1 FROM public.product_reminders
       WHERE customer_phone = _digits
         AND product_id = _pid
         AND status = 'do_not_remind'
    ) INTO _dnr_product;
    IF _dnr_product THEN CONTINUE; END IF;

    _qty := COALESCE(NULLIF(_item->>'quantity','')::numeric, 1);
    _line_amount := COALESCE(NULLIF(_item->>'price','')::numeric, 0) * _qty;

    UPDATE public.product_reminders
       SET status = 'purchased_again',
           reorder_order_id = NEW.id,
           reorder_amount = _line_amount,
           conversion_source = COALESCE(conversion_source, _src),
           resolved_at = now(),
           completed_at = now(),
           last_contacted_at = COALESCE(last_contacted_at, now()),
           notes_timeline = COALESCE(notes_timeline, '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object(
               'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
               'action', 'Converted via order #' || COALESCE(NEW.order_number, NEW.id::text),
               'status', 'purchased_again',
               'note', NULL
             )
           )
     WHERE customer_phone = _digits
       AND product_id = _pid
       AND status IN ('pending','called','follow_up','no_response','interested');

    SELECT id, name, reminder_enabled, reminder_days, reminder_notes
      INTO _prod FROM public.products WHERE id = _pid;
    IF NOT FOUND THEN CONTINUE; END IF;

    _eff_days := NULL;
    _eff_notes := NULL;
    _variant_explicitly_disabled := false;

    IF _vid IS NOT NULL THEN
      SELECT reminder_days, reminder_notes
        INTO _var
        FROM public.product_variants
       WHERE id = _vid AND product_id = _pid;
      IF FOUND THEN
        IF _var.reminder_days IS NOT NULL AND _var.reminder_days = 0 THEN
          _variant_explicitly_disabled := true;
        ELSIF COALESCE(_var.reminder_days, 0) > 0 THEN
          _eff_days := _var.reminder_days;
          _eff_notes := COALESCE(_var.reminder_notes, _prod.reminder_notes);
        END IF;
      END IF;
    END IF;

    IF _variant_explicitly_disabled THEN
      CONTINUE;
    END IF;

    IF _eff_days IS NULL THEN
      IF NOT COALESCE(_prod.reminder_enabled, false) OR COALESCE(_prod.reminder_days, 0) <= 0 THEN
        CONTINUE;
      END IF;
      _eff_days := _prod.reminder_days;
      _eff_notes := _prod.reminder_notes;
    END IF;

    _due := (NEW.created_at::date + _eff_days);

    INSERT INTO public.product_reminders (
      product_id, product_name_snapshot, order_id, order_number,
      customer_id, customer_phone, customer_name, customer_email,
      reminder_days, purchase_date, due_date, status, priority, notes
    ) VALUES (
      _prod.id, _prod.name, NEW.id, NEW.order_number,
      _cust_id, _digits, NEW.customer_name, NEW.customer_email,
      _eff_days, NEW.created_at, _due, 'pending', _priority, _eff_notes
    )
    ON CONFLICT DO NOTHING;
  END LOOP;

  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.set_meta_logging_paused(_paused boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.subscribe_newsletter(_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.newsletter_subscribers (email) values (lower(trim(_email)))
  on conflict (email) do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.sync_product_pricing()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if NEW.base_price is null or NEW.base_price = 0 then NEW.base_price := coalesce(NEW.price, 0); end if;
  NEW.price := NEW.base_price;
  NEW.sale_price := NEW.compare_price;
  return NEW;
end $function$
;

CREATE OR REPLACE FUNCTION public.tg_r2_cleanup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old text;
  v_new text;
  v_ref text;
  v_id  text;
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    v_old := row_to_json(OLD)::text;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    v_new := row_to_json(NEW)::text;
  END IF;

  IF v_old IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_id := COALESCE(
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'id')
         ELSE (to_jsonb(NEW)->>'id')
    END, '');

  FOR v_ref IN
    SELECT DISTINCT mm[1]
    FROM regexp_matches(v_old, '(r2o?:[A-Za-z0-9_./-]+)', 'g') AS mm
  LOOP
    IF v_new IS NULL OR position(v_ref IN v_new) = 0 THEN
      INSERT INTO public.r2_deletion_queue(ref, source_table, source_id)
      VALUES (v_ref, TG_TABLE_NAME, v_id);
    END IF;
  END LOOP;

  RETURN COALESCE(NEW, OLD);
END $function$
;

CREATE OR REPLACE FUNCTION public.track_order(_order_number text)
 RETURNS TABLE(order_number text, order_status text, payment_status text, payment_method text, total numeric, subtotal numeric, shipping_cost numeric, discount_amount numeric, items jsonb, tracking_number text, delivery_partner text, customer_name text, customer_city text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select order_number, order_status, payment_status, payment_method,
         total, subtotal, shipping_cost, discount_amount, items,
         tracking_number, delivery_partner, customer_name, customer_city,
         created_at, updated_at
  from public.orders where order_number = _order_number limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.track_orders_by_phone(_phone text)
 RETURNS TABLE(order_number text, order_status text, payment_status text, payment_method text, total numeric, subtotal numeric, shipping_cost numeric, discount_amount numeric, items jsonb, tracking_number text, delivery_partner text, customer_name text, customer_city text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select order_number, order_status, payment_status, payment_method,
         total, subtotal, shipping_cost, discount_amount, items,
         tracking_number, delivery_partner, customer_name, customer_city,
         created_at, updated_at
  from public.orders where customer_phone = _phone
  order by created_at desc limit 20;
$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin new.updated_at = now(); return new; end $function$
;

CREATE OR REPLACE FUNCTION public.upsert_checkout_customer(_name text, _email text DEFAULT NULL::text, _phone text DEFAULT ''::text, _order_total numeric DEFAULT 0, _address text DEFAULT NULL::text, _city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare existing_id uuid;
begin
  select id into existing_id from public.customers
   where (nullif(_phone,'') is not null and phone = _phone)
      or (nullif(_email,'') is not null and email = _email)
   limit 1;
  if existing_id is null then
    insert into public.customers (name, email, phone, address, city, total_orders, total_spent)
    values (_name, _email, coalesce(_phone,''), _address, _city, 1, coalesce(_order_total,0));
  else
    update public.customers set
      name = coalesce(nullif(_name,''), name),
      email = coalesce(nullif(_email,''), email),
      address = coalesce(nullif(_address,''), address),
      city = coalesce(nullif(_city,''), city),
      total_orders = total_orders + 1,
      total_spent = total_spent + coalesce(_order_total,0),
      updated_at = now()
    where id = existing_id;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.upsert_incomplete_order(_session_id text, _phone text, _customer_name text DEFAULT NULL::text, _email text DEFAULT NULL::text, _address jsonb DEFAULT '{}'::jsonb, _cart_items jsonb DEFAULT '[]'::jsonb, _subtotal numeric DEFAULT 0, _delivery_charge numeric DEFAULT 0, _total numeric DEFAULT 0, _coupon text DEFAULT NULL::text, _payment_method text DEFAULT NULL::text, _checkout_step text DEFAULT 'started'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _id uuid;
  _digits text := regexp_replace(coalesce(_phone, ''), '\D', '', 'g');
begin
  if _digits !~ '^01[0-9]{9}$' then return null; end if;
  if _cart_items is null or jsonb_typeof(_cart_items) <> 'array' or jsonb_array_length(_cart_items) = 0 then
    return null;
  end if;
  if coalesce(trim(_session_id), '') = '' then return null; end if;

  insert into public.incomplete_orders (
    session_id, phone, customer_name, email, address, cart_items,
    subtotal, delivery_charge, total, coupon, payment_method,
    checkout_step, last_activity
  ) values (
    _session_id, _digits, _customer_name, _email, _address, _cart_items,
    _subtotal, _delivery_charge, _total, _coupon, _payment_method,
    coalesce(_checkout_step, 'started'), now()
  )
  on conflict (session_id, phone) do update set
    customer_name    = coalesce(nullif(excluded.customer_name, ''), public.incomplete_orders.customer_name),
    email            = coalesce(nullif(excluded.email, ''), public.incomplete_orders.email),
    address          = excluded.address,
    cart_items       = excluded.cart_items,
    subtotal         = excluded.subtotal,
    delivery_charge  = excluded.delivery_charge,
    total            = excluded.total,
    coupon           = excluded.coupon,
    payment_method   = excluded.payment_method,
    checkout_step    = excluded.checkout_step,
    last_activity    = now()
  where public.incomplete_orders.recovered = false
  returning id into _id;

  return _id;
end $function$
;

CREATE OR REPLACE FUNCTION public.validate_announcement_bar_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    RAISE EXCEPTION 'id is required';
  END IF;
  IF NEW.direction NOT IN ('left', 'right') THEN
    RAISE EXCEPTION 'direction must be left or right';
  END IF;
  IF NEW.speed IS NULL OR NEW.speed < 0 OR NEW.speed > 10 THEN
    RAISE EXCEPTION 'speed must be between 0 and 10';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.validate_coupon(_code text, _cart_total numeric DEFAULT 0)
 RETURNS TABLE(valid boolean, error text, code text, discount_type text, discount_value numeric, min_order_amount numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
END $function$
;


-- Views
CREATE OR REPLACE VIEW public.crm_customers AS 
 SELECT regexp_replace(customer_phone, '\D'::text, ''::text, 'g'::text) AS phone,
    (array_agg(customer_name ORDER BY created_at DESC) FILTER (WHERE ((customer_name IS NOT NULL) AND (customer_name <> ''::text))))[1] AS latest_name,
    ARRAY( SELECT DISTINCT n.n
           FROM unnest(array_agg(o.customer_name)) n(n)
          WHERE ((n.n IS NOT NULL) AND (n.n <> ''::text))) AS aliases,
    (array_agg(customer_email ORDER BY created_at DESC) FILTER (WHERE ((customer_email IS NOT NULL) AND (customer_email <> ''::text))))[1] AS email,
    min(created_at) AS first_order_at,
    max(created_at) AS last_order_at,
    (count(*))::integer AS total_orders,
    COALESCE(sum(total), (0)::numeric) AS lifetime_value,
    COALESCE(sum(total) FILTER (WHERE (order_status = 'delivered'::text)), (0)::numeric) AS delivered_value
   FROM orders o
  WHERE (regexp_replace(COALESCE(customer_phone, ''::text), '\D'::text, ''::text, 'g'::text) <> ''::text)
  GROUP BY (regexp_replace(customer_phone, '\D'::text, ''::text, 'g'::text));

CREATE OR REPLACE VIEW public.mv_dashboard_metrics AS 
 WITH base AS (
         SELECT COALESCE(o.total, (0)::numeric) AS total,
            o.order_status,
            o.payment_status,
            o.created_at,
            o.paid_at
           FROM orders o
          WHERE (o.deleted_at IS NULL)
        ), rev AS (
         SELECT base.total,
            COALESCE(base.paid_at, base.created_at) AS rev_at
           FROM base
          WHERE ((base.order_status = 'delivered'::text) AND (base.payment_status = 'paid'::text))
        ), agg AS (
         SELECT count(*) FILTER (WHERE ((base.created_at)::date = CURRENT_DATE)) AS orders_today,
            count(*) FILTER (WHERE (base.created_at >= (now() - '7 days'::interval))) AS orders_7d,
            count(*) FILTER (WHERE (base.created_at >= (now() - '30 days'::interval))) AS orders_30d,
            count(*) AS orders_total,
            count(*) FILTER (WHERE (base.order_status = 'pending'::text)) AS pending_count,
            count(*) FILTER (WHERE (base.order_status = 'processing'::text)) AS processing_count,
            count(*) FILTER (WHERE (base.order_status = 'shipped'::text)) AS shipped_count,
            count(*) FILTER (WHERE (base.order_status = 'delivered'::text)) AS delivered_count,
            count(*) FILTER (WHERE (base.order_status = 'cancelled'::text)) AS cancelled_count
           FROM base
        ), rev_agg AS (
         SELECT COALESCE(sum(rev.total) FILTER (WHERE ((rev.rev_at)::date = CURRENT_DATE)), (0)::numeric) AS revenue_today,
            COALESCE(sum(rev.total) FILTER (WHERE (rev.rev_at >= (now() - '7 days'::interval))), (0)::numeric) AS revenue_7d,
            COALESCE(sum(rev.total) FILTER (WHERE (rev.rev_at >= (now() - '30 days'::interval))), (0)::numeric) AS revenue_30d,
            COALESCE(sum(rev.total), (0)::numeric) AS revenue_total
           FROM rev
        ), stock AS (
         SELECT count(*) FILTER (WHERE ((p.stock <= 5) AND (p.stock > 0))) AS low_stock_count,
            count(*) FILTER (WHERE (p.stock = 0)) AS out_of_stock_count,
            count(*) AS products_total
           FROM products p
        ), custs AS (
         SELECT count(*) AS customers_total
           FROM customers
        ), incomp AS (
         SELECT count(*) AS incomplete_orders_count
           FROM incomplete_orders
          WHERE (incomplete_orders.recovered = false)
        )
 SELECT 1 AS id,
    agg.orders_today,
    agg.orders_7d,
    agg.orders_30d,
    agg.orders_total,
    rev_agg.revenue_today,
    rev_agg.revenue_7d,
    rev_agg.revenue_30d,
    rev_agg.revenue_total,
    agg.pending_count,
    agg.processing_count,
    agg.shipped_count,
    agg.delivered_count,
    agg.cancelled_count,
    stock.low_stock_count,
    stock.out_of_stock_count,
    stock.products_total,
    custs.customers_total,
    incomp.incomplete_orders_count,
    now() AS refreshed_at
   FROM agg,
    rev_agg,
    stock,
    custs,
    incomp;

CREATE OR REPLACE VIEW public.mv_orders_daily_90d AS 
 SELECT ((COALESCE(paid_at, created_at) AT TIME ZONE 'UTC'::text))::date AS day,
    (count(*))::integer AS orders,
    COALESCE(sum(total), (0)::numeric) AS revenue
   FROM orders
  WHERE ((deleted_at IS NULL) AND (order_status = 'delivered'::text) AND (payment_status = 'paid'::text) AND (COALESCE(paid_at, created_at) >= (now() - '90 days'::interval)))
  GROUP BY (((COALESCE(paid_at, created_at) AT TIME ZONE 'UTC'::text))::date)
  ORDER BY (((COALESCE(paid_at, created_at) AT TIME ZONE 'UTC'::text))::date);

CREATE OR REPLACE VIEW public.mv_top_products_30d AS 
 SELECT ((item.value ->> 'id'::text))::uuid AS product_id,
    min((item.value ->> 'name'::text)) AS product_name,
    sum(COALESCE(((item.value ->> 'quantity'::text))::integer, 1)) AS units_sold,
    sum(((COALESCE(((item.value ->> 'quantity'::text))::integer, 1))::numeric * COALESCE(((item.value ->> 'price'::text))::numeric, (0)::numeric))) AS revenue
   FROM (orders o
     CROSS JOIN LATERAL jsonb_array_elements(o.items) item(value))
  WHERE ((o.deleted_at IS NULL) AND (o.order_status = 'delivered'::text) AND (o.payment_status = 'paid'::text) AND (COALESCE(o.paid_at, o.created_at) >= (now() - '30 days'::interval)) AND ((item.value ->> 'id'::text) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'::text))
  GROUP BY ((item.value ->> 'id'::text))::uuid
  ORDER BY (sum(COALESCE(((item.value ->> 'quantity'::text))::integer, 1))) DESC
 LIMIT 20;

CREATE OR REPLACE VIEW public.products_with_hierarchy AS 
 WITH cat AS (
         SELECT c.id,
            c.level,
            c.path,
            c.parent_id,
            ( SELECT categories.parent_id
                   FROM categories
                  WHERE (categories.id = c.parent_id)) AS grandparent_id
           FROM categories c
        )
 SELECT p.id,
    p.name,
    p.slug,
    p.short_description,
    p.description,
    p.sku,
    p.category_id,
    p.brand_id,
    p.price,
    p.sale_price,
    p.stock,
    p.rating,
    p.review_count,
    p.featured,
    p.best_seller,
    p.show_offers,
    p.show_shipping_info,
    p.show_stock_status,
    p.show_shipping_text,
    p.shipping_text,
    p.stock_status_text,
    p.sort_order,
    p.created_at,
    p.updated_at,
    p.base_price,
    p.compare_price,
    p.status,
    p.is_new_arrival,
    p.category_id AS leaf_category_id,
        CASE cat.level
            WHEN 3 THEN cat.grandparent_id
            WHEN 2 THEN cat.parent_id
            ELSE cat.id
        END AS main_category_id,
        CASE cat.level
            WHEN 3 THEN cat.parent_id
            WHEN 2 THEN cat.id
            ELSE NULL::uuid
        END AS sub_category_id,
        CASE cat.level
            WHEN 3 THEN cat.id
            ELSE NULL::uuid
        END AS child_category_id,
    cat.path AS category_path,
    cat.level AS category_level
   FROM (products p
     LEFT JOIN cat ON ((cat.id = p.category_id)));


-- =========================================================
-- SCHEMA HEALTH RPC (boot diagnostic)
-- =========================================================
CREATE OR REPLACE FUNCTION public.schema_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  required_tables    text[] := ARRAY[
    'about_sections','admin_notifications','announcement_bar','brands','categories',
    'contact_settings','coupons','customers','delivery_partners','delivery_zones',
    'design_settings','direct_order_channels','featured_categories','floating_icons',
    'footer_settings','hero_settings','hero_slides','home_faqs','homepage_sections',
    'incomplete_orders','invoice_settings','offers','orders','policies','products',
    'product_variants','product_media','product_details','product_faqs','product_reminders',
    'profiles','review_hero_settings','shop_settings','site_reviews','site_review_media',
    'tags','tracking_pixels','user_roles','video_testimonials','whatsapp_settings',
    'why_choose_us_cards'
  ];
  required_functions text[] := ARRAY[
    'has_role','is_admin_or_staff','validate_coupon','schema_health'
  ];
  missing_t text[];
  missing_f text[];
BEGIN
  SELECT COALESCE(array_agg(t), ARRAY[]::text[]) INTO missing_t
  FROM unnest(required_tables) t
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = t
  );

  SELECT COALESCE(array_agg(f), ARRAY[]::text[]) INTO missing_f
  FROM unnest(required_functions) f
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = f
  );

  RETURN jsonb_build_object(
    'missing_tables',    missing_t,
    'missing_functions', missing_f,
    'checked_at',        now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.schema_health() TO anon, authenticated, service_role;
