import { describe, expect, it } from 'vitest';
import {
  fingerprintsEqual,
  locationChangedBetween,
  locationFingerprintFromProspect,
  normalizeAddressForFingerprint,
} from '@/lib/operationalTerritories/locationFingerprint';

describe('locationFingerprint', () => {
  it('normalizes address whitespace', () => {
    expect(normalizeAddressForFingerprint('  123   Main   St  ')).toBe('123 Main St');
  });

  it('detects fingerprint change when postal changes', () => {
    const before = locationFingerprintFromProspect({
      postalCode: '98101',
      address: '1 Pike',
      territoryCode: 'wa',
    });
    const after = locationFingerprintFromProspect({
      postalCode: '97201',
      address: '1 Pike',
      territoryCode: 'wa',
    });
    expect(fingerprintsEqual(before, after)).toBe(false);
    expect(locationChangedBetween(before, after)).toBe(true);
  });

  it('treats identical fingerprints as unchanged', () => {
    const a = locationFingerprintFromProspect({
      postalCode: '90210',
      address: '1 Main',
      territoryCode: 'ca',
    });
    const b = locationFingerprintFromProspect({
      postalCode: '90210',
      address: '1 Main',
      territoryCode: 'ca',
    });
    expect(locationChangedBetween(a, b)).toBe(false);
  });
});
