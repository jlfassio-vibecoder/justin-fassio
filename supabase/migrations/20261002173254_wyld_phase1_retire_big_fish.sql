-- Phase 1: retire Big Fish in place, add Wyld Gear as a new line, and
-- extend the catalog so families and manufacturer SKUs are distinct.
-- Wyld stays onboarding / catalog draft here. Activation is a later step
-- after the price-list import has no blocking conflicts.

comment on column public.lines.active is
  'Deprecated for authorization. Public portfolio flag only. Operational writes use status and catalog_status.';

alter table public.lines
  add column if not exists catalog_status text not null default 'active';

alter table public.lines
  drop constraint if exists lines_catalog_status_check;

alter table public.lines
  add constraint lines_catalog_status_check
  check (catalog_status in ('draft', 'data_imported', 'validated', 'active'));

comment on column public.lines.catalog_status is
  'Catalog onboarding. Operational writes require status = active and catalog_status = active.';

update public.lines
set catalog_status = 'active'
where catalog_status is distinct from 'active'
  and code <> 'wyld-gear';

alter table public.retailer_line_accounts
  drop constraint if exists retailer_line_accounts_relationship_status_check;

alter table public.retailer_line_accounts
  add constraint retailer_line_accounts_relationship_status_check
  check (relationship_status in (
    'prospect',
    'qualified',
    'opened',
    'inactive',
    'not_qualified',
    'terminated'
  ));

alter table public.catalog_items
  drop constraint if exists catalog_items_department_check;

alter table public.catalog_items
  add constraint catalog_items_department_check
  check (department is null or department in (
    'Apparel',
    'Headwear',
    'Accessories',
    'Drinkware',
    'Displays',
    'Metal Signs',
    'Hard Coolers',
    'Soft Coolers'
  ));

alter table public.catalog_items
  add column if not exists catalog_product_id uuid,
  add column if not exists upc text,
  add column if not exists msrp_usd numeric(10, 2);

create table if not exists public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines (id) on delete cascade,
  family_key text not null,
  name text not null,
  category text not null,
  subcategory text,
  capacity text,
  description text,
  made_in_usa boolean not null default false,
  status text not null default 'active'
    check (status in ('active', 'inactive', 'discontinued')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, family_key)
);

create index if not exists catalog_products_line_id_idx
  on public.catalog_products (line_id);

drop trigger if exists catalog_products_set_updated_at on public.catalog_products;
create trigger catalog_products_set_updated_at
  before update on public.catalog_products
  for each row execute function public.set_updated_at();

alter table public.catalog_items
  drop constraint if exists catalog_items_catalog_product_id_fkey;

alter table public.catalog_items
  add constraint catalog_items_catalog_product_id_fkey
  foreign key (catalog_product_id) references public.catalog_products (id) on delete restrict;

create index if not exists catalog_items_catalog_product_id_idx
  on public.catalog_items (catalog_product_id);

create index if not exists catalog_items_line_upc_idx
  on public.catalog_items (line_id, upc);

alter table public.catalog_import_runs
  add column if not exists source_filename text,
  add column if not exists source_checksum text,
  add column if not exists price_list_effective_date date;

alter table public.catalog_import_conflicts
  drop constraint if exists catalog_import_conflicts_status_check;

alter table public.catalog_import_conflicts
  add constraint catalog_import_conflicts_status_check
  check (status in (
    'open',
    'accepted',
    'rejected',
    'deferred',
    'accepted_source_exception'
  ));

alter table public.catalog_import_conflicts
  add column if not exists resolution_note text;

create table if not exists public.catalog_import_staging_rows (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.catalog_import_runs (id) on delete cascade,
  source_row_number integer not null,
  family_key text,
  family_name text,
  category text,
  subcategory text,
  capacity text,
  color text,
  sku text,
  upc text,
  wholesale_usd numeric(10, 2),
  msrp_usd numeric(10, 2),
  currency text,
  made_in_usa boolean not null default false,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (import_run_id, source_row_number)
);

create index if not exists catalog_import_staging_rows_run_idx
  on public.catalog_import_staging_rows (import_run_id);

create table if not exists public.line_commercial_terms (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.lines (id) on delete cascade,
  code text not null,
  term_type text not null
    check (term_type in ('quantity_minimum', 'free_freight', 'surcharge')),
  category_scope text,
  threshold_amount numeric(12, 2),
  threshold_quantity integer,
  currency text,
  charge_amount numeric(12, 2),
  grouping_rule text,
  benefit text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, code)
);

create index if not exists line_commercial_terms_line_id_idx
  on public.line_commercial_terms (line_id);

drop trigger if exists line_commercial_terms_set_updated_at on public.line_commercial_terms;
create trigger line_commercial_terms_set_updated_at
  before update on public.line_commercial_terms
  for each row execute function public.set_updated_at();

alter table public.catalog_products enable row level security;
alter table public.line_commercial_terms enable row level security;
alter table public.catalog_import_staging_rows enable row level security;

drop policy if exists "approved staff full access" on public.catalog_products;
create policy "approved staff full access" on public.catalog_products
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on public.line_commercial_terms;
create policy "approved staff full access" on public.line_commercial_terms
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on public.catalog_import_staging_rows;
create policy "approved staff full access" on public.catalog_import_staging_rows
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.assert_line_allows_operational_write(p_line_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_catalog_status text;
  v_currency text;
begin
  if p_line_id is null then
    return;
  end if;

  select status, catalog_status, default_currency
  into v_status, v_catalog_status, v_currency
  from public.lines
  where id = p_line_id;

  if v_status is null then
    raise exception 'operational writes: line % not found', p_line_id;
  end if;

  if v_status = 'active'
    and v_catalog_status = 'active'
    and upper(btrim(coalesce(v_currency, ''))) in ('USD', 'CAD')
  then
    return;
  end if;

  raise exception
    'operational writes are not allowed unless status and catalog_status are active and currency is USD or CAD (status %, catalog %)',
    coalesce(v_status, 'missing'),
    coalesce(v_catalog_status, 'missing');
end;
$$;

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
  where l.code in ('ogr', 'living-in-sunshine', 'eagle-peak')
    and l.status in ('active', 'onboarding', 'confirmed')
  order by l.sort_order asc, l.name asc;
$$;

revoke all on function public.get_public_line_cards() from public;
grant execute on function public.get_public_line_cards() to anon, authenticated;

-- Retire Big Fish. Keep the line id and the 17 accounts. Clear the public path.
update public.lines
set
  status = 'terminated',
  termination_date = current_date,
  active = false,
  public_showroom_path = null,
  updated_at = now()
where code = 'big-fish';

update public.retailer_line_accounts rla
set
  relationship_status = 'terminated',
  notes = trim(both E'\n' from concat_ws(
    E'\n',
    nullif(btrim(coalesce(rla.notes, '')), ''),
    'Retired with line; prior_relationship_status=prospect'
  )),
  updated_at = now()
from public.lines l
where rla.sales_line_id = l.id
  and l.code = 'big-fish'
  and rla.relationship_status = 'prospect';

insert into public.principals (legal_name, dba_name, notes)
select 'Wyld Gear', 'Wyld Gear', 'Independent rep line replacing Big Fish. New line id; Big Fish history stays on big-fish.'
where not exists (
  select 1 from public.principals p
  where p.dba_name = 'Wyld Gear' and p.legal_name = 'Wyld Gear'
);

insert into public.lines (
  code,
  name,
  active,
  status,
  catalog_status,
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
  'wyld-gear',
  'Wyld Gear',
  false,
  'onboarding',
  'draft',
  null,
  p.id,
  'USD',
  null,
  40,
  null,
  'Coolers and drinkware. Northern California, Oregon, and Washington.',
  null
from public.principals p
where p.legal_name = 'Wyld Gear'
  and p.dba_name = 'Wyld Gear'
on conflict (code) do update set
  principal_id = excluded.principal_id,
  name = excluded.name,
  default_currency = 'USD',
  active = false,
  public_showroom_path = null,
  updated_at = now();

insert into public.sales_line_territories (
  sales_line_id,
  territory_id,
  rights_type,
  status,
  restrictions,
  notes
)
select
  l.id,
  t.id,
  'unconfirmed',
  'proposed',
  case
    when t.code = 'norcal' then jsonb_build_object('boundary_status', 'unresolved')
    else '{}'::jsonb
  end,
  case
    when t.code = 'norcal' then 'Northern California boundary is unresolved and must not equal full California.'
    else null
  end
from public.lines l
join public.territories t on t.code in ('norcal', 'or', 'wa')
where l.code = 'wyld-gear'
  and not exists (
    select 1
    from public.sales_line_territories existing
    where existing.sales_line_id = l.id
      and existing.territory_id = t.id
      and existing.status <> 'expired'
  );

insert into public.line_commercial_terms (
  line_id,
  code,
  term_type,
  category_scope,
  threshold_amount,
  threshold_quantity,
  currency,
  charge_amount,
  grouping_rule,
  benefit,
  metadata
)
select
  l.id,
  term.code,
  term.term_type,
  term.category_scope,
  term.threshold_amount,
  term.threshold_quantity,
  term.currency,
  term.charge_amount,
  term.grouping_rule,
  term.benefit,
  term.metadata
from public.lines l
cross join (
  values
    (
      'drinkware_min_per_color',
      'quantity_minimum',
      'Drinkware',
      null::numeric,
      6,
      null::text,
      null::numeric,
      'per_color_size',
      'minimum_order_quantity',
      '{"source":"wholesale_price_list"}'::jsonb
    ),
    (
      'opening_drinkware_free_freight',
      'free_freight',
      'Drinkware',
      3000,
      null,
      'USD',
      null,
      null,
      'free_freight_and_drinkware_display',
      '{"order_kind":"opening","source":"wholesale_price_list"}'::jsonb
    ),
    (
      'drinkware_fill_in_free_freight',
      'free_freight',
      'Drinkware',
      500,
      null,
      'USD',
      null,
      null,
      'free_freight',
      '{"order_kind":"fill_in","source":"wholesale_price_list"}'::jsonb
    ),
    (
      'cooler_drinkware_fill_in_free_freight',
      'free_freight',
      'Hard Coolers,Soft Coolers,Drinkware',
      1000,
      null,
      'USD',
      null,
      null,
      'free_freight',
      '{"order_kind":"fill_in","scopes":["Hard Coolers","Soft Coolers","Drinkware"],"source":"wholesale_price_list"}'::jsonb
    ),
    (
      'soft_cooler_custom_uv',
      'surcharge',
      'Soft Coolers',
      null,
      null,
      'USD',
      30,
      null,
      'custom_uv_print',
      '{"source":"wholesale_price_list"}'::jsonb
    )
) as term (
  code,
  term_type,
  category_scope,
  threshold_amount,
  threshold_quantity,
  currency,
  charge_amount,
  grouping_rule,
  benefit,
  metadata
)
where l.code = 'wyld-gear'
on conflict (line_id, code) do nothing;
