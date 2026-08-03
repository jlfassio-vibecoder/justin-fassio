import { useMemo, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { CHANNEL_OPTIONS, REGION_OPTIONS } from '@/lib/directoryOptions';
import { filterProspects } from '@/lib/prospectFilters';
import type { Prospect } from '@/lib/prospects';

const channelTagVariant: Record<
  Prospect['category'],
  'accent-2' | 'accent' | 'neutral' | 'outline'
> = {
  Golf: 'accent-2',
  Marina: 'accent',
  Hardware: 'neutral',
  'Resort Gift': 'outline',
};

const BASE_HEADERS = ['#', 'Store', 'Channel', 'City (Region)', 'Address', 'Phone', 'Fit Reason'];

export interface RetailerDirectoryProps {
  retailers: Prospect[];
  searchPlaceholder: string;
  emptyMessage?: string;
  extraColumnHeaders?: string[];
  renderExtraCells?: (retailer: Prospect) => ReactNode;
  renderActions: (retailer: Prospect) => ReactNode;
  'data-screen-label'?: string;
  /** Optional content above the table (e.g. alerts). */
  banner?: ReactNode;
}

export function RetailerDirectory({
  retailers,
  searchPlaceholder,
  emptyMessage = 'No retailers match these filters.',
  extraColumnHeaders = [],
  renderExtraCells,
  renderActions,
  'data-screen-label': dataScreenLabel,
  banner,
}: RetailerDirectoryProps) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('ALL');
  const [channel, setChannel] = useState('ALL');

  const filtered = useMemo(
    () => filterProspects(retailers, { search, region, channel }),
    [retailers, search, region, channel],
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
        <Select className="w-auto" value={region} onChange={(e) => setRegion(e.target.value)}>
          {REGION_OPTIONS.map((opt) => (
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
        <span className="text-xs whitespace-nowrap opacity-65">
          Showing {filtered.length} of {retailers.length}
        </span>
      </Card>

      {banner}

      <Card elevation="md" className="overflow-hidden p-0">
        {filtered.length === 0 ? (
          <p className="text-ink/60 m-0 px-4 py-8 text-center text-sm">{emptyMessage}</p>
        ) : (
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-surface sticky top-0">
                  {BASE_HEADERS.map((h) => (
                    <th
                      key={h}
                      className="border-ink/15 text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase"
                    >
                      {h}
                    </th>
                  ))}
                  {extraColumnHeaders.map((h) => (
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
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-ink/[0.04]">
                    <td className="border-ink/[0.08] border-b p-2">{p.id}</td>
                    <td className="border-ink/[0.08] min-w-[160px] border-b p-2 font-semibold">
                      {p.name}
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      <Tag variant={channelTagVariant[p.category]}>{p.category}</Tag>
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      {p.city} ({p.region})
                    </td>
                    <td className="border-ink/[0.08] border-b p-2 opacity-75">{p.address}</td>
                    <td className="border-ink/[0.08] border-b p-2">{p.phone}</td>
                    <td className="border-ink/[0.08] min-w-[240px] border-b p-2 opacity-75">
                      {p.fit}
                    </td>
                    {renderExtraCells ? renderExtraCells(p) : null}
                    <td className="border-ink/[0.08] border-b p-2 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                        {renderActions(p)}
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
