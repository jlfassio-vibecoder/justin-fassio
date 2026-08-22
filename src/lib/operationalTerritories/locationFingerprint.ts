import { extractPostal5 } from '@/lib/accountImport/addressParse';
import { normalizeZip } from '@/lib/operationalTerritories/resolve';
import type { Prospect } from '@/lib/prospects';

export type LocationFingerprint = {
  postalCode: string;
  address: string;
  storeTerritoryCode: string;
};

export function normalizeAddressForFingerprint(address: string | null | undefined): string {
  return (address ?? '').trim().replace(/\s+/g, ' ');
}

export function locationFingerprintFromProspect(prospect: {
  postalCode?: string | null;
  address?: string | null;
  territoryCode?: string | null;
}): LocationFingerprint {
  const postal =
    normalizeZip(prospect.postalCode) ??
    extractPostal5(prospect.address) ??
    (prospect.postalCode ?? '').trim();
  return {
    postalCode: postal,
    address: normalizeAddressForFingerprint(prospect.address),
    storeTerritoryCode: (prospect.territoryCode ?? '').trim().toLowerCase(),
  };
}

export function fingerprintsEqual(a: LocationFingerprint, b: LocationFingerprint): boolean {
  return (
    a.postalCode === b.postalCode &&
    a.address === b.address &&
    a.storeTerritoryCode === b.storeTerritoryCode
  );
}

export function locationChangedBetween(
  before: LocationFingerprint,
  after: LocationFingerprint,
): boolean {
  return !fingerprintsEqual(before, after);
}

export function parseLocationFingerprintFromPayload(
  payload: Record<string, unknown> | null | undefined,
): LocationFingerprint | null {
  const raw = payload?.location_fingerprint;
  if (!raw || typeof raw !== 'object') return null;
  const fp = raw as Record<string, unknown>;
  if (typeof fp.postalCode !== 'string' || typeof fp.address !== 'string') return null;
  if (typeof fp.storeTerritoryCode !== 'string') return null;
  return {
    postalCode: fp.postalCode,
    address: fp.address,
    storeTerritoryCode: fp.storeTerritoryCode,
  };
}

export type ProspectLocationInput = Pick<Prospect, 'postalCode' | 'address' | 'territoryCode'>;
