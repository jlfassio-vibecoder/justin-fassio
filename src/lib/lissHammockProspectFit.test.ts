import { describe, expect, it } from 'vitest';
import { assertLineAllowsOperationalWrite } from '@/lib/retailerLineAccounts';
import {
  prospectFitsLissHammockGeo,
  prospectFitsLissHammockIcp,
  prospectFitsLissHammockOpen,
} from '@/lib/lissHammockProspectFit';

describe('assertLineAllowsOperationalWrite — living-in-sunshine', () => {
  it('rejects by default and allows when selling flag is on', () => {
    expect(
      assertLineAllowsOperationalWrite({ code: 'living-in-sunshine', status: 'onboarding' }),
    ).toBe('ui_blocked');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'living-in-sunshine', status: 'onboarding' },
        { livingInSunshineSellingEnabled: true },
      ),
    ).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'living-in-sunshine', status: 'confirmed' },
        { livingInSunshineSellingEnabled: true },
      ),
    ).toBe('allow');
    expect(
      assertLineAllowsOperationalWrite(
        { code: 'living-in-sunshine', status: 'prospective' },
        { livingInSunshineSellingEnabled: true },
      ),
    ).toBe('reject');
  });
});

describe('lissHammockProspectFit geo', () => {
  it('includes OR/WA/BC and NorCal; excludes OC and San Diego', () => {
    expect(
      prospectFitsLissHammockGeo({
        territoryCode: 'or',
        region: 'Oregon Coast',
        city: 'Newport',
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockGeo({
        territoryCode: 'wa',
        region: 'Olympic Peninsula & Coast',
        city: 'Port Angeles',
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockGeo({
        territoryCode: 'bc',
        region: 'Vancouver Island',
        city: 'Victoria',
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockGeo({
        territoryCode: 'ca',
        region: 'NorCal Coastal',
        city: 'Santa Cruz',
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockGeo({
        territoryCode: 'ca',
        region: 'LA Metro / OC',
        city: 'Santa Monica',
        postalCode: '90401',
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockGeo({
        territoryCode: 'ca',
        region: 'LA Metro / OC',
        city: 'Irvine',
        postalCode: '92618',
      }),
    ).toBe(false);
    expect(
      prospectFitsLissHammockGeo({
        territoryCode: 'ca',
        region: 'Inland Empire / San Diego',
        city: 'San Diego',
      }),
    ).toBe(false);
  });
});

describe('lissHammockProspectFit ICP', () => {
  it('matches surf_beach, outdoor channel, or tourist venue; rejects unrelated', () => {
    expect(
      prospectFitsLissHammockIcp({
        territoryCode: 'or',
        region: 'Oregon Coast',
        lifestyleThemes: ['surf_beach'],
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockIcp({
        territoryCode: 'or',
        region: 'Oregon Coast',
        category: 'outdoor_camping_hunting',
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockIcp({
        territoryCode: 'or',
        region: 'Oregon Coast',
        venueContexts: ['marina'],
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockIcp({
        territoryCode: 'or',
        region: 'Oregon Coast',
        category: 'grocery_supermarket',
        lifestyleThemes: ['bbq'],
      }),
    ).toBe(false);
  });

  it('requires both geo and ICP for open', () => {
    expect(
      prospectFitsLissHammockOpen({
        territoryCode: 'or',
        region: 'Oregon Coast',
        category: 'outdoor_camping_hunting',
        accountStatus: 'prospect',
      }),
    ).toBe(true);
    expect(
      prospectFitsLissHammockOpen({
        territoryCode: 'ca',
        region: 'LA Metro / OC',
        city: 'Irvine',
        postalCode: '92618',
        category: 'outdoor_camping_hunting',
      }),
    ).toBe(false);
  });
});
