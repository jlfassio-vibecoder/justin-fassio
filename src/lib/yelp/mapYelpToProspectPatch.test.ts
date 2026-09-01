import { describe, expect, it } from 'vitest';
import { buildBlankOnlyProspectPatch } from '@/lib/yelp/mapYelpToProspectPatch';
import type { YelpBusiness } from '@/lib/yelp/types';

const YELP_BUSINESS: YelpBusiness = {
  id: 'newport-ace-newport',
  alias: 'newport-ace-newport',
  name: 'Newport Ace Hardware',
  url: 'https://www.yelp.com/biz/newport-ace-newport',
  phone: '541-265-1234',
  address1: '123 Main St',
  city: 'Newport',
  state: 'OR',
  postalCode: '97365',
  businessUrl: 'https://newportace.com',
  categories: ['Hardware Stores'],
  isClaimed: true,
  reviewCount: 12,
  rating: 4.5,
};

describe('buildBlankOnlyProspectPatch', () => {
  it('fills only blank prospect fields', () => {
    const { patch, skipped } = buildBlankOnlyProspectPatch(
      { phone: '541-000-0000', address: '', city: 'Newport', postal_code: '', website: '' },
      YELP_BUSINESS,
    );

    expect(patch).toEqual({
      address: '123 Main St',
      postal_code: '97365',
      website: 'https://newportace.com',
    });
    expect(skipped.phone).toBe('already_populated');
    expect(skipped.city).toBe('already_populated');
  });

  it('rejects directory URLs for website', () => {
    const { patch, skipped } = buildBlankOnlyProspectPatch(
      { website: '' },
      {
        ...YELP_BUSINESS,
        businessUrl: 'https://www.yelp.com/biz/newport-ace-newport',
      },
    );

    expect(patch.website).toBeUndefined();
    expect(skipped.website).toBe('directory_url');
  });

  it('skips fields when Yelp has no value', () => {
    const { patch, skipped } = buildBlankOnlyProspectPatch(
      { phone: '', address: '', city: '', postal_code: '', website: '' },
      {
        ...YELP_BUSINESS,
        phone: null,
        address1: null,
        city: null,
        postalCode: null,
        businessUrl: null,
      },
    );

    expect(patch).toEqual({});
    expect(skipped.phone).toBe('missing_yelp_value');
    expect(skipped.address).toBe('missing_yelp_value');
  });
});
