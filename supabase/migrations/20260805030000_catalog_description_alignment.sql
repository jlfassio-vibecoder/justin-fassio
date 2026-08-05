-- Align catalog with ogr-2026-catalog-description.md (no PDF; no invented SKU prices).

-- ── catalog_items Product fields ───────────────────────────────────────────
alter table catalog_items
  add column if not exists department text
    check (department is null or department in (
      'Apparel', 'Headwear', 'Accessories', 'Drinkware', 'Displays', 'Metal Signs'
    )),
  add column if not exists normalized_sku text,
  add column if not exists unit_of_measure text not null default 'each'
    check (unit_of_measure in ('each', 'pack', 'set', 'display')),
  add column if not exists minimum_quantity integer,
  add column if not exists order_multiple integer,
  add column if not exists pack_quantity integer,
  add column if not exists made_in_usa_claim boolean,
  add column if not exists country_of_blank_manufacture text,
  add column if not exists country_of_decoration text,
  add column if not exists country_of_origin text,
  add column if not exists primary_image_url text,
  add column if not exists source_image_url text,
  add column if not exists catalog_verified boolean not null default false,
  add column if not exists verification_notes text,
  add column if not exists lifestyle_themes jsonb not null default '[]'::jsonb,
  add column if not exists recommended_channels jsonb not null default '[]'::jsonb,
  add column if not exists seasonality text,
  add column if not exists sample_status text,
  add column if not exists buyer_feedback text;

-- Expand status values (drop old check if present, add new)
alter table catalog_items drop constraint if exists catalog_items_status_check;
alter table catalog_items
  add constraint catalog_items_status_check
  check (status in ('active', 'inactive', 'discontinued', 'unavailable', 'unknown'));

update catalog_items
set normalized_sku = upper(trim(sku))
where normalized_sku is null;

update catalog_items
set catalog_year = coalesce(catalog_year, 2026),
    brand = coalesce(nullif(trim(brand), ''), 'Old Guys Rule')
where catalog_year is null or brand is null or trim(brand) = '';

create index if not exists catalog_items_normalized_sku_idx on catalog_items (normalized_sku);
create index if not exists catalog_items_department_idx on catalog_items (department);

-- ── catalog_variants ───────────────────────────────────────────────────────
alter table catalog_variants
  add column if not exists variant_sku text,
  add column if not exists size_group text;

-- ── catalog_settings SupplierTerms ─────────────────────────────────────────
alter table catalog_settings
  add column if not exists default_shipping_method text,
  add column if not exists prices_subject_to_change boolean not null default true,
  add column if not exists backorder_policy text,
  add column if not exists order_processing_policy text,
  add column if not exists claims_policy text,
  add column if not exists returns_policy text;

update catalog_settings
set default_shipping_method = coalesce(default_shipping_method, 'UPS Ground')
where default_shipping_method is null;

-- ── catalog_product_attributes (EAV) ───────────────────────────────────────
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

alter table catalog_product_attributes enable row level security;

drop policy if exists "approved staff full access" on catalog_product_attributes;
create policy "approved staff full access" on catalog_product_attributes
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());
