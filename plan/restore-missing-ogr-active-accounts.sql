-- Restore 2 missing OGR Active Accounts from Aug 19 bulk import (rows 3 and 10).
-- Run on hosted project mqsyqxnzpncwdrnugytf after migration 20260822212141_ogr_sync_preserve_opened_rla.
--
-- Spirit Mountain duplicate cleanup (2026-08-22):
--   prospects 629 vs 631 — keep 629 (2 contacts, earlier created_at); delete 631 (0 contacts).
--
-- Requires approved owner session for commit_account_import_row (is_approved_owner()).
-- Service-role / postgres without auth.uid(): set owner JWT at top of transaction:
--   select set_config('request.jwt.claim.sub', '<approved-owner-uuid>', true);

begin;

select set_config('request.jwt.claim.sub', '1e8752d7-e5d3-4fbd-95df-b1168189ea4f', true);

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $$
declare
  v_active int;
  v_opened int;
begin
  select count(*) into v_active from prospects where account_status = 'active_account';
  select count(*) into v_opened
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  where rla.relationship_status = 'opened';

  if v_active <> 16 or v_opened <> 16 then
    raise exception 'Preflight failed: expected 16 active_account and 16 opened OGR RLA (got % / %)', v_active, v_opened;
  end if;

  if not exists (
    select 1 from account_import_rows
    where id = '8244bc4b-87eb-4a02-82aa-461680c46c55'
      and status = 'skipped'
      and match_decision = 'needs_review'
  ) then
    raise exception 'Preflight failed: Spirit Mountain import row not in expected skipped state';
  end if;

  if not exists (
    select 1 from account_import_rows
    where id = '46c0f6d6-2823-4f7e-a0e1-255f5a59cbf8'
      and status = 'skipped'
      and match_decision = 'needs_review'
  ) then
    raise exception 'Preflight failed: Farm House Funk import row not in expected skipped state';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2a. Spirit Mountain duplicate cleanup — keep 629, remove 631
-- ---------------------------------------------------------------------------
delete from prospects where id = 631;

-- ---------------------------------------------------------------------------
-- 2b. Spirit Mountain — link import row to prospect 629
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  '8244bc4b-87eb-4a02-82aa-461680c46c55'::uuid,
  jsonb_build_object(
    'action', 'link_existing',
    'retailer_id', 629,
    'prospect_patch', null,
    'rla_patch', jsonb_build_object(
      'relationship_status', 'opened',
      'line_account_markers', jsonb_build_array('historical_purchaser', 'reactivation_candidate'),
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import historical_customer batch fc4a28ff-231f-4568-a00e-c5821db43588 from OGR Washington and Oregon acounts.xlsx. Former rep: CD.',
      'sales_line_territory_id', null,
      'backfill_review_reason', 'territory_assignment_missing',
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR customer in OGR Washington and Oregon acounts.xlsx. Former rep code: CD. Shipping address from file. No purchase date or order value was supplied. Inference: Treat as dormant reactivation candidate until a qualifying order is logged. Do not assume current buyer, phone, or website.'
    ),
    'contact', null,
    'field_changes', '[]'::jsonb,
    'final_status', 'linked'
  )
);

-- link_existing does not set prospects.account_status; align with other historical imports.
update prospects
set
  account_status = 'active_account',
  existing_ogr = 'yes',
  qualification_status = 'reactivation',
  import_protected = true,
  source_note = 'Import historical_customer batch fc4a28ff-231f-4568-a00e-c5821db43588 from OGR Washington and Oregon acounts.xlsx. Former rep: CD.'
where id = 629;

-- ---------------------------------------------------------------------------
-- 2c. Farm House Funk — create_retailer
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  '46c0f6d6-2823-4f7e-a0e1-255f5a59cbf8'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'FARM HOUSE FUNK',
      'category', 'other',
      'region', 'Oregon',
      'city', 'ASTORIA',
      'address', '35408 HWY101 BUSINESS, ASTORIA, OR 97103',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import historical_customer batch fc4a28ff-231f-4568-a00e-c5821db43588 from OGR Washington and Oregon acounts.xlsx. Former rep: KW.',
      'notes', 'Sourced: Listed as a verified past OGR customer in OGR Washington and Oregon acounts.xlsx. Former rep code: KW. Shipping address from file. No purchase date or order value was supplied. Inference: Treat as dormant reactivation candidate until a qualifying order is logged. Do not assume current buyer, phone, or website.',
      'website', null,
      'retail_category', null,
      'postal_code', '97103',
      'territory_id', 'b7800efa-1fda-4234-99f2-9c86a59ece3e',
      'primary_district', null,
      'subterritory', null,
      'external_id', null
    ),
    'prospect_patch', null,
    'rla_patch', jsonb_build_object(
      'relationship_status', 'opened',
      'line_account_markers', jsonb_build_array('historical_purchaser', 'reactivation_candidate'),
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import historical_customer batch fc4a28ff-231f-4568-a00e-c5821db43588 from OGR Washington and Oregon acounts.xlsx. Former rep: KW.',
      'sales_line_territory_id', null,
      'backfill_review_reason', 'territory_assignment_missing',
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR customer in OGR Washington and Oregon acounts.xlsx. Former rep code: KW. Shipping address from file. No purchase date or order value was supplied. Inference: Treat as dormant reactivation candidate until a qualifying order is logged. Do not assume current buyer, phone, or website.'
    ),
    'contact', null,
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'FARM HOUSE FUNK'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'ASTORIA'),
      jsonb_build_object('field_path', 'address', 'old_value', null, 'new_value', '35408 HWY101 BUSINESS, ASTORIA, OR 97103'),
      jsonb_build_object('field_path', 'postal_code', 'old_value', null, 'new_value', '97103')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Postflight
-- ---------------------------------------------------------------------------
do $$
declare
  v_active int;
  v_opened int;
begin
  select count(*) into v_active from prospects where account_status = 'active_account';
  select count(*) into v_opened
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id and l.code = 'ogr'
  where rla.relationship_status = 'opened';

  if v_active <> 18 or v_opened <> 18 then
    raise exception 'Postflight failed: expected 18 active_account and 18 opened OGR RLA (got % / %)', v_active, v_opened;
  end if;
end $$;

commit;

-- ---------------------------------------------------------------------------
-- Optional: re-open BuddyBubble (628) if manually converted then demoted
-- ---------------------------------------------------------------------------
-- update retailer_line_accounts rla
-- set relationship_status = 'opened', converted_at = now()
-- from lines l
-- where rla.retailer_id = 628
--   and rla.sales_line_id = l.id
--   and l.code = 'ogr';
