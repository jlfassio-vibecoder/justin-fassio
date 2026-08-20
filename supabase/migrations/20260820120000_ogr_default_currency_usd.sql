-- OGR operational currency: default new commercial writes to USD original + FX→CAD reporting.
-- Additive only: updates lines.default_currency / ai_profile.currency; replaces fill triggers.
-- Does not rewrite historical orders or calls money columns.

update public.lines
set default_currency = 'USD'
where code = 'ogr';

update public.lines
set ai_profile = jsonb_set(
  coalesce(ai_profile, '{}'::jsonb),
  '{currency}',
  '"USD"'::jsonb,
  true
)
where code = 'ogr';

create or replace function public.fill_ogr_retailer_line_account_on_order()
returns trigger
language plpgsql
as $$
declare
  v_rla_id uuid;
  v_ogr_line uuid;
  v_line_code text;
  v_default_currency text;
  v_currency text;
begin
  if new.line_id is not null then
    select code, default_currency
    into v_line_code, v_default_currency
    from lines
    where id = new.line_id;
  end if;

  -- Represented non-OGR: do not stamp OGR RLA / line_id; still enforce currency rules.
  if v_line_code is null or v_line_code = 'ogr' then
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

    if new.line_id is not null then
      select code, default_currency
      into v_line_code, v_default_currency
      from lines
      where id = new.line_id;
    end if;
  end if;

  v_default_currency := coalesce(nullif(trim(v_default_currency), ''), 'CAD');
  v_currency := nullif(trim(coalesce(new.original_currency, '')), '');

  if v_currency is not null and upper(v_currency) = 'USD' then
    if new.exchange_rate is null
      or new.exchange_rate <= 0
      or new.exchange_rate_date is null
      or length(trim(new.exchange_rate_date::text)) = 0
      or new.conversion_source is null
      or length(trim(new.conversion_source)) = 0
      or new.total_amount_cad is null
      or new.converted_amount is null
      or new.original_amount is null
    then
      raise exception
        'Incomplete USD order conversion: original_amount, exchange_rate (>0), exchange_rate_date, conversion_source, converted_amount, and total_amount_cad are required';
    end if;
    return new;
  end if;

  if v_currency is null then
    if upper(v_default_currency) = 'USD' then
      raise exception
        'Incomplete USD order conversion: original_currency default is USD; provide a complete FX stamp or explicit CAD';
    end if;
    new.original_amount := new.total_amount_cad;
    new.original_currency := 'CAD';
    new.exchange_rate := 1;
    new.exchange_rate_date := new.order_date;
    new.converted_amount := new.total_amount_cad;
    new.converted_currency := 'CAD';
    new.conversion_source := 'legacy_cad_column';
    return new;
  end if;

  if upper(v_currency) = 'CAD'
    and (new.conversion_source is null or length(trim(new.conversion_source)) = 0)
  then
    new.original_amount := coalesce(new.original_amount, new.total_amount_cad);
    new.original_currency := 'CAD';
    new.exchange_rate := coalesce(new.exchange_rate, 1);
    new.exchange_rate_date := coalesce(new.exchange_rate_date, new.order_date);
    new.converted_amount := coalesce(new.converted_amount, new.total_amount_cad);
    new.converted_currency := coalesce(new.converted_currency, 'CAD');
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
  v_default_currency text;
  v_currency text;
begin
  if new.line_id is not null then
    select code, default_currency
    into v_line_code, v_default_currency
    from lines
    where id = new.line_id;
  end if;

  if v_line_code is null or v_line_code = 'ogr' then
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

    if new.line_id is not null then
      select code, default_currency
      into v_line_code, v_default_currency
      from lines
      where id = new.line_id;
    end if;
  end if;

  v_default_currency := coalesce(nullif(trim(v_default_currency), ''), 'CAD');
  v_currency := nullif(trim(coalesce(new.order_value_original_currency, '')), '');

  if v_currency is not null and upper(v_currency) = 'USD' then
    if new.order_value_exchange_rate is null
      or new.order_value_exchange_rate <= 0
      or new.order_value_exchange_rate_date is null
      or length(trim(new.order_value_exchange_rate_date::text)) = 0
      or new.order_value_conversion_source is null
      or length(trim(new.order_value_conversion_source)) = 0
      or new.order_value_cad is null
      or new.order_value_converted_amount is null
      or new.order_value_original_amount is null
    then
      raise exception
        'Incomplete USD call order-value conversion: original amount, exchange rate (>0), rate date, conversion source, converted amount, and order_value_cad are required';
    end if;
    return new;
  end if;

  -- Zero / empty order value: leave conversion fields null (do not invent).
  if new.order_value_cad is null or new.order_value_cad = 0 then
    return new;
  end if;

  if new.order_value_conversion_source is null or new.order_value_original_currency is null then
    if upper(v_default_currency) = 'USD' then
      raise exception
        'Incomplete USD call order-value conversion: line default is USD; provide a complete FX stamp or explicit CAD';
    end if;
    new.order_value_original_amount := new.order_value_cad;
    new.order_value_original_currency := 'CAD';
    new.order_value_exchange_rate := 1;
    new.order_value_exchange_rate_date := new.call_date;
    new.order_value_converted_amount := new.order_value_cad;
    new.order_value_converted_currency := 'CAD';
    new.order_value_conversion_source := 'legacy_cad_column';
  elsif upper(coalesce(v_currency, '')) = 'CAD'
    and (new.order_value_conversion_source is null or length(trim(new.order_value_conversion_source)) = 0)
  then
    new.order_value_original_amount := coalesce(new.order_value_original_amount, new.order_value_cad);
    new.order_value_original_currency := 'CAD';
    new.order_value_exchange_rate := coalesce(new.order_value_exchange_rate, 1);
    new.order_value_exchange_rate_date := coalesce(new.order_value_exchange_rate_date, new.call_date);
    new.order_value_converted_amount := coalesce(new.order_value_converted_amount, new.order_value_cad);
    new.order_value_converted_currency := coalesce(new.order_value_converted_currency, 'CAD');
    new.order_value_conversion_source := 'legacy_cad_column';
  end if;

  return new;
end;
$$;
