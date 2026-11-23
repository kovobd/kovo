-- tg_r2_queue_kick() still POSTed to the r2-cleanup-worker of the old
-- Gothic Vault project (nzvxkzuukibnxpfdwwol), so on Kovo the cleanup worker
-- was never kicked and, once worker_cron_secret is set, the X-Worker-Secret
-- header would have been sent to another project. Point it at Kovo
-- (pyzjuxdznayzenxjpiea) and use Kovo's publishable key as the gateway apikey.
-- Behaviour is otherwise unchanged.

CREATE OR REPLACE FUNCTION public.tg_r2_queue_kick()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_secret text;
BEGIN
  SELECT secret INTO v_secret FROM public.worker_secrets WHERE name = 'worker_cron_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := 'https://pyzjuxdznayzenxjpiea.supabase.co/functions/v1/r2-cleanup-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret', v_secret,
      'apikey', 'sb_publishable_8aDj4KLj16KX_zLKZOsnsw_9tOzFpCi'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- never let an http hiccup block the originating delete/update
  RETURN NULL;
END $function$;

REVOKE EXECUTE ON FUNCTION public.tg_r2_queue_kick() FROM PUBLIC, anon, authenticated;
