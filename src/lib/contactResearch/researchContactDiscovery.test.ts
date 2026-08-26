import { beforeEach, describe, expect, it, vi } from 'vitest';

const generateTextMock = vi.fn();
const perplexitySearchMock = vi.fn(() => ({}));

vi.mock('ai', () => ({
  gateway: { tools: { perplexitySearch: (...args: unknown[]) => perplexitySearchMock(...args) } },
  generateText: (...args: unknown[]) => generateTextMock(...args),
  stepCountIs: (n: number) => n,
}));

import { researchContactDiscovery } from '@/lib/contactResearch/researchContactDiscovery';

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

describe('researchContactDiscovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes Yelp listing URL in prompt and skips CRM category guidance', async () => {
    generateTextMock.mockResolvedValue({ text: 'Karen R. is Business Owner.' });

    const result = await researchContactDiscovery({
      companyName: 'Sassy Seagull (Bandon Store)',
      city: 'Bandon',
      state: 'OR',
      yelpBusiness: SASSY_YELP,
      seedBlock: 'Contact discovery context',
    });

    expect(result.brief).toContain('Karen R.');
    const prompt = String(generateTextMock.mock.calls[0]?.[0]?.prompt ?? '');
    expect(prompt).toContain('yelp.com/biz/the-sassy-seagull-bandon');
    expect(prompt).toContain('Meet the Business Owner');
    expect(prompt).toContain('Do NOT suggest CRM product categories');
    expect(prompt).not.toContain('BC retailers');
    expect(perplexitySearchMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchDomainFilter: ['yelp.com'] }),
    );
  });

  it('includes yelp.com alongside official website host in domain filter', async () => {
    generateTextMock.mockResolvedValue({ text: 'Owner found on Yelp.' });

    await researchContactDiscovery({
      companyName: 'Sassy Seagull (Bandon Store)',
      city: 'Bandon',
      state: 'OR',
      websiteUrl: 'https://www.facebook.com/SassySeagull',
      yelpBusiness: SASSY_YELP,
    });

    expect(perplexitySearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        searchDomainFilter: expect.arrayContaining(['yelp.com', 'facebook.com']),
      }),
    );
  });
});
