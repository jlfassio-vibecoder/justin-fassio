-- Staff dismiss for Briefing research-email queue (no findable contact email).

create table if not exists outreach_research_queue_dismissals (
  prospect_id integer primary key references prospects(id) on delete cascade,
  dismissed_by uuid null references auth.users(id) on delete set null,
  dismissed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table outreach_research_queue_dismissals enable row level security;

drop policy if exists "approved staff full access" on outreach_research_queue_dismissals;
create policy "approved staff full access" on outreach_research_queue_dismissals
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop trigger if exists outreach_research_queue_dismissals_set_updated_at on outreach_research_queue_dismissals;
create trigger outreach_research_queue_dismissals_set_updated_at
  before update on outreach_research_queue_dismissals
  for each row execute function public.set_updated_at();
