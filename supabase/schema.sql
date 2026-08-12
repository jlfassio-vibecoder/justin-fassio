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
  tagline text,
  description text,
  hero_image_path text,
  hero_image_url text,
  sort_order integer not null default 0,
  public_showroom_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists lines_set_updated_at on lines;
create trigger lines_set_updated_at
  before update on lines
  for each row execute function set_updated_at();

insert into lines (code, name, active, tagline, description, sort_order, public_showroom_path)
values
  (
    'ogr',
    'Old Guys Rule',
    true,
    'Now Repping',
    'Apparel & lifestyle goods for the surf and skate crowd.',
    10,
    '/old-guys-rule-wholesale'
  ),
  ('bkg', 'Busted Knuckles Garage', false, null, null, 20, null)
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- territories — sales geographies (BC, Alberta, CA/OR/WA). Prospects belong
-- to one territory; region / primary_district / subterritory stay intra-territory.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists territories (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_code text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territories_code_check check (code in ('bc', 'ab', 'ca', 'or', 'wa')),
  constraint territories_country_code_check check (country_code in ('CA', 'US'))
);

drop trigger if exists territories_set_updated_at on territories;
create trigger territories_set_updated_at
  before update on territories
  for each row execute function set_updated_at();

insert into territories (code, name, country_code, sort_order, active)
values
  ('bc', 'British Columbia', 'CA', 10, true),
  ('ab', 'Alberta', 'CA', 20, true),
  ('ca', 'California', 'US', 30, true),
  ('or', 'Oregon', 'US', 40, true),
  ('wa', 'Washington', 'US', 50, true)
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
  is_publicly_published boolean not null default false,
  featured boolean not null default false,
  public_sort_order integer not null default 0,
  public_slug text,
  live_sku text,
  live_sku_note text,
  alternate_image_urls jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, sku)
);

create index if not exists catalog_items_line_id_idx on catalog_items (line_id);
create index if not exists catalog_items_cat_idx on catalog_items (cat);
create index if not exists catalog_items_normalized_sku_idx on catalog_items (normalized_sku);
create index if not exists catalog_items_department_idx on catalog_items (department);
create unique index if not exists catalog_items_line_id_public_slug_uidx
  on catalog_items (line_id, public_slug)
  where public_slug is not null;
create index if not exists catalog_items_public_list_idx
  on catalog_items (line_id, is_publicly_published, public_sort_order);

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
-- prospects — retailer directory (integer ids stable for calls / updates).
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
  territory_id uuid not null references territories (id),
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
  secondary_channels jsonb not null default '[]'::jsonb,
  retail_subchannels jsonb not null default '[]'::jsonb,
  venue_contexts jsonb not null default '[]'::jsonb,
  lifestyle_themes jsonb not null default '[]'::jsonb,
  retail_capabilities jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospects_category_idx on prospects (category);
create index if not exists prospects_region_idx on prospects (region);
create index if not exists prospects_account_status_idx on prospects (account_status);
create index if not exists prospects_territory_id_idx on prospects (territory_id);
create index if not exists prospects_converted_at_idx
  on prospects (converted_at)
  where converted_at is not null;
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
-- outreach_goal_settings — singleton monthly Active Account goal + pace params.
-- Phase 4. Do NOT overload catalog_settings.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists outreach_goal_settings (
  id uuid primary key default gen_random_uuid(),
  monthly_target integer not null default 5
    check (monthly_target >= 0),
  planning_conversion_rate numeric(8, 6) not null default 0.015
    check (planning_conversion_rate > 0 and planning_conversion_rate <= 1),
  min_attributed_conversions integer not null default 8
    check (min_attributed_conversions >= 0),
  lookback_days integer not null default 90
    check (lookback_days >= 1),
  last_touch_window_days integer not null default 45
    check (last_touch_window_days >= 1),
  smoothing_alpha numeric(8, 6) not null default 0.30
    check (smoothing_alpha >= 0 and smoothing_alpha <= 1),
  measured_rate_floor numeric(8, 6) not null default 0.005
    check (measured_rate_floor > 0),
  measured_rate_cap numeric(8, 6) not null default 0.06
    check (measured_rate_cap > 0),
  pace_floor integer not null default 1
    check (pace_floor >= 0),
  pace_cap integer not null default 25
    check (pace_cap >= 0),
  business_timezone text not null default 'America/Vancouver',
  selling_day_mode text not null default 'weekdays'
    check (selling_day_mode in ('weekdays')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint outreach_goal_settings_measured_bounds_check
    check (measured_rate_floor <= measured_rate_cap),
  constraint outreach_goal_settings_pace_bounds_check
    check (pace_floor <= pace_cap)
);

create unique index if not exists outreach_goal_settings_singleton_uidx
  on outreach_goal_settings ((true));

drop trigger if exists outreach_goal_settings_set_updated_at on outreach_goal_settings;
create trigger outreach_goal_settings_set_updated_at
  before update on outreach_goal_settings
  for each row execute function set_updated_at();

alter table outreach_goal_settings enable row level security;

drop policy if exists "approved staff full access" on outreach_goal_settings;
create policy "approved staff full access" on outreach_goal_settings
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

insert into outreach_goal_settings (
  monthly_target,
  planning_conversion_rate,
  business_timezone,
  selling_day_mode
)
select 5, 0.015, 'America/Vancouver', 'weekdays'
where not exists (select 1 from outreach_goal_settings);

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
-- wholesale_order_requests — public B2B order-request submissions (not booked revenue).
-- ─────────────────────────────────────────────────────────────────────────
create sequence if not exists wholesale_order_request_number_seq;

create table if not exists wholesale_order_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique
    default ('W-2026-' || lpad(nextval('wholesale_order_request_number_seq')::text, 6, '0')),
  business_name text not null,
  buyer_name text not null,
  email text not null,
  phone text not null,
  city text not null,
  province text not null,
  postal_code text not null,
  retail_channel text not null,
  is_existing_customer boolean not null default false,
  website text,
  gst_hst_number text,
  po_number text,
  notes text,
  preferred_contact_method text,
  source text not null default 'old-guys-rule-wholesale',
  status text not null default 'submitted'
    check (status in (
      'submitted', 'reviewing', 'buyer_contacted', 'quoted', 'approved',
      'sent_to_ogr', 'accepted_by_ogr', 'declined', 'cancelled'
    )),
  request_type text not null default 'order'
    check (request_type in ('order', 'inquiry')),
  prospect_id integer references prospects(id) on delete set null,
  idempotency_key text unique,
  merchandise_subtotal_usd numeric(12, 2) not null default 0,
  total_units integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wholesale_order_requests_prospect_id_idx
  on wholesale_order_requests (prospect_id);
create index if not exists wholesale_order_requests_status_idx
  on wholesale_order_requests (status);
create index if not exists wholesale_order_requests_email_idx
  on wholesale_order_requests (email);
create index if not exists wholesale_order_requests_request_type_idx
  on wholesale_order_requests (request_type);

drop trigger if exists wholesale_order_requests_set_updated_at on wholesale_order_requests;
create trigger wholesale_order_requests_set_updated_at
  before update on wholesale_order_requests
  for each row execute function set_updated_at();

create table if not exists wholesale_order_request_items (
  id uuid primary key default gen_random_uuid(),
  order_request_id uuid not null references wholesale_order_requests(id) on delete cascade,
  catalog_item_id uuid references catalog_items(id) on delete set null,
  sku text not null,
  name text not null,
  size text,
  wholesale_usd numeric(10, 2) not null,
  quantity integer not null check (quantity > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists wholesale_order_request_items_request_id_idx
  on wholesale_order_request_items (order_request_id);

-- Buyer cart + likes (retailer account)
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

create table if not exists buyer_product_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  catalog_item_id uuid not null references catalog_items (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, catalog_item_id)
);

create index if not exists buyer_product_likes_user_id_idx on buyer_product_likes (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- message_threads / messages — Message Center (inbound wholesale threads).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer references prospects(id) on delete set null,
  mapping_status text not null default 'unmapped'
    check (mapping_status in ('unmapped', 'suggested', 'confirmed')),
  identity_fingerprint text not null,
  confirmed_fingerprint text,
  source text not null default 'old-guys-rule-wholesale',
  subject text not null default '',
  channel text not null default 'wholesale'
    check (channel in ('wholesale', 'live_chat')),
  chat_state text
    check (chat_state is null or chat_state in ('awaiting_human', 'ai_active', 'human_active')),
  visitor_user_id uuid references auth.users(id) on delete set null,
  visitor_name text,
  visitor_email text,
  awaiting_reply_since timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_threads_identity_fingerprint_uidx
  on message_threads (identity_fingerprint);

create unique index if not exists message_threads_live_chat_visitor_uidx
  on message_threads (visitor_user_id)
  where channel = 'live_chat' and visitor_user_id is not null;

create index if not exists message_threads_prospect_id_idx
  on message_threads (prospect_id);

create index if not exists message_threads_mapping_status_idx
  on message_threads (mapping_status);

create index if not exists message_threads_channel_idx
  on message_threads (channel);

create index if not exists message_threads_chat_state_idx
  on message_threads (chat_state)
  where chat_state is not null;

create index if not exists message_threads_last_message_at_idx
  on message_threads (last_message_at desc);

drop trigger if exists message_threads_set_updated_at on message_threads;
create trigger message_threads_set_updated_at
  before update on message_threads
  for each row execute function set_updated_at();

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  kind text not null default 'wholesale_order_request'
    check (kind in (
      'wholesale_order_request',
      'wholesale_inquiry',
      'live_chat_visitor',
      'live_chat_staff',
      'live_chat_ai',
      'live_chat_system',
      'buyer_reply'
    )),
  wholesale_order_request_id uuid references wholesale_order_requests(id) on delete set null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_id_idx
  on messages (thread_id, created_at);

create unique index if not exists messages_wholesale_order_request_id_uidx
  on messages (wholesale_order_request_id)
  where wholesale_order_request_id is not null;

-- ─────────────────────────────────────────────────────────────────────────
-- profiles — owner/rep/buyer + pending/approved/rejected (see also
-- migrations/20260802193000_profiles_roles.sql and
-- 20260802220000_profiles_approval_workflow.sql).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  avatar_path text, -- private staff-avatars object path; signed URLs are UI-only
  role text not null default 'rep' check (role in ('owner', 'rep', 'buyer')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  prospect_id integer references prospects (id) on delete set null,
  wholesale_pricing_unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_status_idx on profiles (status);
create index if not exists profiles_role_idx on profiles (role);
create index if not exists profiles_prospect_id_idx on profiles (prospect_id);
create index if not exists profiles_wholesale_unlocked_idx
  on profiles (wholesale_pricing_unlocked)
  where role = 'buyer';

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
    and wholesale_pricing_unlocked = (
      select p.wholesale_pricing_unlocked from profiles p where p.id = auth.uid()
    )
    and prospect_id is not distinct from (
      select p.prospect_id from profiles p where p.id = auth.uid()
    )
  );

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

  if not unlocked then
    update public.buyer_cart_items
    set wholesale_usd = null,
        updated_at = now()
    where user_id = target_id;
  end if;
end;
$$;

revoke all on function public.set_buyer_wholesale_pricing(uuid, boolean, boolean) from public;
grant execute on function public.set_buyer_wholesale_pricing(uuid, boolean, boolean) to authenticated;

drop function if exists public.list_pending_wholesale_buyers();

create or replace function public.list_pending_wholesale_buyers()
returns table (
  id uuid,
  email text,
  display_name text,
  prospect_id integer,
  prospect_name text,
  prospect_city text,
  business_name text,
  buyer_name text,
  phone text,
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
    pr.city as prospect_city,
    wor.business_name,
    wor.buyer_name,
    wor.phone,
    p.wholesale_pricing_unlocked,
    p.status,
    p.created_at
  from public.profiles p
  join public.prospects pr on pr.id = p.prospect_id
  left join lateral (
    select
      r.business_name,
      r.buyer_name,
      r.phone
    from public.wholesale_order_requests r
    where r.prospect_id = p.prospect_id
       or (p.email is not null and lower(r.email) = lower(p.email))
    order by r.created_at desc
    limit 1
  ) wor on true
  where public.is_approved_staff()
    and p.role = 'buyer'
    and p.prospect_id is not null
    and (
      p.wholesale_pricing_unlocked = false
      or p.status = 'pending'
    )
    and (
      p.email is null
      or (
        p.email not like 'livechat.%'
        and p.email not like '%@users.noreply.justinfassio.com'
        and p.email not like '%@example.com'
      )
    )
  order by p.created_at asc;
$$;

revoke all on function public.list_pending_wholesale_buyers() from public;
grant execute on function public.list_pending_wholesale_buyers() to authenticated;

-- Public OGR wholesale catalog projection (anon-readable via RPC only)
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

revoke all on function public.get_public_ogr_products() from public;
grant execute on function public.get_public_ogr_products() to anon, authenticated;

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

revoke all on function public.get_public_ogr_product_by_slug(text) from public;
grant execute on function public.get_public_ogr_product_by_slug(text) to anon, authenticated;

create or replace function public.get_public_ogr_supplier_terms()
returns table (
  min_order_pieces integer,
  min_pieces_per_design integer,
  default_shipping_method text,
  prices_subject_to_change boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    cs.min_order_pieces,
    cs.min_pieces_per_design,
    cs.default_shipping_method,
    cs.prices_subject_to_change
  from catalog_settings cs
  join lines l on l.id = cs.line_id
  where l.code = 'ogr'
  limit 1;
$$;

revoke all on function public.get_public_ogr_supplier_terms() from public;
grant execute on function public.get_public_ogr_supplier_terms() to anon, authenticated;

create or replace function public.get_public_active_lines()
returns table (
  id uuid,
  code text,
  name text,
  tagline text,
  description text,
  hero_image_url text,
  sort_order integer,
  public_showroom_path text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    l.id,
    l.code,
    l.name,
    l.tagline,
    l.description,
    l.hero_image_url,
    l.sort_order,
    l.public_showroom_path
  from lines l
  where l.active = true
  order by l.sort_order asc, l.name asc;
$$;

revoke all on function public.get_public_active_lines() from public;
grant execute on function public.get_public_active_lines() to anon, authenticated;

alter table lines enable row level security;
alter table territories enable row level security;
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
alter table wholesale_order_requests enable row level security;
alter table wholesale_order_request_items enable row level security;
alter table buyer_cart_items enable row level security;
alter table buyer_product_likes enable row level security;
alter table message_threads enable row level security;
alter table messages enable row level security;

drop policy if exists "public full access" on lines;
drop policy if exists "authenticated full access" on lines;
drop policy if exists "approved staff full access" on lines;
create policy "approved staff full access" on lines
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on territories;
create policy "approved staff full access" on territories
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

drop policy if exists "approved staff full access" on wholesale_order_requests;
create policy "approved staff full access" on wholesale_order_requests
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on wholesale_order_request_items;
create policy "approved staff full access" on wholesale_order_request_items
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on message_threads;
create policy "approved staff full access" on message_threads
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "live chat visitor read threads" on message_threads;
create policy "live chat visitor read threads" on message_threads
  for select to authenticated
  using (
    channel = 'live_chat'
    and visitor_user_id = auth.uid()
  );

-- Copilot suggestion applied: visitors do not UPDATE threads (service-role APIs own chat_state).
drop policy if exists "live chat visitor update own thread meta" on message_threads;

drop policy if exists "approved staff full access" on messages;
create policy "approved staff full access" on messages
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "live chat visitor read messages" on messages;
create policy "live chat visitor read messages" on messages
  for select to authenticated
  using (
    exists (
      select 1
      from message_threads t
      where t.id = messages.thread_id
        and t.channel = 'live_chat'
        and t.visitor_user_id = auth.uid()
    )
  );

-- Copilot suggestion applied: visitors do not INSERT messages directly (API + rate limits).
drop policy if exists "live chat visitor insert messages" on messages;

drop policy if exists "buyers manage own cart" on buyer_cart_items;
create policy "buyers manage own cart" on buyer_cart_items
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "approved staff read buyer carts" on buyer_cart_items;
create policy "approved staff read buyer carts" on buyer_cart_items
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "buyers manage own likes" on buyer_product_likes;
create policy "buyers manage own likes" on buyer_product_likes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "approved staff read buyer likes" on buyer_product_likes;
create policy "approved staff read buyer likes" on buyer_product_likes
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "buyers read linked prospect" on prospects;

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
      and p.status = 'approved'
      and p.wholesale_pricing_unlocked = true
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
        and p.status = 'approved'
        and p.wholesale_pricing_unlocked = true
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

-- ─────────────────────────────────────────────────────────────────────────
-- google_account_connections — staff Google Workspace OAuth (encrypted refresh).
-- See migrations/20260809143000_google_account_connections.sql.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists google_account_connections (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  google_sub text not null,
  google_email text not null,
  refresh_token_ciphertext text not null,
  scopes text[] not null default '{}'::text[],
  status text not null default 'active'
    check (status in ('active', 'revoked', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint google_account_connections_profile_id_uidx unique (profile_id)
);

create index if not exists google_account_connections_google_sub_idx
  on google_account_connections (google_sub);

drop trigger if exists google_account_connections_set_updated_at on google_account_connections;
create trigger google_account_connections_set_updated_at
  before update on google_account_connections
  for each row execute function set_updated_at();

alter table google_account_connections enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- gmail_thread_links — CRM association for Gmail threads (Phase D).
-- See migrations/20260809200000_gmail_thread_links.sql.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists gmail_thread_links (
  id uuid primary key default gen_random_uuid(),
  google_connection_id uuid not null references google_account_connections (id) on delete cascade,
  gmail_thread_id text not null,
  prospect_id integer references prospects (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  link_status text not null default 'confirmed'
    check (link_status in ('suggested', 'confirmed')),
  subject text,
  snippet text,
  participants jsonb not null default '[]'::jsonb,
  unread boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gmail_thread_links_connection_thread_uidx
    unique (google_connection_id, gmail_thread_id)
);

create index if not exists gmail_thread_links_prospect_last_message_idx
  on gmail_thread_links (prospect_id, last_message_at desc nulls last);

create index if not exists gmail_thread_links_contact_idx
  on gmail_thread_links (account_contact_id);

drop trigger if exists gmail_thread_links_set_updated_at on gmail_thread_links;
create trigger gmail_thread_links_set_updated_at
  before update on gmail_thread_links
  for each row execute function set_updated_at();

alter table gmail_thread_links enable row level security;

drop policy if exists "approved staff full access" on gmail_thread_links;
create policy "approved staff full access" on gmail_thread_links
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- calendar_event_links — CRM association for Google Calendar events (Phase F).
-- See migrations/20260810020000_calendar_event_links.sql.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  google_connection_id uuid not null references google_account_connections (id) on delete cascade,
  calendar_id text not null default 'primary',
  google_event_id text not null,
  prospect_id integer references prospects (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  link_status text not null default 'confirmed'
    check (link_status in ('suggested', 'confirmed')),
  title text,
  start_at timestamptz,
  end_at timestamptz,
  meet_url text,
  attendees jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_links_connection_calendar_event_uidx
    unique (google_connection_id, calendar_id, google_event_id)
);

create index if not exists calendar_event_links_prospect_start_idx
  on calendar_event_links (prospect_id, start_at desc nulls last);

create index if not exists calendar_event_links_contact_idx
  on calendar_event_links (account_contact_id);

drop trigger if exists calendar_event_links_set_updated_at on calendar_event_links;
create trigger calendar_event_links_set_updated_at
  before update on calendar_event_links
  for each row execute function set_updated_at();

alter table calendar_event_links enable row level security;

drop policy if exists "approved staff full access" on calendar_event_links;
create policy "approved staff full access" on calendar_event_links
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- system_messages — staff-only outbound System Messages ledger (product outreach).
-- See migrations/20260811120000_system_messages.sql.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists system_messages (
  id uuid primary key default gen_random_uuid(),
  message_type text not null
    check (message_type in ('product_outreach')),
  origin text not null
    check (origin in ('manual_product_email', 'agent_product_email')),
  status text not null
    check (status in (
      'draft',
      'queued',
      'scheduled',
      'sending',
      'sent',
      'delivered',
      'opened',
      'clicked',
      'bounced',
      'failed',
      'cancelled',
      'complained'
    )),
  catalog_item_id uuid references catalog_items (id) on delete set null,
  resend_email_id text,
  to_email text not null,
  to_name text,
  subject text not null default '',
  intro_text text,
  closing_text text,
  prospect_id integer references prospects (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  sent_by uuid references auth.users (id) on delete set null,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  last_opened_at timestamptz,
  last_clicked_at timestamptz,
  last_engagement_received_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  complained_at timestamptz,
  open_count integer not null default 0,
  click_count integer not null default 0,
  last_event_at timestamptz,
  failure_reason text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  automation_run_id uuid,
  sequence_id uuid,
  sequence_step integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists system_messages_resend_email_id_uidx
  on system_messages (resend_email_id)
  where resend_email_id is not null;

create index if not exists system_messages_message_type_created_at_idx
  on system_messages (message_type, created_at desc);

create index if not exists system_messages_catalog_item_sent_at_idx
  on system_messages (catalog_item_id, sent_at desc nulls last);

create index if not exists system_messages_prospect_sent_at_idx
  on system_messages (prospect_id, sent_at desc nulls last);

create index if not exists system_messages_status_created_at_idx
  on system_messages (status, created_at desc);

create index if not exists system_messages_agent_origin_status_created_at_idx
  on system_messages (status, created_at desc)
  where origin = 'agent_product_email';

create index if not exists system_messages_to_email_idx
  on system_messages (to_email);

create index if not exists system_messages_last_opened_at_idx
  on system_messages (last_opened_at)
  where last_opened_at is not null;

create index if not exists system_messages_last_clicked_at_idx
  on system_messages (last_clicked_at)
  where last_clicked_at is not null;

create index if not exists system_messages_last_engagement_received_at_idx
  on system_messages (last_engagement_received_at)
  where last_engagement_received_at is not null;

drop trigger if exists system_messages_set_updated_at on system_messages;
create trigger system_messages_set_updated_at
  before update on system_messages
  for each row execute function set_updated_at();

alter table system_messages enable row level security;

drop policy if exists "approved staff full access" on system_messages;
create policy "approved staff full access" on system_messages
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_conversion_attribution — convert → outreach message history + snapshots.
-- Phase 4. Demote must NOT delete these rows. Requires system_messages.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists account_conversion_attribution (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer not null references prospects (id) on delete cascade,
  converted_at timestamptz not null,
  converted_by uuid references auth.users (id) on delete set null,
  conversion_source text not null
    check (conversion_source in ('outreach', 'call', 'wholesale', 'manual')),
  attribution_model text not null
    check (attribution_model in ('staff_confirmed', 'last_touch_inferred', 'none')),
  attributed_system_message_id uuid references system_messages (id) on delete set null,
  contributing_system_message_ids uuid[] not null default '{}',
  catalog_item_id uuid references catalog_items (id) on delete set null,
  message_origin text,
  primary_channel text,
  priority text,
  fit_score numeric,
  product_fit text,
  channel_match boolean,
  lead_state text
    check (lead_state is null or lead_state in ('cold', 'warm', 'hot')),
  lead_score numeric,
  rules_version text,
  snapshot jsonb not null default '{}'::jsonb,
  attributed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists account_conversion_attribution_prospect_converted_uidx
  on account_conversion_attribution (prospect_id, converted_at);

create index if not exists account_conversion_attribution_converted_at_idx
  on account_conversion_attribution (converted_at desc);

create index if not exists account_conversion_attribution_message_idx
  on account_conversion_attribution (attributed_system_message_id)
  where attributed_system_message_id is not null;

alter table account_conversion_attribution enable row level security;

drop policy if exists "approved staff full access" on account_conversion_attribution;
create policy "approved staff full access" on account_conversion_attribution
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- system_message_events — Resend webhook event ledger (Phase 3).
-- See migrations/20260811140000_system_message_events.sql.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists system_message_events (
  id uuid primary key default gen_random_uuid(),
  system_message_id uuid not null references system_messages (id) on delete cascade,
  resend_email_id text,
  resend_event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint system_message_events_resend_event_id_uidx unique (resend_event_id)
);

create index if not exists system_message_events_system_message_created_at_idx
  on system_message_events (system_message_id, created_at);

create index if not exists system_message_events_resend_email_id_idx
  on system_message_events (resend_email_id)
  where resend_email_id is not null;

alter table system_message_events enable row level security;

drop policy if exists "approved staff full access" on system_message_events;
create policy "approved staff full access" on system_message_events
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- product_outreach_engagement_seen — shared staff cursor per catalog item (not per user).
-- See migrations/20260811160000_product_engagement_alerts.sql.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists product_outreach_engagement_seen (
  catalog_item_id uuid primary key references catalog_items (id) on delete cascade,
  seen_at timestamptz not null default now()
);

alter table product_outreach_engagement_seen enable row level security;

drop policy if exists "approved staff full access" on product_outreach_engagement_seen;
create policy "approved staff full access" on product_outreach_engagement_seen
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- Atomic Resend webhook apply (see migrations/20260811150000_apply_resend_system_message_event.sql
-- and 20260811160000_product_engagement_alerts.sql for last_* engagement fields).
create or replace function public.apply_resend_system_message_event(
  p_resend_email_id text,
  p_resend_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payload jsonb default '{}'::jsonb,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_msg public.system_messages%rowtype;
  v_event_id uuid;
  v_new_status text;
  v_last_event_at timestamptz;
begin
  if p_resend_email_id is null or length(trim(p_resend_email_id)) = 0 then
    return jsonb_build_object('status', 'unknown_email');
  end if;
  if p_resend_event_id is null or length(trim(p_resend_event_id)) = 0 then
    return jsonb_build_object('status', 'error', 'error', 'missing_resend_event_id');
  end if;

  select *
  into v_msg
  from public.system_messages
  where resend_email_id = p_resend_email_id
  for update;

  if not found then
    return jsonb_build_object('status', 'unknown_email');
  end if;

  insert into public.system_message_events (
    system_message_id,
    resend_email_id,
    resend_event_id,
    event_type,
    occurred_at,
    payload
  ) values (
    v_msg.id,
    p_resend_email_id,
    p_resend_event_id,
    p_event_type,
    p_occurred_at,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (resend_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object(
      'status', 'duplicate',
      'system_message_id', v_msg.id
    );
  end if;

  v_new_status := v_msg.status;
  v_last_event_at := case
    when v_msg.last_event_at is null or v_msg.last_event_at < p_occurred_at then p_occurred_at
    else v_msg.last_event_at
  end;

  if p_event_type = 'email.sent' then
    if v_msg.status not in ('bounced', 'failed', 'complained')
       and v_msg.status in ('draft', 'queued', 'sending') then
      v_new_status := 'sent';
    end if;
    update public.system_messages
    set
      status = v_new_status,
      sent_at = coalesce(sent_at, p_occurred_at),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.delivered' then
    if v_msg.status not in ('bounced', 'failed', 'complained') then
      v_new_status := 'delivered';
      update public.system_messages
      set
        status = v_new_status,
        delivered_at = coalesce(delivered_at, p_occurred_at),
        last_event_at = v_last_event_at
      where id = v_msg.id;
    else
      update public.system_messages
      set
        delivered_at = coalesce(delivered_at, p_occurred_at),
        last_event_at = v_last_event_at
      where id = v_msg.id;
    end if;

  elsif p_event_type = 'email.opened' then
    update public.system_messages
    set
      open_count = open_count + 1,
      opened_at = coalesce(opened_at, p_occurred_at),
      last_opened_at = case
        when last_opened_at is null or last_opened_at < p_occurred_at then p_occurred_at
        else last_opened_at
      end,
      last_engagement_received_at = clock_timestamp(),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.clicked' then
    update public.system_messages
    set
      click_count = click_count + 1,
      clicked_at = coalesce(clicked_at, p_occurred_at),
      last_clicked_at = case
        when last_clicked_at is null or last_clicked_at < p_occurred_at then p_occurred_at
        else last_clicked_at
      end,
      last_engagement_received_at = clock_timestamp(),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.bounced' then
    update public.system_messages
    set
      status = 'bounced',
      bounced_at = coalesce(bounced_at, p_occurred_at),
      failure_reason = coalesce(p_failure_reason, failure_reason),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.failed' then
    update public.system_messages
    set
      status = case
        when status in ('bounced', 'complained') then status
        else 'failed'
      end,
      failed_at = coalesce(failed_at, p_occurred_at),
      failure_reason = case
        when status = 'bounced' and failure_reason is not null then failure_reason
        else coalesce(p_failure_reason, failure_reason)
      end,
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.complained' then
    update public.system_messages
    set
      status = 'complained',
      complained_at = coalesce(complained_at, p_occurred_at),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  else
    update public.system_messages
    set last_event_at = v_last_event_at
    where id = v_msg.id;
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'system_message_id', v_msg.id
  );
end;
$$;

revoke all on function public.apply_resend_system_message_event(
  text, text, text, timestamptz, jsonb, text
) from public;

grant execute on function public.apply_resend_system_message_event(
  text, text, text, timestamptz, jsonb, text
) to service_role;
