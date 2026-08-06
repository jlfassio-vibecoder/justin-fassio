import { useMemo, useState } from 'react';
import {
  formatSuggestedRetailCad,
  formatWholesaleUsd,
  hasWholesalePricing,
} from '@/lib/wholesalePricing';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import type { WholesaleOrderLine } from '@/lib/wholesaleOrderDraft';

type Props = {
  product: PublicOgrProduct;
  onAddLines: (lines: WholesaleOrderLine[]) => void;
  onRequestAccess: () => void;
  onClose?: () => void;
  showClose?: boolean;
};

function galleryUrls(product: PublicOgrProduct): string[] {
  const urls = [product.primaryImageUrl, ...product.alternateImageUrls].filter((u): u is string =>
    Boolean(u),
  );
  return [...new Set(urls)];
}

export function WholesaleProductDetail({
  product,
  onAddLines,
  onRequestAccess,
  onClose,
  showClose,
}: Props) {
  const images = galleryUrls(product);
  const [activeIdx, setActiveIdx] = useState(0);
  const [imageBroken, setImageBroken] = useState(false);
  const sizes = product.availableSizes.length > 0 ? product.availableSizes : ['One Size'];
  const [qtyBySize, setQtyBySize] = useState<Record<string, number>>(() =>
    Object.fromEntries(sizes.map((s) => [s, 0])),
  );
  const [copied, setCopied] = useState(false);
  const retail = formatSuggestedRetailCad(product.msrpCad);
  const wholesale = formatWholesaleUsd(product.wholesaleUsd);
  const canWholesale = hasWholesalePricing(product.wholesaleUsd);
  const totalUnits = useMemo(
    () => Object.values(qtyBySize).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0),
    [qtyBySize],
  );

  function setQty(size: string, raw: string) {
    const n = Math.max(0, Math.min(10_000, Number.parseInt(raw, 10) || 0));
    setQtyBySize((prev) => ({ ...prev, [size]: n }));
  }

  function handleAdd() {
    if (!canWholesale || product.wholesaleUsd == null) {
      onRequestAccess();
      return;
    }
    const lines: WholesaleOrderLine[] = sizes
      .filter((s) => (qtyBySize[s] ?? 0) > 0)
      .map((size) => ({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        size,
        wholesaleUsd: product.wholesaleUsd as number,
        quantity: qtyBySize[size] ?? 0,
        primaryImageUrl: product.primaryImageUrl,
      }));
    if (lines.length === 0) return;
    onAddLines(lines);
    setQtyBySize(Object.fromEntries(sizes.map((s) => [s, 0])));
  }

  async function copyLink() {
    const url = `${window.location.origin}/old-guys-rule-wholesale/${product.publicSlug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const activeSrc = images[activeIdx] ?? null;

  return (
    <div className="gap-6.1 grid lg:grid-cols-2">
      <div>
        <div className="bg-surface aspect-square w-full overflow-hidden rounded-xl">
          {activeSrc && !imageBroken ? (
            <img
              src={activeSrc}
              alt={product.name}
              className="h-full w-full object-contain"
              onError={() => setImageBroken(true)}
            />
          ) : (
            <div className="text-ink/40 flex h-full w-full items-center justify-center text-sm">
              {activeSrc ? 'Image unavailable' : 'Image coming soon'}
            </div>
          )}
        </div>
        {images.length > 1 ? (
          <div className="gap-2.1 mt-3.1 flex flex-wrap">
            {images.map((src, i) => (
              <button
                key={src}
                type="button"
                className={`h-16 w-16 overflow-hidden rounded-md border ${
                  i === activeIdx ? 'border-accent-700' : 'border-divider'
                }`}
                onClick={() => {
                  setActiveIdx(i);
                  setImageBroken(false);
                }}
                aria-label={`Show image ${i + 1}`}
              >
                <img src={src} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="gap-3.1 flex flex-col">
        {showClose && onClose ? (
          <button
            type="button"
            className="text-ink/60 hover:text-ink self-end text-sm underline"
            onClick={onClose}
          >
            Close
          </button>
        ) : null}
        <div className="gap-1.1 flex flex-wrap items-center">
          {product.isNew ? (
            <span className="bg-accent-100 text-accent-800 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] tracking-wide">
              New
            </span>
          ) : null}
          {product.featured ? (
            <span className="bg-accent-2-100 text-accent-2-800 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] tracking-wide">
              Featured
            </span>
          ) : null}
        </div>
        <h1 className="font-heading m-0 text-3xl leading-tight">{product.name}</h1>
        <p className="text-ink/60 m-0 text-sm">
          SKU {product.sku}
          {product.liveSku ? ` · Live store SKU: ${product.liveSku}` : ''}
        </p>
        <p className="text-ink/70 m-0 text-sm">
          {[product.cat, product.color, product.collection].filter(Boolean).join(' · ')}
        </p>
        {product.tagline ? (
          <p className="font-heading text-accent-800 m-0 text-base">{product.tagline}</p>
        ) : null}
        {product.description ? (
          <p className="text-ink/75 m-0 text-sm whitespace-pre-line">{product.description}</p>
        ) : null}
        {product.lifestyleThemes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {product.lifestyleThemes.map((t) => (
              <span
                key={t}
                className="bg-accent-100 text-accent-800 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] tracking-wide"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}

        <div>
          {retail ? <p className="font-heading m-0 text-xl">{retail}</p> : null}
          {wholesale ? (
            <p className="text-ink/70 m-0 text-sm">{wholesale}</p>
          ) : (
            <p className="text-ink/55 m-0 text-sm">
              Wholesale unit pricing is available after retailer verification.
            </p>
          )}
        </div>

        {canWholesale ? (
          <div className="gap-2.1 flex flex-col">
            <p className="text-ink/70 m-0 text-xs tracking-wide uppercase">Quantities by size</p>
            <div className="gap-2.1 grid grid-cols-2 sm:grid-cols-3">
              {sizes.map((size) => (
                <label
                  key={size}
                  className="border-divider bg-bg flex flex-col gap-1 rounded-lg border p-2 text-sm"
                >
                  <span className="font-heading text-xs">{size}</span>
                  <input
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={qtyBySize[size] ?? 0}
                    onChange={(e) => setQty(size, e.target.value)}
                    className="border-divider focus:border-accent-700 rounded border px-2 py-1 text-sm outline-none"
                  />
                </label>
              ))}
            </div>
          </div>
        ) : null}

        <div className="gap-2.1 flex flex-wrap">
          {canWholesale ? (
            <button
              type="button"
              disabled={totalUnits === 0}
              className="bg-accent-700 px-4.1 py-2.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full text-sm disabled:opacity-40"
              onClick={handleAdd}
            >
              Add to Order{totalUnits > 0 ? ` (${totalUnits})` : ''}
            </button>
          ) : (
            <button
              type="button"
              className="bg-accent-700 px-4.1 py-2.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full text-sm"
              onClick={onRequestAccess}
            >
              Request wholesale pricing
            </button>
          )}
          <button
            type="button"
            className="border-divider px-4.1 py-2.1 font-heading text-ink hover:bg-ink/[0.05] inline-flex items-center justify-center rounded-full border text-sm"
            onClick={() => void copyLink()}
          >
            {copied ? 'Copied' : 'Copy Product Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
