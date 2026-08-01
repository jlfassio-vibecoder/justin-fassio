import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { PROSPECTS_DATA, type Prospect } from '@/data/prospects';

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

const channelTagVariant: Record<Prospect['category'], 'accent-2' | 'accent' | 'neutral' | 'outline'> = {
  Golf: 'accent-2',
  Marina: 'accent',
  Hardware: 'neutral',
  'Resort Gift': 'outline',
};

interface ProspectsTabProps {
  onLogCall: (prospect: Prospect) => void;
}

export function ProspectsTab({ onLogCall }: ProspectsTabProps) {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('ALL');
  const [channel, setChannel] = useState('ALL');

  const filteredProspects = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PROSPECTS_DATA.filter((p) => {
      if (region !== 'ALL' && p.region !== region) return false;
      if (channel !== 'ALL' && p.category !== channel) return false;
      if (q) {
        const hay = `${p.name} ${p.city} ${p.address} ${p.fit}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [search, region, channel]);

  return (
    <section className="flex flex-col gap-5" data-screen-label="prospects">
      <Card row className="flex-wrap items-center gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Search 250 BC prospects by name, city, address, or fit reason…"
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
        <span className="whitespace-nowrap text-xs opacity-65">
          Showing {filteredProspects.length} of {PROSPECTS_DATA.length}
        </span>
      </Card>

      <Card elevation="md" className="overflow-hidden p-0">
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="sticky top-0 bg-surface">
                {['#', 'Store', 'Channel', 'City (Region)', 'Address', 'Phone', 'Fit Reason'].map((h) => (
                  <th
                    key={h}
                    className="border-b border-ink/15 p-2 text-left text-[11px] uppercase tracking-wider text-ink/60"
                  >
                    {h}
                  </th>
                ))}
                <th className="border-b border-ink/15 p-2 text-right text-[11px] uppercase tracking-wider text-ink/60">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredProspects.map((p) => (
                <tr key={p.id} className="hover:bg-ink/[0.04]">
                  <td className="border-b border-ink/[0.08] p-2">{p.id}</td>
                  <td className="min-w-[160px] border-b border-ink/[0.08] p-2 font-semibold">{p.name}</td>
                  <td className="border-b border-ink/[0.08] p-2">
                    <Tag variant={channelTagVariant[p.category]}>{p.category}</Tag>
                  </td>
                  <td className="border-b border-ink/[0.08] p-2">
                    {p.city} ({p.region})
                  </td>
                  <td className="border-b border-ink/[0.08] p-2 opacity-75">{p.address}</td>
                  <td className="border-b border-ink/[0.08] p-2">{p.phone}</td>
                  <td className="min-w-[240px] border-b border-ink/[0.08] p-2 opacity-75">{p.fit}</td>
                  <td className="border-b border-ink/[0.08] p-2 text-right">
                    <Button variant="secondary" className="px-3 py-1 text-xs" onClick={() => onLogCall(p)}>
                      Log Call
                    </Button>
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
