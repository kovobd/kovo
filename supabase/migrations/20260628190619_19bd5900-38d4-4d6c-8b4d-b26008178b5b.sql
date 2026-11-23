-- Enforce at most one media item per site review
CREATE OR REPLACE FUNCTION public.enforce_single_review_media()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing_count int;
BEGIN
  SELECT COUNT(*) INTO existing_count
  FROM public.site_review_media
  WHERE review_id = NEW.review_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);
  IF existing_count >= 1 THEN
    RAISE EXCEPTION 'A review may only have one media attachment. Remove the existing media first.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_review_media ON public.site_review_media;
CREATE TRIGGER trg_enforce_single_review_media
BEFORE INSERT ON public.site_review_media
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_review_media();

-- Cleanup: keep only first media per review (lowest sort_order, then created_at)
DELETE FROM public.site_review_media m
USING (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY review_id
      ORDER BY sort_order ASC, created_at ASC
    ) AS rn
    FROM public.site_review_media
  ) ranked WHERE ranked.rn > 1
) dup
WHERE m.id = dup.id;