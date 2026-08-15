-- Phase 3: additive write guards + per-line outreach goals.
-- Do not rewrite Phase 1C (…130000). Flag-off OGR inserts that omit RLA must still succeed.
-- Local disposable DB only.

-- ─────────────────────────────────────────────────────────────────────────
-- outreach_goal_settings.sales_line_id (NOT NULL after OGR backfill)
-- ─────────────────────────────────────────────────────────────────────────

alter table outreach_goal_settings
  add column if not exists sales_line_id uuid references lines (id);

update outreach_goal_settings
set sales_line_id = (select id from lines where code = 'ogr' limit 1)
where sales_line_id is null;

alter table outreach_goal_settings
  alter column sales_line_id set not null;

drop index if exists outreach_goal_settings_singleton_uidx;

create unique index if not exists outreach_goal_settings_sales_line_uidx
  on outreach_goal_settings (sales_line_id);

-- ─────────────────────────────────────────────────────────────────────────
-- Shared operational-write guard (bkg / prospective / declined / terminated)
-- Null line id is allowed so 1C fillers can still stamp OGR.
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.assert_line_allows_operational_write(p_line_id uuid)
returns void
language plpgsql
as $$
declare
  v_code text;
  v_status text;
begin
  if p_line_id is null then
    return;
  end if;

  select code, status into v_code, v_status from lines where id = p_line_id;
  if v_code is null then
    raise exception 'Phase 3: line % not found', p_line_id;
  end if;
  if v_code = 'bkg' or v_status in ('prospective', 'declined', 'terminated') then
    raise exception
      'Phase 3: operational writes are not allowed for line % (status %)',
      v_code,
      coalesce(v_status, 'missing');
  end if;
end;
$$;

create or replace function public.enforce_rla_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_line_allows_operational_write(new.sales_line_id);
  return new;
end;
$$;

drop trigger if exists retailer_line_accounts_operational_write_guard on retailer_line_accounts;
create trigger retailer_line_accounts_operational_write_guard
  before insert or update of sales_line_id on retailer_line_accounts
  for each row execute function public.enforce_rla_operational_write_not_blocked();

create or replace function public.enforce_order_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  perform public.assert_line_allows_operational_write(new.line_id);
  if new.retailer_line_account_id is not null then
    select sales_line_id into v_rla_line
    from retailer_line_accounts
    where id = new.retailer_line_account_id;
    perform public.assert_line_allows_operational_write(v_rla_line);
  end if;
  return new;
end;
$$;

drop trigger if exists orders_operational_write_guard on orders;
create trigger orders_operational_write_guard
  before insert or update of retailer_line_account_id, line_id on orders
  for each row execute function public.enforce_order_operational_write_not_blocked();

create or replace function public.enforce_call_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  perform public.assert_line_allows_operational_write(new.line_id);
  if new.retailer_line_account_id is not null then
    select sales_line_id into v_rla_line
    from retailer_line_accounts
    where id = new.retailer_line_account_id;
    perform public.assert_line_allows_operational_write(v_rla_line);
  end if;
  return new;
end;
$$;

drop trigger if exists calls_operational_write_guard on calls;
create trigger calls_operational_write_guard
  before insert or update of retailer_line_account_id, line_id on calls
  for each row execute function public.enforce_call_operational_write_not_blocked();

create or replace function public.enforce_rla_child_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  if new.retailer_line_account_id is null then
    return new;
  end if;
  select sales_line_id into v_rla_line
  from retailer_line_accounts
  where id = new.retailer_line_account_id;
  perform public.assert_line_allows_operational_write(v_rla_line);
  return new;
end;
$$;

drop trigger if exists retailer_line_contacts_operational_write_guard on retailer_line_contacts;
create trigger retailer_line_contacts_operational_write_guard
  before insert or update of retailer_line_account_id on retailer_line_contacts
  for each row execute function public.enforce_rla_child_operational_write_not_blocked();

drop trigger if exists account_reorder_settings_operational_write_guard on account_reorder_settings;
create trigger account_reorder_settings_operational_write_guard
  before insert or update of retailer_line_account_id on account_reorder_settings
  for each row execute function public.enforce_rla_child_operational_write_not_blocked();

drop trigger if exists account_conversion_attribution_operational_write_guard on account_conversion_attribution;
create trigger account_conversion_attribution_operational_write_guard
  before insert or update of retailer_line_account_id on account_conversion_attribution
  for each row execute function public.enforce_rla_child_operational_write_not_blocked();

create or replace function public.enforce_outreach_goal_operational_write_not_blocked()
returns trigger
language plpgsql
as $$
begin
  perform public.assert_line_allows_operational_write(new.sales_line_id);
  return new;
end;
$$;

drop trigger if exists outreach_goal_settings_operational_write_guard on outreach_goal_settings;
create trigger outreach_goal_settings_operational_write_guard
  before insert or update of sales_line_id on outreach_goal_settings
  for each row execute function public.enforce_outreach_goal_operational_write_not_blocked();

-- line_id must match RLA.sales_line_id when RLA is set.
create or replace function public.enforce_order_call_line_matches_rla()
returns trigger
language plpgsql
as $$
declare
  v_rla_line uuid;
begin
  if new.retailer_line_account_id is null or new.line_id is null then
    return new;
  end if;
  select sales_line_id into v_rla_line
  from retailer_line_accounts
  where id = new.retailer_line_account_id;
  if v_rla_line is distinct from new.line_id then
    raise exception
      'Phase 3: line_id % does not match retailer_line_account sales_line_id %',
      new.line_id,
      v_rla_line;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_line_matches_rla on orders;
create trigger orders_line_matches_rla
  before insert or update of retailer_line_account_id, line_id on orders
  for each row execute function public.enforce_order_call_line_matches_rla();

drop trigger if exists calls_line_matches_rla on calls;
create trigger calls_line_matches_rla
  before insert or update of retailer_line_account_id, line_id on calls
  for each row execute function public.enforce_order_call_line_matches_rla();

-- ─────────────────────────────────────────────────────────────────────────
-- Replace 1C order/call fillers: keep OGR fill when line/RLA omitted;
-- allow represented non-OGR line_id when RLA is already set (do not overwrite).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function public.fill_ogr_retailer_line_account_on_order()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_ogr_line uuid;
  v_line_code text;
begin
  if new.line_id is not null then
    select code into v_line_code from lines where id = new.line_id;
  end if;

  -- Represented non-OGR: do not stamp OGR RLA / line_id.
  if v_line_code is not null and v_line_code is distinct from 'ogr' then
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
  end if;

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

create or replace function public.fill_ogr_retailer_line_account_on_call()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_ogr_line uuid;
  v_exists boolean;
  v_line_code text;
begin
  if new.line_id is not null then
    select code into v_line_code from lines where id = new.line_id;
  end if;

  if v_line_code is not null and v_line_code is distinct from 'ogr' then
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
  end if;

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
