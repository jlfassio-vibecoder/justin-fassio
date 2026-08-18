import { parseShipTo } from '@/lib/accountImport/addressParse';
import { mappedValue } from '@/lib/accountImport/columnMap';
import { importFingerprint } from '@/lib/accountImport/fingerprint';
import {
  regionLabelFromStateCode,
  territoryCodeFromImportState,
} from '@/lib/accountImport/territory';
import type { AccountImportColumnMap, NormalizedImportRow } from '@/lib/accountImport/types';
import { mapRetailCategoryToChannel, normalizeProspectName } from '@/lib/prospectListImport';
import type { PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isImportableEmail(raw: string | null | undefined): boolean {
  const email = (raw ?? '').trim().toLowerCase();
  if (!email) return false;
  return EMAIL_RE.test(email);
}

function emptyToNull(value: string): string | null {
  const t = value.trim();
  return t ? t : null;
}

function collapseName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function mapStoreTypeToCategory(raw: string | null): {
  category: PrimaryRetailChannel;
  unmapped: boolean;
} {
  if (!raw?.trim()) return { category: 'other', unmapped: true };
  const category = mapRetailCategoryToChannel(raw);
  const unmapped = category === 'gift_novelty_souvenir' && !/gift|souvenir|novelty/i.test(raw);
  return { category, unmapped };
}

function withFingerprint(row: NormalizedImportRow): NormalizedImportRow {
  return {
    ...row,
    nameNormalized: normalizeProspectName(row.name),
    fingerprint: importFingerprint({
      name: row.name,
      stateCode: row.stateCode,
      postal5: row.postal5,
    }),
    region: regionLabelFromStateCode(row.stateCode),
  };
}

export function applyNormalizedEdits(
  row: NormalizedImportRow,
  edits: {
    name?: string;
    street?: string | null;
    city?: string | null;
    stateCode?: 'or' | 'wa' | null;
    postalCode?: string | null;
  },
): NormalizedImportRow {
  const postalCode = edits.postalCode === undefined ? row.postalCode : edits.postalCode;
  const postal5 = postalCode ? postalCode.replace(/\D/g, '').slice(0, 5) || null : null;
  return withFingerprint({
    ...row,
    name: edits.name !== undefined ? collapseName(edits.name) : row.name,
    street: edits.street === undefined ? row.street : edits.street,
    city: edits.city === undefined ? row.city : edits.city,
    stateCode: edits.stateCode === undefined ? row.stateCode : edits.stateCode,
    postalCode,
    postal5,
    addressUncertain: false,
  });
}

export function normalizeMappedRow(input: {
  rowNumber: number;
  raw: Record<string, string>;
  map: AccountImportColumnMap;
}): NormalizedImportRow {
  const name = collapseName(mappedValue(input.raw, input.map, 'businessName'));
  const rawAddress =
    mappedValue(input.raw, input.map, 'shipTo') ||
    [mappedValue(input.raw, input.map, 'street'), mappedValue(input.raw, input.map, 'city')]
      .filter(Boolean)
      .join(', ');
  const parsed = parseShipTo(
    rawAddress ||
      [mappedValue(input.raw, input.map, 'city'), mappedValue(input.raw, input.map, 'state')]
        .filter(Boolean)
        .join(', '),
  );

  const mappedStreet = emptyToNull(mappedValue(input.raw, input.map, 'street'));
  const mappedCity = emptyToNull(mappedValue(input.raw, input.map, 'city'));
  const mappedState = emptyToNull(mappedValue(input.raw, input.map, 'state'));
  const mappedPostal = emptyToNull(mappedValue(input.raw, input.map, 'postalCode'));

  const street = mappedStreet ?? parsed.street;
  const city = mappedCity ?? parsed.city;
  const resolvedState = territoryCodeFromImportState(mappedState) ?? parsed.stateCode;
  const postalCode = mappedPostal ?? parsed.postalCode;
  const postal5 = mappedPostal
    ? mappedPostal.replace(/\D/g, '').slice(0, 5) || null
    : parsed.postal5;

  const emailRaw = emptyToNull(mappedValue(input.raw, input.map, 'email'));
  const email = emailRaw ? emailRaw.toLowerCase() : null;
  const emailImportable = email ? isImportableEmail(email) : false;

  const storeTypeRaw = emptyToNull(mappedValue(input.raw, input.map, 'storeType'));
  const store = mapStoreTypeToCategory(storeTypeRaw);

  const warnings = [...parsed.warnings];
  if (store.unmapped && storeTypeRaw) warnings.push('Store type could not be mapped confidently');
  if (!storeTypeRaw) warnings.push('Store type is blank; category set to other');
  if (email && !emailImportable)
    warnings.push('Email is present but invalid and will not be imported');
  if (parsed.uncertain) warnings.push('Address parse is uncertain');

  const fingerprint = importFingerprint({
    name,
    stateCode: resolvedState,
    postal5,
  });

  return {
    rowNumber: input.rowNumber,
    raw: input.raw,
    name,
    nameNormalized: normalizeProspectName(name),
    street,
    city,
    stateCode: resolvedState,
    region: regionLabelFromStateCode(resolvedState),
    postalCode,
    postal5,
    formerRepCode: emptyToNull(mappedValue(input.raw, input.map, 'formerRepCode')),
    storeTypeRaw,
    category: store.category,
    contactName: emptyToNull(mappedValue(input.raw, input.map, 'contactName')),
    email: emailImportable ? email : null,
    emailImportable,
    phone: emptyToNull(mappedValue(input.raw, input.map, 'phone')),
    website: emptyToNull(mappedValue(input.raw, input.map, 'website')),
    externalId: emptyToNull(mappedValue(input.raw, input.map, 'externalId')),
    rawAddressText: rawAddress.trim(),
    addressUncertain: parsed.uncertain,
    fingerprint,
    warnings,
  };
}

export function normalizeWorkbookRows(
  rows: Record<string, string>[],
  map: AccountImportColumnMap,
): NormalizedImportRow[] {
  return rows.map((raw, i) =>
    normalizeMappedRow({
      rowNumber: i + 1,
      raw,
      map,
    }),
  );
}
