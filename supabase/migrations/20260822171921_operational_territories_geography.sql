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
  created_at timestamptz not null default now()
);

create index if not exists operational_territory_review_queue_unresolved_idx
  on operational_territory_review_queue (entity_type, created_at)
  where resolved_at is null;

create unique index if not exists operational_territory_review_queue_unresolved_entity_uidx
  on operational_territory_review_queue (entity_type, entity_id, reason)
  where resolved_at is null;

alter table operational_territory_review_queue enable row level security;

drop policy if exists "approved staff full access" on operational_territory_review_queue;
create policy "approved staff full access" on operational_territory_review_queue
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

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
