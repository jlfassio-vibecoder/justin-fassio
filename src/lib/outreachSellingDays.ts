/**
 * Phase 4 weekday selling-day math in a business IANA timezone.
 * No holiday calendar in v1 — Mon–Fri only.
 */

import { formatOutreachPreparationDate } from '@/lib/outreachSelectTargets';

/** Parse YYYY-MM-DD as UTC noon (stable across TZ for weekday math). */
export function parseIsoDateUtcNoon(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00.000Z`);
}

export function addCalendarDaysIso(isoDate: string, days: number): string {
  const d = parseIsoDateUtcNoon(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 0=Sun … 6=Sat in UTC noon representation of the calendar date. */
export function weekdayUtcNoon(isoDate: string): number {
  return parseIsoDateUtcNoon(isoDate).getUTCDay();
}

export function isWeekdayIso(isoDate: string): boolean {
  const day = weekdayUtcNoon(isoDate);
  return day >= 1 && day <= 5;
}

/** Next Mon–Fri on or after isoDate (may cross month). */
export function nextSellingDayOnOrAfter(isoDate: string): string {
  let cur = isoDate;
  for (let i = 0; i < 8; i++) {
    if (isWeekdayIso(cur)) return cur;
    cur = addCalendarDaysIso(cur, 1);
  }
  return cur;
}

/** Next Mon–Fri strictly after isoDate (Friday → Monday; weekend → Monday). */
export function nextSellingDayAfter(isoDate: string): string {
  return nextSellingDayOnOrAfter(addCalendarDaysIso(isoDate, 1));
}

export type MonthWindow = {
  yearMonth: string;
  monthStart: string;
  monthEnd: string;
};

/** Calendar month containing asOf in the given IANA timezone. */
export function monthWindowInTimezone(asOf: Date, timeZone: string): MonthWindow {
  const today = formatOutreachPreparationDate(asOf, timeZone);
  const yearMonth = today.slice(0, 7);
  const monthStart = `${yearMonth}-01`;
  const [y, m] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthEnd = `${yearMonth}-${String(lastDay).padStart(2, '0')}`;
  return { yearMonth, monthStart, monthEnd };
}

/** Count weekdays in [startIso, endIso] inclusive. Empty if start > end. */
export function countWeekdaysInclusive(startIso: string, endIso: string): number {
  if (startIso > endIso) return 0;
  let count = 0;
  let cur = startIso;
  while (cur <= endIso) {
    if (isWeekdayIso(cur)) count += 1;
    cur = addCalendarDaysIso(cur, 1);
  }
  return count;
}

/**
 * Remaining selling days in the current month (business TZ).
 * Inclusive of today when today is a weekday.
 * If today is a weekend, start at next Monday — if that falls next month, returns 0.
 */
export function remainingSellingDaysInMonth(params: { asOf?: Date; timeZone: string }): {
  today: string;
  month: MonthWindow;
  remainingDays: number;
  isSellingDay: boolean;
  monthEnded: boolean;
} {
  const asOf = params.asOf ?? new Date();
  const today = formatOutreachPreparationDate(asOf, params.timeZone);
  const month = monthWindowInTimezone(asOf, params.timeZone);
  const isSellingDay = isWeekdayIso(today);
  const start = isSellingDay ? today : nextSellingDayOnOrAfter(today);
  const remainingDays = start <= month.monthEnd ? countWeekdaysInclusive(start, month.monthEnd) : 0;
  return {
    today,
    month,
    remainingDays,
    isSellingDay,
    monthEnded: remainingDays === 0 && today >= month.monthEnd,
  };
}

/** ISO timestamp window bounds for a calendar month in TZ (UTC instants). */
export function monthUtcBounds(
  month: MonthWindow,
  timeZone: string,
): { startIso: string; endExclusiveIso: string } {
  // Approximate: use noon local via Intl parts is heavy; for queries we use date strings
  // converted through a known offset. Prefer inclusive date compare on converted_at cast.
  // Callers should filter with converted_at >= monthStart 00:00 TZ and < nextMonth 00:00 TZ.
  const startLocal = `${month.monthStart}T00:00:00`;
  const nextMonthStart = addCalendarDaysIso(month.monthEnd, 1);
  const endLocal = `${nextMonthStart}T00:00:00`;

  // Convert local wall times in timeZone to UTC via formatter inversion.
  const startIso = zonedLocalToUtcIso(startLocal, timeZone);
  const endExclusiveIso = zonedLocalToUtcIso(endLocal, timeZone);
  return { startIso, endExclusiveIso };
}

/**
 * Convert a wall-clock local datetime (YYYY-MM-DDTHH:mm:ss) in timeZone to UTC ISO.
 * Uses iterative Instant search (sufficient for goal windows).
 */
export function zonedLocalToUtcIso(localDateTime: string, timeZone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!match) throw new Error(`Invalid local datetime: ${localDateTime}`);
  const [, ys, ms, ds, hs, mins, ss] = match;
  const y = Number(ys);
  const mo = Number(ms);
  const d = Number(ds);
  const h = Number(hs);
  const mi = Number(mins);
  const s = Number(ss);

  // Initial guess: treat as UTC
  let guess = Date.UTC(y, mo - 1, d, h, mi, s);
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour'),
      get('minute'),
      get('second'),
    );
    const target = Date.UTC(y, mo - 1, d, h, mi, s);
    guess += target - asUtc;
  }
  return new Date(guess).toISOString();
}

export function lookbackStartIso(asOf: Date, lookbackDays: number, timeZone: string): string {
  const today = formatOutreachPreparationDate(asOf, timeZone);
  const startDate = addCalendarDaysIso(today, -lookbackDays);
  return zonedLocalToUtcIso(`${startDate}T00:00:00`, timeZone);
}
