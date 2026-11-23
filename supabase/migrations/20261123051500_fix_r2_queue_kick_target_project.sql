-- tg_r2_queue_kick() was hard-coded to POST to the r2-cleanup-worker of a
-- different Supabase project (yclhketsbkcfhjuaqghw), sending the
-- X-Worker-Secret header there. On this project the cleanup worker therefore
-- was never kicked, and a configured secret would have been sent to the wrong
-- project. Point it at this project. Behaviour is otherwise unchanged:
-- it still no-ops when no worker_cron_secret is configured, and never lets an
-- HTTP hiccup block the originating statement.

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
    url := 'https://nzvxkzuukibnxpfdwwol.supabase.co/functions/v1/r2-cleanup-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret', v_secret,
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56dnhrenV1a2libnhwZmR3d29sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwODI1NzQsImV4cCI6MjA5OTY1ODU3NH0.h3qiH_79PkRAIogJUCgKCH_mKKK6Bzjun-I_ZWnXfWs'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- never let an http hiccup block the originating delete/update
  RETURN NULL;
END $function$;

-- Keep it uncallable through the API (trigger function).
REVOKE EXECUTE ON FUNCTION public.tg_r2_queue_kick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tg_r2_queue_kick() TO service_role;
