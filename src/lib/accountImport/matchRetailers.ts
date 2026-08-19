import {
  HISTORICAL_OGR_IMPORT_DEFAULTS,
  isLineAccountMarker,
} from '@/lib/accountImport/classification';
import { normalizeProspectName } from '@/lib/prospectListImport';
import type {
  CollapsedImportRow,
  PreviewCounts,
  PreviewImportRow,
  PreviewMatch,
} from '@/lib/accountImport/types';
import type { AccountImportMatchDecision } from '@/types/database';

export type ThinRetailer = {
  id: number;
  name: string;
  city: string;
  territoryCode: string | null;
  accountStatus: string;
  externalId: string | null;
  importProtected: boolean;
  buyerVerified: boolean;
  verificationStatus: string | null;
};

export type ThinRla = {
  id: string;
  retailerId: number;
  relationshipStatus: string;
  markers: string[];
};

export type ThinContact = {
  retailerId: number;
  email: string;
  fullName: string;
  isPrimary: boolean;
};

export type PriorImportHit = {
  fingerprint: string;
  retailerId: number | null;
};

const OR_WA = new Set(['or', 'wa']);

function isOrWa(code: string | null | undefined): boolean {
  return Boolean(code && OR_WA.has(code.toLowerCase()));
}

function isBc(code: string | null | undefined): boolean {
  return (code ?? '').toLowerCase() === 'bc';
}

function proposedClassification(): PreviewImportRow['proposedClassification'] {
  return {
    relationshipStatus: HISTORICAL_OGR_IMPORT_DEFAULTS.relationshipStatus,
    markers: [...HISTORICAL_OGR_IMPORT_DEFAULTS.markers],
    existingOgr: HISTORICAL_OGR_IMPORT_DEFAULTS.existingOgr,
    importProtected: HISTORICAL_OGR_IMPORT_DEFAULTS.importProtected,
    qualificationStatus: HISTORICAL_OGR_IMPORT_DEFAULTS.qualificationStatus,
  };
}

function toPreviewMatch(retailer: ThinRetailer, rla: ThinRla | null): PreviewMatch {
  return {
    retailerId: retailer.id,
    name: retailer.name,
    city: retailer.city,
    territoryCode: retailer.territoryCode,
    accountStatus: retailer.accountStatus,
    relationshipStatus: rla?.relationshipStatus ?? null,
    markers: (rla?.markers ?? []).filter(isLineAccountMarker),
  };
}

function rlaDecision(rla: ThinRla | null): {
  decision: AccountImportMatchDecision;
  error?: string;
} {
  if (!rla) return { decision: 'link_existing' };
  if (rla.relationshipStatus === 'terminated') {
    return { decision: 'needs_review', error: 'Existing line account is terminated' };
  }
  if (rla.relationshipStatus === 'inactive' && rla.markers.includes('historical_purchaser')) {
    return {
      decision: 'needs_review',
      error: 'Existing inactive historical purchaser will not be reopened automatically',
    };
  }
  return { decision: 'update_rla' };
}

export function decideCollapsedRow(input: {
  row: CollapsedImportRow;
  retailers: ThinRetailer[];
  rlas: ThinRla[];
  contacts: ThinContact[];
  priorFingerprints: PriorImportHit[];
}): PreviewImportRow {
  const classification = proposedClassification();
  const blockingErrors: string[] = [];

  if (input.row.inFileDuplicateOf != null) {
    return {
      ...input.row,
      matchDecision: 'in_file_duplicate',
      match: null,
      blockingErrors,
      proposedClassification: classification,
    };
  }

  if (!input.row.name.trim()) {
    return {
      ...input.row,
      matchDecision: 'blocked',
      match: null,
      blockingErrors: ['Business name is required'],
      proposedClassification: classification,
    };
  }

  const rawEmail = (input.row.raw.Email ?? input.row.raw.email ?? '').trim();
  const emailInFile = Object.entries(input.row.raw).some(
    ([key, value]) => /e-?mail/i.test(key) && value.trim(),
  );
  if ((emailInFile || rawEmail) && !input.row.emailImportable && !input.row.email) {
    blockingErrors.push('Email is present but invalid');
  }
  if (!input.row.stateCode) {
    blockingErrors.push('Oregon or Washington state is required');
  }
  if (input.row.addressUncertain && !input.row.city && !input.row.stateCode) {
    blockingErrors.push('Address could not be parsed');
  }
  if (!input.row.fingerprint && input.row.nameNormalized) {
    const sameNameMissingGeo = true;
    if (sameNameMissingGeo && input.row.warnings.some((w) => w.includes('missing state and ZIP'))) {
      blockingErrors.push('Same name with missing state and ZIP');
    }
  }

  const prior = input.row.fingerprint
    ? input.priorFingerprints.find((p) => p.fingerprint === input.row.fingerprint && p.retailerId)
    : null;
  if (prior?.retailerId) {
    const retailer = input.retailers.find((r) => r.id === prior.retailerId) ?? null;
    const rla = input.rlas.find((row) => row.retailerId === prior.retailerId) ?? null;
    return {
      ...input.row,
      matchDecision: 'prior_import_skip',
      match: retailer ? toPreviewMatch(retailer, rla) : null,
      blockingErrors,
      proposedClassification: classification,
    };
  }

  if (input.row.externalId) {
    const extHits = input.retailers.filter(
      (r) => r.externalId?.toLowerCase() === input.row.externalId?.toLowerCase(),
    );
    if (extHits.length === 1) {
      return finishMatch(input.row, extHits[0], input.rlas, blockingErrors, classification);
    }
    if (extHits.length > 1) {
      blockingErrors.push('external_id matched multiple retailers');
      return review(input.row, null, blockingErrors, classification);
    }
  }

  const nameHits = input.retailers.filter(
    (r) => normalizeProspectName(r.name) === input.row.nameNormalized,
  );
  const geoHits = nameHits.filter((r) => {
    if (input.row.stateCode && r.territoryCode === input.row.stateCode) return true;
    if (input.row.city && r.city.trim().toLowerCase() === input.row.city.trim().toLowerCase()) {
      return isOrWa(r.territoryCode);
    }
    return false;
  });

  if (geoHits.length === 1) {
    return finishMatch(input.row, geoHits[0], input.rlas, blockingErrors, classification);
  }
  if (geoHits.length > 1) {
    blockingErrors.push('Normalized name and geography matched multiple retailers');
    return review(input.row, null, blockingErrors, classification);
  }

  const orWaNameHits = nameHits.filter((r) => isOrWa(r.territoryCode));
  const bcHits = nameHits.filter((r) => isBc(r.territoryCode));
  if (bcHits.length > 0 || orWaNameHits.length > 1) {
    blockingErrors.push('Normalized name collides with BC or multiple OR/WA retailers');
    return review(input.row, null, blockingErrors, classification);
  }
  if (orWaNameHits.length === 1) {
    return finishMatch(input.row, orWaNameHits[0], input.rlas, blockingErrors, classification);
  }

  if (input.row.email) {
    const emailHits = input.contacts.filter((c) => c.email === input.row.email);
    const retailerIds = [...new Set(emailHits.map((c) => c.retailerId))];
    if (retailerIds.length === 1) {
      const retailer = input.retailers.find((r) => r.id === retailerIds[0]);
      if (retailer) {
        if (!isOrWa(retailer.territoryCode)) {
          blockingErrors.push('Email matched a BC or non-OR/WA retailer');
          return review(input.row, toPreviewMatch(retailer, null), blockingErrors, classification);
        }
        const contact = emailHits[0];
        if (
          input.row.contactName &&
          contact &&
          normalizeProspectName(contact.fullName) !==
            normalizeProspectName(input.row.contactName) &&
          normalizeProspectName(retailer.name) !== input.row.nameNormalized
        ) {
          blockingErrors.push('Email matched an account whose name disagrees');
          return review(input.row, toPreviewMatch(retailer, null), blockingErrors, classification);
        }
        return finishMatch(input.row, retailer, input.rlas, blockingErrors, classification);
      }
    }
    if (retailerIds.length > 1) {
      blockingErrors.push('Email matched multiple accounts');
      return review(input.row, null, blockingErrors, classification);
    }
  }

  if (blockingErrors.length > 0) {
    return review(input.row, null, blockingErrors, classification);
  }

  return {
    ...input.row,
    matchDecision: 'create_retailer',
    match: null,
    blockingErrors,
    proposedClassification: classification,
  };
}

function review(
  row: CollapsedImportRow,
  match: PreviewMatch | null,
  blockingErrors: string[],
  classification: PreviewImportRow['proposedClassification'],
): PreviewImportRow {
  return {
    ...row,
    matchDecision: 'needs_review',
    match,
    blockingErrors,
    proposedClassification: classification,
  };
}

function finishMatch(
  row: CollapsedImportRow,
  retailer: ThinRetailer,
  rlas: ThinRla[],
  blockingErrors: string[],
  classification: PreviewImportRow['proposedClassification'],
): PreviewImportRow {
  const rla = rlas.find((item) => item.retailerId === retailer.id) ?? null;
  const decided = rlaDecision(rla);
  if (decided.error) blockingErrors.push(decided.error);
  if (blockingErrors.length > 0 || decided.decision === 'needs_review') {
    return review(row, toPreviewMatch(retailer, rla), blockingErrors, classification);
  }
  return {
    ...row,
    matchDecision: decided.decision,
    match: toPreviewMatch(retailer, rla),
    blockingErrors,
    proposedClassification: classification,
  };
}

export function matchCollapsedRows(input: {
  rows: CollapsedImportRow[];
  retailers: ThinRetailer[];
  rlas: ThinRla[];
  contacts: ThinContact[];
  priorFingerprints: PriorImportHit[];
}): PreviewImportRow[] {
  return input.rows.map((row) =>
    decideCollapsedRow({
      row,
      retailers: input.retailers,
      rlas: input.rlas,
      contacts: input.contacts,
      priorFingerprints: input.priorFingerprints,
    }),
  );
}

export function summarizePreview(rows: PreviewImportRow[], uploadedRows: number): PreviewCounts {
  const unique = rows.filter((r) => r.inFileDuplicateOf == null);
  const contactsProposed = unique.filter(
    (r) =>
      (r.matchDecision === 'create_retailer' ||
        r.matchDecision === 'link_existing' ||
        r.matchDecision === 'update_rla') &&
      Boolean(r.contactName || r.email),
  ).length;
  return {
    uploadedRows,
    uniqueBusinesses: unique.length,
    duplicateSpreadsheetRows: rows.filter((r) => r.inFileDuplicateOf != null).length,
    existingRecordsLinked: unique.filter(
      (r) =>
        r.matchDecision === 'link_existing' ||
        r.matchDecision === 'update_rla' ||
        r.matchDecision === 'prior_import_skip',
    ).length,
    newRetailersProposed: unique.filter((r) => r.matchDecision === 'create_retailer').length,
    lineAccountsProposed: unique.filter(
      (r) =>
        r.matchDecision === 'create_retailer' ||
        r.matchDecision === 'link_existing' ||
        r.matchDecision === 'update_rla',
    ).length,
    contactsProposed,
    rowsRequiringReview: unique.filter((r) => r.matchDecision === 'needs_review').length,
    blockedRows: unique.filter((r) => r.matchDecision === 'blocked').length,
  };
}
