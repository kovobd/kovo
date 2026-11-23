
-- Immediate R2 deletion: fire the cleanup worker via pg_net the moment
-- anything is enqueued for deletion. The queue stays as a durable retry
-- ledger; the per-minute cron remains as a failsafe.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.tg_r2_queue_kick()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  SELECT secret INTO v_secret FROM public.worker_secrets WHERE name = 'worker_cron_secret' LIMIT 1;
  IF v_secret IS NULL OR v_secret = '' THEN
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url := 'https://yclhketsbkcfhjuaqghw.supabase.co/functions/v1/r2-cleanup-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Worker-Secret', v_secret,
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljbGhrZXRzYmtjZmhqdWFxZ2h3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNTE2NDAsImV4cCI6MjA5NzcyNzY0MH0.DxrkkrKD7IhhcbcD3RivCbya26vtk7qf6HiJKyQWCqg'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- never let an http hiccup block the originating delete/update
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_r2_queue_kick ON public.r2_deletion_queue;
CREATE TRIGGER trg_r2_queue_kick
  AFTER INSERT ON public.r2_deletion_queue
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.tg_r2_queue_kick();
