
-- 1. Updated trigger function: variant reminder_days = 0 means "explicitly disabled for this variant"
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

  _src := CASE
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

    -- Always auto-close prior open reminders for this phone+product.
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
END $function$;

-- 2. backfill: respect DNR
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
END $function$;

-- 3. Attention counts RPC
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
END $function$;

GRANT EXECUTE ON FUNCTION public.get_reminder_attention_counts() TO authenticated;

-- 4. Cleanup duplicates BEFORE adding unique index
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_phone, product_id ORDER BY purchase_date DESC, created_at DESC) AS rn
    FROM public.product_reminders
   WHERE status IN ('pending','called','follow_up','no_response','interested')
)
UPDATE public.product_reminders r
   SET status = 'superseded', resolved_at = now()
  FROM ranked
 WHERE r.id = ranked.id AND ranked.rn > 1;

-- 5. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS product_reminders_open_uniq
  ON public.product_reminders(customer_phone, product_id)
  WHERE status IN ('pending','called','follow_up','no_response','interested');

CREATE INDEX IF NOT EXISTS product_reminders_phone_product_status_idx
  ON public.product_reminders(customer_phone, product_id, status);

CREATE INDEX IF NOT EXISTS product_reminders_status_due_idx
  ON public.product_reminders(status, due_date);

CREATE INDEX IF NOT EXISTS product_variants_product_active_sort_idx
  ON public.product_variants(product_id, active, sort_order);
