export type LookalikeSeedProfile = {
  name: string;
  city: string;
  territoryCode: string | null;
  category: string | null;
  retailCategory: string | null;
};

export function buildLookalikeTraitBrief(seeds: LookalikeSeedProfile[]): string {
  const lines = seeds.map((seed) => {
    const geo = [seed.city.trim(), seed.territoryCode?.trim().toUpperCase()]
      .filter(Boolean)
      .join(', ');
    const channel = seed.category?.trim() || 'unknown';
    const retail = seed.retailCategory?.trim() || 'unknown';
    return `- ${seed.name.trim()} (${geo || 'location unknown'}); channel=${channel}; retail=${retail}`;
  });
  return [
    'Recurring traits from verified historical OGR purchasers in Oregon and Washington.',
    'Use store type, location, channel, and merchandise orientation only.',
    'Do not treat past OGR purchase as a trait to copy onto discoveries.',
    ...lines,
  ]
    .join('\n')
    .slice(0, 4000);
}
