/**
 * Latest product-outreach sent_at by prospect id and/or recipient email.
 * Shared by live selection, Briefing research queue, and identified-target draft create.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeSystemMessageEmail,
  SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
} from '@/lib/systemMessages';
import type { Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

function rememberLatestSend(
  row: { prospect_id: number | null; to_email: string; sent_at: string | null },
  byProspectId: Map<number, string>,
  byEmail: Map<string, string>,
): void {
  if (!row.sent_at) return;
  if (
    typeof row.prospect_id === 'number' &&
    Number.isFinite(row.prospect_id) &&
    !byProspectId.has(row.prospect_id)
  ) {
    byProspectId.set(row.prospect_id, row.sent_at);
  }
  if (typeof row.to_email === 'string' && row.to_email.trim()) {
    const email = normalizeSystemMessageEmail(row.to_email);
    if (!byEmail.has(email)) {
      byEmail.set(email, row.sent_at);
    }
  }
}

export async function loadLatestProductOutreachSends(
  client: DbClient,
  prospectIds: number[],
  emails: string[] = [],
): Promise<
  | {
      ok: true;
      byProspectId: Map<number, string>;
      byEmail: Map<string, string>;
    }
  | { ok: false; error: string }
> {
  const byProspectId = new Map<number, string>();
  const byEmail = new Map<string, string>();
  if (prospectIds.length === 0 && emails.length === 0) {
    return { ok: true, byProspectId, byEmail };
  }

  if (prospectIds.length > 0) {
    let prospectQuery = client
      .from('system_messages')
      .select('prospect_id, to_email, sent_at')
      .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
      .not('sent_at', 'is', null)
      .in('prospect_id', prospectIds)
      .order('sent_at', { ascending: false });
    // Single-id callers (e.g. Run prep) only need the newest row.
    if (prospectIds.length === 1) {
      prospectQuery = prospectQuery.limit(1);
    }

    const { data, error } = await prospectQuery;

    if (error) {
      return { ok: false, error: error.message };
    }
    for (const row of data ?? []) {
      rememberLatestSend(row, byProspectId, byEmail);
    }
  }

  if (emails.length > 0) {
    let emailQuery = client
      .from('system_messages')
      .select('prospect_id, to_email, sent_at')
      .eq('message_type', SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH)
      .not('sent_at', 'is', null)
      .in('to_email', emails)
      .order('sent_at', { ascending: false });
    if (emails.length === 1) {
      emailQuery = emailQuery.limit(1);
    }

    const { data, error } = await emailQuery;

    if (error) {
      return { ok: false, error: error.message };
    }
    for (const row of data ?? []) {
      rememberLatestSend(row, byProspectId, byEmail);
    }
  }

  return { ok: true, byProspectId, byEmail };
}

/** Prefer the more recent of prospect-id and email lookups. */
export function latestProductOutreachSentAt(
  prospectId: number,
  toEmail: string | null | undefined,
  byProspectId: Map<number, string>,
  byEmail: Map<string, string>,
): string | null {
  const a = byProspectId.get(prospectId) ?? null;
  const b =
    toEmail && toEmail.trim() ? (byEmail.get(normalizeSystemMessageEmail(toEmail)) ?? null) : null;
  if (a && b) {
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
  }
  return a ?? b;
}
