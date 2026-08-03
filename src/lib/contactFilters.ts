import type { ContactDirectoryRow } from '@/lib/accountContacts';
import type { AccountStatus } from '@/types/database';

export interface ContactFilterOptions {
  search: string;
  region: string;
  channel: string;
  /** `ALL` | `prospect` | `active_account` */
  accountStatus: string;
}

export function filterContacts(
  contacts: ContactDirectoryRow[],
  { search, region, channel, accountStatus }: ContactFilterOptions,
): ContactDirectoryRow[] {
  const q = search.trim().toLowerCase();
  return contacts.filter((c) => {
    if (region !== 'ALL' && c.accountRegion !== region) return false;
    if (channel !== 'ALL' && c.accountCategory !== channel) return false;
    if (accountStatus !== 'ALL' && c.accountStatus !== (accountStatus as AccountStatus)) {
      return false;
    }
    if (q) {
      const hay =
        `${c.fullName} ${c.title ?? ''} ${c.phone ?? ''} ${c.email ?? ''} ${c.accountName} ${c.accountCity}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
