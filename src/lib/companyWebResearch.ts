import { gateway, generateText, stepCountIs } from 'ai';
import { CATEGORY_MAPPING_GUIDANCE, hostnameFromUrl } from '@/lib/enrichGuidance';

const BRIEF_MAX_CHARS = 4000;

/** Shared directory hosts where domain-filtered search rarely yields store phone/address. */
const DIRECTORY_HOST_SUFFIXES = [
  'britishcolumbiagolf.org',
  'golftown.com',
  'yellowpages.ca',
  'yelp.ca',
  'yelp.com',
  'facebook.com',
  'google.com',
];

export function isSharedDirectoryHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return DIRECTORY_HOST_SUFFIXES.some((suffix) => h === suffix || h.endsWith(`.${suffix}`));
}

export type CompanyWebResearchInput = {
  companyName: string;
  websiteUrl?: string;
  contactName?: string;
  city?: string;
  retailCategoryHint?: string;
  /**
   * When true (Fill Blank Fields), skip domain filter on shared directories and
   * emphasize official site + street address + phone + apparel evidence.
   */
  fillBlanksFocus?: boolean;
};

/**
 * Ground company (and optional contact) facts via AI Gateway Perplexity search.
 * Soft-fails: returns `{ brief: null, error }` so callers can fall back to name-only enrichment.
 */
export async function researchCompany(
  input: CompanyWebResearchInput,
): Promise<{ brief: string | null; error: string | null }> {
  const companyName = input.companyName.trim();
  if (!companyName) {
    return { brief: null, error: 'Company name is required' };
  }

  const websiteUrl = input.websiteUrl?.trim() || undefined;
  const contactName = input.contactName?.trim() || undefined;
  const hostname = websiteUrl ? hostnameFromUrl(websiteUrl) : null;
  const fillBlanksFocus = Boolean(input.fillBlanksFocus);
  const skipDomainFilter = fillBlanksFocus && isSharedDirectoryHost(hostname);

  const contactLine = contactName
    ? `Also look for public listings for contact "${contactName}" (title, phone, email) only if clearly published; never invent.`
    : 'Do not invent people, phone numbers, or emails.';

  const locationLine = input.city?.trim()
    ? `Disambiguate using city/town: ${input.city.trim()}.`
    : '';
  const categoryHint = input.retailCategoryHint?.trim()
    ? `Planning retail category hint (verify, do not assume): ${input.retailCategoryHint.trim()}.`
    : '';

  let urlInstructions: string;
  if (websiteUrl && skipDomainFilter) {
    urlInstructions = [
      `A directory/shared URL was provided (treat as a lead only, not the exclusive source): ${websiteUrl}`,
      'Search broadly for the official website or listings for THIS exact named location.',
      'Prioritize finding: official site, street address, phone number, and apparel/merchandise evidence.',
    ].join('\n');
  } else if (websiteUrl) {
    urlInstructions = [
      `Authoritative website (treat as primary source): ${websiteUrl}`,
      hostname
        ? `Your FIRST web search MUST target this exact business via the official site (query the URL or site:${hostname} plus the company name). Do not substitute a different "Sports" retailer.`
        : 'Your FIRST web search MUST use this exact URL with the company name.',
      'Summarize merchandise and address from that site before using any other listing.',
    ].join('\n');
  } else {
    urlInstructions =
      'No official website provided; disambiguate carefully among similarly named businesses. Find the official site if possible.';
  }

  const fillFocusLines = fillBlanksFocus
    ? [
        'Fill-blank focus: explicitly report any published street address and store phone for this location.',
        'State whether third-party / graphic apparel appears Confirmed, Likely, None, or Unknown from public evidence.',
        'Never invent OGR stocking status or buyer verification.',
      ]
    : [];

  try {
    const result = await generateText({
      model: 'openai/gpt-4o',
      stopWhen: stepCountIs(4),
      tools: {
        perplexity_search: gateway.tools.perplexitySearch({
          maxResults: 5,
          ...(hostname && !skipDomainFilter ? { searchDomainFilter: [hostname] } : {}),
        }),
      },
      prompt: [
        'You research BC retailers for Old Guys Rule wholesale apparel reps.',
        'Use the web search tool to find current public information about THIS exact company.',
        urlInstructions,
        locationLine,
        categoryHint,
        'First state what the store actually sells in plain language (e.g. hunting/fishing/firearms vs golf vs marine vs hardware).',
        'Then suggest a CRM channel using these rules:',
        CATEGORY_MAPPING_GUIDANCE,
        'Also extract: cleaned store name, BC city/region clues, positioning/customer vibe, and any published store phone or street address from the official source.',
        ...fillFocusLines,
        contactLine,
        'Write a concise factual brief (no markdown tables). If search finds nothing useful, say so briefly.',
        `Company name: ${companyName}`,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const brief = result.text.trim().slice(0, BRIEF_MAX_CHARS);
    if (!brief) {
      return { brief: null, error: 'Web research returned empty brief' };
    }
    return { brief, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Web research failed';
    return { brief: null, error: message };
  }
}
