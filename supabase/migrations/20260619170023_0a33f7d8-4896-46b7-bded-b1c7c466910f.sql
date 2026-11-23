
-- 1) Skip future reminders when a product-level Do-Not-Remind exists for that phone+product.
--    Also drop the historical customer-wide do_not_remind block so DNR stays product-specific.
CREATE OR REPLACE FUNCTION public.schedule_reminders_for_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _item jsonb;
  _pid uuid;
  _prod record;
  _digits text;
  _cust_id uuid;
  _cust_total int;
  _priority public.reminder_priority;
  _due date;
  _line_amount numeric;
  _qty numeric;
  _seen uuid[] := ARRAY[]::uuid[];
  _dnr_product boolean := false;
BEGIN
  _digits := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
  IF _digits = '' THEN RETURN NEW; END IF;

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

    -- Product-specific DNR: if this customer ever set Do Not Remind for THIS product, skip.
    SELECT EXISTS (
      SELECT 1 FROM public.product_reminders
       WHERE customer_phone = _digits
         AND product_id = _pid
         AND status = 'do_not_remind'
    ) INTO _dnr_product;
    IF _dnr_product THEN CONTINUE; END IF;

    SELECT id, name, reminder_enabled, reminder_days, reminder_notes
      INTO _prod FROM public.products WHERE id = _pid;
    IF NOT FOUND OR NOT COALESCE(_prod.reminder_enabled,false) OR COALESCE(_prod.reminder_days,0) <= 0 THEN
      CONTINUE;
    END IF;

    _qty := COALESCE(NULLIF(_item->>'quantity','')::numeric, 1);
    _line_amount := COALESCE(NULLIF(_item->>'price','')::numeric, 0) * _qty;

    UPDATE public.product_reminders
       SET status = 'purchased_again',
           reorder_order_id = NEW.id,
           reorder_amount = _line_amount,
           resolved_at = now(),
           completed_at = now()
     WHERE customer_phone = _digits
       AND product_id = _pid
       AND status IN ('pending','called','follow_up','no_response');

    _due := (NEW.created_at::date + _prod.reminder_days);

    INSERT INTO public.product_reminders (
      product_id, product_name_snapshot, order_id, order_number,
      customer_id, customer_phone, customer_name, customer_email,
      reminder_days, purchase_date, due_date, status, priority, notes
    ) VALUES (
      _prod.id, _prod.name, NEW.id, NEW.order_number,
      _cust_id, _digits, NEW.customer_name, NEW.customer_email,
      _prod.reminder_days, NEW.created_at, _due, 'pending', _priority, _prod.reminder_notes
    );
  END LOOP;

  RETURN NEW;
END $function$;

-- 2) Phone-unified CRM customers view (aliases + lifetime totals).
CREATE OR REPLACE VIEW public.crm_customers AS
SELECT
  regexp_replace(o.customer_phone,'\D','','g') AS phone,
  (array_agg(o.customer_name ORDER BY o.created_at DESC)
     FILTER (WHERE o.customer_name IS NOT NULL AND o.customer_name <> ''))[1] AS latest_name,
  ARRAY(SELECT DISTINCT n FROM unnest(array_agg(o.customer_name)) AS n
         WHERE n IS NOT NULL AND n <> '') AS aliases,
  (array_agg(o.customer_email ORDER BY o.created_at DESC)
     FILTER (WHERE o.customer_email IS NOT NULL AND o.customer_email <> ''))[1] AS email,
  MIN(o.created_at) AS first_order_at,
  MAX(o.created_at) AS last_order_at,
  COUNT(*)::int AS total_orders,
  COALESCE(SUM(o.total),0)::numeric AS lifetime_value,
  COALESCE(SUM(o.total) FILTER (WHERE o.order_status='delivered'),0)::numeric AS delivered_value
FROM public.orders o
WHERE regexp_replace(COALESCE(o.customer_phone,''),'\D','','g') <> ''
GROUP BY 1;

GRANT SELECT ON public.crm_customers TO authenticated;
GRANT SELECT ON public.crm_customers TO service_role;
