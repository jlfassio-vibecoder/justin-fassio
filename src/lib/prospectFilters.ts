import type { Prospect } from '@/lib/prospects';

export interface ProspectFilterOptions {
  search: string;
  region: string;
  channel: string;
}

export function filterProspects(
  prospects: Prospect[],
  { search, region, channel }: ProspectFilterOptions,
): Prospect[] {
  const q = search.trim().toLowerCase();
  return prospects.filter((p) => {
    if (region !== 'ALL' && p.region !== region) return false;
    if (channel !== 'ALL' && p.category !== channel) return false;
    if (q) {
      const hay =
        `${p.name} ${p.city} ${p.address} ${p.fit} ${p.externalId ?? ''} ${p.website ?? ''} ${p.retailCategory ?? ''} ${p.priority ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
