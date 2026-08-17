import type { AccountStatus, RelationshipStatus } from '@/types/database';

/** §22.3 map: RLA relationship_status → directory AccountStatus. */
export function accountStatusFromRelationship(status: string): AccountStatus {
  if (status === 'opened') return 'active_account';
  if (status === 'inactive' || status === 'terminated') return 'inactive';
  return 'prospect';
}

export function expectedRelationshipForAccountStatus(status: AccountStatus): RelationshipStatus {
  if (status === 'active_account') return 'opened';
  if (status === 'inactive') return 'inactive';
  return 'prospect';
}

export type OgrRlaParityCounts = {
  prospectCount: number;
  ogrRlaCount: number;
  missingOgrRla: number;
  duplicateOgrRla: number;
  unexpectedStatusPairs: number;
  dateMismatches: number;
};

/** Fail closed: any missing/duplicate/unexpected mapping blocks 9B deploy. */
export function ogrRlaParityFails(counts: OgrRlaParityCounts): boolean {
  return (
    counts.missingOgrRla > 0 ||
    counts.duplicateOgrRla > 0 ||
    counts.unexpectedStatusPairs > 0 ||
    counts.dateMismatches > 0
  );
}

/** Hosted/local parity queries. Run on the deployment target immediately before 9B apply. */
export const OGR_RLA_PARITY_SQL = `
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
`.trim();
