import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CrossLineBadgeChips } from '@/components/CrossLineBadgeChips';
import { Card } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { hasMarker } from '@/lib/accountImport/classification';
import { formatAccountLocationLine } from '@/lib/accountImport/directoryPresentation';
import { CHANNEL_OPTIONS } from '@/lib/directoryOptions';
import { regionOptionsForTerritory } from '@/lib/geoCatalog';
import { filterProspects } from '@/lib/prospectFilters';
import { primaryRetailChannelLabel } from '@/lib/crmRetailTaxonomy';
import type { Prospect } from '@/lib/prospects';
import { fetchCrossLineBadgesForRetailers, type CrossLineBadge } from '@/lib/retailerLineAccounts';
import { ALL_TERRITORIES_FILTER, type Territory } from '@/lib/territories';

const channelTagVariant: Partial<
  Record<Prospect['category'], 'accent-2' | 'accent' | 'neutral' | 'outline'>
> = {
  golf_retail: 'accent-2',
  marine_retail: 'accent',
  hardware_farm_rural: 'neutral',
  gift_novelty_souvenir: 'outline',
  apparel_specialty: 'accent-2',
  resort_hospitality: 'outline',
  fishing_fly_tackle: 'accent',
};

function tagVariantForChannel(
  category: Prospect['category'],
): 'accent-2' | 'accent' | 'neutral' | 'outline' {
  return channelTagVariant[category] ?? 'neutral';
}

const BASE_HEADERS = ['#', 'Store', 'Channel', 'City (Region)', 'Address', 'Phone', 'Fit Reason'];

const HEADER_CELL_CLASS =
  'sticky top-0 z-10 bg-surface border-ink/15 text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase';
const ACTION_COLUMN_WIDTH_DEFAULT = 'min-w-[7.5rem] w-[7.5rem]';
const ACTION_CELL_BASE =
  'sticky right-0 bg-surface border-l border-ink/15 shadow-[-4px_0_8px_rgba(0,0,0,0.06)]';

export interface RetailerDirectoryProps {
  retailers: Prospect[];
  searchPlaceholder: string;
  emptyMessage?: string;
  extraColumnHeaders?: string[];
  renderExtraCells?: (retailer: Prospect) => ReactNode;
  /** Full sticky Action cell content (primary button + overflow menu). */
  renderActions: (retailer: Prospect) => ReactNode;
  /** Row click activate (ignores interactive descendants). */
  onRowActivate?: (retailer: Prospect) => void;
  'data-screen-label'?: string;
  /** Optional content above the table (e.g. alerts). */
  banner?: ReactNode;
  /** Extra controls in the filter toolbar (e.g. Add via AI). */
  toolbarExtra?: ReactNode;
  /** Briefly highlight a row (e.g. after AI add). */
  highlightedId?: number | null;
  /** Active territories for the directory filter. */
  territories?: Territory[];
  /** Controlled territory code; defaults to all territories. */
  territoryCode?: string;
  onTerritoryCodeChange?: (code: string) => void;
  /** Phase 2: when set, show empty-safe cross-line badge chips. */
  currentSalesLineId?: string | null;
  /** Wider sticky action column when multiple inline buttons are shown. */
  actionColumnWidthClass?: string;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest('button, a, input, select, textarea, [role="menu"], [role="menuitem"]'),
  );
}

export function RetailerDirectory({
  retailers,
  searchPlaceholder,
  emptyMessage = 'No retailers match these filters.',
  extraColumnHeaders = [],
  renderExtraCells,
  renderActions,
  onRowActivate,
  'data-screen-label': dataScreenLabel,
  banner,
  toolbarExtra,
  highlightedId = null,
  territories = [],
  territoryCode: territoryCodeProp,
  onTerritoryCodeChange,
  currentSalesLineId = null,
  actionColumnWidthClass = ACTION_COLUMN_WIDTH_DEFAULT,
}: RetailerDirectoryProps) {
  const actionCellClass = `${ACTION_CELL_BASE} z-20 ${actionColumnWidthClass}`;
  const actionHeaderClass = `${ACTION_CELL_BASE} top-0 z-30 ${actionColumnWidthClass}`;
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('ALL');
  const [channel, setChannel] = useState('ALL');
  const [territoryCodeInternal, setTerritoryCodeInternal] = useState(ALL_TERRITORIES_FILTER);
  const territoryCode = territoryCodeProp ?? territoryCodeInternal;
  const [badgesByRetailer, setBadgesByRetailer] = useState<Map<number, CrossLineBadge[]>>(
    () => new Map(),
  );

  function setTerritoryCode(code: string) {
    if (territoryCodeProp === undefined) {
      setTerritoryCodeInternal(code);
    }
    onTerritoryCodeChange?.(code);
  }

  const regionOptions = useMemo(() => regionOptionsForTerritory(territoryCode), [territoryCode]);
  // Nested region list changes with territory; keep filter valid without an effect reset.
  const effectiveRegion = regionOptions.some((o) => o.value === region) ? region : 'ALL';

  useEffect(() => {
    if (highlightedId == null) return;
    const timer = window.setTimeout(() => {
      document
        .querySelector(`[data-prospect-id="${highlightedId}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  const retailerIdsKey = useMemo(
    () =>
      retailers
        .map((r) => r.id)
        .sort((a, b) => a - b)
        .join(','),
    [retailers],
  );

  useEffect(() => {
    if (!currentSalesLineId || retailerIdsKey === '') {
      return;
    }
    const ids = retailerIdsKey.split(',').map((s) => Number(s));
    let active = true;
    void fetchCrossLineBadgesForRetailers({
      retailerIds: ids,
      currentSalesLineId,
    }).then((result) => {
      if (!active) return;
      setBadgesByRetailer(result.error ? new Map() : result.data);
    });
    return () => {
      active = false;
    };
  }, [currentSalesLineId, retailerIdsKey]);

  const filtered = useMemo(
    () => filterProspects(retailers, { search, region: effectiveRegion, channel, territoryCode }),
    [retailers, search, effectiveRegion, channel, territoryCode],
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
        {territories.length > 0 ? (
          <Select
            className="w-auto"
            value={territoryCode}
            onChange={(e) => setTerritoryCode(e.target.value)}
            aria-label="Territory"
          >
            <option value="ALL">All territories</option>
            {territories.map((t) => (
              <option key={t.code} value={t.code}>
                {t.name}
              </option>
            ))}
          </Select>
        ) : null}
        <Select
          className="w-auto"
          value={effectiveRegion}
          onChange={(e) => setRegion(e.target.value)}
          aria-label="Region"
        >
          {regionOptions.map((opt) => (
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
        {toolbarExtra}
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
                <tr>
                  {BASE_HEADERS.map((h) => (
                    <th key={h} className={HEADER_CELL_CLASS}>
                      {h}
                    </th>
                  ))}
                  {extraColumnHeaders.map((h) => (
                    <th key={h} className={HEADER_CELL_CLASS}>
                      {h}
                    </th>
                  ))}
                  <th
                    className={`${actionHeaderClass} border-ink/15 text-ink/60 border-b p-2 text-right text-[11px] tracking-wider uppercase`}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, index) => {
                  return (
                    <tr
                      key={p.id}
                      data-prospect-id={p.id}
                      className={
                        highlightedId === p.id
                          ? 'bg-ink/[0.08] ring-accent-800/40 ring-2 ring-inset'
                          : onRowActivate
                            ? 'hover:bg-ink/[0.04] cursor-pointer'
                            : 'hover:bg-ink/[0.04]'
                      }
                      onClick={
                        onRowActivate
                          ? (event) => {
                              if (isInteractiveTarget(event.target)) return;
                              onRowActivate(p);
                            }
                          : undefined
                      }
                    >
                      <td className="border-ink/[0.08] border-b p-2" title={`ID ${p.id}`}>
                        {index + 1}
                      </td>
                      <td className="border-ink/[0.08] min-w-[160px] border-b p-2 font-semibold">
                        <span className="inline-flex flex-col gap-1">
                          <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span>{p.name}</span>
                            {hasMarker(p.lineAccountMarkers, 'lookalike_prospect') ? (
                              <Tag variant="accent-2">Lookalike</Tag>
                            ) : null}
                          </span>
                          <CrossLineBadgeChips
                            badges={currentSalesLineId ? (badgesByRetailer.get(p.id) ?? []) : []}
                          />
                        </span>
                      </td>
                      <td className="border-ink/[0.08] border-b p-2">
                        <Tag variant={tagVariantForChannel(p.category)}>
                          {primaryRetailChannelLabel(p.category)}
                        </Tag>
                      </td>
                      <td className="border-ink/[0.08] border-b p-2">
                        {formatAccountLocationLine({
                          city: p.city,
                          region: p.region,
                          territoryCode: p.territoryCode,
                          territoryName: p.territoryName,
                        })}
                      </td>
                      <td className="border-ink/[0.08] border-b p-2 opacity-75">{p.address}</td>
                      <td className="border-ink/[0.08] border-b p-2">{p.phone}</td>
                      <td className="border-ink/[0.08] min-w-[240px] border-b p-2 opacity-75">
                        {p.fit}
                      </td>
                      {renderExtraCells ? renderExtraCells(p) : null}
                      <td
                        className={`${actionCellClass} border-ink/[0.08] border-b p-2 text-right`}
                      >
                        <div className="flex flex-col items-end gap-1.5">{renderActions(p)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
