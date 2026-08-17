-- Phase 9B schema rollback (does not undo RLA-only application writes).
-- Preferred recovery after 9B app deploy: roll-forward or restore the pre-9B snapshot.
-- Do not delete Phase 1B migration_review_queue rows.

alter table public.calls
  drop constraint if exists calls_prospect_id_fkey;

alter table public.prospect_updates
  drop constraint if exists prospect_updates_prospect_id_fkey;

delete from public.migration_review_queue
where reason in ('orphan_call_fk', 'orphan_prospect_update_fk');
