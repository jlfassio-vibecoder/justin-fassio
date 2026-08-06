-- Live chat FAB: channel/state on threads, visitor binding, message kinds, RLS, Realtime.

alter table message_threads
  add column if not exists channel text not null default 'wholesale'
    check (channel in ('wholesale', 'live_chat'));

alter table message_threads
  add column if not exists chat_state text
    check (chat_state is null or chat_state in ('awaiting_human', 'ai_active', 'human_active'));

alter table message_threads
  add column if not exists visitor_user_id uuid references auth.users(id) on delete set null;

alter table message_threads
  add column if not exists visitor_name text;

alter table message_threads
  add column if not exists visitor_email text;

alter table message_threads
  add column if not exists awaiting_reply_since timestamptz;

create unique index if not exists message_threads_live_chat_visitor_uidx
  on message_threads (visitor_user_id)
  where channel = 'live_chat' and visitor_user_id is not null;

create index if not exists message_threads_channel_idx
  on message_threads (channel);

create index if not exists message_threads_chat_state_idx
  on message_threads (chat_state)
  where chat_state is not null;

-- Widen messages.kind for live chat roles.
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check
  check (kind in (
    'wholesale_order_request',
    'wholesale_inquiry',
    'live_chat_visitor',
    'live_chat_staff',
    'live_chat_ai',
    'live_chat_system'
  ));

-- Anonymous visitors create buyer/pending profiles (not staff).
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1)),
    case when coalesce(new.is_anonymous, false) then 'buyer' else 'rep' end,
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Visitor RLS: read own live-chat thread + messages; insert visitor messages only.
drop policy if exists "live chat visitor read threads" on message_threads;
create policy "live chat visitor read threads" on message_threads
  for select to authenticated
  using (
    channel = 'live_chat'
    and visitor_user_id = auth.uid()
  );

drop policy if exists "live chat visitor update own thread meta" on message_threads;
create policy "live chat visitor update own thread meta" on message_threads
  for update to authenticated
  using (
    channel = 'live_chat'
    and visitor_user_id = auth.uid()
  )
  with check (
    channel = 'live_chat'
    and visitor_user_id = auth.uid()
  );

drop policy if exists "live chat visitor read messages" on messages;
create policy "live chat visitor read messages" on messages
  for select to authenticated
  using (
    exists (
      select 1
      from message_threads t
      where t.id = messages.thread_id
        and t.channel = 'live_chat'
        and t.visitor_user_id = auth.uid()
    )
  );

drop policy if exists "live chat visitor insert messages" on messages;
create policy "live chat visitor insert messages" on messages
  for insert to authenticated
  with check (
    kind = 'live_chat_visitor'
    and exists (
      select 1
      from message_threads t
      where t.id = messages.thread_id
        and t.channel = 'live_chat'
        and t.visitor_user_id = auth.uid()
    )
  );

-- Realtime for chat (idempotent-ish: ignore if already members).
do $$
begin
  begin
    alter publication supabase_realtime add table messages;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
  begin
    alter publication supabase_realtime add table message_threads;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;
