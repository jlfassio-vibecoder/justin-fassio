-- Account Research PR3: profile suggestions baseline, uniqueness, supersede, persist/apply/reject RPCs.
-- SECURITY INVOKER; staff-only via is_approved_staff(). Caller JWT + RLS.

alter table account_research_profile_suggestions
  add column if not exists baseline_value jsonb;

create unique index if not exists account_research_profile_suggestions_run_field_pending_uidx
  on account_research_profile_suggestions (research_run_id, field_path)
  where status = 'pending';

create or replace function public.account_research_supersede_pending_suggestions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.supersedes_run_id is not null then
    update account_research_profile_suggestions
    set status = 'superseded', reviewed_at = now()
    where research_run_id = new.supersedes_run_id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists account_research_runs_supersede_suggestions on account_research_runs;
create trigger account_research_runs_supersede_suggestions
  after insert on account_research_runs
  for each row execute function public.account_research_supersede_pending_suggestions();

create or replace function public.account_research_is_allowed_suggestion_field(p_field_path text)
returns boolean
language sql
immutable
as $$
  select p_field_path in (
    'website', 'address', 'city', 'region', 'postal_code', 'phone', 'name',
    'retail_category', 'apparel_capability', 'category',
    'lifestyle_themes', 'secondary_channels', 'retail_subchannels',
    'venue_contexts', 'retail_capabilities'
  );
$$;

create or replace function public.account_research_json_values_equal(a jsonb, b jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(a, 'null'::jsonb) = coalesce(b, 'null'::jsonb);
$$;

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

create or replace function public.apply_account_research_profile_suggestion(
  p_suggestion_id uuid,
  p_confirm_verified_overwrite boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_suggestion account_research_profile_suggestions%rowtype;
  v_run account_research_runs%rowtype;
  v_prospect prospects%rowtype;
  v_current jsonb;
  v_actor uuid := auth.uid();
  v_source_urls jsonb := '[]'::jsonb;
  v_outcome text := 'applied';
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if v_actor is null then
    raise exception 'Forbidden';
  end if;

  select * into v_suggestion
  from account_research_profile_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'Suggestion not found';
  end if;

  if v_suggestion.status = 'accepted' then
    return jsonb_build_object('ok', true, 'outcome', 'already_applied', 'suggestion_id', p_suggestion_id);
  end if;

  if v_suggestion.status = 'rejected' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  if v_suggestion.status = 'superseded' then
    raise exception 'SUPERSEDED_SUGGESTION';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  if not public.account_research_is_allowed_suggestion_field(v_suggestion.field_path) then
    raise exception 'FORBIDDEN_FIELD';
  end if;

  select * into v_run from account_research_runs where id = v_suggestion.research_run_id;
  if not found then
    raise exception 'Run not found';
  end if;

  if exists (
    select 1 from account_research_runs r
    where r.supersedes_run_id = v_suggestion.research_run_id
  ) then
    raise exception 'SUPERSEDED_SUGGESTION';
  end if;

  select * into v_prospect from prospects where id = v_suggestion.retailer_id for update;
  if not found then
    raise exception 'Retailer not found';
  end if;

  if (
    v_prospect.import_protected = true
    or v_prospect.buyer_verified = true
    or coalesce(v_prospect.verification_status, '') ~* '^verified$'
  ) and v_suggestion.field_path in (
    'name', 'address', 'phone', 'website', 'city', 'postal_code'
  ) and not p_confirm_verified_overwrite then
    raise exception 'PROTECTED_IDENTITY';
  end if;

  v_current := case v_suggestion.field_path
    when 'website' then to_jsonb(v_prospect.website)
    when 'address' then to_jsonb(v_prospect.address)
    when 'city' then to_jsonb(v_prospect.city)
    when 'region' then to_jsonb(v_prospect.region)
    when 'postal_code' then to_jsonb(v_prospect.postal_code)
    when 'phone' then to_jsonb(v_prospect.phone)
    when 'name' then to_jsonb(v_prospect.name)
    when 'retail_category' then to_jsonb(v_prospect.retail_category)
    when 'apparel_capability' then to_jsonb(v_prospect.apparel_capability)
    when 'category' then to_jsonb(v_prospect.category)
    when 'lifestyle_themes' then v_prospect.lifestyle_themes
    when 'secondary_channels' then v_prospect.secondary_channels
    when 'retail_subchannels' then v_prospect.retail_subchannels
    when 'venue_contexts' then v_prospect.venue_contexts
    when 'retail_capabilities' then v_prospect.retail_capabilities
    else null
  end;

  if not public.account_research_json_values_equal(v_current, v_suggestion.baseline_value) then
    raise exception 'CANONICAL_VALUE_CHANGED';
  end if;

  if public.account_research_json_values_equal(v_current, v_suggestion.suggested_value) then
    update account_research_profile_suggestions
    set status = 'accepted', reviewed_by = v_actor, reviewed_at = now()
    where id = p_suggestion_id;
    return jsonb_build_object('ok', true, 'outcome', 'already_applied', 'suggestion_id', p_suggestion_id);
  end if;

  case v_suggestion.field_path
    when 'website' then
      update prospects set website = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'address' then
      update prospects set address = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'city' then
      update prospects set city = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'region' then
      update prospects set region = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'postal_code' then
      update prospects set postal_code = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'phone' then
      update prospects set phone = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'name' then
      update prospects set name = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'retail_category' then
      update prospects set retail_category = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'apparel_capability' then
      update prospects set apparel_capability = nullif(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'category' then
      update prospects set category = coalesce(v_suggestion.suggested_value #>> '{}', '') where id = v_prospect.id;
    when 'lifestyle_themes' then
      update prospects set lifestyle_themes = v_suggestion.suggested_value where id = v_prospect.id;
    when 'secondary_channels' then
      update prospects set secondary_channels = v_suggestion.suggested_value where id = v_prospect.id;
    when 'retail_subchannels' then
      update prospects set retail_subchannels = v_suggestion.suggested_value where id = v_prospect.id;
    when 'venue_contexts' then
      update prospects set venue_contexts = v_suggestion.suggested_value where id = v_prospect.id;
    when 'retail_capabilities' then
      update prospects set retail_capabilities = v_suggestion.suggested_value where id = v_prospect.id;
    else
      raise exception 'FORBIDDEN_FIELD';
  end case;

  select coalesce(jsonb_agg(c.source_url order by c.observed_at desc), '[]'::jsonb)
  into v_source_urls
  from account_research_suggestion_citations sc
  join account_research_citations c on c.id = sc.citation_id
  where sc.suggestion_id = p_suggestion_id;

  insert into retailer_field_changes (
    retailer_id,
    field_path,
    old_value,
    new_value,
    source,
    actor_id,
    status,
    confidence,
    provider,
    source_urls
  )
  values (
    v_suggestion.retailer_id,
    v_suggestion.field_path,
    v_suggestion.baseline_value,
    v_suggestion.suggested_value,
    'ai',
    v_actor,
    'applied',
    v_suggestion.confidence,
    'account_research',
    v_source_urls
  );

  update account_research_profile_suggestions
  set status = 'accepted', reviewed_by = v_actor, reviewed_at = now()
  where id = p_suggestion_id;

  return jsonb_build_object(
    'ok', true,
    'outcome', v_outcome,
    'suggestion_id', p_suggestion_id,
    'retailer_id', v_suggestion.retailer_id
  );
end;
$$;

create or replace function public.reject_account_research_profile_suggestion(
  p_suggestion_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_suggestion account_research_profile_suggestions%rowtype;
  v_actor uuid := auth.uid();
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  select * into v_suggestion
  from account_research_profile_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'Suggestion not found';
  end if;

  if v_suggestion.status = 'rejected' then
    return jsonb_build_object('ok', true, 'outcome', 'already_rejected', 'suggestion_id', p_suggestion_id);
  end if;

  if v_suggestion.status = 'accepted' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  if v_suggestion.status <> 'pending' then
    raise exception 'SUGGESTION_NOT_PENDING';
  end if;

  update account_research_profile_suggestions
  set status = 'rejected', reviewed_by = v_actor, reviewed_at = now()
  where id = p_suggestion_id;

  return jsonb_build_object('ok', true, 'outcome', 'rejected', 'suggestion_id', p_suggestion_id);
end;
$$;

revoke all on function public.persist_account_research_profile_suggestions(uuid, boolean, jsonb) from public;
grant execute on function public.persist_account_research_profile_suggestions(uuid, boolean, jsonb) to authenticated;

revoke all on function public.apply_account_research_profile_suggestion(uuid, boolean) from public;
grant execute on function public.apply_account_research_profile_suggestion(uuid, boolean) to authenticated;

revoke all on function public.reject_account_research_profile_suggestion(uuid) from public;
grant execute on function public.reject_account_research_profile_suggestion(uuid) to authenticated;
