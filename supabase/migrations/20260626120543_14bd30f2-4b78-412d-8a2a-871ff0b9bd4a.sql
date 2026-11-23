
-- 1) hero_slides: drop legacy columns, add new spec columns
ALTER TABLE public.hero_slides
  DROP COLUMN IF EXISTS title,
  DROP COLUMN IF EXISTS subtitle,
  DROP COLUMN IF EXISTS button_text,
  DROP COLUMN IF EXISTS button_link;

ALTER TABLE public.hero_slides
  ADD COLUMN IF NOT EXISTS mobile_image_url text,
  ADD COLUMN IF NOT EXISTS headline text,
  ADD COLUMN IF NOT EXISTS subheadline text,
  ADD COLUMN IF NOT EXISTS button1_text text,
  ADD COLUMN IF NOT EXISTS button1_link text,
  ADD COLUMN IF NOT EXISTS button2_text text,
  ADD COLUMN IF NOT EXISTS button2_link text,
  ADD COLUMN IF NOT EXISTS image_click_link text,
  ADD COLUMN IF NOT EXISTS interaction_mode text NOT NULL DEFAULT 'buttons';

ALTER TABLE public.hero_slides
  DROP CONSTRAINT IF EXISTS hero_slides_interaction_mode_check;
ALTER TABLE public.hero_slides
  ADD CONSTRAINT hero_slides_interaction_mode_check
  CHECK (interaction_mode IN ('buttons','image','both'));

-- 2) hero_settings: singleton config row
CREATE TABLE IF NOT EXISTS public.hero_settings (
  id text PRIMARY KEY DEFAULT 'default',
  hero_type text NOT NULL DEFAULT 'image_slider',
  hero_layout text NOT NULL DEFAULT 'single',
  enabled boolean NOT NULL DEFAULT true,
  autoplay boolean NOT NULL DEFAULT true,
  transition_speed_ms integer NOT NULL DEFAULT 6000,
  infinite_loop boolean NOT NULL DEFAULT true,
  swipe_enabled boolean NOT NULL DEFAULT true,

  -- video hero fields
  desktop_video_url text,
  mobile_video_url text,
  poster_image_url text,
  video_headline text,
  video_subheadline text,
  video_button1_text text,
  video_button1_link text,
  video_button2_text text,
  video_button2_link text,
  video_click_link text,
  video_autoplay boolean NOT NULL DEFAULT true,
  video_loop boolean NOT NULL DEFAULT true,
  video_muted boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hero_settings_singleton CHECK (id = 'default'),
  CONSTRAINT hero_settings_type_check CHECK (hero_type IN ('image_slider','video_hero')),
  CONSTRAINT hero_settings_layout_check CHECK (hero_layout IN ('single','dual'))
);

GRANT SELECT ON public.hero_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hero_settings TO authenticated;
GRANT ALL ON public.hero_settings TO service_role;

ALTER TABLE public.hero_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hero_settings public read" ON public.hero_settings;
CREATE POLICY "hero_settings public read" ON public.hero_settings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "hero_settings admin write" ON public.hero_settings;
CREATE POLICY "hero_settings admin write" ON public.hero_settings
  FOR ALL TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

DROP TRIGGER IF EXISTS hero_settings_updated_at ON public.hero_settings;
CREATE TRIGGER hero_settings_updated_at
  BEFORE UPDATE ON public.hero_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed singleton row
INSERT INTO public.hero_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;
