
-- analytics_events
DROP POLICY IF EXISTS "events_insert_any" ON public.analytics_events;
CREATE POLICY "events_insert_any" ON public.analytics_events
  FOR INSERT TO public
  WITH CHECK (
    session_id IS NOT NULL
    AND visitor_id IS NOT NULL
    AND event_name IS NOT NULL
    AND length(event_name) <= 100
  );

-- sessions
DROP POLICY IF EXISTS "sessions_insert_any" ON public.sessions;
CREATE POLICY "sessions_insert_any" ON public.sessions
  FOR INSERT TO public
  WITH CHECK (visitor_id IS NOT NULL);

DROP POLICY IF EXISTS "sessions_update_any" ON public.sessions;
CREATE POLICY "sessions_update_any" ON public.sessions
  FOR UPDATE TO public
  USING (visitor_id IS NOT NULL)
  WITH CHECK (visitor_id IS NOT NULL);

-- visitors
DROP POLICY IF EXISTS "visitors_insert_any" ON public.visitors;
CREATE POLICY "visitors_insert_any" ON public.visitors
  FOR INSERT TO public
  WITH CHECK (created_at IS NULL OR created_at <= now() + interval '1 minute');

DROP POLICY IF EXISTS "visitors_update_any" ON public.visitors;
CREATE POLICY "visitors_update_any" ON public.visitors
  FOR UPDATE TO public
  USING (true)
  WITH CHECK (created_at IS NULL OR created_at <= now() + interval '1 minute');

-- attribution_touchpoints
DROP POLICY IF EXISTS "attr_insert_any" ON public.attribution_touchpoints;
CREATE POLICY "attr_insert_any" ON public.attribution_touchpoints
  FOR INSERT TO public
  WITH CHECK (session_id IS NOT NULL AND visitor_id IS NOT NULL);

DROP POLICY IF EXISTS "attr_update_any" ON public.attribution_touchpoints;
CREATE POLICY "attr_update_any" ON public.attribution_touchpoints
  FOR UPDATE TO public
  USING (session_id IS NOT NULL)
  WITH CHECK (session_id IS NOT NULL);
