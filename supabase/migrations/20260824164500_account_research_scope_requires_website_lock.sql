-- Website discovery is now its own dedicated staff flow (scope 'website' +
-- explicit lock). Every other scope (in particular 'all') now scrapes the
-- locked official site for social/Shopify evidence instead of independently
-- guessing via search, so none of them can run until the website is locked.
-- 'all' also no longer creates its own website source row.

create or replace function public.start_account_research_run(
  p_retailer_id integer,
  p_scope text,
  p_trigger text,
  p_supersedes_run_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run_id uuid;
  v_sources jsonb := '[]'::jsonb;
  v_src record;
  v_requested_by uuid := auth.uid();
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if v_requested_by is null then
    raise exception 'Forbidden';
  end if;

  if p_scope is null or p_scope not in (
    'all', 'website', 'shopify', 'instagram', 'facebook', 'tiktok', 'pinterest'
  ) then
    raise exception 'Invalid scope';
  end if;

  if p_trigger is null or p_trigger not in ('manual', 'prep', 'api') then
    raise exception 'Invalid trigger';
  end if;

  if not exists (select 1 from prospects where id = p_retailer_id) then
    raise exception 'Retailer not found';
  end if;

  if p_scope <> 'website' and not exists (
    select 1 from account_research_source_locks
    where retailer_id = p_retailer_id and source_type = 'website'
  ) then
    raise exception 'WEBSITE_NOT_LOCKED';
  end if;

  begin
    insert into account_research_runs (
      retailer_id,
      status,
      "trigger",
      requested_scope,
      requested_by,
      supersedes_run_id,
      started_at
    )
    values (
      p_retailer_id,
      'running',
      p_trigger,
      p_scope,
      v_requested_by,
      p_supersedes_run_id,
      now()
    )
    returning id into v_run_id;
  exception
    when unique_violation then
      raise exception 'ACTIVE_RUN_CONFLICT';
  end;

  if p_scope = 'all' then
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    )
    values
      (v_run_id, 'shopify', 'storefront', 'pending', v_requested_by),
      (v_run_id, 'instagram', 'recent_activity', 'pending', v_requested_by),
      (v_run_id, 'facebook', 'recent_activity', 'pending', v_requested_by),
      (v_run_id, 'tiktok', 'recent_activity', 'pending', v_requested_by),
      (v_run_id, 'pinterest', 'recent_activity', 'pending', v_requested_by);
  elsif p_scope = 'website' then
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    ) values (v_run_id, 'website', 'identity', 'pending', v_requested_by);
  elsif p_scope = 'shopify' then
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    ) values (v_run_id, 'shopify', 'storefront', 'pending', v_requested_by);
  else
    insert into account_research_source_searches (
      research_run_id, source_type, search_mode, status, requested_by
    ) values (v_run_id, p_scope, 'recent_activity', 'pending', v_requested_by);
  end if;

  for v_src in
    select id, source_type, search_mode, status
    from account_research_source_searches
    where research_run_id = v_run_id
    order by created_at
  loop
    v_sources := v_sources || jsonb_build_array(jsonb_build_object(
      'id', v_src.id,
      'source_type', v_src.source_type,
      'search_mode', v_src.search_mode,
      'status', v_src.status
    ));
  end loop;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'sources', v_sources
  );
end;
$$;

revoke all on function public.start_account_research_run(integer, text, text, uuid) from public;
grant execute on function public.start_account_research_run(integer, text, text, uuid) to authenticated;
