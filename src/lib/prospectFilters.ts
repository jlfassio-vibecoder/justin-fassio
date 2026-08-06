import type { Prospect } from '@/lib/prospects';

export interface ProspectFilterOptions {
  search: string;
  region: string;
  channel: string;
  /** Territory code (bc/ab/…). When set and not ALL, filter by prospect.territoryCode. */
  territoryCode?: string;
}

export function filterProspects(
  prospects: Prospect[],
  { search, region, channel, territoryCode = 'ALL' }: ProspectFilterOptions,
): Prospect[] {
  const q = search.trim().toLowerCase();
  return prospects.filter((p) => {
    if (territoryCode !== 'ALL' && p.territoryCode !== territoryCode) return false;
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
