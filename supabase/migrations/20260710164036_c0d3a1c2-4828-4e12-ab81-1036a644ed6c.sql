DO $$
DECLARE
  v_cat_chokers uuid;
  v_cat_rings uuid;
  v_cat_pendants uuid;
  v_cat_bracelets uuid;
  v_cat_earrings uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.categories) THEN
    INSERT INTO public.categories (name, slug, sort_order, level, category_type, path, full_slug, enabled) VALUES
      ('Chokers','chokers',10,1,'category','chokers','chokers',true),
      ('Rings','rings',20,1,'category','rings','rings',true),
      ('Pendants','pendants',30,1,'category','pendants','pendants',true),
      ('Bracelets','bracelets',40,1,'category','bracelets','bracelets',true),
      ('Earrings','earrings',50,1,'category','earrings','earrings',true);
  END IF;

  SELECT id INTO v_cat_chokers   FROM public.categories WHERE slug='chokers'   LIMIT 1;
  SELECT id INTO v_cat_rings     FROM public.categories WHERE slug='rings'     LIMIT 1;
  SELECT id INTO v_cat_pendants  FROM public.categories WHERE slug='pendants'  LIMIT 1;
  SELECT id INTO v_cat_bracelets FROM public.categories WHERE slug='bracelets' LIMIT 1;
  SELECT id INTO v_cat_earrings  FROM public.categories WHERE slug='earrings'  LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM public.products) THEN
    v_p1 := gen_random_uuid(); v_p2 := gen_random_uuid(); v_p3 := gen_random_uuid();
    v_p4 := gen_random_uuid(); v_p5 := gen_random_uuid();

    INSERT INTO public.products
      (id,name,slug,short_description,description,sku,category_id,price,sale_price,base_price,stock,rating,review_count,featured,best_seller,is_new_arrival,status,sort_order) VALUES
      (v_p1,'Obsidian Bat Pendant','obsidian-bat-pendant',
       'Hand-cast silver bat pendant on a slender chain.',
       'A quiet talisman for the night. Cast in tarnish-resistant silver alloy and finished with a matte obsidian inlay, the Obsidian Bat glides on a 45cm cable chain with a secure lobster clasp. Weight: 6g. Nickel-free.',
       'GV-PEN-001',v_cat_pendants,1890,1490,1890,40,4.9,42,true,true,true,'active',10),
      (v_p2,'Velvet Rose Choker','velvet-rose-choker',
       'Black velvet band with an antique-silver rose charm.',
       'Soft Italian velvet meets an oxidised silver rose. Adjustable 32–40cm with a lobster clasp and 5cm extender. A romantic, understated statement for evening wear.',
       'GV-CHO-002',v_cat_chokers,1490,NULL,1490,55,4.8,31,true,true,false,'active',20),
      (v_p3,'Raven Skull Signet Ring','raven-skull-signet-ring',
       'Sculpted skull signet in oxidised sterling silver.',
       'A weighty signet detailed with a raven skull motif and hand-antiqued shadowing. Available in sizes 6–11. Solid 925 sterling silver, rhodium finished for lasting depth.',
       'GV-RIN-003',v_cat_rings,2290,1990,2290,30,4.7,58,true,false,false,'active',30),
      (v_p4,'Moonstone Cathedral Earrings','moonstone-cathedral-earrings',
       'Gothic-arch drop earrings with milky moonstone.',
       'Slim cathedral arches frame ethical moonstone cabochons that catch light like distant candles. Length 42mm. Surgical-steel posts for sensitive ears.',
       'GV-EAR-004',v_cat_earrings,1690,NULL,1690,60,4.9,24,true,false,true,'active',40),
      (v_p5,'Iron Chain Bracelet','iron-chain-bracelet',
       'Heavy curb chain in blackened stainless steel.',
       'A confident wrist piece: 9mm blackened curb links with a boxed clasp. 19cm, unisex fit. Waterproof, hypoallergenic, built to outlast the season.',
       'GV-BRA-005',v_cat_bracelets,1790,1490,1790,45,4.6,19,false,true,false,'active',50);

    INSERT INTO public.product_media (product_id,image_url,alt_text,type,sort_order) VALUES
      (v_p1,'https://images.unsplash.com/photo-1611652022419-a9419f74343d?w=1200&q=80','Obsidian bat pendant','image',0),
      (v_p1,'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=1200&q=80','Bat pendant detail','image',1),
      (v_p2,'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?w=1200&q=80','Velvet rose choker','image',0),
      (v_p2,'https://images.unsplash.com/photo-1573408301185-9146fe634ad0?w=1200&q=80','Choker detail','image',1),
      (v_p3,'https://images.unsplash.com/photo-1603561596112-db542066e63c?w=1200&q=80','Raven skull signet ring','image',0),
      (v_p3,'https://images.unsplash.com/photo-1595781572981-d63151b232ed?w=1200&q=80','Signet ring worn','image',1),
      (v_p4,'https://images.unsplash.com/photo-1635767798638-3665c302e27c?w=1200&q=80','Moonstone cathedral earrings','image',0),
      (v_p4,'https://images.unsplash.com/photo-1630019852942-f89202989a59?w=1200&q=80','Earring detail','image',1),
      (v_p5,'https://images.unsplash.com/photo-1620656798579-1984d9e87df7?w=1200&q=80','Iron chain bracelet','image',0),
      (v_p5,'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=1200&q=80','Chain bracelet detail','image',1);

    INSERT INTO public.product_faqs (product_id,question,answer,sort_order) VALUES
      (v_p1,'Is the chain nickel-free?','Yes — all chains are hypoallergenic and nickel-free.',0),
      (v_p1,'How long is the chain?','The standard chain is 45cm with a 5cm extender.',1),
      (v_p3,'Which ring sizes are available?','Sizes 6 through 11. See the size guide in the tab above.',0);

    INSERT INTO public.product_details (product_id,label,value,sort_order) VALUES
      (v_p1,'Material','Silver alloy, matte obsidian inlay',0),
      (v_p1,'Weight','6g',1),
      (v_p3,'Material','925 Sterling Silver',0),
      (v_p3,'Finish','Rhodium, hand-antiqued shadowing',1);

    INSERT INTO public.reviews (product_id,customer_name,rating,review) VALUES
      (v_p1,'Rifah A.',5,'Even more beautiful in person. The bat catches candlelight perfectly.'),
      (v_p2,'Nusrat J.',5,'The velvet is so soft and the rose charm is stunning. Fast delivery too.'),
      (v_p3,'Sadia H.',5,'Heavier than expected in the best way. Feels like a real heirloom.'),
      (v_p4,'Tasnim R.',4,'Delicate and elegant. Moonstone glow is real.'),
      (v_p5,'Farhan K.',5,'Perfect weight, blackened finish looks incredible.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.featured_categories) AND v_cat_chokers IS NOT NULL THEN
    INSERT INTO public.featured_categories (category_id,title,enabled,sort_order) VALUES
      (v_cat_chokers,'Chokers',true,10),
      (v_cat_pendants,'Pendants',true,20),
      (v_cat_rings,'Rings',true,30),
      (v_cat_earrings,'Earrings',true,40),
      (v_cat_bracelets,'Bracelets',true,50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.hero_slides) THEN
    INSERT INTO public.hero_slides (image_url,mobile_image_url,headline,subheadline,button1_text,button1_link,sort_order,enabled,interaction_mode) VALUES
      ('https://images.unsplash.com/photo-1517263904808-5dc91e3e7044?w=1920&q=80',
       'https://images.unsplash.com/photo-1517263904808-5dc91e3e7044?w=800&q=80',
       'Enter the Vault','Gothic accessories, hand-cast in shadow.','Shop Now','/shop',10,true,'buttons'),
      ('https://images.unsplash.com/photo-1519227354691-3c1a2ae1b58c?w=1920&q=80',
       'https://images.unsplash.com/photo-1519227354691-3c1a2ae1b58c?w=800&q=80',
       'The Raven Collection','New pieces crafted for the twilight hour.','Explore','/shop',20,true,'buttons');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.why_choose_us_cards) THEN
    INSERT INTO public.why_choose_us_cards (title,description,icon_name,sort_order) VALUES
      ('Hand-Cast Craft','Every piece finished by hand in small batches.','Hammer',10),
      ('Tarnish-Resistant','Sealed alloys and rhodium finishes made to endure.','Shield',20),
      ('Hypoallergenic','Nickel-free posts and hardware, safe for sensitive skin.','Heart',30),
      ('Cash on Delivery','Pay when it arrives. Nationwide delivery in Bangladesh.','Truck',40);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.home_faqs) THEN
    INSERT INTO public.home_faqs (question,answer,sort_order) VALUES
      ('Are your pieces nickel-free?','Yes — every Gothic Vault piece is hypoallergenic and nickel-free.',10),
      ('How fast is delivery?','Inside Dhaka: 1–2 business days. Outside Dhaka: 3–5 business days.',20),
      ('Do you offer exchanges?','Yes, 7-day easy exchange if the piece is unworn and in original packaging.',30),
      ('Is Cash on Delivery available?','Absolutely. COD is available nationwide across Bangladesh.',40),
      ('How do I care for silver pieces?','Wipe with a soft cloth after wear and store in the pouch provided to preserve the finish.',50);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.testimonials) THEN
    INSERT INTO public.testimonials (name,review,rating,image_url,sort_order) VALUES
      ('Rifah A.','Gothic Vault has completely changed my accessory game. Every piece feels like a treasure.',5,'',10),
      ('Nusrat J.','Beautifully packaged and the quality is unmatched at this price. Shipping was quick too.',5,'',20),
      ('Sadia H.','The signet ring is incredibly detailed. Feels like something out of an old cathedral.',5,'',30),
      ('Tasnim R.','Delicate, elegant, and eerie in the best possible way. I already ordered a second piece.',5,'',40);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.site_reviews) THEN
    INSERT INTO public.site_reviews (reviewer_name,location,title,body,rating,is_verified_purchase,is_visible,sort_order) VALUES
      ('Rifah A.','Dhaka','Absolutely stunning','The Obsidian Bat pendant is even more beautiful in person. Fast delivery and lovely packaging.',5,true,true,10),
      ('Nusrat J.','Chattogram','Feels premium','Wore the Velvet Rose Choker to an event and got compliments all night. Quality is next level.',5,true,true,20),
      ('Sadia H.','Sylhet','Heirloom energy','The Raven Skull Ring is heavy, detailed, and darkly elegant. Worth every taka.',5,true,true,30),
      ('Tasnim R.','Dhaka','My new favourite brand','Everything from Gothic Vault feels intentional — the mood, the packaging, the pieces.',5,true,true,40),
      ('Farhan K.','Rajshahi','Great for men too','The Iron Chain Bracelet fits perfectly and the blackened finish looks incredible.',5,true,true,50),
      ('Anika M.','Khulna','Delicate and moody','Moonstone Cathedral earrings glow in low light — exactly what I wanted.',4,true,true,60);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.policies) THEN
    INSERT INTO public.policies (slug,title,content,enabled,sort_order) VALUES
      ('shipping','Shipping Policy',
'## Delivery Areas

We deliver nationwide across Bangladesh.

- **Inside Dhaka:** 1–2 business days
- **Outside Dhaka:** 3–5 business days

## Charges

Delivery charges are calculated at checkout based on your area.

## Order Tracking

Once dispatched, you will receive an SMS with your tracking details.',true,10),
      ('returns','Return & Exchange',
'We offer a **7-day easy exchange** on unworn pieces in their original packaging.

## Eligibility

- Item must be unused and undamaged
- Original pouch, box and tags intact
- Request placed within 7 days of delivery

## How to Request

Contact us via WhatsApp or the Contact page with your order number and reason. We''ll arrange pickup or a drop-off point.',true,20),
      ('refund','Refund Policy',
'Refunds are processed within **5–7 business days** to your original payment method (or via bKash for COD orders) once the returned item passes quality inspection.

For damaged or wrong items, we cover return shipping in full.',true,30),
      ('privacy','Privacy Policy',
'Gothic Vault respects your privacy. We collect only the information needed to fulfil your order and improve your experience.

- We never sell your personal data
- Payment details are handled by trusted providers
- You may request deletion of your data at any time via our Contact page',true,40),
      ('terms','Terms & Conditions',
'By using gothicvault.shop you agree to our terms of sale and website use. Product colours may vary slightly due to screen calibration. All designs and imagery are property of Gothic Vault and may not be reproduced without permission.',true,50),
      ('faq','FAQ',
'### Are pieces hypoallergenic?
Yes — nickel-free and safe for sensitive skin.

### Do you ship outside Bangladesh?
Not yet, but international shipping is on our roadmap.

### Can I pay Cash on Delivery?
Yes, COD is available on all orders nationwide.',true,60);
  END IF;

  UPDATE public.contact_settings SET
    page_title='Reach the Vault',
    page_intro='Questions about a piece, a custom request, or a bulk order? Send us a note — our team replies within one business day.',
    business_address='Dhaka, Bangladesh',
    social_links='[{"label":"Facebook","url":"https://facebook.com/gothicvault"},{"label":"Instagram","url":"https://instagram.com/gothicvault"},{"label":"TikTok","url":"https://tiktok.com/@gothicvault"}]'::jsonb,
    faq_shortcut_enabled=true,
    faq_shortcut_items='[{"question":"How long does delivery take?","answer":"1–2 days inside Dhaka, 3–5 days outside."},{"question":"Is Cash on Delivery available?","answer":"Yes, nationwide across Bangladesh."},{"question":"Do you accept exchanges?","answer":"Yes — 7 days on unworn pieces in original packaging."}]'::jsonb
  WHERE id='default' AND page_title='Get in touch';

  UPDATE public.footer_settings SET
    store_name='Gothic Vault',
    description='Hand-cast gothic accessories for those drawn to the beautiful and strange.',
    email='hello@gothicvault.shop',
    address='Dhaka, Bangladesh',
    copyright_text='© {year} Gothic Vault. All rights reserved.',
    social_links='[{"platform":"facebook","url":"https://facebook.com/gothicvault","enabled":true,"icon_url":""},{"platform":"instagram","url":"https://instagram.com/gothicvault","enabled":true,"icon_url":""},{"platform":"tiktok","url":"https://tiktok.com/@gothicvault","enabled":true,"icon_url":""}]'::jsonb
  WHERE id='default' AND store_name='Your Store';

  UPDATE public.homepage_sections SET content=jsonb_build_object(
    'headline','Enter the Vault','subheadline','Hand-cast gothic accessories for the quiet, curious, and untamed.'
  ) WHERE id='hero' AND content->>'headline'='Welcome to Your Store';

  UPDATE public.homepage_sections SET content=jsonb_build_object('title','Featured Relics','subtitle','Pieces we can''t stop wearing.')
    WHERE id='featured' AND content->>'title'='Featured';
  UPDATE public.homepage_sections SET content=jsonb_build_object('title','Bestsellers','subtitle','The vault''s most-loved talismans.')
    WHERE id='bestsellers' AND content->>'subtitle'='What everyone is loving';
  UPDATE public.homepage_sections SET content=jsonb_build_object('title','Shop by Category','subtitle','Chokers, rings, pendants and more.')
    WHERE id='categories_showcase' AND content->>'subtitle'='Find what you need';

  UPDATE public.homepage_sections SET content=jsonb_build_object(
    'title','Our Story',
    'text','Gothic Vault began in a small Dhaka studio with a single obsession: heirloom-quality accessories with a dark, quiet soul. Every piece is hand-finished, small-batch, and made to be worn for years — not seasons.',
    'image','','cta_text','Read our story','cta_link','/about'
  ) WHERE id='brand_story' AND content->>'text' LIKE 'We craft each product%';

  UPDATE public.homepage_sections SET content=jsonb_build_object(
    'title','Join the Coven','subtitle','Early access to drops, private sales, and rituals of care for your pieces.','button_text','Subscribe'
  ) WHERE id='newsletter' AND content->>'title'='Join our newsletter';

  UPDATE public.homepage_sections SET content=jsonb_build_object('title','Why Gothic Vault','subtitle','Quiet luxury with a darker edge.')
    WHERE id='why_choose_us' AND content->>'subtitle'='What sets us apart';
  UPDATE public.homepage_sections SET content=jsonb_build_object('title','From the Coven','subtitle','Real words from real wearers.')
    WHERE id='testimonials' AND content->>'subtitle'='Real reviews from real customers';
  UPDATE public.homepage_sections SET content=jsonb_build_object('title','Frequently Asked','subtitle','Everything you might want to know.')
    WHERE id='faq' AND content->>'title'='Frequently Asked Questions';

  UPDATE public.about_sections SET content=jsonb_build_object(
    'title','About Gothic Vault',
    'intro','A small Dhaka studio crafting accessories for those drawn to the quiet and the strange.'
  ) WHERE id='header' AND content->>'title'='About Us';

  UPDATE public.about_sections SET content=jsonb_build_object(
    'headline','Our Story',
    'text','Gothic Vault was born from a love of old cathedrals, dark romance and heirloom jewellery. What started as a handful of hand-cast bat pendants for friends grew into a studio quietly obsessed with detail — every clasp, every finish, every weight in the hand.

We work in small batches with skilled local artisans. No mass production. No fast-fashion churn. Just pieces we would wear ourselves, ready to age gracefully with you.',
    'image',''
  ) WHERE id='story' AND content->>'text' LIKE 'We started with a simple idea%';

  UPDATE public.about_sections SET content=jsonb_build_object(
    'mission','To make thoughtful, wearable gothic accessories that feel like heirlooms — beautiful, durable, and unmistakably you.',
    'vision','To be South Asia''s most-loved home for dark alternative jewellery, without ever losing our small-studio soul.'
  ) WHERE id='mission_vision' AND content->>'mission' LIKE 'To deliver premium products%';

  UPDATE public.about_sections SET content=jsonb_build_object(
    'headline','A Note from the Founder',
    'message','Gothic Vault is a love letter to everyone who has ever felt a little in-between — drawn to beauty, but also to shadow. Thank you for wearing our work. Every order keeps the studio candles burning.',
    'image',''
  ) WHERE id='founder' AND content->>'headline'='A Word from the Founder';

  UPDATE public.about_sections SET content=jsonb_build_object(
    'cards', jsonb_build_array(
      jsonb_build_object('icon','Hammer','title','Hand-Cast','description','Small-batch pieces, finished by hand in Dhaka.'),
      jsonb_build_object('icon','Shield','title','Built to Last','description','Tarnish-resistant alloys and secure clasps.'),
      jsonb_build_object('icon','Heart','title','Skin-Safe','description','Hypoallergenic, nickel-free hardware.'),
      jsonb_build_object('icon','Sparkles','title','Quiet Ritual','description','Each piece arrives in a keepsake pouch.')
    )
  ) WHERE id='values' AND content->'cards'->0->>'title'='Made with Care';

  UPDATE public.about_sections SET content=jsonb_build_object(
    'text','Find your talisman.','button_text','Enter the Vault','button_link','/shop'
  ) WHERE id='cta' AND content->>'text'='Ready to find your favourite?';
END $$;