/**
 * Insert retailer_field_changes rows for AI-applied identity edits (Phase 4).
 */

import type { AgentSupabase } from '@/lib/agentAuth';
import type { RetailerFieldChangeSource } from '@/types/database';

export const VERIFIED_IDENTITY_FIELDS = ['name', 'address', 'phone', 'website'] as const;
export type VerifiedIdentityField = (typeof VERIFIED_IDENTITY_FIELDS)[number];

const VERIFIED_STATUS_RE = /^verified$/i;

export function isVerifiedIdentityStatus(input: {
  buyerVerified?: boolean | null;
  verificationStatus?: string | null;
}): boolean {
  if (input.buyerVerified === true) return true;
  const status = input.verificationStatus?.trim() ?? '';
  return VERIFIED_STATUS_RE.test(status);
}

export function isVerifiedIdentityField(field: string): field is VerifiedIdentityField {
  return (VERIFIED_IDENTITY_FIELDS as readonly string[]).includes(field);
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
};

/** Insert one audit row. Soft-fails are returned as error strings. */
export async function insertRetailerFieldChange(
  client: AgentSupabase,
  input: RetailerFieldChangeInsert,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await client.from('retailer_field_changes').insert({
    retailer_id: input.retailerId,
    field_path: input.fieldPath,
    old_value: input.oldValue as never,
    new_value: input.newValue as never,
    source: input.source ?? 'ai',
    actor_id: input.actorId ?? null,
    sales_line_id: input.salesLineId ?? null,
    retailer_line_account_id: input.retailerLineAccountId ?? null,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function insertRetailerFieldChanges(
  client: AgentSupabase,
  rows: RetailerFieldChangeInsert[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const row of rows) {
    const result = await insertRetailerFieldChange(client, row);
    if (!result.ok) return result;
  }
  return { ok: true };
}
