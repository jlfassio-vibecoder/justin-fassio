import { hostnameFromUrl } from '@/lib/enrichGuidance';
import { isDirectoryCitationHost } from '@/lib/companyWebResearch';
import type { Prospect } from '@/lib/prospects';
import { matchProspectToYelp } from '@/lib/yelp/businessMatch';
import type { YelpMatchConfidence, YelpMatchResult } from '@/lib/yelp/types';

export type ContactResearchBriefInput = {
  prospect: Prospect;
  resolvedWebsite?: string | null;
  candidateName?: string | null;
};

export type ContactResearchBriefResult = {
  seedBlock: string;
  yelpMatch: YelpMatchResult | null;
  websiteUrl: string | null;
  researchBrief: string | null;
};

function resolveOfficialWebsiteUrl(
  prospect: Prospect,
  resolvedWebsite?: string | null,
): string | null {
  for (const raw of [resolvedWebsite, prospect.website]) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const host = hostnameFromUrl(trimmed);
    if (host && !isDirectoryCitationHost(host)) {
      return trimmed;
    }
  }
  return null;
}

function yelpUsableForSeed(confidence: YelpMatchConfidence): boolean {
  return confidence === 'high' || confidence === 'medium';
}

function buildSeedBlock(input: {
  prospect: Prospect;
  websiteUrl: string | null;
  yelpMatch: YelpMatchResult | null;
  candidateName?: string | null;
}): string {
  const lines = [
    'Contact discovery context (directory evidence + CRM; do not treat Yelp as official website):',
    `Business: ${input.prospect.name}`,
    input.prospect.city?.trim() ? `City: ${input.prospect.city.trim()}` : '',
    input.prospect.address?.trim() ? `Address: ${input.prospect.address.trim()}` : '',
    input.prospect.phone?.trim() ? `CRM phone: ${input.prospect.phone.trim()}` : '',
    input.websiteUrl ? `Official website hint: ${input.websiteUrl}` : '',
  ];

  if (input.yelpMatch) {
    const y = input.yelpMatch.business;
    lines.push(
      `Yelp directory listing (verification only): ${y.url}`,
      y.phone ? `Yelp phone: ${y.phone}` : '',
      y.address1 ? `Yelp address: ${y.address1}` : '',
      y.city ? `Yelp city: ${y.city}` : '',
    );
  }

  const candidate = input.candidateName?.trim();
  if (candidate) {
    lines.push(`Target contact name (staff seed): ${candidate}`);
  } else {
    lines.push(
      'Find the likely purchasing contact (owner, buyer, general manager, or store manager) from public sources only.',
    );
  }

  return lines.filter(Boolean).join('\n');
}

export function composeContactResearchBrief(
  seedBlock: string,
  perplexityBrief: string | null,
): string | null {
  const parts = [seedBlock.trim(), perplexityBrief?.trim()].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join('\n\n---\n\n');
}

/** Build Yelp + CRM seed context for contact discovery research. */
export async function buildContactResearchBrief(
  input: ContactResearchBriefInput,
): Promise<ContactResearchBriefResult> {
  const prospect = input.prospect;
  const websiteUrl = resolveOfficialWebsiteUrl(prospect, input.resolvedWebsite);

  let yelpMatch: YelpMatchResult | null = null;
  if (process.env.YELP_FUSION_API_KEY?.trim()) {
    try {
      const matched = await matchProspectToYelp({
        name: prospect.name,
        address: prospect.address,
        city: prospect.city,
        postalCode: prospect.postalCode,
        phone: prospect.phone,
      });
      if (matched && yelpUsableForSeed(matched.confidence)) {
        yelpMatch = matched;
      }
    } catch {
      yelpMatch = null;
    }
  }

  const seedBlock = buildSeedBlock({
    prospect,
    websiteUrl,
    yelpMatch,
    candidateName: input.candidateName,
  });

  return {
    seedBlock,
    yelpMatch,
    websiteUrl,
    researchBrief: null,
  };
}
