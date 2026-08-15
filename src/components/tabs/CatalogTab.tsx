import { useEffect, useMemo, useState } from 'react';
import { LineEditDrawer } from '@/components/LineEditDrawer';
import { ProductDetailDrawer } from '@/components/ProductDetailDrawer';
import { Button } from '@/components/ui/Button';
import { Card, CardKicker, CardMeta, CardTitle } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Tag } from '@/components/ui/Tag';
import { resolvePrimaryImageSrc, type CatalogItem } from '@/lib/catalog';
import { filterCatalogItems, type CatalogFlagFilter } from '@/lib/catalogFilters';
import { factorsWithSettings, type CatalogSupplierTerms } from '@/lib/catalogSettings';
import {
  DEFAULT_LANDED_COST_FACTORS,
  formatRatePct,
  landedCad,
  marginPct,
  type LandedCostFactors,
} from '@/lib/landedCost';
import { fetchLandedRates, type LandedRatesPayload } from '@/lib/landedRatesClient';
import { useOptionalLineContext } from '@/lib/lineContext';
import { fetchLineByCode, type LinePortfolio } from '@/lib/lines';
import {
  DEFAULT_KEYSTONE_MARGIN_RATE,
  MIN_ORDER_PIECES,
  minOrderTotalBreakdown,
  retailKeystoneBreakdown,
} from '@/lib/retailPricing';
import {
  fetchPendingAgentDraftCountsByCatalogItemId,
  fetchProductEngagementAlerts,
  markProductEngagementSeen,
  type ProductEngagementAlertKind,
} from '@/lib/systemMessages';

const ENGAGEMENT_ALERT_POLL_MS = 60_000;
function catalogThumbSrc(item: CatalogItem): string | null {
  const src = resolvePrimaryImageSrc(item);
  if (!src) return null;
  if (/^https?:\/\//i.test(src) || src.startsWith('/')) return src;
  return null;
}

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

function parseRatePctInput(raw: string, fallback: number): number {
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n)) / 100;
}

function applyLandedRatesPayload(
  rates: LandedRatesPayload,
  setters: {
    setFx: (fx: number) => void;
    setFreightRate: (rate: number) => void;
    setGstRate: (rate: number) => void;
    setOtherTaxRate: (rate: number) => void;
  },
) {
  setters.setFx(rates.fx);
  if (rates.freightRate != null && Number.isFinite(rates.freightRate)) {
    setters.setFreightRate(rates.freightRate);
  }
  if (rates.gstRate != null && Number.isFinite(rates.gstRate)) {
    setters.setGstRate(rates.gstRate);
  }
  if (rates.otherTaxRate != null && Number.isFinite(rates.otherTaxRate)) {
    setters.setOtherTaxRate(rates.otherTaxRate);
  }
}

interface CatalogTabProps {
  catalog: CatalogItem[];
  onCatalogChange?: (catalog: CatalogItem[]) => void;
  supplierTerms?: CatalogSupplierTerms | null;
  fx: number;
  setFx: (fx: number) => void;
  freightRate: number;
  setFreightRate: (rate: number) => void;
  gstRate: number;
  setGstRate: (rate: number) => void;
  otherTaxRate: number;
  setOtherTaxRate: (rate: number) => void;
  factors: LandedCostFactors;
  researchBrief: string | null;
  setResearchBrief: (brief: string | null) => void;
  ratesAsOf: string | null;
  setRatesAsOf: (asOf: string | null) => void;
  keystoneMarginRate: number;
  setKeystoneMarginRate: (rate: number) => void;
  marginRangeDisplay: string;
  /** Deep-link: open product drawer for this SKU. */
  deepLinkSku?: string | null;
  /** Deep-link: open agent draft review once drawer is open. */
  deepLinkDraftId?: string | null;
  onDeepLinkConsumed?: () => void;
}

export function CatalogTab({
  catalog,
  onCatalogChange,
  supplierTerms = null,
  fx,
  setFx,
  freightRate,
  setFreightRate,
  gstRate,
  setGstRate,
  otherTaxRate,
  setOtherTaxRate,
  factors,
  researchBrief,
  setResearchBrief,
  ratesAsOf,
  setRatesAsOf,
  keystoneMarginRate,
  setKeystoneMarginRate,
  marginRangeDisplay,
  deepLinkSku = null,
  deepLinkDraftId = null,
  onDeepLinkConsumed,
}: CatalogTabProps) {
  const line = useOptionalLineContext();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [flag, setFlag] = useState<CatalogFlagFilter>('ALL');
  const [ratesBusy, setRatesBusy] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [landedIncludeGst, setLandedIncludeGst] = useState(true);
  const [consumerIncludeSalesTax, setConsumerIncludeSalesTax] = useState(true);
  const [orderPieces, setOrderPieces] = useState(MIN_ORDER_PIECES);
  const [shippingCadOverride, setShippingCadOverride] = useState<number | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [reviewDraftId, setReviewDraftId] = useState<string | null>(null);
  const [appliedDeepLinkSku, setAppliedDeepLinkSku] = useState<string | null>(null);
  const [activeLine, setActiveLine] = useState<LinePortfolio | null>(null);
  const [lineEditOpen, setLineEditOpen] = useState(false);
  const [lineLoadError, setLineLoadError] = useState<string | null>(null);
  const [engagementAlerts, setEngagementAlerts] = useState<
    Record<string, ProductEngagementAlertKind>
  >({});
  const [draftCounts, setDraftCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    void fetchLineByCode('ogr').then((result) => {
      if (!active) return;
      if (result.error) {
        setLineLoadError(result.error);
        return;
      }
      setActiveLine(result.data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadLineSheetSignals() {
      if (typeof document !== 'undefined' && document.hidden) return;
      const [alerts, drafts] = await Promise.all([
        fetchProductEngagementAlerts(),
        fetchPendingAgentDraftCountsByCatalogItemId(),
      ]);
      if (!active) return;
      if (!alerts.error) setEngagementAlerts(alerts.data);
      if (!drafts.error) setDraftCounts(drafts.data);
    }

    void loadLineSheetSignals();

    function onFocus() {
      void loadLineSheetSignals();
    }

    function onVisibilityChange() {
      if (!document.hidden) void loadLineSheetSignals();
    }

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const pollId = window.setInterval(() => {
      void loadLineSheetSignals();
    }, ENGAGEMENT_ALERT_POLL_MS);

    return () => {
      active = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.clearInterval(pollId);
    };
  }, []);

  function openProduct(sku: string) {
    const item = catalog.find((row) => row.sku === sku);
    setSelectedSku(sku);
    if (!item) return;

    // Clear engagement badges only — draft counts stay until send/cancel.
    setEngagementAlerts((prev) => {
      if (!(item.id in prev)) return prev;
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

    void markProductEngagementSeen(item.id).then((result) => {
      if (result.error) {
        void fetchProductEngagementAlerts().then((alerts) => {
          if (!alerts.error) setEngagementAlerts(alerts.data);
        });
      }
    });
  }

  const pendingSku = deepLinkSku?.trim() || null;
  const pendingDraftKey = `${pendingSku ?? ''}:${deepLinkDraftId?.trim() ?? ''}`;
  // Copilot suggestion ignored: useEffect setState fails react-hooks/set-state-in-effect; render-time prop sync is the React-supported pattern.
  if (pendingSku && pendingDraftKey !== appliedDeepLinkSku) {
    setAppliedDeepLinkSku(pendingDraftKey);
    setSelectedSku(pendingSku);
    setReviewDraftId(deepLinkDraftId?.trim() || null);
    queueMicrotask(() => onDeepLinkConsumed?.());
  }

  const pricedFactors = useMemo(
    () => factorsWithSettings(factors, supplierTerms),
    [factors, supplierTerms],
  );

  const filteredCatalog = useMemo(() => {
    // Table Landed + Margin both use landed-before-recoverable-GST so columns reconcile.
    // Sample-card GST toggle remains independent and does not affect the table.
    return filterCatalogItems(catalog, { search, category, flag }).map((item) => {
      const landed =
        item.landedCadOverride != null
          ? item.landedCadOverride
          : landedCad(item.priceUsd, pricedFactors, { includeGst: false });
      const margin = marginPct(item.priceUsd, item.msrpCad, pricedFactors, {
        landedOverrideCad: item.landedCadOverride,
        importGstRecoverable: pricedFactors.importGstRecoverable !== false,
      });
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
  }, [catalog, search, category, flag, pricedFactors]);

  const selectedItem = selectedSku ? (catalog.find((i) => i.sku === selectedSku) ?? null) : null;

  const newCount = useMemo(() => catalog.filter((it) => it.isNew).length, [catalog]);
  const nameDropCount = useMemo(() => catalog.filter((it) => it.isNameDrop).length, [catalog]);

  const sampleTee = useMemo(
    () => catalog.find((it) => it.cat === 'Short Sleeve Tees') ?? catalog[0],
    [catalog],
  );
  const sampleTeeLanded = sampleTee
    ? `$${landedCad(sampleTee.priceUsd, pricedFactors, { includeGst: landedIncludeGst }).toFixed(2)} CAD`
    : '—';

  const keystoneBreakdown = sampleTee
    ? retailKeystoneBreakdown(sampleTee.priceUsd, pricedFactors, keystoneMarginRate)
    : null;

  const orderBreakdown = useMemo(() => {
    if (!sampleTee) return null;
    return minOrderTotalBreakdown(sampleTee.priceUsd, pricedFactors, orderPieces);
  }, [sampleTee, pricedFactors, orderPieces]);

  const shippingCad =
    shippingCadOverride != null ? shippingCadOverride : (orderBreakdown?.shippingCad ?? null);
  const orderTotalCad =
    orderBreakdown != null && shippingCad != null
      ? orderBreakdown.wholesaleCad + shippingCad
      : null;

  const landedMetaParts = [
    `FX ${fx}`,
    `freight +${formatRatePct(freightRate)}`,
    landedIncludeGst ? `GST +${formatRatePct(gstRate)}` : 'GST excluded',
  ];
  if (otherTaxRate > 0) {
    landedMetaParts.push(`other +${formatRatePct(otherTaxRate)}`);
  }

  async function handleUpdateRates() {
    setRatesBusy(true);
    setRatesError(null);
    const result = await fetchLandedRates(
      line.multiLineAi && line.salesLineId ? { salesLineId: line.salesLineId } : undefined,
    );
    setRatesBusy(false);
    if (!result.ok) {
      setRatesError(result.error);
      return;
    }
    applyLandedRatesPayload(result.rates, {
      setFx,
      setFreightRate,
      setGstRate,
      setOtherTaxRate,
    });
    setResearchBrief(result.rates.brief);
    setRatesAsOf(result.rates.asOf);
  }

  return (
    <section className="flex flex-col gap-5" data-screen-label="catalog">
      {lineLoadError ? (
        <p className="text-sm text-red-700" role="alert">
          Could not load line portfolio: {lineLoadError}
        </p>
      ) : null}

      {activeLine ? (
        <Card className="overflow-hidden p-0">
          <div className="grid gap-0 md:grid-cols-[minmax(0,280px)_1fr]">
            <div className="bg-surface border-ink/10 min-h-[160px] border-b md:border-r md:border-b-0">
              {activeLine.heroImageUrl ? (
                <img
                  src={activeLine.heroImageUrl}
                  alt=""
                  className="h-full max-h-56 w-full object-cover md:max-h-none md:min-h-[180px]"
                />
              ) : (
                <div className="text-ink/45 flex h-40 items-center justify-center px-4 text-center text-xs md:h-full md:min-h-[180px]">
                  Drop {activeLine.name} logo/lookbook image
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-heading m-0 text-2xl leading-tight">{activeLine.name}</h2>
                  {activeLine.tagline ? (
                    <p className="text-accent-700 m-0 mt-1 text-sm font-semibold">
                      {activeLine.tagline}
                    </p>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="text-xs whitespace-nowrap"
                  onClick={() => setLineEditOpen(true)}
                >
                  Edit line
                </Button>
              </div>
              {activeLine.description ? (
                <p className="text-ink/75 m-0 text-sm leading-relaxed">{activeLine.description}</p>
              ) : (
                <p className="text-ink/45 m-0 text-sm">
                  Add a portfolio description for this line.
                </p>
              )}
            </div>
          </div>
        </Card>
      ) : null}

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
          <CardMeta className="!flex-col !items-start gap-1.5">
            <span className="flex gap-1">
              <Button
                type="button"
                variant={landedIncludeGst ? 'primary' : 'secondary'}
                className="px-2 py-0.5 text-[11px]"
                aria-pressed={landedIncludeGst}
                onClick={() => setLandedIncludeGst(true)}
              >
                +GST
              </Button>
              <Button
                type="button"
                variant={!landedIncludeGst ? 'primary' : 'secondary'}
                className="px-2 py-0.5 text-[11px]"
                aria-pressed={!landedIncludeGst}
                onClick={() => setLandedIncludeGst(false)}
              >
                −GST
              </Button>
            </span>
            <span>{landedMetaParts.join(' · ')}</span>
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Retailer Keystone Margin</CardKicker>
          <CardTitle className="text-[28px]">{formatRatePct(keystoneMarginRate)}</CardTitle>
          <CardMeta className="!flex-col !items-start gap-1.5">
            <span className="flex items-center gap-1.5">
              <label className="text-xs whitespace-nowrap">Margin %</label>
              <Input
                type="number"
                step="0.1"
                min="1"
                max="99"
                value={Number((keystoneMarginRate * 100).toFixed(2))}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!Number.isFinite(parsed)) {
                    setKeystoneMarginRate(DEFAULT_KEYSTONE_MARGIN_RATE);
                    return;
                  }
                  setKeystoneMarginRate(Math.min(0.99, Math.max(0.01, parsed / 100)));
                }}
                className="w-24 shrink-0"
              />
            </span>
            <span className="opacity-70">Catalog line range: {marginRangeDisplay}</span>
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Suggested Retail (MSRP CAD)</CardKicker>
          <CardTitle className="text-[28px]">
            {keystoneBreakdown ? `$${keystoneBreakdown.suggestedMsrpCad.toFixed(2)}` : '—'}
          </CardTitle>
          <CardMeta>Ticket price · CAD wholesale × keystone (ex-GST)</CardMeta>
        </Card>
        <Card>
          <CardKicker>Retailer Gross Profit</CardKicker>
          <CardTitle className="text-sage-800 text-[28px]">
            {keystoneBreakdown ? `$${keystoneBreakdown.retailerGrossProfitCad.toFixed(2)}` : '—'}
          </CardTitle>
          <CardMeta>Per unit · MSRP − CAD wholesale (ex-GST)</CardMeta>
        </Card>
        <Card>
          <CardKicker>Final Consumer Price (BC)</CardKicker>
          <CardTitle className="text-[28px]">
            {keystoneBreakdown
              ? `$${(consumerIncludeSalesTax
                  ? keystoneBreakdown.consumerPostTaxCad
                  : keystoneBreakdown.consumerPreTaxCad
                ).toFixed(2)}`
              : '—'}
          </CardTitle>
          <CardMeta className="!flex-col !items-start gap-1.5">
            <span className="flex gap-1">
              <Button
                type="button"
                variant={consumerIncludeSalesTax ? 'primary' : 'secondary'}
                className="px-2 py-0.5 text-[11px]"
                aria-pressed={consumerIncludeSalesTax}
                onClick={() => setConsumerIncludeSalesTax(true)}
              >
                +GST/PST
              </Button>
              <Button
                type="button"
                variant={!consumerIncludeSalesTax ? 'primary' : 'secondary'}
                className="px-2 py-0.5 text-[11px]"
                aria-pressed={!consumerIncludeSalesTax}
                onClick={() => setConsumerIncludeSalesTax(false)}
              >
                −GST/PST
              </Button>
            </span>
            <span>
              {keystoneBreakdown
                ? consumerIncludeSalesTax
                  ? `Pre-tax $${keystoneBreakdown.consumerPreTaxCad.toFixed(2)} · GST 5% + PST 7%`
                  : `Post-tax $${keystoneBreakdown.consumerPostTaxCad.toFixed(2)} · GST 5% + PST 7%`
                : 'Ticket MSRP · GST 5% + PST 7%'}
            </span>
          </CardMeta>
        </Card>
        <Card>
          <CardKicker>Estimated Order Total ({orderPieces} pcs)</CardKicker>
          <CardTitle className="text-[28px]">
            {orderTotalCad != null ? `$${orderTotalCad.toFixed(2)} CAD` : '—'}
          </CardTitle>
          <CardMeta className="!flex-col !items-start gap-0.5">
            {orderBreakdown && shippingCad != null ? (
              <>
                <span>
                  Wholesale ${orderBreakdown.wholesaleCad.toFixed(2)} CAD ($
                  {orderBreakdown.wholesaleUsd.toFixed(2)} USD)
                </span>
                <span>
                  Shipping ${shippingCad.toFixed(2)} CAD
                  {shippingCadOverride != null ? ' · carrier quote' : ' · freight estimate'} · no
                  GST/PST
                </span>
              </>
            ) : (
              <span>Wholesale + shipping · no GST/PST</span>
            )}
          </CardMeta>
        </Card>
      </div>

      <Card row className="flex-wrap items-center justify-between gap-5">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3.5">
            <span className="text-xs font-semibold opacity-70">CAD Landed Multiplier</span>
            <div className="flex items-center gap-1.5">
              <label className="text-xs whitespace-nowrap">FX rate</label>
              <Input
                type="number"
                step="0.01"
                min="1"
                max="2.5"
                value={fx}
                onChange={(e) => {
                  const parsed = parseFloat(e.target.value);
                  if (!Number.isFinite(parsed)) {
                    setFx(DEFAULT_LANDED_COST_FACTORS.fx);
                    return;
                  }
                  setFx(Math.min(2.5, Math.max(1, parsed)));
                }}
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs whitespace-nowrap">Freight %</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={Number((freightRate * 100).toFixed(2))}
                onChange={(e) =>
                  setFreightRate(
                    parseRatePctInput(e.target.value, DEFAULT_LANDED_COST_FACTORS.freightRate),
                  )
                }
                className="w-20"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs whitespace-nowrap">GST %</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={Number((gstRate * 100).toFixed(2))}
                onChange={(e) =>
                  setGstRate(parseRatePctInput(e.target.value, DEFAULT_LANDED_COST_FACTORS.gstRate))
                }
                className="w-20"
                title="Federal Goods and Services Tax"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs whitespace-nowrap">Other tax %</label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={Number((otherTaxRate * 100).toFixed(2))}
                onChange={(e) =>
                  setOtherTaxRate(
                    parseRatePctInput(e.target.value, DEFAULT_LANDED_COST_FACTORS.otherTaxRate),
                  )
                }
                className="w-20"
                title="PST / HST / other combined"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              disabled={ratesBusy}
              onClick={() => void handleUpdateRates()}
            >
              {ratesBusy ? 'Updating…' : 'Update'}
            </Button>
            <span className="text-xs opacity-60">
              {ratesAsOf ? `Updated ${new Date(ratesAsOf).toLocaleString()}` : 'Not updated yet'}
            </span>
          </div>
          {researchBrief ? <p className="text-ink/70 m-0 text-sm">{researchBrief}</p> : null}
          {ratesError ? (
            <p className="text-accent-800 m-0 text-sm" role="alert">
              {ratesError}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3.5 text-[13px]">
          <div className="flex items-center gap-1.5">
            <label className="text-xs whitespace-nowrap" htmlFor="order-pieces">
              Pieces
            </label>
            <Input
              id="order-pieces"
              type="number"
              inputMode="numeric"
              step="1"
              min={1}
              value={orderPieces}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                if (!Number.isFinite(parsed) || parsed < 1) {
                  setOrderPieces(MIN_ORDER_PIECES);
                  return;
                }
                setOrderPieces(parsed);
              }}
              className="w-20 shrink-0"
              title={`Minimum order ${MIN_ORDER_PIECES} pcs (6/style)`}
            />
            <span className="text-xs opacity-60">min {MIN_ORDER_PIECES}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-xs whitespace-nowrap" htmlFor="order-shipping-cad">
              Est. shipping CAD
            </label>
            <Input
              id="order-shipping-cad"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={shippingCad != null ? Number(shippingCad.toFixed(2)) : ''}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  setShippingCadOverride(null);
                  return;
                }
                const parsed = parseFloat(raw);
                if (!Number.isFinite(parsed) || parsed < 0) {
                  setShippingCadOverride(null);
                  return;
                }
                setShippingCadOverride(parsed);
              }}
              className="w-24 shrink-0"
              title="Freight estimate by default — enter carrier quote to override"
            />
            {shippingCadOverride != null ? (
              <button
                type="button"
                className="text-accent text-xs underline-offset-2 hover:underline"
                onClick={() => setShippingCadOverride(null)}
              >
                Reset estimate
              </button>
            ) : null}
          </div>
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
                  'Image',
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
                    className="border-ink/15 bg-surface text-ink/60 border-b p-2 text-left text-[11px] tracking-wider uppercase"
                  >
                    {h}
                  </th>
                ))}
                <th className="border-ink/15 bg-surface text-ink/60 border-b p-2 text-right text-[11px] tracking-wider uppercase">
                  Margin
                </th>
                <th className="border-ink/15 bg-surface text-ink/60 sticky right-0 border-b p-2 text-right text-[11px] tracking-wider uppercase">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCatalog.map((item) => {
                const thumb = catalogThumbSrc(item);
                return (
                  <tr
                    key={item.sku}
                    className="hover:bg-ink/[0.04] cursor-pointer"
                    tabIndex={0}
                    role="button"
                    aria-label={`Open details for ${item.sku}`}
                    onClick={() => openProduct(item.sku)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openProduct(item.sku);
                      }
                    }}
                  >
                    <td className="border-ink/[0.08] border-b p-2">{item.page}</td>
                    <td className="border-ink/[0.08] font-heading border-b p-2 text-[13px]">
                      {item.sku}
                    </td>
                    <td className="border-ink/[0.08] border-b p-2">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt=""
                          className="border-ink/10 h-10 w-10 rounded-sm border object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </td>
                    <td className="border-ink/[0.08] min-w-[180px] border-b p-2">
                      <div className="font-semibold">{item.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {item.isNew && <Tag variant="accent">New</Tag>}
                        {item.isNameDrop && <Tag variant="accent-2">Name Drop</Tag>}
                        {(() => {
                          const draftCount = draftCounts[item.id] ?? 0;
                          if (draftCount <= 0) return null;
                          return (
                            <Tag variant="neutral">
                              {draftCount > 1 ? `Draft · ${draftCount}` : 'Draft'}
                            </Tag>
                          );
                        })()}
                        {engagementAlerts[item.id] === 'clicked' ? (
                          <Tag variant="accent">Clicked</Tag>
                        ) : engagementAlerts[item.id] === 'opened' ? (
                          <Tag variant="outline">Opened</Tag>
                        ) : null}
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
                    <td
                      className="border-ink/[0.08] bg-surface sticky right-0 border-b p-2 text-right"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <RowActionsMenu
                        label={`Actions for ${item.sku}`}
                        sections={[
                          {
                            id: 'product',
                            label: 'Product',
                            items: [
                              {
                                id: 'details',
                                label: 'Details',
                                onSelect: () => openProduct(item.sku),
                              },
                            ],
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ProductDetailDrawer
        item={selectedItem}
        items={filteredCatalog}
        factors={pricedFactors}
        supplierTerms={supplierTerms}
        initialReviewDraftId={reviewDraftId}
        onClose={() => {
          setSelectedSku(null);
          setReviewDraftId(null);
        }}
        onNavigate={(sku) => openProduct(sku)}
        onSaved={(updated) => {
          onCatalogChange?.(catalog.map((row) => (row.id === updated.id ? updated : row)));
          setSelectedSku(updated.sku);
        }}
      />

      {lineEditOpen && activeLine ? (
        <LineEditDrawer
          key={activeLine.id}
          line={activeLine}
          onClose={() => setLineEditOpen(false)}
          onSaved={(updated) => setActiveLine(updated)}
        />
      ) : null}

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
