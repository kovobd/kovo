-- Phase 3: atomic product media + tags swap
CREATE OR REPLACE FUNCTION public.replace_product_media_and_tags(
  _product_id uuid,
  _images jsonb DEFAULT '[]'::jsonb,   -- ordered array of image URLs (strings)
  _tag_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _img_count int := 0;
  _tag_count int := 0;
  _img text;
  _idx int := 0;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _product_id IS NULL THEN
    RAISE EXCEPTION 'product_id required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _product_id) THEN
    RAISE EXCEPTION 'product not found';
  END IF;

  -- product-level images only (preserve variant images)
  DELETE FROM public.product_media
   WHERE product_id = _product_id AND variant_id IS NULL;

  IF _images IS NOT NULL AND jsonb_typeof(_images) = 'array' THEN
    FOR _img IN SELECT jsonb_array_elements_text(_images) LOOP
      IF _img IS NOT NULL AND length(trim(_img)) > 0 THEN
        INSERT INTO public.product_media (product_id, image_url, sort_order, type)
        VALUES (_product_id, _img, _idx, 'image');
        _idx := _idx + 1;
        _img_count := _img_count + 1;
      END IF;
    END LOOP;
  END IF;

  DELETE FROM public.product_tags WHERE product_id = _product_id;
  IF _tag_ids IS NOT NULL AND array_length(_tag_ids, 1) > 0 THEN
    INSERT INTO public.product_tags (product_id, tag_id)
    SELECT _product_id, t FROM unnest(_tag_ids) AS t
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS _tag_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'product_id', _product_id,
    'images_written', _img_count,
    'tags_written', _tag_count
  );
END $$;

REVOKE ALL ON FUNCTION public.replace_product_media_and_tags(uuid, jsonb, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_product_media_and_tags(uuid, jsonb, uuid[]) TO authenticated, service_role;