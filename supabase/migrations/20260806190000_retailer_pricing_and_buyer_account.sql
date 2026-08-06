-- Retailer pricing gate + buyer account foundation (slices 1–4 schema).

-- Profiles: link to CRM prospect + staff unlock for wholesale prices
alter table profiles
  add column if not exists prospect_id integer references prospects (id) on delete set null,
  add column if not exists wholesale_pricing_unlocked boolean not null default false;

create index if not exists profiles_prospect_id_idx on profiles (prospect_id);
create index if not exists profiles_wholesale_unlocked_idx
  on profiles (wholesale_pricing_unlocked)
  where role = 'buyer';

-- Buyers cannot self-elevate unlock / prospect linkage
drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from profiles p where p.id = auth.uid())
    and status = (select p.status from profiles p where p.id = auth.uid())
    and wholesale_pricing_unlocked = (
      select p.wholesale_pricing_unlocked from profiles p where p.id = auth.uid()
    )
    and prospect_id is not distinct from (
      select p.prospect_id from profiles p where p.id = auth.uid()
    )
  );

-- Treat wholesale buyer signups as buyer role (not rep)
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_chat boolean;
  is_wholesale_buyer boolean;
begin
  is_chat :=
    coalesce(new.is_anonymous, false)
    or coalesce((new.raw_user_meta_data->>'live_chat')::boolean, false)
    or coalesce(new.raw_user_meta_data->>'live_chat', '') = 'true';
  is_wholesale_buyer :=
    coalesce((new.raw_user_meta_data->>'wholesale_buyer')::boolean, false)
    or coalesce(new.raw_user_meta_data->>'wholesale_buyer', '') = 'true';

  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1)
    ),
    case when is_chat or is_wholesale_buyer then 'buyer' else 'rep' end,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.buyer_has_wholesale_pricing()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_approved_staff()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'buyer'
        and p.status = 'approved'
        and p.wholesale_pricing_unlocked = true
    );
$$;

revoke all on function public.buyer_has_wholesale_pricing() from public;
grant execute on function public.buyer_has_wholesale_pricing() to anon, authenticated;

-- Gate wholesale in public catalog RPCs (MSRP always available)
create or replace function public.get_public_ogr_products()
returns table (
  id uuid,
  sku text,
  public_slug text,
  name text,
  cat text,
  color text,
  tagline text,
  description text,
  page integer,
  catalog_year integer,
  collection text,
  wholesale_usd numeric,
  msrp_cad numeric,
  is_new boolean,
  featured boolean,
  public_sort_order integer,
  primary_image_url text,
  alternate_image_urls jsonb,
  unit_of_measure text,
  minimum_quantity integer,
  order_multiple integer,
  pack_quantity integer,
  lifestyle_themes jsonb,
  live_sku text,
  available_sizes text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ci.id,
    ci.sku,
    ci.public_slug,
    ci.name,
    ci.cat,
    ci.color,
    ci.tagline,
    ci.sales_description as description,
    ci.page,
    ci.catalog_year,
    ci.collection,
    case
      when public.buyer_has_wholesale_pricing() then
        coalesce(ci.price_usd_override, ci.catalog_price_usd, ci.price_usd)
      else null
    end as wholesale_usd,
    coalesce(ci.msrp_cad_override, ci.catalog_msrp_cad, ci.msrp_cad) as msrp_cad,
    ci.is_new,
    ci.featured,
    ci.public_sort_order,
    ci.primary_image_url,
    ci.alternate_image_urls,
    ci.unit_of_measure,
    ci.minimum_quantity,
    ci.order_multiple,
    ci.pack_quantity,
    ci.lifestyle_themes,
    ci.live_sku,
    coalesce((
      select array_agg(v.size order by v.sort_order)
      from catalog_variants v
      where v.catalog_item_id = ci.id
        and v.size is not null
        and trim(v.size) <> ''
        and v.size <> 'BASE'
        and v.availability in ('available', 'limited')
    ), '{}'::text[]) as available_sizes
  from catalog_items ci
  join lines l on l.id = ci.line_id
  where l.code = 'ogr'
    and ci.is_publicly_published = true
    and ci.status = 'active'
    and ci.public_slug is not null
  order by ci.public_sort_order asc, ci.name asc;
$$;

create or replace function public.get_public_ogr_product_by_slug(p_slug text)
returns table (
  id uuid,
  sku text,
  public_slug text,
  name text,
  cat text,
  color text,
  tagline text,
  description text,
  page integer,
  catalog_year integer,
  collection text,
  wholesale_usd numeric,
  msrp_cad numeric,
  is_new boolean,
  featured boolean,
  public_sort_order integer,
  primary_image_url text,
  alternate_image_urls jsonb,
  unit_of_measure text,
  minimum_quantity integer,
  order_multiple integer,
  pack_quantity integer,
  lifestyle_themes jsonb,
  live_sku text,
  available_sizes text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.get_public_ogr_products() p
  where p.public_slug = lower(trim(p_slug))
  limit 1;
$$;

-- Staff unlock wholesale pricing for a buyer
create or replace function public.set_buyer_wholesale_pricing(
  target_id uuid,
  unlocked boolean,
  approve_profile boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_staff() then
    raise exception 'not authorized';
  end if;

  update public.profiles
  set
    wholesale_pricing_unlocked = unlocked,
    status = case
      when unlocked and approve_profile then 'approved'
      else status
    end,
    updated_at = now()
  where id = target_id
    and role = 'buyer';

  if not found then
    raise exception 'buyer profile not found';
  end if;
end;
$$;

revoke all on function public.set_buyer_wholesale_pricing(uuid, boolean, boolean) from public;
grant execute on function public.set_buyer_wholesale_pricing(uuid, boolean, boolean) to authenticated;

create or replace function public.list_pending_wholesale_buyers()
returns table (
  id uuid,
  email text,
  display_name text,
  prospect_id integer,
  prospect_name text,
  wholesale_pricing_unlocked boolean,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.display_name,
    p.prospect_id,
    pr.name as prospect_name,
    p.wholesale_pricing_unlocked,
    p.status,
    p.created_at
  from public.profiles p
  left join public.prospects pr on pr.id = p.prospect_id
  where public.is_approved_staff()
    and p.role = 'buyer'
    and (
      p.wholesale_pricing_unlocked = false
      or p.status = 'pending'
    )
    and (p.email is null or p.email not like 'livechat.%')
  order by p.created_at asc;
$$;

revoke all on function public.list_pending_wholesale_buyers() from public;
grant execute on function public.list_pending_wholesale_buyers() to authenticated;

-- Server cart (slice 3)
create table if not exists buyer_cart_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_item_id uuid not null references catalog_items (id) on delete cascade,
  sku text not null,
  name text not null,
  size text not null default '',
  quantity integer not null check (quantity > 0),
  wholesale_usd numeric,
  primary_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, catalog_item_id, size)
);

create index if not exists buyer_cart_items_user_id_idx on buyer_cart_items (user_id);

drop trigger if exists buyer_cart_items_set_updated_at on buyer_cart_items;
create trigger buyer_cart_items_set_updated_at
  before update on buyer_cart_items
  for each row execute function set_updated_at();

alter table buyer_cart_items enable row level security;

drop policy if exists "buyers manage own cart" on buyer_cart_items;
create policy "buyers manage own cart" on buyer_cart_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "approved staff read buyer carts" on buyer_cart_items;
create policy "approved staff read buyer carts" on buyer_cart_items
  for select to authenticated
  using (public.is_approved_staff());

-- Likes (slice 4)
create table if not exists buyer_product_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_item_id uuid not null references catalog_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, catalog_item_id)
);

create index if not exists buyer_product_likes_user_id_idx on buyer_product_likes (user_id);

alter table buyer_product_likes enable row level security;

drop policy if exists "buyers manage own likes" on buyer_product_likes;
create policy "buyers manage own likes" on buyer_product_likes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "approved staff read buyer likes" on buyer_product_likes;
create policy "approved staff read buyer likes" on buyer_product_likes
  for select to authenticated
  using (public.is_approved_staff());

-- Buyer can read their linked CRM prospect (for account home labels)
drop policy if exists "buyers read linked prospect" on prospects;
create policy "buyers read linked prospect" on prospects
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'buyer'
        and p.prospect_id = prospects.id
    )
  );

-- Buyer message access (threads mapped to their prospect)
create or replace function public.buyer_owns_message_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_threads t
    join public.profiles p on p.id = auth.uid()
    where t.id = p_thread_id
      and p.role = 'buyer'
      and p.prospect_id is not null
      and t.prospect_id = p.prospect_id
  );
$$;

revoke all on function public.buyer_owns_message_thread(uuid) from public;
grant execute on function public.buyer_owns_message_thread(uuid) to authenticated;

drop policy if exists "buyers read linked threads" on message_threads;
create policy "buyers read linked threads" on message_threads
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'buyer'
        and p.prospect_id is not null
        and message_threads.prospect_id = p.prospect_id
    )
  );

drop policy if exists "buyers read linked messages" on messages;
create policy "buyers read linked messages" on messages
  for select to authenticated
  using (public.buyer_owns_message_thread(messages.thread_id));

drop policy if exists "buyers insert linked replies" on messages;
create policy "buyers insert linked replies" on messages
  for insert to authenticated
  with check (
    public.buyer_owns_message_thread(messages.thread_id)
    and messages.kind = 'buyer_reply'
  );

create or replace function public.touch_message_thread_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.message_threads
  set last_message_at = coalesce(new.created_at, now()),
      updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists messages_touch_thread on messages;
create trigger messages_touch_thread
  after insert on messages
  for each row execute function public.touch_message_thread_on_insert();
