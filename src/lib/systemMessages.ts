import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, SystemMessageInsert } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH = 'product_outreach' as const;
export const SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL = 'manual_product_email' as const;

export type ProductOutreachCrmAssociation = {
  prospectId: number | null;
  accountContactId: string | null;
};

export type ProductOutreachSystemMessagePayload = {
  sku: string;
  name: string;
  slug: string;
  productHref: string;
  from?: string;
};

export type InsertProductOutreachSystemMessageInput = {
  catalogItemId: string;
  resendEmailId: string;
  toEmail: string;
  toName?: string | null;
  subject: string;
  prospectId?: number | null;
  accountContactId?: string | null;
  sentBy: string;
  payload: ProductOutreachSystemMessagePayload;
};

function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function normalizeSystemMessageEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Exact case-insensitive match on account_contacts.email.
 * Returns association only when exactly one contact matches.
 */
export async function matchUniqueAccountContactByEmail(
  client: DbClient,
  email: string,
): Promise<ProductOutreachCrmAssociation | null> {
  const normalized = normalizeSystemMessageEmail(email);
  if (!normalized) return null;

  const { data, error } = await client
    .from('account_contacts')
    .select('id, account_id, email')
    .ilike('email', escapeIlikeExact(normalized));

  if (error || !data?.length) return null;

  const matches = data.filter((row) => {
    const rowEmail = typeof row.email === 'string' ? normalizeSystemMessageEmail(row.email) : '';
    return rowEmail === normalized;
  });

  if (matches.length !== 1) return null;
  const match = matches[0];
  if (!match || !Number.isFinite(match.account_id)) return null;

  return {
    prospectId: match.account_id,
    accountContactId: match.id,
  };
}

export type ResolveProductOutreachCrmResult =
  | { ok: true; association: ProductOutreachCrmAssociation }
  | { ok: false; error: string };

/**
 * Resolve CRM links for a product outreach send.
 * Explicit prospectId + accountContactId (both required together) win over email match.
 */
export async function resolveProductOutreachCrmAssociation(
  client: DbClient,
  input: {
    prospectId?: number | null;
    accountContactId?: string | null;
    toEmail: string;
  },
): Promise<ResolveProductOutreachCrmResult> {
  const hasProspect = input.prospectId != null;
  const hasContact = input.accountContactId != null && input.accountContactId.trim() !== '';

  if (hasProspect !== hasContact) {
    return {
      ok: false,
      error: 'prospectId and accountContactId must be provided together',
    };
  }

  if (hasProspect && hasContact) {
    const prospectId = input.prospectId as number;
    const accountContactId = (input.accountContactId as string).trim();

    const { data, error } = await client
      .from('account_contacts')
      .select('id, account_id')
      .eq('id', accountContactId)
      .maybeSingle();

    if (error) {
      return { ok: false, error: 'Could not validate account contact' };
    }
    if (!data) {
      return { ok: false, error: 'Account contact not found' };
    }
    if (data.account_id !== prospectId) {
      return { ok: false, error: 'Account contact does not belong to the given prospect' };
    }

    return {
      ok: true,
      association: {
        prospectId,
        accountContactId: data.id,
      },
    };
  }

  const matched = await matchUniqueAccountContactByEmail(client, input.toEmail);
  return {
    ok: true,
    association: matched ?? { prospectId: null, accountContactId: null },
  };
}

export type InsertProductOutreachSystemMessageResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function insertProductOutreachSystemMessage(
  client: DbClient,
  input: InsertProductOutreachSystemMessageInput,
): Promise<InsertProductOutreachSystemMessageResult> {
  const now = new Date().toISOString();
  const row: SystemMessageInsert = {
    message_type: SYSTEM_MESSAGE_TYPE_PRODUCT_OUTREACH,
    origin: SYSTEM_MESSAGE_ORIGIN_MANUAL_PRODUCT_EMAIL,
    status: 'sent',
    catalog_item_id: input.catalogItemId,
    resend_email_id: input.resendEmailId,
    to_email: normalizeSystemMessageEmail(input.toEmail),
    to_name: input.toName?.trim() || null,
    subject: input.subject,
    prospect_id: input.prospectId ?? null,
    account_contact_id: input.accountContactId ?? null,
    sent_by: input.sentBy,
    queued_at: now,
    sent_at: now,
    payload: {
      sku: input.payload.sku,
      name: input.payload.name,
      slug: input.payload.slug,
      productHref: input.payload.productHref,
      ...(input.payload.from ? { from: input.payload.from } : {}),
    },
  };

  const { data, error } = await client.from('system_messages').insert(row).select('id').single();

  if (error || !data?.id) {
    return { ok: false, error: error?.message ?? 'Failed to insert system message' };
  }

  return { ok: true, id: data.id };
}
