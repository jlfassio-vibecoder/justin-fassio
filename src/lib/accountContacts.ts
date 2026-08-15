import { supabase } from '@/lib/supabase';
import type {
  AccountContact as AccountContactRow,
  AccountContactInsert,
  AccountContactRole,
  AccountContactUpdate,
  AccountStatus,
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
  'id, account_id, role, full_name, title, phone, email, is_primary, notes, created_at, updated_at' as const;

export interface AccountContact {
  id: string;
  accountId: number;
  role: AccountContactRole;
  fullName: string;
  title: string | null;
  phone: string | null;
  email: string | null;
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

export type FetchAllContactsOptions = {
  /**
   * When set, only contacts for retailers with a non-terminated RLA on this line
   * (via retailer_line_contacts when present).
   */
  salesLineId?: string;
};

/** All contacts joined with store fields for the Contacts directory. */
export async function fetchAllContacts(options: FetchAllContactsOptions = {}): Promise<{
  data: ContactDirectoryRow[];
  error: string | null;
}> {
  let allowedContactIds: Set<string> | null = null;
  let allowedAccountIds: Set<number> | null = null;

  if (options.salesLineId) {
    const { data: rlaRows, error: rlaError } = await supabase
      .from('retailer_line_accounts')
      .select('id, retailer_id')
      .eq('sales_line_id', options.salesLineId)
      .neq('relationship_status', 'terminated');

    if (rlaError) {
      return { data: [], error: rlaError.message };
    }

    const lineAccountIds = (rlaRows ?? []).map((r) => r.id);
    allowedAccountIds = new Set((rlaRows ?? []).map((r) => r.retailer_id));

    if (lineAccountIds.length === 0) {
      return { data: [], error: null };
    }

    const { data: junctionRows, error: junctionError } = await supabase
      .from('retailer_line_contacts')
      .select('account_contact_id')
      .in('retailer_line_account_id', lineAccountIds);

    if (junctionError) {
      return { data: [], error: junctionError.message };
    }

    if ((junctionRows ?? []).length > 0) {
      allowedContactIds = new Set((junctionRows ?? []).map((r) => r.account_contact_id));
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

  return {
    data: enrichContactsForDirectory(contacts, (prospects ?? []) as ProspectContactJoin[]),
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

  return { data: hits, error: null };
}

async function maybeUpsertLineContactJunction(
  contact: AccountContact,
  options?: { writesEnabled?: boolean; salesLineId?: string | null },
): Promise<string | null> {
  if (!options?.writesEnabled || !options.salesLineId) return null;

  const { data: rla, error: rlaError } = await supabase
    .from('retailer_line_accounts')
    .select('id')
    .eq('retailer_id', contact.accountId)
    .eq('sales_line_id', options.salesLineId)
    .neq('relationship_status', 'terminated')
    .maybeSingle();
  if (rlaError) return rlaError.message;
  if (!rla) return 'Line account not found';

  const { error } = await supabase.from('retailer_line_contacts').upsert(
    {
      retailer_line_account_id: rla.id,
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
  if (junctionError) return { data: null, error: junctionError };
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
  if (junctionError) return { data: null, error: junctionError };
  return { data: mapped, error: null };
}

export async function deleteAccountContact(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('account_contacts').delete().eq('id', id);
  return { error: error?.message ?? null };
}
