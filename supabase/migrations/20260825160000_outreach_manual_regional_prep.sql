-- Regional manual prep: kind + ops/store identity; empty_pool retryable for regional only.
-- Additive. Overnight nightly_prep uniqueness preserved via partial unique index.

alter table outreach_automation_runs
  drop constraint if exists outreach_automation_runs_kind_run_date_uidx;

alter table outreach_automation_runs
  drop constraint if exists outreach_automation_runs_kind_check;

alter table outreach_automation_runs
  add constraint outreach_automation_runs_kind_check
  check (kind in ('nightly_prep', 'manual_regional_prep'));

alter table outreach_automation_runs
  add column if not exists operational_territory_id uuid
    references operational_territories (territory_id) on delete set null;

alter table outreach_automation_runs
  add column if not exists store_territory_code text;

alter table outreach_automation_runs
  drop constraint if exists outreach_automation_runs_store_territory_code_check;

alter table outreach_automation_runs
  add constraint outreach_automation_runs_store_territory_code_check
  check (
    store_territory_code is null
    or store_territory_code in ('or', 'wa', 'ca', 'bc', 'ab')
  );

alter table outreach_automation_runs
  drop constraint if exists outreach_automation_runs_regional_ops_required;

alter table outreach_automation_runs
  add constraint outreach_automation_runs_regional_ops_required
  check (
    (kind = 'nightly_prep' and operational_territory_id is null and store_territory_code is null)
    or (kind = 'manual_regional_prep' and operational_territory_id is not null)
  );

create unique index if not exists outreach_automation_runs_nightly_run_date_uidx
  on outreach_automation_runs (run_date)
  where kind = 'nightly_prep';

create unique index if not exists outreach_automation_runs_regional_identity_uidx
  on outreach_automation_runs (
    run_date,
    operational_territory_id,
    coalesce(store_territory_code, '')
  )
  where kind = 'manual_regional_prep';

create index if not exists outreach_automation_runs_ops_territory_idx
  on outreach_automation_runs (operational_territory_id)
  where operational_territory_id is not null;
