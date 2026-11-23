
CREATE TABLE IF NOT EXISTS public.bdcourier_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  risk_level text,
  risk_label text,
  recommendation text,
  success_ratio numeric,
  fraud_report_count integer,
  total_parcel integer,
  success_parcel integer,
  cancelled_parcel integer,
  reasons jsonb DEFAULT '[]'::jsonb,
  couriers jsonb DEFAULT '{}'::jsonb,
  raw jsonb,
  checked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bdcourier_verifications_phone_idx ON public.bdcourier_verifications(phone, created_at DESC);
CREATE INDEX IF NOT EXISTS bdcourier_verifications_order_idx ON public.bdcourier_verifications(order_id, created_at DESC);

GRANT SELECT, INSERT ON public.bdcourier_verifications TO authenticated;
GRANT ALL ON public.bdcourier_verifications TO service_role;

ALTER TABLE public.bdcourier_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/staff can view verifications"
  ON public.bdcourier_verifications FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin/staff can insert verifications"
  ON public.bdcourier_verifications FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
