-- Phase 1A seeds: principals, line status/commercial fields, norcal geo,
-- OGR sales_line_territories (BC/OR/WA, rights unconfirmed).
-- Zero retailer_line_accounts. Zero Big Fish territories.
--
-- Deviation from plan § seeds (documented): Eagle Peak OR/WA/norcal
-- sales_line_territories are seeded as status='proposed' (not active) because
-- Phase 1A forbids active Eagle Peak assignments until go/no-go for 1B/Phase 6.
-- Geographic norcal row is created with unresolved-boundary metadata.

-- ─────────────────────────────────────────────────────────────────────────
-- Principals
-- ─────────────────────────────────────────────────────────────────────────

insert into principals (legal_name, dba_name, notes)
select 'Old Guys Rule', null, 'Seeded from existing lines.name for OGR'
where not exists (
  select 1 from principals p where p.legal_name = 'Old Guys Rule' and p.dba_name is null
);

insert into principals (legal_name, dba_name, notes)
select 'Global Shade Co.', 'Eagle Peak', 'Confirmed Eagle Peak principal'
where not exists (
  select 1 from principals p
  where p.legal_name = 'Global Shade Co.' and p.dba_name = 'Eagle Peak'
);

-- Big Fish: no invented legal name — placeholder principal row with null legal_name
insert into principals (legal_name, dba_name, notes)
select null, 'Big Fish', 'Confirmed represented line; legal name unknown'
where not exists (
  select 1 from principals p
  where p.legal_name is null and p.dba_name = 'Big Fish'
);

-- ─────────────────────────────────────────────────────────────────────────
-- Update existing lines + insert eagle-peak / big-fish
-- ─────────────────────────────────────────────────────────────────────────

update lines l
set
  principal_id = p.id,
  status = 'active',
  acquisition_stage = null,
  default_currency = 'CAD',
  commission_rate = null,
  productivity_thresholds = null,
  updated_at = now()
from principals p
where l.code = 'ogr'
  and p.legal_name = 'Old Guys Rule'
  and p.dba_name is null;

update lines l
set
  status = 'paused',
  acquisition_stage = null,
  active = false,
  updated_at = now()
where l.code = 'bkg';

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
  description
)
select
  'eagle-peak',
  'Eagle Peak',
  false,
  'onboarding',
  null,
  p.id,
  'USD',
  0.1000,
  30,
  null,
  'Canopy / shade products (onboarding).'
from principals p
where p.legal_name = 'Global Shade Co.'
  and p.dba_name = 'Eagle Peak'
on conflict (code) do update set
  principal_id = excluded.principal_id,
  status = excluded.status,
  acquisition_stage = null,
  default_currency = excluded.default_currency,
  commission_rate = excluded.commission_rate,
  active = false,
  updated_at = now();

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
  description
)
select
  'big-fish',
  'Big Fish',
  false,
  'confirmed',
  null,
  p.id,
  null,
  null,
  40,
  null,
  'Confirmed represented line; commercial terms not yet configured.'
from principals p
where p.legal_name is null
  and p.dba_name = 'Big Fish'
on conflict (code) do update set
  principal_id = excluded.principal_id,
  status = 'confirmed',
  acquisition_stage = null,
  default_currency = null,
  commission_rate = null,
  active = false,
  updated_at = now();

-- Future inserts default to prospective; existing rows already refined above.
alter table lines
  alter column status set default 'prospective';

alter table lines
  drop constraint if exists lines_acquisition_stage_required_check;

alter table lines
  add constraint lines_acquisition_stage_required_check
  check (
    (status = 'prospective' and acquisition_stage is not null)
    or (status <> 'prospective' and acquisition_stage is null)
  );

-- ─────────────────────────────────────────────────────────────────────────
-- norcal geographic row (proposed region under California)
-- ─────────────────────────────────────────────────────────────────────────

insert into territories (code, name, country_code, sort_order, active, level, parent_territory_id, status, metadata)
select
  'norcal',
  'Northern California',
  'US',
  35,
  true,
  'region',
  ca.id,
  'proposed',
  jsonb_build_object(
    'boundary_status', 'unresolved',
    'note', 'County list / corridor definition pending; must not equal full California'
  )
from territories ca
where ca.code = 'ca'
on conflict (code) do update set
  level = 'region',
  parent_territory_id = excluded.parent_territory_id,
  status = 'proposed',
  metadata = excluded.metadata,
  updated_at = now();

-- Ensure legacy five rows remain province_state / active (ids preserved).
update territories
set
  level = coalesce(level, 'province_state'),
  status = coalesce(status, 'active')
where code in ('bc', 'ab', 'ca', 'or', 'wa');

-- ─────────────────────────────────────────────────────────────────────────
-- OGR sales_line_territories: BC, OR, WA — rights_type unconfirmed
-- ─────────────────────────────────────────────────────────────────────────

insert into sales_line_territories (
  sales_line_id,
  territory_id,
  rights_type,
  status,
  notes
)
select
  l.id,
  t.id,
  'unconfirmed',
  'active',
  'Phase 1A seed; exclusivity unconfirmed'
from lines l
cross join territories t
where l.code = 'ogr'
  and t.code in ('bc', 'or', 'wa')
  and not exists (
    select 1
    from sales_line_territories slt
    where slt.sales_line_id = l.id
      and slt.territory_id = t.id
      and slt.status <> 'expired'
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Eagle Peak sales_line_territories: OR/WA/norcal as proposed only (Phase 1A)
-- ─────────────────────────────────────────────────────────────────────────

insert into sales_line_territories (
  sales_line_id,
  territory_id,
  rights_type,
  status,
  notes
)
select
  l.id,
  t.id,
  'unconfirmed',
  'proposed',
  case
    when t.code = 'norcal' then 'Proposed norcal; boundary unresolved; not an active grant'
    else 'Phase 1A: proposed only — active Eagle Peak grants deferred'
  end
from lines l
cross join territories t
where l.code = 'eagle-peak'
  and t.code in ('or', 'wa', 'norcal')
  and not exists (
    select 1
    from sales_line_territories slt
    where slt.sales_line_id = l.id
      and slt.territory_id = t.id
      and slt.status <> 'expired'
  );

-- Explicit: Big Fish has zero sales_line_territories (no insert).
-- Explicit: zero retailer_line_accounts / retailer_line_targets seeded.
