/** Fields from Account details read view used for LLM contact research paste. */
export type AccountDetailsClipboardSource = {
  name?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  territoryName?: string | null;
  operationalTerritoryName?: string | null;
  postalCode?: string | null;
  fit?: string | null;
};

const ACCOUNT_DETAILS_CLIPBOARD_FIELDS: ReadonlyArray<{
  label: string;
  key: keyof AccountDetailsClipboardSource;
}> = [
  { label: 'Business name', key: 'name' },
  { label: 'Store phone', key: 'phone' },
  { label: 'Website', key: 'website' },
  { label: 'Street address', key: 'address' },
  { label: 'City', key: 'city' },
  { label: 'Region', key: 'region' },
  { label: 'Store territory', key: 'territoryName' },
  { label: 'Operational territory', key: 'operationalTerritoryName' },
  { label: 'Postal / ZIP', key: 'postalCode' },
  { label: 'Fit / business description', key: 'fit' },
];

/** Labeled plain-text snapshot of Account details for clipboard / LLM research. */
export function formatAccountDetailsClipboard(source: AccountDetailsClipboardSource): string {
  const lines: string[] = [];
  for (const { label, key } of ACCOUNT_DETAILS_CLIPBOARD_FIELDS) {
    const value = (source[key] ?? '').trim();
    if (!value) continue;
    lines.push(`${label}: ${value}`);
  }
  return lines.join('\n');
}
