import { supabase } from '@/lib/supabase';
import { resolveOgrLineId } from '@/lib/lines';
import { accountStatusFromRelationship } from '@/lib/ogrCommercial';
import { fetchOperationalLineAccount } from '@/lib/retailerLineAccounts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AccountContact as AccountContactRow,
  AccountContactInsert,
  AccountContactRole,
  AccountContactUpdate,
  AccountStatus,
  Database,
} from '@/types/database';

export const ACCOUNT_CONTACT_ROLES = [
  'buyer',
  'manager',
  'owner',
] as const satisfies readonly AccountContactRole[];

export const ACCOUNT_CONTACT_ROLE_LABELS: Record<AccountContactRole, string> = {
  buyer: 'Buyer',
  manager: 'Manager',
  owner: 'Owner',
};

export function accountContactRoleLabel(role: AccountContactRole): string {
  return ACCOUNT_CONTACT_ROLE_LABELS[role];
}

export const ACCOUNT_CONTACT_SELECT =
  'id, account_id, role, full_name, title, phone, email, alternate_email, is_primary, notes, created_at, updated_at' as const;

export interface AccountContact {
  id: string;
  accountId: number;
  role: AccountContactRole;
  fullName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
  alternateEmail: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountContactSearchHit extends AccountContact {
  accountName: string;
  accountCity: string;
  accountStatus: AccountStatus;
}

/** Contact row enriched with store fields for the Contacts directory tab. */
export interface ContactDirectoryRow extends AccountContact {
  accountName: string;
  accountCity: string;
  accountRegion: string;
  accountCategory: string;
  accountAddress: string;
  accountPhone: string;
  accountStatus: AccountStatus;
}

export type ProspectContactJoin = {
  id: number;
  name: string;
  city: string;
  region: string;
  category: string;
  address: string;
  phone: string;
  account_status: AccountStatus;
};

export function enrichContactsForDirectory(
  contacts: AccountContact[],
  prospects: ProspectContactJoin[],
): ContactDirectoryRow[] {
  const byId = new Map(prospects.map((p) => [p.id, p]));
  return contacts.map((contact) => {
    const prospect = byId.get(contact.accountId);
    return {
      ...contact,
      accountName: prospect?.name ?? '—',
      accountCity: prospect?.city ?? '—',
      accountRegion: prospect?.region ?? '—',
      accountCategory: prospect?.category ?? '—',
      accountAddress: prospect?.address ?? '',
      accountPhone: prospect?.phone ?? '',
      accountStatus: prospect?.account_status ?? 'prospect',
    };
  });
}

export function mapAccountContactRow(row: AccountContactRow): AccountContact {
  return {
    id: row.id,
    accountId: row.account_id,
    role: row.role,
    fullName: row.full_name,
    title: row.title,
    phone: row.phone,
    email: row.email,
    alternateEmail: row.alternate_email,
    isPrimary: row.is_primary,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchContactsForAccount(
  accountId: number,
): Promise<{ data: AccountContact[]; error: string | null }> {
  const { data, error } = await supabase
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .eq('account_id', accountId)
    .order('is_primary', { ascending: false })
    .order('full_name', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return {
    data: ((data ?? []) as AccountContactRow[]).map(mapAccountContactRow),
    error: null,
  };
}

export async function fetchAccountContactById(
  client: SupabaseClient<Database>,
  contactId: string,
): Promise<{ data: AccountContact | null; error: string | null }> {
  const { data, error } = await client
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .eq('id', contactId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }
  if (!data) {
    return { data: null, error: null };
  }
  return { data: mapAccountContactRow(data as AccountContactRow), error: null };
}

export type FetchAllContactsOptions = {
  /**
   * When set, only contacts for retailers with a non-terminated RLA on this line
   * (via retailer_line_contacts when present).
   */
  salesLineId?: string;
};

/** Keep PostgREST `.in(uuid…)` GET URLs under typical Kong/nginx limits (~8KB). */
export const POSTGREST_UUID_IN_CHUNK = 80;

export function chunkIds<T>(ids: readonly T[], size = POSTGREST_UUID_IN_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/** All contacts joined with store fields for the Contacts directory. */
export async function fetchAllContacts(options: FetchAllContactsOptions = {}): Promise<{
  data: ContactDirectoryRow[];
  error: string | null;
}> {
  let allowedContactIds: Set<string> | null = null;
  let allowedAccountIds: Set<number> | null = null;

  let statusByRetailer = new Map<number, AccountStatus>();

  if (options.salesLineId) {
    const { data: rlaRows, error: rlaError } = await supabase
      .from('retailer_line_accounts')
      .select('id, retailer_id, relationship_status')
      .eq('sales_line_id', options.salesLineId)
      .neq('relationship_status', 'terminated');

    if (rlaError) {
      return { data: [], error: rlaError.message };
    }

    const lineAccountIds = (rlaRows ?? []).map((r) => r.id);
    allowedAccountIds = new Set((rlaRows ?? []).map((r) => r.retailer_id));
    for (const row of rlaRows ?? []) {
      statusByRetailer.set(row.retailer_id, accountStatusFromRelationship(row.relationship_status));
    }

    if (lineAccountIds.length === 0) {
      return { data: [], error: null };
    }

    const junctionContactIds: string[] = [];
    for (const chunk of chunkIds(lineAccountIds)) {
      const { data: junctionRows, error: junctionError } = await supabase
        .from('retailer_line_contacts')
        .select('account_contact_id')
        .in('retailer_line_account_id', chunk);

      if (junctionError) {
        return { data: [], error: junctionError.message };
      }
      for (const row of junctionRows ?? []) {
        junctionContactIds.push(row.account_contact_id);
      }
    }

    if (junctionContactIds.length > 0) {
      allowedContactIds = new Set(junctionContactIds);
    }
  }

  const { data, error } = await supabase
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .order('full_name', { ascending: true });

  if (error) {
    return { data: [], error: error.message };
  }

  let contacts = ((data ?? []) as AccountContactRow[]).map(mapAccountContactRow);
  if (allowedContactIds) {
    contacts = contacts.filter((c) => allowedContactIds.has(c.id));
  } else if (allowedAccountIds) {
    contacts = contacts.filter((c) => allowedAccountIds.has(c.accountId));
  }

  const accountIds = [...new Set(contacts.map((c) => c.accountId))];
  if (accountIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: prospects, error: prospectError } = await supabase
    .from('prospects')
    .select('id, name, city, region, category, address, phone, account_status')
    .in('id', accountIds);

  if (prospectError) {
    return { data: [], error: prospectError.message };
  }

  if (!options.salesLineId) {
    const overlay = await fetchRelationshipStatusByRetailer(
      (await resolveOgrLineId()) ?? '',
      accountIds,
    );
    if (overlay.error) {
      return { data: [], error: overlay.error };
    }
    statusByRetailer = overlay.data;
  }

  return {
    data: overlayContactAccountStatus(
      enrichContactsForDirectory(contacts, (prospects ?? []) as ProspectContactJoin[]),
      statusByRetailer,
    ),
    error: null,
  };
}

/** Case-insensitive name search; empty/whitespace query returns [] without querying. */
export async function searchContactsByName(
  query: string,
): Promise<{ data: AccountContactSearchHit[]; error: string | null }> {
  const q = query.trim();
  if (!q) {
    return { data: [], error: null };
  }

  const { data, error } = await supabase
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .ilike('full_name', `%${q}%`)
    .order('full_name', { ascending: true })
    .limit(20);

  if (error) {
    return { data: [], error: error.message };
  }

  const contacts = ((data ?? []) as AccountContactRow[]).map(mapAccountContactRow);
  const accountIds = [...new Set(contacts.map((c) => c.accountId))];
  if (accountIds.length === 0) {
    return { data: [], error: null };
  }

  const { data: prospects, error: prospectError } = await supabase
    .from('prospects')
    .select('id, name, city, account_status')
    .in('id', accountIds);

  if (prospectError) {
    return { data: [], error: prospectError.message };
  }

  const byId = new Map(
    (
      (prospects ?? []) as {
        id: number;
        name: string;
        city: string;
        account_status: AccountStatus;
      }[]
    ).map((p) => [p.id, p]),
  );

  const hits: AccountContactSearchHit[] = contacts.map((contact) => {
    const prospect = byId.get(contact.accountId);
    return {
      ...contact,
      accountName: prospect?.name ?? '—',
      accountCity: prospect?.city ?? '—',
      accountStatus: prospect?.account_status ?? 'prospect',
    };
  });

  const overlay = await fetchRelationshipStatusByRetailer(
    (await resolveOgrLineId()) ?? '',
    accountIds,
  );
  if (overlay.error) {
    return { data: [], error: overlay.error };
  }

  return { data: overlayContactAccountStatus(hits, overlay.data), error: null };
}

function overlayContactAccountStatus<T extends { accountId: number; accountStatus: AccountStatus }>(
  rows: T[],
  statusByRetailer: Map<number, AccountStatus>,
): T[] {
  if (statusByRetailer.size === 0) return rows;
  return rows.map((row) => {
    const overlaid = statusByRetailer.get(row.accountId);
    return overlaid ? { ...row, accountStatus: overlaid } : row;
  });
}

async function fetchRelationshipStatusByRetailer(
  salesLineId: string,
  retailerIds: number[],
): Promise<{ data: Map<number, AccountStatus>; error: string | null }> {
  const map = new Map<number, AccountStatus>();
  if (!salesLineId || retailerIds.length === 0) return { data: map, error: null };
  const { data, error } = await supabase
    .from('retailer_line_accounts')
    .select('retailer_id, relationship_status')
    .eq('sales_line_id', salesLineId)
    .in('retailer_id', retailerIds)
    .neq('relationship_status', 'terminated');
  if (error) return { data: map, error: error.message };
  for (const row of data ?? []) {
    map.set(row.retailer_id, accountStatusFromRelationship(row.relationship_status));
  }
  return { data: map, error: null };
}

/**
 * Upsert retailer_line_contacts for an existing RLA on the explicit sales line only.
 * Never creates an RLA (no client-created RLA). Skips when salesLineId is missing or no RLA.
 * OGR DB trigger on account_contacts may still ensure an OGR RLA — unchanged.
 */
async function maybeUpsertLineContactJunction(
  contact: AccountContact,
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<string | null> {
  const salesLineId = options?.salesLineId?.trim() || null;
  if (!salesLineId) return null;

  const existing = await fetchOperationalLineAccount({
    retailerId: contact.accountId,
    salesLineId,
  });
  if (existing.error) return existing.error;
  if (!existing.data) return null;

  const { error } = await supabase.from('retailer_line_contacts').upsert(
    {
      retailer_line_account_id: existing.data.id,
      account_contact_id: contact.id,
      role: contact.role,
      is_primary: contact.isPrimary,
      notes: contact.notes,
    },
    { onConflict: 'retailer_line_account_id,account_contact_id' },
  );
  return error?.message ?? null;
}

export async function insertAccountContact(
  input: AccountContactInsert,
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<{ data: AccountContact | null; error: string | null }> {
  const { data, error } = await supabase
    .from('account_contacts')
    .insert(input)
    .select(ACCOUNT_CONTACT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  const mapped = mapAccountContactRow(data as AccountContactRow);
  const junctionError = await maybeUpsertLineContactJunction(mapped, options);
  if (junctionError) {
    // Roll back the committed person row so primary restore / retry stays consistent.
    await supabase.from('account_contacts').delete().eq('id', mapped.id);
    return { data: null, error: junctionError };
  }
  return { data: mapped, error: null };
}

export async function updateAccountContact(
  id: string,
  input: AccountContactUpdate,
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<{ data: AccountContact | null; error: string | null }> {
  const { data, error } = await supabase
    .from('account_contacts')
    .update(input)
    .eq('id', id)
    .select(ACCOUNT_CONTACT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  const mapped = mapAccountContactRow(data as AccountContactRow);
  const junctionError = await maybeUpsertLineContactJunction(mapped, options);
  if (junctionError) {
    // Revert primary flag when that was the write that partially applied.
    if (typeof input.is_primary === 'boolean') {
      await supabase
        .from('account_contacts')
        .update({ is_primary: !input.is_primary })
        .eq('id', id);
    }
    return { data: null, error: junctionError };
  }
  return { data: mapped, error: null };
}

export async function deleteAccountContact(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('account_contacts').delete().eq('id', id);
  return { error: error?.message ?? null };
}

/** Normalize email for same-account duplicate checks. */
export function normalizeContactEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/** Normalize full name for same-account duplicate checks. */
export function normalizeContactFullName(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().toLowerCase();
}

/** Exact email match against email or alternate_email (case-insensitive). Hard duplicate. */
export function findExactEmailDuplicate(
  contacts: readonly AccountContact[],
  email: string | null | undefined,
): AccountContact | null {
  const normalized = normalizeContactEmail(email);
  if (!normalized) return null;
  return (
    contacts.find(
      (c) =>
        normalizeContactEmail(c.email) === normalized ||
        normalizeContactEmail(c.alternateEmail) === normalized,
    ) ?? null
  );
}

/** Name-only match when there is no email collision. Soft warning. */
export function findNameOnlyDuplicate(
  contacts: readonly AccountContact[],
  fullName: string,
): AccountContact | null {
  const name = normalizeContactFullName(fullName);
  if (!name) return null;
  return contacts.find((c) => normalizeContactFullName(c.fullName) === name) ?? null;
}

export type AccountContactDuplicateMatch =
  { kind: 'email'; contact: AccountContact } | { kind: 'name'; contact: AccountContact };

/** Classify same-account duplicate: email/alternate hard, else name soft. */
export function classifyAccountContactDuplicate(
  contacts: readonly AccountContact[],
  input: { fullName: string; email?: string | null; alternateEmail?: string | null },
): AccountContactDuplicateMatch | null {
  const byEmail = findExactEmailDuplicate(contacts, input.email);
  if (byEmail) return { kind: 'email', contact: byEmail };
  const byAlternate = findExactEmailDuplicate(contacts, input.alternateEmail);
  if (byAlternate) return { kind: 'email', contact: byAlternate };
  const byName = findNameOnlyDuplicate(contacts, input.fullName);
  if (byName) return { kind: 'name', contact: byName };
  return null;
}

/**
 * @deprecated Prefer classifyAccountContactDuplicate (email hard / name soft).
 * Kept for callers that still treat any match as a block.
 */
export function findObviousAccountContactDuplicate(
  contacts: readonly AccountContact[],
  input: { fullName: string; email?: string | null },
): AccountContact | null {
  return classifyAccountContactDuplicate(contacts, input)?.contact ?? null;
}

/** First primary contact on the account list, if any. */
export function findPrimaryAccountContact(
  contacts: readonly AccountContact[],
): AccountContact | null {
  return contacts.find((c) => c.isPrimary) ?? null;
}

/**
 * Demote an existing primary contact before promoting another.
 * Uses updateAccountContact so RLA junction stays in sync when salesLineId is set.
 */
export async function demoteAccountPrimaryContact(
  contactId: string,
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<{ error: string | null }> {
  const result = await updateAccountContact(contactId, { is_primary: false }, options);
  return { error: result.error };
}

/** Restore a contact as primary after a failed create/promote. */
export async function restoreAccountPrimaryContact(
  contactId: string,
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<{ error: string | null }> {
  const result = await updateAccountContact(contactId, { is_primary: true }, options);
  return { error: result.error };
}
