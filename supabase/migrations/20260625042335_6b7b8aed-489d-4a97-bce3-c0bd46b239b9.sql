GRANT SELECT ON public.floating_icons TO anon, authenticated;
GRANT ALL ON public.floating_icons TO service_role;
GRANT SELECT ON public.floating_icons_settings TO anon, authenticated;
GRANT ALL ON public.floating_icons_settings TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.floating_icons TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.floating_icons_settings TO authenticated;