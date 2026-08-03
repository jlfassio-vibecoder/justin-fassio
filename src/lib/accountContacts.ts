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

/** All contacts joined with store fields for the Contacts directory. */
export async function fetchAllContacts(): Promise<{
  data: ContactDirectoryRow[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from('account_contacts')
    .select(ACCOUNT_CONTACT_SELECT)
    .order('full_name', { ascending: true });

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

export async function insertAccountContact(
  input: AccountContactInsert,
): Promise<{ data: AccountContact | null; error: string | null }> {
  const { data, error } = await supabase
    .from('account_contacts')
    .insert(input)
    .select(ACCOUNT_CONTACT_SELECT)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: mapAccountContactRow(data as AccountContactRow), error: null };
}

export async function updateAccountContact(
  id: string,
  input: AccountContactUpdate,
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

  return { data: mapAccountContactRow(data as AccountContactRow), error: null };
}

export async function deleteAccountContact(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('account_contacts').delete().eq('id', id);
  return { error: error?.message ?? null };
}
