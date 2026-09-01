import { generateObject, generateText, gateway, stepCountIs } from 'ai';
import { z } from 'zod';
import type { YelpBusiness } from '@/lib/yelp/types';
import { yelpBizSearchUrl } from '@/lib/yelp/businessMatch';

const BRIEF_MAX_CHARS = 2000;

const yelpOwnerSchema = z.object({
  fullName: z
    .string()
    .nullable()
    .describe(
      'Business owner or manager full name only if explicitly named in snippets; otherwise null',
    ),
  title: z
    .string()
    .nullable()
    .describe('Job title such as Owner or Business Owner when explicit; otherwise null'),
});

export type YelpOwnerExtractionResult = {
  fullName: string | null;
  title: string | null;
  excerpt: string | null;
};

/** Search the matched Yelp listing for Meet the Business Owner / owner name via Perplexity. */
export async function extractOwnerFromYelpListing(input: {
  yelpBusiness: YelpBusiness;
  companyName: string;
}): Promise<YelpOwnerExtractionResult> {
  const listingUrl = yelpBizSearchUrl(input.yelpBusiness);
  const alias = input.yelpBusiness.alias ?? listingUrl.split('/biz/')[1]?.split('?')[0] ?? '';

  try {
    const searchResult = await generateText({
      model: 'openai/gpt-4o',
      stopWhen: stepCountIs(3),
      tools: {
        perplexity_search: gateway.tools.perplexitySearch({
          maxResults: 5,
          searchDomainFilter: ['yelp.com'],
        }),
      },
      prompt: [
        'Find the business owner or manager for ONE specific Yelp listing.',
        'Search the Yelp listing page and snippets only — do not invent names.',
        'Look for "Meet the Business Owner", "Business Owner", or owner name in the From the Business section.',
        `Yelp listing: ${listingUrl}`,
        alias ? `Yelp alias: ${alias}` : '',
        `CRM business name: ${input.companyName.trim()}`,
        `Yelp verified name: ${input.yelpBusiness.name}`,
        'Return a short factual excerpt quoting any owner name and title found. If none, say none found briefly.',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const excerpt = searchResult.text.trim().slice(0, BRIEF_MAX_CHARS);
    if (!excerpt || /none found|not found|no owner/i.test(excerpt)) {
      return { fullName: null, title: null, excerpt: excerpt || null };
    }

    const parsed = await generateObject({
      model: 'openai/gpt-4o',
      schema: yelpOwnerSchema,
      schemaName: 'YelpOwnerFromListing',
      prompt: [
        'Extract owner/manager name and title from this Yelp listing research excerpt only.',
        'Return null for any field not explicitly present. Do not invent.',
        'Excerpt:',
        excerpt,
      ].join('\n'),
    });

    return {
      fullName: parsed.object.fullName?.trim() || null,
      title: parsed.object.title?.trim() || null,
      excerpt,
    };
  } catch {
    return { fullName: null, title: null, excerpt: null };
  }
}
