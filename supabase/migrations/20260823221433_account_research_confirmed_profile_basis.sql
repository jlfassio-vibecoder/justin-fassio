-- Account Research: confirmed_profile acceptance basis + atomic source claim RPC.

-- Extend acceptance_basis to include profile-attributed social posts.
alter table account_research_citations
  drop constraint if exists account_research_citations_acceptance_basis_check;

alter table account_research_citations
  add constraint account_research_citations_acceptance_basis_check
  check (
    acceptance_basis is null
    or acceptance_basis in ('identity_gate', 'staff', 'confirmed_profile')
  );

-- Atomically claim the next pending source in deterministic platform order.
create or replace function public.claim_account_research_source_search(p_run_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source account_research_source_searches%rowtype;
  v_priority int;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  select s.*
  into v_source
  from account_research_source_searches s
  where s.research_run_id = p_run_id
    and s.status = 'pending'
  order by
    case s.source_type
      when 'website' then 1
      when 'shopify' then 2
      when 'instagram' then 3
      when 'facebook' then 4
      when 'tiktok' then 5
      when 'pinterest' then 6
      else 99
    end,
    s.created_at
  limit 1
  for update skip locked;

  if not found then
    return jsonb_build_object('ok', true, 'claimed', false, 'source', null);
  end if;

  update account_research_source_searches
  set
    status = 'running',
    started_at = coalesce(started_at, now())
  where id = v_source.id
    and status = 'pending'
  returning * into v_source;

  if not found then
    return jsonb_build_object('ok', true, 'claimed', false, 'source', null);
  end if;

  return jsonb_build_object(
    'ok', true,
    'claimed', true,
    'source', to_jsonb(v_source)
  );
end;
$$;

revoke all on function public.claim_account_research_source_search(uuid) from public;
grant execute on function public.claim_account_research_source_search(uuid) to authenticated;
