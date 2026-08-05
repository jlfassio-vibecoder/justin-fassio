import { formatSuggestedRetailCad, formatWholesaleUsd } from '@/lib/wholesalePricing';
import type { PublicOgrProduct } from '@/lib/publicCatalog';

type Props = {
  product: PublicOgrProduct;
  onViewDetails: (product: PublicOgrProduct) => void;
  onAddToOrder: (product: PublicOgrProduct) => void;
};

function ProductImage({ product }: { product: PublicOgrProduct }) {
  const src = product.primaryImageUrl;
  if (!src) {
    return (
      <div className="bg-surface text-ink/40 flex aspect-[4/5] w-full items-center justify-center rounded-lg text-center text-xs">
        Image coming soon
      </div>
    );
  }
  return (
    <div className="bg-surface aspect-[4/5] w-full overflow-hidden rounded-lg">
      <img
        src={src}
        alt={product.name}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );
}

export function WholesaleProductCard({ product, onViewDetails, onAddToOrder }: Props) {
  const retail = formatSuggestedRetailCad(product.msrpCad);
  return (
    <article className="elev-md gap-3.1 bg-bg p-3.1 flex flex-col rounded-xl shadow-md">
      <button
        type="button"
        className="text-left no-underline"
        onClick={() => onViewDetails(product)}
        aria-label={`View details for ${product.name}`}
      >
        <ProductImage product={product} />
      </button>
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
      <div>
        <h3 className="font-heading m-0 text-lg leading-tight">{product.name}</h3>
        <p className="text-ink/55 m-0 mt-1 text-xs">
          {product.sku}
          {product.cat ? ` · ${product.cat}` : ''}
          {product.color ? ` · ${product.color}` : ''}
        </p>
        {product.tagline ? (
          <p className="text-ink/70 m-0 mt-1.5 text-sm">{product.tagline}</p>
        ) : null}
      </div>
      <div className="mt-auto">
        <p className="font-heading m-0 text-sm">{formatWholesaleUsd(product.wholesaleUsd)}</p>
        {retail ? <p className="text-ink/60 m-0 text-xs">{retail}</p> : null}
      </div>
      <div className="gap-2.1 flex flex-wrap">
        <button
          type="button"
          className="border-divider px-3.1 font-heading text-ink hover:bg-ink/[0.05] inline-flex items-center justify-center rounded-full border py-2 text-sm"
          onClick={() => onViewDetails(product)}
        >
          View Details
        </button>
        <button
          type="button"
          className="bg-accent-700 px-3.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full py-2 text-sm"
          onClick={() => onAddToOrder(product)}
        >
          Add
        </button>
      </div>
    </article>
  );
}
