/** Import-safe state → territory code. Never defaults to BC. */

const STATE_ALIASES: Record<string, 'or' | 'wa'> = {
  OR: 'or',
  OREGON: 'or',
  WA: 'wa',
  WASHINGTON: 'wa',
};

export function territoryCodeFromImportState(raw: string | null | undefined): 'or' | 'wa' | null {
  const key = (raw ?? '').trim().toUpperCase().replace(/\./g, '');
  if (!key) return null;
  return STATE_ALIASES[key] ?? null;
}

export function regionLabelFromStateCode(code: 'or' | 'wa' | null): 'Oregon' | 'Washington' | null {
  if (code === 'or') return 'Oregon';
  if (code === 'wa') return 'Washington';
  return null;
}

/** ZIP prefix suggestion only — never auto-commit. */
export function suggestedStateFromPostal5(postal5: string | null | undefined): 'or' | 'wa' | null {
  const zip = (postal5 ?? '').replace(/\D/g, '').slice(0, 5);
  if (zip.length !== 5) return null;
  if (zip.startsWith('97')) return 'or';
  if (zip.startsWith('98') || zip.startsWith('99')) return 'wa';
  return null;
}

export function isOtherUsState(raw: string | null | undefined): boolean {
  const key = (raw ?? '').trim().toUpperCase().replace(/\./g, '');
  if (!key || STATE_ALIASES[key]) return false;
  const others = new Set([
    'AL',
    'AK',
    'AZ',
    'AR',
    'CA',
    'CO',
    'CT',
    'DE',
    'FL',
    'GA',
    'HI',
    'ID',
    'IL',
    'IN',
    'IA',
    'KS',
    'KY',
    'LA',
    'ME',
    'MD',
    'MA',
    'MI',
    'MN',
    'MS',
    'MO',
    'MT',
    'NE',
    'NV',
    'NH',
    'NJ',
    'NM',
    'NY',
    'NC',
    'ND',
    'OH',
    'OK',
    'PA',
    'RI',
    'SC',
    'SD',
    'TN',
    'TX',
    'UT',
    'VT',
    'VA',
    'WV',
    'WI',
    'WY',
    'DC',
    'CALIFORNIA',
    'IDAHO',
  ]);
  return others.has(key);
}
