import {
  clampSecondaryChannels,
  isPrimaryRetailChannel,
  normalizeLifestyleThemes,
  normalizePrimaryChannels,
  normalizeRetailCapabilities,
  normalizeVenueContexts,
  type LifestyleTheme,
  type PrimaryRetailChannel,
  type RetailCapability,
  type VenueContext,
} from '@/lib/crmRetailTaxonomy';
import { normalizeReviewValue, unwrapJsonValue } from '@/lib/accountImport/reviewStatus';
import type { AccountResearchCitationPlatform } from '@/types/database';
import type { Prospect } from '@/lib/prospects';

export const SUGGESTION_FIELD_PATHS = [
  'website',
  'address',
  'city',
  'region',
  'postal_code',
  'phone',
  'name',
  'retail_category',
  'apparel_capability',
  'category',
  'lifestyle_themes',
  'secondary_channels',
  'retail_subchannels',
  'venue_contexts',
  'retail_capabilities',
] as const;

export type SuggestionFieldPath = (typeof SUGGESTION_FIELD_PATHS)[number];

export type SuggestionFieldKind = 'scalar' | 'json_array';

export type SuggestionFieldDef = {
  fieldPath: SuggestionFieldPath;
  kind: SuggestionFieldKind;
  blankOnly: boolean;
  requiresVerifiedConfirm: boolean;
  citationPlatforms: ReadonlyArray<AccountResearchCitationPlatform>;
  maxNewItems?: number;
};

export const SUGGESTION_FIELD_DEFS: Record<SuggestionFieldPath, SuggestionFieldDef> = {
  website: {
    fieldPath: 'website',
    kind: 'scalar',
    blankOnly: false,
    requiresVerifiedConfirm: true,
    citationPlatforms: ['website', 'shopify'],
  },
  address: {
    fieldPath: 'address',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: true,
    citationPlatforms: ['website', 'directory'],
  },
  city: {
    fieldPath: 'city',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: true,
    citationPlatforms: ['website', 'directory'],
  },
  region: {
    fieldPath: 'region',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: true,
    citationPlatforms: ['website'],
  },
  postal_code: {
    fieldPath: 'postal_code',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: true,
    citationPlatforms: ['website', 'directory'],
  },
  phone: {
    fieldPath: 'phone',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: true,
    citationPlatforms: ['website', 'directory'],
  },
  name: {
    fieldPath: 'name',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: true,
    citationPlatforms: ['website'],
  },
  retail_category: {
    fieldPath: 'retail_category',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website'],
  },
  apparel_capability: {
    fieldPath: 'apparel_capability',
    kind: 'scalar',
    blankOnly: true,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website', 'shopify'],
  },
  category: {
    fieldPath: 'category',
    kind: 'scalar',
    blankOnly: false,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website'],
  },
  lifestyle_themes: {
    fieldPath: 'lifestyle_themes',
    kind: 'json_array',
    blankOnly: false,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website', 'instagram', 'facebook', 'tiktok', 'pinterest'],
    maxNewItems: 8,
  },
  secondary_channels: {
    fieldPath: 'secondary_channels',
    kind: 'json_array',
    blankOnly: false,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website'],
    maxNewItems: 3,
  },
  retail_subchannels: {
    fieldPath: 'retail_subchannels',
    kind: 'json_array',
    blankOnly: false,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website'],
    maxNewItems: 8,
  },
  venue_contexts: {
    fieldPath: 'venue_contexts',
    kind: 'json_array',
    blankOnly: false,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website'],
    maxNewItems: 8,
  },
  retail_capabilities: {
    fieldPath: 'retail_capabilities',
    kind: 'json_array',
    blankOnly: false,
    requiresVerifiedConfirm: false,
    citationPlatforms: ['website'],
    maxNewItems: 8,
  },
};

export function isSuggestionFieldPath(value: string): value is SuggestionFieldPath {
  return (SUGGESTION_FIELD_PATHS as readonly string[]).includes(value);
}

export function normalizeSuggestionWebsite(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function isBlankScalar(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  return false;
}

export function prospectBaselineValue(prospect: Prospect, fieldPath: SuggestionFieldPath): unknown {
  switch (fieldPath) {
    case 'website':
      return prospect.website;
    case 'address':
      return prospect.address ?? '';
    case 'city':
      return prospect.city;
    case 'region':
      return prospect.region;
    case 'postal_code':
      return prospect.postalCode;
    case 'phone':
      return prospect.phone ?? '';
    case 'name':
      return prospect.name;
    case 'retail_category':
      return prospect.retailCategory;
    case 'apparel_capability':
      return prospect.apparelCapability;
    case 'category':
      return prospect.category;
    case 'lifestyle_themes':
      return prospect.lifestyleThemes;
    case 'secondary_channels':
      return prospect.secondaryChannels;
    case 'retail_subchannels':
      return prospect.retailSubchannels;
    case 'venue_contexts':
      return prospect.venueContexts;
    case 'retail_capabilities':
      return prospect.retailCapabilities;
  }
}

export function valuesEqualForSuggestion(a: unknown, b: unknown): boolean {
  const left = unwrapJsonValue(a);
  const right = unwrapJsonValue(b);
  if (Array.isArray(left) && Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return normalizeReviewValue(left) === normalizeReviewValue(right);
}

export function canSuggestField(
  prospect: Prospect,
  fieldPath: SuggestionFieldPath,
  suggestedValue: unknown,
): boolean {
  const def = SUGGESTION_FIELD_DEFS[fieldPath];
  const current = prospectBaselineValue(prospect, fieldPath);
  if (valuesEqualForSuggestion(current, suggestedValue)) return false;

  if (def.blankOnly) {
    if (fieldPath === 'apparel_capability') {
      const currentText = typeof current === 'string' ? current.trim().toLowerCase() : '';
      if (!isBlankScalar(current) && currentText !== 'unknown') return false;
    } else if (!isBlankScalar(current)) {
      return false;
    }
  }
  return true;
}

export function normalizeScalarSuggestion(
  fieldPath: SuggestionFieldPath,
  raw: unknown,
): string | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return null;
  const text = typeof raw === 'string' ? raw.trim() : String(raw).trim();
  if (!text) return null;

  if (fieldPath === 'website') return normalizeSuggestionWebsite(text);
  if (fieldPath === 'category' && !isPrimaryRetailChannel(text)) return null;
  return text;
}

export function normalizeJsonArraySuggestion(
  fieldPath: SuggestionFieldPath,
  raw: unknown,
  prospect: Prospect,
): unknown[] | null {
  const values = Array.isArray(raw) ? raw.map((v) => String(v)) : [];
  if (values.length === 0) return null;

  switch (fieldPath) {
    case 'lifestyle_themes':
      return normalizeLifestyleThemes(values);
    case 'secondary_channels': {
      const primary = isPrimaryRetailChannel(prospect.category) ? prospect.category : null;
      return clampSecondaryChannels(primary, normalizePrimaryChannels(values), 3);
    }
    case 'retail_subchannels':
      return values.filter((v) => v.trim().length > 0).slice(0, 8);
    case 'venue_contexts':
      return normalizeVenueContexts(values);
    case 'retail_capabilities':
      return normalizeRetailCapabilities(values);
    default:
      return null;
  }
}

export function mergeJsonArraySuggestion(
  fieldPath: SuggestionFieldPath,
  prospect: Prospect,
  additions: readonly string[],
):
  | LifestyleTheme[]
  | PrimaryRetailChannel[]
  | VenueContext[]
  | RetailCapability[]
  | string[]
  | null {
  const def = SUGGESTION_FIELD_DEFS[fieldPath];
  const current = prospectBaselineValue(prospect, fieldPath);
  const currentList = Array.isArray(current) ? current.map(String) : [];
  const normalized = normalizeJsonArraySuggestion(fieldPath, additions, prospect);
  if (!normalized || normalized.length === 0) return null;

  const merged = [...new Set([...currentList, ...normalized.map(String)])];
  const max = def.maxNewItems ? currentList.length + def.maxNewItems : merged.length;
  const capped = merged.slice(0, max);
  if (valuesEqualForSuggestion(currentList, capped)) return null;
  return capped as
    LifestyleTheme[] | PrimaryRetailChannel[] | VenueContext[] | RetailCapability[] | string[];
}

export function citationMatchesFieldPlatforms(
  platform: AccountResearchCitationPlatform,
  fieldPath: SuggestionFieldPath,
): boolean {
  return SUGGESTION_FIELD_DEFS[fieldPath].citationPlatforms.includes(platform);
}
