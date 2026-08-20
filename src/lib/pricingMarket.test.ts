import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OGR_ALLOWED_GEO } from '@/lib/salesLineTerritories';
import {
  ogrWholesaleCollectionPath,
  readPublicMarketCookie,
  resolvePricingMarketFromPublicPath,
  resolvePricingMarketFromRlaAssignment,
  resolvePricingMarketFromStaffSelector,
} from '@/lib/pricingMarket';

describe('resolvePricingMarketFromPublicPath', () => {
  it('treats the default OGR wholesale route as Canadian', () => {
    const market = resolvePricingMarketFromPublicPath('/old-guys-rule-wholesale');
    expect(market.publicMarket).toBe('ca');
    expect(market.showCanadianRetail).toBe(true);
    expect(market.showCanadianLanded).toBe(true);
    expect(market.source).toBe('public_path');
  });

  it('treats /us collection and product paths as United States', () => {
    expect(resolvePricingMarketFromPublicPath('/old-guys-rule-wholesale/us').publicMarket).toBe(
      'us',
    );
    expect(
      resolvePricingMarketFromPublicPath('/old-guys-rule-wholesale/us/american-revival')
        .showCanadianRetail,
    ).toBe(false);
  });
});

describe('resolvePricingMarketFromRlaAssignment', () => {
  it('keeps Canadian presentation for a BC assignment', () => {
    const market = resolvePricingMarketFromRlaAssignment({
      status: 'active',
      countryCode: 'CA',
      territoryId: 'geo-bc',
      territoryCode: 'bc',
    });
    expect(market.publicMarket).toBe('ca');
    expect(market.showCanadianRetail).toBe(true);
    expect(market.showCanadianLanded).toBe(true);
    expect(market.territoryCode).toBe('bc');
    expect(market.source).toBe('rla_territory_assignment');
  });

  it('uses U.S. presentation for Oregon and Washington', () => {
    for (const code of ['or', 'wa'] as const) {
      const market = resolvePricingMarketFromRlaAssignment({
        status: 'active',
        countryCode: 'US',
        territoryId: `geo-${code}`,
        territoryCode: code,
      });
      expect(market.publicMarket).toBe('us');
      expect(market.showCanadianRetail).toBe(false);
      expect(market.showCanadianLanded).toBe(false);
      expect(market.showUsdWholesale).toBe(true);
      expect(market.currencyCode).toBe('USD');
    }
  });

  it('maps generic US country_code without granting OGR extra geos', () => {
    expect(OGR_ALLOWED_GEO).toEqual(['bc', 'or', 'wa']);
    const market = resolvePricingMarketFromRlaAssignment({
      status: 'active',
      countryCode: 'US',
      territoryId: 'geo-norcal',
      territoryCode: 'norcal',
    });
    expect(market.publicMarket).toBe('us');
    expect(market.showCanadianRetail).toBe(false);
    expect(OGR_ALLOWED_GEO).not.toContain('norcal');
    expect(OGR_ALLOWED_GEO).not.toContain('ca');
  });

  it('suppresses Canadian values when assignment is missing or inactive', () => {
    expect(resolvePricingMarketFromRlaAssignment(null).source).toBe('unknown');
    expect(resolvePricingMarketFromRlaAssignment(null).showCanadianRetail).toBe(false);
    expect(resolvePricingMarketFromRlaAssignment(null).showCanadianLanded).toBe(false);
    expect(resolvePricingMarketFromRlaAssignment(null).showUsdWholesale).toBe(true);
    expect(
      resolvePricingMarketFromRlaAssignment({
        status: 'proposed',
        countryCode: 'CA',
        territoryId: 'geo-bc',
        territoryCode: 'bc',
      }).source,
    ).toBe('unknown');
  });
});

describe('resolvePricingMarketFromStaffSelector', () => {
  it('defaults Canada and only changes presentation flags', () => {
    const ca = resolvePricingMarketFromStaffSelector('ca');
    const us = resolvePricingMarketFromStaffSelector('us');
    expect(ca.showCanadianRetail).toBe(true);
    expect(ca.source).toBe('staff_selector');
    expect(us.showCanadianRetail).toBe(false);
    expect(us.showCanadianLanded).toBe(false);
    expect(us.showUsdWholesale).toBe(true);
  });
});

describe('pricingMarket isolation', () => {
  it('does not import or call the unknown-province → BC helper', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/lib/pricingMarket.ts'), 'utf8');
    expect(src).not.toMatch(/territoryCodeFromProvince/);
    expect(src).not.toMatch(/BC_TERRITORY_CODE/);
  });

  it('builds collection paths without query strings', () => {
    expect(ogrWholesaleCollectionPath('ca')).toBe('/old-guys-rule-wholesale');
    expect(ogrWholesaleCollectionPath('us')).toBe('/old-guys-rule-wholesale/us');
  });

  it('reads the first-party market cookie without treating it as authoritative', () => {
    expect(readPublicMarketCookie('ogr_wholesale_market=us; other=1')).toBe('us');
    expect(readPublicMarketCookie('a=b')).toBeNull();
    expect(resolvePricingMarketFromPublicPath('/old-guys-rule-wholesale').publicMarket).toBe('ca');
    expect(resolvePricingMarketFromPublicPath('/old-guys-rule-wholesale/us').publicMarket).toBe(
      'us',
    );
  });

  it('does not let a U.S. cookie change the Canadian path', () => {
    const cookie = 'ogr_wholesale_market=us';
    expect(readPublicMarketCookie(cookie)).toBe('us');
    expect(resolvePricingMarketFromPublicPath('/old-guys-rule-wholesale').publicMarket).toBe('ca');
    expect(
      resolvePricingMarketFromPublicPath('/old-guys-rule-wholesale/american-revival').publicMarket,
    ).toBe('ca');
  });

  it('does not read the market cookie from wholesale Astro pages or the resolver', () => {
    const resolver = readFileSync(resolve(process.cwd(), 'src/lib/pricingMarket.ts'), 'utf8');
    expect(resolver).toMatch(/Public URL path is authoritative/);
    const pages = [
      'src/pages/old-guys-rule-wholesale/index.astro',
      'src/pages/old-guys-rule-wholesale/[slug].astro',
      'src/pages/old-guys-rule-wholesale/us/index.astro',
      'src/pages/old-guys-rule-wholesale/us/[slug].astro',
    ];
    for (const page of pages) {
      const src = readFileSync(resolve(process.cwd(), page), 'utf8');
      expect(src).not.toMatch(/readPublicMarketCookie/);
    }
  });
});
