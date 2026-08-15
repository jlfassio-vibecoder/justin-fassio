-- Phase 1C: Temporary OGR dual-write compatibility only.
-- One-way: prospects / account_contacts / operational inserts → OGR line accounts.
-- No UI/API cutover. No Eagle Peak / Big Fish / BKG / prospective accounts.
-- No reverse sync (RLA → prospects). Local-first. Preserve IDs and legacy columns.
-- Contact sync: AFTER INSERT OR UPDATE (role / is_primary / notes when distinct).

-- ─────────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.ogr_retailer_line_account_id_for_retailer(p_retailer_id integer)
returns uuid
language sql
stable
as $$
  select rla.id
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  where rla.retailer_id = p_retailer_id
    and rla.relationship_status <> 'terminated'
  limit 1;
$$;

create or replace function public.map_prospect_account_status_to_relationship(p_status text)
returns text
language sql
immutable
as $$
  select case p_status
    when 'prospect' then 'prospect'
    when 'active_account' then 'opened'
    when 'inactive' then 'inactive'
    else null
  end;
$$;

-- Ensure/upsert OGR retailer_line_account from a prospects row.
-- Territory assigned only on INSERT (BC-only). Updates never change sales_line_territory_id.
create or replace function public.ensure_ogr_retailer_line_account_from_prospect(p prospects)
returns uuid
language plpgsql
as $$
declare
  v_ogr_id uuid;
  v_ogr_status text;
  v_rla_id uuid;
  v_relationship text;
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

    if v_existing.relationship_status is distinct from v_relationship
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
        relationship_status = v_relationship,
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
      -- Do not touch sales_line_territory_id / retailer_id / sales_line_id.
    end if;

    return v_rla_id;
  end if;

  -- INSERT path: BC-only territory assignment
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
    sales_line_territory_id,
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
    backfill_review_reason
  )
  values (
    p.id,
    v_ogr_id,
    v_slt_id,
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
    v_review_reason
  )
  returning id into v_rla_id;

  if v_review_reason is not null then
    insert into migration_review_queue (entity_type, entity_id, reason, payload)
    select
      'retailer_line_account',
      v_rla_id::text,
      v_review_reason,
      jsonb_build_object(
        'retailer_id', p.id,
        'sales_line_id', v_ogr_id,
        'territory_code', v_terr_code,
        'phase', '1c'
      )
    where not exists (
      select 1
      from migration_review_queue q
      where q.entity_type = 'retailer_line_account'
        and q.entity_id = v_rla_id::text
        and q.reason = v_review_reason
        and q.resolved_at is null
    );
  end if;

  return v_rla_id;
end;
$$;

-- Resolve or ensure OGR RLA for a retailer id (prospect must exist).
create or replace function public.ensure_ogr_retailer_line_account_for_retailer_id(p_retailer_id integer)
returns uuid
language plpgsql
as $$
declare
  v_prospect prospects%rowtype;
  v_rla_id uuid;
begin
  if p_retailer_id is null then
    return null;
  end if;

  v_rla_id := public.ogr_retailer_line_account_id_for_retailer(p_retailer_id);
  if v_rla_id is not null then
    return v_rla_id;
  end if;

  select * into v_prospect from prospects where id = p_retailer_id;
  if not found then
    return null;
  end if;

  return public.ensure_ogr_retailer_line_account_from_prospect(v_prospect);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- prospects → OGR retailer_line_accounts
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.sync_ogr_retailer_line_account_from_prospect()
returns trigger
language plpgsql
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.ensure_ogr_retailer_line_account_from_prospect(new);
  return new;
end;
$$;

drop trigger if exists prospects_sync_ogr_retailer_line_account_ins on prospects;
create trigger prospects_sync_ogr_retailer_line_account_ins
  after insert on prospects
  for each row
  execute function public.sync_ogr_retailer_line_account_from_prospect();

drop trigger if exists prospects_sync_ogr_retailer_line_account_upd on prospects;
create trigger prospects_sync_ogr_retailer_line_account_upd
  after update on prospects
  for each row
  when (
    new.account_status is distinct from old.account_status
    or new.converted_at is distinct from old.converted_at
    or new.initial_order_date is distinct from old.initial_order_date
    or new.notes is distinct from old.notes
    or new.fit is distinct from old.fit
    or new.fit_score is distinct from old.fit_score
    or new.ideal_opening_units is distinct from old.ideal_opening_units
    or new.priority is distinct from old.priority
    or new.provisional_grade is distinct from old.provisional_grade
    or new.verification_status is distinct from old.verification_status
    or new.buyer_verified is distinct from old.buyer_verified
    or new.apparel_capability is distinct from old.apparel_capability
    or new.existing_ogr is distinct from old.existing_ogr
    or new.qualification_status is distinct from old.qualification_status
    or new.next_action is distinct from old.next_action
    or new.source_note is distinct from old.source_note
    or new.region is distinct from old.region
    or new.primary_district is distinct from old.primary_district
    or new.subterritory is distinct from old.subterritory
    or new.secondary_channels is distinct from old.secondary_channels
    or new.retail_subchannels is distinct from old.retail_subchannels
    or new.venue_contexts is distinct from old.venue_contexts
    or new.lifestyle_themes is distinct from old.lifestyle_themes
    or new.retail_capabilities is distinct from old.retail_capabilities
  )
  execute function public.sync_ogr_retailer_line_account_from_prospect();

-- ─────────────────────────────────────────────────────────────────────────
-- account_contacts → OGR retailer_line_contacts (INSERT OR UPDATE)
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.sync_ogr_retailer_line_contact_from_account_contact()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_existing retailer_line_contacts%rowtype;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.role is not distinct from old.role
    and new.is_primary is not distinct from old.is_primary
    and new.notes is not distinct from old.notes
    and new.account_id is not distinct from old.account_id
  then
    return new;
  end if;

  v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.account_id);
  if v_rla_id is null then
    return new;
  end if;

  select * into v_existing
  from retailer_line_contacts rlc
  where rlc.retailer_line_account_id = v_rla_id
    and rlc.account_contact_id = new.id;

  if not found then
    if new.is_primary then
      update retailer_line_contacts
      set is_primary = false
      where retailer_line_account_id = v_rla_id
        and is_primary;
    end if;

    insert into retailer_line_contacts (
      retailer_line_account_id,
      account_contact_id,
      role,
      is_primary,
      notes
    )
    values (
      v_rla_id,
      new.id,
      new.role,
      new.is_primary,
      new.notes
    )
    on conflict (retailer_line_account_id, account_contact_id) do nothing;

    return new;
  end if;

  -- UPDATE path: sync role / is_primary / notes only when distinct
  if v_existing.role is not distinct from new.role
    and v_existing.is_primary is not distinct from new.is_primary
    and v_existing.notes is not distinct from new.notes
  then
    return new;
  end if;

  if new.is_primary and not v_existing.is_primary then
    update retailer_line_contacts
    set is_primary = false
    where retailer_line_account_id = v_rla_id
      and account_contact_id is distinct from new.id
      and is_primary;
  end if;

  update retailer_line_contacts
  set
    role = new.role,
    is_primary = new.is_primary,
    notes = new.notes
  where retailer_line_account_id = v_rla_id
    and account_contact_id = new.id
    and (
      role is distinct from new.role
      or is_primary is distinct from new.is_primary
      or notes is distinct from new.notes
    );

  return new;
end;
$$;

drop trigger if exists account_contacts_sync_ogr_retailer_line_contact on account_contacts;
create trigger account_contacts_sync_ogr_retailer_line_contact
  after insert or update on account_contacts
  for each row
  execute function public.sync_ogr_retailer_line_contact_from_account_contact();

-- ─────────────────────────────────────────────────────────────────────────
-- BEFORE INSERT fillers — orders, calls, peers
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.assert_line_id_is_ogr_or_null(p_line_id uuid)
returns void
language plpgsql
as $$
declare
  v_code text;
begin
  if p_line_id is null then
    return;
  end if;

  select code into v_code from lines where id = p_line_id;
  if v_code is distinct from 'ogr' then
    raise exception 'Phase 1C: line_id % is not OGR (code %)', p_line_id, coalesce(v_code, 'missing');
  end if;
end;
$$;

create or replace function public.ogr_line_id()
returns uuid
language sql
stable
as $$
  select id from lines where code = 'ogr' and status = 'active' limit 1;
$$;

create or replace function public.fill_ogr_retailer_line_account_on_order()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_ogr_line uuid;
begin
  perform public.assert_line_id_is_ogr_or_null(new.line_id);

  if new.retailer_line_account_id is null and new.account_id is not null then
    v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.account_id);
    if v_rla_id is not null then
      new.retailer_line_account_id := v_rla_id;
    end if;
  end if;

  if new.line_id is null then
    v_ogr_line := public.ogr_line_id();
    if v_ogr_line is not null then
      new.line_id := v_ogr_line;
    end if;
  end if;

  if new.conversion_source is null or new.original_currency is null then
    new.original_amount := new.total_amount_cad;
    new.original_currency := 'CAD';
    new.exchange_rate := 1;
    new.exchange_rate_date := new.order_date;
    new.converted_amount := new.total_amount_cad;
    new.converted_currency := 'CAD';
    new.conversion_source := 'legacy_cad_column';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_fill_ogr_retailer_line_account on orders;
create trigger orders_fill_ogr_retailer_line_account
  before insert on orders
  for each row
  execute function public.fill_ogr_retailer_line_account_on_order();

create or replace function public.fill_ogr_retailer_line_account_on_call()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_ogr_line uuid;
  v_exists boolean;
begin
  perform public.assert_line_id_is_ogr_or_null(new.line_id);

  select exists(select 1 from prospects p where p.id = new.prospect_id)
  into v_exists;

  if not v_exists then
    -- Orphan call: leave line_id / RLA null; do not invent OGR.
    return new;
  end if;

  if new.retailer_line_account_id is null then
    v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.prospect_id);
    if v_rla_id is not null then
      new.retailer_line_account_id := v_rla_id;
    end if;
  end if;

  if new.line_id is null then
    v_ogr_line := public.ogr_line_id();
    if v_ogr_line is not null then
      new.line_id := v_ogr_line;
    end if;
  end if;

  if new.order_value_cad is not null
    and (new.order_value_conversion_source is null or new.order_value_original_currency is null)
  then
    new.order_value_original_amount := new.order_value_cad;
    new.order_value_original_currency := 'CAD';
    new.order_value_exchange_rate := 1;
    new.order_value_exchange_rate_date := new.call_date;
    new.order_value_converted_amount := new.order_value_cad;
    new.order_value_converted_currency := 'CAD';
    new.order_value_conversion_source := 'legacy_cad_column';
  end if;

  return new;
end;
$$;

drop trigger if exists calls_fill_ogr_retailer_line_account on calls;
create trigger calls_fill_ogr_retailer_line_account
  before insert on calls
  for each row
  execute function public.fill_ogr_retailer_line_account_on_call();

-- Shared non-trigger helpers used by peer BEFORE INSERT fillers.
create or replace function public.stamp_new_ogr_rla_from_prospect_id()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
begin
  if new.retailer_line_account_id is not null or new.prospect_id is null then
    return new;
  end if;
  v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.prospect_id);
  if v_rla_id is not null then
    new.retailer_line_account_id := v_rla_id;
  end if;
  return new;
end;
$$;

create or replace function public.stamp_new_ogr_rla_from_account_id()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
begin
  if new.retailer_line_account_id is not null or new.account_id is null then
    return new;
  end if;
  v_rla_id := public.ensure_ogr_retailer_line_account_for_retailer_id(new.account_id);
  if v_rla_id is not null then
    new.retailer_line_account_id := v_rla_id;
  end if;
  return new;
end;
$$;

-- Peer fillers (prospect_id) — shared stamper (NEW in scope).
-- Executable-plan §4.4 names map to stamp_new_ogr_rla_from_prospect_id /
-- stamp_new_ogr_rla_from_account_id (one body each; avoid broken trigger-fn wrappers).
drop trigger if exists system_messages_fill_ogr_retailer_line_account on system_messages;
create trigger system_messages_fill_ogr_retailer_line_account
  before insert on system_messages
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists gmail_thread_links_fill_ogr_retailer_line_account on gmail_thread_links;
create trigger gmail_thread_links_fill_ogr_retailer_line_account
  before insert on gmail_thread_links
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists calendar_event_links_fill_ogr_retailer_line_account on calendar_event_links;
create trigger calendar_event_links_fill_ogr_retailer_line_account
  before insert on calendar_event_links
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists message_threads_fill_ogr_retailer_line_account on message_threads;
create trigger message_threads_fill_ogr_retailer_line_account
  before insert on message_threads
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists wholesale_order_requests_fill_ogr_retailer_line_account on wholesale_order_requests;
create trigger wholesale_order_requests_fill_ogr_retailer_line_account
  before insert on wholesale_order_requests
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists account_conversion_attribution_fill_ogr_retailer_line_account on account_conversion_attribution;
create trigger account_conversion_attribution_fill_ogr_retailer_line_account
  before insert on account_conversion_attribution
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

drop trigger if exists prospect_updates_fill_ogr_retailer_line_account on prospect_updates;
create trigger prospect_updates_fill_ogr_retailer_line_account
  before insert on prospect_updates
  for each row
  execute function public.stamp_new_ogr_rla_from_prospect_id();

-- Peer filler (account_id)
drop trigger if exists account_reorder_settings_fill_ogr_retailer_line_account on account_reorder_settings;
create trigger account_reorder_settings_fill_ogr_retailer_line_account
  before insert on account_reorder_settings
  for each row
  execute function public.stamp_new_ogr_rla_from_account_id();

-- ─────────────────────────────────────────────────────────────────────────
-- Assert 1C dual-write objects exist (no data mutation)
-- ─────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regprocedure('public.sync_ogr_retailer_line_account_from_prospect()') is null then
    raise exception 'Phase 1C assert failed: sync_ogr_retailer_line_account_from_prospect missing';
  end if;
  if to_regprocedure('public.sync_ogr_retailer_line_contact_from_account_contact()') is null then
    raise exception 'Phase 1C assert failed: sync_ogr_retailer_line_contact_from_account_contact missing';
  end if;
  if to_regprocedure('public.fill_ogr_retailer_line_account_on_order()') is null then
    raise exception 'Phase 1C assert failed: fill_ogr_retailer_line_account_on_order missing';
  end if;
  if to_regprocedure('public.fill_ogr_retailer_line_account_on_call()') is null then
    raise exception 'Phase 1C assert failed: fill_ogr_retailer_line_account_on_call missing';
  end if;
  if to_regprocedure('public.ogr_retailer_line_account_id_for_retailer(integer)') is null then
    raise exception 'Phase 1C assert failed: ogr_retailer_line_account_id_for_retailer missing';
  end if;
end;
$$;
