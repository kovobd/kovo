-- Singleton settings tables have no primary key, so guard with NOT EXISTS
INSERT INTO public.shop_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.shop_settings WHERE id='default');
INSERT INTO public.contact_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.contact_settings WHERE id='default');
INSERT INTO public.footer_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.footer_settings WHERE id='default');
INSERT INTO public.invoice_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.invoice_settings WHERE id='default');
INSERT INTO public.hero_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.hero_settings WHERE id='default');
INSERT INTO public.announcement_bar_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.announcement_bar_settings WHERE id='default');
INSERT INTO public.floating_icons_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.floating_icons_settings WHERE id='default');
INSERT INTO public.design_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.design_settings WHERE id='default');
INSERT INTO public.whatsapp_settings (id) SELECT 'default' WHERE NOT EXISTS (SELECT 1 FROM public.whatsapp_settings WHERE id='default');
INSERT INTO public.review_hero_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM public.review_hero_settings WHERE id=1);
INSERT INTO public.intelligence_settings (id) SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM public.intelligence_settings WHERE id=1);

-- Standard homepage sections so the Homepage settings page lists every block
INSERT INTO public.homepage_sections (id, sort_order, enabled)
SELECT v.id, v.sort_order, v.enabled FROM (VALUES
  ('hero', 10, true),
  ('featured', 20, true),
  ('bestsellers', 30, true),
  ('categories_showcase', 40, true),
  ('brands_showcase', 50, true),
  ('brand_story', 60, true),
  ('featured_image', 70, false),
  ('why_choose_us', 80, true),
  ('testimonials', 90, true),
  ('video_reels', 100, true),
  ('newsletter', 110, true),
  ('faq', 120, true)
) AS v(id, sort_order, enabled)
WHERE NOT EXISTS (SELECT 1 FROM public.homepage_sections h WHERE h.id = v.id);