-- Copilot suggestion ignored: consolidating into an earlier migration would rewrite applied migration history; this follow-up intentionally replaces list_pending_profiles to reps-only.
-- Align list_pending_profiles with set_profile_status: only pending reps are actionable.

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
    and p.role = 'rep'
  order by p.created_at asc;
end;
$$;
