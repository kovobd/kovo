CREATE TABLE public.announcement_bar_settings (
  id text PRIMARY KEY DEFAULT 'default',
  direction text NOT NULL DEFAULT 'left',
  speed integer NOT NULL DEFAULT 5,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.announcement_bar_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcement_bar_settings TO authenticated;
GRANT ALL ON public.announcement_bar_settings TO service_role;

ALTER TABLE public.announcement_bar_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read announcement bar settings"
  ON public.announcement_bar_settings
  FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins and staff can manage announcement bar settings"
  ON public.announcement_bar_settings
  FOR ALL
  TO authenticated
  USING (is_admin_or_staff(auth.uid()))
  WITH CHECK (is_admin_or_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_announcement_bar_settings()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.id IS NULL OR NEW.id = '' THEN
    RAISE EXCEPTION 'id is required';
  END IF;
  IF NEW.direction NOT IN ('left', 'right') THEN
    RAISE EXCEPTION 'direction must be left or right';
  END IF;
  IF NEW.speed IS NULL OR NEW.speed < 0 OR NEW.speed > 10 THEN
    RAISE EXCEPTION 'speed must be between 0 and 10';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER validate_announcement_bar_settings_trigger
BEFORE INSERT OR UPDATE ON public.announcement_bar_settings
FOR EACH ROW EXECUTE FUNCTION public.validate_announcement_bar_settings();