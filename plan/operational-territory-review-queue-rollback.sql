-- Rollback for 20260822190000_operational_territory_review_queue_resolution.sql
-- legacy_resolved rows remain interpretable after rollback.

drop function if exists public.upsert_operational_territory_review(text, text, jsonb);

drop index if exists operational_territory_review_queue_unresolved_prospect_uidx;
create unique index if not exists operational_territory_review_queue_unresolved_entity_uidx
  on operational_territory_review_queue (entity_type, entity_id, reason)
  where resolved_at is null;

alter table operational_territory_review_queue
  drop constraint if exists operational_territory_review_queue_resolution_check;

alter table operational_territory_review_queue
  drop column if exists resolution,
  drop column if exists resolved_by,
  drop column if exists updated_at;
