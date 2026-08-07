import { useEffect, useMemo, useState } from 'react';
import type { PublicOgrProduct, PublicOgrSupplierTerms } from '@/lib/publicCatalog';
import { fetchPublicOgrProducts } from '@/lib/publicCatalog';
import {
  DEFAULT_WHOLESALE_FILTERS,
  filterPublicOgrProducts,
  parseWholesaleFilters,
  uniqueCategories,
  wholesaleFiltersToSearchParams,
  salesVolumeRankByProductId,
  type WholesaleFilterState,
} from '@/lib/wholesaleFilters';
import { effectiveLifestyleThemes } from '@/lib/crmRetailTaxonomy';
import {
  orderTotals,
  upsertOrderLine,
  getWholesaleOrderDraftSnapshot,
} from '@/lib/wholesaleOrderDraft';
import type { WholesaleRequestType } from '@/lib/wholesaleOrderRequestSchema';
import { useWholesaleOrderDraft } from '@/hooks/useWholesaleOrderDraft';
import { WholesaleBuyerForm } from '@/components/wholesale/WholesaleBuyerForm';
import { WholesaleFilters } from '@/components/wholesale/WholesaleFilters';
import { WholesaleOrderBuilder } from '@/components/wholesale/WholesaleOrderBuilder';
import { WholesaleProductCard } from '@/components/wholesale/WholesaleProductCard';
import { WholesaleProductDetail } from '@/components/wholesale/WholesaleProductDetail';
import { cartItemsToDraft, fetchBuyerCartItems, enqueueBuyerCartSync } from '@/lib/buyerCart';
import { fetchBuyerLikedProductIds, toggleBuyerProductLike } from '@/lib/buyerLikes';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { tryBuildOgrProductPath, OGR_WHOLESALE_PATH } from '@/lib/productUrls';

type Props = {
  products: PublicOgrProduct[];
  terms: PublicOgrSupplierTerms;
  initialQuickViewSlug?: string | null;
};

const DEFAULT_TERMS: PublicOgrSupplierTerms = {
  minOrderPieces: 24,
  minPiecesPerDesign: 6,
  defaultShippingMethod: '',
  pricesSubjectToChange: true,
};

function readFiltersFromLocation(): WholesaleFilterState {
  if (typeof window === 'undefined') return DEFAULT_WHOLESALE_FILTERS;
  return parseWholesaleFilters(new URLSearchParams(window.location.search));
}

export function WholesaleShowroom({
  products: initialProducts,
  terms,
  initialQuickViewSlug = null,
}: Props) {
  const resolvedTerms = terms ?? DEFAULT_TERMS;
  const [products, setProducts] = useState(initialProducts);
  const [filters, setFilters] = useState<WholesaleFilterState>(readFiltersFromLocation);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const { draft, setDraft, mergeLines, clearDraft } = useWholesaleOrderDraft();
  const [quickView, setQuickView] = useState<PublicOgrProduct | null>(() => {
    if (!initialQuickViewSlug) return null;
    return initialProducts.find((p) => p.publicSlug === initialQuickViewSlug) ?? null;
  });
  const [successNumber, setSuccessNumber] = useState<string | null>(null);
  const [successType, setSuccessType] = useState<WholesaleRequestType>('order');
  const [buyerUserId, setBuyerUserId] = useState<string | null>(null);
  const [likedIds, setLikedIds] = useState<Set<string>>(() => new Set());
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);

  useEffect(() => {
    function onPopState() {
      setFilters(readFiltersFromLocation());
      const path = window.location.pathname;
      const match = path.match(
        new RegExp(`^${OGR_WHOLESALE_PATH.replace(/\//g, '\\/')}\\/([^/]+)\\/?$`),
      );
      if (match?.[1]) {
        let segment = match[1];
        try {
          segment = decodeURIComponent(match[1]);
        } catch {
          /* keep raw segment */
        }
        const product = products.find((p) => p.publicSlug === segment);
        setQuickView(product ?? null);
      } else {
        setQuickView(null);
      }
    }
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [products]);

  // Authenticated buyers re-fetch catalog (wholesale gated by session) + sync cart/likes.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    void (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session?.user || !active) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, status, wholesale_pricing_unlocked')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!active || profile?.role !== 'buyer') return;
      setBuyerUserId(session.user.id);

      const catalog = await fetchPublicOgrProducts();
      if (active && catalog.data) {
        setProducts(catalog.data);
        if (initialQuickViewSlug) {
          setQuickView(catalog.data.find((p) => p.publicSlug === initialQuickViewSlug) ?? null);
        }
      }

      const [likes, cart] = await Promise.all([
        fetchBuyerLikedProductIds(session.user.id),
        fetchBuyerCartItems(session.user.id),
      ]);
      if (!active) return;
      setLikedIds(new Set(likes.data));

      if (cart.data.length > 0 && draft.lines.length === 0) {
        setDraft(cartItemsToDraft(cart.data));
      } else if (draft.lines.length > 0) {
        void enqueueBuyerCartSync(session.user.id, draft.lines);
      }
    })();

    return () => {
      active = false;
    };
    // Intentional once-on-mount session bootstrap.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only auth bootstrap
  }, []);

  const categories = useMemo(() => uniqueCategories(products), [products]);
  const productsForShowroom = useMemo(
    () =>
      products.map((p) => ({
        ...p,
        lifestyleThemes: effectiveLifestyleThemes({
          lifestyleThemes: p.lifestyleThemes,
          name: p.name,
          tagline: p.tagline,
          description: p.description,
        }),
      })),
    [products],
  );
  const filtered = useMemo(
    () => filterPublicOgrProducts(productsForShowroom, filters),
    [productsForShowroom, filters],
  );
  const salesRanks = useMemo(
    () => salesVolumeRankByProductId(productsForShowroom),
    [productsForShowroom],
  );
  const { totalUnits } = orderTotals(draft);
  const pricingUnlocked = products.some((p) => p.wholesaleUsd != null);

  function requestAccess() {
    scrollTo('buyer-form');
  }

  function applyFilters(next: WholesaleFilterState) {
    setFilters(next);
    const params = wholesaleFiltersToSearchParams(next);
    const qs = params.toString();
    const url = qs ? `${OGR_WHOLESALE_PATH}?${qs}` : OGR_WHOLESALE_PATH;
    window.history.replaceState({}, '', url);
  }

  function clearFilters() {
    applyFilters(DEFAULT_WHOLESALE_FILTERS);
  }

  function openQuickView(product: PublicOgrProduct) {
    setQuickView(product);
    const params = wholesaleFiltersToSearchParams(filters);
    const qs = params.toString();
    const path = tryBuildOgrProductPath(product.publicSlug);
    if (!path) return;
    const url = qs ? `${path}?${qs}` : path;
    window.history.pushState({}, '', url);
  }

  function closeQuickView() {
    setQuickView(null);
    const params = wholesaleFiltersToSearchParams(filters);
    const qs = params.toString();
    window.history.pushState({}, '', qs ? `${OGR_WHOLESALE_PATH}?${qs}` : OGR_WHOLESALE_PATH);
  }

  function openAddPanel(product: PublicOgrProduct) {
    openQuickView(product);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleSuccess(requestNumber: string, requestType: WholesaleRequestType) {
    setSuccessNumber(requestNumber);
    setSuccessType(requestType);
    clearDraft();
    if (buyerUserId) {
      void enqueueBuyerCartSync(buyerUserId, []);
    }
    scrollTo('order-success');
  }

  async function handleToggleLike(product: PublicOgrProduct) {
    if (!buyerUserId) {
      requestAccess();
      return;
    }
    const nextLiked = !likedIds.has(product.id);
    setLikeBusyId(product.id);
    const result = await toggleBuyerProductLike(buyerUserId, product.id, nextLiked);
    setLikeBusyId(null);
    if (!result.ok) return;
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (result.liked) next.add(product.id);
      else next.delete(product.id);
      return next;
    });
  }

  return (
    <div className="bg-bg text-ink font-body">
      <header className="px-8.1 mx-auto flex max-w-[1240px] items-center justify-between py-4">
        <a href="/" className="font-heading text-accent-2-900 text-lg no-underline">
          Justin Fassio
        </a>
        <div className="flex items-center gap-3">
          {buyerUserId ? (
            <a
              href="/account"
              className="text-ink/70 hover:text-ink text-sm no-underline underline-offset-2 hover:underline"
            >
              Account
            </a>
          ) : null}
          <a
            href="#order-builder"
            className="border-divider px-3.1 font-heading text-ink hover:bg-ink/[0.05] inline-flex items-center rounded-full border py-2 text-sm no-underline"
          >
            Order draft{totalUnits > 0 ? ` (${totalUnits})` : ''}
          </a>
        </div>
      </header>

      <section className="px-8.1 mx-auto max-w-[1240px] pt-4 pb-10">
        <span className="bg-accent-100 text-accent-800 inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] tracking-wide">
          Wholesale Canada
        </span>
        <h1 className="font-heading mt-3.1 m-0 max-w-[18ch] text-4xl leading-[1.08] md:text-5xl">
          Old Guys Rule Wholesale
        </h1>
        <p className="text-ink/70 mt-3.1 m-0 max-w-[540px] text-base">
          A proven men’s lifestyle collection for Canadian retailers—fishing, boats, golf, camping,
          garages, cold beer and well-earned retirement.
        </p>
        <div className="mt-6.1 gap-3.1 flex flex-wrap">
          <a
            href="#collection"
            className="bg-accent-700 px-6.1 py-2.1 font-heading text-bg hover:bg-accent-600 inline-flex items-center justify-center rounded-full text-sm no-underline"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('collection');
            }}
          >
            Browse the Collection
          </a>
          <a
            href="#buyer-form"
            className="border-accent-2-900 px-6.1 py-2.1 font-heading text-accent-2-900 hover:bg-ink/[0.07] inline-flex items-center justify-center rounded-full border text-sm no-underline"
            onClick={(e) => {
              e.preventDefault();
              scrollTo('buyer-form');
            }}
          >
            Request wholesale access
          </a>
          <a
            href={buyerUserId ? '/account' : '/login'}
            className="text-ink/70 hover:text-ink px-2 py-2 text-sm no-underline underline-offset-2 hover:underline"
          >
            {buyerUserId ? 'Retailer account' : 'Retailer sign in'}
          </a>
        </div>
        <p className="text-ink/55 m-0 mt-3 max-w-[540px] text-sm">
          {pricingUnlocked
            ? 'Wholesale unit pricing is unlocked for your verified retailer account.'
            : 'Suggested retail is shown for browsing. Wholesale unit pricing unlocks after Justin verifies your retailer account.'}
        </p>
      </section>

      <section id="collection" className="px-8.1 mx-auto max-w-[1240px] pb-12">
        <WholesaleFilters
          filters={filters}
          categories={categories}
          resultCount={filtered.length}
          mobileOpen={mobileFiltersOpen}
          onMobileOpenChange={setMobileFiltersOpen}
          onChange={applyFilters}
          onClear={clearFilters}
        />

        {filtered.length === 0 ? (
          <p className="text-ink/55 m-0 mt-8 text-sm">No products match these filters.</p>
        ) : (
          <div className="mt-6.1 gap-6.1 grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((product) => (
              <WholesaleProductCard
                key={product.id}
                product={product}
                salesRank={salesRanks.get(product.id) ?? null}
                onViewDetails={openQuickView}
                onAddToOrder={openAddPanel}
                onRequestAccess={requestAccess}
                liked={likedIds.has(product.id)}
                onToggleLike={handleToggleLike}
                likeDisabled={likeBusyId === product.id}
              />
            ))}
          </div>
        )}
      </section>

      <section className="px-8.1 mx-auto grid max-w-[1240px] gap-6 pb-16 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          {successNumber ? (
            <div
              id="order-success"
              className="border-accent-2-300 bg-accent-2-100 p-4.1 rounded-xl border"
              role="status"
            >
              <h2 className="font-heading m-0 text-xl">
                {successType === 'inquiry' ? 'Message sent' : 'Request received'}
              </h2>
              <p className="m-0 mt-2 text-sm">
                {successType === 'inquiry' ? (
                  <>
                    Your reference is <span className="font-heading">{successNumber}</span>. Justin
                    will reply by email. Check your inbox for a retailer sign-in invite if this was
                    your first request.
                  </>
                ) : (
                  <>
                    Your order request number is{' '}
                    <span className="font-heading">{successNumber}</span>. We’ll follow up to
                    confirm pricing, availability and next steps. Check email for a retailer sign-in
                    invite if this was your first request.
                  </>
                )}
              </p>
            </div>
          ) : (
            <WholesaleBuyerForm draft={draft} onSuccess={handleSuccess} />
          )}
        </div>
        <WholesaleOrderBuilder
          draft={draft}
          terms={resolvedTerms}
          pricingUnlocked={pricingUnlocked}
          onChangeQuantity={(productId, size, quantity) => {
            setDraft((prev) => {
              const line = prev.lines.find((l) => l.productId === productId && l.size === size);
              if (!line) return prev;
              const next = upsertOrderLine(prev, { ...line, quantity });
              if (buyerUserId) void enqueueBuyerCartSync(buyerUserId, next.lines);
              return next;
            });
          }}
          onRemoveLine={(productId, size) => {
            setDraft((prev) => {
              const next = {
                ...prev,
                lines: prev.lines.filter((l) => !(l.productId === productId && l.size === size)),
                updatedAt: new Date().toISOString(),
              };
              if (buyerUserId) void enqueueBuyerCartSync(buyerUserId, next.lines);
              return next;
            });
          }}
          onClear={() => {
            clearDraft();
            if (buyerUserId) void enqueueBuyerCartSync(buyerUserId, []);
          }}
          onAskAboutLine={() => scrollTo('buyer-form')}
        />
      </section>

      {quickView ? (
        <div
          className="bg-ink/40 fixed inset-0 z-40 flex items-end justify-center p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label={quickView.name}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeQuickView();
          }}
        >
          <div className="bg-bg max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl p-5 shadow-lg">
            <WholesaleProductDetail
              product={quickView}
              showClose
              onClose={closeQuickView}
              onRequestAccess={() => {
                closeQuickView();
                requestAccess();
              }}
              onAddLines={(lines) => {
                mergeLines(lines);
                closeQuickView();
                scrollTo('order-builder');
                if (buyerUserId) {
                  queueMicrotask(() => {
                    void enqueueBuyerCartSync(buyerUserId, getWholesaleOrderDraftSnapshot().lines);
                  });
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
