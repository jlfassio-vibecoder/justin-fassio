-- Account Research PR4: persist product match run RPC (items + citation junctions).
-- SECURITY INVOKER; staff-only via is_approved_staff(). Caller JWT + RLS.

create or replace function public.persist_account_product_match_run(
  p_retailer_id integer,
  p_sales_line_id uuid,
  p_research_run_id uuid,
  p_status text,
  p_empty_reason text default null,
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run account_research_runs%rowtype;
  v_match_run_id uuid;
  v_item jsonb;
  v_match_item_id uuid;
  v_citation_id uuid;
  v_citation_ids jsonb;
  v_catalog_item_id uuid;
  v_rank smallint;
  v_item_count integer := 0;
begin
  if not public.is_approved_staff() then
    raise exception 'Forbidden';
  end if;

  if p_status not in ('succeeded', 'empty', 'failed', 'stale_research') then
    raise exception 'INVALID_STATUS';
  end if;

  if p_status = 'empty' and p_empty_reason is null then
    raise exception 'EMPTY_REASON_REQUIRED';
  end if;

  if p_status <> 'empty' and p_empty_reason is not null then
    raise exception 'EMPTY_REASON_NOT_ALLOWED';
  end if;

  select * into v_run
  from account_research_runs
  where id = p_research_run_id and retailer_id = p_retailer_id;

  if not found then
    raise exception 'Run not found';
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid items payload';
  end if;

  if p_status = 'succeeded' then
    if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 3 then
      raise exception 'INVALID_ITEMS';
    end if;
  elsif jsonb_array_length(p_items) <> 0 then
    raise exception 'INVALID_ITEMS';
  end if;

  insert into account_product_match_runs (
    retailer_id,
    sales_line_id,
    research_run_id,
    status,
    empty_reason,
    requested_by,
    started_at,
    completed_at
  )
  values (
    p_retailer_id,
    p_sales_line_id,
    p_research_run_id,
    p_status,
    p_empty_reason,
    auth.uid(),
    now(),
    now()
  )
  returning id into v_match_run_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_catalog_item_id := (v_item->>'catalog_item_id')::uuid;
    v_rank := (v_item->>'rank')::smallint;

    if v_catalog_item_id is null or v_rank is null or v_rank < 1 or v_rank > 3 then
      raise exception 'INVALID_ITEMS';
    end if;

    if v_item->>'rationale' is null or length(trim(v_item->>'rationale')) = 0 then
      raise exception 'INVALID_ITEMS';
    end if;

    if v_item->>'product_fit' not in ('channel_intersect', 'global_fallback') then
      raise exception 'INVALID_ITEMS';
    end if;

    if not exists (
      select 1 from catalog_items ci
      where ci.id = v_catalog_item_id and ci.line_id = p_sales_line_id
    ) then
      raise exception 'INVALID_CATALOG_ITEM';
    end if;

    v_citation_ids := coalesce(v_item->'citation_ids', '[]'::jsonb);
    if jsonb_typeof(v_citation_ids) <> 'array' or jsonb_array_length(v_citation_ids) < 1 then
      raise exception 'INVALID_CITATIONS';
    end if;

    insert into account_product_match_items (
      match_run_id,
      catalog_item_id,
      rank,
      rationale,
      product_fit
    )
    values (
      v_match_run_id,
      v_catalog_item_id,
      v_rank,
      left(trim(v_item->>'rationale'), 500),
      v_item->>'product_fit'
    )
    returning id into v_match_item_id;

    begin
      for v_citation_id in
        select (jsonb_array_elements_text(v_citation_ids))::uuid
      loop
        if not exists (
          select 1 from account_research_citations c
          where c.id = v_citation_id
            and c.research_run_id = p_research_run_id
            and c.retailer_id = p_retailer_id
            and c.acceptance_status = 'accepted'
            and c.source_url is not null
            and length(trim(c.source_url)) > 0
        ) then
          raise exception 'INVALID_CITATIONS';
        end if;

        insert into account_product_match_item_citations (
          match_item_id, citation_id, research_run_id
        )
        values (v_match_item_id, v_citation_id, p_research_run_id)
        on conflict do nothing;
      end loop;
    exception
      when invalid_text_representation then
        raise exception 'INVALID_CITATIONS';
    end;

    v_item_count := v_item_count + 1;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'match_run_id', v_match_run_id,
    'item_count', v_item_count
  );
end;
$$;

revoke all on function public.persist_account_product_match_run(integer, uuid, uuid, text, text, jsonb) from public;
grant execute on function public.persist_account_product_match_run(integer, uuid, uuid, text, text, jsonb) to authenticated;
