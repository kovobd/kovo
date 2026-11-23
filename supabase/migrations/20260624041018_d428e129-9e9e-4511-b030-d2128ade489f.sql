
-- About sections (Kayafee)
INSERT INTO public.about_sections (id, enabled, sort_order, content) VALUES
('header', true, 1, jsonb_build_object(
  'title', 'About Kayafee',
  'intro', 'A modern ladies fashion and lifestyle house from Dhaka — quietly luxurious, thoughtfully made, and crafted for the everyday woman.'
)),
('story', true, 2, jsonb_build_object(
  'headline', 'Our Story',
  'text', 'Kayafee was born from a simple belief — that everyday style deserves the same care as occasion wear. We began in a small studio in Savar DOHS with a handful of silhouettes, a focused color palette, and an obsession with how a garment falls on a real body.

Today we curate ladies fashion, lifestyle pieces and accessories that feel modern, calm and confidently feminine. Every piece is chosen for fabric, fit and finish — never for noise.',
  'image', ''
)),
('mission_vision', true, 3, jsonb_build_object(
  'mission', 'To make refined, well-made fashion accessible to the modern Bangladeshi woman — without compromise on craft, comfort or character.',
  'vision', 'To become South Asia''s most loved quiet-luxury label for women — known for timeless silhouettes, considered details and an honest customer experience.'
)),
('founder', true, 4, jsonb_build_object(
  'headline', 'A Note from the Founder',
  'message', 'Kayafee is personal. It started as a wardrobe I wanted for myself — pieces that feel calm in the morning rush and elegant by evening. Thank you for letting us be a small part of your story.',
  'image', ''
)),
('values', true, 5, jsonb_build_object(
  'cards', jsonb_build_array(
    jsonb_build_object('title','Crafted Quality','description','Considered fabrics, clean seams and finishing details you can feel.','icon','Sparkles'),
    jsonb_build_object('title','Quiet Luxury','description','Refined silhouettes and a calm palette — designed to last beyond a season.','icon','Gem'),
    jsonb_build_object('title','Made for Her','description','Cut and curated for real women — comfort, fit and confidence first.','icon','Heart'),
    jsonb_build_object('title','Honest Service','description','Transparent pricing, careful packing and customer care that actually listens.','icon','ShieldCheck')
  )
)),
('cta', true, 6, jsonb_build_object(
  'text', 'Discover pieces made to live in.',
  'button_text', 'Shop the collection',
  'button_link', '/shop'
))
ON CONFLICT (id) DO UPDATE SET enabled = EXCLUDED.enabled, sort_order = EXCLUDED.sort_order, content = EXCLUDED.content, updated_at = now();

-- Contact settings
INSERT INTO public.contact_settings (id, page_title, page_intro, phone_number, email_address, receiving_email, show_address, business_address, phone_field_enabled, submit_button_text, social_section_enabled, faq_shortcut_enabled, map_enabled)
VALUES ('default',
  'Get in Touch',
  'Have a question about an order, sizing or styling? Our team in Dhaka is happy to help — usually within a few hours.',
  '+880 1700-000000',
  'hello@kayafee.com',
  'hello@kayafee.com',
  true,
  'Kayafee Studio, Savar DOHS, Dhaka 1344, Bangladesh',
  true,
  'Send Message',
  false,
  false,
  false
)
ON CONFLICT (id) DO UPDATE SET
  page_title = EXCLUDED.page_title,
  page_intro = EXCLUDED.page_intro,
  phone_number = COALESCE(NULLIF(public.contact_settings.phone_number,''), EXCLUDED.phone_number),
  email_address = COALESCE(NULLIF(public.contact_settings.email_address,''), EXCLUDED.email_address),
  show_address = EXCLUDED.show_address,
  business_address = COALESCE(NULLIF(public.contact_settings.business_address,''), EXCLUDED.business_address),
  phone_field_enabled = EXCLUDED.phone_field_enabled,
  submit_button_text = EXCLUDED.submit_button_text,
  updated_at = now();

-- Policies
INSERT INTO public.policies (slug, title, content, enabled, sort_order) VALUES
('shipping', 'Shipping Policy',
'At Kayafee, we ship across Bangladesh through trusted courier partners.

**Delivery timelines**
- Inside Dhaka: 1–2 business days
- Outside Dhaka: 2–4 business days

**Shipping charges**
Standard shipping charges apply at checkout based on your delivery zone. Free delivery is offered on qualifying orders — the threshold is shown in your cart.

**Order processing**
Orders placed before 3:00 PM are processed the same day. Orders placed after, on weekends, or on public holidays are processed the next business day.

**Tracking**
Once dispatched, you''ll receive an SMS / email with your tracking details. You can also track your order anytime from our Track Order page.',
true, 1),
('returns', 'Return & Exchange Policy',
'We want you to love what you wear.

**Eligibility**
- Returns and exchanges are accepted within **3 days** of delivery.
- Items must be unworn, unwashed, with original tags and packaging intact.
- Sale items, intimates and accessories are not eligible for return.

**How to request**
Message us on WhatsApp or email hello@kayafee.com with your order number and a clear photo of the item. Our team will guide you through the next steps.

**Exchanges**
Subject to stock availability, we''re happy to exchange for a different size or another piece of equal value.',
true, 2),
('refund', 'Refund Policy',
'Refunds are issued for verified return requests once we receive and inspect the returned item.

**Method**
- Online payments are refunded to the original payment method within 7–10 business days.
- Cash on Delivery orders are refunded via bKash / bank transfer.

**Non-refundable**
Original shipping charges and any COD fees are non-refundable unless the item received was damaged or incorrect.',
true, 3),
('privacy', 'Privacy Policy',
'Your privacy matters to us.

**What we collect**
Name, contact details, delivery address and order history — used only to process your orders and improve your experience.

**How we use it**
- To fulfil and deliver your orders
- To send important order updates
- To respond to your enquiries
- To send marketing updates only if you''ve opted in

**Sharing**
We share minimum necessary details with our courier partners and payment processors. We never sell your data.

**Your rights**
You may request access, correction or deletion of your personal data by emailing hello@kayafee.com.',
true, 4),
('terms', 'Terms & Conditions',
'By using kayafee.com you agree to the following terms.

**Orders**
All orders are subject to availability and confirmation of the order price. We reserve the right to cancel an order in case of incorrect pricing or stock issues — you''ll be refunded in full.

**Pricing**
All prices are listed in Bangladeshi Taka (৳) and are inclusive of applicable taxes unless stated otherwise.

**Intellectual property**
All content on this site — including photography, copy and logos — is the property of Kayafee and may not be reused without written permission.

**Governing law**
These terms are governed by the laws of Bangladesh. Any dispute shall be resolved in the courts of Dhaka.',
true, 5),
('faq', 'Frequently Asked Questions',
'**How do I place an order?**
Add your favourite pieces to the cart and checkout — you can pay online or choose Cash on Delivery.

**Do you ship outside Dhaka?**
Yes, we ship across Bangladesh. Delivery typically takes 2–4 business days outside Dhaka.

**How do I know my size?**
Each product page includes a size guide. If you''re between sizes, message us on WhatsApp and we''ll help you choose.

**Can I change or cancel my order?**
Reach out within 12 hours of placing your order and we''ll do our best to accommodate the change.

**How do I contact you?**
Email hello@kayafee.com or message us on WhatsApp — we usually reply within a few hours.',
true, 6)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  content = EXCLUDED.content,
  enabled = EXCLUDED.enabled,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Footer copyright
UPDATE public.footer_settings
SET copyright_text = '© 2026 Kayafee. All rights reserved.', updated_at = now()
WHERE id = 'default';

INSERT INTO public.footer_settings (id, store_name, copyright_text)
SELECT 'default', 'Kayafee', '© 2026 Kayafee. All rights reserved.'
WHERE NOT EXISTS (SELECT 1 FROM public.footer_settings WHERE id = 'default');
