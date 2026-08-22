-- Activate the seven West Coast operational territories after approved coverage seed.
-- Additive only; does not edit prior operational territory migrations.

update territories
set status = 'active', updated_at = now()
where code in (
  'pnw-west',
  'pnw-east',
  'norcal-coastal',
  'norcal-inland',
  'ca-central-la-north',
  'la-metro-oc',
  'ie-san-diego'
);
