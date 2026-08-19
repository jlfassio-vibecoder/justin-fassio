import { isVerifiedIdentityField } from '@/lib/retailerFieldChanges';

export const REVIEW_APPLY_FIELD_PATHS = [
  'website',
  'phone',
  'category',
  'retail_category',
  'apparel_capability',
  'verification_status',
  'address',
  'city',
] as const;

export type ReviewApplyFieldPath = (typeof REVIEW_APPLY_FIELD_PATHS)[number];

export type ReviewReason =
  | 'city_state_mismatch'
  | 'directory_only'
  | 'multiple_sites'
  | 'protected_identity'
  | 'low_confidence';

export const REVIEW_REASON_LABELS: Record<ReviewReason, string> = {
  city_state_mismatch: 'City/state mismatch',
  directory_only: 'Directory-only',
  multiple_sites: 'Multiple sites',
  protected_identity: 'Protected identity',
  low_confidence: 'Low confidence',
};

export const REVIEW_FIELD_LABELS: Record<ReviewApplyFieldPath, string> = {
  website: 'Website',
  phone: 'Phone',
  category: 'Category',
  retail_category: 'Retail category',
  apparel_capability: 'Apparel capability',
  verification_status: 'Verification',
  address: 'Address',
  city: 'City',
};

export type ReviewChangeRow = {
  id: string;
  retailerId: number;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  confidence: string | null;
  sourceUrl: string | null;
  protectedIdentity: boolean;
};

export type ReviewRetailerGroup = {
  retailerId: number;
  name: string;
  importProtected: boolean;
  reasons: ReviewReason[];
  brief: string | null;
  changes: ReviewChangeRow[];
};

export type ReviewSnapshot = {
  batchId: string;
  groups: ReviewRetailerGroup[];
  pendingCount: number;
};

export type ReviewJobEvidence = {
  cityStateAgrees?: boolean;
  directoryOnly?: boolean;
  multipleOfficialSites?: boolean;
};

export type ApplyDecision =
  | { kind: 'forbidden' }
  | { kind: 'already_applied' }
  | { kind: 'conflict' }
  | { kind: 'write'; patchValue: string | number | boolean | null };

export function isReviewApplyFieldPath(fieldPath: string): fieldPath is ReviewApplyFieldPath {
  return (REVIEW_APPLY_FIELD_PATHS as readonly string[]).includes(fieldPath);
}

export function unwrapJsonValue(raw: unknown): unknown {
  if (raw == null) return null;
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') || trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return unwrapJsonValue(JSON.parse(trimmed) as unknown);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function normalizeReviewValue(raw: unknown): string {
  const unwrapped = unwrapJsonValue(raw);
  if (unwrapped == null) return '';
  if (typeof unwrapped === 'string') return unwrapped.trim();
  if (typeof unwrapped === 'number' || typeof unwrapped === 'boolean') return String(unwrapped);
  return JSON.stringify(unwrapped);
}

export function prospectPatchValue(raw: unknown): string | number | boolean | null {
  const unwrapped = unwrapJsonValue(raw);
  if (unwrapped == null) return null;
  if (typeof unwrapped === 'number' || typeof unwrapped === 'boolean') return unwrapped;
  if (typeof unwrapped === 'string') {
    const trimmed = unwrapped.trim();
    return trimmed ? trimmed : null;
  }
  return JSON.stringify(unwrapped);
}

export function classifyApplyDecision(input: {
  fieldPath: string;
  currentValue: unknown;
  oldValue: unknown;
  newValue: unknown;
}): ApplyDecision {
  if (!isReviewApplyFieldPath(input.fieldPath)) return { kind: 'forbidden' };
  const current = normalizeReviewValue(input.currentValue);
  const next = normalizeReviewValue(input.newValue);
  const previous = normalizeReviewValue(input.oldValue);
  if (current === next) return { kind: 'already_applied' };
  if (current !== previous) return { kind: 'conflict' };
  return { kind: 'write', patchValue: prospectPatchValue(input.newValue) };
}

export function firstSourceUrl(sourceUrls: unknown): string | null {
  const unwrapped = unwrapJsonValue(sourceUrls);
  if (!Array.isArray(unwrapped)) return null;
  for (const entry of unwrapped) {
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
  }
  return null;
}

export function parseReviewJobEvidence(raw: unknown): ReviewJobEvidence | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  return {
    cityStateAgrees: typeof row.cityStateAgrees === 'boolean' ? row.cityStateAgrees : undefined,
    directoryOnly: typeof row.directoryOnly === 'boolean' ? row.directoryOnly : undefined,
    multipleOfficialSites:
      typeof row.multipleOfficialSites === 'boolean' ? row.multipleOfficialSites : undefined,
  };
}

export function reviewReasonsForGroup(input: {
  importProtected: boolean;
  evidence: ReviewJobEvidence | null;
  changes: Array<{ fieldPath: string; confidence: string | null }>;
}): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  if (input.evidence?.cityStateAgrees === false) reasons.push('city_state_mismatch');
  if (input.evidence?.directoryOnly === true) reasons.push('directory_only');
  if (input.evidence?.multipleOfficialSites === true) reasons.push('multiple_sites');
  if (
    input.importProtected &&
    input.changes.some((change) => isVerifiedIdentityField(change.fieldPath))
  ) {
    reasons.push('protected_identity');
  }
  if (input.changes.some((change) => change.confidence === 'low')) reasons.push('low_confidence');
  return reasons;
}

export function formatReviewValue(value: unknown): string {
  const normalized = normalizeReviewValue(value);
  return normalized ? normalized : '(blank)';
}

export function reviewFieldLabel(fieldPath: string): string {
  if (isReviewApplyFieldPath(fieldPath)) return REVIEW_FIELD_LABELS[fieldPath];
  return fieldPath;
}

export type PendingReviewInputChange = {
  id: string;
  retailerId: number;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  confidence: string | null;
  sourceUrls: unknown;
  enrichmentJobId: string | null;
};

export type PendingReviewRetailer = {
  id: number;
  name: string;
  importProtected: boolean;
};

export type PendingReviewJob = {
  id: string;
  retailerId: number;
  researchBrief: string | null;
  evidence: unknown;
};

export function groupReviewRows(input: {
  batchId: string;
  changes: PendingReviewInputChange[];
  retailers: PendingReviewRetailer[];
  jobs: PendingReviewJob[];
}): ReviewSnapshot {
  const retailers = new Map(input.retailers.map((row) => [row.id, row]));
  const jobs = new Map(input.jobs.map((row) => [row.id, row]));
  const grouped = new Map<number, ReviewChangeRow[]>();
  for (const change of input.changes) {
    const retailer = retailers.get(change.retailerId);
    const rows = grouped.get(change.retailerId) ?? [];
    rows.push({
      id: change.id,
      retailerId: change.retailerId,
      fieldPath: change.fieldPath,
      oldValue: change.oldValue,
      newValue: change.newValue,
      confidence: change.confidence,
      sourceUrl: firstSourceUrl(change.sourceUrls),
      protectedIdentity: Boolean(
        retailer?.importProtected && isVerifiedIdentityField(change.fieldPath),
      ),
    });
    grouped.set(change.retailerId, rows);
  }
  const groups: ReviewRetailerGroup[] = [...grouped.entries()]
    .map(([retailerId, changes]) => {
      const retailer = retailers.get(retailerId);
      const jobId = input.changes.find((row) => row.retailerId === retailerId)?.enrichmentJobId;
      const linkedJob =
        (jobId ? jobs.get(jobId) : undefined) ??
        input.jobs.find((row) => row.retailerId === retailerId);
      const evidence = parseReviewJobEvidence(linkedJob?.evidence ?? null);
      return {
        retailerId,
        name: retailer?.name?.trim() || `Retailer #${retailerId}`,
        importProtected: retailer?.importProtected === true,
        reasons: reviewReasonsForGroup({
          importProtected: retailer?.importProtected === true,
          evidence,
          changes,
        }),
        brief: linkedJob?.researchBrief?.trim() || null,
        changes: changes.sort((a, b) => a.fieldPath.localeCompare(b.fieldPath)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    batchId: input.batchId,
    groups,
    pendingCount: input.changes.length,
  };
}

export function emptyReviewSnapshot(batchId: string): ReviewSnapshot {
  return { batchId, groups: [], pendingCount: 0 };
}
