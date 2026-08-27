-- Publish The Go Hammock for Living In Sunshine public wholesale + LIS product RPCs.
-- Does not flip lines.active. Does not enable staff selling / OGR order pipeline.

update catalog_items c
set
  sku = 'LIS-GO-HAMMOCK',
  price_usd = 149.50,
  catalog_price_usd = 149.50,
  msrp_cad = coalesce(nullif(c.msrp_cad, 0), 229.00),
  catalog_msrp_cad = coalesce(nullif(c.catalog_msrp_cad, 0), 229.00),
  primary_image_url = coalesce(
    nullif(trim(c.primary_image_url), ''),
    'https://livinginsunshine.com/cdn/shop/files/GohammockamazonimagesYETI.jpg?v=1784264673&width=720'
  ),
  source_image_url = coalesce(
    nullif(trim(c.source_image_url), ''),
    'https://livinginsunshine.com/cdn/shop/files/GohammockamazonimagesYETI.jpg?v=1784264673&width=720'
  ),
  public_slug = 'go-hammock',
  is_publicly_published = true,
  featured = true,
  public_sort_order = 10,
  live_sku = coalesce(nullif(trim(c.live_sku), ''), 'LIS-GO-HAMMOCK'),
  updated_at = now()
from lines l
where c.line_id = l.id
  and l.code = 'living-in-sunshine'
  and c.sku in ('LIS-GO-HAMMOCK', 'LIS-GH-001');

create or replace function public.get_public_living_in_sunshine_products()
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
  where l.code = 'living-in-sunshine'
    and ci.is_publicly_published = true
    and ci.status = 'active'
    and ci.public_slug is not null
  order by ci.public_sort_order asc, ci.name asc;
$$;

revoke all on function public.get_public_living_in_sunshine_products() from public;
grant execute on function public.get_public_living_in_sunshine_products() to anon, authenticated;

create or replace function public.get_public_living_in_sunshine_product_by_slug(p_slug text)
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
  from public.get_public_living_in_sunshine_products() p
  where p.public_slug = lower(trim(p_slug))
  limit 1;
$$;

revoke all on function public.get_public_living_in_sunshine_product_by_slug(text) from public;
grant execute on function public.get_public_living_in_sunshine_product_by_slug(text) to anon, authenticated;
