import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import type { Prospect } from '@/lib/prospects';
import { filterProspects } from '@/lib/prospectFilters';
import { suggestFollowUps } from '@/lib/suggestFollowUps';

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

type SuggestState = {
  prospectName: string;
  summary: string;
  followUps: string[];
} | null;

export function ProspectsTab({ prospects, onLogCall }: ProspectsTabProps) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [suggestBusyId, setSuggestBusyId] = useState<number | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [suggestResult, setSuggestResult] = useState<SuggestState>(null);

  const filteredProspects = useMemo(
    () => filterProspects(prospects, { search, region, channel }),
    [prospects, search, region, channel],
  );

  async function handleSuggest(prospect: Prospect) {
    setSuggestError(null);
    setSuggestBusyId(prospect.id);
    const result = await suggestFollowUps(prospect.id);
    setSuggestBusyId(null);
    if (!result.ok) {
      setSuggestError(`${prospect.name}: ${result.error}`);
      return;
    }
    setSuggestResult({
      prospectName: prospect.name,
      summary: result.summary,
      followUps: result.followUps,
    });
  }

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

      {suggestError ? (
        <p className="text-sm text-red-700" role="alert">
          {suggestError}
        </p>
      ) : null}

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
                        disabled={suggestBusyId === p.id}
                        onClick={() => void handleSuggest(p)}
                      >
                        {suggestBusyId === p.id ? 'Suggest…' : 'Suggest'}
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

      <DialogBackdrop open={suggestResult != null} onClose={() => setSuggestResult(null)}>
        {suggestResult ? (
          <div className="bg-surface p-4.1 flex max-w-[560px] flex-col gap-3 rounded-xl shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Follow-ups · {suggestResult.prospectName}</DialogTitle>
              <button
                type="button"
                onClick={() => setSuggestResult(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-transparent"
                aria-label="Close"
              >
                <X size={18} strokeWidth={2.75} />
              </button>
            </div>
            <p className="text-ink/85 text-sm leading-relaxed">{suggestResult.summary}</p>
            {suggestResult.followUps.length > 0 ? (
              <ol className="text-ink/85 list-decimal space-y-1.5 pl-5 text-sm">
                {suggestResult.followUps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setSuggestResult(null)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </DialogBackdrop>
    </section>
  );
}
