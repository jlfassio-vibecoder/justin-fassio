-- Phase F: Calendar event ↔ CRM association metadata (not an event mirror).
-- Authoritative: connection + calendar_id + google_event_id + prospect/contact + link_status.
-- Cache columns (title/start_at/end_at/meet_url/attendees) are non-authoritative;
-- live Google Calendar wins on conflict.

create table if not exists calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  google_connection_id uuid not null references google_account_connections (id) on delete cascade,
  calendar_id text not null default 'primary',
  google_event_id text not null,
  prospect_id integer references prospects (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  link_status text not null default 'confirmed'
    check (link_status in ('suggested', 'confirmed')),
  title text,
  start_at timestamptz,
  end_at timestamptz,
  meet_url text,
  attendees jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_event_links_connection_calendar_event_uidx
    unique (google_connection_id, calendar_id, google_event_id)
);

create index if not exists calendar_event_links_prospect_start_idx
  on calendar_event_links (prospect_id, start_at desc nulls last);

create index if not exists calendar_event_links_contact_idx
  on calendar_event_links (account_contact_id);

drop trigger if exists calendar_event_links_set_updated_at on calendar_event_links;
create trigger calendar_event_links_set_updated_at
  before update on calendar_event_links
  for each row execute function set_updated_at();

alter table calendar_event_links enable row level security;

drop policy if exists "approved staff full access" on calendar_event_links;
create policy "approved staff full access" on calendar_event_links
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());
