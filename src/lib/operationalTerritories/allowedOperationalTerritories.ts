import type { OpsTerritoryCode } from '@/lib/operationalTerritories/membershipSeedData';

const PNW_OPS = ['pnw-west', 'pnw-east'] as const satisfies readonly OpsTerritoryCode[];
const CA_OPS = [
  'norcal-coastal',
  'norcal-inland',
  'ca-central-la-north',
  'la-metro-oc',
  'ie-san-diego',
] as const satisfies readonly OpsTerritoryCode[];
const NO_OPS: readonly OpsTerritoryCode[] = [];

export function storeCodeToStateCode(
  storeCode: string | null | undefined,
): 'WA' | 'OR' | 'CA' | null {
  const c = (storeCode ?? '').trim().toLowerCase();
  if (c === 'wa') return 'WA';
  if (c === 'or') return 'OR';
  if (c === 'ca') return 'CA';
  return null;
}

/** Ops territory codes staff may newly assign for a store geo. Empty for bc/ab. */
export function allowedOpsCodesForStore(
  storeCode: string | null | undefined,
): readonly OpsTerritoryCode[] {
  const c = (storeCode ?? '').trim().toLowerCase();
  if (c === 'wa' || c === 'or') return PNW_OPS;
  if (c === 'ca') return CA_OPS;
  return NO_OPS;
}

export function isCanadianStoreCode(storeCode: string | null | undefined): boolean {
  const c = (storeCode ?? '').trim().toLowerCase();
  return c === 'bc' || c === 'ab';
}

/**
 * Non-null assignment must be on the store-state allowlist.
 * Clear (null) is always allowed. Unchanged existing value is allowed even if
 * store is BC/AB (cleanup path keeps displaying until cleared).
 */
export function isOpsAssignmentAllowed(input: {
  storeTerritoryCode: string | null | undefined;
  nextOperationalTerritoryId: string | null;
  nextOperationalTerritoryCode: string | null | undefined;
  existingOperationalTerritoryId: string | null;
}): boolean {
  const nextId = input.nextOperationalTerritoryId;
  if (nextId == null) return true;
  if (nextId === input.existingOperationalTerritoryId) return true;

  const allowed = allowedOpsCodesForStore(input.storeTerritoryCode);
  if (allowed.length === 0) return false;
  const code = (input.nextOperationalTerritoryCode ?? '').trim().toLowerCase();
  return (allowed as readonly string[]).includes(code);
}
