
CREATE OR REPLACE FUNCTION public.r2_ref_in_use(_ref text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
END $$;

GRANT EXECUTE ON FUNCTION public.r2_ref_in_use(text) TO service_role, authenticated;
