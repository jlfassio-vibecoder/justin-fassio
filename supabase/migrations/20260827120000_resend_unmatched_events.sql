-- Buffer Resend webhook events that arrive before system_messages.resend_email_id is stamped.
-- Service-role apply path inserts here on unknown_email; stamp/replay resolves rows.

create table if not exists resend_unmatched_events (
  id uuid primary key default gen_random_uuid(),
  resend_email_id text not null,
  resend_event_id text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  failure_reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint resend_unmatched_events_resend_event_id_uidx unique (resend_event_id)
);

create index if not exists resend_unmatched_events_email_unresolved_idx
  on resend_unmatched_events (resend_email_id)
  where resolved_at is null;

alter table resend_unmatched_events enable row level security;

-- Staff may inspect unmatched events for ops; writes are service-role only (RLS bypass).
drop policy if exists "approved staff read unmatched resend events" on resend_unmatched_events;
create policy "approved staff read unmatched resend events"
  on resend_unmatched_events
  for select to authenticated
  using (public.is_approved_staff());
