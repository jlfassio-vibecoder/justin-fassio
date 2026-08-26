import { gateway, generateText, stepCountIs } from 'ai';
import { hostnameFromUrl } from '@/lib/enrichGuidance';
import type { YelpBusiness } from '@/lib/yelp/types';
import { yelpBizSearchUrl } from '@/lib/yelp/businessMatch';

const BRIEF_MAX_CHARS = 3000;

export type ResearchContactDiscoveryInput = {
  companyName: string;
  city?: string | null;
  state?: string | null;
  websiteUrl?: string | null;
  yelpBusiness?: YelpBusiness | null;
  seedBlock?: string | null;
  candidateName?: string | null;
};

/**
 * Contact-focused web research — not prospect CRM category enrichment.
 * When a Yelp match exists, treat the listing as verified directory ground truth.
 */
export async function researchContactDiscovery(
  input: ResearchContactDiscoveryInput,
): Promise<{ brief: string | null; error: string | null }> {
  const companyName = input.companyName.trim();
  if (!companyName) {
    return { brief: null, error: 'Company name is required' };
  }

  const city = input.city?.trim() || undefined;
  const state = input.state?.trim() || undefined;
  const websiteUrl = input.websiteUrl?.trim() || undefined;
  const hostname = websiteUrl ? hostnameFromUrl(websiteUrl) : null;
  const yelp = input.yelpBusiness ?? null;
  const yelpUrl = yelp ? yelpBizSearchUrl(yelp) : null;

  const locationLine =
    city && state ? `Location: ${city}, ${state}.` : city ? `City: ${city}.` : '';

  const yelpLines = yelp
    ? [
        'Yelp-verified directory match (ground truth for THIS business — not the official website):',
        `Yelp name: ${yelp.name}`,
        yelpUrl ? `Yelp listing URL (search this FIRST): ${yelpUrl}` : '',
        yelp.categories.length > 0 ? `Yelp categories: ${yelp.categories.join(', ')}` : '',
        yelp.phone ? `Yelp phone: ${yelp.phone}` : '',
        yelp.address1
          ? `Yelp address: ${[yelp.address1, yelp.city, yelp.state, yelp.postalCode].filter(Boolean).join(', ')}`
          : '',
        yelp.isClaimed != null ? `Yelp claimed: ${yelp.isClaimed ? 'yes' : 'no'}` : '',
        'Search the Yelp listing for Meet the Business Owner, owner name, manager, and store description.',
      ]
    : [];

  const contactLine = input.candidateName?.trim()
    ? `Focus on contact "${input.candidateName.trim()}" only if clearly tied to this business.`
    : 'Find the likely purchasing contact (owner, buyer, general manager, or store manager).';

  const searchDomains = [...(yelpUrl ? ['yelp.com'] : []), ...(hostname ? [hostname] : [])];

  try {
    const result = await generateText({
      model: 'openai/gpt-4o',
      stopWhen: stepCountIs(4),
      tools: {
        perplexity_search: gateway.tools.perplexitySearch({
          maxResults: 5,
          ...(searchDomains.length > 0 ? { searchDomainFilter: searchDomains } : {}),
        }),
      },
      prompt: [
        'You research US retail businesses to find a purchasing contact for wholesale outreach.',
        input.seedBlock?.trim() ?? '',
        ...yelpLines,
        locationLine,
        'Do NOT suggest CRM product categories or channel taxonomy — contact discovery only.',
        yelpUrl
          ? `Your FIRST search must target the Yelp listing ${yelpUrl} for owner/manager and business description.`
          : 'Search public sources for this exact business location.',
        websiteUrl && hostname
          ? `Then check official website ${websiteUrl} for team/contact pages.`
          : '',
        contactLine,
        'Report only explicitly published names, titles, phones, and emails. Never invent.',
        'Write a concise factual brief (no markdown tables).',
        `Business name (CRM): ${companyName}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const brief = result.text.trim().slice(0, BRIEF_MAX_CHARS);
    if (!brief) {
      return { brief: null, error: 'Contact research returned empty brief' };
    }
    return { brief, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Contact research failed';
    return { brief: null, error: message };
  }
}
