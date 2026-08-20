/** OGR U.S. inbound geos. Never maps unknown or California onto BC. */
export type OgrUsInboundTerritoryCode = 'or' | 'wa';

/**
 * Map a U.S. state from the Request Pricing form onto an OGR territory code.
 * Returns null when the state is not an active OGR U.S. assignment (including CA).
 * Unknown values must not fall back to BC.
 */
export function ogrUsInboundTerritoryCode(
  state: string | null | undefined,
): OgrUsInboundTerritoryCode | null {
  const normalized = (state ?? '').trim().toUpperCase();
  if (normalized === 'OR' || normalized === 'OREGON') return 'or';
  if (normalized === 'WA' || normalized === 'WASHINGTON') return 'wa';
  return null;
}
