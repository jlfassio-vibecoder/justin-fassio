-- Atomic Resend webhook apply: row lock + idempotent event insert + counter increments.
-- Called only from the service-role webhook handler (no staff JWT).

create or replace function public.apply_resend_system_message_event(
  p_resend_email_id text,
  p_resend_event_id text,
  p_event_type text,
  p_occurred_at timestamptz,
  p_payload jsonb default '{}'::jsonb,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_msg public.system_messages%rowtype;
  v_event_id uuid;
  v_new_status text;
  v_last_event_at timestamptz;
begin
  if p_resend_email_id is null or length(trim(p_resend_email_id)) = 0 then
    return jsonb_build_object('status', 'unknown_email');
  end if;
  if p_resend_event_id is null or length(trim(p_resend_event_id)) = 0 then
    return jsonb_build_object('status', 'error', 'error', 'missing_resend_event_id');
  end if;

  select *
  into v_msg
  from public.system_messages
  where resend_email_id = p_resend_email_id
  for update;

  if not found then
    return jsonb_build_object('status', 'unknown_email');
  end if;

  insert into public.system_message_events (
    system_message_id,
    resend_email_id,
    resend_event_id,
    event_type,
    occurred_at,
    payload
  ) values (
    v_msg.id,
    p_resend_email_id,
    p_resend_event_id,
    p_event_type,
    p_occurred_at,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (resend_event_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object(
      'status', 'duplicate',
      'system_message_id', v_msg.id
    );
  end if;

  v_new_status := v_msg.status;
  v_last_event_at := case
    when v_msg.last_event_at is null or v_msg.last_event_at < p_occurred_at then p_occurred_at
    else v_msg.last_event_at
  end;

  if p_event_type = 'email.sent' then
    if v_msg.status not in ('bounced', 'failed', 'complained')
       and v_msg.status in ('draft', 'queued', 'sending') then
      v_new_status := 'sent';
    end if;
    update public.system_messages
    set
      status = v_new_status,
      sent_at = coalesce(sent_at, p_occurred_at),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.delivered' then
    if v_msg.status not in ('bounced', 'failed', 'complained') then
      v_new_status := 'delivered';
      update public.system_messages
      set
        status = v_new_status,
        delivered_at = coalesce(delivered_at, p_occurred_at),
        last_event_at = v_last_event_at
      where id = v_msg.id;
    else
      -- Keep terminal status; still fill delivered_at if missing.
      update public.system_messages
      set
        delivered_at = coalesce(delivered_at, p_occurred_at),
        last_event_at = v_last_event_at
      where id = v_msg.id;
    end if;

  elsif p_event_type = 'email.opened' then
    update public.system_messages
    set
      open_count = open_count + 1,
      opened_at = coalesce(opened_at, p_occurred_at),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.clicked' then
    update public.system_messages
    set
      click_count = click_count + 1,
      clicked_at = coalesce(clicked_at, p_occurred_at),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.bounced' then
    update public.system_messages
    set
      status = 'bounced',
      bounced_at = coalesce(bounced_at, p_occurred_at),
      failure_reason = coalesce(p_failure_reason, failure_reason),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.failed' then
    update public.system_messages
    set
      status = case
        when status in ('bounced', 'complained') then status
        else 'failed'
      end,
      failed_at = coalesce(failed_at, p_occurred_at),
      failure_reason = case
        when status = 'bounced' and failure_reason is not null then failure_reason
        else coalesce(p_failure_reason, failure_reason)
      end,
      last_event_at = v_last_event_at
    where id = v_msg.id;

  elsif p_event_type = 'email.complained' then
    update public.system_messages
    set
      status = 'complained',
      complained_at = coalesce(complained_at, p_occurred_at),
      last_event_at = v_last_event_at
    where id = v_msg.id;

  else
    update public.system_messages
    set last_event_at = v_last_event_at
    where id = v_msg.id;
  end if;

  return jsonb_build_object(
    'status', 'applied',
    'system_message_id', v_msg.id
  );
end;
$$;

revoke all on function public.apply_resend_system_message_event(
  text, text, text, timestamptz, jsonb, text
) from public;

grant execute on function public.apply_resend_system_message_event(
  text, text, text, timestamptz, jsonb, text
) to service_role;
