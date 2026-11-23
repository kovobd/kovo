
DROP POLICY IF EXISTS "visitors_update_any" ON public.visitors;
CREATE POLICY "visitors_update_any" ON public.visitors
  FOR UPDATE TO public
  USING (created_at IS NULL OR created_at <= now() + interval '1 day')
  WITH CHECK (created_at IS NULL OR created_at <= now() + interval '1 minute');
