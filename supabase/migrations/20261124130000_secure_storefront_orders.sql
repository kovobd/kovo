-- Storefront orders: server-side checks, and no public write access to stock,
-- coupons or customer records.
--
-- Before this, checkout did everything from the browser with functions anyone
-- could call without logging in: decrement_*_stock (any product, any amount:
-- anyone could mark the whole shop sold out), increment_coupon_usage (use up
-- any coupon) and upsert_checkout_customer (rewrite any customer's details
-- and totals). Order prices and totals were also taken from the browser as-is.
--
-- Now:
--  1. Orders placed from the shop are checked on insert (totals add up, every
--     item exists, no forged prices or free items, status fields start fresh).
--  2. finalize_storefront_order(order id) does the follow-up work once, using
--     only the stored order: stock, coupon usage, customer record.
--  3. The old functions need an admin/staff login (the admin's POS, order
--     editor and recovery tools still use them).
--  4. The courier columns and tables (Steadfast, EcomDrive) that earlier
--     migrations add but this database never received are restored.

-- ── 4. Courier schema (idempotent; scheduled jobs intentionally left out) ──
alter table public.orders
  add column if not exists steadfast_consignment_id text,
  add column if not exists steadfast_tracking_code text,
  add column if not exists steadfast_status text,
  add column if not exists last_status_sync_time timestamptz,
  add column if not exists courier_sync_failed boolean not null default false,
  add column if not exists courier_last_error text,
  add column if not exists ecomdrive_status text not null default 'not_pushed',
  add column if not exists ecomdrive_order_id text,
  add column if not exists ecomdrive_invoice_number text,
  add column if not exists ecomdrive_courier_name text,
  add column if not exists ecomdrive_courier_method_id text,
  add column if not exists ecomdrive_pushed_at timestamptz,
  add column if not exists ecomdrive_response jsonb,
  add column if not exists ecomdrive_error text,
  add column if not exists ecomdrive_retry_count integer not null default 0,
  add column if not exists ecomdrive_failed_payload jsonb,
  add column if not exists ecomdrive_tracking_id text,
  add column if not exists ecomdrive_rider_name text,
  add column if not exists ecomdrive_rider_phone text,
  add column if not exists ecomdrive_last_status_sync timestamptz,
  add column if not exists ecomdrive_next_retry_at timestamptz,
  -- When finalize_storefront_order() applied this order's stock/coupon/customer.
  add column if not exists finalized_at timestamptz;

create index if not exists idx_orders_steadfast_sync on public.orders (courier_sync_failed, steadfast_consignment_id, order_status);
create index if not exists idx_orders_ecomdrive_status on public.orders (ecomdrive_status);
create index if not exists idx_orders_ecomdrive_next_retry on public.orders (ecomdrive_next_retry_at) where ecomdrive_status = 'failed';

create table if not exists public.ecomdrive_settings (
  id text primary key default 'default',
  enabled boolean not null default false,
  business_id text not null default '',
  api_base_url text not null default 'https://app.ecomdrive.com/api/external',
  default_courier_method_id text,
  default_delivery_charge numeric not null default 60,
  auto_push boolean not null default false,
  auto_sync_tracking boolean not null default true,
  retry_failed boolean not null default true,
  sandbox_mode boolean not null default false,
  enable_logs boolean not null default true,
  api_timeout_ms integer not null default 15000,
  last_test_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
alter table public.ecomdrive_settings enable row level security;
insert into public.ecomdrive_settings (id) values ('default') on conflict (id) do nothing;

create table if not exists public.ecomdrive_courier_methods (
  method_id text primary key,
  name text not null,
  courier text not null,
  requires_location_data boolean not null default false,
  enabled boolean not null default true,
  sort_order integer not null default 0,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
alter table public.ecomdrive_courier_methods enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ecomdrive_settings') then
    create policy "Admin can manage ecomdrive settings" on public.ecomdrive_settings for all to authenticated
      using (public.has_role(auth.uid(), 'admin'::app_role)) with check (public.has_role(auth.uid(), 'admin'::app_role));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ecomdrive_courier_methods') then
    create policy "Admin/staff can manage ecomdrive courier methods" on public.ecomdrive_courier_methods for all to authenticated
      using (public.is_admin_or_staff(auth.uid())) with check (public.is_admin_or_staff(auth.uid()));
    create policy "Public can read enabled ecomdrive courier methods" on public.ecomdrive_courier_methods for select to public
      using (enabled = true);
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_ecomdrive_settings_updated_at') then
    create trigger trg_ecomdrive_settings_updated_at before update on public.ecomdrive_settings
      for each row execute function public.update_updated_at_column();
  end if;
end $$;

-- ── 1. Checks on orders placed from the shop ──────────────────────────────
create or replace function public.orders_check_storefront_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  it jsonb;
  pid uuid;
  vid uuid;
  qty integer;
  price numeric;
  lines numeric := 0;
  lowest numeric;
  max_pct numeric;
  max_fixed numeric;
  floor_price numeric;
begin
  -- Admin/staff orders (POS, order editor, recovery) are entered by hand.
  if auth.uid() is not null and public.is_admin_or_staff(auth.uid()) then
    return new;
  end if;

  -- A new shop order always starts unpaid, unshipped and unprocessed.
  new.order_status := 'pending';
  new.payment_status := 'pending';
  new.paid_at := null;
  new.restocked_at := null;
  new.deleted_at := null;
  new.finalized_at := null;
  new.is_pos := false;
  new.tracking_number := null;
  new.delivery_partner := null;
  new.steadfast_consignment_id := null;
  new.ecomdrive_status := 'not_pushed';
  new.created_at := now();
  if coalesce(new.payment_method, '') = '' then new.payment_method := 'cod'; end if;

  -- Largest storewide price cut any active offer could give a line (generous
  -- on purpose: this check only stops grossly forged prices).
  select coalesce(max(discount_value) filter (where discount_type = 'percentage'), 0),
         coalesce(max(discount_value) filter (where discount_type <> 'percentage'), 0)
    into max_pct, max_fixed
    from public.offers
   where enabled
     and (start_date is null or start_date <= now())
     and (end_date is null or end_date > now());

  for it in select * from jsonb_array_elements(new.items) loop
    begin
      qty := (it->>'quantity')::integer;
      price := (it->>'price')::numeric;
      pid := nullif(it->>'product_id', '')::uuid;
      vid := nullif(it->>'variant_id', '')::uuid;
    exception when others then
      raise exception 'Invalid order item' using errcode = 'check_violation';
    end;
    if qty is null or qty < 1 or qty > 100 then
      raise exception 'Invalid quantity' using errcode = 'check_violation';
    end if;
    if price is null or price < 0 or pid is null then
      raise exception 'Invalid order item' using errcode = 'check_violation';
    end if;

    if coalesce((it->>'is_free_gift')::boolean, false) then
      if price <> 0 or not exists (
        select 1 from public.product_offers o
         where o.enabled and (o.free_product_id = pid or o.product_id = pid)
      ) then
        raise exception 'This free item is not part of an active offer' using errcode = 'check_violation';
      end if;
      continue;
    end if;

    -- Lowest price this product (or the chosen variant) can have.
    if vid is not null then
      select least(nullif(v.price, 0), nullif(v.sale_price, 0)) into lowest
        from public.product_variants v where v.id = vid and v.product_id = pid;
      if not found then
        raise exception 'A product in your cart is no longer available' using errcode = 'check_violation';
      end if;
    else
      select least(
               nullif(p.price, 0), nullif(p.sale_price, 0),
               (select min(least(nullif(v.price, 0), nullif(v.sale_price, 0)))
                  from public.product_variants v where v.product_id = p.id),
               (select min(x::text::numeric)
                  from jsonb_path_query(coalesce(p.option_groups, '[]'::jsonb), 'strict $.**.price') x
                 where jsonb_typeof(x) = 'number' and x::text::numeric > 0)
             )
        into lowest
        from public.products p where p.id = pid;
      if not found then
        raise exception 'A product in your cart is no longer available' using errcode = 'check_violation';
      end if;
    end if;
    floor_price := greatest(0, coalesce(lowest, 0) * (1 - least(max_pct, 100) / 100) - max_fixed);
    if price < floor_price * 0.5 - 1 then
      raise exception 'Prices in your cart have changed. Please refresh the page and try again.' using errcode = 'check_violation';
    end if;

    lines := lines + price * qty;
  end loop;

  if lines <= 0 then
    raise exception 'Your cart is empty' using errcode = 'check_violation';
  end if;
  if coalesce(new.shipping_cost, 0) < 0 or coalesce(new.discount_amount, 0) < 0
     or coalesce(new.discount_amount, 0) > lines then
    raise exception 'Invalid order totals' using errcode = 'check_violation';
  end if;
  -- A discount needs a coupon or an active offer behind it.
  if coalesce(new.discount_amount, 0) > 0
     and not exists (select 1 from public.product_offers where enabled)
     and not exists (select 1 from public.coupons c where new.coupon_code is not null and upper(c.code) = upper(new.coupon_code)) then
    raise exception 'Invalid discount' using errcode = 'check_violation';
  end if;
  if abs(coalesce(new.subtotal, 0) - lines) > 1
     or abs(coalesce(new.total, 0) - greatest(0, lines - coalesce(new.discount_amount, 0) + coalesce(new.shipping_cost, 0))) > 1 then
    raise exception 'Order totals do not add up. Please refresh the page and try again.' using errcode = 'check_violation';
  end if;
  return new;
end
$function$;

drop trigger if exists trg_orders_check_storefront_order on public.orders;
create trigger trg_orders_check_storefront_order
  before insert on public.orders
  for each row execute function public.orders_check_storefront_order();

-- ── 2. Follow-up work for a shop order, done once from the stored order ───
create unique index if not exists uniq_inv_tx_order_deduct
  on public.inventory_transactions (order_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where reason = 'order_deduct';

create or replace function public.finalize_storefront_order(_order_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  o public.orders%rowtype;
  it jsonb;
  pid uuid;
  vid uuid;
  qty integer;
  ship jsonb;
begin
  -- Only a fresh, unfinalized order; locked so two calls cannot both apply it.
  select * into o from public.orders
   where id = _order_id and finalized_at is null and deleted_at is null
     and created_at > now() - interval '30 minutes'
   for update;
  if not found then return; end if;

  for it in select * from jsonb_array_elements(o.items) loop
    begin
      pid := nullif(it->>'product_id', '')::uuid;
      vid := nullif(it->>'variant_id', '')::uuid;
      qty := (it->>'quantity')::integer;
    exception when others then
      continue;
    end;
    if pid is null or coalesce(qty, 0) <= 0 then continue; end if;
    begin
      insert into public.inventory_transactions (order_id, product_id, variant_id, quantity_delta, reason)
      values (o.id, pid, vid, -qty, 'order_deduct');
    exception when unique_violation then
      -- Same product/variant twice in one order: add to the earlier line.
      update public.inventory_transactions set quantity_delta = quantity_delta - qty
       where order_id = o.id and product_id = pid and reason = 'order_deduct'
         and coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)
           = coalesce(vid, '00000000-0000-0000-0000-000000000000'::uuid);
    end;
    if vid is not null then
      update public.product_variants set stock = greatest(0, coalesce(stock, 0) - qty) where id = vid;
    else
      update public.products set stock = greatest(0, coalesce(stock, 0) - qty) where id = pid;
    end if;
  end loop;

  if o.coupon_code is not null and o.coupon_code <> '' then
    update public.coupons set used_count = used_count + 1 where upper(code) = upper(o.coupon_code);
  end if;

  -- Customer record (same rules as upsert_checkout_customer).
  ship := coalesce(o.shipping_address, '{}'::jsonb);
  perform public._upsert_customer_from_order(
    o.customer_name, o.customer_email, o.customer_phone, o.total,
    nullif(ship->>'line1', ''), nullif(coalesce(ship->>'city', ship->>'district'), '')
  );

  update public.orders set finalized_at = now() where id = o.id;
end
$function$;

-- The customer upsert itself, callable only from the functions above/below.
create or replace function public._upsert_customer_from_order(
  _name text, _email text, _phone text, _order_total numeric, _address text, _city text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare existing_id uuid;
begin
  select id into existing_id from public.customers
   where (nullif(_phone, '') is not null and phone = _phone)
      or (nullif(_email, '') is not null and email = _email)
   limit 1;
  if existing_id is null then
    insert into public.customers (name, email, phone, address, city, total_orders, total_spent)
    values (_name, _email, coalesce(_phone, ''), _address, _city, 1, coalesce(_order_total, 0));
  else
    update public.customers set
      name = coalesce(nullif(_name, ''), name),
      email = coalesce(nullif(_email, ''), email),
      address = coalesce(nullif(_address, ''), address),
      city = coalesce(nullif(_city, ''), city),
      total_orders = total_orders + 1,
      total_spent = total_spent + coalesce(_order_total, 0),
      updated_at = now()
    where id = existing_id;
  end if;
end
$function$;
revoke all on function public._upsert_customer_from_order(text, text, text, numeric, text, text) from public, anon, authenticated;

revoke all on function public.finalize_storefront_order(uuid) from public;
grant execute on function public.finalize_storefront_order(uuid) to anon, authenticated;

-- ── 3. The old functions: admin/staff only ─────────────────────────────────
create or replace function public.decrement_product_stock(_product_id uuid, _quantity integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin_or_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update public.products set stock = greatest(0, stock - _quantity) where id = _product_id;
end
$function$;

create or replace function public.decrement_variant_stock(_variant_id uuid, _quantity integer)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin_or_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  if _variant_id is null or coalesce(_quantity, 0) <= 0 then return; end if;
  update public.product_variants set stock = greatest(0, coalesce(stock, 0) - _quantity) where id = _variant_id;
end
$function$;

create or replace function public.increment_coupon_usage(_code text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin_or_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  update public.coupons set used_count = used_count + 1 where code = _code;
end
$function$;

create or replace function public.upsert_checkout_customer(
  _name text, _email text default null, _phone text default '', _order_total numeric default 0,
  _address text default null, _city text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.is_admin_or_staff(auth.uid()) then
    raise exception 'forbidden' using errcode = 'insufficient_privilege';
  end if;
  perform public._upsert_customer_from_order(_name, _email, _phone, _order_total, _address, _city);
end
$function$;

revoke execute on function public.decrement_product_stock(uuid, integer) from public, anon;
revoke execute on function public.decrement_variant_stock(uuid, integer) from public, anon;
revoke execute on function public.increment_coupon_usage(text) from public, anon;
revoke execute on function public.upsert_checkout_customer(text, text, text, numeric, text, text) from public, anon;
grant execute on function public.decrement_product_stock(uuid, integer) to authenticated;
grant execute on function public.decrement_variant_stock(uuid, integer) to authenticated;
grant execute on function public.increment_coupon_usage(text) to authenticated;
grant execute on function public.upsert_checkout_customer(text, text, text, numeric, text, text) to authenticated;
