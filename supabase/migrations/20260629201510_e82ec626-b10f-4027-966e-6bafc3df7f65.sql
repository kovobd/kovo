
CREATE OR REPLACE FUNCTION public.bump_product_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid uuid;
BEGIN
  pid := COALESCE(
    (CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END)
  );
  IF pid IS NOT NULL THEN
    UPDATE public.products SET updated_at = now() WHERE id = pid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_product_updated_at_variants ON public.product_variants;
CREATE TRIGGER trg_bump_product_updated_at_variants
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
FOR EACH ROW EXECUTE FUNCTION public.bump_product_updated_at();

DROP TRIGGER IF EXISTS trg_bump_product_updated_at_media ON public.product_media;
CREATE TRIGGER trg_bump_product_updated_at_media
AFTER INSERT OR UPDATE OR DELETE ON public.product_media
FOR EACH ROW EXECUTE FUNCTION public.bump_product_updated_at();
