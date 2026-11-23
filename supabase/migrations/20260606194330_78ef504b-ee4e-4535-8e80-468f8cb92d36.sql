
CREATE TABLE IF NOT EXISTS public.capi_event_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL,
  http_status int,
  attempts int NOT NULL DEFAULT 1,
  error text,
  response text,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.capi_event_logs TO service_role;
ALTER TABLE public.capi_event_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin or staff can view CAPI logs"
  ON public.capi_event_logs FOR SELECT
  TO authenticated
  USING (public.is_admin_or_staff(auth.uid()));
GRANT SELECT ON public.capi_event_logs TO authenticated;
CREATE INDEX IF NOT EXISTS idx_capi_logs_event_id ON public.capi_event_logs (event_id);
CREATE INDEX IF NOT EXISTS idx_capi_logs_created ON public.capi_event_logs (created_at DESC);
