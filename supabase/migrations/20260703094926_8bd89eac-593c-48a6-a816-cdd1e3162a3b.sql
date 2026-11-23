
-- Add primary keys where missing (safe if already present)
do $$
begin
  if not exists (select 1 from pg_constraint where conname='shop_settings_pkey') then
    alter table public.shop_settings add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname='contact_settings_pkey') then
    alter table public.contact_settings add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname='footer_settings_pkey') then
    alter table public.footer_settings add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname='homepage_sections_pkey') then
    alter table public.homepage_sections add primary key (id);
  end if;
  if not exists (select 1 from pg_constraint where conname='about_sections_pkey') then
    alter table public.about_sections add primary key (id);
  end if;
end $$;

insert into public.shop_settings (id) values ('default') on conflict (id) do nothing;

insert into public.contact_settings (id, page_title, page_intro, email_address, phone_number, business_address)
values ('default', 'Contact Us', 'We''d love to hear from you. Reach out and our team will get back within 24 hours.', 'support@smartgadgetzone5.com', '', '')
on conflict (id) do nothing;

insert into public.footer_settings (id, store_name, description, email, phone, address, copyright_text)
values ('default', 'Smart Gadget Zone 5', 'All mobile accessories, curated for you.', 'support@smartgadgetzone5.com', '', '', '© {year} Smart Gadget Zone 5. All rights reserved.')
on conflict (id) do nothing;

insert into public.homepage_sections (id, enabled, sort_order, content) values
  ('hero',                true, 10, '{}'::jsonb),
  ('featured',            true, 20, '{"headline":"Featured","subheadline":"Handpicked essentials"}'::jsonb),
  ('bestsellers',         true, 30, '{"headline":"Bestsellers","subheadline":"What everyone is loving"}'::jsonb),
  ('categories_showcase', true, 40, '{"headline":"Shop by Category"}'::jsonb),
  ('brands_showcase',     true, 50, '{"headline":"Top Brands"}'::jsonb),
  ('brand_story',         true, 60, '{"headline":"Our Story","text":"Premium mobile accessories, curated for the modern lifestyle.","image":""}'::jsonb),
  ('featured_image',      false,70, '{"image":"","link":""}'::jsonb),
  ('newsletter',          true, 80, '{"headline":"Join our newsletter","subheadline":"Get updates on new arrivals and offers."}'::jsonb),
  ('why_choose_us',       true, 90, '{"headline":"Why Choose Us"}'::jsonb),
  ('testimonials',        true, 100,'{"headline":"What our customers say"}'::jsonb),
  ('video_reels',         true, 110,'{"headline":"Reels"}'::jsonb),
  ('faq',                 true, 120,'{"headline":"Frequently Asked Questions"}'::jsonb)
on conflict (id) do nothing;

insert into public.about_sections (id, enabled, sort_order, content) values
  ('header',         true, 10, '{"title":"About Smart Gadget Zone 5","intro":"All mobile accessories, curated for you."}'::jsonb),
  ('story',          true, 20, '{"headline":"Our Story","text":"We started Smart Gadget Zone 5 to make premium mobile accessories accessible to everyone.","image":""}'::jsonb),
  ('mission_vision', true, 30, '{"mission":"Deliver quality mobile accessories at fair prices.","vision":"Be the most trusted mobile accessories destination."}'::jsonb),
  ('founder',        true, 40, '{"headline":"From the Founder","message":"Thank you for choosing Smart Gadget Zone 5.","image":""}'::jsonb),
  ('values',         true, 50, '{"cards":[{"title":"Quality","text":"Only trusted brands and products."},{"title":"Support","text":"Responsive help before and after purchase."},{"title":"Value","text":"Fair prices, honest deals."},{"title":"Trust","text":"Thousands of happy customers."}]}'::jsonb),
  ('cta',            true, 60, '{"headline":"Shop the collection","text":"Explore mobile accessories built for everyday life."}'::jsonb)
on conflict (id) do nothing;
