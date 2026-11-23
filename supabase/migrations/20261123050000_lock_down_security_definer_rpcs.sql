-- Stop exposing internal SECURITY DEFINER functions as public REST RPC endpoints.
--
-- A. Backend-only helpers with NO internal permission check (R2 cleanup queue,
--    pruning, internal helper). They are only called by service-role edge
--    functions or from inside other SECURITY DEFINER functions, so nobody
--    needs EXECUTE through the API. Previously anyone (even logged-out) could
--    call e.g. r2_mark_processed / r2_claim_queue_batch.
-- B. Trigger functions are never meant to be called directly.
-- C. Admin RPCs that already check is_admin_or_staff()/has_role() internally,
--    plus ensure_cms_defaults(): keep for signed-in users, remove for anon.
--
-- Untouched on purpose: storefront RPCs used by logged-out customers
-- (checkout, order tracking, newsletter, pixels, coupons) and the role helpers
-- has_role()/is_admin_or_staff() that RLS policies rely on.

DO $$
DECLARE
  r record;
BEGIN
  -- A. backend-only helpers
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        '_media_column_exists', 'prune_admin_notifications', 'prune_capi_event_logs',
        'r2_claim_queue_batch', 'r2_mark_failed', 'r2_mark_processed',
        'r2_orphan_sweep_record', 'r2_ref_in_use', 'r2_refs_in_use'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- B. trigger functions
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- C. admin RPCs (internal role check stays) + ensure_cms_defaults
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname = ANY (ARRAY[
        'backfill_product_reminders', 'bulk_delete_incomplete', 'bulk_mark_incomplete_contacted',
        'bulk_update_sort_order', 'decrement_coupon_usage', 'find_media_usage',
        'get_admin_incomplete_order_counts', 'get_admin_incomplete_order_stats',
        'get_admin_incomplete_orders_page', 'get_admin_order_status_counts',
        'get_admin_orders_page', 'get_admin_reminder_metrics', 'get_admin_reminder_tab_counts',
        'get_admin_reminders_page', 'get_dashboard_full', 'get_dashboard_metrics',
        'get_reminder_attention_counts', 'increment_product_stock', 'increment_variant_stock',
        'mark_admin_notifications_seen', 'meta_capi_cleanup', 'meta_capi_metrics',
        'meta_capi_purge_all', 'meta_capi_search', 'meta_capi_timeseries',
        'r2_coverage_audit', 'r2_enqueue_refs', 'r2_expedite', 'r2_expedite_orphans',
        'r2_orphan_sweep_status', 'r2_prune_processed', 'r2_queue_stats', 'r2_retry_failed',
        'refresh_intelligence_aggregates', 'replace_product_media_and_tags',
        'reverse_customer_order', 'set_meta_logging_paused', 'unlink_media_references',
        'schema_health', 'ensure_cms_defaults'
      ])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END
$$;
