-- Rep Command Center — initial schema
--
-- Run this directly in the Supabase project's SQL Editor (Database > SQL Editor).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE).
--
-- Scope: Justin Fassio + approved sales reps. RLS restricts domain tables to
-- authenticated users whose profiles are approved owner/rep staff.

create extension if not exists pgcrypto;

-- Auto-maintains updated_at on any UPDATE.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- lines — the wholesale lines Justin reps (Old Guys Rule, Busted Knuckles
-- Garage, and any future lines). Catalog items belong to a line.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists lines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- e.g. 'ogr', 'bkg' — stable short key for app logic
  name text not null,                 -- e.g. 'Old Guys Rule'
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists lines_set_updated_at on lines;
create trigger lines_set_updated_at
  before update on lines
  for each row execute function set_updated_at();

insert into lines (code, name, active)
values
  ('ogr', 'Old Guys Rule', true),
  ('bkg', 'Busted Knuckles Garage', false)
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- catalog_items — wholesale SKUs, scoped to a line. Seeded from the former
-- static OGR corpus (see migrations/*_seed_catalog_prospects.sql).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists catalog_items (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references lines(id) on delete cascade,
  page integer,
  cat text not null,
  sku text not null,
  name text not null,
  color text,
  tagline text,
  price_usd numeric(10, 2) not null default 0,
  msrp_cad numeric(10, 2) not null default 0,   -- 0 means "not for resale" (POP/signage), matches app logic
  catalog_price_usd numeric(10, 2) not null default 0,
  price_usd_override numeric(10, 2),
  catalog_msrp_cad numeric(10, 2) not null default 0,
  msrp_cad_override numeric(10, 2),
  landed_cad_override numeric(10, 2),
  field_meta jsonb not null default '{}'::jsonb,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'discontinued', 'unavailable', 'unknown')),
  is_new boolean not null default false,
  is_name_drop boolean not null default false,
  is_bestseller boolean not null default false,
  pdf_page integer,
  catalog_year integer,
  brand text,
  product_family text,
  collection text,
  product_type text,
  accent_color text,
  sales_description text,
  material text,
  special_notes text,
  sales_priority text,
  sales_notes text,
  primary_image_path text,
  department text
    check (department is null or department in (
      'Apparel', 'Headwear', 'Accessories', 'Drinkware', 'Displays', 'Metal Signs'
    )),
  normalized_sku text,
  unit_of_measure text not null default 'each'
    check (unit_of_measure in ('each', 'pack', 'set', 'display')),
  minimum_quantity integer,
  order_multiple integer,
  pack_quantity integer,
  made_in_usa_claim boolean,
  country_of_blank_manufacture text,
  country_of_decoration text,
  country_of_origin text,
  primary_image_url text,
  source_image_url text,
  catalog_verified boolean not null default false,
  verification_notes text,
  lifestyle_themes jsonb not null default '[]'::jsonb,
  recommended_channels jsonb not null default '[]'::jsonb,
  seasonality text,
  sample_status text,
  buyer_feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, sku)
);

create index if not exists catalog_items_line_id_idx on catalog_items (line_id);
create index if not exists catalog_items_cat_idx on catalog_items (cat);
create index if not exists catalog_items_normalized_sku_idx on catalog_items (normalized_sku);
create index if not exists catalog_items_department_idx on catalog_items (department);

drop trigger if exists catalog_items_set_updated_at on catalog_items;
create trigger catalog_items_set_updated_at
  before update on catalog_items
  for each row execute function set_updated_at();

-- catalog_settings — line-level MOQ / pricing assumptions (terms pending PDF verify)
create table if not exists catalog_settings (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null unique references lines(id) on delete cascade,
  catalog_year integer not null default 2026,
  min_order_pieces integer not null default 24,
  min_pieces_per_design integer not null default 6,
  shipping_origin text,
  pricing_assumption_version text not null default 'v1',
  duty_rate numeric(8, 6) not null default 0,
  surtax_rate numeric(8, 6) not null default 0,
  brokerage_allocation_cad numeric(10, 2) not null default 0,
  freight_allocation_cad numeric(10, 2) not null default 0,
  import_gst_recoverable boolean not null default true,
  terms_verified boolean not null default false,
  terms_note text,
  default_shipping_method text,
  prices_subject_to_change boolean not null default true,
  backorder_policy text,
  order_processing_policy text,
  claims_policy text,
  returns_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists catalog_settings_set_updated_at on catalog_settings;
create trigger catalog_settings_set_updated_at
  before update on catalog_settings
  for each row execute function set_updated_at();

-- catalog_variants — size/color/style wholesale rows
create table if not exists catalog_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  size text,
  size_group text,
  color text,
  style text,
  variant_sku text,
  wholesale_usd numeric(10, 2) not null default 0,
  wholesale_usd_override numeric(10, 2),
  unit_of_measure text not null default 'each',
  pack_quantity integer,
  pack_price_usd numeric(10, 2),
  availability text not null default 'available'
    check (availability in ('available', 'limited', 'unavailable', 'discontinued')),
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalog_variants_item_size_color_style_uidx
  on catalog_variants (
    catalog_item_id,
    coalesce(size, ''),
    coalesce(color, ''),
    coalesce(style, '')
  );

create index if not exists catalog_variants_catalog_item_id_idx
  on catalog_variants (catalog_item_id);

drop trigger if exists catalog_variants_set_updated_at on catalog_variants;
create trigger catalog_variants_set_updated_at
  before update on catalog_variants
  for each row execute function set_updated_at();

create table if not exists catalog_product_attributes (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  attribute_key text not null,
  label text not null,
  value text,
  value_type text not null default 'text'
    check (value_type in ('text', 'number', 'boolean', 'dimension')),
  unit text,
  attribute_group text not null default 'other'
    check (attribute_group in (
      'construction', 'decoration', 'dimensions', 'packaging', 'display', 'origin', 'other'
    )),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (catalog_item_id, attribute_key)
);

create index if not exists catalog_product_attributes_item_id_idx
  on catalog_product_attributes (catalog_item_id);

drop trigger if exists catalog_product_attributes_set_updated_at on catalog_product_attributes;
create trigger catalog_product_attributes_set_updated_at
  before update on catalog_product_attributes
  for each row execute function set_updated_at();

create table if not exists catalog_field_changes (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  source text not null default 'user'
    check (source in ('catalog', 'user', 'ai', 'calculated', 'import', 'unknown')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists catalog_field_changes_item_id_idx
  on catalog_field_changes (catalog_item_id, created_at desc);

create table if not exists catalog_assets (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid references catalog_items(id) on delete cascade,
  line_id uuid not null references lines(id) on delete cascade,
  asset_kind text not null
    check (asset_kind in ('primary', 'extra', 'page_spread', 'front', 'back')),
  storage_path text not null,
  content_hash text,
  pdf_page integer,
  crop jsonb,
  source_document text,
  extraction_method text,
  confidence numeric(4, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalog_assets_storage_path_uidx
  on catalog_assets (storage_path);

create index if not exists catalog_assets_item_id_idx
  on catalog_assets (catalog_item_id);

drop trigger if exists catalog_assets_set_updated_at on catalog_assets;
create trigger catalog_assets_set_updated_at
  before update on catalog_assets
  for each row execute function set_updated_at();

create table if not exists catalog_import_runs (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references lines(id) on delete cascade,
  source_document text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'failed')),
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create table if not exists catalog_import_conflicts (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references catalog_import_runs(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  sku text,
  field_path text not null,
  current_value jsonb,
  proposed_value jsonb,
  current_source text,
  proposed_source text,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'rejected', 'deferred')),
  created_at timestamptz not null default now()
);

create index if not exists catalog_import_conflicts_run_id_idx
  on catalog_import_conflicts (import_run_id);

-- ─────────────────────────────────────────────────────────────────────────
-- prospects — BC retailer directory (integer ids stable for calls / updates).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists prospects (
  id integer primary key,
  name text not null,
  category text not null,
  region text not null,
  city text not null,
  address text not null default '',
  phone text not null default '',
  fit text not null default '',
  account_status text not null default 'prospect'
    check (account_status in ('prospect', 'active_account', 'inactive')),
  converted_at timestamptz,
  initial_order_date timestamptz,
  notes text,
  external_id text,
  subterritory text,
  primary_district text,
  retail_category text,
  website text,
  fit_score smallint check (fit_score is null or (fit_score >= 1 and fit_score <= 10)),
  ideal_opening_units integer,
  priority text,
  provisional_grade text,
  verification_status text,
  buyer_verified boolean not null default false,
  apparel_capability text,
  existing_ogr text,
  qualification_status text,
  next_action text,
  source_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_category_idx on prospects (category);
create index if not exists prospects_region_idx on prospects (region);
create index if not exists prospects_account_status_idx on prospects (account_status);
create unique index if not exists prospects_external_id_uidx
  on prospects (external_id)
  where external_id is not null;

drop trigger if exists prospects_set_updated_at on prospects;
create trigger prospects_set_updated_at
  before update on prospects
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- prospect_updates — notes / status changes against prospect directory rows.
-- prospect_id is a plain integer matching prospects.id (no FK in this phase).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists prospect_updates (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer not null,
  status text,                        -- e.g. 'contacted', 'qualified', 'not a fit'
  note text,
  created_at timestamptz not null default now()
);

create index if not exists prospect_updates_prospect_id_idx on prospect_updates (prospect_id);

-- ─────────────────────────────────────────────────────────────────────────
-- calls — logged prospect calls from the Log Call modal, with PMF scoring.
-- prospect_id matches prospects.id (plain integer, not a DB foreign key).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer not null,
  line_id uuid references lines(id) on delete set null,
  contact_name text,
  call_date date not null default current_date,
  outcome text not null,              -- e.g. 'Closed PO / Written Order', 'Follow-up Scheduled'
  pmf_score smallint check (pmf_score between 1 and 10),
  order_value_cad numeric(10, 2) default 0,
  objection_tags text[] not null default '{}',  -- buyer feedback checkboxes from the modal
  notes text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calls_prospect_id_idx on calls (prospect_id);
create index if not exists calls_line_id_idx on calls (line_id);
create index if not exists calls_call_date_idx on calls (call_date);

drop trigger if exists calls_set_updated_at on calls;
create trigger calls_set_updated_at
  before update on calls
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- orders — initial / reorder / preorder history (account_id → prospects.id).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  account_id integer not null references prospects (id),
  line_id uuid references lines (id) on delete set null,
  order_type text not null
    check (order_type in ('initial', 'reorder', 'preorder')),
  season text not null
    check (season in (
      'spring_summer',
      'fathers_day',
      'fall_winter',
      'holiday_christmas',
      'ats_in_season'
    )),
  order_date date not null default current_date,
  total_amount_cad numeric(10, 2) not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'fulfilled')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_account_id_idx on orders (account_id);
create index if not exists orders_order_date_idx on orders (order_date);
create index if not exists orders_season_idx on orders (season);

drop trigger if exists orders_set_updated_at on orders;
create trigger orders_set_updated_at
  before update on orders
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- account_reorder_settings — 1:1 cadence / AI reminder fields per account.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists account_reorder_settings (
  account_id integer primary key references prospects (id) on delete cascade,
  last_order_date date,
  next_suggested_contact_date date,
  seasonal_cadence_tags text[] not null default '{}',
  ai_reorder_notes text,
  updated_at timestamptz not null default now()
);

drop trigger if exists account_reorder_settings_set_updated_at on account_reorder_settings;
create trigger account_reorder_settings_set_updated_at
  before update on account_reorder_settings
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- account_contacts — buyers / managers / owners shared across prospect + account.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists account_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id integer not null references prospects (id) on delete cascade,
  role text not null
    check (role in ('buyer', 'manager', 'owner')),
  full_name text not null,
  title text,
  phone text,
  email text,
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists account_contacts_account_id_idx on account_contacts (account_id);
create index if not exists account_contacts_full_name_lower_idx on account_contacts (lower(full_name));
create unique index if not exists account_contacts_one_primary_per_account_idx
  on account_contacts (account_id)
  where is_primary;

drop trigger if exists account_contacts_set_updated_at on account_contacts;
create trigger account_contacts_set_updated_at
  before update on account_contacts
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- profiles — owner/rep/buyer + pending/approved/rejected (see also
-- migrations/20260802193000_profiles_roles.sql and
-- 20260802220000_profiles_approval_workflow.sql).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'rep' check (role in ('owner', 'rep', 'buyer')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on profiles (status);
create index if not exists profiles_role_idx on profiles (role);

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

alter table profiles enable row level security;

drop policy if exists "users read own profile" on profiles;
create policy "users read own profile" on profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists "users update own profile" on profiles;
create policy "users update own profile" on profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from profiles p where p.id = auth.uid())
    and status = (select p.status from profiles p where p.id = auth.uid())
  );

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    'rep',
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- Row Level Security — approved owner/rep only (`is_approved_staff`).
-- Keep in sync with migrations (approval workflow).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.is_approved_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role in ('owner', 'rep')
  );
$$;

revoke all on function public.is_approved_staff() from public;
grant execute on function public.is_approved_staff() to authenticated;

-- Owner-only pending approval (Phase G). Keep in sync with
-- migrations/20260802260000_owner_approval_rpcs.sql.
create or replace function public.is_approved_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role = 'owner'
  );
$$;

revoke all on function public.is_approved_owner() from public;
grant execute on function public.is_approved_owner() to authenticated;

create or replace function public.list_pending_profiles()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_owner() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.email,
    p.display_name,
    p.role,
    p.status,
    p.created_at
  from public.profiles p
  where p.status = 'pending'
    -- Copilot: pending owners cannot be approved via set_profile_status; list reps only.
    and p.role = 'rep'
  order by p.created_at asc;
end;
$$;

revoke all on function public.list_pending_profiles() from public;
grant execute on function public.list_pending_profiles() to authenticated;

create or replace function public.set_profile_status(
  target_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if not public.is_approved_owner() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if new_status not in ('approved', 'rejected') then
    raise exception 'new_status must be approved or rejected' using errcode = '22023';
  end if;

  if target_id is null then
    raise exception 'target_id is required' using errcode = '22023';
  end if;

  if target_id = auth.uid() then
    raise exception 'Cannot change your own status' using errcode = '42501';
  end if;

  select * into target from public.profiles p where p.id = target_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if target.role = 'owner' then
    raise exception 'Cannot change status of an owner' using errcode = '42501';
  end if;

  update public.profiles
  set status = new_status, updated_at = now()
  where id = target_id;
end;
$$;

revoke all on function public.set_profile_status(uuid, text) from public;
grant execute on function public.set_profile_status(uuid, text) to authenticated;

alter table lines enable row level security;
alter table catalog_items enable row level security;
alter table catalog_settings enable row level security;
alter table catalog_variants enable row level security;
alter table catalog_product_attributes enable row level security;
alter table catalog_field_changes enable row level security;
alter table catalog_assets enable row level security;
alter table catalog_import_runs enable row level security;
alter table catalog_import_conflicts enable row level security;
alter table prospects enable row level security;
alter table prospect_updates enable row level security;
alter table calls enable row level security;
alter table orders enable row level security;
alter table account_reorder_settings enable row level security;
alter table account_contacts enable row level security;

drop policy if exists "public full access" on lines;
drop policy if exists "authenticated full access" on lines;
drop policy if exists "approved staff full access" on lines;
create policy "approved staff full access" on lines
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "public full access" on catalog_items;
drop policy if exists "authenticated full access" on catalog_items;
drop policy if exists "approved staff full access" on catalog_items;
create policy "approved staff full access" on catalog_items
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on catalog_settings;
create policy "approved staff full access" on catalog_settings
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on catalog_variants;
create policy "approved staff full access" on catalog_variants
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on catalog_product_attributes;
create policy "approved staff full access" on catalog_product_attributes
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on catalog_field_changes;
create policy "approved staff full access" on catalog_field_changes
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on catalog_assets;
create policy "approved staff full access" on catalog_assets
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on catalog_import_runs;
create policy "approved staff full access" on catalog_import_runs
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on catalog_import_conflicts;
create policy "approved staff full access" on catalog_import_conflicts
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on prospects;
create policy "approved staff full access" on prospects
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "public full access" on prospect_updates;
drop policy if exists "authenticated full access" on prospect_updates;
drop policy if exists "approved staff full access" on prospect_updates;
create policy "approved staff full access" on prospect_updates
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "public full access" on calls;
drop policy if exists "authenticated full access" on calls;
drop policy if exists "approved staff full access" on calls;
create policy "approved staff full access" on calls
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on orders;
create policy "approved staff full access" on orders
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on account_reorder_settings;
create policy "approved staff full access" on account_reorder_settings
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on account_contacts;
create policy "approved staff full access" on account_contacts
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());
