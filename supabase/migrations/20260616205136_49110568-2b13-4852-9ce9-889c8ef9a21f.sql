
-- 1. Product reminder fields
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS reminder_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_days integer,
  ADD COLUMN IF NOT EXISTS reminder_notes text;

-- 2. Enums
DO $$ BEGIN
  CREATE TYPE public.reminder_status AS ENUM (
    'pending','called','purchased_again','no_response','not_interested','follow_up','do_not_remind','superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.reminder_priority AS ENUM ('low','medium','high');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Reminders table
CREATE TABLE IF NOT EXISTS public.product_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_number text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_phone text NOT NULL,
  customer_name text,
  customer_email text,
  reminder_days integer NOT NULL,
  purchase_date timestamptz NOT NULL,
  due_date date NOT NULL,
  status public.reminder_status NOT NULL DEFAULT 'pending',
  priority public.reminder_priority NOT NULL DEFAULT 'low',
  notes text,
  call_notes text,
  follow_up_date date,
  called_at timestamptz,
  resolved_at timestamptz,
  reorder_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  reorder_amount numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_reminders_due ON public.product_reminders(due_date);
CREATE INDEX IF NOT EXISTS idx_product_reminders_status ON public.product_reminders(status);
CREATE INDEX IF NOT EXISTS idx_product_reminders_phone ON public.product_reminders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_product_reminders_product ON public.product_reminders(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reminders_followup ON public.product_reminders(follow_up_date) WHERE status = 'follow_up';

-- 4. GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_reminders TO authenticated;
GRANT ALL ON public.product_reminders TO service_role;

-- 5. RLS
ALTER TABLE public.product_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins and staff manage reminders" ON public.product_reminders;
CREATE POLICY "Admins and staff manage reminders"
  ON public.product_reminders FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

-- 6. updated_at trigger
DROP TRIGGER IF EXISTS trg_product_reminders_updated_at ON public.product_reminders;
CREATE TRIGGER trg_product_reminders_updated_at
  BEFORE UPDATE ON public.product_reminders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Trigger: schedule reminders when an order is placed
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
  _phone text;
  _digits text;
  _cust_id uuid;
  _cust_total int;
  _priority public.reminder_priority;
  _due date;
BEGIN
  _phone := COALESCE(NEW.customer_phone, '');
  _digits := regexp_replace(_phone, '\D', '', 'g');
  IF _digits = '' THEN RETURN NEW; END IF;

  -- Match customer & compute priority based on lifetime orders (including this one)
  SELECT id, total_orders INTO _cust_id, _cust_total
    FROM public.customers WHERE phone = _digits LIMIT 1;
  _cust_total := COALESCE(_cust_total, 1);
  _priority := CASE
    WHEN _cust_total >= 3 THEN 'high'::public.reminder_priority
    WHEN _cust_total = 2 THEN 'medium'::public.reminder_priority
    ELSE 'low'::public.reminder_priority
  END;

  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN RETURN NEW; END IF;

  FOR _item IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
    BEGIN
      _pid := NULLIF(_item->>'product_id','')::uuid;
    EXCEPTION WHEN others THEN _pid := NULL; END;
    IF _pid IS NULL THEN
      BEGIN _pid := NULLIF(_item->>'id','')::uuid; EXCEPTION WHEN others THEN _pid := NULL; END;
    END IF;
    IF _pid IS NULL THEN CONTINUE; END IF;

    SELECT id, name, reminder_enabled, reminder_days, reminder_notes
      INTO _prod FROM public.products WHERE id = _pid;
    IF NOT FOUND OR NOT COALESCE(_prod.reminder_enabled,false) OR COALESCE(_prod.reminder_days,0) <= 0 THEN
      CONTINUE;
    END IF;

    -- Supersede prior open reminders for same customer + product
    UPDATE public.product_reminders
       SET status = 'superseded', resolved_at = now()
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

DROP TRIGGER IF EXISTS trg_orders_schedule_reminders ON public.orders;
CREATE TRIGGER trg_orders_schedule_reminders
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.schedule_reminders_for_order();

-- 8. Helper: when "purchased_again" is set manually without a linked new order,
--    mark resolved. Conversion / revenue stats are computed in the UI from columns.
