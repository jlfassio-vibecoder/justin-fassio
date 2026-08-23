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
-- principals — legal entities behind sales lines (Phase 1A).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists principals (
  id uuid primary key default gen_random_uuid(),
  legal_name text,
  dba_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists principals_set_updated_at on principals;
create trigger principals_set_updated_at
  before update on principals
  for each row execute function set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- lines — the wholesale lines Justin reps (Old Guys Rule, Busted Knuckles
-- Garage, and any future lines). Catalog items belong to a line.
-- Phase 1A: status / acquisition_stage / principal / commercial fields.
-- `active` remains the public-portfolio flag (independent of status).
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
  principal_id uuid references principals (id) on delete set null,
  status text not null default 'prospective'
    check (status in (
      'prospective',
      'confirmed',
      'onboarding',
      'active',
      'paused',
      'declined',
      'terminated'
    )),
  acquisition_stage text
    check (
      acquisition_stage is null
      or acquisition_stage in (
        'identified',
        'researching',
        'contact_requested',
        'conversation',
        'evaluating',
        'negotiating',
        'decision_pending'
      )
    ),
  default_currency text,
  commission_rate numeric(5, 4),
  effective_date date,
  termination_date date,
  productivity_thresholds jsonb,
  ai_profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lines_acquisition_stage_required_check
    check (
      (status = 'prospective' and acquisition_stage is not null)
      or (status <> 'prospective' and acquisition_stage is null)
    )
);

drop trigger if exists lines_set_updated_at on lines;
create trigger lines_set_updated_at
  before update on lines
  for each row execute function set_updated_at();

create index if not exists lines_principal_id_idx on lines (principal_id);
create index if not exists lines_status_idx on lines (status);

insert into lines (code, name, active, tagline, description, sort_order, public_showroom_path, status)
values
  (
    'ogr',
    'Old Guys Rule',
    true,
    'Now Repping',
    'Apparel & lifestyle goods for the surf and skate crowd.',
    10,
    '/old-guys-rule-wholesale',
    'active'
  ),
  ('bkg', 'Busted Knuckles Garage', false, null, null, 20, null, 'paused')
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
  level text not null default 'province_state'
    check (level in ('country', 'province_state', 'region', 'county')),
  parent_territory_id uuid references territories (id),
  status text not null default 'active'
    check (status in ('active', 'proposed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Phase 1A: five-code CHECK dropped to allow hierarchical regions (e.g. norcal).
  constraint territories_country_code_check check (country_code in ('CA', 'US'))
);

drop trigger if exists territories_set_updated_at on territories;
create trigger territories_set_updated_at
  before update on territories
  for each row execute function set_updated_at();

create index if not exists territories_parent_territory_id_idx
  on territories (parent_territory_id);

create index if not exists territories_level_idx on territories (level);

insert into territories (code, name, country_code, sort_order, active, level, status)
values
  ('bc', 'British Columbia', 'CA', 10, true, 'province_state', 'active'),
  ('ab', 'Alberta', 'CA', 20, true, 'province_state', 'active'),
  ('ca', 'California', 'US', 30, true, 'province_state', 'active'),
  ('or', 'Oregon', 'US', 40, true, 'province_state', 'active'),
  ('wa', 'Washington', 'US', 50, true, 'province_state', 'active')
on conflict (code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- sales_line_territories — geographic rights for a particular line (Phase 1A).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists sales_line_territories (
  id uuid primary key default gen_random_uuid(),
  sales_line_id uuid not null references lines (id) on delete cascade,
  territory_id uuid not null references territories (id),
  rights_type text not null
    check (rights_type in (
      'exclusive',
      'limited_exclusive',
      'non_exclusive',
      'unconfirmed'
    )),
  status text not null
    check (status in ('proposed', 'active', 'expired', 'disputed')),
  effective_date date,
  expiration_date date,
  contract_source text,
  restrictions jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_line_territories_id_sales_line_uidx unique (id, sales_line_id)
);

create unique index if not exists sales_line_territories_line_territory_active_uidx
  on sales_line_territories (sales_line_id, territory_id)
  where status <> 'expired';

create index if not exists sales_line_territories_sales_line_id_idx
  on sales_line_territories (sales_line_id);

create index if not exists sales_line_territories_territory_id_idx
  on sales_line_territories (territory_id);

drop trigger if exists sales_line_territories_set_updated_at on sales_line_territories;
create trigger sales_line_territories_set_updated_at
  before update on sales_line_territories
  for each row execute function set_updated_at();

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
  import_protected boolean not null default false,
  apparel_capability text,
  existing_ogr text,
  qualification_status text,
  next_action text,
  source_note text,
  postal_code text,
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
-- prospect_id matches prospects.id. Phase 9B adds NOT VALID FKs (VALIDATE in 9C).
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists prospect_updates (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer not null,
  status text,                        -- e.g. 'contacted', 'qualified', 'not a fit'
  note text,
  retailer_line_account_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists prospect_updates_prospect_id_idx on prospect_updates (prospect_id);

alter table public.prospect_updates
  drop constraint if exists prospect_updates_prospect_id_fkey;
alter table public.prospect_updates
  add constraint prospect_updates_prospect_id_fkey
  foreign key (prospect_id) references public.prospects (id)
  on delete restrict
  not valid;

-- ─────────────────────────────────────────────────────────────────────────
-- calls — logged prospect calls from the Log Call modal, with PMF scoring.
-- prospect_id matches prospects.id. Phase 9B adds NOT VALID FKs (VALIDATE in 9C).
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
  order_value_original_amount numeric(12, 2),
  order_value_original_currency text,
  order_value_exchange_rate numeric(18, 8),
  order_value_exchange_rate_date date,
  order_value_converted_amount numeric(12, 2),
  order_value_converted_currency text,
  order_value_conversion_source text,
  retailer_line_account_id uuid,
  objection_tags text[] not null default '{}',  -- buyer feedback checkboxes from the modal
  notes text,
  follow_up_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calls_prospect_id_idx on calls (prospect_id);
create index if not exists calls_line_id_idx on calls (line_id);
create index if not exists calls_call_date_idx on calls (call_date);

alter table public.calls
  drop constraint if exists calls_prospect_id_fkey;
alter table public.calls
  add constraint calls_prospect_id_fkey
  foreign key (prospect_id) references public.prospects (id)
  on delete restrict
  not valid;

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
  -- Phase 1A multi-currency expand (do not drop CAD)
  original_amount numeric(12, 2),
  original_currency text,
  exchange_rate numeric(18, 8),
  exchange_rate_date date,
  converted_amount numeric(12, 2),
  converted_currency text,
  conversion_source text,
  retailer_line_account_id uuid,
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
  retailer_line_account_id uuid,
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
-- Multi-line CRM tables (Phase 1A) — after prospects + account_contacts exist.
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists retailer_line_accounts (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  sales_line_id uuid not null references lines (id),
  sales_line_territory_id uuid,
  relationship_status text not null
    check (relationship_status in (
      'prospect',
      'qualified',
      'opened',
      'inactive',
      'terminated'
    )),
  converted_at timestamptz,
  initial_order_date timestamptz,
  notes text,
  fit text,
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
  region text,
  primary_district text,
  subterritory text,
  secondary_channels jsonb not null default '[]'::jsonb,
  retail_subchannels jsonb not null default '[]'::jsonb,
  venue_contexts jsonb not null default '[]'::jsonb,
  lifestyle_themes jsonb not null default '[]'::jsonb,
  retail_capabilities jsonb not null default '[]'::jsonb,
  backfill_review_reason text,
  line_account_markers text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_line_accounts_territory_same_line_fkey
    foreign key (sales_line_territory_id, sales_line_id)
    references sales_line_territories (id, sales_line_id)
    match simple,
  constraint retailer_line_accounts_line_account_markers_check
    check (
      line_account_markers <@ array[
        'historical_purchaser',
        'reactivation_candidate',
        'reactivation_unresponsive',
        'outreach_eligible',
        'lookalike_prospect'
      ]::text[]
    )
);

create unique index if not exists retailer_line_accounts_retailer_line_operational_uidx
  on retailer_line_accounts (retailer_id, sales_line_id)
  where relationship_status <> 'terminated';

create index if not exists retailer_line_accounts_sales_line_status_idx
  on retailer_line_accounts (sales_line_id, relationship_status);

create index if not exists retailer_line_accounts_retailer_id_idx
  on retailer_line_accounts (retailer_id);

create index if not exists retailer_line_accounts_line_account_markers_gin
  on retailer_line_accounts using gin (line_account_markers);

drop trigger if exists retailer_line_accounts_set_updated_at on retailer_line_accounts;
create trigger retailer_line_accounts_set_updated_at
  before update on retailer_line_accounts
  for each row execute function set_updated_at();

create table if not exists retailer_line_contacts (
  id uuid primary key default gen_random_uuid(),
  retailer_line_account_id uuid not null
    references retailer_line_accounts (id) on delete cascade,
  account_contact_id uuid not null
    references account_contacts (id) on delete cascade,
  role text not null
    check (role in ('buyer', 'manager', 'owner')),
  is_primary boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_line_contacts_account_contact_uidx
    unique (retailer_line_account_id, account_contact_id)
);

create unique index if not exists retailer_line_contacts_one_primary_uidx
  on retailer_line_contacts (retailer_line_account_id)
  where is_primary;

create index if not exists retailer_line_contacts_account_contact_id_idx
  on retailer_line_contacts (account_contact_id);

drop trigger if exists retailer_line_contacts_set_updated_at on retailer_line_contacts;
create trigger retailer_line_contacts_set_updated_at
  before update on retailer_line_contacts
  for each row execute function set_updated_at();

create table if not exists retailer_field_changes (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  field_path text not null,
  old_value jsonb,
  new_value jsonb,
  source text not null default 'user'
    check (source in ('user', 'ai', 'import', 'calculated', 'unknown')),
  actor_id uuid references auth.users (id) on delete set null,
  sales_line_id uuid references lines (id),
  retailer_line_account_id uuid references retailer_line_accounts (id),
  status text not null default 'applied'
    check (status in ('pending', 'applied', 'rejected', 'superseded')),
  confidence text,
  provider text,
  source_urls jsonb not null default '[]'::jsonb,
  enrichment_job_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists retailer_field_changes_retailer_id_idx
  on retailer_field_changes (retailer_id, created_at desc);

create index if not exists retailer_field_changes_sales_line_id_idx
  on retailer_field_changes (sales_line_id);

create index if not exists retailer_field_changes_rla_id_idx
  on retailer_field_changes (retailer_line_account_id);

create table if not exists account_import_batches (
  id uuid primary key default gen_random_uuid(),
  sales_line_id uuid not null references lines (id),
  source_type text not null
    check (source_type in (
      'historical_customer',
      'faire_customer',
      'zoominfo_lead',
      'research_prospect',
      'other'
    )),
  source_filename text not null,
  content_sha256 text,
  status text not null default 'previewed'
    check (status in (
      'previewed',
      'committed',
      'enriching',
      'enrichment_partial',
      'completed',
      'cancelled'
    )),
  classification_snapshot jsonb not null default '{}'::jsonb,
  report jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_import_batches_id_sales_line_uidx unique (id, sales_line_id)
);

create unique index if not exists account_import_batches_line_sha_active_uidx
  on account_import_batches (sales_line_id, content_sha256)
  where content_sha256 is not null
    and status in ('previewed', 'committed', 'enriching', 'enrichment_partial', 'completed');

create index if not exists account_import_batches_sales_line_id_idx
  on account_import_batches (sales_line_id);

drop trigger if exists account_import_batches_set_updated_at on account_import_batches;
create trigger account_import_batches_set_updated_at
  before update on account_import_batches
  for each row execute function set_updated_at();

create table if not exists account_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references account_import_batches (id) on delete cascade,
  sales_line_id uuid not null references lines (id),
  row_number integer not null,
  raw_payload jsonb not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  fingerprint text,
  match_decision text not null default 'needs_review'
    check (match_decision in (
      'create_retailer',
      'link_existing',
      'update_rla',
      'in_file_duplicate',
      'prior_import_skip',
      'needs_review',
      'blocked'
    )),
  status text not null default 'previewed'
    check (status in (
      'previewed',
      'queued',
      'imported',
      'linked',
      'updated',
      'skipped',
      'failed',
      'cancelled'
    )),
  retailer_id integer references prospects (id) on delete set null,
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  error text,
  former_rep_code text,
  raw_address_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_import_rows_batch_row_uidx unique (batch_id, row_number),
  constraint account_import_rows_batch_line_fkey
    foreign key (batch_id, sales_line_id)
    references account_import_batches (id, sales_line_id)
    on delete cascade
);

create unique index if not exists account_import_rows_line_fingerprint_committed_uidx
  on account_import_rows (sales_line_id, fingerprint)
  where fingerprint is not null
    and status in ('imported', 'linked', 'updated');

create index if not exists account_import_rows_batch_id_idx
  on account_import_rows (batch_id);

drop trigger if exists account_import_rows_set_updated_at on account_import_rows;
create trigger account_import_rows_set_updated_at
  before update on account_import_rows
  for each row execute function set_updated_at();

create table if not exists account_enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references account_import_batches (id) on delete cascade,
  retailer_id integer not null references prospects (id) on delete cascade,
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
  mode text not null
    check (mode in ('fill-blanks', 'update')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed', 'cancelled')),
  research_brief text,
  evidence jsonb not null default '{}'::jsonb,
  provider text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists account_enrichment_jobs_batch_retailer_mode_uidx
  on account_enrichment_jobs (batch_id, retailer_id, mode)
  where status <> 'cancelled';

create index if not exists account_enrichment_jobs_batch_id_idx
  on account_enrichment_jobs (batch_id);

drop trigger if exists account_enrichment_jobs_set_updated_at on account_enrichment_jobs;
create trigger account_enrichment_jobs_set_updated_at
  before update on account_enrichment_jobs
  for each row execute function set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'retailer_field_changes_enrichment_job_id_fkey'
  ) then
    alter table retailer_field_changes
      add constraint retailer_field_changes_enrichment_job_id_fkey
      foreign key (enrichment_job_id)
      references account_enrichment_jobs (id) on delete set null;
  end if;
end $$;

create index if not exists retailer_field_changes_enrichment_job_id_idx
  on retailer_field_changes (enrichment_job_id);

create table if not exists lookalike_jobs (
  id uuid primary key default gen_random_uuid(),
  sales_line_id uuid not null references lines (id),
  created_by uuid not null,
  seed_retailer_ids integer[] not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'proposed', 'failed', 'cancelled')),
  trait_brief text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lookalike_jobs_sales_line_id_idx
  on lookalike_jobs (sales_line_id);

drop trigger if exists lookalike_jobs_set_updated_at on lookalike_jobs;
create trigger lookalike_jobs_set_updated_at
  before update on lookalike_jobs
  for each row execute function set_updated_at();

create table if not exists lookalike_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references lookalike_jobs (id) on delete cascade,
  name text not null,
  city text,
  state text,
  website text,
  evidence text,
  match_decision text
    check (match_decision in (
      'create_retailer',
      'link_existing',
      'update_rla',
      'in_file_duplicate',
      'prior_import_skip',
      'needs_review',
      'blocked'
    )),
  status text not null default 'proposed'
    check (status in ('proposed', 'already_in_crm', 'approved', 'rejected')),
  retailer_id integer references prospects (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lookalike_candidates_job_id_idx
  on lookalike_candidates (job_id);

drop trigger if exists lookalike_candidates_set_updated_at on lookalike_candidates;
create trigger lookalike_candidates_set_updated_at
  before update on lookalike_candidates
  for each row execute function set_updated_at();

create table if not exists retailer_line_targets (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  sales_line_id uuid not null references lines (id) on delete cascade,
  interest text,
  fit_notes text,
  suggested_geo text,
  status text not null default 'watching'
    check (status in ('watching', 'shortlist', 'dropped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint retailer_line_targets_retailer_line_uidx unique (retailer_id, sales_line_id)
);

create index if not exists retailer_line_targets_sales_line_id_idx
  on retailer_line_targets (sales_line_id);

drop trigger if exists retailer_line_targets_set_updated_at on retailer_line_targets;
create trigger retailer_line_targets_set_updated_at
  before update on retailer_line_targets
  for each row execute function set_updated_at();

create table if not exists migration_review_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists migration_review_queue_unresolved_idx
  on migration_review_queue (entity_type, created_at)
  where resolved_at is null;

create unique index if not exists migration_review_queue_unresolved_entity_uidx
  on migration_review_queue (entity_type, entity_id, reason)
  where resolved_at is null;

-- Transitional FKs from operational tables → retailer_line_accounts
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_retailer_line_account_id_fkey'
  ) then
    alter table orders
      add constraint orders_retailer_line_account_id_fkey
      foreign key (retailer_line_account_id)
      references retailer_line_accounts (id) on delete set null;
  end if;
end $$;

create index if not exists orders_retailer_line_account_id_idx
  on orders (retailer_line_account_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'calls_retailer_line_account_id_fkey'
  ) then
    alter table calls
      add constraint calls_retailer_line_account_id_fkey
      foreign key (retailer_line_account_id)
      references retailer_line_accounts (id) on delete set null;
  end if;
end $$;

create index if not exists calls_retailer_line_account_id_idx
  on calls (retailer_line_account_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'prospect_updates_retailer_line_account_id_fkey'
  ) then
    alter table prospect_updates
      add constraint prospect_updates_retailer_line_account_id_fkey
      foreign key (retailer_line_account_id)
      references retailer_line_accounts (id) on delete set null;
  end if;
end $$;

create index if not exists prospect_updates_retailer_line_account_id_idx
  on prospect_updates (retailer_line_account_id);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'account_reorder_settings_retailer_line_account_id_fkey'
  ) then
    alter table account_reorder_settings
      add constraint account_reorder_settings_retailer_line_account_id_fkey
      foreign key (retailer_line_account_id)
      references retailer_line_accounts (id) on delete set null;
  end if;
end $$;

create index if not exists account_reorder_settings_retailer_line_account_id_idx
  on account_reorder_settings (retailer_line_account_id);

-- Derived activity / productivity views
create or replace view retailer_line_account_activity as
select
  rla.id as retailer_line_account_id,
  case
    when exists (
      select 1
      from orders o
      where o.retailer_line_account_id = rla.id
        and o.status <> 'draft'
        and o.order_date >= (current_date - 365)
    ) then 'active'
    when exists (
      select 1
      from orders o
      where o.retailer_line_account_id = rla.id
        and o.status <> 'draft'
    ) then 'dormant'
    when 'historical_purchaser' = any (rla.line_account_markers) then 'dormant'
    else 'never_ordered'
  end as activity_status
from retailer_line_accounts rla;

create or replace view retailer_line_account_productivity as
select
  rla.id as retailer_line_account_id,
  case
    when l.productivity_thresholds is null then 'unclassified'
    else 'unclassified'
  end as productivity_class
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id;

-- Enforcement triggers (cross-table rules)
create or replace function public.enforce_retailer_line_target_prospective()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  select status into line_status from lines where id = new.sales_line_id;
  if line_status is null then
    raise exception 'retailer_line_targets: sales_line_id % not found', new.sales_line_id;
  end if;
  if line_status <> 'prospective' then
    raise exception
      'retailer_line_targets may only reference prospective lines (got status %)',
      line_status;
  end if;
  return new;
end;
$$;

drop trigger if exists retailer_line_targets_prospective_only on retailer_line_targets;
create trigger retailer_line_targets_prospective_only
  before insert or update of sales_line_id on retailer_line_targets
  for each row execute function public.enforce_retailer_line_target_prospective();

create or replace function public.enforce_retailer_line_account_not_prospective()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  select status into line_status from lines where id = new.sales_line_id;
  if line_status is null then
    raise exception 'retailer_line_accounts: sales_line_id % not found', new.sales_line_id;
  end if;
  if line_status = 'prospective' then
    raise exception 'retailer_line_accounts cannot be created for prospective lines';
  end if;
  return new;
end;
$$;

drop trigger if exists retailer_line_accounts_not_prospective on retailer_line_accounts;
create trigger retailer_line_accounts_not_prospective
  before insert or update of sales_line_id on retailer_line_accounts
  for each row execute function public.enforce_retailer_line_account_not_prospective();

create or replace function public.enforce_order_not_prospective_line()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  if new.retailer_line_account_id is not null then
    select l.status into line_status
    from retailer_line_accounts rla
    join lines l on l.id = rla.sales_line_id
    where rla.id = new.retailer_line_account_id;
    if line_status = 'prospective' then
      raise exception 'orders cannot reference prospective-line accounts';
    end if;
  end if;
  if new.line_id is not null then
    select status into line_status from lines where id = new.line_id;
    if line_status = 'prospective' then
      raise exception 'orders.line_id cannot reference a prospective line';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_not_prospective_line on orders;
create trigger orders_not_prospective_line
  before insert or update of retailer_line_account_id, line_id on orders
  for each row execute function public.enforce_order_not_prospective_line();

create or replace function public.enforce_system_message_not_prospective_line()
returns trigger
language plpgsql
as $$
declare
  line_status text;
begin
  if new.retailer_line_account_id is not null then
    select l.status into line_status
    from retailer_line_accounts rla
    join lines l on l.id = rla.sales_line_id
    where rla.id = new.retailer_line_account_id;
    if line_status = 'prospective' then
      raise exception 'system_messages cannot reference prospective-line accounts';
    end if;
  end if;
  return new;
end;
$$;

-- system_messages table is created later; trigger attached in that section.

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
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
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
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
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

create or replace function public.get_public_line_cards()
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
  where l.code in ('ogr', 'eagle-peak', 'big-fish')
    and l.status in ('active', 'onboarding', 'confirmed')
  order by l.sort_order asc, l.name asc;
$$;

revoke all on function public.get_public_line_cards() from public;
grant execute on function public.get_public_line_cards() to anon, authenticated;

alter table lines enable row level security;
alter table territories enable row level security;
alter table principals enable row level security;
alter table sales_line_territories enable row level security;
alter table retailer_line_accounts enable row level security;
alter table retailer_line_contacts enable row level security;
alter table retailer_field_changes enable row level security;
alter table retailer_line_targets enable row level security;
alter table migration_review_queue enable row level security;
alter table account_import_batches enable row level security;
alter table account_import_rows enable row level security;
alter table account_enrichment_jobs enable row level security;
alter table lookalike_jobs enable row level security;
alter table lookalike_candidates enable row level security;
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

drop policy if exists "approved staff full access" on principals;
create policy "approved staff full access" on principals
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on sales_line_territories;
create policy "approved staff full access" on sales_line_territories
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on retailer_line_accounts;
create policy "approved staff full access" on retailer_line_accounts
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on retailer_line_contacts;
create policy "approved staff full access" on retailer_line_contacts
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on retailer_field_changes;
create policy "approved staff full access" on retailer_field_changes
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff read" on account_import_batches;
create policy "approved staff read" on account_import_batches
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on account_import_batches;
create policy "approved owner write" on account_import_batches
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff read" on account_import_rows;
create policy "approved staff read" on account_import_rows
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on account_import_rows;
create policy "approved owner write" on account_import_rows
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff read" on account_enrichment_jobs;
create policy "approved staff read" on account_enrichment_jobs
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on account_enrichment_jobs;
create policy "approved owner write" on account_enrichment_jobs
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff read" on lookalike_jobs;
create policy "approved staff read" on lookalike_jobs
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on lookalike_jobs;
create policy "approved owner write" on lookalike_jobs
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff read" on lookalike_candidates;
create policy "approved staff read" on lookalike_candidates
  for select to authenticated
  using (public.is_approved_staff());

drop policy if exists "approved owner write" on lookalike_candidates;
create policy "approved owner write" on lookalike_candidates
  for all to authenticated
  using (public.is_approved_owner())
  with check (public.is_approved_owner());

drop policy if exists "approved staff full access" on retailer_line_targets;
create policy "approved staff full access" on retailer_line_targets
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on migration_review_queue;
create policy "approved staff full access" on migration_review_queue
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
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
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
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
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
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
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

drop trigger if exists system_messages_not_prospective_line on system_messages;
create trigger system_messages_not_prospective_line
  before insert or update of retailer_line_account_id on system_messages
  for each row execute function public.enforce_system_message_not_prospective_line();

-- Block leaving prospective while research targets still exist (no auto-convert).
create or replace function public.enforce_lines_leave_prospective_without_targets()
returns trigger
language plpgsql
as $$
declare
  target_count integer;
begin
  if old.status = 'prospective' and new.status is distinct from 'prospective' then
    select count(*) into target_count
    from retailer_line_targets
    where sales_line_id = old.id;

    if target_count > 0 then
      raise exception
        'Cannot change line % from prospective while % retailer_line_targets exist; clear or archive targets before promotion',
        old.code,
        target_count;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists lines_leave_prospective_without_targets on lines;
create trigger lines_leave_prospective_without_targets
  before update of status on lines
  for each row execute function public.enforce_lines_leave_prospective_without_targets();

-- ─────────────────────────────────────────────────────────────────────────
-- account_conversion_attribution — convert → outreach message history + snapshots.
-- Phase 4. Demote must NOT delete these rows. Requires system_messages.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists account_conversion_attribution (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer not null references prospects (id) on delete cascade,
  retailer_line_account_id uuid references retailer_line_accounts (id) on delete set null,
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
-- outreach_automation_runs — nightly prep idempotency (Phase 5).
-- Briefing is on-read; no snapshot table.
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists outreach_automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  kind text not null default 'nightly_prep'
    check (kind in ('nightly_prep')),
  status text not null
    check (status in ('running', 'succeeded', 'partial', 'empty_pool', 'failed')),
  trigger text not null
    check (trigger in ('cron', 'manual')),
  capacity integer not null default 0
    check (capacity >= 0),
  pending_before integer not null default 0
    check (pending_before >= 0),
  net_capacity integer not null default 0
    check (net_capacity >= 0),
  selected_count integer not null default 0
    check (selected_count >= 0),
  produced_count integer not null default 0
    check (produced_count >= 0),
  skipped_count integer not null default 0
    check (skipped_count >= 0),
  failed_count integer not null default 0
    check (failed_count >= 0),
  shortfall integer not null default 0
    check (shortfall >= 0),
  channel_allocation jsonb not null default '{}'::jsonb,
  error text,
  target_errors jsonb not null default '[]'::jsonb,
  reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_automation_runs_kind_run_date_uidx unique (kind, run_date)
);

create index if not exists outreach_automation_runs_run_date_idx
  on outreach_automation_runs (run_date desc);

create index if not exists outreach_automation_runs_status_idx
  on outreach_automation_runs (status);

drop trigger if exists outreach_automation_runs_set_updated_at on outreach_automation_runs;
create trigger outreach_automation_runs_set_updated_at
  before update on outreach_automation_runs
  for each row execute function set_updated_at();

alter table outreach_automation_runs enable row level security;

drop policy if exists "approved staff full access" on outreach_automation_runs;
create policy "approved staff full access" on outreach_automation_runs
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create index if not exists system_messages_automation_run_id_idx
  on system_messages (automation_run_id)
  where automation_run_id is not null;

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

-- ─────────────────────────────────────────────────────────────────────────
-- Phase 1C — temporary OGR dual-write (mirrored from …130000)
-- ─────────────────────────────────────────────────────────────────────────

-- Phase 1C: Temporary OGR dual-write compatibility only.
-- One-way: prospects / account_contacts / operational inserts → OGR line accounts.
-- No UI/API cutover. No Eagle Peak / Big Fish / BKG / prospective accounts.
-- No reverse sync (RLA → prospects). Local-first. Preserve IDs and legacy columns.
-- Contact sync: AFTER INSERT OR UPDATE (role / is_primary / notes when distinct).

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.ogr_retailer_line_account_id_for_retailer(p_retailer_id integer)
returns uuid
language sql
stable
as $$
  select rla.id
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  where rla.retailer_id = p_retailer_id
    and rla.relationship_status <> 'terminated'
  limit 1;
$$;

create or replace function public.map_prospect_account_status_to_relationship(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'prospect' then 'prospect'
    when 'active_account' then 'opened'
    when 'inactive' then 'inactive'
    else null
  end;
$$;

-- Ensure/upsert OGR retailer_line_account from a prospects row.
-- Territory assigned only on INSERT (BC-only). Updates never change sales_line_territory_id.
create or replace function public.ensure_ogr_retailer_line_account_from_prospect(p prospects)
returns uuid
language plpgsql
as $$
declare
  v_ogr_id uuid;
  v_ogr_status text;
  v_rla_id uuid;
  v_relationship text;
  v_relationship_to_apply text;
  v_terr_code text;
  v_slt_id uuid;
  v_review_reason text;
  v_existing retailer_line_accounts%rowtype;
begin
  select id, status into v_ogr_id, v_ogr_status
  from lines
  where code = 'ogr';

  if v_ogr_id is null or v_ogr_status <> 'active' then
    raise exception 'Phase 1C: lines.code = ogr missing or not active';
  end if;

  v_relationship := public.map_prospect_account_status_to_relationship(p.account_status);
  if v_relationship is null then
    raise exception 'Phase 1C: unsupported prospects.account_status %', p.account_status;
  end if;

  select rla.* into v_existing
  from retailer_line_accounts rla
  where rla.retailer_id = p.id
    and rla.sales_line_id = v_ogr_id
    and rla.relationship_status <> 'terminated'
  limit 1;

  if v_existing.id is not null then
    v_rla_id := v_existing.id;

    v_relationship_to_apply := v_relationship;
    if v_existing.relationship_status = 'opened' and p.account_status = 'prospect' then
      v_relationship_to_apply := 'opened';
    end if;

    if v_existing.relationship_status is distinct from v_relationship_to_apply
      or v_existing.converted_at is distinct from p.converted_at
      or v_existing.initial_order_date is distinct from p.initial_order_date
      or v_existing.notes is distinct from p.notes
      or v_existing.fit is distinct from p.fit
      or v_existing.fit_score is distinct from p.fit_score
      or v_existing.ideal_opening_units is distinct from p.ideal_opening_units
      or v_existing.priority is distinct from p.priority
      or v_existing.provisional_grade is distinct from p.provisional_grade
      or v_existing.verification_status is distinct from p.verification_status
      or v_existing.buyer_verified is distinct from p.buyer_verified
      or v_existing.apparel_capability is distinct from p.apparel_capability
      or v_existing.existing_ogr is distinct from p.existing_ogr
      or v_existing.qualification_status is distinct from p.qualification_status
      or v_existing.next_action is distinct from p.next_action
      or v_existing.source_note is distinct from p.source_note
      or v_existing.region is distinct from p.region
      or v_existing.primary_district is distinct from p.primary_district
      or v_existing.subterritory is distinct from p.subterritory
      or v_existing.secondary_channels is distinct from coalesce(p.secondary_channels, '[]'::jsonb)
      or v_existing.retail_subchannels is distinct from coalesce(p.retail_subchannels, '[]'::jsonb)
      or v_existing.venue_contexts is distinct from coalesce(p.venue_contexts, '[]'::jsonb)
      or v_existing.lifestyle_themes is distinct from coalesce(p.lifestyle_themes, '[]'::jsonb)
      or v_existing.retail_capabilities is distinct from coalesce(p.retail_capabilities, '[]'::jsonb)
    then
      update retailer_line_accounts rla
      set
        relationship_status = v_relationship_to_apply,
        converted_at = p.converted_at,
        initial_order_date = p.initial_order_date,
        notes = p.notes,
        fit = p.fit,
        fit_score = p.fit_score,
        ideal_opening_units = p.ideal_opening_units,
        priority = p.priority,
        provisional_grade = p.provisional_grade,
        verification_status = p.verification_status,
        buyer_verified = p.buyer_verified,
        apparel_capability = p.apparel_capability,
        existing_ogr = p.existing_ogr,
        qualification_status = p.qualification_status,
        next_action = p.next_action,
        source_note = p.source_note,
        region = p.region,
        primary_district = p.primary_district,
        subterritory = p.subterritory,
        secondary_channels = coalesce(p.secondary_channels, '[]'::jsonb),
        retail_subchannels = coalesce(p.retail_subchannels, '[]'::jsonb),
        venue_contexts = coalesce(p.venue_contexts, '[]'::jsonb),
        lifestyle_themes = coalesce(p.lifestyle_themes, '[]'::jsonb),
        retail_capabilities = coalesce(p.retail_capabilities, '[]'::jsonb)
      where rla.id = v_rla_id;
      -- Do not touch sales_line_territory_id / retailer_id / sales_line_id.
    end if;

    return v_rla_id;
  end if;

  -- INSERT path: BC-only territory assignment
  select t.code into v_terr_code
  from territories t
  where t.id = p.territory_id;

  if v_terr_code = 'bc' then
    select slt.id into v_slt_id
    from sales_line_territories slt
    join territories t on t.id = slt.territory_id and t.code = 'bc'
    where slt.sales_line_id = v_ogr_id
      and slt.status = 'active'
    limit 1;
    v_review_reason := null;
  elsif v_terr_code in ('or', 'wa', 'ca', 'ab', 'norcal') then
    v_slt_id := null;
    v_review_reason := 'non_bc_territory';
  else
    v_slt_id := null;
    v_review_reason := 'ambiguous_territory';
  end if;

  insert into retailer_line_accounts (
    retailer_id,
    sales_line_id,
    sales_line_territory_id,
    relationship_status,
    converted_at,
    initial_order_date,
    notes,
    fit,
    fit_score,
    ideal_opening_units,
    priority,
    provisional_grade,
    verification_status,
    buyer_verified,
    apparel_capability,
    existing_ogr,
    qualification_status,
    next_action,
    source_note,
    region,
    primary_district,
    subterritory,
    secondary_channels,
    retail_subchannels,
    venue_contexts,
    lifestyle_themes,
    retail_capabilities,
    backfill_review_reason
  )
  values (
    p.id,
    v_ogr_id,
    v_slt_id,
    v_relationship,
    p.converted_at,
    p.initial_order_date,
    p.notes,
    p.fit,
    p.fit_score,
    p.ideal_opening_units,
    p.priority,
    p.provisional_grade,
    p.verification_status,
    p.buyer_verified,
    p.apparel_capability,
    p.existing_ogr,
    p.qualification_status,
    p.next_action,
    p.source_note,
    p.region,
    p.primary_district,
    p.subterritory,
    coalesce(p.secondary_channels, '[]'::jsonb),
    coalesce(p.retail_subchannels, '[]'::jsonb),
    coalesce(p.venue_contexts, '[]'::jsonb),
    coalesce(p.lifestyle_themes, '[]'::jsonb),
    coalesce(p.retail_capabilities, '[]'::jsonb),
    v_review_reason
  )
  returning id into v_rla_id;

  if v_review_reason is not null then
    insert into migration_review_queue (entity_type, entity_id, reason, payload)
    select
      'retailer_line_account',
      v_rla_id::text,
      v_review_reason,
      jsonb_build_object(
        'retailer_id', p.id,
        'sales_line_id', v_ogr_id,
        'territory_code', v_terr_code,
        'phase', '1c'
      )
    where not exists (
      select 1
      from migration_review_queue q
      where q.entity_type = 'retailer_line_account'
        and q.entity_id = v_rla_id::text
        and q.reason = v_review_reason
        and q.resolved_at is null
    );
  end if;

  return v_rla_id;
end;
$$;

-- Resolve or ensure OGR RLA for a retailer id (prospect must exist).
create or replace function public.ensure_ogr_retailer_line_account_for_retailer_id(p_retailer_id integer)
returns uuid
language plpgsql
as $$
declare
  v_prospect prospects%rowtype;
  v_rla_id uuid;
begin
  if p_retailer_id is null then
    return null;
  end if;

  v_rla_id := public.ogr_retailer_line_account_id_for_retailer(p_retailer_id);
  if v_rla_id is not null then
    return v_rla_id;
  end if;

  select * into v_prospect from prospects where id = p_retailer_id;
  if not found then
    return null;
  end if;

  return public.ensure_ogr_retailer_line_account_from_prospect(v_prospect);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- prospects → OGR retailer_line_accounts
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.sync_ogr_retailer_line_account_from_prospect()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.ensure_ogr_retailer_line_account_from_prospect(new);
  return new;
end;
$$;

drop trigger if exists prospects_sync_ogr_retailer_line_account_ins on prospects;
create trigger prospects_sync_ogr_retailer_line_account_ins
  after insert on prospects
  for each row
  execute function public.sync_ogr_retailer_line_account_from_prospect();

drop trigger if exists prospects_sync_ogr_retailer_line_account_upd on prospects;
create trigger prospects_sync_ogr_retailer_line_account_upd
  after update on prospects
  for each row
  when (
    new.account_status is distinct from old.account_status
    or new.converted_at is distinct from old.converted_at
    or new.initial_order_date is distinct from old.initial_order_date
    or new.notes is distinct from old.notes
    or new.fit is distinct from old.fit
    or new.fit_score is distinct from old.fit_score
    or new.ideal_opening_units is distinct from old.ideal_opening_units
    or new.priority is distinct from old.priority
    or new.provisional_grade is distinct from old.provisional_grade
    or new.verification_status is distinct from old.verification_status
    or new.buyer_verified is distinct from old.buyer_verified
    or new.apparel_capability is distinct from old.apparel_capability
    or new.existing_ogr is distinct from old.existing_ogr
    or new.qualification_status is distinct from old.qualification_status
    or new.next_action is distinct from old.next_action
    or new.source_note is distinct from old.source_note
    or new.region is distinct from old.region
    or new.primary_district is distinct from old.primary_district
    or new.subterritory is distinct from old.subterritory
    or new.secondary_channels is distinct from old.secondary_channels
    or new.retail_subchannels is distinct from old.retail_subchannels
    or new.venue_contexts is distinct from old.venue_contexts
    or new.lifestyle_themes is distinct from old.lifestyle_themes
    or new.retail_capabilities is distinct from old.retail_capabilities
  )
  execute function public.sync_ogr_retailer_line_account_from_prospect();

-- ─────────────────────────────────────────────────────────────────────────
-- account_contacts → OGR retailer_line_contacts (INSERT OR UPDATE)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.sync_ogr_retailer_line_contact_from_account_contact()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_existing retailer_line_contacts%rowtype;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.role is not distinct from old.role
    and new.is_primary is not distinct from old.is_primary
    and new.notes is not distinct from old.notes
    and new.account_id is not distinct from old.account_id
  then
    return new;
  end if;

  v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.account_id);
  if v_rla_id is null then
    return new;
  end if;

  select * into v_existing
  from retailer_line_contacts rlc
  where rlc.retailer_line_account_id = v_rla_id
    and rlc.account_contact_id = new.id;

  if not found then
    if new.is_primary then
      update retailer_line_contacts
      set is_primary = false
      where retailer_line_account_id = v_rla_id
        and is_primary;
    end if;

    insert into retailer_line_contacts (
      retailer_line_account_id,
      account_contact_id,
      role,
      is_primary,
      notes
    )
    values (
      v_rla_id,
      new.id,
      new.role,
      new.is_primary,
      new.notes
    )
    on conflict (retailer_line_account_id, account_contact_id) do nothing;

    return new;
  end if;

  -- UPDATE path: sync role / is_primary / notes only when distinct
  if v_existing.role is not distinct from new.role
    and v_existing.is_primary is not distinct from new.is_primary
    and v_existing.notes is not distinct from new.notes
  then
    return new;
  end if;

  if new.is_primary and not v_existing.is_primary then
    update retailer_line_contacts
    set is_primary = false
    where retailer_line_account_id = v_rla_id
      and account_contact_id is distinct from new.id
      and is_primary;
  end if;

  update retailer_line_contacts
  set
    role = new.role,
    is_primary = new.is_primary,
    notes = new.notes
  where retailer_line_account_id = v_rla_id
    and account_contact_id = new.id
    and (
      role is distinct from new.role
      or is_primary is distinct from new.is_primary
      or notes is distinct from new.notes
    );

  return new;
end;
$$;

drop trigger if exists account_contacts_sync_ogr_retailer_line_contact on account_contacts;
create trigger account_contacts_sync_ogr_retailer_line_contact
  after insert or update on account_contacts
  for each row
  execute function public.sync_ogr_retailer_line_contact_from_account_contact();

-- ─────────────────────────────────────────────────────────────────────────
-- BEFORE INSERT fillers — orders, calls, peers
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.assert_line_id_is_ogr_or_null(p_line_id uuid)
returns void
language plpgsql
as $$
declare
  v_code text;
begin
  if p_line_id is null then
    return;
  end if;

  select code into v_code from lines where id = p_line_id;
  if v_code is distinct from 'ogr' then
    raise exception 'Phase 1C: line_id % is not OGR (code %)', p_line_id, coalesce(v_code, 'missing');
  end if;
end;
$$;

create or replace function public.ogr_line_id()
returns uuid
language sql
stable
as $$
  select id from lines where code = 'ogr' and status = 'active' limit 1;
$$;

create or replace function public.fill_ogr_retailer_line_account_on_order()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_ogr_line uuid;
  v_line_code text;
  v_default_currency text;
  v_currency text;
begin
  if new.line_id is not null then
    select code, default_currency
    into v_line_code, v_default_currency
    from lines
    where id = new.line_id;
  end if;

  -- Represented non-OGR: do not stamp OGR RLA / line_id; still enforce currency rules.
  if v_line_code is null or v_line_code = 'ogr' then
    if new.retailer_line_account_id is null and new.account_id is not null then
      v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.account_id);
      if v_rla_id is not null then
        new.retailer_line_account_id := v_rla_id;
      end if;
    end if;

    if new.line_id is null then
      v_ogr_line := public.ogr_line_id();
      if v_ogr_line is not null then
        new.line_id := v_ogr_line;
      end if;
    end if;

    if new.line_id is not null then
      select code, default_currency
      into v_line_code, v_default_currency
      from lines
      where id = new.line_id;
    end if;
  end if;

  v_default_currency := coalesce(nullif(trim(v_default_currency), ''), 'CAD');
  v_currency := nullif(trim(coalesce(new.original_currency, '')), '');

  if v_currency is not null and upper(v_currency) = 'USD' then
    if new.exchange_rate is null
      or new.exchange_rate <= 0
      or new.exchange_rate_date is null
      or length(trim(new.exchange_rate_date::text)) = 0
      or new.conversion_source is null
      or length(trim(new.conversion_source)) = 0
      or new.total_amount_cad is null
      or new.converted_amount is null
      or new.original_amount is null
    then
      raise exception
        'Incomplete USD order conversion: original_amount, exchange_rate (>0), exchange_rate_date, conversion_source, converted_amount, and total_amount_cad are required';
    end if;
    return new;
  end if;

  if v_currency is null then
    if upper(v_default_currency) = 'USD' then
      raise exception
        'Incomplete USD order conversion: original_currency default is USD; provide a complete FX stamp or explicit CAD';
    end if;
    new.original_amount := new.total_amount_cad;
    new.original_currency := 'CAD';
    new.exchange_rate := 1;
    new.exchange_rate_date := new.order_date;
    new.converted_amount := new.total_amount_cad;
    new.converted_currency := 'CAD';
    new.conversion_source := 'legacy_cad_column';
    return new;
  end if;

  if upper(v_currency) = 'CAD'
    and (new.conversion_source is null or length(trim(new.conversion_source)) = 0)
  then
    new.original_amount := coalesce(new.original_amount, new.total_amount_cad);
    new.original_currency := 'CAD';
    new.exchange_rate := coalesce(new.exchange_rate, 1);
    new.exchange_rate_date := coalesce(new.exchange_rate_date, new.order_date);
    new.converted_amount := coalesce(new.converted_amount, new.total_amount_cad);
    new.converted_currency := coalesce(new.converted_currency, 'CAD');
    new.conversion_source := 'legacy_cad_column';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_fill_ogr_retailer_line_account on orders;
create trigger orders_fill_ogr_retailer_line_account
  before insert on orders
  for each row
  execute function public.fill_ogr_retailer_line_account_on_order();

create or replace function public.fill_ogr_retailer_line_account_on_call()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_ogr_line uuid;
  v_exists boolean;
  v_line_code text;
  v_default_currency text;
  v_currency text;
begin
  if new.line_id is not null then
    select code, default_currency
    into v_line_code, v_default_currency
    from lines
    where id = new.line_id;
  end if;

  if v_line_code is null or v_line_code = 'ogr' then
    select exists(select 1 from prospects p where p.id = new.prospect_id)
    into v_exists;

    if not v_exists then
      -- Orphan call: leave line_id / RLA null; do not invent OGR.
      return new;
    end if;

    if new.retailer_line_account_id is null then
      v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.prospect_id);
      if v_rla_id is not null then
        new.retailer_line_account_id := v_rla_id;
      end if;
    end if;

    if new.line_id is null then
      v_ogr_line := public.ogr_line_id();
      if v_ogr_line is not null then
        new.line_id := v_ogr_line;
      end if;
    end if;

    if new.line_id is not null then
      select code, default_currency
      into v_line_code, v_default_currency
      from lines
      where id = new.line_id;
    end if;
  end if;

  v_default_currency := coalesce(nullif(trim(v_default_currency), ''), 'CAD');
  v_currency := nullif(trim(coalesce(new.order_value_original_currency, '')), '');

  if v_currency is not null and upper(v_currency) = 'USD' then
    if new.order_value_exchange_rate is null
      or new.order_value_exchange_rate <= 0
      or new.order_value_exchange_rate_date is null
      or length(trim(new.order_value_exchange_rate_date::text)) = 0
      or new.order_value_conversion_source is null
      or length(trim(new.order_value_conversion_source)) = 0
      or new.order_value_cad is null
      or new.order_value_converted_amount is null
      or new.order_value_original_amount is null
    then
      raise exception
        'Incomplete USD call order-value conversion: original amount, exchange rate (>0), rate date, conversion source, converted amount, and order_value_cad are required';
    end if;
    return new;
  end if;

  -- Zero / empty order value: leave conversion fields null (do not invent).
  if new.order_value_cad is null or new.order_value_cad = 0 then
    return new;
  end if;

  if new.order_value_conversion_source is null or new.order_value_original_currency is null then
    if upper(v_default_currency) = 'USD' then
      raise exception
        'Incomplete USD call order-value conversion: line default is USD; provide a complete FX stamp or explicit CAD';
    end if;
    new.order_value_original_amount := new.order_value_cad;
    new.order_value_original_currency := 'CAD';
    new.order_value_exchange_rate := 1;
    new.order_value_exchange_rate_date := new.call_date;
    new.order_value_converted_amount := new.order_value_cad;
    new.order_value_converted_currency := 'CAD';
    new.order_value_conversion_source := 'legacy_cad_column';
  elsif upper(coalesce(v_currency, '')) = 'CAD'
    and (new.order_value_conversion_source is null or length(trim(new.order_value_conversion_source)) = 0)
  then
    new.order_value_original_amount := coalesce(new.order_value_original_amount, new.order_value_cad);
    new.order_value_original_currency := 'CAD';
    new.order_value_exchange_rate := coalesce(new.order_value_exchange_rate, 1);
    new.order_value_exchange_rate_date := coalesce(new.order_value_exchange_rate_date, new.call_date);
    new.order_value_converted_amount := coalesce(new.order_value_converted_amount, new.order_value_cad);
    new.order_value_converted_currency := coalesce(new.order_value_converted_currency, 'CAD');
    new.order_value_conversion_source := 'legacy_cad_column';
  end if;

  return new;
end;
$$;

drop trigger if exists calls_fill_ogr_retailer_line_account on calls;
create trigger calls_fill_ogr_retailer_line_account
  before insert on calls
  for each row
  execute function public.fill_ogr_retailer_line_account_on_call();

-- Shared non-trigger helpers used by peer BEFORE INSERT fillers.
create or replace function public.stamp_new_ogr_rla_from_prospect_id()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
begin
  if new.retailer_line_account_id is not null or new.prospect_id is null then
    return new;
  end if;
  v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.prospect_id);
  if v_rla_id is not null then
    new.retailer_line_account_id := v_rla_id;
  end if;
  return new;
end;
$$;

create or replace function public.stamp_new_ogr_rla_from_account_id()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
begin
  if new.retailer_line_account_id is not null or new.account_id is null then
    return new;
  end if;
  v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.account_id);
  if v_rla_id is not null then
    new.retailer_line_account_id := v_rla_id;
  end if;
  return new;
end;
$$;

-- Peer fillers (prospect_id) — shared stamper (NEW in scope).
-- Executable-plan §4.4 names map to stamp_new_ogr_rla_from_prospect_id /
-- stamp_new_ogr_rla_from_account_id (one body each; avoid broken trigger-fn wrappers).
drop trigger if exists system_messages_fill_ogr_retailer_line_account on system_messages;
create trigger system_messages_fill_ogr_retailer_line_account
  before insert on system_messages
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists gmail_thread_links_fill_ogr_retailer_line_account on gmail_thread_links;
create trigger gmail_thread_links_fill_ogr_retailer_line_account
  before insert on gmail_thread_links
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists calendar_event_links_fill_ogr_retailer_line_account on calendar_event_links;
create trigger calendar_event_links_fill_ogr_retailer_line_account
  before insert on calendar_event_links
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists message_threads_fill_ogr_retailer_line_account on message_threads;
create trigger message_threads_fill_ogr_retailer_line_account
  before insert on message_threads
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists wholesale_order_requests_fill_ogr_retailer_line_account on wholesale_order_requests;
create trigger wholesale_order_requests_fill_ogr_retailer_line_account
  before insert on wholesale_order_requests
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists account_conversion_attribution_fill_ogr_retailer_line_account on account_conversion_attribution;
create trigger account_conversion_attribution_fill_ogr_retailer_line_account
  before insert on account_conversion_attribution
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists prospect_updates_fill_ogr_retailer_line_account on prospect_updates;
create trigger prospect_updates_fill_ogr_retailer_line_account
  before insert on prospect_updates
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

-- Peer filler (account_id)
drop trigger if exists account_reorder_settings_fill_ogr_retailer_line_account on account_reorder_settings;
create trigger account_reorder_settings_fill_ogr_retailer_line_account
  before insert on account_reorder_settings
  for each row
  execute function public.stamp_new_ogr_rla_from_account_id();

-- ─────────────────────────────────────────────────────────────────────────
-- Phase 3: per-line outreach goals + operational write guards
-- ─────────────────────────────────────────────────────────────────────────

alter table outreach_goal_settings
  add column if not exists sales_line_id uuid references lines (id);

update outreach_goal_settings
set sales_line_id = (select id from lines where code = 'ogr' limit 1)
where sales_line_id is null;

alter table outreach_goal_settings
  alter column sales_line_id set not null;

drop index if exists outreach_goal_settings_singleton_uidx;

create unique index if not exists outreach_goal_settings_sales_line_uidx
  on outreach_goal_settings (sales_line_id);

alter table outreach_goal_settings
  add column if not exists lead_rules jsonb,
  add column if not exists lead_rules_source text
    check (lead_rules_source is null or lead_rules_source in ('provisional', 'measured')),
  add column if not exists lead_rules_meta jsonb,
  add column if not exists lead_rules_computed_at timestamptz;

alter table outreach_goal_settings
  add column if not exists adaptive_weights_enabled boolean not null default true;

create or replace function public.assert_line_allows_operational_write(p_line_id uuid)
returns void
language plpgsql
as $$
declare
  v_code text;
  v_status text;
begin
  if p_line_id is null then
    return;
  end if;

  select code, status into v_code, v_status from lines where id = p_line_id;
  if v_code is null then
    raise exception 'Phase 3: line % not found', p_line_id;
  end if;
  if v_code = 'bkg' or v_status in ('prospective', 'declined', 'terminated') then
    raise exception
      'Phase 3: operational writes are not allowed for line % (status %)',
      v_code,
      coalesce(v_status, 'missing');
  end if;
end;
$$;

create or replace function public.enforce_rla_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_line_allows_operational_write(new.sales_line_id);
  return new;
end;
$$;

drop trigger if exists retailer_line_accounts_operational_write_guard on retailer_line_accounts;
create trigger retailer_line_accounts_operational_write_guard
  before insert or update of sales_line_id on retailer_line_accounts
  for each row execute function public.enforce_rla_operational_write_not_blocked();

create or replace function public.enforce_order_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  perform public.assert_line_allows_operational_write(new.line_id);
  if new.retailer_line_account_id is not null then
    select sales_line_id into v_rla_line
    from retailer_line_accounts
    where id = new.retailer_line_account_id;
    perform public.assert_line_allows_operational_write(v_rla_line);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_operational_write_guard on orders;
create trigger orders_operational_write_guard
  before insert or update of retailer_line_account_id, line_id on orders
  for each row execute function public.enforce_order_operational_write_not_blocked();

create or replace function public.enforce_call_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  perform public.assert_line_allows_operational_write(new.line_id);
  if new.retailer_line_account_id is not null then
    select sales_line_id into v_rla_line
    from retailer_line_accounts
    where id = new.retailer_line_account_id;
    perform public.assert_line_allows_operational_write(v_rla_line);
  end if;
  return new;
end;
$$;

drop trigger if exists calls_operational_write_guard on calls;
create trigger calls_operational_write_guard
  before insert or update of retailer_line_account_id, line_id on calls
  for each row execute function public.enforce_call_operational_write_not_blocked();

create or replace function public.enforce_rla_child_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  if new.retailer_line_account_id is null then
    return new;
  end if;
  select sales_line_id into v_rla_line
  from retailer_line_accounts
  where id = new.retailer_line_account_id;
  perform public.assert_line_allows_operational_write(v_rla_line);
  return new;
end;
$$;

drop trigger if exists retailer_line_contacts_operational_write_guard on retailer_line_contacts;
create trigger retailer_line_contacts_operational_write_guard
  before insert or update of retailer_line_account_id on retailer_line_contacts
  for each row execute function public.enforce_rla_child_operational_write_not_blocked();

drop trigger if exists account_reorder_settings_operational_write_guard on account_reorder_settings;
create trigger account_reorder_settings_operational_write_guard
  before insert or update of retailer_line_account_id on account_reorder_settings
  for each row execute function public.enforce_rla_child_operational_write_not_blocked();

drop trigger if exists account_conversion_attribution_operational_write_guard on account_conversion_attribution;
create trigger account_conversion_attribution_operational_write_guard
  before insert or update of retailer_line_account_id on account_conversion_attribution
  for each row execute function public.enforce_rla_child_operational_write_not_blocked();

create or replace function public.enforce_outreach_goal_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_line_allows_operational_write(new.sales_line_id);
  return new;
end;
$$;

drop trigger if exists outreach_goal_settings_operational_write_guard on outreach_goal_settings;
create trigger outreach_goal_settings_operational_write_guard
  before insert or update of sales_line_id on outreach_goal_settings
  for each row execute function public.enforce_outreach_goal_operational_write_not_blocked();

create or replace function public.enforce_order_call_line_matches_rla()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  if new.retailer_line_account_id is null or new.line_id is null then
    return new;
  end if;
  select sales_line_id into v_rla_line
  from retailer_line_accounts
  where id = new.retailer_line_account_id;
  if v_rla_line is distinct from new.line_id then
    raise exception
      'Phase 3: line_id % does not match retailer_line_account sales_line_id %',
      new.line_id,
      v_rla_line;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_line_matches_rla on orders;
create trigger orders_line_matches_rla
  before insert or update of retailer_line_account_id, line_id on orders
  for each row execute function public.enforce_order_call_line_matches_rla();

drop trigger if exists calls_line_matches_rla on calls;
create trigger calls_line_matches_rla
  before insert or update of retailer_line_account_id, line_id on calls
  for each row execute function public.enforce_order_call_line_matches_rla();

-- Phase 2 bulk account import commit RPC. Keep in sync with
-- migrations/20260817230000_bulk_import_phase2_commit_rpc_id_lock.sql.
create or replace function public.commit_account_import_row(
  p_import_row_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row account_import_rows%rowtype;
  v_retailer_id integer;
  v_rla_id uuid;
  v_contact_id uuid;
  v_action text;
  v_final_status text;
  v_insert jsonb;
  v_patch jsonb;
  v_rla jsonb;
  v_contact jsonb;
  v_change jsonb;
  v_has_primary boolean;
  v_created_retailer boolean := false;
begin
  if not public.is_approved_owner() then
    raise exception 'Forbidden';
  end if;

  select * into v_row
  from account_import_rows
  where id = p_import_row_id
  for update;
  if not found then
    raise exception 'Import row not found';
  end if;

  if v_row.status in ('imported', 'linked', 'updated') then
    return jsonb_build_object(
      'ok', true,
      'retailer_id', v_row.retailer_id,
      'retailer_line_account_id', v_row.retailer_line_account_id,
      'account_contact_id', v_row.account_contact_id,
      'status', v_row.status,
      'idempotent', true
    );
  end if;

  if v_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'Row was cancelled', 'status', 'cancelled');
  end if;

  update account_import_rows
  set status = 'queued', error = null
  where id = v_row.id;

  v_action := p_payload->>'action';
  v_final_status := coalesce(p_payload->>'final_status', 'imported');
  v_insert := p_payload->'prospect_insert';
  v_patch := p_payload->'prospect_patch';
  v_rla := p_payload->'rla_patch';
  v_contact := p_payload->'contact';

  if v_action = 'create_retailer' then
    lock table prospects in share row exclusive mode;
    insert into prospects (
      id,
      name,
      category,
      region,
      city,
      address,
      phone,
      fit,
      account_status,
      converted_at,
      initial_order_date,
      import_protected,
      existing_ogr,
      qualification_status,
      next_action,
      source_note,
      notes,
      website,
      retail_category,
      postal_code,
      territory_id,
      primary_district,
      subterritory,
      external_id
    )
    values (
      coalesce((select max(id) from prospects), 0) + 1,
      v_insert->>'name',
      v_insert->>'category',
      v_insert->>'region',
      coalesce(v_insert->>'city', ''),
      coalesce(v_insert->>'address', ''),
      coalesce(v_insert->>'phone', ''),
      coalesce(v_insert->>'fit', ''),
      coalesce(v_insert->>'account_status', 'active_account'),
      null,
      null,
      true,
      v_insert->>'existing_ogr',
      v_insert->>'qualification_status',
      v_insert->>'next_action',
      v_insert->>'source_note',
      v_insert->>'notes',
      v_insert->>'website',
      v_insert->>'retail_category',
      v_insert->>'postal_code',
      (v_insert->>'territory_id')::uuid,
      null,
      null,
      v_insert->>'external_id'
    )
    returning id into v_retailer_id;
    v_created_retailer := true;
  else
    v_retailer_id := nullif(p_payload->>'retailer_id', '')::integer;
    if v_retailer_id is null then
      raise exception 'retailer_id is required for link/update';
    end if;
    if v_patch is not null and v_patch <> 'null'::jsonb then
      update prospects
      set
        address = coalesce(v_patch->>'address', address),
        city = coalesce(v_patch->>'city', city),
        postal_code = coalesce(v_patch->>'postal_code', postal_code),
        website = coalesce(v_patch->>'website', website),
        phone = coalesce(v_patch->>'phone', phone)
      where id = v_retailer_id;
    end if;
  end if;

  select id into v_rla_id
  from retailer_line_accounts
  where retailer_id = v_retailer_id
    and sales_line_id = v_row.sales_line_id
    and relationship_status <> 'terminated'
  limit 1;

  if v_rla_id is null then
    insert into retailer_line_accounts (
      retailer_id,
      sales_line_id,
      relationship_status
    )
    values (
      v_retailer_id,
      v_row.sales_line_id,
      coalesce(v_rla->>'relationship_status', 'opened')
    )
    returning id into v_rla_id;
  end if;

  update retailer_line_accounts
  set
    relationship_status = coalesce(v_rla->>'relationship_status', relationship_status),
    line_account_markers = case
      when jsonb_typeof(v_rla->'line_account_markers') = 'array'
      then array(select jsonb_array_elements_text(v_rla->'line_account_markers'))
      else line_account_markers
    end,
    existing_ogr = coalesce(v_rla->>'existing_ogr', existing_ogr),
    qualification_status = coalesce(v_rla->>'qualification_status', qualification_status),
    next_action = coalesce(v_rla->>'next_action', next_action),
    notes = coalesce(v_rla->>'notes', notes),
    source_note = coalesce(v_rla->>'source_note', source_note),
    sales_line_territory_id = nullif(v_rla->>'sales_line_territory_id', '')::uuid,
    backfill_review_reason = v_rla->>'backfill_review_reason',
    converted_at = null,
    initial_order_date = null
  where id = v_rla_id;

  if v_contact is not null and v_contact <> 'null'::jsonb then
    select exists (
      select 1 from account_contacts
      where account_id = v_retailer_id and is_primary = true
    ) into v_has_primary;

    if not (
      coalesce(v_has_primary, false)
      and coalesce((v_contact->>'skip_if_primary_exists')::boolean, false)
    ) then
      insert into account_contacts (
        account_id,
        role,
        full_name,
        email,
        phone,
        is_primary,
        notes
      )
      values (
        v_retailer_id,
        'buyer',
        coalesce(nullif(v_contact->>'full_name', ''), 'Buyer'),
        nullif(v_contact->>'email', ''),
        nullif(v_contact->>'phone', ''),
        not coalesce(v_has_primary, false),
        'Import'
      )
      returning id into v_contact_id;
    end if;
  end if;

  if jsonb_typeof(p_payload->'field_changes') = 'array' then
    for v_change in select value from jsonb_array_elements(p_payload->'field_changes')
    loop
      insert into retailer_field_changes (
        retailer_id,
        field_path,
        old_value,
        new_value,
        source,
        sales_line_id,
        retailer_line_account_id
      )
      values (
        v_retailer_id,
        v_change->>'field_path',
        v_change->'old_value',
        v_change->'new_value',
        'import',
        v_row.sales_line_id,
        v_rla_id
      );
    end loop;
  end if;

  update account_import_rows
  set
    status = v_final_status,
    retailer_id = v_retailer_id,
    retailer_line_account_id = v_rla_id,
    account_contact_id = v_contact_id,
    error = null
  where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'retailer_id', v_retailer_id,
    'retailer_line_account_id', v_rla_id,
    'account_contact_id', v_contact_id,
    'status', v_final_status,
    'created_retailer', v_created_retailer,
    'idempotent', false
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm,
      'status', 'failed'
    );
end;
$$;

revoke all on function public.commit_account_import_row(uuid, jsonb) from public;
grant execute on function public.commit_account_import_row(uuid, jsonb) to authenticated;

-- Additive: West Coast operational territories + geography memberships.
-- Does NOT modify bc/ab/ca/or/wa/norcal IDs, store geo, or sales_line_territories.

-- ─────────────────────────────────────────────────────────────────────────
-- operational_territories (DB-enforced ops registry)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists operational_territories (
  territory_id uuid primary key references territories (id),
  created_at timestamptz not null default now()
);

alter table operational_territories enable row level security;

drop policy if exists "approved staff full access" on operational_territories;
create policy "approved staff full access" on operational_territories
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- territory_geography_seed_batches (provenance)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists territory_geography_seed_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  effective_date date not null,
  created_at timestamptz not null default now()
);

alter table territory_geography_seed_batches enable row level security;

drop policy if exists "approved staff full access" on territory_geography_seed_batches;
create policy "approved staff full access" on territory_geography_seed_batches
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- territory_geography_memberships (county + exact ZIP only)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists territory_geography_memberships (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references operational_territories (territory_id),
  kind text not null check (kind in ('county', 'zip')),
  state_code text not null check (state_code in ('WA', 'OR', 'CA')),
  county_fips text,
  zip text,
  note text,
  seed_batch_id uuid references territory_geography_seed_batches (id),
  created_at timestamptz not null default now(),
  constraint territory_geography_memberships_kind_shape check (
    (
      kind = 'county'
      and county_fips is not null
      and zip is null
    )
    or (
      kind = 'zip'
      and zip is not null
      and county_fips is null
      and zip ~ '^[0-9]{5}$'
    )
  )
);

create unique index if not exists territory_geography_memberships_county_uidx
  on territory_geography_memberships (state_code, county_fips)
  where kind = 'county';

create unique index if not exists territory_geography_memberships_zip_uidx
  on territory_geography_memberships (state_code, zip)
  where kind = 'zip';

create index if not exists territory_geography_memberships_territory_id_idx
  on territory_geography_memberships (territory_id);

create index if not exists territory_geography_memberships_seed_batch_id_idx
  on territory_geography_memberships (seed_batch_id);

alter table territory_geography_memberships enable row level security;

drop policy if exists "approved staff full access" on territory_geography_memberships;
create policy "approved staff full access" on territory_geography_memberships
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- operational_territory_review_queue
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists operational_territory_review_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolution text,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint operational_territory_review_queue_resolution_check check (
    (resolved_at is null and resolution is null and resolved_by is null)
    or (
      resolved_at is not null
      and resolution in ('assigned', 'left_unassigned', 'no_longer_applicable', 'legacy_resolved')
      and (
        resolution in ('no_longer_applicable', 'legacy_resolved')
        or resolved_by is not null
        or resolution = 'assigned'
      )
    )
  )
);

create index if not exists operational_territory_review_queue_unresolved_idx
  on operational_territory_review_queue (entity_type, created_at)
  where resolved_at is null;

create unique index if not exists operational_territory_review_queue_unresolved_prospect_uidx
  on operational_territory_review_queue (entity_id)
  where resolved_at is null and entity_type = 'prospect';

alter table operational_territory_review_queue enable row level security;

drop policy if exists "approved staff full access" on operational_territory_review_queue;
create policy "approved staff full access" on operational_territory_review_queue
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.upsert_operational_territory_review(
  p_entity_id text,
  p_reason text,
  p_payload jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare v_id uuid;
begin
  update operational_territory_review_queue
  set reason = p_reason, payload = p_payload, updated_at = now()
  where entity_type = 'prospect'
    and entity_id = p_entity_id
    and resolved_at is null
  returning id into v_id;
  if v_id is not null then return v_id; end if;

  begin
    insert into operational_territory_review_queue (entity_type, entity_id, reason, payload)
    values ('prospect', p_entity_id, p_reason, p_payload)
    returning id into v_id;
    return v_id;
  exception when unique_violation then
    update operational_territory_review_queue
    set reason = p_reason, payload = p_payload, updated_at = now()
    where entity_type = 'prospect'
      and entity_id = p_entity_id
      and resolved_at is null
    returning id into v_id;
    return v_id;
  end;
end;
$$;

revoke all on function public.upsert_operational_territory_review(text, text, jsonb) from public;
grant execute on function public.upsert_operational_territory_review(text, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- prospects.operational_territory_id (nullable; never auto-backfilled)
-- ─────────────────────────────────────────────────────────────────────────

alter table prospects
  add column if not exists operational_territory_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'prospects_operational_territory_id_fkey'
  ) then
    alter table prospects
      add constraint prospects_operational_territory_id_fkey
      foreign key (operational_territory_id)
      references operational_territories (territory_id);
  end if;
end $$;

create index if not exists prospects_operational_territory_id_idx
  on prospects (operational_territory_id);

-- See also 20260822173157_operational_territory_memberships_seed.sql for membership seed.
-- See also 20260822181446_activate_operational_territories.sql (status proposed → active).

update territories
set status = 'active', updated_at = now()
where code in (
  'pnw-west',
  'pnw-east',
  'norcal-coastal',
  'norcal-inland',
  'ca-central-la-north',
  'la-metro-oc',
  'ie-san-diego'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Account Research PR1 schema foundation (see 20260823120000_account_research_schema_foundation.sql)
-- ─────────────────────────────────────────────────────────────────────────

-- Account Research PR1 schema foundation.
-- Additive only. No prospect/RLA/system_messages/catalog ALTER.
-- Source: docs/plans/agent-outreach-account-research-pr1-schema-foundation.md

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_runs (retailer-level immutable research session)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_runs (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  status text not null default 'pending'
    check (status in (
      'pending',
      'running',
      'succeeded',
      'partial',
      'failed',
      'needs_identity_review',
      'cancelled'
    )),
  "trigger" text not null default 'manual'
    check ("trigger" in ('manual', 'prep', 'api')),
  requested_scope text not null
    check (requested_scope in (
      'all',
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest',
      'linkedin',
      'youtube',
      'x',
      'other'
    )),
  identity_confidence text not null default 'unresolved'
    check (identity_confidence in ('high', 'medium', 'low', 'unresolved')),
  identity_review_status text not null default 'not_required'
    check (identity_review_status in (
      'pending',
      'auto_accepted',
      'staff_confirmed',
      'rejected',
      'not_required'
    )),
  identity_reviewed_by uuid references auth.users (id) on delete set null,
  identity_reviewed_at timestamptz,
  identity_resolution text,
  resolved_website text,
  research_brief text,
  provider text,
  provider_metadata jsonb not null default '{}'::jsonb,
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  supersedes_run_id uuid references account_research_runs (id) on delete set null
);

-- Supports composite FKs that must bind research_run_id + retailer_id together
alter table account_research_runs
  add constraint account_research_runs_id_retailer_uidx unique (id, retailer_id);

create unique index if not exists account_research_runs_one_active_per_retailer_uidx
  on account_research_runs (retailer_id)
  where status in ('pending', 'running');

create index if not exists account_research_runs_retailer_completed_idx
  on account_research_runs (retailer_id, completed_at desc)
  where status in ('succeeded', 'partial');

create index if not exists account_research_runs_retailer_id_idx
  on account_research_runs (retailer_id);

alter table account_research_runs enable row level security;

drop policy if exists "approved staff full access" on account_research_runs;
create policy "approved staff full access" on account_research_runs
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_source_searches (platform-specific search within a run)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_source_searches (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  source_type text not null
    check (source_type in (
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest',
      'linkedin',
      'youtube',
      'x',
      'other'
    )),
  search_mode text not null
    check (search_mode in ('identity', 'recent_activity', 'storefront')),
  status text not null default 'pending'
    check (status in (
      'pending',
      'running',
      'succeeded',
      'none_indexed',
      'blocked',
      'failed',
      'cancelled'
    )),
  resolved_public_url text,
  query_text text,
  provider text,
  result_count integer not null default 0
    check (result_count >= 0),
  error text,
  requested_by uuid references auth.users (id) on delete set null,
  provider_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (research_run_id, source_type, search_mode)
);

create index if not exists account_research_source_searches_run_source_status_idx
  on account_research_source_searches (research_run_id, source_type, status);

alter table account_research_source_searches enable row level security;

drop policy if exists "approved staff full access" on account_research_source_searches;
create policy "approved staff full access" on account_research_source_searches
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_citations
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_citations (
  id uuid primary key default gen_random_uuid(),
  source_search_id uuid not null references account_research_source_searches (id) on delete cascade,
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  retailer_id integer not null references prospects (id) on delete cascade,
  source_url text not null,
  source_url_normalized text not null,
  title text,
  platform text not null
    check (platform in (
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest',
      'linkedin',
      'youtube',
      'x',
      'other',
      'directory'
    )),
  published_at timestamptz,
  observed_at timestamptz not null,
  excerpt text,
  confidence text not null
    check (confidence in ('high', 'medium', 'low')),
  identity_confidence text not null
    check (identity_confidence in ('high', 'medium', 'low', 'unresolved')),
  acceptance_status text not null default 'pending'
    check (acceptance_status in ('pending', 'accepted', 'rejected')),
  acceptance_basis text
    check (acceptance_basis is null or acceptance_basis in ('identity_gate', 'staff')),
  accepted_or_rejected_by uuid references auth.users (id) on delete set null,
  accepted_or_rejected_at timestamptz,
  provider_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (source_search_id, source_url_normalized)
);

create index if not exists account_research_citations_search_observed_idx
  on account_research_citations (source_search_id, observed_at desc);

create index if not exists account_research_citations_run_acceptance_idx
  on account_research_citations (research_run_id, acceptance_status);

alter table account_research_citations enable row level security;

drop policy if exists "approved staff full access" on account_research_citations;
create policy "approved staff full access" on account_research_citations
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- Sync denormalized research_run_id / retailer_id from parent source search + run
create or replace function public.account_research_citations_sync_parent()
returns trigger
language plpgsql
as $$
declare
  v_run_id uuid;
  v_retailer_id integer;
begin
  select s.research_run_id, r.retailer_id
  into v_run_id, v_retailer_id
  from account_research_source_searches s
  join account_research_runs r on r.id = s.research_run_id
  where s.id = new.source_search_id;

  if v_run_id is null then
    raise exception 'account_research_citations: source_search_id % not found', new.source_search_id;
  end if;

  new.research_run_id := v_run_id;
  new.retailer_id := v_retailer_id;
  return new;
end;
$$;

drop trigger if exists account_research_citations_sync_parent on account_research_citations;
create trigger account_research_citations_sync_parent
  before insert or update on account_research_citations
  for each row execute function public.account_research_citations_sync_parent();

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_profile_suggestions
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_profile_suggestions (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  retailer_id integer not null references prospects (id) on delete cascade,
  field_path text not null,
  suggested_value jsonb not null,
  rationale text,
  confidence text not null
    check (confidence in ('high', 'medium', 'low')),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  baseline_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists account_research_profile_suggestions_run_pending_idx
  on account_research_profile_suggestions (research_run_id)
  where status = 'pending';

create index if not exists account_research_profile_suggestions_retailer_status_idx
  on account_research_profile_suggestions (retailer_id, status);

create unique index if not exists account_research_profile_suggestions_run_field_pending_uidx
  on account_research_profile_suggestions (research_run_id, field_path)
  where status = 'pending';

alter table account_research_profile_suggestions enable row level security;

drop policy if exists "approved staff full access" on account_research_profile_suggestions;
create policy "approved staff full access" on account_research_profile_suggestions
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.account_research_profile_suggestions_sync_retailer()
returns trigger
language plpgsql
as $$
declare
  v_retailer_id integer;
begin
  select retailer_id into v_retailer_id
  from account_research_runs
  where id = new.research_run_id;

  if v_retailer_id is null then
    raise exception 'account_research_profile_suggestions: research_run_id % not found', new.research_run_id;
  end if;

  new.retailer_id := v_retailer_id;
  return new;
end;
$$;

drop trigger if exists account_research_profile_suggestions_sync_retailer
  on account_research_profile_suggestions;
create trigger account_research_profile_suggestions_sync_retailer
  before insert or update on account_research_profile_suggestions
  for each row execute function public.account_research_profile_suggestions_sync_retailer();

-- ─────────────────────────────────────────────────────────────────────────
-- account_research_suggestion_citations (junction)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_research_suggestion_citations (
  suggestion_id uuid not null
    references account_research_profile_suggestions (id) on delete cascade,
  citation_id uuid not null
    references account_research_citations (id) on delete cascade,
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (suggestion_id, citation_id)
);

create index if not exists account_research_suggestion_citations_citation_idx
  on account_research_suggestion_citations (citation_id);

alter table account_research_suggestion_citations enable row level security;

drop policy if exists "approved staff full access" on account_research_suggestion_citations;
create policy "approved staff full access" on account_research_suggestion_citations
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.account_research_suggestion_citations_same_run()
returns trigger
language plpgsql
as $$
declare
  v_suggestion_run uuid;
  v_citation_run uuid;
begin
  select research_run_id into v_suggestion_run
  from account_research_profile_suggestions
  where id = new.suggestion_id;

  select research_run_id into v_citation_run
  from account_research_citations
  where id = new.citation_id;

  if v_suggestion_run is null then
    raise exception 'account_research_suggestion_citations: suggestion_id % not found', new.suggestion_id;
  end if;
  if v_citation_run is null then
    raise exception 'account_research_suggestion_citations: citation_id % not found', new.citation_id;
  end if;
  if v_suggestion_run <> v_citation_run then
    raise exception
      'account_research_suggestion_citations: suggestion and citation must share research_run_id';
  end if;

  new.research_run_id := v_suggestion_run;
  return new;
end;
$$;

drop trigger if exists account_research_suggestion_citations_same_run
  on account_research_suggestion_citations;
create trigger account_research_suggestion_citations_same_run
  before insert or update on account_research_suggestion_citations
  for each row execute function public.account_research_suggestion_citations_same_run();

-- ─────────────────────────────────────────────────────────────────────────
-- account_product_match_runs (line-specific; explicit sales_line_id)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_product_match_runs (
  id uuid primary key default gen_random_uuid(),
  retailer_id integer not null references prospects (id) on delete cascade,
  sales_line_id uuid not null references lines (id),
  research_run_id uuid not null,
  status text not null default 'pending'
    check (status in (
      'pending',
      'running',
      'succeeded',
      'empty',
      'failed',
      'stale_research',
      'cancelled'
    )),
  empty_reason text
    check (
      empty_reason is null
      or empty_reason in (
        'all_recently_emailed',
        'no_eligible_products',
        'no_accepted_evidence',
        'identity_unresolved'
      )
    ),
  requested_by uuid references auth.users (id) on delete set null,
  provider_metadata jsonb not null default '{}'::jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint account_product_match_runs_research_run_retailer_fkey
    foreign key (research_run_id, retailer_id)
    references account_research_runs (id, retailer_id)
    on delete restrict
);

create index if not exists account_product_match_runs_retailer_line_created_idx
  on account_product_match_runs (retailer_id, sales_line_id, created_at desc);

alter table account_product_match_runs enable row level security;

drop policy if exists "approved staff full access" on account_product_match_runs;
create policy "approved staff full access" on account_product_match_runs
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_product_match_items (ranks 1–3 only)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_product_match_items (
  id uuid primary key default gen_random_uuid(),
  match_run_id uuid not null references account_product_match_runs (id) on delete cascade,
  catalog_item_id uuid not null references catalog_items (id),
  rank smallint not null
    check (rank between 1 and 3),
  rationale text not null,
  product_fit text not null
    check (product_fit in ('channel_intersect', 'global_fallback')),
  created_at timestamptz not null default now()
);

create unique index if not exists account_product_match_items_run_rank_uidx
  on account_product_match_items (match_run_id, rank);

create unique index if not exists account_product_match_items_run_catalog_uidx
  on account_product_match_items (match_run_id, catalog_item_id);

alter table account_product_match_items enable row level security;

drop policy if exists "approved staff full access" on account_product_match_items;
create policy "approved staff full access" on account_product_match_items
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

-- ─────────────────────────────────────────────────────────────────────────
-- account_product_match_item_citations (junction)
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists account_product_match_item_citations (
  match_item_id uuid not null
    references account_product_match_items (id) on delete cascade,
  citation_id uuid not null
    references account_research_citations (id) on delete cascade,
  research_run_id uuid not null references account_research_runs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_item_id, citation_id)
);

create index if not exists account_product_match_item_citations_citation_idx
  on account_product_match_item_citations (citation_id);

alter table account_product_match_item_citations enable row level security;

drop policy if exists "approved staff full access" on account_product_match_item_citations;
create policy "approved staff full access" on account_product_match_item_citations
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.account_product_match_item_citations_same_run()
returns trigger
language plpgsql
as $$
declare
  v_match_run uuid;
  v_citation_run uuid;
begin
  select mr.research_run_id into v_match_run
  from account_product_match_items mi
  join account_product_match_runs mr on mr.id = mi.match_run_id
  where mi.id = new.match_item_id;

  select research_run_id into v_citation_run
  from account_research_citations
  where id = new.citation_id;

  if v_match_run is null then
    raise exception 'account_product_match_item_citations: match_item_id % not found', new.match_item_id;
  end if;
  if v_citation_run is null then
    raise exception 'account_product_match_item_citations: citation_id % not found', new.citation_id;
  end if;
  if v_match_run <> v_citation_run then
    raise exception
      'account_product_match_item_citations: citation must belong to match run research_run_id';
  end if;

  new.research_run_id := v_match_run;
  return new;
end;
$$;

drop trigger if exists account_product_match_item_citations_same_run
  on account_product_match_item_citations;
create trigger account_product_match_item_citations_same_run
  before insert or update on account_product_match_item_citations
  for each row execute function public.account_product_match_item_citations_same_run();
-- Account Research PR2: atomic start + complete-source RPCs.
-- SECURITY INVOKER; staff-only via is_approved_staff(). Caller JWT + RLS.

-- Account Research PR2: atomic start + complete-source RPCs (see 20260823140000_account_research_run_rpcs.sql)

create or replace function public.start_account_research_run(
  p_retailer_id integer,
  p_scope text,
  p_trigger text,
  p_supersedes_run_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run_id uuid;
  v_sources jsonb := '[]'::jsonb;
  v_src record;
  v_requested_by uuid := auth.uid();
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if v_requested_by is null then
    raise exception 'Forbidden';
  end if;

  if p_scope is null or p_scope not in (
    'all', 'website', 'shopify', 'instagram', 'facebook', 'tiktok', 'pinterest'
  ) then
    raise exception 'Invalid scope';
  end if;

  if p_trigger is null or p_trigger not in ('manual', 'prep', 'api') then
    raise exception 'Invalid trigger';
  end if;

  if not exists (select 1 from prospects where id = p_retailer_id) then
    raise exception 'Retailer not found';
  end if;

  begin
    insert into account_research_runs (
      retailer_id,
      status,
      "trigger",
      requested_scope,
      requested_by,
      supersedes_run_id,
      started_at
    )
    values (
      p_retailer_id,
      'running',
      p_trigger,
      p_scope,
      v_requested_by,
      p_supersedes_run_id,
      now()
    )
    returning id into v_run_id;
  exception
    when unique_violation then
      raise exception 'ACTIVE_RUN_CONFLICT';
  end;

  if p_scope = 'all' then
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    )
    values
      (v_run_id, 'website', 'identity', 'pending', v_requested_by),
      (v_run_id, 'shopify', 'storefront', 'pending', v_requested_by),
      (v_run_id, 'instagram', 'recent_activity', 'pending', v_requested_by),
      (v_run_id, 'facebook', 'recent_activity', 'pending', v_requested_by),
      (v_run_id, 'tiktok', 'recent_activity', 'pending', v_requested_by),
      (v_run_id, 'pinterest', 'recent_activity', 'pending', v_requested_by);
  elsif p_scope = 'website' then
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    ) values (v_run_id, 'website', 'identity', 'pending', v_requested_by);
  elsif p_scope = 'shopify' then
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    ) values (v_run_id, 'shopify', 'storefront', 'pending', v_requested_by);
  else
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    ) values (v_run_id, p_scope, 'recent_activity', 'pending', v_requested_by);
  end if;

  for v_src in
    select id, source_type, search_mode, status
    from account_research_source_searches
    where research_run_id = v_run_id
    order by created_at
  loop
    v_sources := v_sources || jsonb_build_array(jsonb_build_object(
      'id', v_src.id,
      'source_type', v_src.source_type,
      'search_mode', v_src.search_mode,
      'status', v_src.status
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'sources', v_sources
  );
end;
$$;

revoke all on function public.start_account_research_run(integer, text, text, uuid) from public;
grant execute on function public.start_account_research_run(integer, text, text, uuid) to authenticated;

create or replace function public.complete_account_research_source_search(
  p_source_search_id uuid,
  p_status text,
  p_query_text text default null,
  p_resolved_public_url text default null,
  p_error text default null,
  p_provider text default null,
  p_provider_metadata jsonb default '{}'::jsonb,
  p_citations jsonb default '[]'::jsonb,
  p_research_brief text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source account_research_source_searches%rowtype;
  v_run account_research_runs%rowtype;
  v_citation jsonb;
  v_count integer := 0;
  v_run_id uuid;
  v_retailer_id integer;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if p_status is null or p_status not in (
    'succeeded', 'none_indexed', 'blocked', 'failed', 'cancelled'
  ) then
    raise exception 'Invalid source status';
  end if;

  select * into v_source
  from account_research_source_searches
  where id = p_source_search_id
  for update;

  if not found then
    raise exception 'Source search not found';
  end if;

  if v_source.status <> 'running' then
    raise exception 'SOURCE_NOT_RUNNING';
  end if;

  select * into v_run
  from account_research_runs
  where id = v_source.research_run_id
  for update;

  if not found then
    raise exception 'Research run not found';
  end if;

  if v_run.status in ('cancelled', 'succeeded', 'partial', 'failed', 'needs_identity_review') then
    raise exception 'STALE_WORKER';
  end if;

  v_run_id := v_run.id;
  v_retailer_id := v_run.retailer_id;

  if jsonb_typeof(p_citations) = 'array' then
    for v_citation in select * from jsonb_array_elements(p_citations)
    loop
      insert into account_research_citations (
        source_search_id,
        research_run_id,
        retailer_id,
        source_url,
        source_url_normalized,
        title,
        platform,
        published_at,
        observed_at,
        excerpt,
        confidence,
        identity_confidence,
        acceptance_status,
        acceptance_basis,
        provider_metadata
      )
      values (
        p_source_search_id,
        v_run_id,
        v_retailer_id,
        v_citation->>'source_url',
        v_citation->>'source_url_normalized',
        nullif(v_citation->>'title', ''),
        v_citation->>'platform',
        case
          when v_citation ? 'published_at' and nullif(v_citation->>'published_at', '') is not null
            then (v_citation->>'published_at')::timestamptz
          else null
        end,
        coalesce(
          nullif(v_citation->>'observed_at', '')::timestamptz,
          now()
        ),
        nullif(v_citation->>'excerpt', ''),
        v_citation->>'confidence',
        v_citation->>'identity_confidence',
        coalesce(v_citation->>'acceptance_status', 'pending'),
        nullif(v_citation->>'acceptance_basis', ''),
        coalesce(v_citation->'provider_metadata', '{}'::jsonb)
      )
      on conflict (source_search_id, source_url_normalized) do nothing;
      v_count := v_count + 1;
    end loop;
  end if;

  update account_research_source_searches
  set
    status = p_status,
    query_text = p_query_text,
    resolved_public_url = p_resolved_public_url,
    error = p_error,
    provider = coalesce(p_provider, provider),
    provider_metadata = coalesce(p_provider_metadata, '{}'::jsonb),
    result_count = (
      select count(*)::integer
      from account_research_citations
      where source_search_id = p_source_search_id
    ),
    completed_at = now()
  where id = p_source_search_id;

  if p_research_brief is not null and length(trim(p_research_brief)) > 0 then
    update account_research_runs
    set research_brief = left(trim(p_research_brief), 4000)
    where id = v_run_id
      and (research_brief is null or research_brief = '');
  end if;

  return jsonb_build_object(
    'ok', true,
    'source_search_id', p_source_search_id,
    'status', p_status,
    'citation_count', (
      select count(*)::integer
      from account_research_citations
      where source_search_id = p_source_search_id
    ),
    'attempted_citation_count', v_count
  );
end;
$$;

revoke all on function public.complete_account_research_source_search(
  uuid, text, text, text, text, text, jsonb, jsonb, text
) from public;
grant execute on function public.complete_account_research_source_search(
  uuid, text, text, text, text, text, jsonb, jsonb, text
) to authenticated;

create or replace function public.account_research_supersede_pending_suggestions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.supersedes_run_id is not null then
    update account_research_profile_suggestions
    set status = 'superseded', reviewed_at = now()
    where research_run_id = new.supersedes_run_id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists account_research_runs_supersede_suggestions on account_research_runs;
create trigger account_research_runs_supersede_suggestions
  after insert on account_research_runs
  for each row execute function public.account_research_supersede_pending_suggestions();

create or replace function public.account_research_is_allowed_suggestion_field(p_field_path text)
returns boolean
language sql
immutable
as $$
  select p_field_path in (
    'website', 'address', 'city', 'region', 'postal_code', 'phone', 'name',
    'retail_category', 'apparel_capability', 'category',
    'lifestyle_themes', 'secondary_channels', 'retail_subchannels',
    'venue_contexts', 'retail_capabilities'
  );
$$;

create or replace function public.account_research_json_values_equal(a jsonb, b jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(a, 'null'::jsonb) = coalesce(b, 'null'::jsonb);
$$;

create or replace function public.persist_account_research_profile_suggestions(
  p_run_id uuid,
  p_force_regenerate boolean default false,
  p_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run account_research_runs%rowtype;
  v_item jsonb;
  v_suggestion_id uuid;
  v_citation_id uuid;
  v_citation_ids jsonb;
  v_inserted integer := 0;
  v_field_path text;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  select * into v_run from account_research_runs where id = p_run_id;
  if not found then
    raise exception 'Run not found';
  end if;

  if v_run.status not in ('succeeded', 'partial') then
    raise exception 'INELIGIBLE_RUN';
  end if;

  if v_run.identity_confidence <> 'high' then
    raise exception 'IDENTITY_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1 from account_research_runs r
    where r.supersedes_run_id = p_run_id
  ) then
    raise exception 'SUPERSEDED_RUN';
  end if;

  if jsonb_typeof(p_suggestions) <> 'array' then
    raise exception 'Invalid suggestions payload';
  end if;

  for v_item in select * from jsonb_array_elements(p_suggestions)
  loop
    v_field_path := v_item->>'field_path';
    if v_field_path is null or not public.account_research_is_allowed_suggestion_field(v_field_path) then
      raise exception 'FORBIDDEN_FIELD';
    end if;

    v_citation_ids := coalesce(v_item->'citation_ids', '[]'::jsonb);
    if jsonb_typeof(v_citation_ids) <> 'array' or jsonb_array_length(v_citation_ids) < 1 then
      raise exception 'INVALID_CITATIONS';
    end if;

    if p_force_regenerate then
      update account_research_profile_suggestions
      set status = 'superseded', reviewed_at = now()
      where research_run_id = p_run_id
        and field_path = v_field_path
        and status = 'pending';
    end if;

    begin
      insert into account_research_profile_suggestions (
        research_run_id,
        retailer_id,
        field_path,
        suggested_value,
        baseline_value,
        rationale,
        confidence,
        status
      )
      values (
        p_run_id,
        v_run.retailer_id,
        v_field_path,
        v_item->'suggested_value',
        v_item->'baseline_value',
        left(nullif(v_item->>'rationale', ''), 500),
        coalesce(v_item->>'confidence', 'medium'),
        'pending'
      )
      returning id into v_suggestion_id;
    exception
      when unique_violation then
        continue;
    end;

    begin
      for v_citation_id in
        select (jsonb_array_elements_text(v_citation_ids))::uuid
      loop
        if not exists (
          select 1 from account_research_citations c
          where c.id = v_citation_id
            and c.research_run_id = p_run_id
            and c.retailer_id = v_run.retailer_id
            and c.acceptance_status = 'accepted'
            and c.source_url is not null
            and length(trim(c.source_url)) > 0
        ) then
          raise exception 'INVALID_CITATIONS';
        end if;

        insert into account_research_suggestion_citations (
          suggestion_id, citation_id, research_run_id
        )
        values (v_suggestion_id, v_citation_id, p_run_id)
        on conflict do nothing;
      end loop;
    exception
      when invalid_text_representation then
        raise exception 'INVALID_CITATIONS';
    end;

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('ok', true, 'inserted', v_inserted);
end;
$$;

create or replace function public.apply_account_research_profile_suggestion(
  p_suggestion_id uuid,
  p_confirm_verified_overwrite boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_suggestion account_research_profile_suggestions%rowtype;
  v_run account_research_runs%rowtype;
  v_prospect prospects%rowtype;
  v_current jsonb;
  v_actor uuid := auth.uid();
  v_source_urls jsonb := '[]'::jsonb;
  v_outcome text := 'applied';
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if v_actor is null then
    raise exception 'Forbidden';
  end if;

  select * into v_suggestion
  from account_research_profile_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'Suggestion not found';
  end if;

  if v_suggestion.status = 'accepted' then
    return jsonb_build_object('ok', true, 'outcome', 'already_applied', 'suggestion_id', p_suggestion_id);
  end if;

  if v_suggestion.status = 'rejected' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  if v_suggestion.status = 'superseded' then
    raise exception 'SUPERSEDED_SUGGESTION';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  if not public.account_research_is_allowed_suggestion_field(v_suggestion.field_path) then
    raise exception 'FORBIDDEN_FIELD';
  end if;

  select * into v_run from account_research_runs where id = v_suggestion.research_run_id;
  if not found then
    raise exception 'Run not found';
  end if;

  if exists (
    select 1 from account_research_runs r
    where r.supersedes_run_id = v_suggestion.research_run_id
  ) then
    raise exception 'SUPERSEDED_SUGGESTION';
  end if;

  select * into v_prospect from prospects where id = v_suggestion.retailer_id for update;
  if not found then
    raise exception 'Retailer not found';
  end if;

  if (
    v_prospect.import_protected = true
    or v_prospect.buyer_verified = true
    or coalesce(v_prospect.verification_status, '') ~* '^verified$'
  ) and v_suggestion.field_path in (
    'name', 'address', 'phone', 'website', 'city', 'postal_code'
  ) and not p_confirm_verified_overwrite then
    raise exception 'PROTECTED_IDENTITY';
  end if;

  v_current := case v_suggestion.field_path
    when 'website' then to_jsonb(v_prospect.website)
    when 'address' then to_jsonb(v_prospect.address)
    when 'city' then to_jsonb(v_prospect.city)
    when 'region' then to_jsonb(v_prospect.region)
    when 'postal_code' then to_jsonb(v_prospect.postal_code)
    when 'phone' then to_jsonb(v_prospect.phone)
    when 'name' then to_jsonb(v_prospect.name)
    when 'retail_category' then to_jsonb(v_prospect.retail_category)
    when 'apparel_capability' then to_jsonb(v_prospect.apparel_capability)
    when 'category' then to_jsonb(v_prospect.category)
    when 'lifestyle_themes' then v_prospect.lifestyle_themes
    when 'secondary_channels' then v_prospect.secondary_channels
    when 'retail_subchannels' then v_prospect.retail_subchannels
    when 'venue_contexts' then v_prospect.venue_contexts
    when 'retail_capabilities' then v_prospect.retail_capabilities
    else null
  end;

  if not public.account_research_json_values_equal(v_current, v_suggestion.baseline_value) then
    raise exception 'CANONICAL_VALUE_CHANGED';
  end if;

  if public.account_research_json_values_equal(v_current, v_suggestion.suggested_value) then
    update account_research_profile_suggestions
    set status = 'accepted', reviewed_by = v_actor, reviewed_at = now()
    where id = p_suggestion_id;
    return jsonb_build_object('ok', true, 'outcome', 'already_applied', 'suggestion_id', p_suggestion_id);
  end if;

  case v_suggestion.field_path
    when 'website' then
      update prospects set website = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'address' then
      update prospects set address = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'city' then
      update prospects set city = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'region' then
      update prospects set region = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'postal_code' then
      update prospects set postal_code = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'phone' then
      update prospects set phone = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'name' then
      update prospects set name = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'retail_category' then
      update prospects set retail_category = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'apparel_capability' then
      update prospects set apparel_capability = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'category' then
      update prospects set category = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'lifestyle_themes' then
      update prospects set lifestyle_themes = v_suggestion.suggested_value where id = v_prospect.id;
    when 'secondary_channels' then
      update prospects set secondary_channels = v_suggestion.suggested_value where id = v_prospect.id;
    when 'retail_subchannels' then
      update prospects set retail_subchannels = v_suggestion.suggested_value where id = v_prospect.id;
    when 'venue_contexts' then
      update prospects set venue_contexts = v_suggestion.suggested_value where id = v_prospect.id;
    when 'retail_capabilities' then
      update prospects set retail_capabilities = v_suggestion.suggested_value where id = v_prospect.id;
    else
      raise exception 'FORBIDDEN_FIELD';
  end case;

  select coalesce(jsonb_agg(c.source_url order by c.observed_at desc), '[]'::jsonb)
  into v_source_urls
  from account_research_suggestion_citations sc
  join account_research_citations c on c.id = sc.citation_id
  where sc.suggestion_id = p_suggestion_id;

  insert into retailer_field_changes (
    retailer_id,
    field_path,
    old_value,
    new_value,
    source,
    actor_id,
    status,
    confidence,
    provider,
    source_urls
  )
  values (
    v_suggestion.retailer_id,
    v_suggestion.field_path,
    v_suggestion.baseline_value,
    v_suggestion.suggested_value,
    'ai',
    v_actor,
    'applied',
    v_suggestion.confidence,
    'account_research',
    v_source_urls
  );

  update account_research_profile_suggestions
  set status = 'accepted', reviewed_by = v_actor, reviewed_at = now()
  where id = p_suggestion_id;

  return jsonb_build_object(
    'ok', true,
    'outcome', v_outcome,
    'suggestion_id', p_suggestion_id,
    'retailer_id', v_suggestion.retailer_id
  );
end;
$$;

create or replace function public.reject_account_research_profile_suggestion(
  p_suggestion_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_suggestion account_research_profile_suggestions%rowtype;
  v_actor uuid := auth.uid();
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  select * into v_suggestion
  from account_research_profile_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'Suggestion not found';
  end if;

  if v_suggestion.status = 'rejected' then
    return jsonb_build_object('ok', true, 'outcome', 'already_rejected', 'suggestion_id', p_suggestion_id);
  end if;

  if v_suggestion.status = 'accepted' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  update account_research_profile_suggestions
  set status = 'rejected', reviewed_by = v_actor, reviewed_at = now()
  where id = p_suggestion_id;

  return jsonb_build_object('ok', true, 'outcome', 'rejected', 'suggestion_id', p_suggestion_id);
end;
$$;

revoke all on function public.persist_account_research_profile_suggestions(uuid, boolean, jsonb) from public;
grant execute on function public.persist_account_research_profile_suggestions(uuid, boolean, jsonb) to authenticated;

revoke all on function public.apply_account_research_profile_suggestion(uuid, boolean) from public;
grant execute on function public.apply_account_research_profile_suggestion(uuid, boolean) to authenticated;

revoke all on function public.reject_account_research_profile_suggestion(uuid) from public;
grant execute on function public.reject_account_research_profile_suggestion(uuid) to authenticated;
