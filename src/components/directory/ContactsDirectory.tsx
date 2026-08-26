import { useMemo, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { accountContactRoleLabel, type ContactDirectoryRow } from '@/lib/accountContacts';
import { filterContacts } from '@/lib/contactFilters';
import { CHANNEL_OPTIONS } from '@/lib/directoryOptions';
import { allDriveableRegionOptions } from '@/lib/geoCatalog';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All account statuses' },
  { value: 'prospect', label: 'Prospects' },
  { value: 'active_account', label: 'Active Accounts' },
];

const HEADERS = [
  'Contact',
  'Role',
  'Primary',
  'Title',
  'Phone',
  'Email',
  'Store #',
  'Store',
  'Channel',
  'City (Region)',
  'Status',
];

const channelTagVariant: Record<string, 'accent-2' | 'accent' | 'neutral' | 'outline'> = {
  golf_retail: 'accent-2',
  marine_retail: 'accent',
  hardware_farm_rural: 'neutral',
  gift_novelty_souvenir: 'outline',
};

const STATUS_LABEL: Record<ContactDirectoryRow['accountStatus'], string> = {
  prospect: 'Prospect',
  active_account: 'Active',
  inactive: 'Inactive',
};

export interface ContactsDirectoryProps {
  contacts: ContactDirectoryRow[];
  searchPlaceholder: string;
  emptyMessage?: string;
  renderActions: (contact: ContactDirectoryRow) => ReactNode;
  'data-screen-label'?: string;
  /** Extra controls in the filter toolbar (e.g. Add via AI). */
  toolbarExtra?: ReactNode;
}

export function ContactsDirectory({
  contacts,
  searchPlaceholder,
  emptyMessage = 'No contacts match these filters.',
  renderActions,
  'data-screen-label': dataScreenLabel,
  toolbarExtra,
}: ContactsDirectoryProps) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [accountStatus, setAccountStatus] = useState('ALL');

  const filtered = useMemo(
    () => filterContacts(contacts, { search, region, channel, accountStatus }),
    [contacts, search, region, channel, accountStatus],
  );

  return (
    <section className="flex flex-col gap-5" data-screen-label={dataScreenLabel}>
      <Card row className="flex-wrap items-center gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          className="w-auto"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Region"
        >
          {allDriveableRegionOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select className="w-auto" value={channel} onChange={(e) => setChannel(e.target.value)}>
          {CHANNEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={accountStatus}
          onChange={(e) => setAccountStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        {toolbarExtra}
        <span className="text-xs whitespace-nowrap opacity-65">
          Showing {filtered.length} of {contacts.length}
        </span>
      </Card>

      <Card elevation="md" className="overflow-hidden p-0">
        {filtered.length === 0 ? (
          <p className="text-ink/60 m-0 px-4 py-8 text-center text-sm">{emptyMessage}</p>
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface sticky top-0">
                  {HEADERS.map((h) => (
                    <th
                      key={h}
                      className="border-ink/15 text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  <th className="border-ink/15 text-ink/60 border-b p-2 text-right text-[11px] tracking-wider uppercase">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-ink/[0.04]">
                    <td className="border-ink/[0.08] min-w-[140px] border-b p-2 font-semibold">
                      {c.fullName}
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      {accountContactRoleLabel(c.role)}
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      {c.isPrimary ? <Tag variant="accent-2">Primary</Tag> : '—'}
                    </td>
                    <td className="border-ink/[0.08] border-b p-2 opacity-75">{c.title || '—'}</td>
                    <td className="border-ink/[0.08] border-b p-2">{c.phone || '—'}</td>
                    <td className="border-ink/[0.08] border-b p-2 opacity-75">{c.email || '—'}</td>
                    <td className="border-ink/[0.08] border-b p-2">{c.accountId}</td>
                    <td className="border-ink/[0.08] min-w-[140px] border-b p-2 font-semibold">
                      {c.accountName}
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      <Tag variant={channelTagVariant[c.accountCategory] ?? 'outline'}>
                        {c.accountCategory}
                      </Tag>
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      {c.accountCity} ({c.accountRegion})
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      {STATUS_LABEL[c.accountStatus]}
                    </td>
                    <td className="border-ink/[0.08] border-b p-2 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {renderActions(c)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
