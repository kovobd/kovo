CREATE TABLE IF NOT EXISTS public.payment_settings (
  id TEXT NOT NULL DEFAULT 'default' PRIMARY KEY,
  cod_enabled BOOLEAN NOT NULL DEFAULT true,
  bkash_enabled BOOLEAN NOT NULL DEFAULT true,
  nagad_enabled BOOLEAN NOT NULL DEFAULT true,
  bkash_number TEXT,
  nagad_number TEXT,
  payment_note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_settings_single_row CHECK (id = 'default')
);

GRANT SELECT ON public.payment_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_settings TO authenticated;
GRANT ALL ON public.payment_settings TO service_role;

ALTER TABLE public.payment_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY pub_view ON public.payment_settings FOR SELECT TO anon USING (true);
CREATE POLICY admins_manage ON public.payment_settings FOR ALL TO authenticated USING (public.is_admin_or_staff(auth.uid())) WITH CHECK (public.is_admin_or_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_payment_settings_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER payment_settings_updated_at BEFORE UPDATE ON public.payment_settings FOR EACH ROW EXECUTE FUNCTION public.update_payment_settings_updated_at();

INSERT INTO public.payment_settings (id, payment_note)
VALUES ('default', 'Send Money to the number shown, then place your order. We confirm payment by SMS before dispatch.')
ON CONFLICT (id) DO NOTHING;