
-- 1. ecomdrive_logs table (referenced by ecomdrive-proxy edge function and EcomDriveLogs admin page)
CREATE TABLE IF NOT EXISTS public.ecomdrive_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  invoice_number TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'POST',
  request_payload JSONB,
  response_body JSONB,
  http_status INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  retry_attempt INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecomdrive_logs_created_at ON public.ecomdrive_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ecomdrive_logs_order_id ON public.ecomdrive_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_ecomdrive_logs_success ON public.ecomdrive_logs(success);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ecomdrive_logs TO authenticated;
GRANT ALL ON public.ecomdrive_logs TO service_role;

ALTER TABLE public.ecomdrive_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/staff can view ecomdrive logs"
  ON public.ecomdrive_logs FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admins/staff can manage ecomdrive logs"
  ON public.ecomdrive_logs FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

-- 2. increment_product_stock (counterpart to existing decrement_product_stock, used by POS undo)
CREATE OR REPLACE FUNCTION public.increment_product_stock(_product_id uuid, _quantity integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.products
     SET stock = COALESCE(stock, 0) + GREATEST(0, COALESCE(_quantity, 0))
   WHERE id = _product_id;
END $$;

-- 3. reverse_customer_order (counterpart to upsert_checkout_customer, used by POS undo)
CREATE OR REPLACE FUNCTION public.reverse_customer_order(_email text, _order_total numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NULLIF(_email, '') IS NULL THEN RETURN; END IF;
  UPDATE public.customers
     SET total_orders = GREATEST(0, COALESCE(total_orders, 0) - 1),
         total_spent  = GREATEST(0, COALESCE(total_spent, 0) - COALESCE(_order_total, 0)),
         updated_at = now()
   WHERE email = _email;
END $$;

-- 4. decrement_coupon_usage (counterpart to existing increment_coupon_usage, used by POS undo)
CREATE OR REPLACE FUNCTION public.decrement_coupon_usage(_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.coupons
     SET used_count = GREATEST(0, COALESCE(used_count, 0) - 1)
   WHERE code = _code;
END $$;
