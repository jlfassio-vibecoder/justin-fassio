import type { ParsedAddress } from '@/lib/accountImport/types';
import {
  isOtherUsState,
  suggestedStateFromPostal5,
  territoryCodeFromImportState,
} from '@/lib/accountImport/territory';

const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;
const COUNTRY_RE =
  /(?:,\s*)?(?:united states of america|united states|u\.s\.a\.|u\.s\.|usa|us)\s*$/i;

export function extractPostal5(raw: string | null | undefined): string | null {
  const match = (raw ?? '').match(ZIP_RE);
  return match?.[1] ?? null;
}

export function parseShipTo(raw: string | null | undefined): ParsedAddress {
  const warnings: string[] = [];
  const original = (raw ?? '').trim();
  if (!original) {
    return {
      street: null,
      city: null,
      stateRaw: null,
      stateCode: null,
      postalCode: null,
      postal5: null,
      uncertain: true,
      suggestedStateCode: null,
      warnings: ['Address is empty'],
    };
  }

  let text = original.replace(COUNTRY_RE, '').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim();
  text = text.replace(/,+$/, '').trim();

  const zipMatch = text.match(ZIP_RE);
  const postalCode = zipMatch?.[0] ?? null;
  const postal5 = zipMatch?.[1] ?? null;
  if (zipMatch) {
    text = text.replace(zipMatch[0], ' ').replace(/\s+/g, ' ').replace(/,\s*,/g, ',').trim();
    text = text.replace(/,+$/, '').trim();
  }

  const parts = text
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  let stateRaw: string | null = null;
  let street: string | null = null;
  let city: string | null = null;
  let uncertain = false;

  if (parts.length >= 3) {
    stateRaw = parts[parts.length - 1] ?? null;
    city = parts[parts.length - 2] ?? null;
    street = parts.slice(0, -2).join(', ') || null;
  } else if (parts.length === 2) {
    const maybeState = territoryCodeFromImportState(parts[1]) || isOtherUsState(parts[1]);
    if (maybeState) {
      stateRaw = parts[1] ?? null;
      city = parts[0] ?? null;
      uncertain = true;
      warnings.push('Street was not separated from city');
    } else {
      street = parts[0] ?? null;
      city = parts[1] ?? null;
      uncertain = true;
      warnings.push('State was not found in the address');
    }
  } else if (parts.length === 1) {
    const tokens = (parts[0] ?? '').split(/\s+/);
    const last = tokens[tokens.length - 1] ?? '';
    const lastCode = territoryCodeFromImportState(last);
    if (lastCode || isOtherUsState(last)) {
      stateRaw = last;
      if (tokens.length >= 3) {
        city = tokens[tokens.length - 2] ?? null;
        street = tokens.slice(0, -2).join(' ') || null;
      } else {
        city = tokens.slice(0, -1).join(' ') || null;
      }
      uncertain = true;
      warnings.push('Address parts were not comma-separated');
    } else {
      street = parts[0] ?? null;
      uncertain = true;
      warnings.push('Could not split city and state from a single line');
    }
  }

  const stateCode = territoryCodeFromImportState(stateRaw);
  if (stateRaw && !stateCode && isOtherUsState(stateRaw)) {
    warnings.push('State is not Oregon or Washington');
    uncertain = true;
  }

  const suggestedStateCode = stateCode ? null : suggestedStateFromPostal5(postal5);
  if (suggestedStateCode && !stateCode) {
    warnings.push(`ZIP suggests ${suggestedStateCode.toUpperCase()} but state was not committed`);
  }

  if (!city && !stateCode) {
    uncertain = true;
  }

  if (/\bbox\b/i.test(original) && /\d+\s+\w+/.test(original)) {
    uncertain = true;
    warnings.push('Address may mix a PO Box with a street');
  }

  return {
    street: street || null,
    city: city || null,
    stateRaw,
    stateCode,
    postalCode,
    postal5,
    uncertain,
    suggestedStateCode,
    warnings,
  };
}
