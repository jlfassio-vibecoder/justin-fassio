-- Additive correction: honor skip_if_primary_exists on commit_account_import_row.
-- Does not rewrite 20260817200000 (already hosted). Function remains SECURITY INVOKER.

create or replace function public.commit_account_import_row(
  p_import_row_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_row account_import_rows%rowtype;
  v_retailer_id integer;
  v_rla_id uuid;
  v_contact_id uuid;
  v_action text;
  v_final_status text;
  v_insert jsonb;
  v_patch jsonb;
  v_rla jsonb;
  v_contact jsonb;
  v_change jsonb;
  v_has_primary boolean;
  v_created_retailer boolean := false;
begin
  if not public.is_approved_owner() then
    raise exception 'Forbidden';
  end if;

  select * into v_row
  from account_import_rows
  where id = p_import_row_id
  for update;
  if not found then
    raise exception 'Import row not found';
  end if;

  if v_row.status in ('imported', 'linked', 'updated') then
    return jsonb_build_object(
      'ok', true,
      'retailer_id', v_row.retailer_id,
      'retailer_line_account_id', v_row.retailer_line_account_id,
      'account_contact_id', v_row.account_contact_id,
      'status', v_row.status,
      'idempotent', true
    );
  end if;

  if v_row.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'error', 'Row was cancelled', 'status', 'cancelled');
  end if;

  update account_import_rows
  set status = 'queued', error = null
  where id = v_row.id;

  v_action := p_payload->>'action';
  v_final_status := coalesce(p_payload->>'final_status', 'imported');
  v_insert := p_payload->'prospect_insert';
  v_patch := p_payload->'prospect_patch';
  v_rla := p_payload->'rla_patch';
  v_contact := p_payload->'contact';

  if v_action = 'create_retailer' then
    insert into prospects (
      id,
      name,
      category,
      region,
      city,
      address,
      phone,
      fit,
      account_status,
      converted_at,
      initial_order_date,
      import_protected,
      existing_ogr,
      qualification_status,
      next_action,
      source_note,
      notes,
      website,
      retail_category,
      postal_code,
      territory_id,
      primary_district,
      subterritory,
      external_id
    )
    values (
      coalesce((select max(id) from prospects), 0) + 1,
      v_insert->>'name',
      v_insert->>'category',
      v_insert->>'region',
      coalesce(v_insert->>'city', ''),
      coalesce(v_insert->>'address', ''),
      coalesce(v_insert->>'phone', ''),
      coalesce(v_insert->>'fit', ''),
      coalesce(v_insert->>'account_status', 'active_account'),
      null,
      null,
      true,
      v_insert->>'existing_ogr',
      v_insert->>'qualification_status',
      v_insert->>'next_action',
      v_insert->>'source_note',
      v_insert->>'notes',
      v_insert->>'website',
      v_insert->>'retail_category',
      v_insert->>'postal_code',
      (v_insert->>'territory_id')::uuid,
      null,
      null,
      v_insert->>'external_id'
    )
    returning id into v_retailer_id;
    v_created_retailer := true;
  else
    v_retailer_id := nullif(p_payload->>'retailer_id', '')::integer;
    if v_retailer_id is null then
      raise exception 'retailer_id is required for link/update';
    end if;
    if v_patch is not null and v_patch <> 'null'::jsonb then
      update prospects
      set
        address = coalesce(v_patch->>'address', address),
        city = coalesce(v_patch->>'city', city),
        postal_code = coalesce(v_patch->>'postal_code', postal_code),
        website = coalesce(v_patch->>'website', website),
        phone = coalesce(v_patch->>'phone', phone)
      where id = v_retailer_id;
    end if;
  end if;

  select id into v_rla_id
  from retailer_line_accounts
  where retailer_id = v_retailer_id
    and sales_line_id = v_row.sales_line_id
    and relationship_status <> 'terminated'
  limit 1;

  if v_rla_id is null then
    insert into retailer_line_accounts (
      retailer_id,
      sales_line_id,
      relationship_status
    )
    values (
      v_retailer_id,
      v_row.sales_line_id,
      coalesce(v_rla->>'relationship_status', 'opened')
    )
    returning id into v_rla_id;
  end if;

  update retailer_line_accounts
  set
    relationship_status = coalesce(v_rla->>'relationship_status', relationship_status),
    line_account_markers = case
      when jsonb_typeof(v_rla->'line_account_markers') = 'array'
      then array(select jsonb_array_elements_text(v_rla->'line_account_markers'))
      else line_account_markers
    end,
    existing_ogr = coalesce(v_rla->>'existing_ogr', existing_ogr),
    qualification_status = coalesce(v_rla->>'qualification_status', qualification_status),
    next_action = coalesce(v_rla->>'next_action', next_action),
    notes = coalesce(v_rla->>'notes', notes),
    source_note = coalesce(v_rla->>'source_note', source_note),
    sales_line_territory_id = nullif(v_rla->>'sales_line_territory_id', '')::uuid,
    backfill_review_reason = v_rla->>'backfill_review_reason',
    converted_at = null,
    initial_order_date = null
  where id = v_rla_id;

    if v_contact is not null and v_contact <> 'null'::jsonb then
    select exists (
      select 1 from account_contacts
      where account_id = v_retailer_id and is_primary = true
    ) into v_has_primary;

    if not (
      coalesce(v_has_primary, false)
      and coalesce((v_contact->>'skip_if_primary_exists')::boolean, false)
    ) then
      insert into account_contacts (
        account_id,
        role,
        full_name,
        email,
        phone,
        is_primary,
        notes
      )
      values (
        v_retailer_id,
        'buyer',
        coalesce(nullif(v_contact->>'full_name', ''), 'Buyer'),
        nullif(v_contact->>'email', ''),
        nullif(v_contact->>'phone', ''),
        not coalesce(v_has_primary, false),
        'Import'
      )
      returning id into v_contact_id;
    end if;
  end if;

  if jsonb_typeof(p_payload->'field_changes') = 'array' then
    for v_change in select value from jsonb_array_elements(p_payload->'field_changes')
    loop
      insert into retailer_field_changes (
        retailer_id,
        field_path,
        old_value,
        new_value,
        source,
        sales_line_id,
        retailer_line_account_id
      )
      values (
        v_retailer_id,
        v_change->>'field_path',
        v_change->'old_value',
        v_change->'new_value',
        'import',
        v_row.sales_line_id,
        v_rla_id
      );
    end loop;
  end if;

  update account_import_rows
  set
    status = v_final_status,
    retailer_id = v_retailer_id,
    retailer_line_account_id = v_rla_id,
    account_contact_id = v_contact_id,
    error = null
  where id = v_row.id;

  return jsonb_build_object(
    'ok', true,
    'retailer_id', v_retailer_id,
    'retailer_line_account_id', v_rla_id,
    'account_contact_id', v_contact_id,
    'status', v_final_status,
    'created_retailer', v_created_retailer,
    'idempotent', false
  );
exception
  when others then
    return jsonb_build_object(
      'ok', false,
      'error', sqlerrm,
      'status', 'failed'
    );
end;
$$;

revoke all on function public.commit_account_import_row(uuid, jsonb) from public;
grant execute on function public.commit_account_import_row(uuid, jsonb) to authenticated;
