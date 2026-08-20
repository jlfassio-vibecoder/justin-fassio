import { useMemo, useState, type SubmitEvent } from 'react';
import { X } from 'lucide-react';
import { MentionTextarea } from '@/components/MentionTextarea';
import { Button } from '@/components/ui/Button';
import { DialogBackdrop, DialogTitle } from '@/components/ui/Dialog';
import { Field, FieldLabel, Input, Select } from '@/components/ui/Input';
import { Tag } from '@/components/ui/Tag';
import { APPAREL_SEASON_LABELS, APPAREL_SEASONS, apparelSeasonLabel } from '@/lib/apparelSeasons';
import {
  fetchAccountReorderSettings,
  upsertAccountReorderSettings,
} from '@/lib/accountReorderSettings';
import { useOptionalLineContext } from '@/lib/lineContext';
import { resolveOgrLineId } from '@/lib/lines';
import { filterOrdersBySeason, type SeasonFilter } from '@/lib/orderAggregates';
import { insertOrder, buildEaglePeakOrderConversion, type OrderRow } from '@/lib/orders';
import { loadLandedRatesPersistence } from '@/lib/landedRatesStorage';
import type { Prospect } from '@/lib/prospects';
import {
  ensureRetailerLineAccount,
  fetchLineWriteMeta,
  isStaffSellingUiBlocked,
} from '@/lib/retailerLineAccounts';
import { formatLocalIsoDate } from '@/lib/reorderCadence';
import type { ApparelSeason, OrderStatus, OrderType } from '@/types/database';

interface AccountOrderHistoryModalProps {
  open: boolean;
  account: Prospect | null;
  orders: OrderRow[];
  onClose: () => void;
  onOrderSaved: () => void;
}

const ORDER_TYPES: { value: OrderType; label: string }[] = [
  { value: 'reorder', label: 'Reorder' },
  { value: 'preorder', label: 'Preorder' },
  { value: 'initial', label: 'Initial' },
];

const ORDER_STATUSES: { value: OrderStatus; label: string }[] = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'draft', label: 'Draft' },
  { value: 'fulfilled', label: 'Fulfilled' },
];

function todayIsoDate(): string {
  return formatLocalIsoDate(new Date());
}

function formatCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(amount);
}

function OrderHistoryForm({
  account,
  orders,
  onClose,
  onOrderSaved,
}: {
  account: Prospect;
  orders: OrderRow[];
  onClose: () => void;
  onOrderSaved: () => void;
}) {
  const [seasonFilter, setSeasonFilter] = useState<SeasonFilter>('ALL');
  const [orderType, setOrderType] = useState<OrderType>('reorder');
  const [season, setSeason] = useState<ApparelSeason>('spring_summer');
  const [orderDate, setOrderDate] = useState(todayIsoDate);
  const [amountCad, setAmountCad] = useState('');
  const [status, setStatus] = useState<OrderStatus>('submitted');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const line = useOptionalLineContext();
  const sellingBlocked = isStaffSellingUiBlocked(
    line.lineSlug && line.status
      ? { code: line.lineSlug, status: line.status, defaultCurrency: line.defaultCurrency }
      : null,
    line.multiLineWrites,
    {
      eaglePeakSellingEnabled: line.eaglePeakSelling,
      bigFishSellingEnabled: line.bigFishSelling,
      defaultCurrency: line.defaultCurrency,
    },
  );
  const isEpOrder = line.lineSlug === 'eagle-peak' && line.eaglePeakSelling;
  const isOgrOrder = !line.lineSlug || line.lineSlug === 'ogr';
  const [ogrCurrency, setOgrCurrency] = useState<'USD' | 'CAD'>('USD');
  const usesUsdFx = isEpOrder || (isOgrOrder && ogrCurrency === 'USD');
  const [amountUsd, setAmountUsd] = useState('');
  const [exchangeRate, setExchangeRate] = useState(() =>
    usesUsdFx || isOgrOrder ? String(loadLandedRatesPersistence().fx) : '',
  );
  const usdPreview = usesUsdFx
    ? buildEaglePeakOrderConversion({
        originalAmountUsd: amountUsd,
        exchangeRate,
        exchangeRateDate: orderDate,
      })
    : null;
  const usdPreviewCad = usdPreview?.ok ? usdPreview.stamp.total_amount_cad.toFixed(2) : null;

  const filteredOrders = useMemo(
    () => filterOrdersBySeason(orders, seasonFilter),
    [orders, seasonFilter],
  );

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const amount = amountCad === '' ? 0 : Number(amountCad);
    let usdStamp: ReturnType<typeof buildEaglePeakOrderConversion> | null = null;
    if (usesUsdFx) {
      usdStamp = buildEaglePeakOrderConversion({
        originalAmountUsd: amountUsd,
        exchangeRate,
        exchangeRateDate: orderDate,
      });
      if (!usdStamp.ok) {
        setError(
          isOgrOrder ? usdStamp.error.replace(/^Eagle Peak orders/, 'OGR orders') : usdStamp.error,
        );
        return;
      }
    } else if (Number.isNaN(amount) || amount < 0) {
      setError('Enter a valid order amount (CAD).');
      return;
    }

    setBusy(true);

    let orderResult;
    const salesLineId = line.salesLineId || (await resolveOgrLineId());
    if (salesLineId) {
      const ensured = await ensureRetailerLineAccount({
        retailerId: account.id,
        salesLineId,
        eaglePeakSellingEnabled: line.eaglePeakSelling,
        bigFishSellingEnabled: line.bigFishSelling,
      });
      if (ensured.gate === 'reject' || ensured.error || !ensured.data) {
        setBusy(false);
        setError(ensured.error ?? 'Operational writes are not allowed for this line');
        return;
      }
      const meta = await fetchLineWriteMeta(salesLineId);
      orderResult = await insertOrder(
        {
          account_id: account.id,
          line_id: salesLineId,
          retailer_line_account_id: ensured.data.id,
          order_type: orderType,
          season,
          order_date: orderDate,
          total_amount_cad: usdStamp?.ok ? usdStamp.stamp.total_amount_cad : amount,
          original_amount: usdStamp?.ok
            ? usdStamp.stamp.original_amount
            : isOgrOrder && ogrCurrency === 'CAD'
              ? amount
              : undefined,
          original_currency: usdStamp?.ok
            ? usdStamp.stamp.original_currency
            : isOgrOrder && ogrCurrency === 'CAD'
              ? 'CAD'
              : undefined,
          exchange_rate: usdStamp?.ok ? usdStamp.stamp.exchange_rate : undefined,
          exchange_rate_date: usdStamp?.ok ? usdStamp.stamp.exchange_rate_date : undefined,
          conversion_source: usdStamp?.ok ? usdStamp.stamp.conversion_source : undefined,
          converted_amount: usdStamp?.ok ? usdStamp.stamp.converted_amount : undefined,
          converted_currency: usdStamp?.ok ? usdStamp.stamp.converted_currency : undefined,
          status,
          notes: notes.trim() || null,
        },
        {
          writesEnabled: true,
          lineCode: meta.data?.code ?? line.lineSlug,
          lineStatus: meta.data?.status ?? line.status,
          lineDefaultCurrency: meta.data?.defaultCurrency ?? null,
          eaglePeakSellingEnabled: line.eaglePeakSelling,
          bigFishSellingEnabled: line.bigFishSelling,
        },
      );
      if (orderResult.error) {
        setBusy(false);
        setError(orderResult.error);
        return;
      }
      if (meta.data?.code === 'ogr') {
        const existing = await fetchAccountReorderSettings(account.id);
        if (existing.error) {
          setBusy(false);
          setError(existing.error);
          return;
        }
        const settingsResult = await upsertAccountReorderSettings({
          account_id: account.id,
          last_order_date: orderDate,
          next_suggested_contact_date: existing.data?.next_suggested_contact_date ?? null,
          seasonal_cadence_tags: existing.data?.seasonal_cadence_tags ?? [],
          ai_reorder_notes: existing.data?.ai_reorder_notes ?? null,
          retailer_line_account_id: ensured.data.id,
        });
        setBusy(false);
        if (settingsResult.error) {
          setError(settingsResult.error);
          return;
        }
        onOrderSaved();
        onClose();
        return;
      }
      setBusy(false);
      onOrderSaved();
      onClose();
      return;
    }

    const lineId = await resolveOgrLineId();
    orderResult = await insertOrder({
      account_id: account.id,
      line_id: lineId,
      order_type: orderType,
      season,
      order_date: orderDate,
      total_amount_cad: usdStamp?.ok ? usdStamp.stamp.total_amount_cad : amount,
      original_amount: usdStamp?.ok
        ? usdStamp.stamp.original_amount
        : isOgrOrder && ogrCurrency === 'CAD'
          ? amount
          : undefined,
      original_currency: usdStamp?.ok
        ? usdStamp.stamp.original_currency
        : isOgrOrder && ogrCurrency === 'CAD'
          ? 'CAD'
          : undefined,
      exchange_rate: usdStamp?.ok ? usdStamp.stamp.exchange_rate : undefined,
      exchange_rate_date: usdStamp?.ok ? usdStamp.stamp.exchange_rate_date : undefined,
      conversion_source: usdStamp?.ok ? usdStamp.stamp.conversion_source : undefined,
      converted_amount: usdStamp?.ok ? usdStamp.stamp.converted_amount : undefined,
      converted_currency: usdStamp?.ok ? usdStamp.stamp.converted_currency : undefined,
      status,
      notes: notes.trim() || null,
    });

    if (orderResult.error) {
      setBusy(false);
      setError(orderResult.error);
      return;
    }

    const existing = await fetchAccountReorderSettings(account.id);
    if (existing.error) {
      setBusy(false);
      setError(existing.error);
      return;
    }

    const settingsResult = await upsertAccountReorderSettings({
      account_id: account.id,
      last_order_date: orderDate,
      next_suggested_contact_date: existing.data?.next_suggested_contact_date ?? null,
      seasonal_cadence_tags: existing.data?.seasonal_cadence_tags ?? [],
      ai_reorder_notes: existing.data?.ai_reorder_notes ?? null,
    });

    setBusy(false);

    if (settingsResult.error) {
      setError(settingsResult.error);
      return;
    }

    onOrderSaved();
    onClose();
  }

  if (line.multiLineWrites && sellingBlocked) {
    return (
      <DialogBackdrop open onClose={onClose}>
        <div className="gap-3.1 bg-surface p-4.1 flex max-w-[560px] flex-col rounded-xl shadow-lg">
          <DialogTitle>Order history</DialogTitle>
          <p className="text-ink/75 m-0 text-sm">
            Selling for this line is not enabled yet. Order logging stays on Old Guys Rule.
          </p>
          <div className="flex justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogBackdrop>
    );
  }

  return (
    <DialogBackdrop open onClose={busy ? () => {} : onClose}>
      <form
        className="gap-3.1 bg-surface p-4.1 flex max-h-[min(90vh,720px)] max-w-[560px] flex-col overflow-hidden rounded-xl shadow-lg"
        onSubmit={(e) => void handleSubmit(e)}
      >
        <div className="flex shrink-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle>Order history</DialogTitle>
            <p className="text-ink/60 m-0 mt-0.5 truncate text-sm">{account.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-transparent"
            aria-label="Close"
          >
            <X size={18} strokeWidth={2.75} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pr-0.5">
          <Field>
            <FieldLabel>Filter by season</FieldLabel>
            <Select
              value={seasonFilter}
              onChange={(e) => setSeasonFilter(e.target.value as SeasonFilter)}
              disabled={busy}
            >
              <option value="ALL">All seasons</option>
              {APPAREL_SEASONS.map((s) => (
                <option key={s} value={s}>
                  {APPAREL_SEASON_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>

          <div className="border-ink/10 flex flex-col gap-2 rounded-lg border p-3">
            <p className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">Timeline</p>
            {filteredOrders.length === 0 ? (
              <p className="text-ink/60 m-0 text-sm">
                {orders.length === 0
                  ? 'No orders yet for this account.'
                  : 'No orders match this season filter.'}
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
                {filteredOrders.map((o) => (
                  <li
                    key={o.id}
                    className="border-ink/[0.08] flex flex-col gap-1 border-b pb-2.5 last:border-b-0 last:pb-0"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-semibold">{o.order_date}</span>
                      <Tag variant="outline">{o.order_type}</Tag>
                      <Tag variant="neutral">{apparelSeasonLabel(o.season)}</Tag>
                      <Tag variant="accent">{formatCad(Number(o.total_amount_cad))}</Tag>
                      <span className="text-ink/55 text-xs uppercase">{o.status}</span>
                    </div>
                    {o.notes ? (
                      <p className="text-ink/70 m-0 text-xs leading-relaxed">{o.notes}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-ink/10 flex flex-col gap-3 rounded-lg border p-3">
            <p className="text-ink/55 m-0 text-[11px] tracking-wider uppercase">
              Log order / reorder
            </p>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Order type</FieldLabel>
                <Select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as OrderType)}
                  disabled={busy}
                >
                  {ORDER_TYPES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel>Line</FieldLabel>
                <Input readOnly value="Old Guys Rule" className="opacity-70" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Season</FieldLabel>
                <Select
                  value={season}
                  onChange={(e) => setSeason(e.target.value as ApparelSeason)}
                  disabled={busy}
                >
                  {APPAREL_SEASONS.map((s) => (
                    <option key={s} value={s}>
                      {APPAREL_SEASON_LABELS[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field>
                <FieldLabel>Order date</FieldLabel>
                <Input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  disabled={busy}
                  required
                />
              </Field>
            </div>

            {isOgrOrder && !isEpOrder ? (
              <Field>
                <FieldLabel>Original currency</FieldLabel>
                <Select
                  value={ogrCurrency}
                  onChange={(e) => setOgrCurrency(e.target.value as 'USD' | 'CAD')}
                  disabled={busy}
                >
                  <option value="USD">USD (default)</option>
                  <option value="CAD">CAD</option>
                </Select>
              </Field>
            ) : null}

            <div className="grid grid-cols-2 gap-3">
              {usesUsdFx ? (
                <>
                  <Field>
                    <FieldLabel>Amount (USD)</FieldLabel>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={amountUsd}
                      onChange={(e) => setAmountUsd(e.target.value)}
                      disabled={busy}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>USD to CAD rate</FieldLabel>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.0001"
                      placeholder="1.45"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      disabled={busy}
                    />
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel>Amount (CAD)</FieldLabel>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={amountCad}
                    onChange={(e) => setAmountCad(e.target.value)}
                    disabled={busy}
                  />
                </Field>
              )}
              <Field>
                <FieldLabel>Status</FieldLabel>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as OrderStatus)}
                  disabled={busy}
                >
                  {ORDER_STATUSES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {usesUsdFx && usdPreviewCad != null ? (
              <p className="text-ink/60 m-0 text-sm">
                CAD reporting amount: {usdPreviewCad} (rate date = order date)
              </p>
            ) : null}

            <Field>
              <FieldLabel>Notes</FieldLabel>
              <MentionTextarea
                rows={2}
                placeholder="Ship window, buyer notes… Use # for products, @ for contacts"
                value={notes}
                onChange={setNotes}
                accountId={account.id}
                disabled={busy}
              />
            </Field>
          </div>

          {error ? (
            <p className="text-accent-800 m-0 text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-1 flex shrink-0 justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save order'}
          </Button>
        </div>
      </form>
    </DialogBackdrop>
  );
}

export function AccountOrderHistoryModal({
  open,
  account,
  orders,
  onClose,
  onOrderSaved,
}: AccountOrderHistoryModalProps) {
  if (!open || !account) return null;

  return (
    <OrderHistoryForm
      key={account.id}
      account={account}
      orders={orders}
      onClose={onClose}
      onOrderSaved={onOrderSaved}
    />
  );
}
