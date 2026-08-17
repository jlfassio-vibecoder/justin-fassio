-- Phase 9B pre-deploy parity (run on the hosted target, not local seed).
-- Stop 9B deploy if missing_ogr_rla, duplicate_ogr_rla, unexpected_status_pairs,
-- or date_mismatches are greater than zero.
-- Historical local 607/607 is not this gate.

select count(*)::int as prospect_count from prospects;

select count(*)::int as ogr_rla_count
from retailer_line_accounts rla
join lines l on l.id = rla.sales_line_id
where l.code = 'ogr';

select count(*)::int as missing_ogr_rla
from prospects p
where not exists (
  select 1
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id
  where rla.retailer_id = p.id and l.code = 'ogr'
);

select count(*)::int as duplicate_ogr_rla
from (
  select rla.retailer_id
  from retailer_line_accounts rla
  join lines l on l.id = rla.sales_line_id
  where l.code = 'ogr'
  group by rla.retailer_id
  having count(*) > 1
) d;

select count(*)::int as unexpected_status_pairs
from prospects p
join retailer_line_accounts rla on rla.retailer_id = p.id
join lines l on l.id = rla.sales_line_id
where l.code = 'ogr'
  and not (
    (p.account_status = 'prospect' and rla.relationship_status = 'prospect')
    or (p.account_status = 'active_account' and rla.relationship_status = 'opened')
    or (p.account_status = 'inactive' and rla.relationship_status = 'inactive')
  );

select count(*)::int as date_mismatches
from prospects p
join retailer_line_accounts rla on rla.retailer_id = p.id
join lines l on l.id = rla.sales_line_id
where l.code = 'ogr'
  and (
    p.converted_at is distinct from rla.converted_at
    or p.initial_order_date is distinct from rla.initial_order_date
  );
