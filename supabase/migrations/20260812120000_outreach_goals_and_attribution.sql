-- Phase 4: outreach goals singleton + conversion attribution history.
-- Goals must NOT live in catalog_settings.

create table if not exists outreach_goal_settings (
  id uuid primary key default gen_random_uuid(),
  monthly_target integer not null default 5
    check (monthly_target >= 0),
  planning_conversion_rate numeric(8, 6) not null default 0.015
    check (planning_conversion_rate > 0 and planning_conversion_rate <= 1),
  min_attributed_conversions integer not null default 8
    check (min_attributed_conversions >= 0),
  lookback_days integer not null default 90
    check (lookback_days >= 1),
  last_touch_window_days integer not null default 45
    check (last_touch_window_days >= 1),
  smoothing_alpha numeric(8, 6) not null default 0.30
    check (smoothing_alpha >= 0 and smoothing_alpha <= 1),
  measured_rate_floor numeric(8, 6) not null default 0.005
    check (measured_rate_floor > 0),
  measured_rate_cap numeric(8, 6) not null default 0.06
    check (measured_rate_cap > 0),
  pace_floor integer not null default 1
    check (pace_floor >= 0),
  pace_cap integer not null default 25
    check (pace_cap >= 0),
  business_timezone text not null default 'America/Vancouver',
  selling_day_mode text not null default 'weekdays'
    check (selling_day_mode in ('weekdays')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  constraint outreach_goal_settings_measured_bounds_check
    check (measured_rate_floor <= measured_rate_cap),
  constraint outreach_goal_settings_pace_bounds_check
    check (pace_floor <= pace_cap)
);

-- Singleton: at most one settings row.
create unique index if not exists outreach_goal_settings_singleton_uidx
  on outreach_goal_settings ((true));

drop trigger if exists outreach_goal_settings_set_updated_at on outreach_goal_settings;
create trigger outreach_goal_settings_set_updated_at
  before update on outreach_goal_settings
  for each row execute function set_updated_at();

alter table outreach_goal_settings enable row level security;

drop policy if exists "approved staff full access" on outreach_goal_settings;
create policy "approved staff full access" on outreach_goal_settings
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

insert into outreach_goal_settings (
  monthly_target,
  planning_conversion_rate,
  business_timezone,
  selling_day_mode
)
select 5, 0.015, 'America/Vancouver', 'weekdays'
where not exists (select 1 from outreach_goal_settings);

create table if not exists account_conversion_attribution (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer not null references prospects (id) on delete cascade,
  converted_at timestamptz not null,
  converted_by uuid references auth.users (id) on delete set null,
  conversion_source text not null
    check (conversion_source in ('outreach', 'call', 'wholesale', 'manual')),
  attribution_model text not null
    check (attribution_model in ('staff_confirmed', 'last_touch_inferred', 'none')),
  attributed_system_message_id uuid references system_messages (id) on delete set null,
  contributing_system_message_ids uuid[] not null default '{}',
  catalog_item_id uuid references catalog_items (id) on delete set null,
  message_origin text,
  primary_channel text,
  priority text,
  fit_score numeric,
  product_fit text,
  channel_match boolean,
  lead_state text
    check (lead_state is null or lead_state in ('cold', 'warm', 'hot')),
  lead_score numeric,
  rules_version text,
  snapshot jsonb not null default '{}'::jsonb,
  attributed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists account_conversion_attribution_prospect_converted_uidx
  on account_conversion_attribution (prospect_id, converted_at);

create index if not exists account_conversion_attribution_converted_at_idx
  on account_conversion_attribution (converted_at desc);

create index if not exists account_conversion_attribution_message_idx
  on account_conversion_attribution (attributed_system_message_id)
  where attributed_system_message_id is not null;

alter table account_conversion_attribution enable row level security;

drop policy if exists "approved staff full access" on account_conversion_attribution;
create policy "approved staff full access" on account_conversion_attribution
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create index if not exists prospects_converted_at_idx
  on prospects (converted_at)
  where converted_at is not null;
