
CREATE TABLE IF NOT EXISTS public.service_credentials (
  service text PRIMARY KEY,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_status text,
  last_test_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_credentials TO authenticated;
GRANT ALL ON public.service_credentials TO service_role;

ALTER TABLE public.service_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage service credentials"
  ON public.service_credentials
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_service_credentials_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_service_credentials_touch ON public.service_credentials;
CREATE TRIGGER trg_service_credentials_touch
  BEFORE UPDATE ON public.service_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_service_credentials_updated_at();

INSERT INTO public.service_credentials (service, values) VALUES
  ('r2', '{}'::jsonb),
  ('bdcourier', '{}'::jsonb)
ON CONFLICT (service) DO NOTHING;
