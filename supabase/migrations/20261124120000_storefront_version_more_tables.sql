-- The About, Contact, Policies and Reviews pages and the cart/checkout
-- settings are now served from the Worker's edge cache too (/api/public/rest/,
-- see worker/index.ts), so changes to their tables must bump the storefront
-- version like the other storefront tables (20261123130000).
do $$
declare t text;
begin
  foreach t in array array[
    'about_sections', 'contact_settings', 'policies', 'site_reviews',
    'site_review_media', 'review_hero_settings', 'payment_settings'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop trigger if exists bump_storefront_version on public.%I', t);
    execute format(
      'create trigger bump_storefront_version after insert or update or delete or truncate on public.%I
         for each statement execute function public.bump_storefront_version()', t);
  end loop;
end $$;
