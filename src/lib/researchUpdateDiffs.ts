import type { Prospect } from '@/lib/prospects';
import type { ProspectResearchMode } from '@/lib/fillBlankProspectFields';

/** Diff keys shown in the AI Update Research confirm modal (overwrite mode). */
export const RESEARCH_UPDATE_DIFF_KEYS = [
  'name',
  'category',
  'region',
  'city',
  'address',
  'phone',
  'fit',
] as const satisfies readonly (keyof Prospect)[];

export type ResearchUpdateDiffKey = (typeof RESEARCH_UPDATE_DIFF_KEYS)[number];

/** Diff keys for Fill Blank Fields mode (research + calculated allowlist). */
export const FILL_BLANK_DIFF_KEYS = [
  'name',
  'category',
  'region',
  'city',
  'address',
  'phone',
  'fit',
  'website',
  'subterritory',
  'primaryDistrict',
  'retailCategory',
  'fitScore',
  'apparelCapability',
  'verificationStatus',
  'idealOpeningUnits',
  'priority',
  'provisionalGrade',
  'nextAction',
] as const satisfies readonly (keyof Prospect)[];

export type FillBlankDiffKey = (typeof FILL_BLANK_DIFF_KEYS)[number];

export type ResearchDiff = {
  key: string;
  label: string;
  from: string;
  to: string;
};

const UPDATE_LABELS: Record<ResearchUpdateDiffKey, string> = {
  name: 'Store',
  category: 'Channel',
  region: 'Region',
  city: 'City',
  address: 'Address',
  phone: 'Phone',
  fit: 'Fit reason',
};

const FILL_BLANK_LABELS: Record<FillBlankDiffKey, string> = {
  name: 'Store',
  category: 'Channel',
  region: 'Region',
  city: 'City',
  address: 'Address',
  phone: 'Phone',
  fit: 'Fit reason',
  website: 'Website',
  subterritory: 'Subterritory',
  primaryDistrict: 'Primary district',
  retailCategory: 'Retail category',
  fitScore: 'Fit score',
  apparelCapability: 'Apparel',
  verificationStatus: 'Verification',
  idealOpeningUnits: 'Ideal opening units',
  priority: 'Priority',
  provisionalGrade: 'Provisional grade',
  nextAction: 'Next action',
};

function formatDiffValue(value: unknown): string {
  if (value == null) return '—';
  if (typeof value === 'number') return String(value);
  const s = String(value).trim();
  return s || '—';
}

export function buildResearchUpdateDiffs(
  current: Prospect,
  proposed: Prospect,
  mode: ProspectResearchMode = 'update',
): ResearchDiff[] {
  if (mode === 'fill-blanks') {
    const out: ResearchDiff[] = [];
    for (const key of FILL_BLANK_DIFF_KEYS) {
      const from = formatDiffValue(current[key]);
      const to = formatDiffValue(proposed[key]);
      if (from !== to) {
        out.push({ key, label: FILL_BLANK_LABELS[key], from, to });
      }
    }
    return out;
  }

  const out: ResearchDiff[] = [];
  for (const key of RESEARCH_UPDATE_DIFF_KEYS) {
    const from = formatDiffValue(current[key]);
    const to = formatDiffValue(proposed[key]);
    if (from !== to) {
      out.push({ key, label: UPDATE_LABELS[key], from, to });
    }
  }
  return out;
}
