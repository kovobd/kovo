-- Performance pass driven by the Supabase advisors.
--
-- 1. RLS: wrap auth.uid()/auth.role() in (select ...) so Postgres evaluates it
--    once per query (InitPlan) instead of once per row. Semantics are identical.
--    Idempotent: policies that already use "(select auth....)" are skipped.
-- 2. Drop duplicate indexes (identical definition; the kept index is unchanged).
-- 3. Add covering indexes for foreign keys that had none.

-- 1. RLS initplan ------------------------------------------------------------
DO $$
DECLARE
  p record;
  q text;
  w text;
  stmt text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'auth\.(uid|role)\(\)'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~* '\(\s*select\s+auth\.'
  LOOP
    q := regexp_replace(p.qual,       'auth\.(uid|role)\(\)', '(select auth.\1())', 'g');
    w := regexp_replace(p.with_check, 'auth\.(uid|role)\(\)', '(select auth.\1())', 'g');
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename)
         || coalesce(' USING (' || q || ')', '')
         || coalesce(' WITH CHECK (' || w || ')', '');
    EXECUTE stmt;
  END LOOP;
END
$$;

-- 2. Duplicate indexes -------------------------------------------------------
DROP INDEX IF EXISTS public.idx_incomplete_orders_last_activity_desc;
DROP INDEX IF EXISTS public.idx_product_reminders_due_date;
DROP INDEX IF EXISTS public.product_reminders_status_due_idx;
DROP INDEX IF EXISTS public.idx_product_reminders_product_id;
DROP INDEX IF EXISTS public.idx_product_reminders_phone;
DROP INDEX IF EXISTS public.products_status_idx;
DROP INDEX IF EXISTS public.products_category_idx;
-- products_slug_key (unique constraint) is kept; this plain index duplicates it.
DROP INDEX IF EXISTS public.idx_products_slug;

-- 3. Missing foreign-key indexes --------------------------------------------
CREATE INDEX IF NOT EXISTS idx_attribution_touchpoints_session_id ON public.attribution_touchpoints (session_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product_id  ON public.inventory_transactions (product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_variant_id  ON public.inventory_transactions (variant_id);
CREATE INDEX IF NOT EXISTS idx_product_media_variant_id           ON public.product_media (variant_id);
CREATE INDEX IF NOT EXISTS idx_product_reminders_customer_id      ON public.product_reminders (customer_id);
CREATE INDEX IF NOT EXISTS idx_product_reminders_order_id         ON public.product_reminders (order_id);
CREATE INDEX IF NOT EXISTS idx_product_reminders_reorder_order_id ON public.product_reminders (reorder_order_id);
CREATE INDEX IF NOT EXISTS idx_video_testimonials_product_id      ON public.video_testimonials (product_id);
