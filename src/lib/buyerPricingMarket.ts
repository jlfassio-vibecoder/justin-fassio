import type { PricingMarket, PublicMarket } from '@/lib/pricingMarket';
import { ogrWholesaleHrefForLocation } from '@/lib/productUrls';
import { supabase } from '@/lib/supabase';

export async function fetchBuyerPricingMarket(): Promise<PricingMarket | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;

  const response = await fetch('/api/buyer/pricing-market', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;

  const body = (await response.json()) as { ok?: boolean; market?: PricingMarket | null };
  if (!body.ok) return null;
  return body.market ?? null;
}

/**
 * Aligns the current window to a valid RLA market. Returns the RLA market
 * (including unknown) when the URL already matches or no redirect is needed.
 */
export async function alignBuyerPricingMarket(
  pathMarket: PublicMarket,
): Promise<PricingMarket | null> {
  const rlaMarket = await fetchBuyerPricingMarket();
  if (!rlaMarket) return null;
  if (
    rlaMarket.source === 'rla_territory_assignment' &&
    rlaMarket.publicMarket !== pathMarket &&
    typeof window !== 'undefined'
  ) {
    window.location.replace(
      ogrWholesaleHrefForLocation(rlaMarket.publicMarket, {
        pathname: window.location.pathname,
        search: window.location.search,
      }),
    );
    return null;
  }
  return rlaMarket;
}
