-- Import 7 WA & OR Faire purchaser accounts into OGR Active Accounts.
-- Source: docs/account-import/faire/Wa-Oregon-Faire-Accounts.xlsx
-- Source type: faire_customer → account_status=active_account, RLA opened,
--   markers: historical_purchaser + reactivation_candidate, existing_ogr=yes
--
-- Requires approved owner session for commit_account_import_row (is_approved_owner()).
-- Set the owner JWT context before running:
--   select set_config('request.jwt.claim.sub', '1e8752d7-e5d3-4fbd-95df-b1168189ea4f', true);
--
-- Row data from Wa-Oregon-Faire-Accounts.xlsx (all 7 are create_retailer):
--   1. Checkerberry's Flowers & Gifts — 169 North 2nd Street, Coos Bay, OR 97420 — contact: beth clarkson
--   2. Blue Door Boutique — 144 Southeast G Street, Grants Pass, OR 97526 — contact: Jen Michael
--   3. Windy Woman Inc — Newport, OR (no street/ZIP) — contact: Ashley Bixler, childishtendenciesnewport@gmail.com
--   4. Alley Cat Antiques — 208 Commercial Avenue, Anacortes, WA 98221 — contact: Lea Mayberry
--   5. Beachside Gifts — 18937 Front Street Northeast, Poulsbo, WA 98370 — contact: Lori Simnioniw
--   6. Forget Me Not — 173 S. Main, Colville, WA 99114 — contact: Candice Gessel
--   7. Ts tallow and teas — 619 Commercial Avenue, Anacortes, WA 98221 — contact: Tresa Akers
--
-- Expected post-state: 25 active_account (was 18), 24 OGR opened RLA (was 17).

begin;

-- ---------------------------------------------------------------------------
-- Set owner JWT context (approved owner profile id)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '1e8752d7-e5d3-4fbd-95df-b1168189ea4f', true);

do $$
begin
  if not public.is_approved_owner() then
    raise exception 'request.jwt.claim.sub must be an approved owner profile id';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------
do $$
declare
  v_active int;
begin
  select count(*) into v_active from prospects where account_status = 'active_account';
  if v_active <> 18 then
    raise exception 'Preflight failed: expected 18 active_account (got %)', v_active;
  end if;
  if not exists (select 1 from lines where code = 'ogr') then
    raise exception 'Preflight failed: OGR line not found';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Create import batch
-- ---------------------------------------------------------------------------
insert into account_import_batches (
  id, sales_line_id, source_type, source_filename, content_sha256,
  status, classification_snapshot, created_by
) values (
  'f1a2e300-fa1r-4acc-0000-000000000001',
  '02b46d37-71ec-43bb-b8b8-570190c41bff',
  'faire_customer',
  'Wa-Oregon-Faire-Accounts.xlsx',
  '8399b7a31b6fa0c6f8e227e709d47cfcdb49f83e00b450f75c354b072919aefb',
  'previewed',
  '{"relationshipStatus":"opened","markers":["historical_purchaser","reactivation_candidate"],"existingOgr":"yes","nextAction":null}'::jsonb,
  '1e8752d7-e5d3-4fbd-95df-b1168189ea4f'
);

-- ---------------------------------------------------------------------------
-- Create import row stubs (needed before calling commit RPC)
-- account_import_rows schema: id, batch_id, sales_line_id, row_number,
--   raw_payload (jsonb), normalized_payload (jsonb), fingerprint,
--   match_decision, status, former_rep_code, raw_address_text
-- ---------------------------------------------------------------------------
insert into account_import_rows (
  id, batch_id, sales_line_id, row_number,
  raw_payload, normalized_payload,
  fingerprint, match_decision, status, former_rep_code, raw_address_text
) values
  ('f1a2e300-fa1r-4acc-0000-000000000011', 'f1a2e300-fa1r-4acc-0000-000000000001',
   '02b46d37-71ec-43bb-b8b8-570190c41bff', 1,
   '{"Store Name":"Checkerberry''s Flowers & Gifts","Address 1":"169 North 2nd Street","City":"Coos Bay","State":"OR","Zip Code":"97420","Store Type":"Florist or Garden Store","Contact Name":"beth clarkson","Email Address":""}'::jsonb,
   '{"name":"Checkerberry''s Flowers & Gifts","city":"Coos Bay","stateCode":"or","postalCode":"97420","fingerprint":null}'::jsonb,
   null, 'create_retailer', 'previewed', null, '169 North 2nd Street, Coos Bay, OR, 97420'),
  ('f1a2e300-fa1r-4acc-0000-000000000012', 'f1a2e300-fa1r-4acc-0000-000000000001',
   '02b46d37-71ec-43bb-b8b8-570190c41bff', 2,
   '{"Store Name":"Blue Door Boutique","Address 1":"144 Southeast G Street","City":"Grants Pass","State":"OR","Zip Code":"97526","Store Type":"Clothing Boutique","Contact Name":"Jen Michael","Email Address":""}'::jsonb,
   '{"name":"Blue Door Boutique","city":"Grants Pass","stateCode":"or","postalCode":"97526","fingerprint":null}'::jsonb,
   null, 'create_retailer', 'previewed', null, '144 Southeast G Street, Grants Pass, OR, 97526'),
  ('f1a2e300-fa1r-4acc-0000-000000000013', 'f1a2e300-fa1r-4acc-0000-000000000001',
   '02b46d37-71ec-43bb-b8b8-570190c41bff', 3,
   '{"Store Name":"Windy Woman Inc","Address 1":"","City":"Newport","State":"OR","Zip Code":"","Store Type":"Kids or Toy Store","Contact Name":"Ashley Bixler","Email Address":"childishtendenciesnewport@gmail.com"}'::jsonb,
   '{"name":"Windy Woman Inc","city":"Newport","stateCode":"or","postalCode":null,"fingerprint":null}'::jsonb,
   null, 'create_retailer', 'previewed', null, 'Newport, OR'),
  ('f1a2e300-fa1r-4acc-0000-000000000014', 'f1a2e300-fa1r-4acc-0000-000000000001',
   '02b46d37-71ec-43bb-b8b8-570190c41bff', 4,
   '{"Store Name":"Alley Cat Antiques","Address 1":"208 Commercial Avenue","City":"Anacortes","State":"WA","Zip Code":"98221","Store Type":"General or Mercantile Store","Contact Name":"Lea Mayberry","Email Address":""}'::jsonb,
   '{"name":"Alley Cat Antiques","city":"Anacortes","stateCode":"wa","postalCode":"98221","fingerprint":null}'::jsonb,
   null, 'create_retailer', 'previewed', null, '208 Commercial Avenue, Anacortes, WA, 98221'),
  ('f1a2e300-fa1r-4acc-0000-000000000015', 'f1a2e300-fa1r-4acc-0000-000000000001',
   '02b46d37-71ec-43bb-b8b8-570190c41bff', 5,
   '{"Store Name":"Beachside Gifts","Address 1":"18937 Front Street Northeast","City":"Poulsbo","State":"WA","Zip Code":"98370","Store Type":"Gift Store","Contact Name":"Lori Simnioniw","Email Address":""}'::jsonb,
   '{"name":"Beachside Gifts","city":"Poulsbo","stateCode":"wa","postalCode":"98370","fingerprint":null}'::jsonb,
   null, 'create_retailer', 'previewed', null, '18937 Front Street Northeast, Poulsbo, WA, 98370'),
  ('f1a2e300-fa1r-4acc-0000-000000000016', 'f1a2e300-fa1r-4acc-0000-000000000001',
   '02b46d37-71ec-43bb-b8b8-570190c41bff', 6,
   '{"Store Name":"Forget Me Not","Address 1":"173 S. Main","City":"Colville","State":"WA","Zip Code":"99114","Store Type":"Gift Store","Contact Name":"Candice Gessel","Email Address":""}'::jsonb,
   '{"name":"Forget Me Not","city":"Colville","stateCode":"wa","postalCode":"99114","fingerprint":null}'::jsonb,
   null, 'create_retailer', 'previewed', null, '173 S. Main, Colville, WA, 99114'),
  ('f1a2e300-fa1r-4acc-0000-000000000017', 'f1a2e300-fa1r-4acc-0000-000000000001',
   '02b46d37-71ec-43bb-b8b8-570190c41bff', 7,
   '{"Store Name":"Ts tallow and teas","Address 1":"619 Commercial Avenue","City":"Anacortes","State":"WA","Zip Code":"98221","Store Type":"Gift Store","Contact Name":"Tresa Akers","Email Address":""}'::jsonb,
   '{"name":"Ts tallow and teas","city":"Anacortes","stateCode":"wa","postalCode":"98221","fingerprint":null}'::jsonb,
   null, 'create_retailer', 'previewed', null, '619 Commercial Avenue, Anacortes, WA, 98221');

-- ---------------------------------------------------------------------------
-- Row 1: Checkerberry's Flowers & Gifts — Coos Bay, OR
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  'f1a2e300-fa1r-4acc-0000-000000000011'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'Checkerberry''s Flowers & Gifts',
      'category', 'gift_novelty_souvenir',
      'region', 'Oregon',
      'city', 'Coos Bay',
      'address', '169 North 2nd Street, Coos Bay, OR, 97420',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.',
      'website', null,
      'retail_category', null,
      'postal_code', '97420',
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
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'sales_line_territory_id', '9f57b498-97cd-4483-a8ca-af9188121cbe',
      'backfill_review_reason', null,
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.'
    ),
    'contact', jsonb_build_object(
      'full_name', 'beth clarkson',
      'email', null,
      'phone', null,
      'skip_if_primary_exists', true
    ),
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'Checkerberry''s Flowers & Gifts'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'Coos Bay'),
      jsonb_build_object('field_path', 'address', 'old_value', null, 'new_value', '169 North 2nd Street, Coos Bay, OR, 97420'),
      jsonb_build_object('field_path', 'postal_code', 'old_value', null, 'new_value', '97420')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Row 2: Blue Door Boutique — Grants Pass, OR
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  'f1a2e300-fa1r-4acc-0000-000000000012'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'Blue Door Boutique',
      'category', 'gift_novelty_souvenir',
      'region', 'Oregon',
      'city', 'Grants Pass',
      'address', '144 Southeast G Street, Grants Pass, OR, 97526',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.',
      'website', null,
      'retail_category', null,
      'postal_code', '97526',
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
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'sales_line_territory_id', '9f57b498-97cd-4483-a8ca-af9188121cbe',
      'backfill_review_reason', null,
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.'
    ),
    'contact', jsonb_build_object(
      'full_name', 'Jen Michael',
      'email', null,
      'phone', null,
      'skip_if_primary_exists', true
    ),
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'Blue Door Boutique'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'Grants Pass'),
      jsonb_build_object('field_path', 'address', 'old_value', null, 'new_value', '144 Southeast G Street, Grants Pass, OR, 97526'),
      jsonb_build_object('field_path', 'postal_code', 'old_value', null, 'new_value', '97526')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Row 3: Windy Woman Inc — Newport, OR (no street/ZIP; has email + contact)
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  'f1a2e300-fa1r-4acc-0000-000000000013'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'Windy Woman Inc',
      'category', 'gift_novelty_souvenir',
      'region', 'Oregon',
      'city', 'Newport',
      'address', 'Newport, OR',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No street address or ZIP in source file — city/state only. Treat as dormant reactivation candidate until a qualifying order is logged.',
      'website', null,
      'retail_category', null,
      'postal_code', null,
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
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'sales_line_territory_id', '9f57b498-97cd-4483-a8ca-af9188121cbe',
      'backfill_review_reason', null,
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No street address or ZIP in source file — city/state only.'
    ),
    'contact', jsonb_build_object(
      'full_name', 'Ashley Bixler',
      'email', 'childishtendenciesnewport@gmail.com',
      'phone', null,
      'skip_if_primary_exists', true
    ),
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'Windy Woman Inc'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'Newport')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Row 4: Alley Cat Antiques — Anacortes, WA
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  'f1a2e300-fa1r-4acc-0000-000000000014'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'Alley Cat Antiques',
      'category', 'gift_novelty_souvenir',
      'region', 'Washington',
      'city', 'Anacortes',
      'address', '208 Commercial Avenue, Anacortes, WA, 98221',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.',
      'website', null,
      'retail_category', null,
      'postal_code', '98221',
      'territory_id', '40a526c3-2a9d-4cd0-ae20-798bd4a78b2e',
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
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'sales_line_territory_id', '761d0130-282c-47ec-8eae-8bb86a04e743',
      'backfill_review_reason', null,
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.'
    ),
    'contact', jsonb_build_object(
      'full_name', 'Lea Mayberry',
      'email', null,
      'phone', null,
      'skip_if_primary_exists', true
    ),
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'Alley Cat Antiques'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'Anacortes'),
      jsonb_build_object('field_path', 'address', 'old_value', null, 'new_value', '208 Commercial Avenue, Anacortes, WA, 98221'),
      jsonb_build_object('field_path', 'postal_code', 'old_value', null, 'new_value', '98221')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Row 5: Beachside Gifts — Poulsbo, WA
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  'f1a2e300-fa1r-4acc-0000-000000000015'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'Beachside Gifts',
      'category', 'gift_novelty_souvenir',
      'region', 'Washington',
      'city', 'Poulsbo',
      'address', '18937 Front Street Northeast, Poulsbo, WA, 98370',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.',
      'website', null,
      'retail_category', null,
      'postal_code', '98370',
      'territory_id', '40a526c3-2a9d-4cd0-ae20-798bd4a78b2e',
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
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'sales_line_territory_id', '761d0130-282c-47ec-8eae-8bb86a04e743',
      'backfill_review_reason', null,
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.'
    ),
    'contact', jsonb_build_object(
      'full_name', 'Lori Simnioniw',
      'email', null,
      'phone', null,
      'skip_if_primary_exists', true
    ),
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'Beachside Gifts'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'Poulsbo'),
      jsonb_build_object('field_path', 'address', 'old_value', null, 'new_value', '18937 Front Street Northeast, Poulsbo, WA, 98370'),
      jsonb_build_object('field_path', 'postal_code', 'old_value', null, 'new_value', '98370')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Row 6: Forget Me Not — Colville, WA
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  'f1a2e300-fa1r-4acc-0000-000000000016'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'Forget Me Not',
      'category', 'gift_novelty_souvenir',
      'region', 'Washington',
      'city', 'Colville',
      'address', '173 S. Main, Colville, WA, 99114',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.',
      'website', null,
      'retail_category', null,
      'postal_code', '99114',
      'territory_id', '40a526c3-2a9d-4cd0-ae20-798bd4a78b2e',
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
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'sales_line_territory_id', '761d0130-282c-47ec-8eae-8bb86a04e743',
      'backfill_review_reason', null,
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.'
    ),
    'contact', jsonb_build_object(
      'full_name', 'Candice Gessel',
      'email', null,
      'phone', null,
      'skip_if_primary_exists', true
    ),
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'Forget Me Not'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'Colville'),
      jsonb_build_object('field_path', 'address', 'old_value', null, 'new_value', '173 S. Main, Colville, WA, 99114'),
      jsonb_build_object('field_path', 'postal_code', 'old_value', null, 'new_value', '99114')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Row 7: Ts tallow and teas — Anacortes, WA
-- ---------------------------------------------------------------------------
select public.commit_account_import_row(
  'f1a2e300-fa1r-4acc-0000-000000000017'::uuid,
  jsonb_build_object(
    'action', 'create_retailer',
    'retailer_id', null,
    'prospect_insert', jsonb_build_object(
      'name', 'Ts tallow and teas',
      'category', 'gift_novelty_souvenir',
      'region', 'Washington',
      'city', 'Anacortes',
      'address', '619 Commercial Avenue, Anacortes, WA, 98221',
      'phone', '',
      'fit', '',
      'account_status', 'active_account',
      'converted_at', null,
      'initial_order_date', null,
      'import_protected', true,
      'existing_ogr', 'yes',
      'qualification_status', 'reactivation',
      'next_action', null,
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.',
      'website', null,
      'retail_category', null,
      'postal_code', '98221',
      'territory_id', '40a526c3-2a9d-4cd0-ae20-798bd4a78b2e',
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
      'source_note', 'Import faire_customer batch from Wa-Oregon-Faire-Accounts.xlsx.',
      'sales_line_territory_id', '761d0130-282c-47ec-8eae-8bb86a04e743',
      'backfill_review_reason', null,
      'converted_at', null,
      'initial_order_date', null,
      'notes', 'Sourced: Listed as a verified past OGR Faire customer in Wa-Oregon-Faire-Accounts.xlsx. No purchase date or order value supplied. Treat as dormant reactivation candidate until a qualifying order is logged.'
    ),
    'contact', jsonb_build_object(
      'full_name', 'Tresa Akers',
      'email', null,
      'phone', null,
      'skip_if_primary_exists', true
    ),
    'field_changes', jsonb_build_array(
      jsonb_build_object('field_path', 'name', 'old_value', null, 'new_value', 'Ts tallow and teas'),
      jsonb_build_object('field_path', 'city', 'old_value', null, 'new_value', 'Anacortes'),
      jsonb_build_object('field_path', 'address', 'old_value', null, 'new_value', '619 Commercial Avenue, Anacortes, WA, 98221'),
      jsonb_build_object('field_path', 'postal_code', 'old_value', null, 'new_value', '98221')
    ),
    'final_status', 'imported'
  )
);

-- ---------------------------------------------------------------------------
-- Mark batch committed
-- ---------------------------------------------------------------------------
update account_import_batches
set status = 'committed'
where id = 'f1a2e300-fa1r-4acc-0000-000000000001';

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

  if v_active <> 25 then
    raise exception 'Postflight failed: expected 25 active_account (got %)', v_active;
  end if;
  if v_opened <> 24 then
    raise exception 'Postflight failed: expected 24 OGR opened RLA (got %)', v_opened;
  end if;

  raise notice 'SUCCESS: % active_account, % OGR opened RLA', v_active, v_opened;
end $$;

commit;
