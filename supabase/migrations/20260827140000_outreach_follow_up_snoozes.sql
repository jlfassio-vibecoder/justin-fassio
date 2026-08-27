-- Staff snooze for Briefing follow-up rows until a future date (default: tomorrow Vancouver).

create table if not exists outreach_follow_up_snoozes (
  prospect_id integer primary key references prospects(id) on delete cascade,
  snoozed_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists outreach_follow_up_snoozes_until_idx
  on outreach_follow_up_snoozes (snoozed_until);

alter table outreach_follow_up_snoozes enable row level security;

drop policy if exists "approved staff full access" on outreach_follow_up_snoozes;
create policy "approved staff full access" on outreach_follow_up_snoozes
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop trigger if exists outreach_follow_up_snoozes_set_updated_at on outreach_follow_up_snoozes;
create trigger outreach_follow_up_snoozes_set_updated_at
  before update on outreach_follow_up_snoozes
  for each row execute function public.set_updated_at();
