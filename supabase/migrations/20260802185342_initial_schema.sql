-- Initial schema (from supabase/schema.sql)

-- Rep Command Center — initial schema
--
-- Run this directly in the Supabase project's SQL Editor (Database > SQL Editor).
-- Safe to re-run: every statement is idempotent (IF NOT EXISTS / OR REPLACE).
--
-- Scope: single-user personal app (Justin Fassio). RLS is enabled on every
-- table for defense-in-depth, but policies grant full read/write to the
-- `anon` key, since there is no per-user auth yet. Tighten these policies
-- if/when real authentication is introduced.

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
-- catalog_items — wholesale SKUs, scoped to a line. Seeded today from the
-- static src/data/catalog.ts array (Old Guys Rule); this table lets future
-- lines (and edits) live in the database instead of hardcoded arrays.
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
-- prospect_updates — notes / status changes against the 249 BC retailer
-- prospect records. Prospects themselves stay in src/data/prospects.ts
-- (static reference data), so prospect_id here is a plain integer matching
-- that array's `id` field, not a foreign key into a prospects table.
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
-- prospect_id references the static prospect directory the same way
-- prospect_updates does (plain integer, not a DB foreign key).
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
-- Row Level Security — signed-in users only (`authenticated`).
-- The public anon key must not read/write domain tables; /app is gated in
-- the UI, and these policies enforce the same at the API layer.
-- ─────────────────────────────────────────────────────────────────────────
alter table lines enable row level security;
alter table catalog_items enable row level security;
alter table prospect_updates enable row level security;
alter table calls enable row level security;

drop policy if exists "public full access" on lines;
drop policy if exists "authenticated full access" on lines;
create policy "authenticated full access" on lines
  for all to authenticated using (true) with check (true);

drop policy if exists "public full access" on catalog_items;
drop policy if exists "authenticated full access" on catalog_items;
create policy "authenticated full access" on catalog_items
  for all to authenticated using (true) with check (true);

drop policy if exists "public full access" on prospect_updates;
drop policy if exists "authenticated full access" on prospect_updates;
create policy "authenticated full access" on prospect_updates
  for all to authenticated using (true) with check (true);

drop policy if exists "public full access" on calls;
drop policy if exists "authenticated full access" on calls;
create policy "authenticated full access" on calls
  for all to authenticated using (true) with check (true);
