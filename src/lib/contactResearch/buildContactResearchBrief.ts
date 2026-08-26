import { hostnameFromUrl } from '@/lib/enrichGuidance';
import { isDirectoryCitationHost } from '@/lib/companyWebResearch';
import type { Prospect } from '@/lib/prospects';
import { matchProspectToYelp, yelpBizSearchUrl } from '@/lib/yelp/businessMatch';
import { hasYelpFusionApiKey, LOCAL_YELP_FUSION_KEY_HELP } from '@/lib/yelp/yelpFusionEnv';
import type { YelpMatchConfidence, YelpMatchResult } from '@/lib/yelp/types';

export type ContactResearchBriefInput = {
  prospect: Prospect;
  resolvedWebsite?: string | null;
  candidateName?: string | null;
};

export type ContactResearchBriefResult = {
  seedBlock: string;
  yelpMatch: YelpMatchResult | null;
  yelpMatchError: string | null;
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
    const listingUrl = yelpBizSearchUrl(y);
    lines.push(
      'Yelp-verified business (directory evidence, not official website):',
      `Listing: ${listingUrl}`,
      `Yelp name: ${y.name}`,
      y.categories.length > 0 ? `Categories: ${y.categories.join(', ')}` : '',
      y.address1 || y.city
        ? `Address: ${[y.address1, y.city, y.state, y.postalCode].filter(Boolean).join(', ')}`
        : '',
      y.phone ? `Phone: ${y.phone}` : '',
      y.isClaimed != null ? `Claimed: ${y.isClaimed ? 'yes' : 'unclaimed'}` : '',
      y.reviewCount != null ? `Review count: ${y.reviewCount}` : '',
      y.rating != null ? `Rating: ${y.rating}` : '',
    );
    if (input.yelpMatch.viableCandidateCount > 1) {
      lines.push(
        `Note: ${input.yelpMatch.viableCandidateCount} plausible Yelp candidates — using best match above.`,
      );
    }
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
  let yelpMatchError: string | null = null;
  if (hasYelpFusionApiKey()) {
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
      } else if (matched) {
        yelpMatchError = `Yelp match confidence too low (${matched.confidence})`;
      } else {
        yelpMatchError = 'No Yelp directory match found';
      }
    } catch (err) {
      yelpMatch = null;
      yelpMatchError = err instanceof Error ? err.message : 'Yelp match failed';
    }
  } else {
    yelpMatchError = LOCAL_YELP_FUSION_KEY_HELP;
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
    yelpMatchError,
    websiteUrl,
    researchBrief: null,
  };
}
