-- Phase 1B: OGR backfill and validation only.
-- No dual-write. BC-only territory auto-assignment. Local-first.
-- Do not invent USD. Do not clone Eagle Peak / Big Fish / BKG / prospective accounts.
-- Preserve all existing IDs and legacy columns on prospects / orders / calls.

-- ─────────────────────────────────────────────────────────────────────────
-- Review-queue uniqueness for unresolved (entity_type, entity_id, reason)
-- ─────────────────────────────────────────────────────────────────────────

create unique index if not exists migration_review_queue_unresolved_entity_uidx
  on migration_review_queue (entity_type, entity_id, reason)
  where resolved_at is null;

-- ─────────────────────────────────────────────────────────────────────────
-- Preflight hard stops
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  non_ogr_order_count integer;
  non_ogr_call_count integer;
  sample_order_ids text;
  sample_call_ids text;
  ogr_id uuid;
  ogr_status text;
  ogr_bc_slt_id uuid;
  bad_rla_count integer;
  prospect_count_before integer;
  prospect_max_id_before integer;
begin
  select count(*) into non_ogr_order_count
  from orders o
  join lines l on l.id = o.line_id
  where l.code <> 'ogr';

  if non_ogr_order_count > 0 then
    select string_agg(o.id::text, ', ' order by o.id)
    into sample_order_ids
    from (
      select o.id
      from orders o
      join lines l on l.id = o.line_id
      where l.code <> 'ogr'
      limit 10
    ) o;
    raise exception
      'Phase 1B hard stop: % orders.line_id reference non-OGR lines (sample ids: %)',
      non_ogr_order_count,
      coalesce(sample_order_ids, '');
  end if;

  select count(*) into non_ogr_call_count
  from calls c
  join lines l on l.id = c.line_id
  where l.code <> 'ogr';

  if non_ogr_call_count > 0 then
    select string_agg(c.id::text, ', ' order by c.id)
    into sample_call_ids
    from (
      select c.id
      from calls c
      join lines l on l.id = c.line_id
      where l.code <> 'ogr'
      limit 10
    ) c;
    raise exception
      'Phase 1B hard stop: % calls.line_id reference non-OGR lines (sample ids: %)',
      non_ogr_call_count,
      coalesce(sample_call_ids, '');
  end if;

  select id, status into ogr_id, ogr_status
  from lines
  where code = 'ogr';

  if ogr_id is null then
    raise exception 'Phase 1B hard stop: lines.code = ogr is missing';
  end if;

  if ogr_status is distinct from 'active' then
    raise exception
      'Phase 1B hard stop: lines.code = ogr has status %, expected active',
      ogr_status;
  end if;

  select slt.id into ogr_bc_slt_id
  from sales_line_territories slt
  join territories t on t.id = slt.territory_id
  where slt.sales_line_id = ogr_id
    and t.code = 'bc'
    and slt.status = 'active'
  limit 1;

  if ogr_bc_slt_id is null then
    raise exception
      'Phase 1B hard stop: active OGR–BC sales_line_territories row is missing';
  end if;

  select count(*) into bad_rla_count
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id
  where l.code in ('eagle-peak', 'big-fish', 'bkg')
     or l.status = 'prospective';

  if bad_rla_count > 0 then
    raise exception
      'Phase 1B hard stop: % retailer_line_accounts exist for eagle-peak/big-fish/bkg/prospective lines',
      bad_rla_count;
  end if;

  select count(*), coalesce(max(id), 0)
  into prospect_count_before, prospect_max_id_before
  from prospects;

  perform set_config('app.phase1b_prospect_count', prospect_count_before::text, true);
  perform set_config('app.phase1b_prospect_max_id', prospect_max_id_before::text, true);

  raise notice
    'Phase 1B preflight OK: prospects=% max_id=% ogr=% ogr_bc_slt=%',
    prospect_count_before,
    prospect_max_id_before,
    ogr_id,
    ogr_bc_slt_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- Insert one OGR retailer_line_account per prospect (idempotent)
-- BC-only territory assignment; non-BC / ambiguous → NULL + review reason
-- ─────────────────────────────────────────────────────────────────────────

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
select
  p.id as retailer_id,
  ogr.id as sales_line_id,
  case
    when t.code = 'bc' then ogr_bc.id
    else null
  end as sales_line_territory_id,
  case p.account_status
    when 'prospect' then 'prospect'
    when 'active_account' then 'opened'
    when 'inactive' then 'inactive'
  end as relationship_status,
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
  case
    when t.code = 'bc' then null
    when t.code in ('or', 'wa', 'ca', 'ab', 'norcal') then 'non_bc_territory'
    else 'ambiguous_territory'
  end as backfill_review_reason
from prospects p
join lines ogr on ogr.code = 'ogr'
left join territories t on t.id = p.territory_id
left join sales_line_territories ogr_bc
  on ogr_bc.sales_line_id = ogr.id
 and ogr_bc.territory_id = t.id
 and t.code = 'bc'
 and ogr_bc.status = 'active'
where not exists (
  select 1
  from retailer_line_accounts rla
  where rla.retailer_id = p.id
    and rla.sales_line_id = ogr.id
    and rla.relationship_status <> 'terminated'
);

-- Queue non-BC / ambiguous territory line accounts
insert into migration_review_queue (entity_type, entity_id, reason, payload)
select
  'retailer_line_account',
  rla.id::text,
  rla.backfill_review_reason,
  jsonb_build_object(
    'retailer_id', rla.retailer_id,
    'sales_line_id', rla.sales_line_id,
    'territory_code', t.code,
    'phase', '1b'
  )
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
left join prospects p on p.id = rla.retailer_id
left join territories t on t.id = p.territory_id
where rla.backfill_review_reason in ('non_bc_territory', 'ambiguous_territory')
  and not exists (
    select 1
    from migration_review_queue q
    where q.entity_type = 'retailer_line_account'
      and q.entity_id = rla.id::text
      and q.reason = rla.backfill_review_reason
      and q.resolved_at is null
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Stamp operational retailer_line_account_id (idempotent: only where null)
-- ─────────────────────────────────────────────────────────────────────────

insert into retailer_line_contacts (
  retailer_line_account_id,
  account_contact_id,
  role,
  is_primary,
  notes
)
select
  rla.id,
  ac.id,
  ac.role,
  ac.is_primary,
  ac.notes
from account_contacts ac
join retailer_line_accounts rla
  on rla.retailer_id = ac.account_id
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
on conflict (retailer_line_account_id, account_contact_id) do nothing;

update orders o
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where o.account_id = rla.retailer_id
  and o.retailer_line_account_id is null;

update calls c
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
join prospects p on p.id = rla.retailer_id
where c.prospect_id = rla.retailer_id
  and c.retailer_line_account_id is null;

update system_messages sm
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where sm.prospect_id is not null
  and sm.prospect_id = rla.retailer_id
  and sm.retailer_line_account_id is null;

update account_reorder_settings ars
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where ars.account_id = rla.retailer_id
  and ars.retailer_line_account_id is null;

update gmail_thread_links g
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where g.prospect_id is not null
  and g.prospect_id = rla.retailer_id
  and g.retailer_line_account_id is null;

update calendar_event_links ce
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where ce.prospect_id is not null
  and ce.prospect_id = rla.retailer_id
  and ce.retailer_line_account_id is null;

update message_threads mt
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where mt.prospect_id is not null
  and mt.prospect_id = rla.retailer_id
  and mt.retailer_line_account_id is null;

update wholesale_order_requests wor
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where wor.prospect_id is not null
  and wor.prospect_id = rla.retailer_id
  and wor.retailer_line_account_id is null;

update account_conversion_attribution aca
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
where aca.prospect_id = rla.retailer_id
  and aca.retailer_line_account_id is null;

update prospect_updates pu
set retailer_line_account_id = rla.id
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
join prospects p on p.id = rla.retailer_id
where pu.prospect_id = rla.retailer_id
  and pu.retailer_line_account_id is null;

-- ─────────────────────────────────────────────────────────────────────────
-- Null line_id → OGR (safe after hard-stop); CAD legacy financial fill
-- ─────────────────────────────────────────────────────────────────────────

update orders o
set line_id = ogr.id
from lines ogr
where ogr.code = 'ogr'
  and o.line_id is null;

update calls c
set line_id = ogr.id
from lines ogr
where ogr.code = 'ogr'
  and c.line_id is null
  and exists (select 1 from prospects p where p.id = c.prospect_id);

update orders o
set
  original_amount = o.total_amount_cad,
  original_currency = 'CAD',
  exchange_rate = 1,
  exchange_rate_date = o.order_date,
  converted_amount = o.total_amount_cad,
  converted_currency = 'CAD',
  conversion_source = 'legacy_cad_column'
where o.conversion_source is null
   or o.original_currency is null;

update calls c
set
  order_value_original_amount = c.order_value_cad,
  order_value_original_currency = 'CAD',
  order_value_exchange_rate = 1,
  order_value_exchange_rate_date = c.call_date,
  order_value_converted_amount = c.order_value_cad,
  order_value_converted_currency = 'CAD',
  order_value_conversion_source = 'legacy_cad_column'
where c.order_value_cad is not null
  and (
    c.order_value_conversion_source is null
    or c.order_value_original_currency is null
  );

-- ─────────────────────────────────────────────────────────────────────────
-- Orphans — queue only; do not delete
-- ─────────────────────────────────────────────────────────────────────────

insert into migration_review_queue (entity_type, entity_id, reason, payload)
select
  'call',
  c.id::text,
  'orphan_call',
  jsonb_build_object(
    'prospect_id', c.prospect_id,
    'line_id', c.line_id,
    'phase', '1b'
  )
from calls c
left join prospects p on p.id = c.prospect_id
where p.id is null
  and not exists (
    select 1
    from migration_review_queue q
    where q.entity_type = 'call'
      and q.entity_id = c.id::text
      and q.reason = 'orphan_call'
      and q.resolved_at is null
  );

insert into migration_review_queue (entity_type, entity_id, reason, payload)
select
  'prospect_update',
  u.id::text,
  'orphan_prospect_update',
  jsonb_build_object(
    'prospect_id', u.prospect_id,
    'phase', '1b'
  )
from prospect_updates u
left join prospects p on p.id = u.prospect_id
where p.id is null
  and not exists (
    select 1
    from migration_review_queue q
    where q.entity_type = 'prospect_update'
      and q.entity_id = u.id::text
      and q.reason = 'orphan_prospect_update'
      and q.resolved_at is null
  );

-- ─────────────────────────────────────────────────────────────────────────
-- End-of-migration reconciliation asserts
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  prospect_count integer;
  prospect_max_id integer;
  prospect_count_before integer;
  prospect_max_id_before integer;
  ogr_account_count integer;
  bad_rla_count integer;
  target_count integer;
  ogr_slt_codes text[];
  orders_missing_rla integer;
  non_ogr_stamped_line integer;
  bad_finance_count integer;
  bc_missing_slt integer;
  non_bc_with_slt integer;
  non_bc_without_queue integer;
  orphan_calls integer;
  orphan_updates integer;
  queued_orphan_calls integer;
  queued_orphan_updates integer;
begin
  prospect_count_before := nullif(current_setting('app.phase1b_prospect_count', true), '')::integer;
  prospect_max_id_before := nullif(current_setting('app.phase1b_prospect_max_id', true), '')::integer;

  select count(*), coalesce(max(id), 0)
  into prospect_count, prospect_max_id
  from prospects;

  if prospect_count_before is not null and prospect_count <> prospect_count_before then
    raise exception
      'Phase 1B assert failed: prospects count changed (% → %)',
      prospect_count_before,
      prospect_count;
  end if;

  if prospect_max_id_before is not null and prospect_max_id <> prospect_max_id_before then
    raise exception
      'Phase 1B assert failed: prospects max(id) changed (% → %)',
      prospect_max_id_before,
      prospect_max_id;
  end if;

  select count(*) into ogr_account_count
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id
  where l.code = 'ogr';

  if ogr_account_count <> prospect_count then
    raise exception
      'Phase 1B assert failed: OGR retailer_line_accounts (%) <> prospects (%)',
      ogr_account_count,
      prospect_count;
  end if;

  select count(*) into bad_rla_count
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id
  where l.code in ('eagle-peak', 'big-fish', 'bkg')
     or l.status = 'prospective';

  if bad_rla_count <> 0 then
    raise exception
      'Phase 1B assert failed: % non-OGR/prospective retailer_line_accounts exist',
      bad_rla_count;
  end if;

  select count(*) into target_count from retailer_line_targets;
  if target_count <> 0 then
    raise exception
      'Phase 1B assert failed: retailer_line_targets count is %, expected 0',
      target_count;
  end if;

  select array_agg(t.code order by t.code) into ogr_slt_codes
  from sales_line_territories slt
  join lines l on l.id = slt.sales_line_id
  join territories t on t.id = slt.territory_id
  where l.code = 'ogr'
    and slt.status = 'active';

  if ogr_slt_codes is distinct from array['bc', 'or', 'wa']::text[] then
    raise exception
      'Phase 1B assert failed: OGR active SLT codes are %, expected {bc,or,wa}',
      ogr_slt_codes;
  end if;

  if exists (
    select 1
    from sales_line_territories slt
    join lines l on l.id = slt.sales_line_id
    where l.code = 'ogr'
      and slt.rights_type is distinct from 'unconfirmed'
  ) then
    raise exception
      'Phase 1B assert failed: OGR sales_line_territories rights_type is not all unconfirmed';
  end if;

  select count(*) into orders_missing_rla
  from orders o
  where o.retailer_line_account_id is null;

  if orders_missing_rla <> 0 then
    raise exception
      'Phase 1B assert failed: % orders missing retailer_line_account_id',
      orders_missing_rla;
  end if;

  select count(*) into non_ogr_stamped_line
  from (
    select o.line_id
    from orders o
    where o.line_id is not null
    union all
    select c.line_id
    from calls c
    join prospects p on p.id = c.prospect_id
    where c.line_id is not null
  ) stamped
  join lines l on l.id = stamped.line_id
  where l.code <> 'ogr';

  if non_ogr_stamped_line <> 0 then
    raise exception
      'Phase 1B assert failed: % stamped order/call line_id values are non-OGR',
      non_ogr_stamped_line;
  end if;

  select count(*) into bad_finance_count
  from orders o
  where o.conversion_source = 'legacy_cad_column'
    and (
      o.original_currency is distinct from 'CAD'
      or o.converted_currency is distinct from 'CAD'
      or o.exchange_rate is distinct from 1
      or o.original_amount is distinct from o.total_amount_cad
      or o.converted_amount is distinct from o.total_amount_cad
    );

  if bad_finance_count <> 0 then
    raise exception
      'Phase 1B assert failed: % orders have invalid legacy_cad_column finance fields',
      bad_finance_count;
  end if;

  select count(*) into bc_missing_slt
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  join prospects p on p.id = rla.retailer_id
  join territories t on t.id = p.territory_id and t.code = 'bc'
  where rla.sales_line_territory_id is null;

  if bc_missing_slt <> 0 then
    raise exception
      'Phase 1B assert failed: % BC OGR accounts missing sales_line_territory_id',
      bc_missing_slt;
  end if;

  select count(*) into non_bc_with_slt
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  join prospects p on p.id = rla.retailer_id
  left join territories t on t.id = p.territory_id
  where coalesce(t.code, '') is distinct from 'bc'
    and rla.sales_line_territory_id is not null;

  if non_bc_with_slt <> 0 then
    raise exception
      'Phase 1B assert failed: % non-BC OGR accounts incorrectly have sales_line_territory_id',
      non_bc_with_slt;
  end if;

  select count(*) into non_bc_without_queue
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  join prospects p on p.id = rla.retailer_id
  left join territories t on t.id = p.territory_id
  where coalesce(t.code, '') is distinct from 'bc'
    and not exists (
      select 1
      from migration_review_queue q
      where q.entity_type = 'retailer_line_account'
        and q.entity_id = rla.id::text
        and q.reason in ('non_bc_territory', 'ambiguous_territory')
        and q.resolved_at is null
    );

  if non_bc_without_queue <> 0 then
    raise exception
      'Phase 1B assert failed: % non-BC OGR accounts lack unresolved review-queue rows',
      non_bc_without_queue;
  end if;

  select count(*) into orphan_calls
  from calls c
  left join prospects p on p.id = c.prospect_id
  where p.id is null;

  select count(*) into queued_orphan_calls
  from migration_review_queue q
  where q.entity_type = 'call'
    and q.reason = 'orphan_call'
    and q.resolved_at is null;

  if orphan_calls <> queued_orphan_calls then
    raise exception
      'Phase 1B assert failed: orphan calls (%) <> queued orphan_call rows (%)',
      orphan_calls,
      queued_orphan_calls;
  end if;

  select count(*) into orphan_updates
  from prospect_updates u
  left join prospects p on p.id = u.prospect_id
  where p.id is null;

  select count(*) into queued_orphan_updates
  from migration_review_queue q
  where q.entity_type = 'prospect_update'
    and q.reason = 'orphan_prospect_update'
    and q.resolved_at is null;

  if orphan_updates <> queued_orphan_updates then
    raise exception
      'Phase 1B assert failed: orphan prospect_updates (%) <> queued rows (%)',
      orphan_updates,
      queued_orphan_updates;
  end if;

  raise notice
    'Phase 1B asserts OK: prospects=% ogr_accounts=%',
    prospect_count,
    ogr_account_count;
end;
$$;
