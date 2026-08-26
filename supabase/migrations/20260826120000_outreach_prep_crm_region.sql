-- Scope manual regional prep to driveable CRM regions (e.g. Oregon Coast).

alter table outreach_automation_runs
  add column if not exists crm_region text;

drop index if exists outreach_automation_runs_regional_identity_uidx;

create unique index if not exists outreach_automation_runs_regional_identity_uidx
  on outreach_automation_runs (
    run_date,
    operational_territory_id,
    coalesce(store_territory_code, ''),
    coalesce(crm_region, '')
  )
  where kind = 'manual_regional_prep';

create index if not exists outreach_automation_runs_crm_region_idx
  on outreach_automation_runs (crm_region)
  where crm_region is not null;
