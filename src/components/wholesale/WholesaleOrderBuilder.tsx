import { formatMerchandiseSubtotalUsd, formatWholesaleUsd } from '@/lib/wholesalePricing';
import { meetsMoq, orderTotals, type WholesaleOrderDraft } from '@/lib/wholesaleOrderDraft';
import type { PublicOgrSupplierTerms } from '@/lib/publicCatalog';

type Props = {
  draft: WholesaleOrderDraft;
  terms: PublicOgrSupplierTerms;
  onChangeQuantity: (productId: string, size: string, quantity: number) => void;
  onRemoveLine: (productId: string, size: string) => void;
  onClear: () => void;
  onAskAboutLine: () => void;
};

export function WholesaleOrderBuilder({
  draft,
  terms,
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
          Saved on this device while you browse. Submitting sends a request for confirmation—not a
          purchase.
        </p>
      </div>

      {draft.lines.length === 0 ? (
        <p className="text-ink/55 m-0 text-sm">No products yet. Add sizes from a product card.</p>
      ) : (
        <ul className="gap-3.1 m-0 flex list-none flex-col p-0">
          {draft.lines.map((line) => (
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
                  {line.sku} · {line.size} · {formatWholesaleUsd(line.wholesaleUsd)}
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
          ))}
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
        <p className="font-heading m-0 flex justify-between text-base">
          <span>Merchandise subtotal</span>
          <span>{formatMerchandiseSubtotalUsd(merchandiseSubtotalUsd)}</span>
        </p>
      </div>

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

      <p className="text-ink/55 m-0 text-xs leading-relaxed">
        This is an order request, not a completed purchase. Pricing, availability, freight, duties,
        delivery timing and payment terms will be confirmed before the order is accepted.
        {terms.pricesSubjectToChange ? ' Prices are subject to change.' : ''}
      </p>

      <div className="gap-2.1 flex flex-wrap">
        <button
          type="button"
          className="bg-accent-700 px-4.1 py-2.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full text-sm"
          onClick={onAskAboutLine}
        >
          Continue to buyer form
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
