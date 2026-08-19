import { matchCollapsedRows } from '@/lib/accountImport/matchRetailers';
import type { CollapsedImportRow } from '@/lib/accountImport/types';
import { importFingerprint } from '@/lib/accountImport/fingerprint';
import { normalizeProspectName } from '@/lib/prospectListImport';
import {
  territoryCodeFromImportState,
  regionLabelFromStateCode,
} from '@/lib/accountImport/territory';
import type { ThinContact, ThinRetailer, ThinRla } from '@/lib/accountImport/matchRetailers';
import type { AccountImportMatchDecision, LookalikeCandidateStatus } from '@/types/database';
import type { PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';

export type ProposedLookalike = {
  name: string;
  city: string;
  state: string;
  website: string | null;
  whySimilar: string;
};

export function collapsedRowFromLookalike(
  candidate: ProposedLookalike,
  rowNumber = 1,
): CollapsedImportRow | null {
  const name = candidate.name.trim();
  if (!name) return null;
  const stateCode = territoryCodeFromImportState(candidate.state);
  const city = candidate.city.trim() || null;
  const postal5 = null;
  return {
    rowNumber,
    raw: { 'Business name': name },
    name,
    nameNormalized: normalizeProspectName(name),
    street: null,
    city,
    stateCode,
    region: regionLabelFromStateCode(stateCode),
    postalCode: null,
    postal5,
    formerRepCode: null,
    storeTypeRaw: null,
    category: 'other' as PrimaryRetailChannel,
    contactName: null,
    email: null,
    emailImportable: false,
    phone: null,
    website: candidate.website?.trim() || null,
    externalId: null,
    rawAddressText: [city, candidate.state].filter(Boolean).join(', '),
    addressUncertain: true,
    fingerprint: importFingerprint({ name, stateCode, postal5 }),
    warnings: [],
    inFileDuplicateOf: null,
    collapsedFromRowNumbers: [rowNumber],
  };
}

export function lookalikeStatusForMatch(
  decision: AccountImportMatchDecision,
): LookalikeCandidateStatus {
  return decision === 'create_retailer' ? 'proposed' : 'already_in_crm';
}

export function classifyLookalikeCandidate(input: {
  candidate: ProposedLookalike;
  retailers: ThinRetailer[];
  rlas: ThinRla[];
  contacts: ThinContact[];
}): {
  matchDecision: AccountImportMatchDecision;
  status: LookalikeCandidateStatus;
} | null {
  const row = collapsedRowFromLookalike(input.candidate);
  if (!row) return null;
  const [matched] = matchCollapsedRows({
    rows: [row],
    retailers: input.retailers,
    rlas: input.rlas,
    contacts: input.contacts,
    priorFingerprints: [],
    sourceType: 'historical_customer',
  });
  if (!matched) return null;
  return {
    matchDecision: matched.matchDecision,
    status: lookalikeStatusForMatch(matched.matchDecision),
  };
}
