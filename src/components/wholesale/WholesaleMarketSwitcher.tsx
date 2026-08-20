import {
  ogrWholesaleCollectionPath,
  writePublicMarketCookie,
  type PublicMarket,
} from '@/lib/pricingMarket';
import { ogrWholesaleHrefForLocation } from '@/lib/productUrls';

type Props = {
  market: PublicMarket;
};

export function WholesaleMarketSwitcher({ market }: Props) {
  function go(next: PublicMarket) {
    writePublicMarketCookie(next);
    if (typeof window === 'undefined') return;
    window.location.assign(
      ogrWholesaleHrefForLocation(next, {
        pathname: window.location.pathname,
        search: window.location.search,
      }),
    );
  }

  return (
    <nav className="mt-4 flex flex-wrap items-center gap-2" aria-label="Wholesale market">
      <a
        href={ogrWholesaleCollectionPath('ca')}
        className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm no-underline ${
          market === 'ca'
            ? 'bg-accent-700 font-heading text-bg'
            : 'border-divider text-ink hover:bg-ink/[0.05] border'
        }`}
        aria-current={market === 'ca' ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault();
          go('ca');
        }}
      >
        Canada
      </a>
      <a
        href={ogrWholesaleCollectionPath('us')}
        className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm no-underline ${
          market === 'us'
            ? 'bg-accent-700 font-heading text-bg'
            : 'border-divider text-ink hover:bg-ink/[0.05] border'
        }`}
        aria-current={market === 'us' ? 'page' : undefined}
        onClick={(event) => {
          event.preventDefault();
          go('us');
        }}
      >
        United States
      </a>
    </nav>
  );
}
