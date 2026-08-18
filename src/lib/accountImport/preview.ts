import type { AgentSupabase } from '@/lib/agentAuth';
import { ACCOUNT_IMPORT_SOURCE_TYPES } from '@/lib/accountImport/classification';
import { assertImportLineAllowed, parseRequiredSalesLineId } from '@/lib/accountImport/lineGate';
import {
  matchCollapsedRows,
  summarizePreview,
  type PriorImportHit,
  type ThinContact,
  type ThinRetailer,
  type ThinRla,
} from '@/lib/accountImport/matchRetailers';
import type {
  CollapsedImportRow,
  PreviewCounts,
  PreviewImportRow,
} from '@/lib/accountImport/types';
import type { AccountImportSourceType, LineAccountMarker } from '@/types/database';

export type PreviewResult =
  | {
      ok: true;
      counts: PreviewCounts;
      rows: PreviewImportRow[];
      existingCommittedBatchId: string | null;
    }
  | { ok: false; error: string; status: number };

function isSourceType(value: unknown): value is AccountImportSourceType {
  return (
    typeof value === 'string' && (ACCOUNT_IMPORT_SOURCE_TYPES as readonly string[]).includes(value)
  );
}

export async function loadCrmMatchSnapshot(
  supabase: AgentSupabase,
  salesLineId: string,
  sourceType: AccountImportSourceType,
): Promise<
  | {
      ok: true;
      retailers: ThinRetailer[];
      rlas: ThinRla[];
      contacts: ThinContact[];
      priorFingerprints: PriorImportHit[];
    }
  | { ok: false; error: string }
> {
  const { data: territories, error: terrError } = await supabase
    .from('territories')
    .select('id, code');
  if (terrError) return { ok: false, error: terrError.message };
  const codeById = new Map((territories ?? []).map((t) => [t.id, t.code]));

  const { data: prospects, error: prospectError } = await supabase
    .from('prospects')
    .select(
      'id, name, city, territory_id, account_status, external_id, import_protected, buyer_verified, verification_status',
    );
  if (prospectError) return { ok: false, error: prospectError.message };

  const retailers: ThinRetailer[] = (prospects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    territoryCode: p.territory_id ? (codeById.get(p.territory_id) ?? null) : null,
    accountStatus: p.account_status,
    externalId: p.external_id,
    importProtected: p.import_protected,
    buyerVerified: p.buyer_verified,
    verificationStatus: p.verification_status,
  }));

  const { data: rlaRows, error: rlaError } = await supabase
    .from('retailer_line_accounts')
    .select('id, retailer_id, relationship_status, line_account_markers')
    .eq('sales_line_id', salesLineId);
  if (rlaError) return { ok: false, error: rlaError.message };

  const rlas: ThinRla[] = (rlaRows ?? []).map((r) => ({
    id: r.id,
    retailerId: r.retailer_id,
    relationshipStatus: r.relationship_status,
    markers: r.line_account_markers ?? [],
  }));

  const { data: contactRows, error: contactError } = await supabase
    .from('account_contacts')
    .select('account_id, email, full_name, is_primary')
    .not('email', 'is', null);
  if (contactError) return { ok: false, error: contactError.message };

  const contacts: ThinContact[] = (contactRows ?? [])
    .filter((c) => Boolean(c.email))
    .map((c) => ({
      retailerId: c.account_id,
      email: (c.email ?? '').trim().toLowerCase(),
      fullName: c.full_name,
      isPrimary: c.is_primary,
    }));

  const { data: priorRows, error: priorError } = await supabase
    .from('account_import_rows')
    .select('fingerprint, retailer_id, status, batch_id')
    .eq('sales_line_id', salesLineId)
    .in('status', ['imported', 'linked', 'updated'])
    .not('fingerprint', 'is', null);
  if (priorError) return { ok: false, error: priorError.message };

  const batchIds = [...new Set((priorRows ?? []).map((r) => r.batch_id))];
  let allowedBatches = new Set<string>();
  if (batchIds.length > 0) {
    const { data: batches, error: batchError } = await supabase
      .from('account_import_batches')
      .select('id, source_type')
      .in('id', batchIds)
      .eq('source_type', sourceType);
    if (batchError) return { ok: false, error: batchError.message };
    allowedBatches = new Set((batches ?? []).map((b) => b.id));
  }

  const priorFingerprints: PriorImportHit[] = (priorRows ?? [])
    .filter((r) => r.fingerprint && r.retailer_id && allowedBatches.has(r.batch_id))
    .map((r) => ({
      fingerprint: r.fingerprint as string,
      retailerId: r.retailer_id,
    }));

  return { ok: true, retailers, rlas, contacts, priorFingerprints };
}

export async function previewAccountImport(
  supabase: AgentSupabase,
  input: {
    salesLineId: unknown;
    sourceType: unknown;
    contentSha256?: string | null;
    uploadedRows: number;
    rows: CollapsedImportRow[];
  },
): Promise<PreviewResult> {
  const lineId = parseRequiredSalesLineId(input.salesLineId);
  if (!lineId.ok) return lineId;
  if (!isSourceType(input.sourceType)) {
    return { ok: false, error: 'Invalid source type', status: 400 };
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

  const snapshot = await loadCrmMatchSnapshot(supabase, lineId.salesLineId, input.sourceType);
  if (!snapshot.ok) return { ok: false, error: snapshot.error, status: 500 };

  const matched = matchCollapsedRows({
    rows: input.rows,
    retailers: snapshot.retailers,
    rlas: snapshot.rlas,
    contacts: snapshot.contacts,
    priorFingerprints: snapshot.priorFingerprints,
  });

  let existingCommittedBatchId: string | null = null;
  if (input.contentSha256) {
    const { data: existing, error: existingError } = await supabase
      .from('account_import_batches')
      .select('id')
      .eq('sales_line_id', lineId.salesLineId)
      .eq('content_sha256', input.contentSha256)
      .in('status', ['committed', 'enriching', 'enrichment_partial', 'completed'])
      .maybeSingle();
    if (existingError) return { ok: false, error: existingError.message, status: 500 };
    existingCommittedBatchId = existing?.id ?? null;
  }

  return {
    ok: true,
    counts: summarizePreview(matched, input.uploadedRows),
    rows: matched,
    existingCommittedBatchId,
  };
}

const HISTORICAL_MARKERS: LineAccountMarker[] = ['historical_purchaser', 'reactivation_candidate'];

export function markersFromUnknown(raw: unknown): LineAccountMarker[] {
  if (!Array.isArray(raw)) return [...HISTORICAL_MARKERS];
  const allowed = new Set([
    'historical_purchaser',
    'reactivation_candidate',
    'reactivation_unresponsive',
  ]);
  return raw.filter(
    (item): item is LineAccountMarker => typeof item === 'string' && allowed.has(item),
  );
}
