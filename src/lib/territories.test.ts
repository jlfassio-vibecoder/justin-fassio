import { describe, expect, it } from 'vitest';
import { BC_TERRITORY_CODE, territoryCodeFromProvince } from '@/lib/territories';

describe('territoryCodeFromProvince', () => {
  it('maps known provinces and states', () => {
    expect(territoryCodeFromProvince('BC')).toBe('bc');
    expect(territoryCodeFromProvince('British Columbia')).toBe('bc');
    expect(territoryCodeFromProvince('AB')).toBe('ab');
    expect(territoryCodeFromProvince('Alberta')).toBe('ab');
    expect(territoryCodeFromProvince('CA')).toBe('ca');
    expect(territoryCodeFromProvince('OR')).toBe('or');
    expect(territoryCodeFromProvince('WA')).toBe('wa');
  });

  it('defaults unknown / empty to BC', () => {
    expect(territoryCodeFromProvince('')).toBe(BC_TERRITORY_CODE);
    expect(territoryCodeFromProvince(null)).toBe(BC_TERRITORY_CODE);
    expect(territoryCodeFromProvince('Unknown')).toBe(BC_TERRITORY_CODE);
  });
});
