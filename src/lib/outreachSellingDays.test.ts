import { describe, expect, it } from 'vitest';
import {
  countWeekdaysInclusive,
  isWeekdayIso,
  monthWindowInTimezone,
  nextSellingDayOnOrAfter,
  remainingSellingDaysInMonth,
} from '@/lib/outreachSellingDays';
import { OUTREACH_GOAL_DEFAULTS, defaultOutreachGoalSettings } from '@/lib/outreachGoals';

describe('outreachSellingDays', () => {
  it('treats Mon–Fri as weekdays', () => {
    expect(isWeekdayIso('2026-08-10')).toBe(true); // Mon
    expect(isWeekdayIso('2026-08-14')).toBe(true); // Fri
    expect(isWeekdayIso('2026-08-15')).toBe(false); // Sat
    expect(isWeekdayIso('2026-08-16')).toBe(false); // Sun
  });

  it('nextSellingDayOnOrAfter jumps weekends to Monday', () => {
    expect(nextSellingDayOnOrAfter('2026-08-15')).toBe('2026-08-17');
    expect(nextSellingDayOnOrAfter('2026-08-10')).toBe('2026-08-10');
  });

  it('counts weekdays inclusive', () => {
    // Mon Aug 10 – Fri Aug 14 = 5
    expect(countWeekdaysInclusive('2026-08-10', '2026-08-14')).toBe(5);
    expect(countWeekdaysInclusive('2026-08-14', '2026-08-14')).toBe(1);
    expect(countWeekdaysInclusive('2026-08-15', '2026-08-16')).toBe(0);
  });

  it('month window is calendar month in America/Vancouver', () => {
    // 2026-08-01 07:00 UTC = still Jul 31 evening in Vancouver? Aug 1 00:00 Vancouver = Aug 1 07:00 UTC
    const asOf = new Date('2026-08-15T18:00:00Z');
    const month = monthWindowInTimezone(asOf, 'America/Vancouver');
    expect(month.yearMonth).toBe('2026-08');
    expect(month.monthStart).toBe('2026-08-01');
    expect(month.monthEnd).toBe('2026-08-31');
  });

  it('remaining selling days from mid-month weekday', () => {
    // Wed Aug 12 2026
    const asOf = new Date('2026-08-12T18:00:00Z');
    const result = remainingSellingDaysInMonth({
      asOf,
      timeZone: 'America/Vancouver',
    });
    expect(result.isSellingDay).toBe(true);
    // Aug 12–31 weekdays
    expect(result.remainingDays).toBe(countWeekdaysInclusive('2026-08-12', '2026-08-31'));
  });

  it('weekend at month end yields 0 remaining for that month', () => {
    // Sat Aug 29 2026 — next Mon is Aug 31 still in month
    const asOf = new Date('2026-08-29T18:00:00Z');
    const result = remainingSellingDaysInMonth({
      asOf,
      timeZone: 'America/Vancouver',
    });
    expect(result.isSellingDay).toBe(false);
    expect(result.remainingDays).toBe(countWeekdaysInclusive('2026-08-31', '2026-08-31'));
  });
});

describe('outreachGoals defaults', () => {
  it('default monthly target is 5 and planning rate is 1.5%', () => {
    expect(OUTREACH_GOAL_DEFAULTS.monthlyTarget).toBe(5);
    expect(OUTREACH_GOAL_DEFAULTS.planningConversionRate).toBe(0.015);
    const settings = defaultOutreachGoalSettings();
    expect(settings.monthlyTarget).toBe(5);
    expect(settings.planningConversionRate).toBe(0.015);
    expect(settings.businessTimezone).toBe('America/Vancouver');
  });
});
