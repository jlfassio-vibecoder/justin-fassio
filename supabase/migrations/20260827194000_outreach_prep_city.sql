-- Scope manual regional prep to a single city (e.g. Newport) within a CRM region.

alter table outreach_automation_runs
  add column if not exists prep_city text;

drop index if exists outreach_automation_runs_regional_identity_uidx;

create unique index if not exists outreach_automation_runs_regional_identity_uidx
  on outreach_automation_runs (
    run_date,
    operational_territory_id,
    coalesce(store_territory_code, ''),
    coalesce(crm_region, ''),
    coalesce(prep_city, '')
  )
  where kind = 'manual_regional_prep';

create index if not exists outreach_automation_runs_prep_city_idx
  on outreach_automation_runs (prep_city)
  where prep_city is not null;
