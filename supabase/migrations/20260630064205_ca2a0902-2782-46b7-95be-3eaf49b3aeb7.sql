
-- 1. Drop overly-public SELECT policies
DROP POLICY IF EXISTS "pub_view" ON public.contact_settings;
DROP POLICY IF EXISTS "pub_view" ON public.invoice_settings;
DROP POLICY IF EXISTS "pub_view" ON public.coupons;

-- 2. Safe public RPC for contact page (excludes internal receiving_email)
CREATE OR REPLACE FUNCTION public.get_public_contact_settings()
RETURNS TABLE(
  id text, page_title text, page_intro text, phone_number text,
  email_address text, show_address boolean, business_address text,
  phone_field_enabled boolean, submit_button_text text,
  social_section_enabled boolean, social_links jsonb,
  faq_shortcut_enabled boolean, faq_shortcut_items jsonb,
  map_enabled boolean, map_embed text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, page_title, page_intro, phone_number, email_address, show_address,
         business_address, phone_field_enabled, submit_button_text,
         social_section_enabled, social_links, faq_shortcut_enabled,
         faq_shortcut_items, map_enabled, map_embed
  FROM public.contact_settings WHERE id = 'default' LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_contact_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_contact_settings() TO anon, authenticated;

-- 3. Tighten always-true INSERT policies
DROP POLICY IF EXISTS "pub_insert" ON public.reviews;
CREATE POLICY "pub_insert" ON public.reviews
  FOR INSERT TO public
  WITH CHECK (
    COALESCE(length(trim(coalesce(comment,''))), 0) <= 5000
  );

DROP POLICY IF EXISTS "pub_create" ON public.orders;
CREATE POLICY "pub_create" ON public.orders
  FOR INSERT TO public
  WITH CHECK (
    customer_phone IS NOT NULL
    AND length(trim(customer_phone)) >= 10
    AND items IS NOT NULL
    AND jsonb_typeof(items) = 'array'
    AND jsonb_array_length(items) > 0
    AND COALESCE(total, 0) >= 0
    AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "pub_submit" ON public.contact_submissions;
CREATE POLICY "pub_submit" ON public.contact_submissions
  FOR INSERT TO public
  WITH CHECK (
    length(trim(coalesce(name,''))) BETWEEN 1 AND 200
    AND length(trim(coalesce(email,''))) BETWEEN 3 AND 320
    AND length(trim(coalesce(message,''))) BETWEEN 1 AND 5000
  );

-- 4. Lock down admin-only SECURITY DEFINER functions to authenticated only
DO $$
DECLARE
  fn text;
  admin_only_fns text[] := ARRAY[
    'bulk_delete_incomplete(uuid[])',
    'bulk_mark_incomplete_contacted(uuid[])',
    'bulk_update_sort_order(text,text[])',
    'find_media_usage(text)',
    'replace_product_media_and_tags(uuid,jsonb,uuid[])',
    'get_admin_incomplete_order_counts(text)',
    'get_admin_incomplete_order_stats()',
    'get_admin_incomplete_orders_page(integer,integer,text,text)',
    'get_admin_order_status_counts(text,text,timestamp with time zone,timestamp with time zone)',
    'get_admin_orders_page(integer,integer,text,text,text,timestamp with time zone,timestamp with time zone)',
    'get_dashboard_metrics()',
    'get_reminder_attention_counts()',
    'mark_admin_notifications_seen(text)',
    'prune_admin_notifications()',
    'refresh_intelligence_aggregates(integer)',
    'meta_capi_cleanup(integer)',
    'meta_capi_search(text,integer)',
    'set_meta_logging_paused(boolean)',
    'reverse_customer_order(text,numeric)',
    'increment_product_stock(uuid,integer)',
    'increment_variant_stock(uuid,integer)',
    'decrement_coupon_usage(text)',
    'backfill_product_reminders(integer)'
  ];
BEGIN
  FOREACH fn IN ARRAY admin_only_fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', fn);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

-- 5. Public-callable RPCs: explicit grants
DO $$
DECLARE
  fn text;
  public_fns text[] := ARRAY[
    'subscribe_newsletter(text)',
    'validate_coupon(text,numeric)',
    'track_order(text)',
    'track_orders_by_phone(text)',
    'get_public_tracking_pixels()',
    'get_clarity_project_id()',
    'get_order_for_purchase_tracking(text)',
    'log_browser_pixel_event(text,text,jsonb)',
    'mark_incomplete_order_recovered(text,text,uuid)',
    'upsert_checkout_customer(text,text,text,numeric,text,text)',
    'increment_coupon_usage(text)',
    'decrement_product_stock(uuid,integer)',
    'decrement_variant_stock(uuid,integer)',
    'get_public_contact_settings()'
  ];
BEGIN
  FOREACH fn IN ARRAY public_fns LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated, service_role', fn);
    EXCEPTION WHEN undefined_function THEN NULL;
    END;
  END LOOP;
END $$;

-- upsert_incomplete_order has 12 args — find and grant by exact signature
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('upsert_incomplete_order')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- 6. Ensure worker_cron_secret exists (used by cron and edge funcs)
INSERT INTO public.worker_secrets (name, secret)
SELECT 'worker_cron_secret', encode(gen_random_bytes(32), 'hex')
WHERE NOT EXISTS (SELECT 1 FROM public.worker_secrets WHERE name = 'worker_cron_secret');
