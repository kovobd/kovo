
CREATE OR REPLACE FUNCTION public.get_order_for_purchase_tracking(p_order_number text)
RETURNS TABLE (
  order_number text,
  total numeric,
  order_status text,
  payment_status text,
  is_deleted boolean,
  is_cancelled boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.order_number,
    o.total,
    o.order_status,
    o.payment_status,
    (o.deleted_at IS NOT NULL) AS is_deleted,
    (o.order_status = 'cancelled') AS is_cancelled,
    o.created_at
  FROM public.orders o
  WHERE o.order_number = p_order_number
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_for_purchase_tracking(text) TO anon, authenticated;
