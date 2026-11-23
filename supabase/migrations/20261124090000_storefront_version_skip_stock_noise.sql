-- Orders change stock, and every change bumped storefront_version, which
-- empties the Worker's page and data caches (see 20261123130000). On a busy
-- day that meant most visitors got uncached, browser-rendered pages.
--
-- Stock only shows on the storefront as "in stock" (more than 10),
-- "Only N left" (1-10) or "Sold out". So an UPDATE now bumps the version
-- unless every changed row differs only in stock/updated_at AND its stock
-- stays above 10 both before and after (nothing visible changes then).
-- INSERT, DELETE and TRUNCATE still always bump.
--
-- (Variant stock: if every changed variant stays above 10, the product's
-- total does too, so the aggregate display cannot change either.)

create or replace function public.bump_storefront_version_on_update()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  visible_change boolean;
begin
  select exists (
    select 1
      from old_rows o
      join new_rows n on (to_jsonb(n) ->> 'id') = (to_jsonb(o) ->> 'id')
     where (to_jsonb(o) - 'stock' - 'updated_at') is distinct from (to_jsonb(n) - 'stock' - 'updated_at')
        or (
             (to_jsonb(o) -> 'stock') is distinct from (to_jsonb(n) -> 'stock')
             and (coalesce((to_jsonb(o) ->> 'stock')::numeric, 0) <= 10
                  or coalesce((to_jsonb(n) ->> 'stock')::numeric, 0) <= 10)
           )
  )
  -- A changed primary key (never done, but be safe) shows up as unmatched rows.
  or (select count(*) from old_rows o join new_rows n on (to_jsonb(n) ->> 'id') = (to_jsonb(o) ->> 'id'))
     <> (select count(*) from new_rows)
  into visible_change;

  if visible_change then
    update public.storefront_version
       set version = greatest(version + 1, (extract(epoch from clock_timestamp()) * 1000)::bigint),
           updated_at = now()
     where id = 1;
  end if;
  return null;
end;
$function$;

do $$
declare t text;
begin
  foreach t in array array['products', 'product_variants'] loop
    execute format('drop trigger if exists bump_storefront_version on public.%I', t);
    execute format(
      'create trigger bump_storefront_version after insert or delete or truncate on public.%I
         for each statement execute function public.bump_storefront_version()', t);
    -- Transition tables need a trigger with a single event.
    execute format(
      'create trigger bump_storefront_version_update after update on public.%I
         referencing old table as old_rows new table as new_rows
         for each statement execute function public.bump_storefront_version_on_update()', t);
  end loop;
end $$;
