-- PR6: persist calibrated lead rules on outreach_goal_settings.

alter table outreach_goal_settings
  add column if not exists lead_rules jsonb,
  add column if not exists lead_rules_source text
    check (lead_rules_source is null or lead_rules_source in ('provisional', 'measured')),
  add column if not exists lead_rules_meta jsonb,
  add column if not exists lead_rules_computed_at timestamptz;
