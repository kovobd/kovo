
CREATE TABLE IF NOT EXISTS public.capi_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL UNIQUE DEFAULT 'facebook',
  status text NOT NULL,
  pixel_id text,
  business_name text,
  api_version text,
  http_status int,
  events_received int,
  test_event_code text,
  message text,
  diagnostics jsonb,
  tested_at timestamptz NOT NULL DEFAULT now(),
  tested_by uuid
);

GRANT SELECT ON public.capi_test_results TO authenticated;
GRANT ALL ON public.capi_test_results TO service_role;

ALTER TABLE public.capi_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read capi test results"
ON public.capi_test_results FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
