-- Phase 9C: drop 1C SYNC triggers and functions only.
-- GATED: do not copy this file into supabase/migrations until a separate PR
-- after 9B is deployed, write paths are validated without sync, and a pre-9C
-- hosted snapshot is taken. Applying this with 9B would db-push both together.
-- Retain fill_ogr_retailer_line_account_on_* fillers and ensure_ogr_* helpers.
-- Do not rewrite 20260814130000. Do not DROP COLUMN on prospects.

drop trigger if exists prospects_sync_ogr_retailer_line_account_ins on public.prospects;
drop trigger if exists prospects_sync_ogr_retailer_line_account_upd on public.prospects;
drop trigger if exists account_contacts_sync_ogr_retailer_line_contact on public.account_contacts;

drop function if exists public.sync_ogr_retailer_line_account_from_prospect();
drop function if exists public.sync_ogr_retailer_line_contact_from_account_contact();

-- VALIDATE 9B FKs only when orphan count is zero. Leave NOT VALID otherwise.
do $$
declare
  orphan_calls integer;
  orphan_updates integer;
begin
  select count(*) into orphan_calls
  from calls c
  where c.prospect_id is not null
    and not exists (select 1 from prospects p where p.id = c.prospect_id);

  select count(*) into orphan_updates
  from prospect_updates u
  where u.prospect_id is not null
    and not exists (select 1 from prospects p where p.id = u.prospect_id);

  if orphan_calls = 0 then
    execute 'alter table public.calls validate constraint calls_prospect_id_fkey';
  else
    raise notice
      'Phase 9C: leaving calls_prospect_id_fkey NOT VALID; orphan_calls=%',
      orphan_calls;
  end if;

  if orphan_updates = 0 then
    execute 'alter table public.prospect_updates validate constraint prospect_updates_prospect_id_fkey';
  else
    raise notice
      'Phase 9C: leaving prospect_updates_prospect_id_fkey NOT VALID; orphan_updates=%',
      orphan_updates;
  end if;
end
$$;
