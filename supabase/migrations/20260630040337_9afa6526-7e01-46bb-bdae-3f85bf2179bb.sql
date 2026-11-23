-- C1 — Fix SECURITY DEFINER views by enabling security_invoker.
-- These are regular views (relkind='v'), not matviews.
ALTER VIEW IF EXISTS public.mv_dashboard_metrics  SET (security_invoker = true);
ALTER VIEW IF EXISTS public.mv_orders_daily_90d   SET (security_invoker = true);
ALTER VIEW IF EXISTS public.mv_top_products_30d   SET (security_invoker = true);

-- H3 — Restrict admin/maintenance SECURITY DEFINER RPCs (defense-in-depth).
DO $$
DECLARE
  fn record;
  admin_only text[] := ARRAY[
    'backfill_product_reminders','bulk_delete_incomplete','bulk_mark_incomplete_contacted',
    'bulk_update_sort_order','find_media_usage',
    'get_admin_incomplete_order_counts','get_admin_incomplete_order_stats',
    'get_admin_incomplete_orders_page','get_admin_order_status_counts',
    'get_admin_orders_page','get_admin_reminder_metrics','get_admin_reminder_tab_counts',
    'get_admin_reminders_page','get_dashboard_full','get_dashboard_metrics',
    'get_reminder_attention_counts','mark_admin_notifications_seen',
    'meta_capi_cleanup','meta_capi_metrics','meta_capi_purge_all','meta_capi_search','meta_capi_timeseries',
    'prune_admin_notifications','prune_capi_event_logs',
    'r2_claim_queue_batch','r2_coverage_audit','r2_enqueue_refs','r2_mark_failed',
    'r2_mark_processed','r2_prune_processed','r2_queue_stats','r2_ref_in_use','r2_retry_failed',
    'refresh_intelligence_aggregates','schedule_reminders_for_order',
    -- Pure trigger functions: no caller needs direct EXECUTE.
    'bump_product_updated_at','enforce_single_enabled_delivery_partner','handle_new_user',
    'notify_new_incomplete_order','notify_new_order',
    'orders_payment_status_transition','orders_soft_delete_audit','orders_status_transition',
    'tg_r2_cleanup'
  ];
BEGIN
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = ANY(admin_only)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC', fn.proname, fn.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon',   fn.proname, fn.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO service_role', fn.proname, fn.args);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%I(%s) TO authenticated', fn.proname, fn.args);
  END LOOP;
END $$;

-- C2 — Persist Kayafee logos in design_settings so any consumer that reads
-- the DB (invoice, layout fallbacks) gets the brand mark instead of NULL.
UPDATE public.design_settings
SET logo_desktop_url = COALESCE(logo_desktop_url, '/logo.png'),
    logo_mobile_url  = COALESCE(logo_mobile_url,  '/logo.png'),
    logo_footer_url  = COALESCE(logo_footer_url,  '/logo.png'),
    favicon_url      = COALESCE(favicon_url,      '/favicon.png');