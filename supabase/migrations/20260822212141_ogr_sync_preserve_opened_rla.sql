-- Preserve opened OGR RLA when prospects.account_status is still prospect (convert path).
-- Prevents commercial-field sync from demoting converted accounts back to prospect.

create or replace function public.ensure_ogr_retailer_line_account_from_prospect(p prospects)
returns uuid
language plpgsql
as $$
declare
  v_ogr_id uuid;
  v_ogr_status text;
  v_rla_id uuid;
  v_relationship text;
  v_relationship_to_apply text;
  v_terr_code text;
  v_slt_id uuid;
  v_review_reason text;
  v_existing retailer_line_accounts%rowtype;
begin
  select id, status into v_ogr_id, v_ogr_status
  from lines
  where code = 'ogr';

  if v_ogr_id is null or v_ogr_status <> 'active' then
    raise exception 'Phase 1C: lines.code = ogr missing or not active';
  end if;

  v_relationship := public.map_prospect_account_status_to_relationship(p.account_status);
  if v_relationship is null then
    raise exception 'Phase 1C: unsupported prospects.account_status %', p.account_status;
  end if;

  select rla.* into v_existing
  from retailer_line_accounts rla
  where rla.retailer_id = p.id
    and rla.sales_line_id = v_ogr_id
    and rla.relationship_status <> 'terminated'
  limit 1;

  if v_existing.id is not null then
    v_rla_id := v_existing.id;

    v_relationship_to_apply := v_relationship;
    if v_existing.relationship_status = 'opened' and p.account_status = 'prospect' then
      v_relationship_to_apply := 'opened';
    end if;

    if v_existing.relationship_status is distinct from v_relationship_to_apply
      or v_existing.converted_at is distinct from p.converted_at
      or v_existing.initial_order_date is distinct from p.initial_order_date
      or v_existing.notes is distinct from p.notes
      or v_existing.fit is distinct from p.fit
      or v_existing.fit_score is distinct from p.fit_score
      or v_existing.ideal_opening_units is distinct from p.ideal_opening_units
      or v_existing.priority is distinct from p.priority
      or v_existing.provisional_grade is distinct from p.provisional_grade
      or v_existing.verification_status is distinct from p.verification_status
      or v_existing.buyer_verified is distinct from p.buyer_verified
      or v_existing.apparel_capability is distinct from p.apparel_capability
      or v_existing.existing_ogr is distinct from p.existing_ogr
      or v_existing.qualification_status is distinct from p.qualification_status
      or v_existing.next_action is distinct from p.next_action
      or v_existing.source_note is distinct from p.source_note
      or v_existing.region is distinct from p.region
      or v_existing.primary_district is distinct from p.primary_district
      or v_existing.subterritory is distinct from p.subterritory
      or v_existing.secondary_channels is distinct from coalesce(p.secondary_channels, '[]'::jsonb)
      or v_existing.retail_subchannels is distinct from coalesce(p.retail_subchannels, '[]'::jsonb)
      or v_existing.venue_contexts is distinct from coalesce(p.venue_contexts, '[]'::jsonb)
      or v_existing.lifestyle_themes is distinct from coalesce(p.lifestyle_themes, '[]'::jsonb)
      or v_existing.retail_capabilities is distinct from coalesce(p.retail_capabilities, '[]'::jsonb)
    then
      update retailer_line_accounts rla
      set
        relationship_status = v_relationship_to_apply,
        converted_at = p.converted_at,
        initial_order_date = p.initial_order_date,
        notes = p.notes,
        fit = p.fit,
        fit_score = p.fit_score,
        ideal_opening_units = p.ideal_opening_units,
        priority = p.priority,
        provisional_grade = p.provisional_grade,
        verification_status = p.verification_status,
        buyer_verified = p.buyer_verified,
        apparel_capability = p.apparel_capability,
        existing_ogr = p.existing_ogr,
        qualification_status = p.qualification_status,
        next_action = p.next_action,
        source_note = p.source_note,
        region = p.region,
        primary_district = p.primary_district,
        subterritory = p.subterritory,
        secondary_channels = coalesce(p.secondary_channels, '[]'::jsonb),
        retail_subchannels = coalesce(p.retail_subchannels, '[]'::jsonb),
        venue_contexts = coalesce(p.venue_contexts, '[]'::jsonb),
        lifestyle_themes = coalesce(p.lifestyle_themes, '[]'::jsonb),
        retail_capabilities = coalesce(p.retail_capabilities, '[]'::jsonb)
      where rla.id = v_rla_id;
    end if;

    return v_rla_id;
  end if;

  select t.code into v_terr_code
  from territories t
  where t.id = p.territory_id;

  if v_terr_code = 'bc' then
    select slt.id into v_slt_id
    from sales_line_territories slt
    join territories t on t.id = slt.territory_id and t.code = 'bc'
    where slt.sales_line_id = v_ogr_id
      and slt.status = 'active'
    limit 1;
    v_review_reason := null;
  elsif v_terr_code in ('or', 'wa', 'ca', 'ab', 'norcal') then
    v_slt_id := null;
    v_review_reason := 'non_bc_territory';
  else
    v_slt_id := null;
    v_review_reason := 'ambiguous_territory';
  end if;

  insert into retailer_line_accounts (
    retailer_id,
    sales_line_id,
    relationship_status,
    converted_at,
    initial_order_date,
    notes,
    fit,
    fit_score,
    ideal_opening_units,
    priority,
    provisional_grade,
    verification_status,
    buyer_verified,
    apparel_capability,
    existing_ogr,
    qualification_status,
    next_action,
    source_note,
    region,
    primary_district,
    subterritory,
    secondary_channels,
    retail_subchannels,
    venue_contexts,
    lifestyle_themes,
    retail_capabilities,
    sales_line_territory_id,
    backfill_review_reason
  )
  values (
    p.id,
    v_ogr_id,
    v_relationship,
    p.converted_at,
    p.initial_order_date,
    p.notes,
    p.fit,
    p.fit_score,
    p.ideal_opening_units,
    p.priority,
    p.provisional_grade,
    p.verification_status,
    p.buyer_verified,
    p.apparel_capability,
    p.existing_ogr,
    p.qualification_status,
    p.next_action,
    p.source_note,
    p.region,
    p.primary_district,
    p.subterritory,
    coalesce(p.secondary_channels, '[]'::jsonb),
    coalesce(p.retail_subchannels, '[]'::jsonb),
    coalesce(p.venue_contexts, '[]'::jsonb),
    coalesce(p.lifestyle_themes, '[]'::jsonb),
    coalesce(p.retail_capabilities, '[]'::jsonb),
    v_slt_id,
    v_review_reason
  )
  returning id into v_rla_id;

  return v_rla_id;
end;
$$;
