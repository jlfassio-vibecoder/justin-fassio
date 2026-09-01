import {
  ensureAiGatewayApiKey,
  hasAiGatewayAuth,
  LOCAL_AI_GATEWAY_AUTH_HELP,
  staffAiGateway,
  staffGatewayModel,
} from '@/lib/aiGatewayEnv';
import {
  ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE,
  ACCOUNT_RESEARCH_MODEL,
  ACCOUNT_RESEARCH_PROVIDER,
  ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT,
} from '@/lib/accountResearch/constants';
import type {
  AccountResearchContext,
  RunWebsiteSocialCache,
  SocialEmptyOutcome,
  SocialPlatform,
  SocialSourceMetadata,
} from '@/lib/accountResearch/context';
import { type SearchCandidate } from '@/lib/accountResearch/candidates';
import { normalizeSourceUrl } from '@/lib/accountResearch/normalizeUrl';
import { buildForcedExaSearchPrompt } from '@/lib/accountResearch/searchPrompt';
import {
  attributePostToConfirmedProfile,
  buildSocialSearchQuery,
  canonicalizeSocialProfileUrl,
  extractHandleFromLockedUrl,
  socialSearchDomainFilter,
  type ConfirmedProfile,
} from '@/lib/accountResearch/socialProfile';
import {
  hostFromUrl,
  lockedSourceUrlCitation,
  sanitizeCitationCandidates,
  type CitationCandidate,
  type SourceSearchOutcome,
} from '@/lib/accountResearch/sources';
import { extractSearchToolHits, type ToolHit } from '@/lib/accountResearch/toolHits';
import { generateText, stepCountIs } from 'ai';

export type SocialSearchOutcome = SourceSearchOutcome & {
  confirmedProfile: ConfirmedProfile | null;
  socialMetadata: SocialSourceMetadata;
};

function mapPlatform(platform: SocialPlatform): CitationCandidate['platform'] {
  return platform;
}

function userLocationFromCtx(ctx: AccountResearchContext): string | undefined {
  if (ctx.countryName === 'Canada') return 'CA';
  if (ctx.countryName === 'United States') return 'US';
  return undefined;
}

async function runExaSearch(args: {
  platform: SocialPlatform;
  queryText: string;
  ctx: AccountResearchContext;
}): Promise<ToolHit[]> {
  ensureAiGatewayApiKey();
  if (!hasAiGatewayAuth()) return [];

  const gw = staffAiGateway();
  const model = staffGatewayModel(ACCOUNT_RESEARCH_MODEL);
  const includeDomains = socialSearchDomainFilter(args.platform);
  const userLocation = userLocationFromCtx(args.ctx);
  const result = await generateText({
    model,
    stopWhen: stepCountIs(ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT),
    tools: {
      exa_search: gw.tools.exaSearch({
        numResults: ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE,
        type: 'auto',
        includeDomains,
        ...(userLocation ? { userLocation } : {}),
        contents: {
          text: { maxCharacters: 500 },
          highlights: true,
        },
      }),
    },
    prompt: buildForcedExaSearchPrompt({
      queryText: args.queryText,
      platformFocus: args.platform,
      extraLines: [
        'Return official business profile/page URLs only.',
        'Ignore Facebook Marketplace, Groups, Watch, and unrelated city posts.',
      ],
    }),
  });
  return extractSearchToolHits(result);
}

function hitsToCandidates(hits: ToolHit[], platform: SocialPlatform): CitationCandidate[] {
  const strategy = {
    mapPlatform: () => mapPlatform(platform),
  };
  return sanitizeCitationCandidates(hits, strategy as never);
}

function providerBase(started: number, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    provider: ACCOUNT_RESEARCH_PROVIDER,
    model: ACCOUNT_RESEARCH_MODEL,
    latency_ms: Date.now() - started,
    ...extra,
  };
}

function emptySocialOutcome(args: {
  queryText: string;
  emptyOutcome: SocialEmptyOutcome;
  profile: ConfirmedProfile | null;
  socialMetadata: SocialSourceMetadata;
  started: number;
  resolvedPublicUrl?: string | null;
  citations?: CitationCandidate[];
  candidates?: SearchCandidate[];
  status?: SourceSearchOutcome['status'];
}): SocialSearchOutcome {
  return {
    status: args.status ?? 'none_indexed',
    queryText: args.queryText,
    resolvedPublicUrl: args.resolvedPublicUrl ?? args.profile?.profileUrl ?? null,
    brief: null,
    citations: args.citations ?? [],
    error: null,
    confirmedProfile: args.profile,
    socialMetadata: {
      ...args.socialMetadata,
      empty_outcome: args.emptyOutcome,
    },
    providerMetadata: providerBase(args.started, {
      result_count: args.citations?.length ?? 0,
      empty_outcome: args.emptyOutcome,
      ...(args.candidates ? { candidates: args.candidates } : {}),
      ...args.socialMetadata,
    }),
  };
}

async function executeLockedSocialSearch(args: {
  platform: SocialPlatform;
  ctx: AccountResearchContext;
  lockedUrl: string;
  started: number;
}): Promise<SocialSearchOutcome> {
  const searchQuery = buildSocialSearchQuery(args.platform, args.ctx.businessName);
  const normalizedLock = normalizeSourceUrl(args.lockedUrl) ?? args.lockedUrl;
  const handle = extractHandleFromLockedUrl(args.platform, normalizedLock);
  const profile: ConfirmedProfile | null = handle
    ? {
        profileUrl: normalizedLock,
        handle,
        resolutionMethod: 'staff_lock',
      }
    : null;

  const socialMetadata: SocialSourceMetadata = {
    profile_query: searchQuery,
    activity_query: searchQuery,
    resolution_method: 'staff_lock',
    profile_handle: handle,
  };

  const lockedCitation = lockedSourceUrlCitation(normalizedLock, args.platform);

  if (!profile) {
    return emptySocialOutcome({
      queryText: searchQuery,
      emptyOutcome: 'no_activity',
      profile: null,
      socialMetadata,
      started: args.started,
      resolvedPublicUrl: normalizedLock,
      citations: lockedCitation ? [lockedCitation] : [],
      status: 'succeeded',
    });
  }

  const activityHits = await runExaSearch({
    platform: args.platform,
    queryText: searchQuery,
    ctx: args.ctx,
  });
  const candidates = hitsToCandidates(activityHits, args.platform);
  const verified: CitationCandidate[] = [];
  const seen = new Set<string>();

  if (lockedCitation) {
    verified.push(lockedCitation);
    seen.add(lockedCitation.url);
  }

  for (const candidate of candidates) {
    if (verified.length >= ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE) break;
    const host = hostFromUrl(candidate.url);
    if (!host) continue;
    const attribution = attributePostToConfirmedProfile(
      args.platform,
      candidate.url,
      profile.handle,
    );
    if (!attribution.verified) continue;
    if (seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    verified.push({
      ...candidate,
      platform: args.platform,
      confidence: 'medium',
    });
  }

  if (
    verified.length === 0 ||
    (verified.length === 1 && verified[0]?.url === lockedCitation?.url)
  ) {
    const posts = verified.filter((c) => c.url !== lockedCitation?.url);
    if (posts.length === 0) {
      return {
        status: 'succeeded',
        queryText: searchQuery,
        resolvedPublicUrl: normalizedLock,
        brief: null,
        citations: verified,
        error: null,
        confirmedProfile: profile,
        socialMetadata: { ...socialMetadata, empty_outcome: 'no_activity' },
        providerMetadata: providerBase(args.started, {
          tool_hit_count: activityHits.length,
          result_count: verified.length,
          empty_outcome: 'no_activity',
          ...socialMetadata,
        }),
      };
    }
  }

  return {
    status: 'succeeded',
    queryText: searchQuery,
    resolvedPublicUrl: normalizedLock,
    brief: null,
    citations: verified,
    error: null,
    confirmedProfile: profile,
    socialMetadata,
    providerMetadata: providerBase(args.started, {
      tool_hit_count: activityHits.length,
      result_count: verified.length,
      ...socialMetadata,
    }),
  };
}

export async function executeSocialPlatformSearch(args: {
  platform: SocialPlatform;
  ctx: AccountResearchContext;
  websiteSocialLinks: RunWebsiteSocialCache;
  lockedUrl?: string | null;
}): Promise<SocialSearchOutcome> {
  const started = Date.now();
  const socialMetadata: SocialSourceMetadata = {};

  ensureAiGatewayApiKey();
  if (!hasAiGatewayAuth()) {
    return {
      status: 'failed',
      queryText: '',
      resolvedPublicUrl: null,
      brief: null,
      citations: [],
      error: LOCAL_AI_GATEWAY_AUTH_HELP,
      confirmedProfile: null,
      socialMetadata,
      providerMetadata: {
        provider: ACCOUNT_RESEARCH_PROVIDER,
        model: ACCOUNT_RESEARCH_MODEL,
      },
    };
  }

  if (args.lockedUrl) {
    return executeLockedSocialSearch({
      platform: args.platform,
      ctx: args.ctx,
      lockedUrl: args.lockedUrl,
      started,
    });
  }

  // Discovery is scrape-based only now — no independent Exa search. The
  // locked official website is the sole source of truth for what a
  // business's social channels are; if it doesn't link one, none_indexed.
  const searchQuery = buildSocialSearchQuery(args.platform, args.ctx.businessName);
  socialMetadata.profile_query = searchQuery;
  socialMetadata.activity_query = searchQuery;

  const websiteLink = args.websiteSocialLinks[args.platform];
  let candidates: SearchCandidate[] = [];
  if (websiteLink?.url) {
    const canonical =
      canonicalizeSocialProfileUrl(args.platform, websiteLink.url) ?? websiteLink.url;
    candidates = [
      {
        rank: 1,
        url: canonical,
        title: 'Official website link',
        snippet:
          websiteLink.source === 'json_ld_sameAs' ? 'JSON-LD sameAs' : 'Website footer/header',
      },
    ];
    socialMetadata.resolution_method = 'website_html_link';
  }

  if (candidates.length === 0) {
    return emptySocialOutcome({
      queryText: searchQuery,
      emptyOutcome: 'no_profile',
      profile: null,
      socialMetadata: {
        ...socialMetadata,
        resolution_method: null,
        profile_handle: null,
      },
      started,
      candidates: [],
    });
  }

  return {
    status: 'succeeded',
    queryText: searchQuery,
    resolvedPublicUrl: null,
    brief: null,
    citations: [],
    error: null,
    confirmedProfile: null,
    socialMetadata,
    providerMetadata: providerBase(started, {
      result_count: 0,
      candidates,
      source: 'website_scrape',
      ...socialMetadata,
    }),
  };
}
