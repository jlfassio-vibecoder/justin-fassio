-- Phase G: owner-only pending profile list + approve/reject RPCs.
-- Self-escalation stays blocked by existing profiles update RLS; no broad owner UPDATE policy.

create or replace function public.is_approved_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'approved'
      and p.role = 'owner'
  );
$$;

revoke all on function public.is_approved_owner() from public;
grant execute on function public.is_approved_owner() to authenticated;

create or replace function public.list_pending_profiles()
returns table (
  id uuid,
  email text,
  display_name text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_approved_owner() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    p.email,
    p.display_name,
    p.role,
    p.status,
    p.created_at
  from public.profiles p
  where p.status = 'pending'
    and p.role in ('rep', 'owner')
  order by p.created_at asc;
end;
$$;

revoke all on function public.list_pending_profiles() from public;
grant execute on function public.list_pending_profiles() to authenticated;

create or replace function public.set_profile_status(
  target_id uuid,
  new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.profiles%rowtype;
begin
  if not public.is_approved_owner() then
    raise exception 'Forbidden' using errcode = '42501';
  end if;

  if new_status not in ('approved', 'rejected') then
    raise exception 'new_status must be approved or rejected' using errcode = '22023';
  end if;

  if target_id is null then
    raise exception 'target_id is required' using errcode = '22023';
  end if;

  if target_id = auth.uid() then
    raise exception 'Cannot change your own status' using errcode = '42501';
  end if;

  select * into target from public.profiles p where p.id = target_id;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if target.role = 'owner' then
    raise exception 'Cannot change status of an owner' using errcode = '42501';
  end if;

  update public.profiles
  set status = new_status, updated_at = now()
  where id = target_id;
end;
$$;

revoke all on function public.set_profile_status(uuid, text) from public;
grant execute on function public.set_profile_status(uuid, text) to authenticated;
