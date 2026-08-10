-- Phase D: Gmail thread ↔ CRM association metadata (not a mailbox mirror).
-- Authoritative: connection + gmail_thread_id + prospect/contact + link_status.
-- Cache columns (subject/snippet/participants/unread/last_message_at) are
-- non-authoritative convenience fields; live Gmail wins on conflict.

create table if not exists gmail_thread_links (
  id uuid primary key default gen_random_uuid(),
  google_connection_id uuid not null references google_account_connections (id) on delete cascade,
  gmail_thread_id text not null,
  prospect_id integer references prospects (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  link_status text not null default 'confirmed'
    check (link_status in ('suggested', 'confirmed')),
  subject text,
  snippet text,
  participants jsonb not null default '[]'::jsonb,
  unread boolean not null default false,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gmail_thread_links_connection_thread_uidx
    unique (google_connection_id, gmail_thread_id)
);

create index if not exists gmail_thread_links_prospect_last_message_idx
  on gmail_thread_links (prospect_id, last_message_at desc nulls last);

create index if not exists gmail_thread_links_contact_idx
  on gmail_thread_links (account_contact_id);

drop trigger if exists gmail_thread_links_set_updated_at on gmail_thread_links;
create trigger gmail_thread_links_set_updated_at
  before update on gmail_thread_links
  for each row execute function set_updated_at();

alter table gmail_thread_links enable row level security;

drop policy if exists "approved staff full access" on gmail_thread_links;
create policy "approved staff full access" on gmail_thread_links
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());
