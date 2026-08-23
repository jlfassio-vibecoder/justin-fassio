-- Account Research PR2: atomic start + complete-source RPCs.
-- SECURITY INVOKER; staff-only via is_approved_staff(). Caller JWT + RLS.

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
      (v_run_id, 'website', 'identity', 'pending', v_requested_by),
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

create or replace function public.complete_account_research_source_search(
  p_source_search_id uuid,
  p_status text,
  p_query_text text default null,
  p_resolved_public_url text default null,
  p_error text default null,
  p_provider text default null,
  p_provider_metadata jsonb default '{}'::jsonb,
  p_citations jsonb default '[]'::jsonb,
  p_research_brief text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source account_research_source_searches%rowtype;
  v_run account_research_runs%rowtype;
  v_citation jsonb;
  v_count integer := 0;
  v_run_id uuid;
  v_retailer_id integer;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if p_status is null or p_status not in (
    'succeeded', 'none_indexed', 'blocked', 'failed', 'cancelled'
  ) then
    raise exception 'Invalid source status';
  end if;

  select * into v_source
  from account_research_source_searches
  where id = p_source_search_id
  for update;

  if not found then
    raise exception 'Source search not found';
  end if;

  if v_source.status <> 'running' then
    raise exception 'SOURCE_NOT_RUNNING';
  end if;

  select * into v_run
  from account_research_runs
  where id = v_source.research_run_id
  for update;

  if not found then
    raise exception 'Research run not found';
  end if;

  if v_run.status in ('cancelled', 'succeeded', 'partial', 'failed', 'needs_identity_review') then
    raise exception 'STALE_WORKER';
  end if;

  v_run_id := v_run.id;
  v_retailer_id := v_run.retailer_id;

  if jsonb_typeof(p_citations) = 'array' then
    for v_citation in select * from jsonb_array_elements(p_citations)
    loop
      insert into account_research_citations (
        source_search_id,
        research_run_id,
        retailer_id,
        source_url,
        source_url_normalized,
        title,
        platform,
        published_at,
        observed_at,
        excerpt,
        confidence,
        identity_confidence,
        acceptance_status,
        acceptance_basis,
        provider_metadata
      )
      values (
        p_source_search_id,
        v_run_id,
        v_retailer_id,
        v_citation->>'source_url',
        v_citation->>'source_url_normalized',
        nullif(v_citation->>'title', ''),
        v_citation->>'platform',
        case
          when v_citation ? 'published_at' and nullif(v_citation->>'published_at', '') is not null
            then (v_citation->>'published_at')::timestamptz
          else null
        end,
        coalesce(
          nullif(v_citation->>'observed_at', '')::timestamptz,
          now()
        ),
        nullif(v_citation->>'excerpt', ''),
        v_citation->>'confidence',
        v_citation->>'identity_confidence',
        coalesce(v_citation->>'acceptance_status', 'pending'),
        nullif(v_citation->>'acceptance_basis', ''),
        coalesce(v_citation->'provider_metadata', '{}'::jsonb)
      )
      on conflict (source_search_id, source_url_normalized) do nothing;
      v_count := v_count + 1;
    end loop;
  end if;

  update account_research_source_searches
  set
    status = p_status,
    query_text = p_query_text,
    resolved_public_url = p_resolved_public_url,
    error = p_error,
    provider = coalesce(p_provider, provider),
    provider_metadata = coalesce(p_provider_metadata, '{}'::jsonb),
    result_count = (
      select count(*)::integer
      from account_research_citations
      where source_search_id = p_source_search_id
    ),
    completed_at = now()
  where id = p_source_search_id;

  if p_research_brief is not null and length(trim(p_research_brief)) > 0 then
    update account_research_runs
    set research_brief = left(trim(p_research_brief), 4000)
    where id = v_run_id
      and (research_brief is null or research_brief = '');
  end if;

  return jsonb_build_object(
    'ok', true,
    'source_search_id', p_source_search_id,
    'status', p_status,
    'citation_count', (
      select count(*)::integer
      from account_research_citations
      where source_search_id = p_source_search_id
    ),
    'attempted_citation_count', v_count
  );
end;
$$;

revoke all on function public.complete_account_research_source_search(
  uuid, text, text, text, text, text, jsonb, jsonb, text
) from public;
grant execute on function public.complete_account_research_source_search(
  uuid, text, text, text, text, text, jsonb, jsonb, text
) to authenticated;
