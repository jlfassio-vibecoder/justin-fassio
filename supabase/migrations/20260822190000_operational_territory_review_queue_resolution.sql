-- operational_territory_review_queue: resolution audit, dedupe, RPC upsert, backlog enqueue

-- Step 1 — Preflight duplicate open rows
do $$
declare dup_count int;
begin
  select count(*) into dup_count from (
    select entity_id from operational_territory_review_queue
    where resolved_at is null and entity_type = 'prospect'
    group by entity_id having count(*) > 1
  ) d;
  if dup_count > 0 then
    raise notice 'Deduping % prospect(s) with multiple open ops review rows', dup_count;
  end if;
end $$;

-- Step 2 — Add columns (before dedupe/backfill reference resolution)
alter table operational_territory_review_queue
  add column if not exists resolution text,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

-- Step 3 — Dedupe open rows (keep newest created_at)
with ranked as (
  select id, row_number() over (
    partition by entity_id order by created_at desc
  ) as rn
  from operational_territory_review_queue
  where resolved_at is null and entity_type = 'prospect'
)
update operational_territory_review_queue q
set resolved_at = coalesce(q.resolved_at, now()),
    resolution = coalesce(q.resolution, 'legacy_resolved')
from ranked r
where q.id = r.id and r.rn > 1;

-- Step 4 — Backfill legacy resolved rows
update operational_territory_review_queue
set resolution = 'legacy_resolved'
where resolved_at is not null and resolution is null;

-- Step 5 — Resolution constraint
alter table operational_territory_review_queue
  drop constraint if exists operational_territory_review_queue_resolution_check;

alter table operational_territory_review_queue
  add constraint operational_territory_review_queue_resolution_check
  check (
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
  );

-- Step 6 — Atomic dedupe RPC
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
  set payload = p_payload, updated_at = now()
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
    set payload = p_payload, updated_at = now()
    where entity_type = 'prospect'
      and entity_id = p_entity_id
      and resolved_at is null
    returning id into v_id;
    return v_id;
  end;
end;
$$;

-- Step 7 — One open row per prospect
drop index if exists operational_territory_review_queue_unresolved_entity_uidx;
create unique index if not exists operational_territory_review_queue_unresolved_prospect_uidx
  on operational_territory_review_queue (entity_id)
  where resolved_at is null and entity_type = 'prospect';

-- Step 8 — Backlog enqueue for unassigned CA/OR/WA prospects
insert into operational_territory_review_queue (entity_type, entity_id, reason, payload)
select
  'prospect',
  p.id::text,
  'needs_operational_territory',
  jsonb_build_object(
    'trigger', 'backfill',
    'detail_reason', 'missing_assignment',
    'location_fingerprint', jsonb_build_object(
      'postalCode', coalesce(p.postal_code, ''),
      'address', trim(regexp_replace(coalesce(p.address, ''), '\s+', ' ', 'g')),
      'storeTerritoryCode', lower(t.code)
    )
  )
from prospects p
join territories t on t.id = p.territory_id
where p.operational_territory_id is null
  and lower(t.code) in ('ca', 'or', 'wa')
  and not exists (
    select 1 from operational_territory_review_queue q
    where q.entity_type = 'prospect'
      and q.entity_id = p.id::text
      and q.resolved_at is null
  );
