import { useMemo, useState } from 'react';
import { Card, CardKicker, CardMeta, CardTitle } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import type { CatalogItem } from '@/lib/catalog';
import { filterCatalogItems, type CatalogFlagFilter } from '@/lib/catalogFilters';
import { landedCad, marginPct } from '@/lib/landedCost';

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Categories' },
  { value: 'Short Sleeve Tees', label: 'Short Sleeve Tees' },
  { value: 'Long Sleeve UPF50 Sun Tees', label: 'UPF50 Sun Protection Shirts' },
  { value: 'Special Additions', label: 'Long Sleeve Tees, Tanks & Hoodies' },
  { value: 'Headwear', label: 'Headwear' },
  { value: 'Giftware', label: 'Giftware & Drinkware' },
  { value: 'Vintage Metal Signs', label: 'Vintage Metal Signs' },
  { value: 'Displays & POP', label: 'Displays & POP' },
  { value: 'Magnets & Stickers', label: 'Magnets & Stickers' },
];

interface CatalogTabProps {
  catalog: CatalogItem[];
  fx: number;
  setFx: (fx: number) => void;
  freight: number;
  setFreight: (freight: number) => void;
  marginRangeDisplay: string;
}

export function CatalogTab({
  catalog,
  fx,
  setFx,
  freight,
  setFreight,
  marginRangeDisplay,
}: CatalogTabProps) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [flag, setFlag] = useState<CatalogFlagFilter>('ALL');

  const filteredCatalog = useMemo(() => {
    return filterCatalogItems(catalog, { search, category, flag }).map((item) => {
      const landed = landedCad(item.priceUsd, fx, freight);
      const margin = marginPct(item.priceUsd, item.msrpCad, fx, freight);
      const sellable = margin != null;
      return {
        ...item,
        landed,
        priceDisplay: `$${item.priceUsd.toFixed(2)}`,
        landedDisplay: `$${landed.toFixed(2)}`,
        msrpDisplay: sellable ? `$${item.msrpCad.toFixed(2)}` : 'Not for resale',
        marginDisplay: sellable ? `${margin.toFixed(1)}%` : '—',
      };
    });
  }, [catalog, search, category, flag, fx, freight]);

  const newCount = useMemo(() => catalog.filter((it) => it.isNew).length, [catalog]);
  const nameDropCount = useMemo(() => catalog.filter((it) => it.isNameDrop).length, [catalog]);

  const sampleTee = useMemo(
    () => catalog.find((it) => it.cat === 'Short Sleeve Tees') ?? catalog[0],
    [catalog],
  );
  const sampleTeeLanded = sampleTee
    ? `$${landedCad(sampleTee.priceUsd, fx, freight).toFixed(2)} CAD`
    : '—';

  const freightPctDisplay = `${((freight - 1) * 100).toFixed(0)}%`;

  return (
    <section className="flex flex-col gap-5" data-screen-label="catalog">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Card>
          <CardKicker>Total Styles / SKUs</CardKicker>
          <CardTitle className="text-[28px]">{catalog.length} items</CardTitle>
          <CardMeta>
            {newCount} NEW 2026 &middot; {nameDropCount} Name-Drop eligible
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Tee Wholesale (USD)</CardKicker>
          <CardTitle className="text-[28px]">$13.00</CardTitle>
          <CardMeta>M–XL standard rate ($14 2X / $15 3X)</CardMeta>
        </Card>
        <Card>
          <CardKicker>Est. Landed CAD Cost</CardKicker>
          <CardTitle className="text-sage-800 text-[28px]">{sampleTeeLanded}</CardTitle>
          <CardMeta>
            FX {fx} &middot; freight +{freightPctDisplay}
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Retailer Keystone Margin</CardKicker>
          <CardTitle className="text-[28px]">{marginRangeDisplay}</CardTitle>
          <CardMeta>At suggested CAD MSRP across the line</CardMeta>
        </Card>
      </div>

      <Card row className="flex-wrap items-center justify-between gap-5">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="text-xs font-semibold opacity-70">CAD Landed Multiplier</span>
          <div className="flex items-center gap-1.5">
            <label className="text-xs whitespace-nowrap">FX rate</label>
            <Input
              type="number"
              step="0.01"
              min="1"
              value={fx}
              onChange={(e) => setFx(parseFloat(e.target.value) || 1.45)}
              className="w-20"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs whitespace-nowrap">Freight</label>
            <Input
              type="number"
              step="0.01"
              min="1"
              value={freight}
              onChange={(e) => setFreight(parseFloat(e.target.value) || 1.1)}
              className="w-20"
            />
          </div>
        </div>
        <div className="gap-4.1 flex flex-wrap text-[13px]">
          <span>
            Minimum: <strong>24 pcs</strong> (6/style)
          </span>
          <span>
            Ships from: <strong>Vista, CA (UPS)</strong>
          </span>
        </div>
      </Card>

      <Card row className="flex-wrap items-center gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Search by SKU, style name, tagline, or color…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select className="w-auto" value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          value={flag}
          onChange={(e) => setFlag(e.target.value as CatalogFlagFilter)}
        >
          <option value="ALL">All Flags</option>
          <option value="NEW">NEW 2026</option>
          <option value="NAMEDROP">Name Drop Eligible</option>
        </Select>
        <span className="text-xs whitespace-nowrap opacity-65">
          Showing {filteredCatalog.length} of {catalog.length}
        </span>
      </Card>

      <Card elevation="md" className="overflow-hidden p-0">
        <div className="max-h-[640px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surface sticky top-0">
                {[
                  'Pg',
                  'SKU',
                  'Product',
                  'Category',
                  'Color',
                  'Tagline',
                  'Wholesale',
                  'Landed CAD',
                  'MSRP CAD',
                ].map((h) => (
                  <th
                    key={h}
                    className="border-ink/15 text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase"
                  >
                    {h}
                  </th>
                ))}
                <th className="border-ink/15 text-ink/60 border-b p-2 text-right text-[11px] tracking-wider uppercase">
                  Margin
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalog.map((item) => (
                <tr key={item.sku} className="hover:bg-ink/[0.04]">
                  <td className="border-ink/[0.08] border-b p-2">{item.page}</td>
                  <td className="border-ink/[0.08] font-heading border-b p-2 text-[13px]">
                    {item.sku}
                  </td>
                  <td className="border-ink/[0.08] min-w-[180px] border-b p-2">
                    <div className="font-semibold">{item.name}</div>
                    <div className="mt-0.5 flex gap-1">
                      {item.isNew && <Tag variant="accent">New</Tag>}
                      {item.isNameDrop && <Tag variant="accent-2">Name Drop</Tag>}
                    </div>
                  </td>
                  <td className="border-ink/[0.08] border-b p-2">{item.cat}</td>
                  <td className="border-ink/[0.08] border-b p-2">{item.color}</td>
                  <td className="border-ink/[0.08] min-w-[220px] border-b p-2 opacity-75">
                    {item.tagline}
                  </td>
                  <td className="border-ink/[0.08] border-b p-2">{item.priceDisplay}</td>
                  <td className="border-ink/[0.08] border-b p-2">{item.landedDisplay}</td>
                  <td className="border-ink/[0.08] border-b p-2">{item.msrpDisplay}</td>
                  <td className="border-ink/[0.08] border-b p-2 text-right font-semibold">
                    {item.marginDisplay}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardTitle className="text-[17px]">Wholesale Terms &amp; Ordering Guidelines</CardTitle>
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5">
          <div className="bg-bg rounded-md p-3.5 text-[13px]">
            <p className="text-accent-700 mb-1.5 font-semibold">Minimum Order</p>
            <p className="mb-1">
              <strong>24 pieces</strong> total, <strong>6 pieces</strong> per style.
            </p>
            <p className="text-xs opacity-70">
              Free floor display with a qualifying $2,800 USD opening order.
            </p>
          </div>
          <div className="bg-bg rounded-md p-3.5 text-[13px]">
            <p className="text-sage-800 mb-1.5 font-semibold">Shipping</p>
            <p className="mb-1">
              UPS Ground from <strong>Vista, California</strong>.
            </p>
            <p className="text-xs opacity-70">
              72-hour standard turnaround; 4–6 days in peak season.
            </p>
          </div>
          <div className="bg-bg rounded-md p-3.5 text-[13px]">
            <p className="text-accent-700 mb-1.5 font-semibold">Terms</p>
            <p className="mb-1">
              Card / COD for new accounts. <strong>Net 30</strong> on approved credit.
            </p>
            <p className="text-xs opacity-70">"Name Drop" styles support custom store branding.</p>
          </div>
        </div>
      </Card>
    </section>
  );
}
