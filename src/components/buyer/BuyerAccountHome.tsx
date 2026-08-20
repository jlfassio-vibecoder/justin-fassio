import { useEffect, useMemo, useState } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { BuyerMessagesSection } from '@/components/buyer/BuyerMessagesSection';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { cartItemsToDraft, fetchBuyerCartItems, enqueueBuyerCartSync } from '@/lib/buyerCart';
import { fetchBuyerLikedProductIds } from '@/lib/buyerLikes';
import { fetchPublicOgrProducts, type PublicOgrProduct } from '@/lib/publicCatalog';
import { tryBuildOgrProductPath } from '@/lib/productUrls';
import { fetchBuyerPricingMarket } from '@/lib/buyerPricingMarket';
import { ogrWholesaleCollectionPath, type PublicMarket } from '@/lib/pricingMarket';
import { formatMerchandiseSubtotalUsd, formatWholesaleUsd } from '@/lib/wholesalePricing';
import {
  getWholesaleOrderDraftSnapshot,
  orderTotals,
  writeWholesaleOrderDraft,
} from '@/lib/wholesaleOrderDraft';
import { supabase } from '@/lib/supabase';

function BuyerAccountInner() {
  const { loading, session, user, profile, configured } = useAuth();
  const [cartSynced, setCartSynced] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [products, setProducts] = useState<PublicOgrProduct[]>([]);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [showroomMarket, setShowroomMarket] = useState<PublicMarket>('ca');

  useEffect(() => {
    if (!loading && configured && !session) {
      window.location.replace('/login');
    }
  }, [loading, configured, session]);

  useEffect(() => {
    if (!loading && profile && profile.role !== 'buyer') {
      window.location.replace('/app');
    }
  }, [loading, profile]);

  useEffect(() => {
    if (!user?.id || profile?.role !== 'buyer') return;
    let active = true;

    void (async () => {
      const [cartResult, likesResult, catalogResult] = await Promise.all([
        fetchBuyerCartItems(user.id),
        fetchBuyerLikedProductIds(user.id),
        fetchPublicOgrProducts(),
      ]);
      if (!active) return;

      if (catalogResult.data) setProducts(catalogResult.data);
      if (likesResult.data) setLikedIds(likesResult.data);

      const rlaMarket = await fetchBuyerPricingMarket();
      if (!active) return;
      if (rlaMarket) setShowroomMarket(rlaMarket.publicMarket);

      const local = getWholesaleOrderDraftSnapshot();
      if (cartResult.data.length > 0 && local.lines.length === 0) {
        writeWholesaleOrderDraft(cartItemsToDraft(cartResult.data));
      } else if (local.lines.length > 0) {
        await enqueueBuyerCartSync(user.id, local.lines);
      }
      setCartSynced(true);
    })();

    return () => {
      active = false;
    };
  }, [user?.id, profile?.role]);

  const draft = getWholesaleOrderDraftSnapshot();
  const { totalUnits, merchandiseSubtotalUsd } = orderTotals(draft);
  const pricingUnlocked = Boolean(
    profile?.wholesale_pricing_unlocked && profile.status === 'approved',
  );
  const likedProducts = useMemo(
    () => products.filter((p) => likedIds.includes(p.id)),
    [products, likedIds],
  );

  if (!configured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-3 px-6">
        <h1 className="m-0 text-2xl">Account unavailable</h1>
        <p className="text-ink/70 m-0 text-sm">Supabase env vars are missing.</p>
      </div>
    );
  }

  if (loading || !session || !profile) {
    return (
      <div className="text-ink/60 flex min-h-dvh items-center justify-center px-6 text-sm">
        {loading ? 'Checking session…' : 'Redirecting…'}
      </div>
    );
  }

  if (profile.role !== 'buyer') {
    return null;
  }

  return (
    <div className="bg-bg text-ink min-h-dvh">
      <header className="border-divider px-8.1 mx-auto flex max-w-[960px] items-center justify-between border-b py-4">
        <a href="/" className="font-heading text-accent-2-900 text-lg no-underline">
          Justin Fassio
        </a>
        <div className="flex items-center gap-3 text-sm">
          <a
            href={ogrWholesaleCollectionPath(showroomMarket)}
            className="text-ink/70 no-underline hover:underline"
          >
            Showroom
          </a>
          <Button
            type="button"
            variant="ghost"
            className="text-xs"
            onClick={() => {
              void supabase.auth.signOut().then(() => {
                window.location.href = '/';
              });
            }}
          >
            Sign out
          </Button>
        </div>
      </header>

      <main className="px-8.1 mx-auto flex max-w-[960px] flex-col gap-10 py-10">
        <section>
          <h1 className="font-heading m-0 text-3xl">Retailer account</h1>
          <p className="text-ink/70 m-0 mt-2 text-sm">
            Signed in as {user?.email}
            {profile.display_name ? ` · ${profile.display_name}` : ''}
          </p>
          <p className="m-0 mt-3 text-sm">
            {pricingUnlocked ? (
              <span className="text-accent-2-800">Wholesale pricing is unlocked.</span>
            ) : profile.status === 'pending' ? (
              <span className="text-ink/70">
                Access pending — Justin will verify your shop before wholesale prices appear.
              </span>
            ) : (
              <span className="text-ink/70">
                Wholesale pricing is locked. Browse MSRP in the showroom or request access again.
              </span>
            )}
          </p>
          {statusNote ? <p className="text-ink/55 m-0 mt-2 text-xs">{statusNote}</p> : null}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading m-0 text-xl">Order draft</h2>
          {!cartSynced ? (
            <p className="text-ink/60 m-0 text-sm">Syncing cart…</p>
          ) : draft.lines.length === 0 ? (
            <p className="text-ink/60 m-0 text-sm">
              No saved lines yet.{' '}
              <a
                href={ogrWholesaleCollectionPath(showroomMarket)}
                className="text-accent-700 hover:underline"
              >
                Browse the collection
              </a>
            </p>
          ) : (
            <>
              <p className="text-ink/70 m-0 text-sm">
                {draft.lines.length} line{draft.lines.length === 1 ? '' : 's'} · {totalUnits} units
                {pricingUnlocked
                  ? ` · ${formatMerchandiseSubtotalUsd(merchandiseSubtotalUsd)}`
                  : ''}
              </p>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {draft.lines.slice(0, 8).map((line) => (
                  <li key={`${line.productId}::${line.size}`} className="text-sm">
                    {line.name} · {line.size} × {line.quantity}
                    {pricingUnlocked && formatWholesaleUsd(line.wholesaleUsd)
                      ? ` · ${formatWholesaleUsd(line.wholesaleUsd)}`
                      : ''}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`${ogrWholesaleCollectionPath(showroomMarket)}#order-builder`}
                  className="bg-accent-700 px-4.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center rounded-full py-2 text-sm no-underline"
                >
                  Continue in showroom
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    void (async () => {
                      if (!user?.id) return;
                      const result = await enqueueBuyerCartSync(user.id, draft.lines);
                      setStatusNote(
                        result.ok
                          ? 'Cart saved to your account.'
                          : `Could not sync: ${result.error}`,
                      );
                    })();
                  }}
                >
                  Save cart to account
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="font-heading m-0 text-xl">Liked items</h2>
          {likedProducts.length === 0 ? (
            <p className="text-ink/60 m-0 text-sm">
              Heart products in the showroom to keep a shortlist.
            </p>
          ) : (
            <ul className="gap-3.1 m-0 grid list-none p-0 sm:grid-cols-2">
              {likedProducts.map((product) => {
                const productPath = tryBuildOgrProductPath(product.publicSlug, showroomMarket);
                return (
                  <li key={product.id} className="border-divider rounded-lg border p-3 text-sm">
                    {productPath ? (
                      <a
                        href={productPath}
                        className="font-heading text-ink no-underline hover:underline"
                      >
                        {product.name}
                      </a>
                    ) : (
                      <span className="font-heading text-ink">{product.name}</span>
                    )}
                    <p className="text-ink/55 m-0 mt-1 text-xs">{product.sku}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {profile.prospect_id != null &&
        profile.status === 'approved' &&
        profile.wholesale_pricing_unlocked ? (
          <BuyerMessagesSection prospectId={profile.prospect_id} />
        ) : (
          <section>
            <h2 className="font-heading m-0 text-xl">Messages</h2>
            <p className="text-ink/60 m-0 mt-2 text-sm">
              {profile.prospect_id == null
                ? 'Submit a wholesale request so we can link your shop and open a message thread.'
                : 'Message history unlocks after Justin verifies your retailer account and unlocks wholesale pricing.'}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}

export function BuyerAccountHome() {
  return (
    <AuthProvider>
      <BuyerAccountInner />
    </AuthProvider>
  );
}
