CREATE OR REPLACE FUNCTION public.enforce_single_enabled_delivery_partner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.enabled IS TRUE THEN
    UPDATE public.delivery_partners
       SET enabled = false
     WHERE id <> NEW.id
       AND enabled = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_single_enabled_delivery_partner ON public.delivery_partners;
CREATE TRIGGER trg_single_enabled_delivery_partner
AFTER INSERT OR UPDATE OF enabled ON public.delivery_partners
FOR EACH ROW
WHEN (NEW.enabled = true)
EXECUTE FUNCTION public.enforce_single_enabled_delivery_partner();

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC NULLS LAST, id DESC) rn
  FROM public.delivery_partners
  WHERE enabled = true
)
UPDATE public.delivery_partners dp
   SET enabled = false
  FROM ranked r
 WHERE dp.id = r.id AND r.rn > 1;