-- Pre-PR gate: buyer_reply kind, tighten buyer RLS, avoid prospect row exposure.

-- Allow retailer replies in Message Center
alter table messages drop constraint if exists messages_kind_check;
alter table messages add constraint messages_kind_check
  check (kind in (
    'wholesale_order_request',
    'wholesale_inquiry',
    'live_chat_visitor',
    'live_chat_staff',
    'live_chat_ai',
    'live_chat_system',
    'buyer_reply'
  ));

-- Do not expose full CRM prospect rows to buyers (labels come from order requests / staff UI)
drop policy if exists "buyers read linked prospect" on prospects;

-- Pending / unverified buyers must not read or reply on prospect-wide threads
create or replace function public.buyer_owns_message_thread(p_thread_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.message_threads t
    join public.profiles p on p.id = auth.uid()
    where t.id = p_thread_id
      and p.role = 'buyer'
      and p.status = 'approved'
      and p.wholesale_pricing_unlocked = true
      and p.prospect_id is not null
      and t.prospect_id = p.prospect_id
  );
$$;

drop policy if exists "buyers read linked threads" on message_threads;
create policy "buyers read linked threads" on message_threads
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role = 'buyer'
        and p.status = 'approved'
        and p.wholesale_pricing_unlocked = true
        and p.prospect_id is not null
        and message_threads.prospect_id = p.prospect_id
    )
  );

-- Clear denormalized wholesale prices from carts when staff revokes unlock
create or replace function public.set_buyer_wholesale_pricing(
  target_id uuid,
  unlocked boolean,
  approve_profile boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_approved_staff() then
    raise exception 'not authorized';
  end if;

  update public.profiles
  set
    wholesale_pricing_unlocked = unlocked,
    status = case
      when unlocked and approve_profile then 'approved'
      else status
    end,
    updated_at = now()
  where id = target_id
    and role = 'buyer';

  if not found then
    raise exception 'buyer profile not found';
  end if;

  if not unlocked then
    update public.buyer_cart_items
    set wholesale_usd = null,
        updated_at = now()
    where user_id = target_id;
  end if;
end;
$$;
