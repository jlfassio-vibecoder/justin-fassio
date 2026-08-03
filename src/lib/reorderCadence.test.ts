import { describe, expect, it } from 'vitest';
import {
  computeReorderSuggestion,
  contactDateForSeason,
  formatLocalIsoDate,
  thirdSundayOfJune,
} from '@/lib/reorderCadence';

describe('thirdSundayOfJune', () => {
  it('returns 2026-06-21 for 2026', () => {
    expect(formatLocalIsoDate(thirdSundayOfJune(2026))).toBe('2026-06-21');
  });

  it('returns 2025-06-15 for 2025', () => {
    expect(formatLocalIsoDate(thirdSundayOfJune(2025))).toBe('2025-06-15');
  });
});

describe('contactDateForSeason', () => {
  it('Father’s Day contact is 6 weeks before 3rd Sunday of June', () => {
    const asOf = new Date(2026, 3, 1); // Apr 1 2026
    const contact = contactDateForSeason('fathers_day', asOf, null);
    // 2026-06-21 minus 42 days = 2026-05-10
    expect(formatLocalIsoDate(contact)).toBe('2026-05-10');
  });

  it('Father’s Day rolls to next year when contact date already past', () => {
    const asOf = new Date(2026, 5, 1); // Jun 1 2026 — contact May 10 already past
    const contact = contactDateForSeason('fathers_day', asOf, null);
    // 2027-06-20 minus 42 = 2027-05-09
    expect(formatLocalIsoDate(contact)).toBe('2027-05-09');
  });

  it('Holiday / Christmas suggests August 1 (or next year if past)', () => {
    expect(
      formatLocalIsoDate(contactDateForSeason('holiday_christmas', new Date(2026, 5, 15), null)),
    ).toBe('2026-08-01');
    expect(
      formatLocalIsoDate(contactDateForSeason('holiday_christmas', new Date(2026, 8, 2), null)),
    ).toBe('2027-08-01');
  });

  it('Spring / Summer suggests February 1', () => {
    expect(
      formatLocalIsoDate(contactDateForSeason('spring_summer', new Date(2026, 0, 15), null)),
    ).toBe('2026-02-01');
    expect(
      formatLocalIsoDate(contactDateForSeason('spring_summer', new Date(2026, 2, 1), null)),
    ).toBe('2027-02-01');
  });

  it('Fall / Winter suggests July 1', () => {
    expect(
      formatLocalIsoDate(contactDateForSeason('fall_winter', new Date(2026, 4, 1), null)),
    ).toBe('2026-07-01');
  });

  it('ATS is 90 days after last order (or asOf when missing)', () => {
    const asOf = new Date(2026, 0, 10);
    expect(formatLocalIsoDate(contactDateForSeason('ats_in_season', asOf, '2026-01-01'))).toBe(
      '2026-04-01',
    );
    expect(formatLocalIsoDate(contactDateForSeason('ats_in_season', asOf, null))).toBe(
      '2026-04-10',
    );
  });
});

describe('computeReorderSuggestion', () => {
  it('uses lastSeason and returns a two-sentence pitch', () => {
    const result = computeReorderSuggestion({
      lastOrderDate: '2026-03-01',
      lastSeason: 'fathers_day',
      accountName: 'Kelowna Golf',
      lineLabel: 'Old Guys Rule',
      asOf: new Date(2026, 3, 1),
    });

    expect(result.nextSuggestedContactDate).toBe('2026-05-10');
    expect(result.seasonalCadenceTags).toEqual(['fathers_day']);
    const sentences = result.aiReorderNotes.split(/(?<=\.)\s+/).filter(Boolean);
    expect(sentences).toHaveLength(2);
    expect(result.aiReorderNotes).toContain('Kelowna Golf');
    expect(result.aiReorderNotes).toContain("Father's Day");
  });

  it('defaults to ATS when season is missing', () => {
    const result = computeReorderSuggestion({
      lastOrderDate: null,
      lastSeason: null,
      accountName: 'Marina Co',
      asOf: new Date(2026, 0, 1),
    });

    expect(result.nextSuggestedContactDate).toBe('2026-04-01');
    expect(result.seasonalCadenceTags).toEqual(['ats_in_season']);
    expect(result.aiReorderNotes.split(/(?<=\.)\s+/).filter(Boolean)).toHaveLength(2);
  });
});
