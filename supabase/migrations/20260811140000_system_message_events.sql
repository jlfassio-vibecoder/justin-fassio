-- System Message events ledger (Phase 3): Resend webhook deliveries.
-- Idempotency via unique resend_event_id (Svix message id).

create table if not exists system_message_events (
  id uuid primary key default gen_random_uuid(),
  system_message_id uuid not null references system_messages (id) on delete cascade,
  resend_email_id text,
  resend_event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint system_message_events_resend_event_id_uidx unique (resend_event_id)
);

create index if not exists system_message_events_system_message_created_at_idx
  on system_message_events (system_message_id, created_at);

create index if not exists system_message_events_resend_email_id_idx
  on system_message_events (resend_email_id)
  where resend_email_id is not null;

alter table system_message_events enable row level security;

drop policy if exists "approved staff full access" on system_message_events;
create policy "approved staff full access" on system_message_events
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());
