import type { AgentSupabase } from '@/lib/agentAuth';
import {
  ACCOUNT_IMPORT_SOURCE_TYPES,
  HISTORICAL_OGR_IMPORT_DEFAULTS,
} from '@/lib/accountImport/classification';
import { assertImportLineAllowed, parseRequiredSalesLineId } from '@/lib/accountImport/lineGate';
import { historicalImportSeedNote, importSourceNote } from '@/lib/accountImport/notes';
import { markersFromUnknown } from '@/lib/accountImport/preview';
import type { ConfirmClassification, PreviewImportRow } from '@/lib/accountImport/types';
import { isVerifiedIdentityField, isVerifiedIdentityStatus } from '@/lib/retailerFieldChanges';
import {
  fetchSalesLineTerritories,
  suggestedAssignmentForLocation,
} from '@/lib/salesLineTerritories';
import type {
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

export function parseConfirmClassification(raw: unknown): ConfirmClassification {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const relationship =
    obj.relationshipStatus === 'opened' ||
    obj.relationshipStatus === 'prospect' ||
    obj.relationshipStatus === 'qualified' ||
    obj.relationshipStatus === 'inactive' ||
    obj.relationshipStatus === 'terminated'
      ? (obj.relationshipStatus as RelationshipStatus)
      : HISTORICAL_OGR_IMPORT_DEFAULTS.relationshipStatus;
  const existingOgr =
    typeof obj.existingOgr === 'string' && obj.existingOgr.trim()
      ? obj.existingOgr.trim()
      : HISTORICAL_OGR_IMPORT_DEFAULTS.existingOgr;
  const nextAction = typeof obj.nextAction === 'string' ? obj.nextAction.trim() || null : null;
  const markers: LineAccountMarker[] = markersFromUnknown(obj.markers);
  return {
    relationshipStatus: relationship,
    markers: markers.length > 0 ? markers : [...HISTORICAL_OGR_IMPORT_DEFAULTS.markers],
    existingOgr,
    nextAction,
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
  existingRetailer?: {
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
  } | null;
}): CommitRowRpcPayload | null {
  if (!isEligibleImportDecision(input.row.matchDecision)) return null;

  const seed = historicalImportSeedNote({
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
    qualification_status: HISTORICAL_OGR_IMPORT_DEFAULTS.qualificationStatus,
    next_action: input.classification.nextAction,
    notes: seed,
    source_note: sourceNote,
    sales_line_territory_id: input.salesLineTerritoryId,
    backfill_review_reason: input.salesLineTerritoryId ? null : 'territory_assignment_missing',
    converted_at: null,
    initial_order_date: null,
  };

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
      account_status: HISTORICAL_OGR_IMPORT_DEFAULTS.accountStatus,
      converted_at: null,
      initial_order_date: null,
      import_protected: true,
      existing_ogr: input.classification.existingOgr,
      qualification_status: HISTORICAL_OGR_IMPORT_DEFAULTS.qualificationStatus,
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
): Promise<NonNullable<Parameters<typeof buildCommitRowPayload>[0]['existingRetailer']>> {
  const { data: prospect, error } = await supabase
    .from('prospects')
    .select(
      'name, address, city, phone, website, postal_code, import_protected, buyer_verified, verification_status',
    )
    .eq('id', retailerId)
    .maybeSingle();
  if (error || !prospect) {
    return {
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
    };
  }
  const { data: primary } = await supabase
    .from('account_contacts')
    .select('id')
    .eq('account_id', retailerId)
    .eq('is_primary', true)
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
  };
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

  const { data: existingBatch } = await supabase
    .from('account_import_batches')
    .select('id, report')
    .eq('sales_line_id', lineId.salesLineId)
    .eq('content_sha256', input.contentSha256)
    .in('status', ['committed', 'enriching', 'enrichment_partial', 'completed'])
    .maybeSingle();
  if (existingBatch) {
    const { data: existingRows } = await supabase
      .from('account_import_rows')
      .select('row_number, match_decision, status, retailer_id, error, normalized_payload')
      .eq('batch_id', existingBatch.id)
      .order('row_number', { ascending: true });
    const mapped: CommittedImportRow[] = (existingRows ?? []).map((row) => ({
      rowNumber: row.row_number,
      matchDecision: row.match_decision,
      status: row.status,
      retailerId: row.retailer_id,
      name:
        row.normalized_payload &&
        typeof row.normalized_payload === 'object' &&
        'name' in row.normalized_payload &&
        typeof row.normalized_payload.name === 'string'
          ? row.normalized_payload.name
          : '',
      error: row.error,
    }));
    return {
      ok: true,
      resumed: true,
      batchId: existingBatch.id,
      report:
        existingBatch.report && typeof existingBatch.report === 'object'
          ? (existingBatch.report as CommitReport)
          : tallyCommitReport(mapped, input.uploadedRows),
      rows: mapped,
    };
  }

  const classification = parseConfirmClassification(input.classification);
  const territories = await supabase.from('territories').select('id, code');
  if (territories.error) return { ok: false, error: territories.error.message, status: 500 };
  const territoryIdByCode = new Map((territories.data ?? []).map((t) => [t.code, t.id]));

  const assignments = await fetchSalesLineTerritories(supabase, lineId.salesLineId);
  if (assignments.error) return { ok: false, error: assignments.error, status: 500 };

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
    return {
      ok: false,
      error: batchError?.message ?? 'Could not create import batch',
      status: 500,
    };
  }

  const insertRows = input.rows.map((row) => ({
    batch_id: batch.id,
    sales_line_id: lineId.salesLineId,
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

  const { data: persistedRows, error: rowsError } = await supabase
    .from('account_import_rows')
    .insert(insertRows)
    .select('id, row_number');
  if (rowsError || !persistedRows) {
    await supabase.from('account_import_batches').delete().eq('id', batch.id);
    return { ok: false, error: rowsError?.message ?? 'Could not create import rows', status: 500 };
  }

  await supabase.from('account_import_batches').update({ status: 'committed' }).eq('id', batch.id);

  const idByRowNumber = new Map(persistedRows.map((r) => [r.row_number, r.id]));
  const committed: CommittedImportRow[] = [];
  let contactsCreated = 0;
  const cancelRest = Boolean(input.cancelRequested);

  for (const row of input.rows) {
    const importRowId = idByRowNumber.get(row.rowNumber);
    if (!importRowId) continue;

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
      await supabase
        .from('account_import_rows')
        .update({ status: 'failed', error: 'Oregon or Washington territory is missing' })
        .eq('id', importRowId);
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: 'failed',
        retailerId: null,
        name: row.name,
        error: 'Oregon or Washington territory is missing',
      });
      continue;
    }

    const slt = suggestedAssignmentForLocation(assignments.data, row.stateCode);
    const existingRetailer = row.match?.retailerId
      ? await loadExistingRetailer(supabase, row.match.retailerId)
      : null;
    const payload = buildCommitRowPayload({
      row,
      classification,
      filename: input.filename.trim(),
      batchId: batch.id,
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
      await supabase
        .from('account_import_rows')
        .update({ status: 'failed', error: rpc.error.message })
        .eq('id', importRowId);
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: 'failed',
        retailerId: null,
        name: row.name,
        error: rpc.error.message,
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
      committed.push({
        rowNumber: row.rowNumber,
        matchDecision: row.matchDecision,
        status: 'failed',
        retailerId: null,
        name: row.name,
        error: result?.error ?? 'Commit RPC failed',
      });
      continue;
    }
    if (result.account_contact_id) contactsCreated += 1;
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
  await supabase
    .from('account_import_batches')
    .update({ status: 'completed', report })
    .eq('id', batch.id);

  return {
    ok: true,
    resumed: false,
    batchId: batch.id,
    report,
    rows: committed,
  };
}
