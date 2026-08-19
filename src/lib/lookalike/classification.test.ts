import { describe, expect, it } from 'vitest';
import {
  isLookalikeSeedRla,
  LOOKALIKE_LINE_CODE,
  LOOKALIKE_MAX_CANDIDATES,
  LOOKALIKE_MAX_SEEDS,
  LOOKALIKE_PROSPECT_DEFAULTS,
  parseLookalikeSeedIds,
} from '@/lib/lookalike/classification';

describe('lookalike seed eligibility', () => {
  it('accepts OGR historical purchasers and rejects ZoomInfo, non-OGR, and terminated rows', () => {
    expect(LOOKALIKE_LINE_CODE).toBe('ogr');
    expect(
      isLookalikeSeedRla({
        lineCode: 'ogr',
        relationshipStatus: 'opened',
        markers: ['historical_purchaser', 'reactivation_candidate'],
      }),
    ).toBe(true);
    expect(
      isLookalikeSeedRla({
        lineCode: 'eagle-peak',
        relationshipStatus: 'opened',
        markers: ['historical_purchaser'],
      }),
    ).toBe(false);
    expect(
      isLookalikeSeedRla({
        lineCode: 'ogr',
        relationshipStatus: 'prospect',
        markers: [],
      }),
    ).toBe(false);
    expect(
      isLookalikeSeedRla({
        lineCode: 'ogr',
        relationshipStatus: 'terminated',
        markers: ['historical_purchaser'],
      }),
    ).toBe(false);
  });

  it('parses 1–12 seed ids and rejects empty or oversized lists', () => {
    expect(parseLookalikeSeedIds([1, '2', 2])).toEqual([1, 2]);
    expect(parseLookalikeSeedIds([])).toBeNull();
    expect(
      parseLookalikeSeedIds(Array.from({ length: LOOKALIKE_MAX_SEEDS + 1 }, (_, i) => i + 1)),
    ).toBeNull();
    expect(LOOKALIKE_MAX_CANDIDATES).toBe(8);
  });

  it('stamps only lookalike_prospect with never-ordered prospect defaults', () => {
    expect(LOOKALIKE_PROSPECT_DEFAULTS.relationshipStatus).toBe('prospect');
    expect(LOOKALIKE_PROSPECT_DEFAULTS.accountStatus).toBe('prospect');
    expect(LOOKALIKE_PROSPECT_DEFAULTS.existingOgr).toBe('Unknown');
    expect(LOOKALIKE_PROSPECT_DEFAULTS.markers).toEqual(['lookalike_prospect']);
    expect(LOOKALIKE_PROSPECT_DEFAULTS.qualificationStatus).toBeNull();
    expect(LOOKALIKE_PROSPECT_DEFAULTS.importProtected).toBe(true);
  });
});
