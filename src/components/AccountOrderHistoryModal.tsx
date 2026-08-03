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
import { resolveOgrLineId } from '@/lib/lines';
import { filterOrdersBySeason, type SeasonFilter } from '@/lib/orderAggregates';
import { insertOrder, type OrderRow } from '@/lib/orders';
import type { Prospect } from '@/lib/prospects';
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

  const filteredOrders = useMemo(
    () => filterOrdersBySeason(orders, seasonFilter),
    [orders, seasonFilter],
  );

  async function handleSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const amount = amountCad === '' ? 0 : Number(amountCad);
    if (Number.isNaN(amount) || amount < 0) {
      setError('Enter a valid order amount (CAD).');
      return;
    }

    setBusy(true);

    const lineId = await resolveOgrLineId();
    const orderResult = await insertOrder({
      account_id: account.id,
      line_id: lineId,
      order_type: orderType,
      season,
      order_date: orderDate,
      total_amount_cad: amount,
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

            <div className="grid grid-cols-2 gap-3">
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
