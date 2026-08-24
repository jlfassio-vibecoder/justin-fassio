-- Staff-locked official URLs per retailer + source (survives refresh).

create table if not exists account_research_source_locks (
  retailer_id integer not null references prospects (id) on delete cascade,
  source_type text not null
    check (source_type in (
      'website',
      'shopify',
      'instagram',
      'facebook',
      'tiktok',
      'pinterest'
    )),
  locked_url text not null,
  locked_url_normalized text not null,
  locked_by uuid references auth.users (id) on delete set null,
  locked_at timestamptz not null default now(),
  primary key (retailer_id, source_type)
);

alter table account_research_source_locks enable row level security;

drop policy if exists "approved staff full access" on account_research_source_locks;
create policy "approved staff full access" on account_research_source_locks
  for all to authenticated
  using (public.is_approved_staff())
  with check (public.is_approved_staff());

create or replace function public.lock_account_research_source(
  p_retailer_id integer,
  p_source_type text,
  p_url text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_normalized text;
  v_lock account_research_source_locks%rowtype;
  v_run_id uuid;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if p_retailer_id is null or p_retailer_id <= 0 then
    raise exception 'Invalid retailer';
  end if;

  if p_source_type is null or p_source_type not in (
    'website', 'shopify', 'instagram', 'facebook', 'tiktok', 'pinterest'
  ) then
    raise exception 'Invalid source type';
  end if;

  v_normalized := nullif(btrim(p_url), '');
  if v_normalized is null then
    raise exception 'URL is required';
  end if;

  insert into account_research_source_locks (
    retailer_id,
    source_type,
    locked_url,
    locked_url_normalized,
    locked_by,
    locked_at
  )
  values (
    p_retailer_id,
    p_source_type,
    v_normalized,
    v_normalized,
    auth.uid(),
    now()
  )
  on conflict (retailer_id, source_type) do update
    set
      locked_url = excluded.locked_url,
      locked_url_normalized = excluded.locked_url_normalized,
      locked_by = excluded.locked_by,
      locked_at = now()
  returning * into v_lock;

  select r.id
    into v_run_id
  from account_research_runs r
  where r.retailer_id = p_retailer_id
  order by coalesce(r.completed_at, r.created_at) desc
  limit 1;

  if v_run_id is not null then
    update account_research_source_searches
    set resolved_public_url = v_lock.locked_url
    where research_run_id = v_run_id
      and source_type = p_source_type;
  end if;

  return jsonb_build_object('ok', true, 'lock', to_jsonb(v_lock));
end;
$$;

create or replace function public.unlock_account_research_source(
  p_retailer_id integer,
  p_source_type text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if p_source_type is null or p_source_type not in (
    'website', 'shopify', 'instagram', 'facebook', 'tiktok', 'pinterest'
  ) then
    raise exception 'Invalid source type';
  end if;

  delete from account_research_source_locks
  where retailer_id = p_retailer_id
    and source_type = p_source_type;

  select r.id
    into v_run_id
  from account_research_runs r
  where r.retailer_id = p_retailer_id
  order by coalesce(r.completed_at, r.created_at) desc
  limit 1;

  if v_run_id is not null then
    update account_research_source_searches
    set resolved_public_url = null
    where research_run_id = v_run_id
      and source_type = p_source_type;
  end if;

  return jsonb_build_object('ok', true, 'unlocked', true);
end;
$$;

revoke all on function public.lock_account_research_source(integer, text, text) from public;
grant execute on function public.lock_account_research_source(integer, text, text) to authenticated;

revoke all on function public.unlock_account_research_source(integer, text) from public;
grant execute on function public.unlock_account_research_source(integer, text) to authenticated;
