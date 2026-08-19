-- F1: additive outreach_eligible marker on retailer_line_accounts.
-- Default remains unset. Import commit must not stamp this marker.
-- Do not rewrite 20260817180000_bulk_import_phase1_data_foundation.sql.

alter table retailer_line_accounts
  drop constraint if exists retailer_line_accounts_line_account_markers_check;
alter table retailer_line_accounts
  add constraint retailer_line_accounts_line_account_markers_check
  check (
    line_account_markers <@ array[
      'historical_purchaser',
      'reactivation_candidate',
      'reactivation_unresponsive',
      'outreach_eligible'
    ]::text[]
  );
