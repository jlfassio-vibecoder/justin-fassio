import { describe, expect, it } from 'vitest';
import { formatAccountDetailsClipboard } from '@/lib/formatAccountDetailsClipboard';

describe('formatAccountDetailsClipboard', () => {
  it('formats populated fields in display order', () => {
    expect(
      formatAccountDetailsClipboard({
        name: 'Bandon Dunes Golf Resort',
        phone: '541-555-0100',
        website: 'https://www.bandondunesgolf.com',
        address: '57744 Round Lake Rd',
        city: 'Bandon',
        region: 'Oregon Coast',
        territoryName: 'Oregon',
        operationalTerritoryName: 'PNW West',
        postalCode: '97411',
        fit: 'Destination golf resort',
      }),
    ).toBe(
      [
        'Business name: Bandon Dunes Golf Resort',
        'Store phone: 541-555-0100',
        'Website: https://www.bandondunesgolf.com',
        'Street address: 57744 Round Lake Rd',
        'City: Bandon',
        'Region: Oregon Coast',
        'Store territory: Oregon',
        'Operational territory: PNW West',
        'Postal / ZIP: 97411',
        'Fit / business description: Destination golf resort',
      ].join('\n'),
    );
  });

  it('omits blank and whitespace-only values', () => {
    expect(
      formatAccountDetailsClipboard({
        name: 'Coast Pro Shop',
        phone: '  ',
        website: null,
        address: undefined,
        city: 'Newport',
        region: '',
        territoryName: 'Oregon',
        operationalTerritoryName: null,
        postalCode: '97365',
        fit: '   ',
      }),
    ).toBe(
      [
        'Business name: Coast Pro Shop',
        'City: Newport',
        'Store territory: Oregon',
        'Postal / ZIP: 97365',
      ].join('\n'),
    );
  });

  it('returns an empty string when every field is empty', () => {
    expect(formatAccountDetailsClipboard({})).toBe('');
    expect(
      formatAccountDetailsClipboard({
        name: '  ',
        phone: null,
        website: undefined,
      }),
    ).toBe('');
  });
});
