-- Phase 0: agent product outreach drafts on system_messages.
-- Widen origin allowlist; persist intro/closing as dedicated columns.

do $$
declare
  con_name text;
begin
  select con.conname into con_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'system_messages'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%origin%'
  limit 1;

  if con_name is not null then
    execute format('alter table public.system_messages drop constraint %I', con_name);
  end if;
end $$;

alter table public.system_messages
  add constraint system_messages_origin_check
  check (origin in ('manual_product_email', 'agent_product_email'));

alter table public.system_messages
  add column if not exists intro_text text;

alter table public.system_messages
  add column if not exists closing_text text;

create index if not exists system_messages_agent_origin_status_created_at_idx
  on public.system_messages (status, created_at desc)
  where origin = 'agent_product_email';
