import {
  ACCOUNT_IMPORT_TARGET_FIELDS,
  type AccountImportColumnMap,
  type AccountImportTargetField,
} from '@/lib/accountImport/types';

const ALIASES: Record<AccountImportTargetField, string[]> = {
  businessName: [
    'business name',
    'account',
    'account name',
    'store',
    'store name',
    'customer',
    'customer name',
    'ship to name',
    'business',
    'shop',
    'retailer',
    'company',
    'company name',
  ],
  shipTo: [
    'ship to',
    'shipping address',
    'address',
    'ship-to',
    'shipto',
    'full address',
    'mailing address',
  ],
  street: ['street', 'street address', 'address 1', 'address1', 'addr1'],
  city: ['city', 'town'],
  state: ['state', 'st', 'province', 'region'],
  postalCode: ['zip', 'zip code', 'zipcode', 'postal', 'postal code', 'postcode'],
  formerRepCode: ['former rep', 'rep', 'rep code', 'former rep code', 'sales rep', 'repcode'],
  storeType: ['store type', 'type', 'category', 'channel', 'retail category'],
  contactName: ['contact', 'buyer', 'name', 'contact name', 'buyer name'],
  email: ['email', 'e-mail', 'email address'],
  phone: ['phone', 'telephone', 'phone number', 'tel'],
  website: ['website', 'url', 'web', 'site'],
  externalId: ['external id', 'external_id', 'id', 'account id'],
};

function normHeader(header: string): string {
  return header.toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function proposeColumnMap(headers: string[]): AccountImportColumnMap {
  const used = new Set<string>();
  const map: AccountImportColumnMap = {};
  const normalized = headers.map((h) => ({ raw: h, key: normHeader(h) }));

  for (const field of ACCOUNT_IMPORT_TARGET_FIELDS) {
    const aliases = ALIASES[field];
    const hit = normalized.find((h) => {
      if (used.has(h.raw)) return false;
      return aliases.some((alias) => h.key === alias || h.key.startsWith(`${alias} `));
    });
    if (hit) {
      map[field] = hit.raw;
      used.add(hit.raw);
    }
  }

  // Prefer Ship To Name as business name when both "name" and "ship to" exist.
  const shipToName = normalized.find((h) => h.key.includes('ship to name') && !used.has(h.raw));
  if (shipToName && !map.businessName) {
    map.businessName = shipToName.raw;
  }

  return map;
}

export function mappedValue(
  row: Record<string, string>,
  map: AccountImportColumnMap,
  field: AccountImportTargetField,
): string {
  const header = map[field];
  if (!header) return '';
  return (row[header] ?? '').trim();
}

export function isBusinessNameMapped(map: AccountImportColumnMap): boolean {
  return Boolean(map.businessName?.trim());
}
