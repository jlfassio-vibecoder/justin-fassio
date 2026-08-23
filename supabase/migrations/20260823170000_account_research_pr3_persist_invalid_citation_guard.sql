-- Account Research PR3 patch: map invalid citation UUIDs to INVALID_CITATIONS in persist RPC.
-- Forward-only follow-up to 20260823160000_account_research_pr3_suggestions.sql.

create or replace function public.persist_account_research_profile_suggestions(
  p_run_id uuid,
  p_force_regenerate boolean default false,
  p_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run account_research_runs%rowtype;
  v_item jsonb;
  v_suggestion_id uuid;
  v_citation_id uuid;
  v_citation_ids jsonb;
  v_inserted integer := 0;
  v_field_path text;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  select * into v_run from account_research_runs where id = p_run_id;
  if not found then
    raise exception 'Run not found';
  end if;

  if v_run.status not in ('succeeded', 'partial') then
    raise exception 'INELIGIBLE_RUN';
  end if;

  if v_run.identity_confidence <> 'high' then
    raise exception 'IDENTITY_REVIEW_REQUIRED';
  end if;

  if exists (
    select 1 from account_research_runs r
    where r.supersedes_run_id = p_run_id
  ) then
    raise exception 'SUPERSEDED_RUN';
  end if;

  if jsonb_typeof(p_suggestions) <> 'array' then
    raise exception 'Invalid suggestions payload';
  end if;

  for v_item in select * from jsonb_array_elements(p_suggestions)
  loop
    v_field_path := v_item->>'field_path';
    if v_field_path is null or not public.account_research_is_allowed_suggestion_field(v_field_path) then
      raise exception 'FORBIDDEN_FIELD';
    end if;

    v_citation_ids := coalesce(v_item->'citation_ids', '[]'::jsonb);
    if jsonb_typeof(v_citation_ids) <> 'array' or jsonb_array_length(v_citation_ids) < 1 then
      raise exception 'INVALID_CITATIONS';
    end if;

    if p_force_regenerate then
      update account_research_profile_suggestions
      set status = 'superseded', reviewed_at = now()
      where research_run_id = p_run_id
        and field_path = v_field_path
        and status = 'pending';
    end if;

    begin
      insert into account_research_profile_suggestions (
        research_run_id,
        retailer_id,
        field_path,
        suggested_value,
        baseline_value,
        rationale,
        confidence,
        status
      )
      values (
        p_run_id,
        v_run.retailer_id,
        v_field_path,
        v_item->'suggested_value',
        v_item->'baseline_value',
        left(nullif(v_item->>'rationale', ''), 500),
        coalesce(v_item->>'confidence', 'medium'),
        'pending'
      )
      returning id into v_suggestion_id;
    exception
      when unique_violation then
        continue;
    end;

    begin
      for v_citation_id in
        select (jsonb_array_elements_text(v_citation_ids))::uuid
      loop
        if not exists (
          select 1 from account_research_citations c
          where c.id = v_citation_id
            and c.research_run_id = p_run_id
            and c.retailer_id = v_run.retailer_id
            and c.acceptance_status = 'accepted'
            and c.source_url is not null
            and length(trim(c.source_url)) > 0
        ) then
          raise exception 'INVALID_CITATIONS';
        end if;

        insert into account_research_suggestion_citations (
          suggestion_id, citation_id, research_run_id
        )
        values (v_suggestion_id, v_citation_id, p_run_id)
        on conflict do nothing;
      end loop;
    exception
      when invalid_text_representation then
        raise exception 'INVALID_CITATIONS';
    end;

    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object('ok', true, 'inserted', v_inserted);
end;
$$;

revoke all on function public.persist_account_research_profile_suggestions(uuid, boolean, jsonb) from public;
grant execute on function public.persist_account_research_profile_suggestions(uuid, boolean, jsonb) to authenticated;
