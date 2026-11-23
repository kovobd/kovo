CREATE OR REPLACE FUNCTION public.bulk_update_sort_order(_table text, _ids text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _allowed CONSTANT text[] := ARRAY[
    'products','hero_slides','announcement_bar','featured_categories','policies'
  ];
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _table IS NULL OR NOT (_table = ANY(_allowed)) THEN
    RAISE EXCEPTION 'table not allowed: %', _table;
  END IF;
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format(
    'UPDATE public.%I AS t
        SET sort_order = u.ord
       FROM (SELECT unnest($1::text[]) AS id, generate_subscripts($1::text[], 1) AS ord) AS u
      WHERE t.id::text = u.id',
    _table
  ) USING _ids;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_sort_order(text, text[]) TO authenticated, service_role;