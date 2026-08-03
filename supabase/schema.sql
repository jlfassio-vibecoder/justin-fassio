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
  is_new boolean not null default false,
  is_name_drop boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, sku)
);

create index if not exists catalog_items_line_id_idx on catalog_items (line_id);
create index if not exists catalog_items_cat_idx on catalog_items (cat);

drop trigger if exists catalog_items_set_updated_at on catalog_items;
create trigger catalog_items_set_updated_at
  before update on catalog_items
  for each row execute function set_updated_at();

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_category_idx on prospects (category);
create index if not exists prospects_region_idx on prospects (region);

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

alter table lines enable row level security;
alter table catalog_items enable row level security;
alter table prospects enable row level security;
alter table prospect_updates enable row level security;
alter table calls enable row level security;

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
