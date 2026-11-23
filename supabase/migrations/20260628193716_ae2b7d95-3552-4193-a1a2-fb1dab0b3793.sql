
CREATE TABLE IF NOT EXISTS public.review_hero_settings (
  id INT PRIMARY KEY DEFAULT 1,
  headline TEXT NOT NULL DEFAULT 'Loved by our customers.',
  subtitle TEXT NOT NULL DEFAULT 'Trusted by thousands of happy customers — real photos, real videos, real stories.',
  avatars JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

GRANT SELECT ON public.review_hero_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_hero_settings TO authenticated;
GRANT ALL ON public.review_hero_settings TO service_role;

ALTER TABLE public.review_hero_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read review hero settings"
  ON public.review_hero_settings FOR SELECT
  USING (true);

CREATE POLICY "Admins manage review hero settings"
  ON public.review_hero_settings FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.review_hero_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;
