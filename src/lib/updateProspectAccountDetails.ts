import { isOpsAssignmentAllowed } from '@/lib/operationalTerritories/allowedOperationalTerritories';
import {
  locationChangedBetween,
  locationFingerprintFromProspect,
} from '@/lib/operationalTerritories/locationFingerprint';
import { resolveOperationalTerritoryReviewForProspect } from '@/lib/operationalTerritories/reviewQueue';
import { syncOperationalTerritoryReview } from '@/lib/operationalTerritories/syncOperationalTerritoryReview';
import {
  insertRetailerFieldChanges,
  isVerifiedIdentityStatus,
  VERIFIED_IDENTITY_FIELDS,
  type VerifiedIdentityField,
} from '@/lib/retailerFieldChanges';
import {
  mapProspectRow,
  mergeProspectIdentity,
  PROSPECT_SELECT,
  type Prospect,
  type ProspectListRow,
} from '@/lib/prospects';
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type ProspectsUpdate = Database['public']['Tables']['prospects']['Update'];

export type AccountDetailsDraft = {
  name: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  region: string;
  postalCode: string;
  fit: string;
  /** Store territory UUID (`prospects.territory_id`). Never an SLT id. */
  territoryId: string;
  /** Ops territory UUID or null to clear. Never an SLT id. */
  operationalTerritoryId: string | null;
};

export type UpdateProspectAccountDetailsOptions = {
  salesLineId?: string | null;
  retailerLineAccountId?: string | null;
  /** When known (e.g. from territory), enables stricter postal checks. */
  countryCode?: string | null;
  /** Draft store territory code (bc/ab/ca/or/wa) for ops allowlist checks. */
  storeTerritoryCode?: string | null;
  /** Active ops registry rows — used to resolve code for allowlist validation. */
  operationalTerritories?: Array<{ id: string; code: string }>;
  /** Staff actor for audit + queue resolution (API path). */
  actorId?: string | null;
  /** User-scoped Supabase client (API path). Defaults to browser client. */
  client?: SupabaseClient<Database>;
};

export type UpdateProspectAccountDetailsResult =
  | { ok: true; data: Prospect; auditWarning: string | null; reviewWarning: string | null }
  | { ok: false; error: string };

const IDENTITY_FIELD_PATHS = {
  name: 'name',
  phone: 'phone',
  website: 'website',
  address: 'address',
  city: 'city',
  region: 'region',
  postalCode: 'postal_code',
  fit: 'fit',
} as const;

type DraftKey = keyof typeof IDENTITY_FIELD_PATHS;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function normalizeWebsite(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function normalizePostal(raw: string): string | null {
  const t = raw.trim();
  return t.length > 0 ? t : null;
}

function normalizeNotNullText(raw: string): string {
  return raw.trim();
}

export function draftFromProspect(prospect: Prospect): AccountDetailsDraft {
  return {
    name: prospect.name,
    phone: prospect.phone ?? '',
    website: prospect.website ?? '',
    address: prospect.address ?? '',
    city: prospect.city,
    region: prospect.region,
    postalCode: prospect.postalCode ?? '',
    fit: prospect.fit ?? '',
    territoryId: prospect.territoryId,
    operationalTerritoryId: prospect.operationalTerritoryId,
  };
}

export function validateAccountDetailsDraft(
  draft: AccountDetailsDraft,
  options?: { countryCode?: string | null },
): string | null {
  if (!draft.name.trim()) return 'Business name is required.';
  if (!draft.city.trim()) return 'City is required.';
  if (!draft.region.trim()) return 'Region is required.';
  if (!draft.territoryId.trim()) return 'Store territory is required.';

  const website = draft.website.trim();
  if (website) {
    try {
      const url = new URL(website.includes('://') ? website : `https://${website}`);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return 'Website must be an http(s) URL.';
      }
    } catch {
      return 'Website must be a valid URL.';
    }
  }

  const phone = draft.phone.trim();
  if (phone && digitsOnly(phone).length < 7) {
    return 'Phone must include at least 7 digits.';
  }

  const postal = draft.postalCode.trim();
  const country = options?.countryCode?.trim().toUpperCase() ?? '';
  if (postal && country === 'US' && !/^\d{5}(-\d{4})?$/.test(postal)) {
    return 'Postal/ZIP must be a 5-digit US ZIP (or ZIP+4).';
  }
  if (postal && country === 'CA' && postal.replace(/\s/g, '').length < 3) {
    return 'Postal code looks too short.';
  }

  return null;
}

/**
 * Reject cross-state ops assignments. Clear (null) is always allowed.
 * BC/AB may only clear or keep existing — never set a new ops UUID.
 */
export function validateOperationalTerritoryAssignment(input: {
  storeTerritoryCode: string | null | undefined;
  nextOperationalTerritoryId: string | null;
  existingOperationalTerritoryId: string | null;
  operationalTerritories?: Array<{ id: string; code: string }>;
}): string | null {
  const nextId = input.nextOperationalTerritoryId;
  if (nextId == null) return null;
  if (nextId === input.existingOperationalTerritoryId) return null;

  const options = input.operationalTerritories ?? [];
  const match = options.find((t) => t.id === nextId);
  if (!match) {
    return 'Operational territory is not in the active registry.';
  }

  const allowed = isOpsAssignmentAllowed({
    storeTerritoryCode: input.storeTerritoryCode,
    nextOperationalTerritoryId: nextId,
    nextOperationalTerritoryCode: match.code,
    existingOperationalTerritoryId: input.existingOperationalTerritoryId,
  });
  if (!allowed) {
    return 'Operational territory is not allowed for this store territory.';
  }
  return null;
}

function currentValue(prospect: Prospect, key: DraftKey): string | null {
  switch (key) {
    case 'name':
      return prospect.name;
    case 'phone':
      return prospect.phone ?? '';
    case 'website':
      return prospect.website;
    case 'address':
      return prospect.address ?? '';
    case 'city':
      return prospect.city;
    case 'region':
      return prospect.region;
    case 'postalCode':
      return prospect.postalCode;
    case 'fit':
      return prospect.fit ?? '';
  }
}

function normalizedDraftValue(draft: AccountDetailsDraft, key: DraftKey): string | null {
  switch (key) {
    case 'name':
    case 'city':
    case 'region':
      return normalizeNotNullText(draft[key]);
    case 'phone':
    case 'address':
    case 'fit':
      return normalizeNotNullText(draft[key]);
    case 'website':
      return normalizeWebsite(draft.website);
    case 'postalCode':
      return normalizePostal(draft.postalCode);
  }
}

function valuesEqual(a: string | null, b: string | null): boolean {
  const left = a ?? '';
  const right = b ?? '';
  return left === right;
}

/**
 * Build sparse DB patch of only changed identity fields + optional territory ids.
 * Never includes sales_line_territory_id or other RLA columns.
 */
export function buildAccountDetailsPatch(
  existing: Prospect,
  draft: AccountDetailsDraft,
): {
  patch: ProspectsUpdate;
  changes: Array<{ fieldPath: string; oldValue: unknown; newValue: unknown }>;
} {
  const patch: ProspectsUpdate = {};
  const changes: Array<{ fieldPath: string; oldValue: unknown; newValue: unknown }> = [];

  (Object.keys(IDENTITY_FIELD_PATHS) as DraftKey[]).forEach((key) => {
    const next = normalizedDraftValue(draft, key);
    const prev = currentValue(existing, key);
    if (valuesEqual(prev, next)) return;
    const fieldPath = IDENTITY_FIELD_PATHS[key];
    (patch as Record<string, unknown>)[fieldPath] = next;
    changes.push({ fieldPath, oldValue: prev, newValue: next });
  });

  const nextTerritoryId = draft.territoryId.trim();
  if (nextTerritoryId && nextTerritoryId !== existing.territoryId) {
    patch.territory_id = nextTerritoryId;
    changes.push({
      fieldPath: 'territory_id',
      oldValue: existing.territoryId,
      newValue: nextTerritoryId,
    });
  }

  const nextOpsId = draft.operationalTerritoryId;
  const prevOpsId = existing.operationalTerritoryId;
  if (nextOpsId !== prevOpsId) {
    patch.operational_territory_id = nextOpsId;
    changes.push({
      fieldPath: 'operational_territory_id',
      oldValue: prevOpsId,
      newValue: nextOpsId,
    });
  }

  return { patch, changes };
}

export function changedVerifiedIdentityFields(
  existing: Prospect,
  draft: AccountDetailsDraft,
): VerifiedIdentityField[] {
  const { changes } = buildAccountDetailsPatch(existing, draft);
  return changes
    .map((c) => c.fieldPath)
    .filter((path): path is VerifiedIdentityField =>
      (VERIFIED_IDENTITY_FIELDS as readonly string[]).includes(path),
    );
}

export function shouldConfirmProtectedIdentityEdit(
  existing: Prospect,
  draft: AccountDetailsDraft,
): boolean {
  if (!isVerifiedIdentityStatus(existing)) return false;
  return changedVerifiedIdentityFields(existing, draft).length > 0;
}

/**
 * Patch only changed account identity fields (+ store / ops territory) on prospects.
 * Merges RLA commercial fields from `existing`. Audit insert is best-effort.
 * Never writes sales_line_territory_id.
 * Resolves ops review queue only when a non-null operational_territory_id is confirmed.
 */
export async function updateProspectAccountDetails(
  existing: Prospect,
  draft: AccountDetailsDraft,
  options?: UpdateProspectAccountDetailsOptions,
): Promise<UpdateProspectAccountDetailsResult> {
  const validationError = validateAccountDetailsDraft(draft, {
    countryCode: options?.countryCode,
  });
  if (validationError) return { ok: false, error: validationError };

  const storeTerritoryCode = options?.storeTerritoryCode ?? existing.territoryCode;
  const opsError = validateOperationalTerritoryAssignment({
    storeTerritoryCode,
    nextOperationalTerritoryId: draft.operationalTerritoryId,
    existingOperationalTerritoryId: existing.operationalTerritoryId,
    operationalTerritories: options?.operationalTerritories,
  });
  if (opsError) return { ok: false, error: opsError };

  const db = options?.client ?? supabase;

  const { patch, changes } = buildAccountDetailsPatch(existing, draft);
  if (changes.length === 0) {
    return { ok: true, data: existing, auditWarning: null, reviewWarning: null };
  }

  const fingerprintBefore = locationFingerprintFromProspect(existing);

  const { data, error } = await db
    .from('prospects')
    .update(patch)
    .eq('id', existing.id)
    .select(PROSPECT_SELECT)
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Save failed' };
  }

  const merged = mergeProspectIdentity(existing, mapProspectRow(data as ProspectListRow));
  const fingerprintAfter = locationFingerprintFromProspect(merged);
  const locationChanged = locationChangedBetween(fingerprintBefore, fingerprintAfter);

  let actorId = options?.actorId ?? null;
  if (actorId == null && !options?.client) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    actorId = user?.id ?? null;
  }

  const audit = await insertRetailerFieldChanges(
    db,
    changes.map((c) => ({
      retailerId: existing.id,
      fieldPath: c.fieldPath,
      oldValue: c.oldValue,
      newValue: c.newValue,
      source: 'user' as const,
      actorId,
      salesLineId: options?.salesLineId ?? null,
      retailerLineAccountId: options?.retailerLineAccountId ?? null,
      status: 'applied' as const,
    })),
  );

  let auditWarning: string | null = null;
  if (!audit.ok) {
    auditWarning = `Account saved, but the change log could not be written: ${audit.error}`;
  }

  const opsChanged = changes.some((c) => c.fieldPath === 'operational_territory_id');
  const confirmedNonNull =
    opsChanged && draft.operationalTerritoryId != null && draft.operationalTerritoryId !== '';
  if (confirmedNonNull) {
    const queue = await resolveOperationalTerritoryReviewForProspect(
      existing.id,
      { resolution: 'assigned', resolvedBy: actorId },
      db,
    );
    if (!queue.ok) {
      const qWarn = `Account saved, but the review queue could not be updated: ${queue.error}`;
      auditWarning = auditWarning ? `${auditWarning} ${qWarn}` : qWarn;
    }
  }

  let reviewWarning: string | null = null;
  const sync = await syncOperationalTerritoryReview({
    prospect: merged,
    locationChanged,
    opsAssignedThisWrite: confirmedNonNull,
    client: db,
  });
  if (!sync.ok) {
    reviewWarning = `Account saved, but operational territory review could not be updated: ${sync.error}`;
  }

  return { ok: true, data: merged, auditWarning, reviewWarning };
}
