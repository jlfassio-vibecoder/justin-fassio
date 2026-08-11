-- System Messages ledger (Phase 1): staff-only outbound app mail (product outreach).
-- Parallel to Message Center / Gmail — not message_threads. Webhooks/events arrive later.

create table if not exists system_messages (
  id uuid primary key default gen_random_uuid(),
  message_type text not null
    check (message_type in ('product_outreach')),
  origin text not null
    check (origin in ('manual_product_email')),
  status text not null
    check (status in (
      'draft',
      'queued',
      'scheduled',
      'sending',
      'sent',
      'delivered',
      'opened',
      'clicked',
      'bounced',
      'failed',
      'cancelled',
      'complained'
    )),
  catalog_item_id uuid references catalog_items (id) on delete set null,
  resend_email_id text,
  to_email text not null,
  to_name text,
  subject text not null default '',
  prospect_id integer references prospects (id) on delete set null,
  account_contact_id uuid references account_contacts (id) on delete set null,
  sent_by uuid references auth.users (id) on delete set null,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  complained_at timestamptz,
  open_count integer not null default 0,
  click_count integer not null default 0,
  last_event_at timestamptz,
  failure_reason text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  automation_run_id uuid,
  sequence_id uuid,
  sequence_step integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists system_messages_resend_email_id_uidx
  on system_messages (resend_email_id)
  where resend_email_id is not null;

create index if not exists system_messages_message_type_created_at_idx
  on system_messages (message_type, created_at desc);

create index if not exists system_messages_catalog_item_sent_at_idx
  on system_messages (catalog_item_id, sent_at desc nulls last);

create index if not exists system_messages_prospect_sent_at_idx
  on system_messages (prospect_id, sent_at desc nulls last);

create index if not exists system_messages_status_created_at_idx
  on system_messages (status, created_at desc);

create index if not exists system_messages_to_email_idx
  on system_messages (to_email);

drop trigger if exists system_messages_set_updated_at on system_messages;
create trigger system_messages_set_updated_at
  before update on system_messages
  for each row execute function set_updated_at();

alter table system_messages enable row level security;

drop policy if exists "approved staff full access" on system_messages;
create policy "approved staff full access" on system_messages
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());
