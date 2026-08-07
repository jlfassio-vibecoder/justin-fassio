import {
  formatSuggestedRetailCad,
  formatWholesaleUsd,
  hasWholesalePricing,
  RETAIL_PRICE_DISCLAIMER,
  WHOLESALE_LOCKED_LABEL,
} from '@/lib/wholesalePricing';
import type { PublicOgrProduct } from '@/lib/publicCatalog';
import {
  BEST_SELLER_BADGE_MAX_RANK,
  isRetailChannel,
  retailChannelLabel,
} from '@/lib/retailChannels';
import { Heart } from 'lucide-react';

type Props = {
  product: PublicOgrProduct;
  onViewDetails: (product: PublicOgrProduct) => void;
  onAddToOrder: (product: PublicOgrProduct) => void;
  onRequestAccess: () => void;
  /** Absolute YTD sales-volume rank (#1 = highest). Omitted when unranked. */
  salesRank?: number | null;
  liked?: boolean;
  onToggleLike?: (product: PublicOgrProduct) => void;
  likeDisabled?: boolean;
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

export function WholesaleProductCard({
  product,
  onViewDetails,
  onAddToOrder,
  onRequestAccess,
  salesRank = null,
  liked = false,
  onToggleLike,
  likeDisabled = false,
}: Props) {
  const retail = formatSuggestedRetailCad(product.msrpCad);
  const wholesale = formatWholesaleUsd(product.wholesaleUsd);
  const canWholesale = hasWholesalePricing(product.wholesaleUsd);
  const showBestSellerRank =
    typeof salesRank === 'number' && salesRank >= 1 && salesRank <= BEST_SELLER_BADGE_MAX_RANK;
  const themeLabels = showBestSellerRank
    ? []
    : product.lifestyleThemes.filter(isRetailChannel).slice(0, 3).map(retailChannelLabel);

  return (
    <article className="elev-md gap-3.1 bg-bg p-3.1 relative flex flex-col rounded-xl shadow-md">
      {onToggleLike ? (
        <button
          type="button"
          className="bg-bg/90 text-ink absolute top-3 right-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full shadow-sm"
          aria-label={liked ? 'Unlike product' : 'Like product'}
          aria-pressed={liked}
          disabled={likeDisabled}
          onClick={() => onToggleLike(product)}
        >
          <Heart
            size={18}
            strokeWidth={2.75}
            className={liked ? 'fill-accent-700 text-accent-700' : ''}
          />
        </button>
      ) : null}
      <button
        type="button"
        className="text-left no-underline"
        onClick={() => onViewDetails(product)}
        aria-label={`View details for ${product.name}`}
      >
        <ProductImage product={product} />
      </button>
      <div className="gap-1.1 flex flex-wrap items-center">
        {showBestSellerRank ? (
          <span
            className="border-divider text-ink/75 inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] tracking-wide"
            title="YTD sales volume rank among ranked styles (highest first)"
          >
            #{salesRank} best seller
          </span>
        ) : null}
        {themeLabels.map((label) => (
          <span
            key={label}
            className="bg-accent-100 text-accent-800 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] tracking-wide"
          >
            {label}
          </span>
        ))}
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
      <div className="mt-auto flex flex-col gap-1">
        {retail ? <p className="font-heading m-0 text-sm">{retail}</p> : null}
        {retail ? <p className="text-ink/55 m-0 text-xs">{RETAIL_PRICE_DISCLAIMER}</p> : null}
        {wholesale ? (
          <p className="text-ink/70 m-0 text-xs">{wholesale}</p>
        ) : (
          <p className="text-ink/55 m-0 text-xs">{WHOLESALE_LOCKED_LABEL}</p>
        )}
      </div>
      <div className="gap-2.1 flex flex-wrap">
        <button
          type="button"
          className="border-divider px-3.1 font-heading text-ink hover:bg-ink/[0.05] inline-flex items-center justify-center rounded-full border py-2 text-sm"
          onClick={() => onViewDetails(product)}
        >
          View Details
        </button>
        {canWholesale ? (
          <button
            type="button"
            className="bg-accent-700 px-3.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full py-2 text-sm"
            onClick={() => onAddToOrder(product)}
          >
            Add
          </button>
        ) : (
          <button
            type="button"
            className="bg-accent-700 px-3.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full py-2 text-sm"
            onClick={onRequestAccess}
          >
            Request pricing
          </button>
        )}
      </div>
    </article>
  );
}
