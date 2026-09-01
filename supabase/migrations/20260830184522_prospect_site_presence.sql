-- First-party site presence for Top Leads Call today (outreach visit token + heartbeat).

create table if not exists prospect_site_presence (
  prospect_id integer primary key references prospects (id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  last_path text,
  system_message_id uuid references system_messages (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prospect_site_presence_last_seen_at_idx
  on prospect_site_presence (last_seen_at desc);

alter table prospect_site_presence enable row level security;

drop policy if exists "approved staff full access" on prospect_site_presence;
create policy "approved staff full access" on prospect_site_presence
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop trigger if exists prospect_site_presence_set_updated_at on prospect_site_presence;
create trigger prospect_site_presence_set_updated_at
  before update on prospect_site_presence
  for each row execute function public.set_updated_at();

do $$
begin
  alter publication supabase_realtime add table prospect_site_presence;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
