import { OGR_WHOLESALE_PATH } from '@/data/landing';

export type PublicMarket = 'ca' | 'us';
export type PricingCountryCode = 'CA' | 'US';
export type PricingMarketSource =
  'public_path' | 'rla_territory_assignment' | 'staff_selector' | 'unknown';

export type PricingMarket = {
  countryCode: PricingCountryCode | null;
  currencyCode: 'CAD' | 'USD';
  currencyLabel: 'C$' | 'US$';
  publicMarket: PublicMarket;
  territoryId: string | null;
  territoryCode: string | null;
  source: PricingMarketSource;
  showCanadianRetail: boolean;
  showCanadianLanded: boolean;
  showUsdWholesale: boolean;
};

export const OGR_US_WHOLESALE_SEGMENT = 'us';
export const OGR_WHOLESALE_MARKET_COOKIE = 'ogr_wholesale_market';

export type RlaTerritoryAssignmentInput = {
  status: string;
  countryCode: string | null | undefined;
  territoryId: string;
  territoryCode: string;
};

const US_COLLECTION_PREFIX = `${OGR_WHOLESALE_PATH}/${OGR_US_WHOLESALE_SEGMENT}`;

function canadianMarket(
  source: PricingMarketSource,
  extra?: Partial<Pick<PricingMarket, 'territoryId' | 'territoryCode'>>,
): PricingMarket {
  return {
    countryCode: 'CA',
    currencyCode: 'CAD',
    currencyLabel: 'C$',
    publicMarket: 'ca',
    territoryId: extra?.territoryId ?? null,
    territoryCode: extra?.territoryCode ?? null,
    source,
    showCanadianRetail: true,
    showCanadianLanded: true,
    showUsdWholesale: true,
  };
}

function unitedStatesMarket(
  source: PricingMarketSource,
  extra?: Partial<Pick<PricingMarket, 'territoryId' | 'territoryCode' | 'countryCode'>>,
): PricingMarket {
  return {
    countryCode: extra?.countryCode ?? 'US',
    currencyCode: 'USD',
    currencyLabel: 'US$',
    publicMarket: 'us',
    territoryId: extra?.territoryId ?? null,
    territoryCode: extra?.territoryCode ?? null,
    source,
    showCanadianRetail: false,
    showCanadianLanded: false,
    showUsdWholesale: true,
  };
}

function unknownMarket(): PricingMarket {
  return {
    countryCode: null,
    currencyCode: 'USD',
    currencyLabel: 'US$',
    publicMarket: 'us',
    territoryId: null,
    territoryCode: null,
    source: 'unknown',
    showCanadianRetail: false,
    showCanadianLanded: false,
    showUsdWholesale: true,
  };
}

export function normalizePublicMarket(value: string | null | undefined): PublicMarket | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'ca' || normalized === 'us') return normalized;
  return null;
}

export function normalizePricingCountryCode(
  value: string | null | undefined,
): PricingCountryCode | null {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'CA' || normalized === 'US') return normalized;
  return null;
}

/** Public URL path is authoritative. Cookie must never override this. */
export function resolvePricingMarketFromPublicPath(pathname: string): PricingMarket {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === US_COLLECTION_PREFIX || path.startsWith(`${US_COLLECTION_PREFIX}/`)) {
    return unitedStatesMarket('public_path');
  }
  return canadianMarket('public_path');
}

export function resolvePricingMarketFromStaffSelector(market: PublicMarket): PricingMarket {
  return market === 'us' ? unitedStatesMarket('staff_selector') : canadianMarket('staff_selector');
}

/**
 * Generic country_code mapping. Does not consult OGR allowlists.
 * Inactive/missing assignment → unknown (USD wholesale, hide CAD; never BC).
 */
export function resolvePricingMarketFromRlaAssignment(
  assignment: RlaTerritoryAssignmentInput | null | undefined,
): PricingMarket {
  if (!assignment || assignment.status !== 'active') {
    return unknownMarket();
  }
  const country = normalizePricingCountryCode(assignment.countryCode);
  if (country === 'CA') {
    return canadianMarket('rla_territory_assignment', {
      territoryId: assignment.territoryId,
      territoryCode: assignment.territoryCode,
    });
  }
  if (country === 'US') {
    return unitedStatesMarket('rla_territory_assignment', {
      territoryId: assignment.territoryId,
      territoryCode: assignment.territoryCode,
    });
  }
  return unknownMarket();
}

export function ogrWholesaleCollectionPath(market: PublicMarket = 'ca'): string {
  return market === 'us' ? US_COLLECTION_PREFIX : OGR_WHOLESALE_PATH;
}

export function writePublicMarketCookie(market: PublicMarket): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${OGR_WHOLESALE_MARKET_COOKIE}=${market}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function readPublicMarketCookie(
  cookieHeader: string | null | undefined,
): PublicMarket | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === OGR_WHOLESALE_MARKET_COOKIE) {
      return normalizePublicMarket(rest.join('='));
    }
  }
  return null;
}
