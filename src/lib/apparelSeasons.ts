import type { ApparelSeason } from '@/types/database';

export const APPAREL_SEASONS: readonly ApparelSeason[] = [
  'spring_summer',
  'fathers_day',
  'fall_winter',
  'holiday_christmas',
  'ats_in_season',
] as const;

export const APPAREL_SEASON_LABELS: Record<ApparelSeason, string> = {
  spring_summer: 'Spring / Summer',
  fathers_day: "Father's Day",
  fall_winter: 'Fall / Winter',
  holiday_christmas: 'Holiday / Christmas',
  ats_in_season: 'ATS In-Season',
};

export function apparelSeasonLabel(season: ApparelSeason): string {
  return APPAREL_SEASON_LABELS[season];
}
