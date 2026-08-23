-- PR7: staff toggle to disable adaptive outreach weights.

alter table outreach_goal_settings
  add column if not exists adaptive_weights_enabled boolean not null default true;
