-- Phase 9B: NOT VALID FKs on calls/prospect_updates.prospect_id.
-- Inspected migration_review_queue: columns entity_type, entity_id, reason (text, no CHECK),
-- unique unresolved index (entity_type, entity_id, reason). No issue_type column.
-- Do not rewrite Phase 1C dual-write. Do not DROP COLUMN on prospects.
-- VALIDATE CONSTRAINT is Phase 9C when orphan count is zero.

do $$
declare
  orphan_calls integer;
  orphan_updates integer;
  queued_calls integer;
  queued_updates integer;
begin
  select count(*) into orphan_calls
  from calls c
  where c.prospect_id is not null
    and not exists (select 1 from prospects p where p.id = c.prospect_id);

  select count(*) into orphan_updates
  from prospect_updates u
  where u.prospect_id is not null
    and not exists (select 1 from prospects p where p.id = u.prospect_id);

  if orphan_calls > 0 then
    insert into migration_review_queue (entity_type, entity_id, reason, payload)
    select
      'call',
      c.id::text,
      'orphan_call_fk',
      jsonb_build_object('prospect_id', c.prospect_id, 'phase', '9b')
    from calls c
    where c.prospect_id is not null
      and not exists (select 1 from prospects p where p.id = c.prospect_id)
      and not exists (
        select 1 from migration_review_queue q
        where q.entity_type = 'call'
          and q.entity_id = c.id::text
          and q.reason = 'orphan_call_fk'
          and q.resolved_at is null
      );
  end if;

  if orphan_updates > 0 then
    insert into migration_review_queue (entity_type, entity_id, reason, payload)
    select
      'prospect_update',
      u.id::text,
      'orphan_prospect_update_fk',
      jsonb_build_object('prospect_id', u.prospect_id, 'phase', '9b')
    from prospect_updates u
    where u.prospect_id is not null
      and not exists (select 1 from prospects p where p.id = u.prospect_id)
      and not exists (
        select 1 from migration_review_queue q
        where q.entity_type = 'prospect_update'
          and q.entity_id = u.id::text
          and q.reason = 'orphan_prospect_update_fk'
          and q.resolved_at is null
      );
  end if;

  select count(*) into queued_calls
  from migration_review_queue q
  where q.reason = 'orphan_call_fk' and q.resolved_at is null;

  select count(*) into queued_updates
  from migration_review_queue q
  where q.reason = 'orphan_prospect_update_fk' and q.resolved_at is null;

  if orphan_calls <> queued_calls then
    raise exception
      'Phase 9B assert failed: orphan calls (%) <> queued orphan_call_fk rows (%)',
      orphan_calls,
      queued_calls;
  end if;

  if orphan_updates <> queued_updates then
    raise exception
      'Phase 9B assert failed: orphan prospect_updates (%) <> queued orphan_prospect_update_fk rows (%)',
      orphan_updates,
      queued_updates;
  end if;
end
$$;

alter table public.calls
  drop constraint if exists calls_prospect_id_fkey;
alter table public.calls
  add constraint calls_prospect_id_fkey
  foreign key (prospect_id) references public.prospects (id)
  on delete restrict
  not valid;

alter table public.prospect_updates
  drop constraint if exists prospect_updates_prospect_id_fkey;
alter table public.prospect_updates
  add constraint prospect_updates_prospect_id_fkey
  foreign key (prospect_id) references public.prospects (id)
  on delete restrict
  not valid;
