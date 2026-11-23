
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS option_groups jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS show_brand boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.product_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  label text NOT NULL,
  value text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_details_product_id_idx ON public.product_details(product_id, sort_order);

GRANT SELECT ON public.product_details TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_details TO authenticated;
GRANT ALL ON public.product_details TO service_role;

ALTER TABLE public.product_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read product details"
  ON public.product_details FOR SELECT
  USING (true);

CREATE POLICY "Admin/staff manage product details"
  ON public.product_details FOR ALL
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));
