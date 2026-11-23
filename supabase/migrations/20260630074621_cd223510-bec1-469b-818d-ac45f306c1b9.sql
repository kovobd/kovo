
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

REVOKE EXECUTE ON FUNCTION public.schema_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.schema_health() TO anon, authenticated, service_role;
