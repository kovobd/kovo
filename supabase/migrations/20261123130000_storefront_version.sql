-- A single global "storefront content version". Any write to a table that the
-- public-* edge functions read bumps it, and the Cloudflare Worker drops its
-- edge-cached copy of the storefront data as soon as the version changes, so
-- admin edits appear on the live site within seconds for every visitor.

create table if not exists public.storefront_version (
  id int primary key default 1 check (id = 1),
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.storefront_version (id, version)
values (1, (extract(epoch from clock_timestamp()) * 1000)::bigint)
on conflict (id) do nothing;

alter table public.storefront_version enable row level security;

drop policy if exists "storefront_version readable" on public.storefront_version;
create policy "storefront_version readable" on public.storefront_version
  for select to anon, authenticated using (true);

grant select on public.storefront_version to anon, authenticated;

create or replace function public.bump_storefront_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.storefront_version
     set version = greatest(version + 1, (extract(epoch from clock_timestamp()) * 1000)::bigint),
         updated_at = now()
   where id = 1;
  return null;
end;
$$;

revoke all on function public.bump_storefront_version() from public, anon, authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'announcement_bar', 'announcement_bar_settings', 'brands', 'categories',
    'delivery_zones', 'design_settings', 'direct_order_channels',
    'featured_categories', 'floating_icons', 'floating_icons_settings',
    'footer_settings', 'hero_settings', 'hero_slides', 'home_faqs',
    'homepage_sections', 'offers', 'product_details', 'product_faqs',
    'product_media', 'product_offers', 'product_tabs', 'product_variants',
    'products', 'reviews', 'service_credentials', 'shop_settings', 'tags',
    'testimonials', 'tracking_pixels', 'video_testimonials',
    'whatsapp_settings', 'why_choose_us_cards'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists bump_storefront_version on public.%I', t);
      execute format(
        'create trigger bump_storefront_version after insert or update or delete or truncate on public.%I '
        'for each statement execute function public.bump_storefront_version()', t);
    end if;
  end loop;
end $$;
