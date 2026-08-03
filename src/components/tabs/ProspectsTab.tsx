import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import type { Prospect } from '@/lib/prospects';
import { filterProspects } from '@/lib/prospectFilters';
import { useAiAssist } from '@/hooks/useAiAssist';
import { buildAssistDraft, buildSuggestDraft } from '@/lib/aiAssistPrefill';

const REGION_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Regions (6 corridors)' },
  { value: 'Okanagan', label: 'Okanagan Valley' },
  { value: 'Shuswap', label: 'Shuswap & Thompson-Nicola' },
  { value: 'Vancouver Island', label: 'Vancouver Island & Gulf Islands' },
  { value: 'Sea-to-Sky', label: 'Sea-to-Sky & Sunshine Coast' },
  { value: 'Kootenays', label: 'Kootenays & Columbia-Shuswap' },
  { value: 'Fraser Valley', label: 'Lower Mainland / Fraser Valley' },
];

const CHANNEL_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Retail Channels' },
  { value: 'Golf', label: 'Golf Pro Shops' },
  { value: 'Marina', label: 'Marinas & Boat Stores' },
  { value: 'Hardware', label: 'Hardware Dealers & Co-ops' },
  { value: 'Resort Gift', label: 'Resort Gift Boutiques' },
];

const channelTagVariant: Record<
  Prospect['category'],
  'accent-2' | 'accent' | 'neutral' | 'outline'
> = {
  Golf: 'accent-2',
  Marina: 'accent',
  Hardware: 'neutral',
  'Resort Gift': 'outline',
};

interface ProspectsTabProps {
  prospects: Prospect[];
  onLogCall: (prospect: Prospect) => void;
}

export function ProspectsTab({ prospects, onLogCall }: ProspectsTabProps) {
  const { openAssist } = useAiAssist();
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('ALL');
  const [channel, setChannel] = useState('ALL');

  const filteredProspects = useMemo(
    () => filterProspects(prospects, { search, region, channel }),
    [prospects, search, region, channel],
  );

  return (
    <section className="flex flex-col gap-5" data-screen-label="prospects">
      <Card row className="flex-wrap items-center gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Search 249 BC prospects by name, city, address, or fit reason…"
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
          Showing {filteredProspects.length} of {prospects.length}
        </span>
      </Card>

      <Card elevation="md" className="overflow-hidden p-0">
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface sticky top-0">
                {['#', 'Store', 'Channel', 'City (Region)', 'Address', 'Phone', 'Fit Reason'].map(
                  (h) => (
                    <th
                      key={h}
                      className="border-ink/15 text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase"
                    >
                      {h}
                    </th>
                  ),
                )}
                <th className="border-ink/15 text-ink/60 border-b p-2 text-right text-[11px] tracking-wider uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProspects.map((p) => (
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
                  <td className="border-ink/[0.08] border-b p-2 text-right">
                    <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        onClick={() => {
                          const chips = { prospectId: p.id, prospectName: p.name };
                          openAssist({ chips, draft: buildSuggestDraft(chips) });
                        }}
                      >
                        Suggest
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        onClick={() => {
                          const chips = { prospectId: p.id, prospectName: p.name };
                          openAssist({ chips, draft: buildAssistDraft(chips) });
                        }}
                      >
                        Ask AI
                      </Button>
                      <Button
                        variant="secondary"
                        className="px-3 py-1 text-xs"
                        onClick={() => onLogCall(p)}
                      >
                        Log Call
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
