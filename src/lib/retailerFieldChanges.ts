/**
 * Insert retailer_field_changes rows for AI-applied identity edits (Phase 4).
 */

import type { AgentSupabase } from '@/lib/agentAuth';
import type { RetailerFieldChangeSource, RetailerFieldChangeStatus } from '@/types/database';

export const VERIFIED_IDENTITY_FIELDS = [
  'name',
  'address',
  'phone',
  'website',
  'city',
  'postal_code',
] as const;
export type VerifiedIdentityField = (typeof VERIFIED_IDENTITY_FIELDS)[number];

const VERIFIED_STATUS_RE = /^verified$/i;

export function isVerifiedIdentityStatus(input: {
  buyerVerified?: boolean | null;
  verificationStatus?: string | null;
  importProtected?: boolean | null;
}): boolean {
  if (input.importProtected === true) return true;
  if (input.buyerVerified === true) return true;
  const status = input.verificationStatus?.trim() ?? '';
  return VERIFIED_STATUS_RE.test(status);
}

export function isVerifiedIdentityField(field: string): boolean {
  if ((VERIFIED_IDENTITY_FIELDS as readonly string[]).includes(field)) return true;
  return field === 'postalCode';
}

export type RetailerFieldChangeInsert = {
  retailerId: number;
  fieldPath: string;
  oldValue: unknown;
  newValue: unknown;
  source?: RetailerFieldChangeSource;
  actorId?: string | null;
  salesLineId?: string | null;
  retailerLineAccountId?: string | null;
  status?: RetailerFieldChangeStatus;
  confidence?: string | null;
  provider?: string | null;
  sourceUrls?: unknown;
  enrichmentJobId?: string | null;
};

function toInsertRow(input: RetailerFieldChangeInsert) {
  return {
    retailer_id: input.retailerId,
    field_path: input.fieldPath,
    old_value: input.oldValue as never,
    new_value: input.newValue as never,
    source: input.source ?? 'ai',
    actor_id: input.actorId ?? null,
    sales_line_id: input.salesLineId ?? null,
    retailer_line_account_id: input.retailerLineAccountId ?? null,
    ...(input.status ? { status: input.status } : {}),
    ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
    ...(input.provider !== undefined ? { provider: input.provider } : {}),
    ...(input.sourceUrls !== undefined ? { source_urls: input.sourceUrls as never } : {}),
    ...(input.enrichmentJobId !== undefined ? { enrichment_job_id: input.enrichmentJobId } : {}),
  };
}

/** Insert one audit row. Soft-fails are returned as error strings. */
export async function insertRetailerFieldChange(
  client: AgentSupabase,
  input: RetailerFieldChangeInsert,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return insertRetailerFieldChanges(client, [input]);
}

export async function insertRetailerFieldChanges(
  client: AgentSupabase,
  rows: RetailerFieldChangeInsert[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (rows.length === 0) return { ok: true };
  const { error } = await client.from('retailer_field_changes').insert(rows.map(toInsertRow));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
