import { formatMerchandiseSubtotalUsd, formatWholesaleUsd } from '@/lib/wholesalePricing';
import { meetsMoq, orderTotals, type WholesaleOrderDraft } from '@/lib/wholesaleOrderDraft';
import type { PublicOgrSupplierTerms } from '@/lib/publicCatalog';

type Props = {
  draft: WholesaleOrderDraft;
  terms: PublicOgrSupplierTerms;
  pricingUnlocked?: boolean;
  onChangeQuantity: (productId: string, size: string, quantity: number) => void;
  onRemoveLine: (productId: string, size: string) => void;
  onClear: () => void;
  onAskAboutLine: () => void;
};

export function WholesaleOrderBuilder({
  draft,
  terms,
  pricingUnlocked = false,
  onChangeQuantity,
  onRemoveLine,
  onClear,
  onAskAboutLine,
}: Props) {
  const { totalUnits, merchandiseSubtotalUsd, styleCount } = orderTotals(draft);
  const moq = meetsMoq(draft, terms.minOrderPieces, terms.minPiecesPerDesign);

  return (
    <aside
      id="order-builder"
      className="border-divider elev-md bg-bg p-4.1 flex flex-col gap-4 rounded-xl border shadow-md"
    >
      <div>
        <span className="bg-accent-100 text-accent-800 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] tracking-wide">
          Order request
        </span>
        <h2 className="font-heading mt-2.1 m-0 text-2xl">Your order draft</h2>
        <p className="text-ink/65 m-0 mt-1 text-sm">
          {pricingUnlocked
            ? 'Saved on this device while you browse. Submitting sends a request for confirmation—not a purchase.'
            : 'Browse freely with suggested retail. Request wholesale access to unlock unit pricing and build a priced draft.'}
        </p>
      </div>

      {!pricingUnlocked ? (
        <div className="border-accent-2-300 bg-accent-2-100 p-3.1 rounded-lg border text-sm">
          <p className="m-0 font-semibold">Wholesale pricing is locked</p>
          <p className="text-ink/70 m-0 mt-1 text-xs">
            Submit the buyer form so Justin can verify your shop. After approval, sign in to see
            wholesale prices.
          </p>
          <button
            type="button"
            className="bg-accent-700 px-3.1 font-heading text-on-accent hover:bg-accent-600 mt-3 inline-flex items-center justify-center rounded-full py-2 text-sm"
            onClick={onAskAboutLine}
          >
            Request wholesale access
          </button>
        </div>
      ) : null}

      {draft.lines.length === 0 ? (
        <p className="text-ink/55 m-0 text-sm">
          {pricingUnlocked
            ? 'No products yet. Add sizes from a product card.'
            : 'No draft lines yet. Request access to add wholesale quantities.'}
        </p>
      ) : (
        <ul className="gap-3.1 m-0 flex list-none flex-col p-0">
          {draft.lines.map((line) => {
            const unit = formatWholesaleUsd(line.wholesaleUsd);
            return (
              <li
                key={`${line.productId}::${line.size}`}
                className="border-divider gap-2.1 flex items-start border-b pb-3 last:border-0"
              >
                {line.primaryImageUrl ? (
                  <img
                    src={line.primaryImageUrl}
                    alt=""
                    className="bg-surface h-14 w-14 shrink-0 rounded-md object-contain"
                  />
                ) : (
                  <div className="bg-surface h-14 w-14 shrink-0 rounded-md" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-heading m-0 truncate text-sm">{line.name}</p>
                  <p className="text-ink/55 m-0 text-xs">
                    {line.sku} · {line.size}
                    {unit ? ` · ${unit}` : ''}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <label className="text-ink/60 flex items-center gap-1 text-xs">
                      Qty
                      <input
                        type="number"
                        min={0}
                        value={line.quantity}
                        onChange={(e) =>
                          onChangeQuantity(
                            line.productId,
                            line.size,
                            Math.max(0, Number.parseInt(e.target.value, 10) || 0),
                          )
                        }
                        className="border-divider focus:border-accent-700 w-16 rounded border px-2 py-1 text-sm outline-none"
                      />
                    </label>
                    <button
                      type="button"
                      className="text-ink/50 hover:text-ink text-xs underline"
                      onClick={() => onRemoveLine(line.productId, line.size)}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="gap-1.1 flex flex-col text-sm">
        <p className="m-0 flex justify-between">
          <span className="text-ink/65">Styles</span>
          <span>{styleCount}</span>
        </p>
        <p className="m-0 flex justify-between">
          <span className="text-ink/65">Total units</span>
          <span>{totalUnits}</span>
        </p>
        {pricingUnlocked ? (
          <p className="font-heading m-0 flex justify-between text-base">
            <span>Merchandise subtotal</span>
            <span>{formatMerchandiseSubtotalUsd(merchandiseSubtotalUsd)}</span>
          </p>
        ) : (
          <p className="text-ink/55 m-0 text-sm">
            Merchandise subtotal available after verification.
          </p>
        )}
      </div>

      {pricingUnlocked ? (
        <div className="bg-surface gap-1.1 p-3.1 flex flex-col rounded-lg text-sm">
          <p className="font-heading m-0 text-xs tracking-wide uppercase">Minimums</p>
          <p className={`m-0 ${moq.totalOk ? 'text-accent-2-800' : 'text-ink/70'}`}>
            {moq.totalOk ? '✓' : '○'} {terms.minOrderPieces}+ total units
            {totalUnits > 0 ? ` (${totalUnits})` : ''}
          </p>
          <p className={`m-0 ${moq.stylesOk ? 'text-accent-2-800' : 'text-ink/70'}`}>
            {moq.stylesOk ? '✓' : '○'} {terms.minPiecesPerDesign}+ units per style
          </p>
          {terms.defaultShippingMethod ? (
            <p className="text-ink/55 m-0 mt-1 text-xs">
              Typical shipping: {terms.defaultShippingMethod}
            </p>
          ) : null}
        </div>
      ) : null}

      <p className="text-ink/55 m-0 text-xs leading-relaxed">
        This is an order request, not a completed purchase. Pricing, availability, freight, duties,
        delivery timing and payment terms will be confirmed before the order is accepted.
        {terms.pricesSubjectToChange ? ' Prices are subject to change.' : ''}
      </p>

      <div className="gap-2.1 flex flex-wrap">
        <button
          type="button"
          className="bg-accent-700 px-4.1 py-2.1 font-heading text-on-accent hover:bg-accent-600 inline-flex items-center justify-center rounded-full text-sm"
          onClick={onAskAboutLine}
        >
          {pricingUnlocked ? 'Continue to buyer form' : 'Request wholesale access'}
        </button>
        {draft.lines.length > 0 ? (
          <button
            type="button"
            className="text-ink/55 hover:text-ink text-sm underline"
            onClick={onClear}
          >
            Clear draft
          </button>
        ) : null}
      </div>
    </aside>
  );
}
