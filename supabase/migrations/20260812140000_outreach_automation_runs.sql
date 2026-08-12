-- Phase 5: outreach automation runs for nightly prep idempotency.
-- Briefing is on-read; no snapshot table.

create table if not exists outreach_automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_date date not null,
  kind text not null default 'nightly_prep'
    check (kind in ('nightly_prep')),
  status text not null
    check (status in ('running', 'succeeded', 'partial', 'empty_pool', 'failed')),
  trigger text not null
    check (trigger in ('cron', 'manual')),
  capacity integer not null default 0
    check (capacity >= 0),
  pending_before integer not null default 0
    check (pending_before >= 0),
  net_capacity integer not null default 0
    check (net_capacity >= 0),
  selected_count integer not null default 0
    check (selected_count >= 0),
  produced_count integer not null default 0
    check (produced_count >= 0),
  skipped_count integer not null default 0
    check (skipped_count >= 0),
  failed_count integer not null default 0
    check (failed_count >= 0),
  shortfall integer not null default 0
    check (shortfall >= 0),
  channel_allocation jsonb not null default '{}'::jsonb,
  error text,
  target_errors jsonb not null default '[]'::jsonb,
  reason text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  triggered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outreach_automation_runs_kind_run_date_uidx unique (kind, run_date)
);

create index if not exists outreach_automation_runs_run_date_idx
  on outreach_automation_runs (run_date desc);

create index if not exists outreach_automation_runs_status_idx
  on outreach_automation_runs (status);

drop trigger if exists outreach_automation_runs_set_updated_at on outreach_automation_runs;
create trigger outreach_automation_runs_set_updated_at
  before update on outreach_automation_runs
  for each row execute function set_updated_at();

alter table outreach_automation_runs enable row level security;

drop policy if exists "approved staff full access" on outreach_automation_runs;
create policy "approved staff full access" on outreach_automation_runs
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create index if not exists system_messages_automation_run_id_idx
  on system_messages (automation_run_id)
  where automation_run_id is not null;
