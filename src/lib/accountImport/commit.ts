import type { AgentSupabase } from '@/lib/agentAuth';
import {
  prospectPatchTouchesLocation,
  runOperationalTerritoryReviewSyncForProspectId,
} from '@/lib/operationalTerritories/syncOperationalTerritoryReview';
import {
  ACCOUNT_IMPORT_SOURCE_TYPES,
  assertZoominfoImportClassification,
  defaultsForImportSource,
  isZoominfoLeadSource,
} from '@/lib/accountImport/classification';
import { importFingerprint } from '@/lib/accountImport/fingerprint';
import {
  assertImportLineAllowed,
  assertImportSourceLinePairing,
  parseRequiredSalesLineId,
} from '@/lib/accountImport/lineGate';
import {
  matchCollapsedRows,
  type PriorImportHit,
  type ThinContact,
  type ThinRetailer,
  type ThinRla,
} from '@/lib/accountImport/matchRetailers';
import {
  historicalImportSeedNote,
  importSourceNote,
  zoominfoImportSeedNote,
} from '@/lib/accountImport/notes';
import { loadCrmMatchSnapshot, markersFromUnknown } from '@/lib/accountImport/preview';
import type {
  CollapsedImportRow,
  ConfirmClassification,
  PreviewImportRow,
} from '@/lib/accountImport/types';
import { normalizeProspectName } from '@/lib/prospectListImport';
import { isVerifiedIdentityField, isVerifiedIdentityStatus } from '@/lib/retailerFieldChanges';
import {
  fetchSalesLineTerritories,
  suggestedAssignmentForLocation,
} from '@/lib/salesLineTerritories';
import type {
  AccountImportBatchStatus,
  AccountImportMatchDecision,
  AccountImportRowStatus,
  AccountImportSourceType,
  LineAccountMarker,
  RelationshipStatus,
} from '@/types/database';

export const ELIGIBLE_IMPORT_DECISIONS: readonly AccountImportMatchDecision[] = [
  'create_retailer',
  'link_existing',
  'update_rla',
];

export const FINISHED_BATCH_STATUSES: readonly AccountImportBatchStatus[] = [
  'committed',
  'enriching',
  'enrichment_partial',
  'completed',
];

export const ACTIVE_SHA_BATCH_STATUSES: readonly AccountImportBatchStatus[] = [
  'previewed',
  ...FINISHED_BATCH_STATUSES,
];

export const RETRYABLE_IMPORT_ROW_STATUSES: readonly AccountImportRowStatus[] = [
  'previewed',
  'queued',
  'failed',
];

export type ExistingRetailerForCommit = {
  name: string;
  address: string;
  city: string;
  phone: string;
  website: string | null;
  postalCode: string | null;
  importProtected: boolean;
  buyerVerified: boolean;
  verificationStatus: string | null;
  hasPrimaryContact: boolean;
  notes: string | null;
};

export type CommitRowRpcPayload = {
  action: 'create_retailer' | 'link_existing' | 'update_rla';
  retailer_id: number | null;
  prospect_insert: Record<string, unknown> | null;
  prospect_patch: Record<string, unknown> | null;
  rla_patch: Record<string, unknown>;
  contact: {
    full_name: string;
    email: string | null;
    phone: string | null;
    skip_if_primary_exists: boolean;
  } | null;
  field_changes: Array<{
    field_path: string;
    old_value: unknown;
    new_value: unknown;
  }>;
  final_status: 'imported' | 'linked' | 'updated';
};

export type CommittedImportRow = {
  rowNumber: number;
  matchDecision: AccountImportMatchDecision;
  status: AccountImportRowStatus;
  retailerId: number | null;
  name: string;
  error: string | null;
};

export type CommitReport = {
  uploadedRows: number;
  uniqueBusinesses: number;
  duplicateSpreadsheetRows: number;
  existingRecordsLinked: number;
  newRetailersCreated: number;
  lineAccountsCreatedOrUpdated: number;
  contactsCreated: number;
  rowsRequiringReview: number;
  blockedRows: number;
  failedRows: number;
  cancelledRows: number;
};

export type CommitResult =
  | {
      ok: true;
      resumed: boolean;
      batchId: string;
      report: CommitReport;
      rows: CommittedImportRow[];
    }
  | { ok: false; error: string; status: number };

function isSourceType(value: unknown): value is AccountImportSourceType {
  return (
    typeof value === 'string' && (ACCOUNT_IMPORT_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

function finalStatusFor(decision: AccountImportMatchDecision): 'imported' | 'linked' | 'updated' {
  if (decision === 'link_existing') return 'linked';
  if (decision === 'update_rla') return 'updated';
  return 'imported';
}

export function persistStatusFor(decision: AccountImportMatchDecision): AccountImportRowStatus {
  if (decision === 'create_retailer') return 'imported';
  if (decision === 'link_existing') return 'linked';
  if (decision === 'update_rla') return 'updated';
  return 'skipped';
}

export function isEligibleImportDecision(
  decision: AccountImportMatchDecision,
): decision is 'create_retailer' | 'link_existing' | 'update_rla' {
  return ELIGIBLE_IMPORT_DECISIONS.includes(decision);
}

export function isFinishedBatchStatus(status: string): boolean {
  return (FINISHED_BATCH_STATUSES as readonly string[]).includes(status);
}

export function isActiveShaBatchStatus(status: string): boolean {
  return (ACTIVE_SHA_BATCH_STATUSES as readonly string[]).includes(status);
}

export function isUniqueConstraintError(
  error: { code?: string; message?: string } | null | undefined,
): boolean {
  if (!error) return false;
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message ?? '');
}

export function existingBatchAfterShaConflict<T extends { id: string; status: string }>(
  batches: T[],
): { kind: 'finished' | 'previewed'; batch: T } | null {
  const finished = batches.find((batch) => isFinishedBatchStatus(batch.status));
  if (finished) return { kind: 'finished', batch: finished };
  const previewed = batches.find((batch) => batch.status === 'previewed');
  if (previewed) return { kind: 'previewed', batch: previewed };
  return null;
}

export function isRetryableImportRowStatus(status: AccountImportRowStatus): boolean {
  return RETRYABLE_IMPORT_ROW_STATUSES.includes(status);
}

export function batchIsFullyTerminal(rows: Array<{ status: AccountImportRowStatus }>): boolean {
  return rows.length > 0 && rows.every((row) => !isRetryableImportRowStatus(row.status));
}

export function shouldPreserveExistingRlaNotes(
  decision: AccountImportMatchDecision,
  existingNotes: string | null | undefined,
): boolean {
  if (decision === 'create_retailer') return false;
  return Boolean(existingNotes?.trim());
}

export function shouldInsertImportContact(input: {
  skipIfPrimaryExists: boolean;
  hasPrimary: boolean;
}): boolean {
  return !(input.skipIfPrimaryExists && input.hasPrimary);
}

export function failedImportRowStamp(error: string): { status: 'failed'; error: string } {
  return { status: 'failed', error };
}

export function identityRowForMatch(row: PreviewImportRow): CollapsedImportRow {
  return {
    rowNumber: row.rowNumber,
    raw: row.raw,
    name: row.name,
    nameNormalized: normalizeProspectName(row.name),
    street: row.street,
    city: row.city,
    stateCode: row.stateCode,
    region: row.region,
    postalCode: row.postalCode,
    postal5: row.postal5,
    formerRepCode: row.formerRepCode,
    storeTypeRaw: row.storeTypeRaw,
    category: row.category,
    contactName: row.contactName,
    email: row.email,
    emailImportable: row.emailImportable,
    phone: row.phone,
    website: row.website,
    externalId: row.externalId,
    rawAddressText: row.rawAddressText,
    addressUncertain: row.addressUncertain,
    fingerprint: importFingerprint({
      name: row.name,
      stateCode: row.stateCode,
      postal5: row.postal5,
    }),
    warnings: row.warnings,
    inFileDuplicateOf: row.inFileDuplicateOf,
    collapsedFromRowNumbers: row.collapsedFromRowNumbers,
  };
}

export function revalidateCommitRows(
  clientRows: PreviewImportRow[],
  snapshot: {
    retailers: ThinRetailer[];
    rlas: ThinRla[];
    contacts: ThinContact[];
    priorFingerprints: PriorImportHit[];
  },
  sourceType: AccountImportSourceType = 'historical_customer',
): PreviewImportRow[] {
  return matchCollapsedRows({
    rows: clientRows.map(identityRowForMatch),
    retailers: snapshot.retailers,
    rlas: snapshot.rlas,
    contacts: snapshot.contacts,
    priorFingerprints: snapshot.priorFingerprints,
    sourceType,
  });
}

export function parseConfirmClassification(
  raw: unknown,
  sourceType: AccountImportSourceType = 'historical_customer',
): ConfirmClassification {
  const defaults = defaultsForImportSource(sourceType);
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const relationship =
    obj.relationshipStatus === 'opened' ||
    obj.relationshipStatus === 'prospect' ||
    obj.relationshipStatus === 'qualified' ||
    obj.relationshipStatus === 'inactive' ||
    obj.relationshipStatus === 'terminated'
      ? (obj.relationshipStatus as RelationshipStatus)
      : defaults.relationshipStatus;
  const existingOgr =
    typeof obj.existingOgr === 'string' && obj.existingOgr.trim()
      ? obj.existingOgr.trim()
      : defaults.existingOgr;
  const nextAction = typeof obj.nextAction === 'string' ? obj.nextAction.trim() || null : null;
  const markersProvided = Array.isArray(obj.markers);
  const markers: LineAccountMarker[] = markersFromUnknown(obj.markers);
  const resolvedMarkers = isZoominfoLeadSource(sourceType)
    ? markersProvided
      ? markers
      : [...defaults.markers]
    : markers.length > 0
      ? markers
      : [...defaults.markers];
  return {
    relationshipStatus: relationship,
    markers: resolvedMarkers,
    existingOgr,
    nextAction,
    runAiAfterImport: obj.runAiAfterImport !== false,
  };
}

function blankFill(
  current: string | null | undefined,
  incoming: string | null,
  protectedIdentity: boolean,
  field: string,
): string | null | undefined {
  if (protectedIdentity && isVerifiedIdentityField(field)) return undefined;
  if (current?.trim()) return undefined;
  return incoming;
}

export function buildCommitRowPayload(input: {
  row: PreviewImportRow;
  classification: ConfirmClassification;
  filename: string;
  batchId: string;
  sourceType: AccountImportSourceType;
  territoryId: string;
  salesLineTerritoryId: string | null;
  existingRetailer?: ExistingRetailerForCommit | null;
}): CommitRowRpcPayload | null {
  if (!isEligibleImportDecision(input.row.matchDecision)) return null;

  const defaults = defaultsForImportSource(input.sourceType);
  const seed = isZoominfoLeadSource(input.sourceType)
    ? zoominfoImportSeedNote({ filename: input.filename })
    : historicalImportSeedNote({
        filename: input.filename,
        formerRepCode: input.row.formerRepCode,
      });
  const sourceNote = importSourceNote({
    sourceType: input.sourceType,
    batchId: input.batchId,
    filename: input.filename,
    formerRepCode: input.row.formerRepCode,
  });
  const address = input.row.street ?? input.row.rawAddressText;
  const rlaPatch: Record<string, unknown> = {
    relationship_status: input.classification.relationshipStatus,
    line_account_markers: input.classification.markers,
    existing_ogr: input.classification.existingOgr,
    qualification_status: defaults.qualificationStatus,
    next_action: input.classification.nextAction,
    source_note: sourceNote,
    sales_line_territory_id: input.salesLineTerritoryId,
    backfill_review_reason: input.salesLineTerritoryId ? null : 'territory_assignment_missing',
    converted_at: null,
    initial_order_date: null,
  };
  if (!shouldPreserveExistingRlaNotes(input.row.matchDecision, input.existingRetailer?.notes)) {
    rlaPatch.notes = seed;
  }

  const contact =
    input.row.contactName || input.row.email
      ? {
          full_name: input.row.contactName || 'Buyer',
          email: input.row.email,
          phone: input.row.phone,
          skip_if_primary_exists: true,
        }
      : null;

  if (input.row.matchDecision === 'create_retailer') {
    const insert: Record<string, unknown> = {
      name: input.row.name,
      category: input.row.category,
      region: input.row.region,
      city: input.row.city ?? '',
      address: address ?? '',
      phone: input.row.phone ?? '',
      fit: '',
      account_status: defaults.accountStatus,
      converted_at: null,
      initial_order_date: null,
      import_protected: true,
      existing_ogr: input.classification.existingOgr,
      qualification_status: defaults.qualificationStatus,
      next_action: input.classification.nextAction,
      source_note: sourceNote,
      notes: seed,
      website: input.row.website,
      retail_category: input.row.storeTypeRaw,
      postal_code: input.row.postalCode,
      territory_id: input.territoryId,
      primary_district: null,
      subterritory: null,
      external_id: input.row.externalId,
    };
    const fieldChanges = [
      { field_path: 'name', old_value: null, new_value: input.row.name },
      { field_path: 'city', old_value: null, new_value: input.row.city },
      { field_path: 'address', old_value: null, new_value: address },
      { field_path: 'postal_code', old_value: null, new_value: input.row.postalCode },
      { field_path: 'website', old_value: null, new_value: input.row.website },
      { field_path: 'phone', old_value: null, new_value: input.row.phone },
    ].filter((row) => row.new_value != null && row.new_value !== '');

    return {
      action: 'create_retailer',
      retailer_id: null,
      prospect_insert: insert,
      prospect_patch: null,
      rla_patch: rlaPatch,
      contact,
      field_changes: fieldChanges,
      final_status: 'imported',
    };
  }

  const existing = input.existingRetailer;
  const protectedIdentity = isVerifiedIdentityStatus({
    buyerVerified: existing?.buyerVerified,
    verificationStatus: existing?.verificationStatus,
    importProtected: existing?.importProtected,
  });
  const patch: Record<string, unknown> = {};
  const fieldChanges: CommitRowRpcPayload['field_changes'] = [];

  const candidates: Array<{
    field: string;
    current: string | null | undefined;
    incoming: string | null;
  }> = [
    { field: 'address', current: existing?.address, incoming: address },
    { field: 'city', current: existing?.city, incoming: input.row.city },
    { field: 'postal_code', current: existing?.postalCode, incoming: input.row.postalCode },
    { field: 'website', current: existing?.website, incoming: input.row.website },
    { field: 'phone', current: existing?.phone, incoming: input.row.phone },
  ];
  for (const candidate of candidates) {
    const next = blankFill(
      candidate.current,
      candidate.incoming,
      protectedIdentity,
      candidate.field,
    );
    if (next) {
      patch[candidate.field] = next;
      fieldChanges.push({
        field_path: candidate.field,
        old_value: candidate.current ?? null,
        new_value: next,
      });
    }
  }

  return {
    action: input.row.matchDecision,
    retailer_id: input.row.match?.retailerId ?? null,
    prospect_insert: null,
    prospect_patch: Object.keys(patch).length > 0 ? patch : null,
    rla_patch: rlaPatch,
    contact: existing?.hasPrimaryContact
      ? contact
        ? { ...contact, skip_if_primary_exists: true }
        : null
      : contact,
    field_changes: fieldChanges,
    final_status: finalStatusFor(input.row.matchDecision),
  };
}

async function loadExistingRetailer(
  supabase: AgentSupabase,
  retailerId: number,
  salesLineId: string,
): Promise<ExistingRetailerForCommit> {
  const empty: ExistingRetailerForCommit = {
    name: '',
    address: '',
    city: '',
    phone: '',
    website: null,
    postalCode: null,
    importProtected: false,
    buyerVerified: false,
    verificationStatus: null,
    hasPrimaryContact: false,
    notes: null,
  };
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select(
      'name, address, city, phone, website, postal_code, import_protected, buyer_verified, verification_status',
    )
    .eq('id', retailerId)
    .maybeSingle();
  if (error || !prospect) return empty;
  const { data: primary } = await supabase
    .from('account_contacts')
    .select('id')
    .eq('account_id', retailerId)
    .eq('is_primary', true)
    .maybeSingle();
  const { data: rla } = await supabase
    .from('retailer_line_accounts')
    .select('notes')
    .eq('retailer_id', retailerId)
    .eq('sales_line_id', salesLineId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  return {
    name: prospect.name,
    address: prospect.address,
    city: prospect.city,
    phone: prospect.phone,
    website: prospect.website,
    postalCode: prospect.postal_code,
    importProtected: prospect.import_protected,
    buyerVerified: prospect.buyer_verified,
    verificationStatus: prospect.verification_status,
    hasPrimaryContact: Boolean(primary),
    notes: rla?.notes ?? null,
  };
}

function nameFromNormalizedPayload(payload: unknown): string {
  if (
    payload &&
    typeof payload === 'object' &&
    'name' in payload &&
    typeof payload.name === 'string'
  ) {
    return payload.name;
  }
  return '';
}

function tallyCommitReport(
  rows: Array<{ matchDecision: AccountImportMatchDecision; status: AccountImportRowStatus }>,
  uploadedRows: number,
): CommitReport {
  const unique = rows.filter((r) => r.matchDecision !== 'in_file_duplicate');
  return {
    uploadedRows,
    uniqueBusinesses: unique.length,
    duplicateSpreadsheetRows: rows.filter((r) => r.matchDecision === 'in_file_duplicate').length,
    existingRecordsLinked: unique.filter(
      (r) =>
        r.matchDecision === 'link_existing' ||
        r.matchDecision === 'update_rla' ||
        r.matchDecision === 'prior_import_skip',
    ).length,
    newRetailersCreated: unique.filter(
      (r) => r.matchDecision === 'create_retailer' && r.status === 'imported',
    ).length,
    lineAccountsCreatedOrUpdated: unique.filter(
      (r) => r.status === 'imported' || r.status === 'linked' || r.status === 'updated',
    ).length,
    contactsCreated: 0,
    rowsRequiringReview: unique.filter((r) => r.matchDecision === 'needs_review').length,
    blockedRows: unique.filter((r) => r.matchDecision === 'blocked').length,
    failedRows: rows.filter((r) => r.status === 'failed').length,
    cancelledRows: rows.filter((r) => r.status === 'cancelled').length,
  };
}

type PersistedImportRow = {
  id: string;
  row_number: number;
  status: AccountImportRowStatus;
  match_decision: AccountImportMatchDecision;
  retailer_id: number | null;
  error: string | null;
  account_contact_id: string | null;
};

const PERSISTED_IMPORT_ROW_SELECT =
  'id, row_number, status, match_decision, retailer_id, error, account_contact_id';

export async function loadFinishedCommitResult(
  supabase: AgentSupabase,
  batch: { id: string; report: unknown },
  uploadedRows: number,
): Promise<Extract<CommitResult, { ok: true }>> {
  const { data: existingRows } = await supabase
    .from('account_import_rows')
    .select('row_number, match_decision, status, retailer_id, error, normalized_payload')
    .eq('batch_id', batch.id)
    .order('row_number', { ascending: true });
  const mapped: CommittedImportRow[] = (existingRows ?? []).map((row) => ({
    rowNumber: row.row_number,
    matchDecision: row.match_decision,
    status: row.status,
    retailerId: row.retailer_id,
    name: nameFromNormalizedPayload(row.normalized_payload),
    error: row.error,
  }));
  return {
    ok: true,
    resumed: true,
    batchId: batch.id,
    report:
      batch.report && typeof batch.report === 'object'
        ? (batch.report as CommitReport)
        : tallyCommitReport(mapped, uploadedRows > 0 ? uploadedRows : mapped.length),
    rows: mapped,
  };
}

async function loadPersistedImportRows(
  supabase: AgentSupabase,
  batchId: string,
): Promise<{ ok: true; rows: PersistedImportRow[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('account_import_rows')
    .select(PERSISTED_IMPORT_ROW_SELECT)
    .eq('batch_id', batchId)
    .order('row_number', { ascending: true });
  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not load import rows' };
  }
  return { ok: true, rows: data };
}

async function insertOrLoadImportRows(
  supabase: AgentSupabase,
  input: {
    batchId: string;
    salesLineId: string;
    rows: PreviewImportRow[];
  },
): Promise<{ ok: true; rows: PersistedImportRow[] } | { ok: false; error: string }> {
  const insertRows = input.rows.map((row) => ({
    batch_id: input.batchId,
    sales_line_id: input.salesLineId,
    row_number: row.rowNumber,
    raw_payload: row.raw,
    normalized_payload: {
      name: row.name,
      city: row.city,
      stateCode: row.stateCode,
      postalCode: row.postalCode,
      fingerprint: row.fingerprint,
    },
    fingerprint: row.fingerprint,
    match_decision: row.matchDecision,
    status: 'previewed' as const,
    former_rep_code: row.formerRepCode,
    raw_address_text: row.rawAddressText || null,
  }));
  const { data, error } = await supabase
    .from('account_import_rows')
    .insert(insertRows)
    .select(PERSISTED_IMPORT_ROW_SELECT);
  if (!error && data) return { ok: true, rows: data };
  if (isUniqueConstraintError(error)) {
    return loadPersistedImportRows(supabase, input.batchId);
  }
  return { ok: false, error: error?.message ?? 'Could not create import rows' };
}

export async function commitAccountImport(
  supabase: AgentSupabase,
  userId: string,
  input: {
    salesLineId: unknown;
    sourceType: unknown;
    filename: string;
    contentSha256: string;
    uploadedRows: number;
    cancelRequested?: boolean;
    classification: unknown;
    rows: PreviewImportRow[];
  },
): Promise<CommitResult> {
  const lineId = parseRequiredSalesLineId(input.salesLineId);
  if (!lineId.ok) return lineId;
  if (!isSourceType(input.sourceType)) {
    return { ok: false, error: 'Invalid source type', status: 400 };
  }
  if (!input.filename.trim() || !input.contentSha256.trim()) {
    return { ok: false, error: 'Filename and content hash are required', status: 400 };
  }

  const { data: line, error: lineError } = await supabase
    .from('lines')
    .select('id, code, status')
    .eq('id', lineId.salesLineId)
    .maybeSingle();
  if (lineError) return { ok: false, error: lineError.message, status: 500 };
  if (!line) return { ok: false, error: 'Unknown sales line', status: 400 };
  const allowed = assertImportLineAllowed(line);
  if (!allowed.ok) return allowed;
  const paired = assertImportSourceLinePairing(input.sourceType, line);
  if (!paired.ok) return paired;

  const { data: shaBatches, error: shaError } = await supabase
    .from('account_import_batches')
    .select('id, status, report')
    .eq('sales_line_id', lineId.salesLineId)
    .eq('content_sha256', input.contentSha256)
    .order('created_at', { ascending: false });
  if (shaError) return { ok: false, error: shaError.message, status: 500 };

  const existingBatch = (shaBatches ?? []).find((batch) => isFinishedBatchStatus(batch.status));
  if (existingBatch) {
    return loadFinishedCommitResult(supabase, existingBatch, input.uploadedRows);
  }

  const snapshot = await loadCrmMatchSnapshot(supabase, lineId.salesLineId, input.sourceType);
  if (!snapshot.ok) return { ok: false, error: snapshot.error, status: 500 };
  const matched = revalidateCommitRows(input.rows, snapshot, input.sourceType);

  const classification = parseConfirmClassification(input.classification, input.sourceType);
  if (isZoominfoLeadSource(input.sourceType)) {
    const locked = assertZoominfoImportClassification(classification);
    if (!locked.ok) return locked;
  }
  const territories = await supabase.from('territories').select('id, code');
  if (territories.error) return { ok: false, error: territories.error.message, status: 500 };
  const territoryIdByCode = new Map((territories.data ?? []).map((t) => [t.code, t.id]));

  const assignments = await fetchSalesLineTerritories(supabase, lineId.salesLineId);
  if (assignments.error) return { ok: false, error: assignments.error, status: 500 };

  const inProgress = (shaBatches ?? []).find((batch) => batch.status === 'previewed');
  let batchId: string;
  let resumed = false;
  let persistedRows: PersistedImportRow[];

  if (inProgress) {
    resumed = true;
    batchId = inProgress.id;
    const existing = await loadPersistedImportRows(supabase, batchId);
    if (!existing.ok) return { ok: false, error: existing.error, status: 500 };
    persistedRows = existing.rows;
    if (persistedRows.length === 0) {
      const inserted = await insertOrLoadImportRows(supabase, {
        batchId,
        salesLineId: lineId.salesLineId,
        rows: matched,
      });
      if (!inserted.ok) return { ok: false, error: inserted.error, status: 500 };
      persistedRows = inserted.rows;
    }
  } else {
    const { data: batch, error: batchError } = await supabase
      .from('account_import_batches')
      .insert({
        sales_line_id: lineId.salesLineId,
        source_type: input.sourceType,
        source_filename: input.filename.trim(),
        content_sha256: input.contentSha256,
        status: 'previewed',
        classification_snapshot: classification,
        created_by: userId,
      })
      .select('id')
      .single();
    if (batchError || !batch) {
      if (!isUniqueConstraintError(batchError)) {
        return {
          ok: false,
          error: batchError?.message ?? 'Could not create import batch',
          status: 500,
        };
      }
      const { data: conflictBatches, error: conflictError } = await supabase
        .from('account_import_batches')
        .select('id, status, report')
        .eq('sales_line_id', lineId.salesLineId)
        .eq('content_sha256', input.contentSha256)
        .order('created_at', { ascending: false });
      if (conflictError) return { ok: false, error: conflictError.message, status: 500 };
      const resolved = existingBatchAfterShaConflict(conflictBatches ?? []);
      if (!resolved) {
        return {
          ok: false,
          error: batchError?.message ?? 'Could not create import batch',
          status: 500,
        };
      }
      if (resolved.kind === 'finished') {
        return loadFinishedCommitResult(supabase, resolved.batch, input.uploadedRows);
      }
      resumed = true;
      batchId = resolved.batch.id;
      const existing = await loadPersistedImportRows(supabase, batchId);
      if (!existing.ok) return { ok: false, error: existing.error, status: 500 };
      persistedRows = existing.rows;
      if (persistedRows.length === 0) {
        const inserted = await insertOrLoadImportRows(supabase, {
          batchId,
          salesLineId: lineId.salesLineId,
          rows: matched,
        });
        if (!inserted.ok) return { ok: false, error: inserted.error, status: 500 };
        persistedRows = inserted.rows;
      }
    } else {
      batchId = batch.id;
      const inserted = await insertOrLoadImportRows(supabase, {
        batchId,
        salesLineId: lineId.salesLineId,
        rows: matched,
      });
      if (!inserted.ok) {
        await supabase.from('account_import_batches').delete().eq('id', batchId);
        return { ok: false, error: inserted.error, status: 500 };
      }
      persistedRows = inserted.rows;
    }
  }

  const persistedByNumber = new Map(persistedRows.map((row) => [row.row_number, row]));
  const committed: CommittedImportRow[] = [];
  let contactsCreated = 0;
  const cancelRest = Boolean(input.cancelRequested);

  for (const row of matched) {
    const persisted = persistedByNumber.get(row.rowNumber);
    if (!persisted) continue;
    const importRowId = persisted.id;

    if (!isRetryableImportRowStatus(persisted.status)) {
      if (persisted.account_contact_id) contactsCreated += 1;
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: persisted.match_decision,
        status: persisted.status,
        retailerId: persisted.retailer_id,
        name: row.name,
        error: persisted.error,
      });
      continue;
    }

    await supabase
      .from('account_import_rows')
      .update({
        match_decision: row.matchDecision,
        fingerprint: row.fingerprint,
        retailer_id: row.match?.retailerId ?? null,
      })
      .eq('id', importRowId);

    if (cancelRest && isEligibleImportDecision(row.matchDecision)) {
      await supabase
        .from('account_import_rows')
        .update({ status: 'cancelled' })
        .eq('id', importRowId);
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: 'cancelled',
        retailerId: row.match?.retailerId ?? null,
        name: row.name,
        error: null,
      });
      continue;
    }

    if (!isEligibleImportDecision(row.matchDecision)) {
      await supabase
        .from('account_import_rows')
        .update({
          status: persistStatusFor(row.matchDecision),
          retailer_id: row.match?.retailerId ?? null,
        })
        .eq('id', importRowId);
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: persistStatusFor(row.matchDecision),
        retailerId: row.match?.retailerId ?? null,
        name: row.name,
        error: null,
      });
      continue;
    }

    const territoryId = row.stateCode ? territoryIdByCode.get(row.stateCode) : null;
    if (!territoryId) {
      const stamp = failedImportRowStamp('Oregon or Washington territory is missing');
      await supabase.from('account_import_rows').update(stamp).eq('id', importRowId);
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: stamp.status,
        retailerId: null,
        name: row.name,
        error: stamp.error,
      });
      continue;
    }

    const slt = suggestedAssignmentForLocation(assignments.data, row.stateCode);
    const existingRetailer = row.match?.retailerId
      ? await loadExistingRetailer(supabase, row.match.retailerId, lineId.salesLineId)
      : null;
    const payload = buildCommitRowPayload({
      row,
      classification,
      filename: input.filename.trim(),
      batchId,
      sourceType: input.sourceType,
      territoryId,
      salesLineTerritoryId: slt?.id ?? null,
      existingRetailer,
    });
    if (!payload) continue;

    const rpc = await supabase.rpc('commit_account_import_row', {
      p_import_row_id: importRowId,
      p_payload: payload as never,
    });
    if (rpc.error) {
      const stamp = failedImportRowStamp(rpc.error.message);
      await supabase.from('account_import_rows').update(stamp).eq('id', importRowId);
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: stamp.status,
        retailerId: null,
        name: row.name,
        error: stamp.error,
      });
      continue;
    }

    const result = rpc.data as {
      ok?: boolean;
      retailer_id?: number | null;
      account_contact_id?: string | null;
      status?: AccountImportRowStatus;
      error?: string | null;
    };
    if (!result?.ok) {
      const stamp = failedImportRowStamp(result?.error ?? 'Commit RPC failed');
      await supabase.from('account_import_rows').update(stamp).eq('id', importRowId);
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: stamp.status,
        retailerId: null,
        name: row.name,
        error: stamp.error,
      });
      continue;
    }
    if (result.account_contact_id) contactsCreated += 1;
    if (result.retailer_id != null) {
      const locationChanged =
        payload.action === 'create_retailer' ||
        (payload.prospect_patch != null &&
          prospectPatchTouchesLocation(payload.prospect_patch as Record<string, unknown>));
      await runOperationalTerritoryReviewSyncForProspectId(supabase, result.retailer_id, {
        locationChanged,
      });
    }
    committed.push({
      rowNumber: row.rowNumber,
      matchDecision: row.matchDecision,
      status: result.status ?? finalStatusFor(row.matchDecision),
      retailerId: result.retailer_id ?? null,
      name: row.name,
      error: null,
    });
  }

  const report = {
    ...tallyCommitReport(committed, input.uploadedRows),
    contactsCreated,
  };
  const batchUpdate = batchIsFullyTerminal(committed)
    ? { status: 'committed' as const, report }
    : { report };
  const { error: batchUpdateError } = await supabase
    .from('account_import_batches')
    .update(batchUpdate)
    .eq('id', batchId);
  if (batchUpdateError) {
    return { ok: false, error: batchUpdateError.message, status: 500 };
  }

  return {
    ok: true,
    resumed,
    batchId,
    report,
    rows: committed,
  };
}
