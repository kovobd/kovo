CREATE OR REPLACE FUNCTION public.r2_expedite(_ids bigint[] DEFAULT NULL::bigint[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE affected integer;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.r2_deletion_queue
     SET queued_at = now() - interval '10 minutes',
         attempts = 0, last_error = NULL, claimed_at = NULL
   WHERE processed_at IS NULL
     AND (_ids IS NULL OR id = ANY(_ids));
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;

CREATE OR REPLACE FUNCTION public.r2_expedite_orphans()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE affected integer;
BEGIN
  IF NOT public.is_admin_or_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  UPDATE public.r2_deletion_queue
     SET queued_at = now() - interval '10 minutes',
         attempts = 0, last_error = NULL, claimed_at = NULL
   WHERE processed_at IS NULL
     AND source_table = 'orphan_sweep';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$function$;