import { generateText, stepCountIs } from 'ai';
import {
  ensureAiGatewayApiKey,
  hasAiGatewayAuth,
  LOCAL_AI_GATEWAY_AUTH_HELP,
  staffAiGateway,
  staffGatewayModel,
} from '@/lib/aiGatewayEnv';
import {
  ACCOUNT_RESEARCH_BRIEF_MAX_CHARS,
  ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE,
  ACCOUNT_RESEARCH_MODEL,
  ACCOUNT_RESEARCH_PROVIDER,
  ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT,
  type AccountResearchPlatformScope,
} from '@/lib/accountResearch/constants';
import {
  SOURCE_STRATEGIES,
  sanitizeCitationCandidates,
  type SourceSearchOutcome,
  type SourceStrategyContext,
} from '@/lib/accountResearch/sources';

type ToolHit = { url?: string; title?: string; snippet?: string; date?: string };

function extractToolHits(search: {
  toolResults?: ReadonlyArray<{ output?: unknown; result?: unknown }>;
  steps?: ReadonlyArray<{
    toolResults?: ReadonlyArray<{ output?: unknown; result?: unknown }>;
  }>;
}): ToolHit[] {
  const hits: ToolHit[] = [];

  const consume = (payload: unknown) => {
    if (!payload || typeof payload !== 'object') return;
    const obj = payload as { results?: unknown };
    if (!Array.isArray(obj.results)) return;
    for (const row of obj.results) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      hits.push({
        url: typeof r.url === 'string' ? r.url : undefined,
        title: typeof r.title === 'string' ? r.title : undefined,
        snippet:
          typeof r.snippet === 'string'
            ? r.snippet
            : typeof r.description === 'string'
              ? r.description
              : undefined,
        date:
          typeof r.date === 'string'
            ? r.date
            : typeof r.lastUpdated === 'string'
              ? r.lastUpdated
              : undefined,
      });
    }
  };

  for (const tr of search.toolResults ?? []) {
    consume(tr.output !== undefined ? tr.output : tr.result);
  }
  for (const step of search.steps ?? []) {
    for (const tr of step.toolResults ?? []) {
      consume(tr.output !== undefined ? tr.output : tr.result);
    }
  }

  return hits;
}

function sanitizeError(err: unknown): string {
  const message = err instanceof Error ? err.message : 'Provider search failed';
  return message
    .replace(/vck_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 500);
}

/**
 * Execute one platform-scoped public search via Gateway + Perplexity.
 * Captures tool citation URLs (not model-invented links).
 */
export async function executeAccountResearchSourceSearch(args: {
  sourceType: AccountResearchPlatformScope;
  ctx: SourceStrategyContext;
}): Promise<SourceSearchOutcome> {
  const strategy = SOURCE_STRATEGIES[args.sourceType];
  const queryText = strategy.buildQuery(args.ctx);
  const domainFilter = strategy.domainFilter(args.ctx);
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
      tools: {
        perplexity_search: gw.tools.perplexitySearch({
          maxResults: ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE,
          ...(domainFilter?.length ? { searchDomainFilter: domainFilter } : {}),
        }),
      },
      prompt: [
        'You research public web evidence for a wholesale apparel sales rep.',
        'Use the web search tool. Prefer tool results over invention.',
        'Do not log into social platforms or claim private content.',
        'Never invent URLs. After searching, write a short factual brief.',
        `Platform focus: ${args.sourceType}`,
        `Search query: ${queryText}`,
        `Business: ${args.ctx.businessName}`,
        args.ctx.city ? `City: ${args.ctx.city}` : '',
        args.ctx.website ? `CRM website: ${args.ctx.website}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const hits = extractToolHits(result);
    const candidates = sanitizeCitationCandidates(hits, strategy);
    const validated = strategy.postValidate(candidates, args.ctx);
    const brief = result.text?.trim().slice(0, ACCOUNT_RESEARCH_BRIEF_MAX_CHARS) || null;

    const lowerBrief = (brief ?? '').toLowerCase();
    const blocked =
      lowerBrief.includes('login wall') ||
      lowerBrief.includes('must log in') ||
      lowerBrief.includes('sign in to continue');

    return {
      status: blocked && validated.citations.length === 0 ? 'blocked' : validated.status,
      queryText,
      resolvedPublicUrl: validated.citations[0]?.url ?? null,
      brief: args.sourceType === 'website' ? brief : null,
      citations: validated.citations,
      error: null,
      providerMetadata: {
        provider: ACCOUNT_RESEARCH_PROVIDER,
        model: ACCOUNT_RESEARCH_MODEL,
        latency_ms: Date.now() - started,
        tool_hit_count: hits.length,
        result_count: validated.citations.length,
        domain_filter: domainFilter ?? null,
        step_limit: ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT,
      },
    };
  } catch (err) {
    return {
      status: 'failed',
      queryText,
      resolvedPublicUrl: null,
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
