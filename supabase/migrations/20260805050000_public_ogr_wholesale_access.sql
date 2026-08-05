-- Phase 1: public OGR wholesale access — publishing columns, public RPCs, order-request tables.
-- Do NOT grant anon SELECT on catalog_items; public reads go through SECURITY DEFINER RPCs only.

-- ── 1. catalog_items publishing columns ────────────────────────────────────
alter table catalog_items
  add column if not exists is_publicly_published boolean not null default false,
  add column if not exists featured boolean not null default false,
  add column if not exists public_sort_order integer not null default 0,
  add column if not exists public_slug text,
  add column if not exists live_sku text,
  add column if not exists live_sku_note text,
  add column if not exists alternate_image_urls jsonb not null default '[]'::jsonb;

create unique index if not exists catalog_items_line_id_public_slug_uidx
  on catalog_items (line_id, public_slug)
  where public_slug is not null;

create index if not exists catalog_items_public_list_idx
  on catalog_items (line_id, is_publicly_published, public_sort_order);

-- Slug backfill: name-sku, lowercase, non-alnum → hyphen
update catalog_items
set public_slug = trim(both '-' from lower(
  regexp_replace(
    regexp_replace(coalesce(nullif(trim(name), ''), sku) || '-' || sku, '[^a-zA-Z0-9]+', '-', 'g'),
    '-+',
    '-',
    'g'
  )
))
where public_slug is null;

-- Resolve slug collisions within a line by appending -{sku}
with dups as (
  select id,
    public_slug || '-' || lower(regexp_replace(sku, '[^a-zA-Z0-9]+', '-', 'g')) as new_slug
  from catalog_items ci
  where public_slug is not null
    and exists (
      select 1 from catalog_items o
      where o.line_id = ci.line_id
        and o.public_slug = ci.public_slug
        and o.id <> ci.id
        and o.id < ci.id
    )
)
update catalog_items ci
set public_slug = dups.new_slug
from dups
where ci.id = dups.id;

-- Chasing Tail catalog discrepancy (do not change catalog sku)
update catalog_items
set live_sku = 'OG2010-SPF',
    live_sku_note = 'Catalog prints OG2164-SPF for Chasing Tail; live Shopify identifies OG2010-SPF. Preserve both for admin review.'
where upper(trim(sku)) = 'OG2164-SPF'
  and (live_sku is null or live_sku = '');

-- Auto-publish active OGR rows with verified http(s) primary image
update catalog_items ci
set is_publicly_published = true
from lines l
where ci.line_id = l.id
  and l.code = 'ogr'
  and ci.status = 'active'
  and ci.primary_image_url is not null
  and trim(ci.primary_image_url) ~* '^https?://'
  and ci.public_slug is not null;

-- ── 2. Public read RPCs ────────────────────────────────────────────────────
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
    coalesce(ci.price_usd_override, ci.catalog_price_usd, ci.price_usd) as wholesale_usd,
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
  order by ci.public_sort_order asc, ci.page asc nulls last, ci.name asc;
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

-- ── 3. Wholesale order-request tables ──────────────────────────────────────
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

alter table wholesale_order_requests enable row level security;
alter table wholesale_order_request_items enable row level security;

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
