
-- CMS auto-initializer: idempotent, never overwrites existing rows.
CREATE OR REPLACE FUNCTION public.ensure_cms_defaults()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop int := 0; _contact int := 0; _footer int := 0;
  _home int := 0; _about int := 0;
  _row record;
BEGIN
  -- shop_settings (single row, id='default')
  INSERT INTO public.shop_settings (
    id, default_sorting, sorting_enabled, search_enabled,
    card_cta_mode, card_show_view_details, card_show_add_to_cart, card_show_buy_now
  ) VALUES (
    'default', 'newest', true, true,
    'view_details', true, true, true
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS _shop = ROW_COUNT;

  -- contact_settings (single row, id='default')
  INSERT INTO public.contact_settings (
    id, page_title, page_intro, phone_number, email_address, receiving_email,
    show_address, business_address, phone_field_enabled, submit_button_text,
    social_section_enabled, social_links, faq_shortcut_enabled, faq_shortcut_items,
    map_enabled, map_embed
  ) VALUES (
    'default',
    'Get in touch',
    'We''d love to hear from you. Send us a message and our team will respond within one business day.',
    '+880 1700-000000',
    'hello@example.com',
    'hello@example.com',
    true,
    'Dhaka, Bangladesh',
    true,
    'Send Message',
    true,
    '[{"label":"Facebook","url":"https://facebook.com"},{"label":"Instagram","url":"https://instagram.com"}]'::jsonb,
    true,
    '[]'::jsonb,
    false,
    ''
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS _contact = ROW_COUNT;

  -- footer_settings (single row, id='default')
  INSERT INTO public.footer_settings (
    id, store_name, description, email, phone, address, copyright_text,
    social_links, quick_links, customer_care_links, newsletter_enabled
  ) VALUES (
    'default',
    'Your Store',
    'Curated products crafted with care. Thank you for shopping with us.',
    'hello@example.com',
    '+880 1700-000000',
    'Dhaka, Bangladesh',
    '© {year} Your Store. All rights reserved.',
    '[
      {"platform":"facebook","url":"https://facebook.com","enabled":true,"icon_url":""},
      {"platform":"instagram","url":"https://instagram.com","enabled":true,"icon_url":""}
    ]'::jsonb,
    '[
      {"label":"Shop","url":"/shop"},
      {"label":"About","url":"/about"},
      {"label":"Contact","url":"/contact"}
    ]'::jsonb,
    '[
      {"label":"Track Order","url":"/track-order"},
      {"label":"FAQs","url":"/policies/faq"},
      {"label":"Shipping","url":"/policies/shipping"},
      {"label":"Returns","url":"/policies/returns"}
    ]'::jsonb,
    true
  ) ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS _footer = ROW_COUNT;

  -- homepage_sections (multi-row, keyed by id)
  FOR _row IN
    SELECT * FROM (VALUES
      ('hero', 10, '{"headline":"Welcome to Your Store","subheadline":"Discover our curated collection"}'::jsonb),
      ('featured', 20, '{"title":"Featured","subtitle":"Hand-picked favourites"}'::jsonb),
      ('bestsellers', 30, '{"title":"Bestsellers","subtitle":"What everyone is loving"}'::jsonb),
      ('categories_showcase', 40, '{"title":"Shop by Category","subtitle":"Find what you need"}'::jsonb),
      ('brands_showcase', 50, '{"title":"Featured Brands","subtitle":"Brands we love"}'::jsonb),
      ('brand_story', 60, '{"title":"Our Story","text":"We craft each product with attention to detail and a passion for quality.","image":"","cta_text":"Learn more","cta_link":"/about"}'::jsonb),
      ('featured_image', 70, '{"image":"","link":"/shop","alt":"Featured collection"}'::jsonb),
      ('newsletter', 80, '{"title":"Join our newsletter","subtitle":"Get updates on new arrivals and exclusive offers.","button_text":"Subscribe"}'::jsonb),
      ('why_choose_us', 90, '{"title":"Why Choose Us","subtitle":"What sets us apart"}'::jsonb),
      ('testimonials', 100, '{"title":"What Customers Say","subtitle":"Real reviews from real customers"}'::jsonb),
      ('video_reels', 110, '{"title":"Video Reviews","subtitle":"See our products in action"}'::jsonb),
      ('faq', 120, '{"title":"Frequently Asked Questions","subtitle":"Everything you need to know"}'::jsonb)
    ) AS v(id, sort_order, content)
  LOOP
    INSERT INTO public.homepage_sections (id, enabled, sort_order, content)
    VALUES (_row.id, true, _row.sort_order, _row.content)
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN _home := _home + 1; END IF;
  END LOOP;

  -- about_sections (multi-row, keyed by id)
  FOR _row IN
    SELECT * FROM (VALUES
      ('header', 10, '{"title":"About Us","intro":"Learn more about who we are and what we stand for."}'::jsonb),
      ('story', 20, '{"headline":"Our Story","text":"We started with a simple idea: bring beautifully crafted products to everyone. Every piece in our collection is chosen with care.","image":""}'::jsonb),
      ('mission_vision', 30, '{"mission":"To deliver premium products that delight our customers every day.","vision":"To be the most trusted destination for curated goods in our market."}'::jsonb),
      ('founder', 40, '{"headline":"A Word from the Founder","message":"Thank you for being part of our journey. Every order supports our small team and inspires us to keep improving.","image":""}'::jsonb),
      ('values', 50, '{"cards":[
        {"icon":"Heart","title":"Made with Care","description":"Every product is checked before it reaches you."},
        {"icon":"Shield","title":"Quality First","description":"We never compromise on materials or craftsmanship."},
        {"icon":"Truck","title":"Fast Delivery","description":"Shipped quickly, tracked end-to-end."},
        {"icon":"Sparkles","title":"Customer Love","description":"Real support from real people, always."}
      ]}'::jsonb),
      ('cta', 60, '{"text":"Ready to find your favourite?","button_text":"Shop now","button_link":"/shop"}'::jsonb)
    ) AS v(id, sort_order, content)
  LOOP
    INSERT INTO public.about_sections (id, enabled, sort_order, content)
    VALUES (_row.id, true, _row.sort_order, _row.content)
    ON CONFLICT (id) DO NOTHING;
    IF FOUND THEN _about := _about + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'shop_settings', _shop,
    'contact_settings', _contact,
    'footer_settings', _footer,
    'homepage_sections', _home,
    'about_sections', _about
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_cms_defaults() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_cms_defaults() TO anon, authenticated, service_role;

-- Seed immediately.
SELECT public.ensure_cms_defaults();
