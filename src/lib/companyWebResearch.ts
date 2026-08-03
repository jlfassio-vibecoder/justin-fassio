import { gateway, generateText, stepCountIs } from 'ai';
import { CATEGORY_MAPPING_GUIDANCE, hostnameFromUrl } from '@/lib/enrichGuidance';

const BRIEF_MAX_CHARS = 4000;

export type CompanyWebResearchInput = {
  companyName: string;
  websiteUrl?: string;
  contactName?: string;
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

  const contactLine = contactName
    ? `Also look for public listings for contact "${contactName}" (title, phone, email) only if clearly published; never invent.`
    : 'Do not invent people, phone numbers, or emails.';

  const urlInstructions = websiteUrl
    ? [
        `Authoritative website (treat as primary source): ${websiteUrl}`,
        hostname
          ? `Your FIRST web search MUST target this exact business via the official site (query the URL or site:${hostname} plus the company name). Do not substitute a different "Sports" retailer.`
          : 'Your FIRST web search MUST use this exact URL with the company name.',
        'Summarize merchandise and address from that site before using any other listing.',
      ].join('\n')
    : 'No official website provided; disambiguate carefully among similarly named businesses.';

  try {
    const result = await generateText({
      model: 'openai/gpt-4o',
      stopWhen: stepCountIs(4),
      tools: {
        perplexity_search: gateway.tools.perplexitySearch({
          maxResults: 5,
          // Prefer the official domain when we have one, without blocking all other sources.
          ...(hostname ? { searchDomainFilter: [hostname] } : {}),
        }),
      },
      prompt: [
        'You research BC retailers for Old Guys Rule wholesale apparel reps.',
        'Use the web search tool to find current public information about THIS exact company.',
        urlInstructions,
        'First state what the store actually sells in plain language (e.g. hunting/fishing/firearms vs golf vs marine vs hardware).',
        'Then suggest a CRM channel using these rules:',
        CATEGORY_MAPPING_GUIDANCE,
        'Also extract: cleaned store name, BC city/region clues, positioning/customer vibe, and any published store phone or street address from the official source.',
        contactLine,
        'Write a concise factual brief (no markdown tables). If search finds nothing useful, say so briefly.',
        `Company name: ${companyName}`,
      ].join('\n'),
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
