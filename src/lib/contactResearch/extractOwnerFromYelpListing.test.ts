import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const generateObjectMock = vi.fn();

vi.mock('ai', () => ({
  gateway: { tools: { perplexitySearch: vi.fn(() => ({})) } },
  generateText: (...args: unknown[]) => generateTextMock(...args),
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
  stepCountIs: (n: number) => n,
}));

import { extractOwnerFromYelpListing } from '@/lib/contactResearch/extractOwnerFromYelpListing';

const SASSY_YELP = {
  id: 'sassy',
  alias: 'the-sassy-seagull-bandon',
  name: 'The Sassy Seagull',
  url: 'https://www.yelp.com/biz/the-sassy-seagull-bandon',
  phone: '541-777-7147',
  address1: '198 2nd St SE',
  city: 'Bandon',
  state: 'OR',
  postalCode: '97411',
  businessUrl: null,
  categories: ['Gift Shop'],
  isClaimed: true,
  reviewCount: 42,
  rating: 4.5,
};

describe('extractOwnerFromYelpListing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses Karen R. / Business Owner from Yelp listing excerpt', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Meet the Business Owner: Karen R., Business Owner at The Sassy Seagull in Bandon.',
    });
    generateObjectMock.mockResolvedValue({
      object: { fullName: 'Karen R.', title: 'Business Owner' },
    });

    const result = await extractOwnerFromYelpListing({
      yelpBusiness: SASSY_YELP,
      companyName: 'Sassy Seagull (Bandon Store)',
    });

    expect(result.fullName).toBe('Karen R.');
    expect(result.title).toBe('Business Owner');
    expect(result.excerpt).toContain('Karen R.');
    const prompt = String(generateTextMock.mock.calls[0]?.[0]?.prompt ?? '');
    expect(prompt).toContain('yelp.com/biz/the-sassy-seagull-bandon');
  });

  it('returns null when search finds no owner', async () => {
    generateTextMock.mockResolvedValue({ text: 'No owner name found on this Yelp listing.' });

    const result = await extractOwnerFromYelpListing({
      yelpBusiness: SASSY_YELP,
      companyName: 'Sassy Seagull',
    });

    expect(result.fullName).toBeNull();
    expect(result.title).toBeNull();
  });
});
