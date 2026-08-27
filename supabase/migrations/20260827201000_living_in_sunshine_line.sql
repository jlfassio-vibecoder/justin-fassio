-- Living In Sunshine: public line card (2nd after OGR) + Go Hammock staff catalog seed.
-- Does not flip lines.active. Does not add per-line product RPCs or RLAs.

insert into principals (legal_name, dba_name, notes)
select 'Living in Sunshine', 'LISS', 'Outdoor / surf gear; flagship Go Hammock'
where not exists (
  select 1 from principals p
  where p.legal_name = 'Living in Sunshine' and p.dba_name = 'LISS'
);

insert into lines (
  code,
  name,
  active,
  status,
  acquisition_stage,
  principal_id,
  default_currency,
  commission_rate,
  sort_order,
  tagline,
  description,
  public_showroom_path
)
select
  'living-in-sunshine',
  'Living In Sunshine',
  false,
  'onboarding',
  null,
  p.id,
  'USD',
  null,
  20,
  'Now Repping',
  'Premium outdoor and surf gear — flagship Go Hammock and accessories.',
  '/living-in-sunshine-wholesale'
from principals p
where p.legal_name = 'Living in Sunshine'
  and p.dba_name = 'LISS'
on conflict (code) do update set
  principal_id = excluded.principal_id,
  status = 'onboarding',
  acquisition_stage = null,
  default_currency = excluded.default_currency,
  sort_order = 20,
  tagline = coalesce(lines.tagline, excluded.tagline),
  description = coalesce(lines.description, excluded.description),
  public_showroom_path = coalesce(lines.public_showroom_path, excluded.public_showroom_path),
  active = false,
  updated_at = now();

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
  where l.code in ('ogr', 'living-in-sunshine', 'eagle-peak', 'big-fish')
    and l.status in ('active', 'onboarding', 'confirmed')
  order by l.sort_order asc, l.name asc;
$$;

revoke all on function public.get_public_line_cards() from public;
grant execute on function public.get_public_line_cards() to anon, authenticated;

insert into catalog_items (
  line_id,
  cat,
  sku,
  name,
  tagline,
  sales_description,
  brand,
  product_family,
  product_type,
  price_usd,
  msrp_cad,
  status,
  is_publicly_published,
  public_sort_order
)
select
  l.id,
  'Hammocks',
  'LIS-GO-HAMMOCK',
  'The Go Hammock',
  'No Trees. No Tools. No Limits.',
  'Flagship portable hammock and accessories from Living In Sunshine.',
  'Living In Sunshine',
  'Go Hammock',
  'Hammock',
  0,
  0,
  'active',
  false,
  0
from lines l
where l.code = 'living-in-sunshine'
  and not exists (
    select 1 from catalog_items c
    where c.line_id = l.id and c.sku = 'LIS-GO-HAMMOCK'
  );
