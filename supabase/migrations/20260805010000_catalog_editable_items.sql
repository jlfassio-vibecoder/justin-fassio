-- Editable line sheet: catalog extensions, variants, settings, audit, assets, import queue.
-- Idempotent where practical. Backfills one BASE variant per existing SKU.

-- ── catalog_items extensions ───────────────────────────────────────────────
alter table catalog_items
  add column if not exists catalog_price_usd numeric(10, 2),
  add column if not exists price_usd_override numeric(10, 2),
  add column if not exists catalog_msrp_cad numeric(10, 2),
  add column if not exists msrp_cad_override numeric(10, 2),
  add column if not exists landed_cad_override numeric(10, 2),
  add column if not exists field_meta jsonb not null default '{}'::jsonb,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'discontinued', 'unavailable')),
  add column if not exists is_bestseller boolean not null default false,
  add column if not exists pdf_page integer,
  add column if not exists catalog_year integer,
  add column if not exists brand text,
  add column if not exists product_family text,
  add column if not exists collection text,
  add column if not exists product_type text,
  add column if not exists accent_color text,
  add column if not exists sales_description text,
  add column if not exists material text,
  add column if not exists special_notes text,
  add column if not exists sales_priority text,
  add column if not exists sales_notes text,
  add column if not exists primary_image_path text;

update catalog_items
set
  catalog_price_usd = coalesce(catalog_price_usd, price_usd),
  catalog_msrp_cad = coalesce(catalog_msrp_cad, msrp_cad),
  catalog_year = coalesce(catalog_year, 2026),
  brand = coalesce(brand, 'Old Guys Rule')
where catalog_price_usd is null
   or catalog_msrp_cad is null
   or catalog_year is null
   or brand is null;

alter table catalog_items
  alter column catalog_price_usd set default 0,
  alter column catalog_msrp_cad set default 0;

-- Fill remaining nulls then enforce not null on catalog dual columns
update catalog_items
set
  catalog_price_usd = coalesce(catalog_price_usd, price_usd, 0),
  catalog_msrp_cad = coalesce(catalog_msrp_cad, msrp_cad, 0);

alter table catalog_items
  alter column catalog_price_usd set not null,
  alter column catalog_msrp_cad set not null;

-- ── catalog_settings (per line) ────────────────────────────────────────────
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists catalog_settings_set_updated_at on catalog_settings;
create trigger catalog_settings_set_updated_at
  before update on catalog_settings
  for each row execute function set_updated_at();

insert into catalog_settings (
  line_id,
  catalog_year,
  min_order_pieces,
  min_pieces_per_design,
  shipping_origin,
  terms_verified,
  terms_note
)
select
  l.id,
  2026,
  24,
  6,
  'Vista, California',
  false,
  'MOQ 24 / 6 per design pending verification against 2026 catalog terms page'
from lines l
where l.code = 'ogr'
on conflict (line_id) do nothing;

-- ── catalog_variants ───────────────────────────────────────────────────────
create table if not exists catalog_variants (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references catalog_items(id) on delete cascade,
  size text,
  color text,
  style text,
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

-- Backfill one BASE variant from current price_usd when none exist
insert into catalog_variants (catalog_item_id, size, wholesale_usd, sort_order)
select ci.id, 'BASE', ci.price_usd, 0
from catalog_items ci
where not exists (
  select 1 from catalog_variants cv where cv.catalog_item_id = ci.id
);

-- ── catalog_field_changes (audit) ──────────────────────────────────────────
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

-- ── catalog_assets ─────────────────────────────────────────────────────────
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

-- ── catalog import runs / conflicts ────────────────────────────────────────
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

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table catalog_settings enable row level security;
alter table catalog_variants enable row level security;
alter table catalog_field_changes enable row level security;
alter table catalog_assets enable row level security;
alter table catalog_import_runs enable row level security;
alter table catalog_import_conflicts enable row level security;

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
