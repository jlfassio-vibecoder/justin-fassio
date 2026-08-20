import { useEffect, useState } from 'react';
import type { PublicOgrProduct, PublicOgrSupplierTerms } from '@/lib/publicCatalog';
import { ogrWholesaleCollectionPath, type PublicMarket } from '@/lib/pricingMarket';
import { WholesaleMarketSwitcher } from '@/components/wholesale/WholesaleMarketSwitcher';
import { upsertOrderLine } from '@/lib/wholesaleOrderDraft';
import { useWholesaleOrderDraft } from '@/hooks/useWholesaleOrderDraft';
import { WholesaleBuyerForm } from '@/components/wholesale/WholesaleBuyerForm';
import { WholesaleOrderBuilder } from '@/components/wholesale/WholesaleOrderBuilder';
import { WholesaleProductDetail } from '@/components/wholesale/WholesaleProductDetail';
import { alignBuyerPricingMarket } from '@/lib/buyerPricingMarket';

type Props = {
  product: PublicOgrProduct;
  terms: PublicOgrSupplierTerms;
  publicMarket?: PublicMarket;
};

export function WholesaleProductPage({ product, terms, publicMarket = 'ca' }: Props) {
  const { draft, setDraft, mergeLines, clearDraft } = useWholesaleOrderDraft();
  const [successNumber, setSuccessNumber] = useState<string | null>(null);
  const [presentationMarket, setPresentationMarket] = useState<PublicMarket>(publicMarket);

  useEffect(() => {
    let active = true;
    void alignBuyerPricingMarket(publicMarket).then((rlaMarket) => {
      if (!active || !rlaMarket) return;
      if (rlaMarket.source === 'rla_territory_assignment' || rlaMarket.source === 'unknown') {
        setPresentationMarket(rlaMarket.publicMarket);
      }
    });
    return () => {
      active = false;
    };
  }, [publicMarket]);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="bg-bg text-ink font-body">
      <header className="px-8.1 mx-auto flex max-w-[1240px] items-center justify-between py-4">
        <a href="/" className="font-heading text-accent-2-900 text-lg no-underline">
          Justin Fassio
        </a>
        <a
          href={ogrWholesaleCollectionPath(publicMarket)}
          className="text-accent-700 hover:text-accent-800 text-sm no-underline"
        >
          ← Back to collection
        </a>
      </header>

      <main className="px-8.1 mx-auto max-w-[1240px] pt-4 pb-16">
        <WholesaleMarketSwitcher market={publicMarket} />
        <div className="mt-6">
          <WholesaleProductDetail
            product={product}
            publicMarket={presentationMarket}
            onRequestAccess={() => scrollTo('buyer-form')}
            onAddLines={(lines) => {
              mergeLines(lines);
              scrollTo('order-builder');
            }}
          />
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div>
            {successNumber ? (
              <div
                className="border-accent-2-300 bg-accent-2-100 p-4.1 rounded-xl border"
                role="status"
              >
                <h2 className="font-heading m-0 text-xl">Request received</h2>
                <p className="m-0 mt-2 text-sm">
                  Your order request number is <span className="font-heading">{successNumber}</span>
                  .
                </p>
              </div>
            ) : (
              <WholesaleBuyerForm
                draft={draft}
                publicMarket={publicMarket}
                onSuccess={(n) => {
                  setSuccessNumber(n);
                  clearDraft();
                }}
              />
            )}
          </div>
          <WholesaleOrderBuilder
            draft={draft}
            terms={terms}
            pricingUnlocked={product.wholesaleUsd != null}
            onChangeQuantity={(productId, size, quantity) => {
              setDraft((prev) => {
                const line = prev.lines.find((l) => l.productId === productId && l.size === size);
                if (!line) return prev;
                return upsertOrderLine(prev, { ...line, quantity });
              });
            }}
            onRemoveLine={(productId, size) => {
              setDraft((prev) => ({
                ...prev,
                lines: prev.lines.filter((l) => !(l.productId === productId && l.size === size)),
                updatedAt: new Date().toISOString(),
              }));
            }}
            onClear={clearDraft}
            onAskAboutLine={() => scrollTo('buyer-form')}
          />
        </div>
      </main>
    </div>
  );
}
