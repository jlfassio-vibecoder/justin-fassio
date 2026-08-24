import { hostnameFromUrl } from '@/lib/enrichGuidance';
import {
  mapProspectRow,
  PROSPECT_SELECT,
  type Prospect,
  type ProspectListRow,
} from '@/lib/prospects';
import type { AccountResearchPlatformScope } from '@/lib/accountResearch/constants';
import type { AccountResearchSourceType } from '@/types/database';

/** Social platforms that require profile-first attribution. */
export const SOCIAL_PLATFORMS = [
  'instagram',
  'facebook',
  'tiktok',
  'pinterest',
] as const satisfies readonly AccountResearchSourceType[];

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export function isSocialPlatform(
  sourceType: AccountResearchPlatformScope,
): sourceType is SocialPlatform {
  return (SOCIAL_PLATFORMS as readonly string[]).includes(sourceType);
}

export type WebsiteSocialLink = {
  url: string;
  handle: string;
  source: 'html_anchor' | 'json_ld_sameAs';
};

export type RunWebsiteSocialCache = Partial<Record<SocialPlatform, WebsiteSocialLink>>;

export type AccountResearchContext = {
  businessName: string;
  address: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  website: string | null;
  territoryCode: string | null;
  territoryName: string | null;
  operationalTerritoryCode: string | null;
  operationalTerritoryName: string | null;
  officialHostname: string | null;
  provinceName: string | null;
  countryName: string | null;
};

export const ACCOUNT_RESEARCH_PROSPECT_SELECT = PROSPECT_SELECT;

export function buildAccountResearchContext(args: {
  prospect: Prospect;
  resolvedWebsite?: string | null;
}): AccountResearchContext {
  const officialHostname = args.resolvedWebsite
    ? hostnameFromUrl(args.resolvedWebsite)
    : args.prospect.website
      ? hostnameFromUrl(args.prospect.website)
      : null;

  const territoryCode = args.prospect.territoryCode?.toLowerCase() ?? null;
  const provinceName =
    args.prospect.territoryName ?? args.prospect.operationalTerritoryName ?? null;
  const countryName =
    territoryCode === 'bc' ||
    territoryCode === 'ab' ||
    territoryCode === 'sk' ||
    territoryCode === 'mb'
      ? 'Canada'
      : territoryCode === 'or' || territoryCode === 'wa' || territoryCode === 'ca'
        ? 'United States'
        : provinceName === 'British Columbia'
          ? 'Canada'
          : null;

  return {
    businessName: args.prospect.name,
    address: args.prospect.address || null,
    city: args.prospect.city || null,
    region: args.prospect.region || null,
    phone: args.prospect.phone || null,
    website: args.prospect.website || null,
    territoryCode: args.prospect.territoryCode,
    territoryName: args.prospect.territoryName,
    operationalTerritoryCode: args.prospect.operationalTerritoryCode,
    operationalTerritoryName: args.prospect.operationalTerritoryName,
    officialHostname,
    provinceName,
    countryName,
  };
}

export function mapProspectRowForResearch(row: ProspectListRow): Prospect {
  return mapProspectRow(row);
}

export type ShopifyEvidence = {
  found: boolean;
  evidenceUrl: string | null;
};

export type SocialEmptyOutcome = 'no_profile' | 'no_activity';

export type SocialSourceMetadata = {
  profile_handle?: string | null;
  resolution_method?: 'website_html_link' | 'profile_search' | 'staff_lock' | null;
  empty_outcome?: SocialEmptyOutcome | null;
  profile_query?: string | null;
  activity_query?: string | null;
  website_fetch_url?: string | null;
};

export function readWebsiteSocialCache(
  providerMetadata: Record<string, unknown> | null | undefined,
): RunWebsiteSocialCache {
  const raw = providerMetadata?.website_social_links;
  if (!raw || typeof raw !== 'object') return {};
  return raw as RunWebsiteSocialCache;
}

export function mergeWebsiteSocialCache(
  existing: Record<string, unknown> | null | undefined,
  links: RunWebsiteSocialCache,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    website_social_links: links,
    website_social_links_fetched_at: new Date().toISOString(),
  };
}

export function readWebsiteShopifyEvidence(
  providerMetadata: Record<string, unknown> | null | undefined,
): ShopifyEvidence | null {
  const raw = providerMetadata?.website_shopify_evidence;
  if (!raw || typeof raw !== 'object') return null;
  return raw as ShopifyEvidence;
}

export function mergeWebsiteShopifyEvidence(
  existing: Record<string, unknown> | null | undefined,
  evidence: ShopifyEvidence,
): Record<string, unknown> {
  return {
    ...(existing ?? {}),
    website_shopify_evidence: evidence,
  };
}
