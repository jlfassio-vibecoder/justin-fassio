-- Message Center Phase 1: threads + messages for inbound wholesale order requests.

create table if not exists message_threads (
  id uuid primary key default gen_random_uuid(),
  prospect_id integer references prospects(id) on delete set null,
  mapping_status text not null default 'unmapped'
    check (mapping_status in ('unmapped', 'suggested', 'confirmed')),
  identity_fingerprint text not null,
  confirmed_fingerprint text,
  source text not null default 'old-guys-rule-wholesale',
  subject text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists message_threads_identity_fingerprint_uidx
  on message_threads (identity_fingerprint);

create index if not exists message_threads_prospect_id_idx
  on message_threads (prospect_id);

create index if not exists message_threads_mapping_status_idx
  on message_threads (mapping_status);

create index if not exists message_threads_last_message_at_idx
  on message_threads (last_message_at desc);

drop trigger if exists message_threads_set_updated_at on message_threads;
create trigger message_threads_set_updated_at
  before update on message_threads
  for each row execute function set_updated_at();

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  kind text not null default 'wholesale_order_request'
    check (kind in ('wholesale_order_request')),
  wholesale_order_request_id uuid references wholesale_order_requests(id) on delete set null,
  body text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messages_thread_id_idx
  on messages (thread_id, created_at);

create unique index if not exists messages_wholesale_order_request_id_uidx
  on messages (wholesale_order_request_id)
  where wholesale_order_request_id is not null;

alter table message_threads enable row level security;
alter table messages enable row level security;

drop policy if exists "approved staff full access" on message_threads;
create policy "approved staff full access" on message_threads
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

drop policy if exists "approved staff full access" on messages;
create policy "approved staff full access" on messages
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());
