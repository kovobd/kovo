-- ============ ENUMS ============
DO $$ BEGIN
  CREATE TYPE public.site_review_type AS ENUM ('photo','video','text');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.site_review_media_kind AS ENUM ('image','video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.site_review_media_provider AS ENUM ('upload','youtube','vimeo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ site_reviews ============
CREATE TABLE IF NOT EXISTS public.site_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_name text NOT NULL,
  location text,
  review_date date NOT NULL DEFAULT (now()::date),
  title text,
  body text,
  rating integer NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  review_type public.site_review_type NOT NULL DEFAULT 'text',
  is_verified_purchase boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_reviews TO authenticated;
GRANT ALL ON public.site_reviews TO service_role;

ALTER TABLE public.site_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read visible site reviews"
  ON public.site_reviews FOR SELECT
  USING (is_visible = true);

CREATE POLICY "Admin/staff can read all site reviews"
  ON public.site_reviews FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin/staff can insert site reviews"
  ON public.site_reviews FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin/staff can update site reviews"
  ON public.site_reviews FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin/staff can delete site reviews"
  ON public.site_reviews FOR DELETE
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_site_reviews_visible_sort
  ON public.site_reviews (is_visible, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_reviews_type
  ON public.site_reviews (review_type);

CREATE TRIGGER trg_site_reviews_updated_at
  BEFORE UPDATE ON public.site_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ site_review_media ============
CREATE TABLE IF NOT EXISTS public.site_review_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.site_reviews(id) ON DELETE CASCADE,
  kind public.site_review_media_kind NOT NULL,
  provider public.site_review_media_provider NOT NULL DEFAULT 'upload',
  external_video_id text,
  r2_key text,
  url text,
  thumbnail_url text,
  width integer,
  height integer,
  file_size bigint,
  duration_seconds numeric,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_review_media TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_review_media TO authenticated;
GRANT ALL ON public.site_review_media TO service_role;

ALTER TABLE public.site_review_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read media for visible reviews"
  ON public.site_review_media FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.site_reviews r
    WHERE r.id = site_review_media.review_id AND r.is_visible = true
  ));

CREATE POLICY "Admin/staff can read all review media"
  ON public.site_review_media FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin/staff can insert review media"
  ON public.site_review_media FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin/staff can update review media"
  ON public.site_review_media FOR UPDATE
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()))
  WITH CHECK (public.is_admin_or_staff(auth.uid()));

CREATE POLICY "Admin/staff can delete review media"
  ON public.site_review_media FOR DELETE
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_site_review_media_review
  ON public.site_review_media (review_id, sort_order);

CREATE TRIGGER trg_site_review_media_updated_at
  BEFORE UPDATE ON public.site_review_media
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ Realtime ============
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_reviews;
ALTER PUBLICATION supabase_realtime ADD TABLE public.site_review_media;