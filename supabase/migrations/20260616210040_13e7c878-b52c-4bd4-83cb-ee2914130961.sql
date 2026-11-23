
-- 0. Permanent do-not-remind flag
ALTER TABLE public.customer_profiles
  ADD COLUMN IF NOT EXISTS do_not_remind boolean NOT NULL DEFAULT false;

-- 1. Replace the schedule trigger with fixed logic
CREATE OR REPLACE FUNCTION public.schedule_reminders_for_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  _dnr boolean := false;
BEGIN
  _digits := regexp_replace(COALESCE(NEW.customer_phone, ''), '\D', '', 'g');
  IF _digits = '' THEN RETURN NEW; END IF;

  -- Phone-format tolerant customer lookup
  SELECT id, total_orders INTO _cust_id, _cust_total
    FROM public.customers
   WHERE regexp_replace(COALESCE(phone, ''), '\D', '', 'g') = _digits
   LIMIT 1;

  -- Permanent do-not-remind exclusion
  IF _cust_id IS NOT NULL THEN
    SELECT COALESCE(do_not_remind, false) INTO _dnr
      FROM public.customer_profiles WHERE id = _cust_id;
    IF _dnr THEN RETURN NEW; END IF;
  END IF;

  -- Priority counts the just-placed order
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

    -- Dedupe within this order
    IF _pid = ANY(_seen) THEN CONTINUE; END IF;
    _seen := _seen || _pid;

    SELECT id, name, reminder_enabled, reminder_days, reminder_notes
      INTO _prod FROM public.products WHERE id = _pid;
    IF NOT FOUND OR NOT COALESCE(_prod.reminder_enabled,false) OR COALESCE(_prod.reminder_days,0) <= 0 THEN
      CONTINUE;
    END IF;

    -- Compute line amount for revenue tracking
    _qty := COALESCE(NULLIF(_item->>'quantity','')::numeric, 1);
    _line_amount := COALESCE(NULLIF(_item->>'price','')::numeric, 0) * _qty;

    -- Auto-complete prior open reminders as "purchased again" + record reorder
    UPDATE public.product_reminders
       SET status = 'purchased_again',
           reorder_order_id = NEW.id,
           reorder_amount = _line_amount,
           resolved_at = now()
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
END $$;

-- 2. Backfill function — seeds reminders from historical orders
CREATE OR REPLACE FUNCTION public.backfill_product_reminders(_days integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

      SELECT id, name, reminder_enabled, reminder_days, reminder_notes
        INTO _prod FROM public.products WHERE id = _pid;
      IF NOT FOUND OR NOT COALESCE(_prod.reminder_enabled,false) OR COALESCE(_prod.reminder_days,0) <= 0 THEN
        CONTINUE;
      END IF;

      -- Skip if a reminder already exists for this exact order+product
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
      );
      _inserted := _inserted + 1;
    END LOOP;
  END LOOP;

  -- After insertion, supersede older open reminders per customer+product (keep latest only)
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
END $$;

-- 3. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_reminders;
