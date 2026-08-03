import type { Prospect } from '@/lib/prospects';

/** Diff keys shown in the AI Update Research confirm modal. */
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

export function buildResearchUpdateDiffs(
  current: Prospect,
  proposed: Prospect,
): { key: ResearchUpdateDiffKey; label: string; from: string; to: string }[] {
  const labels: Record<ResearchUpdateDiffKey, string> = {
    name: 'Store',
    category: 'Channel',
    region: 'Region',
    city: 'City',
    address: 'Address',
    phone: 'Phone',
    fit: 'Fit reason',
  };

  const out: { key: ResearchUpdateDiffKey; label: string; from: string; to: string }[] = [];
  for (const key of RESEARCH_UPDATE_DIFF_KEYS) {
    const from = String(current[key] ?? '');
    const to = String(proposed[key] ?? '');
    if (from !== to) {
      out.push({ key, label: labels[key], from: from || '—', to: to || '—' });
    }
  }
  return out;
}
