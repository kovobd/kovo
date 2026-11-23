-- Phase 1: Atomic, race-safe order number generation
-- Format kept compatible with existing 11-digit numeric strings.

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq
  AS bigint
  START WITH 10000000001
  MINVALUE 10000000001
  MAXVALUE 99999999999
  CACHE 1;

-- Seed the sequence above any existing numeric order_number so we never collide.
DO $$
DECLARE _max bigint;
BEGIN
  SELECT COALESCE(MAX(NULLIF(regexp_replace(order_number, '\D', '', 'g'), '')::bigint), 10000000000)
    INTO _max
    FROM public.orders
   WHERE order_number ~ '^[0-9]+$';
  IF _max >= 10000000001 THEN
    PERFORM setval('public.order_number_seq', _max + 1, false);
  END IF;
END $$;

-- Atomic RPC: returns a unique 11-digit order number every call.
-- Loops on the (vanishingly unlikely) collision with a pre-existing non-sequence number.
CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _candidate text;
  _attempts int := 0;
BEGIN
  LOOP
    _candidate := nextval('public.order_number_seq')::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_number = _candidate);
    _attempts := _attempts + 1;
    IF _attempts > 50 THEN
      RAISE EXCEPTION 'Could not allocate unique order number after 50 attempts';
    END IF;
  END LOOP;
  RETURN _candidate;
END $$;

GRANT EXECUTE ON FUNCTION public.next_order_number() TO authenticated, anon, service_role;

-- Drop the redundant non-unique index now that we rely on the existing UNIQUE constraint
-- (orders_order_number_key). Keeps writes faster and disk smaller.
DROP INDEX IF EXISTS public.idx_orders_order_number;