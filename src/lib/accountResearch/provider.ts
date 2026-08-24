import { generateText, stepCountIs } from 'ai';
import {
  ensureAiGatewayApiKey,
  hasAiGatewayAuth,
  LOCAL_AI_GATEWAY_AUTH_HELP,
  staffAiGateway,
  staffGatewayModel,
} from '@/lib/aiGatewayEnv';
import { hostnameFromUrl } from '@/lib/enrichGuidance';
import {
  ACCOUNT_RESEARCH_BRIEF_MAX_CHARS,
  ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE,
  ACCOUNT_RESEARCH_MODEL,
  ACCOUNT_RESEARCH_PROVIDER,
  ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT,
  type AccountResearchPlatformScope,
} from '@/lib/accountResearch/constants';
import type { AccountResearchContext, RunWebsiteSocialCache } from '@/lib/accountResearch/context';
import { isSocialPlatform } from '@/lib/accountResearch/context';
import { toSearchCandidates, toWebsiteSearchCandidates } from '@/lib/accountResearch/candidates';
import { normalizeSourceUrl } from '@/lib/accountResearch/normalizeUrl';
import { buildForcedExaSearchPrompt } from '@/lib/accountResearch/searchPrompt';
import { executeSocialPlatformSearch } from '@/lib/accountResearch/socialSourceSearch';
import {
  citationsOnLockedHost,
  lockedSourceUrlCitation,
  sanitizeCitationCandidates,
  SOURCE_STRATEGIES,
  type CitationCandidate,
  type SourceSearchOutcome,
} from '@/lib/accountResearch/sources';
import { extractSearchToolHits } from '@/lib/accountResearch/toolHits';
import { isDirectoryCitationHost, WEBSITE_SEARCH_EXCLUDE_DOMAINS } from '@/lib/companyWebResearch';

function userLocationFromCtx(ctx: AccountResearchContext): string | undefined {
  if (ctx.countryName === 'Canada') return 'CA';
  if (ctx.countryName === 'United States') return 'US';
  return undefined;
}

/**
 * Pull the `query` argument the model actually sent to exa_search.
 *
 * `gw.tools.exaSearch()`'s config only accepts defaults (type, numResults,
 * userLocation, includeDomains/excludeDomains, contents, …) — it has no
 * `query` field, so nothing in this file can force the search string. The
 * model always authors `query` itself for this tool call, guided only by
 * the prompt text. This is captured for observability so a bad candidate
 * list can be diagnosed against what was actually searched, not just what
 * we intended to search.
 */
function extractModelIssuedQuery(search: {
  toolCalls?: ReadonlyArray<{ toolName?: string; input?: unknown }>;
  steps?: ReadonlyArray<{ toolCalls?: ReadonlyArray<{ toolName?: string; input?: unknown }> }>;
}): string | null {
  const calls = [
    ...(search.toolCalls ?? []),
    ...(search.steps ?? []).flatMap((s) => s.toolCalls ?? []),
  ];
  for (const call of calls) {
    if (call.toolName !== 'exa_search') continue;
    const input = call.input;
    if (
      input &&
      typeof input === 'object' &&
      typeof (input as { query?: unknown }).query === 'string'
    ) {
      return (input as { query: string }).query;
    }
  }
  return null;
}

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Provider search failed';
  return message
    .replace(/vck_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}

function withLockedUrlCitation(
  citations: CitationCandidate[],
  lockedUrl: string,
  platform: CitationCandidate['platform'],
): CitationCandidate[] {
  const locked = lockedSourceUrlCitation(lockedUrl, platform);
  if (!locked) return citations;
  if (citations.some((c) => c.url === locked.url)) return citations;
  return [locked, ...citations].slice(0, ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE);
}

/**
 * Execute one platform-scoped public search via Gateway + Exa.
 * Unlocked: persist top 5 search hits as candidates; do not auto-resolve a URL.
 * Locked: skip discovery and index activity from the staff-locked URL only.
 */
export async function executeAccountResearchSourceSearch(args: {
  sourceType: AccountResearchPlatformScope;
  ctx: AccountResearchContext;
  websiteSocialLinks?: RunWebsiteSocialCache;
  lockedUrl?: string | null;
}): Promise<SourceSearchOutcome> {
  if (isSocialPlatform(args.sourceType)) {
    return executeSocialPlatformSearch({
      platform: args.sourceType,
      ctx: args.ctx,
      websiteSocialLinks: args.websiteSocialLinks ?? {},
      lockedUrl: args.lockedUrl,
    });
  }

  const strategy = SOURCE_STRATEGIES[args.sourceType];
  const queryText = strategy.buildQuery(args.ctx);
  const lockedUrl = args.lockedUrl ? (normalizeSourceUrl(args.lockedUrl) ?? args.lockedUrl) : null;
  const lockedHost = lockedUrl ? hostnameFromUrl(lockedUrl) : null;
  const includeDomains = lockedHost ? [lockedHost] : undefined;
  const excludeDomains =
    !lockedHost && args.sourceType === 'website' ? WEBSITE_SEARCH_EXCLUDE_DOMAINS : undefined;
  // Do not pass userLocation on website discovery — geo bias returns peer businesses in the city.
  const userLocation =
    args.sourceType === 'website' && !lockedUrl ? undefined : userLocationFromCtx(args.ctx);
  const websiteDiscovery = args.sourceType === 'website' && !lockedUrl;
  const started = Date.now();

  ensureAiGatewayApiKey();
  if (!hasAiGatewayAuth()) {
    return {
      status: 'failed',
      queryText,
      resolvedPublicUrl: null,
      brief: null,
      citations: [],
      error: LOCAL_AI_GATEWAY_AUTH_HELP,
      providerMetadata: {
        provider: ACCOUNT_RESEARCH_PROVIDER,
        model: ACCOUNT_RESEARCH_MODEL,
      },
    };
  }

  try {
    const gw = staffAiGateway();
    const model = staffGatewayModel(ACCOUNT_RESEARCH_MODEL);
    const result = await generateText({
      model,
      stopWhen: stepCountIs(ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT),
      // Force a search. The `query` argument is authored by the model, not this
      // config — gw.tools.exaSearch() has no field to pin it (see
      // extractModelIssuedQuery below) — so the prompt is the only lever.
      toolChoice: 'required',
      tools: {
        exa_search: gw.tools.exaSearch({
          // Website: over-fetch then name-filter to top 5.
          numResults: websiteDiscovery ? 10 : ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE,
          type: 'auto',
          ...(userLocation ? { userLocation } : {}),
          ...(includeDomains?.length ? { includeDomains } : {}),
          ...(excludeDomains?.length ? { excludeDomains } : {}),
          contents: {
            text: { maxCharacters: 800 },
            highlights: true,
            extras: { links: websiteDiscovery ? 8 : 5 },
          },
        }),
      },
      prompt: buildForcedExaSearchPrompt({
        queryText,
        platformFocus: args.sourceType,
        extraLines: [
          lockedUrl
            ? `Staff-locked URL: ${lockedUrl}. Prefer evidence on that host only.`
            : args.sourceType === 'website'
              ? [
                  `Exact business name: "${args.ctx.businessName.trim()}".`,
                  'Only keep results whose title or domain matches this exact business name.',
                  'Reject similarly named competitors in the same city or industry.',
                  'Ignore directories, chambers, LinkedIn, Facebook, tee-time aggregators, Yellow Pages, and Yelp.',
                ].join(' ')
              : args.sourceType === 'shopify'
                ? 'Prefer myshopify.com storefronts or Powered-by-Shopify evidence.'
                : '',
          args.ctx.website && !isDirectoryCitationHost(hostnameFromUrl(args.ctx.website))
            ? `CRM website hint: ${args.ctx.website}`
            : '',
          websiteDiscovery
            ? 'After searching, write a short factual brief from tool results only.'
            : '',
        ],
      }),
    });

    const hits = extractSearchToolHits(result);
    const modelQuery = extractModelIssuedQuery(result);
    const brief = result.text?.trim().slice(0, ACCOUNT_RESEARCH_BRIEF_MAX_CHARS) || null;
    const lowerBrief = (brief ?? '').toLowerCase();
    const blocked =
      lowerBrief.includes('login wall') ||
      lowerBrief.includes('must log in') ||
      lowerBrief.includes('sign in to continue');

    if (!lockedUrl) {
      const candidates =
        args.sourceType === 'website'
          ? toWebsiteSearchCandidates(args.ctx.businessName, hits)
          : toSearchCandidates(hits);
      return {
        status:
          blocked && candidates.length === 0
            ? 'blocked'
            : candidates.length > 0
              ? 'succeeded'
              : 'none_indexed',
        queryText,
        resolvedPublicUrl: null,
        brief: args.sourceType === 'website' ? brief : null,
        citations: [],
        error: null,
        providerMetadata: {
          provider: ACCOUNT_RESEARCH_PROVIDER,
          model: ACCOUNT_RESEARCH_MODEL,
          latency_ms: Date.now() - started,
          tool_hit_count: hits.length,
          result_count: 0,
          candidates,
          include_domains: includeDomains ?? null,
          exclude_domains: excludeDomains ?? null,
          step_limit: ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT,
          model_query: modelQuery,
        },
      };
    }

    const rawCitations = sanitizeCitationCandidates(hits, strategy);
    const onHost = citationsOnLockedHost(rawCitations, lockedUrl);
    const citations = withLockedUrlCitation(onHost, lockedUrl, args.sourceType);

    return {
      status: blocked && citations.length === 0 ? 'blocked' : 'succeeded',
      queryText,
      resolvedPublicUrl: lockedUrl,
      brief: args.sourceType === 'website' ? brief : null,
      citations,
      error: null,
      providerMetadata: {
        provider: ACCOUNT_RESEARCH_PROVIDER,
        model: ACCOUNT_RESEARCH_MODEL,
        latency_ms: Date.now() - started,
        tool_hit_count: hits.length,
        result_count: citations.length,
        include_domains: includeDomains ?? null,
        exclude_domains: excludeDomains ?? null,
        step_limit: ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT,
        locked_url: lockedUrl,
        model_query: modelQuery,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      queryText,
      resolvedPublicUrl: lockedUrl,
      brief: null,
      citations: [],
      error: sanitizeError(err),
      providerMetadata: {
        provider: ACCOUNT_RESEARCH_PROVIDER,
        model: ACCOUNT_RESEARCH_MODEL,
        latency_ms: Date.now() - started,
      },
    };
  }
}
