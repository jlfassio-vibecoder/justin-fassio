-- Silo Active Account Briefing regional prep from Daily Briefing regional prep.
-- Same geography identity, separate kind so Run prep now does not noop across audiences.

alter table outreach_automation_runs
  drop constraint if exists outreach_automation_runs_kind_check;

alter table outreach_automation_runs
  add constraint outreach_automation_runs_kind_check
  check (kind in ('nightly_prep', 'manual_regional_prep', 'manual_regional_active_prep'));

alter table outreach_automation_runs
  drop constraint if exists outreach_automation_runs_regional_ops_required;

alter table outreach_automation_runs
  add constraint outreach_automation_runs_regional_ops_required
  check (
    (kind = 'nightly_prep' and operational_territory_id is null and store_territory_code is null)
    or (
      kind in ('manual_regional_prep', 'manual_regional_active_prep')
      and operational_territory_id is not null
    )
  );

create unique index if not exists outreach_automation_runs_regional_active_identity_uidx
  on outreach_automation_runs (
    run_date,
    operational_territory_id,
    coalesce(store_territory_code, ''),
    coalesce(crm_region, ''),
    coalesce(prep_city, '')
  )
  where kind = 'manual_regional_active_prep';
