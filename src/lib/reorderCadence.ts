import { apparelSeasonLabel } from '@/lib/apparelSeasons';
import type { ApparelSeason } from '@/types/database';

export interface ComputeReorderSuggestionInput {
  lastOrderDate: string | null;
  lastSeason: ApparelSeason | null;
  accountName: string;
  lineLabel?: string;
  /** Injectable clock for tests (defaults to now). */
  asOf?: Date;
}

export interface ReorderSuggestion {
  nextSuggestedContactDate: string;
  seasonalCadenceTags: string[];
  aiReorderNotes: string;
}

/** Local calendar YYYY-MM-DD (no UTC shift). */
export function formatLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseIsoDate(iso: string): Date {
  const [y, m, day] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, day!);
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

/** Third Sunday of June in the given year (local). */
export function thirdSundayOfJune(year: number): Date {
  const june1 = new Date(year, 5, 1);
  const dow = june1.getDay(); // 0 = Sunday
  const firstSunday = dow === 0 ? june1 : addDays(june1, 7 - dow);
  return addDays(firstSunday, 14);
}

function nextAnnualDate(monthIndex: number, day: number, asOf: Date): Date {
  const asOfDay = startOfLocalDay(asOf);
  let candidate = new Date(asOfDay.getFullYear(), monthIndex, day);
  if (candidate < asOfDay) {
    candidate = new Date(asOfDay.getFullYear() + 1, monthIndex, day);
  }
  return candidate;
}

function fathersDayContactDate(asOf: Date): Date {
  const asOfDay = startOfLocalDay(asOf);
  let fathersDay = thirdSundayOfJune(asOfDay.getFullYear());
  let contact = addDays(fathersDay, -42); // 6 weeks before
  if (contact < asOfDay) {
    fathersDay = thirdSundayOfJune(asOfDay.getFullYear() + 1);
    contact = addDays(fathersDay, -42);
  }
  return contact;
}

function atsContactDate(lastOrderDate: string | null, asOf: Date): Date {
  const base = lastOrderDate ? parseIsoDate(lastOrderDate) : startOfLocalDay(asOf);
  return addDays(base, 90);
}

/** Contact date for a season relative to `asOf` (and last order for ATS). */
export function contactDateForSeason(
  season: ApparelSeason,
  asOf: Date,
  lastOrderDate: string | null,
): Date {
  switch (season) {
    case 'fathers_day':
      return fathersDayContactDate(asOf);
    case 'holiday_christmas':
      return nextAnnualDate(7, 1, asOf); // August 1
    case 'spring_summer':
      return nextAnnualDate(1, 1, asOf); // February 1
    case 'fall_winter':
      return nextAnnualDate(6, 1, asOf); // July 1
    case 'ats_in_season':
      return atsContactDate(lastOrderDate, asOf);
  }
}

function buildPitch(input: {
  season: ApparelSeason;
  accountName: string;
  lineLabel: string;
  lastOrderDate: string | null;
  contactDate: string;
}): string {
  const { season, accountName, lineLabel, lastOrderDate, contactDate } = input;
  const seasonLabel = apparelSeasonLabel(season);
  const orderClause = lastOrderDate
    ? `Last order was ${lastOrderDate}`
    : 'No prior order date is on file';

  switch (season) {
    case 'fathers_day':
      return `${seasonLabel} is 6 weeks out — time to check ${accountName}'s ${lineLabel} graphic tee sell-through and lock a reorder. ${orderClause}; aim to reconnect by ${contactDate}.`;
    case 'holiday_christmas':
      return `${seasonLabel} prep starts now — touch base with ${accountName} on ${lineLabel} gift and graphic programs before August fills up. ${orderClause}; suggested outreach date is ${contactDate}.`;
    case 'spring_summer':
      return `Spring/Summer open-to-buy is forming — confirm ${accountName}'s ${lineLabel} sizes and bestsellers before the book locks. ${orderClause}; plan outreach for ${contactDate}.`;
    case 'fall_winter':
      return `Fall/Winter planning is underway — review ${accountName}'s ${lineLabel} sell-through and set a reorder before July. ${orderClause}; suggested contact is ${contactDate}.`;
    case 'ats_in_season':
      return `ATS in-season window is approaching for ${accountName} — check ${lineLabel} stock and capture a fill-in reorder. ${orderClause}; reconnect around ${contactDate}.`;
  }
}

/**
 * Deterministic seasonal reorder contact suggestion (no LLM).
 * Uses `lastSeason` when present; otherwise ATS In-Season from last order / asOf.
 */
export function computeReorderSuggestion(input: ComputeReorderSuggestionInput): ReorderSuggestion {
  const asOf = input.asOf ?? new Date();
  const lineLabel = input.lineLabel?.trim() || 'Old Guys Rule';
  const season: ApparelSeason = input.lastSeason ?? 'ats_in_season';
  const contact = contactDateForSeason(season, asOf, input.lastOrderDate);
  const nextSuggestedContactDate = formatLocalIsoDate(contact);

  return {
    nextSuggestedContactDate,
    seasonalCadenceTags: [season],
    aiReorderNotes: buildPitch({
      season,
      accountName: input.accountName.trim() || 'this account',
      lineLabel,
      lastOrderDate: input.lastOrderDate,
      contactDate: nextSuggestedContactDate,
    }),
  };
}
