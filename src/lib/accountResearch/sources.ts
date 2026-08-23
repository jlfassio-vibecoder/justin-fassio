import { z } from 'zod';
import type { AccountResearchPlatformScope } from '@/lib/accountResearch/constants';
import {
  ACCOUNT_RESEARCH_EXCERPT_MAX_CHARS,
  ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE,
} from '@/lib/accountResearch/constants';
import { normalizeSourceUrl, truncateExcerpt } from '@/lib/accountResearch/normalizeUrl';
import type {
  AccountResearchCitationPlatform,
  AccountResearchConfidence,
  AccountResearchSourceSearchStatus,
} from '@/types/database';

export const citationCandidateSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  platform: z.enum([
    'website',
    'shopify',
    'instagram',
    'facebook',
    'tiktok',
    'pinterest',
    'linkedin',
    'youtube',
    'x',
    'other',
    'directory',
  ]),
  excerpt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type CitationCandidate = z.infer<typeof citationCandidateSchema>;

export type SourceSearchOutcome = {
  status: Extract<
    AccountResearchSourceSearchStatus,
    'succeeded' | 'none_indexed' | 'blocked' | 'failed'
  >;
  queryText: string;
  resolvedPublicUrl: string | null;
  brief: string | null;
  citations: CitationCandidate[];
  error: string | null;
  providerMetadata: Record<string, unknown>;
};

export type SourceStrategyContext = {
  businessName: string;
  city?: string | null;
  region?: string | null;
  website?: string | null;
  officialHostname?: string | null;
};

export type SourceStrategy = {
  sourceType: AccountResearchPlatformScope;
  buildQuery: (ctx: SourceStrategyContext) => string;
  domainFilter: (ctx: SourceStrategyContext) => string[] | undefined;
  mapPlatform: (urlHost: string) => AccountResearchCitationPlatform;
  postValidate: (
    citations: CitationCandidate[],
    ctx: SourceStrategyContext,
  ) => { status: SourceSearchOutcome['status']; citations: CitationCandidate[] };
};

const PLATFORM_HOSTS: Record<
  Exclude<AccountResearchPlatformScope, 'website' | 'shopify'>,
  string[]
> = {
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
  tiktok: ['tiktok.com'],
  pinterest: ['pinterest.com'],
};

function hostMatches(host: string, suffixes: string[]): boolean {
  const h = host.toLowerCase();
  return suffixes.some((s) => h === s || h.endsWith(`.${s}`));
}

export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function normalizePublishedAt(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

function isShopifyEvidenceUrl(url: string): boolean {
  const host = hostFromUrl(url);
  if (!host) return false;
  if (host.endsWith('.myshopify.com') || host === 'myshopify.com') return true;
  if (host.includes('cdn.shopify.com') || host.includes('shopifycdn.com')) return true;
  return false;
}

export const websiteStrategy: SourceStrategy = {
  sourceType: 'website',
  buildQuery: (ctx) => {
    const parts = [
      `"${ctx.businessName}"`,
      ctx.city ? ctx.city : null,
      'official website About Shop Brands Collections Contact',
    ];
    if (ctx.officialHostname) parts.push(`site:${ctx.officialHostname}`);
    else if (ctx.website) parts.push(ctx.website);
    return parts.filter(Boolean).join(' ');
  },
  domainFilter: (ctx) => (ctx.officialHostname ? [ctx.officialHostname] : undefined),
  mapPlatform: () => 'website',
  postValidate: (citations) => {
    if (citations.length === 0) return { status: 'none_indexed', citations: [] };
    return { status: 'succeeded', citations };
  },
};

export const shopifyStrategy: SourceStrategy = {
  sourceType: 'shopify',
  buildQuery: (ctx) =>
    [
      `"${ctx.businessName}"`,
      ctx.officialHostname ?? ctx.website ?? '',
      'Shopify storefront myshopify collections',
    ]
      .filter(Boolean)
      .join(' '),
  domainFilter: (ctx) => (ctx.officialHostname ? [ctx.officialHostname] : undefined),
  mapPlatform: (host) =>
    host.endsWith('myshopify.com') || host.includes('shopify') ? 'shopify' : 'website',
  postValidate: (citations) => {
    const withEvidence = citations.filter(
      (c) => isShopifyEvidenceUrl(c.url) || c.platform === 'shopify',
    );
    // Require at least one cited Shopify evidence URL — not model guess alone.
    const hasEvidence = withEvidence.some((c) => isShopifyEvidenceUrl(c.url));
    if (!hasEvidence) return { status: 'none_indexed', citations: [] };
    return {
      status: 'succeeded',
      citations: withEvidence.map((c) => ({ ...c, platform: 'shopify' as const })),
    };
  },
};

function socialStrategy(
  sourceType: Exclude<AccountResearchPlatformScope, 'website' | 'shopify'>,
): SourceStrategy {
  const hosts = PLATFORM_HOSTS[sourceType];
  return {
    sourceType,
    buildQuery: (ctx) =>
      [`"${ctx.businessName}"`, ctx.city ?? null, `site:${hosts[0]}`].filter(Boolean).join(' '),
    domainFilter: () => hosts,
    mapPlatform: () => sourceType,
    postValidate: (citations) => {
      const filtered = citations.filter((c) => {
        const host = hostFromUrl(c.url);
        return host ? hostMatches(host, hosts) : false;
      });
      if (filtered.length === 0) return { status: 'none_indexed', citations: [] };
      return {
        status: 'succeeded',
        citations: filtered.map((c) => ({ ...c, platform: sourceType })),
      };
    },
  };
}

export const SOURCE_STRATEGIES: Record<AccountResearchPlatformScope, SourceStrategy> = {
  website: websiteStrategy,
  shopify: shopifyStrategy,
  instagram: socialStrategy('instagram'),
  facebook: socialStrategy('facebook'),
  tiktok: socialStrategy('tiktok'),
  pinterest: socialStrategy('pinterest'),
};

export function sanitizeCitationCandidates(
  raw: ReadonlyArray<{
    url?: string;
    title?: string | null;
    snippet?: string | null;
    date?: string | null;
  }>,
  strategy: SourceStrategy,
  confidence: AccountResearchConfidence = 'medium',
): CitationCandidate[] {
  const out: CitationCandidate[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (out.length >= ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE) break;
    const url = item.url?.trim();
    if (!url) continue;
    const normalized = normalizeSourceUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    const host = hostFromUrl(normalized);
    if (!host) continue;

    const parsed = citationCandidateSchema.safeParse({
      url: normalized,
      title: item.title?.trim() || null,
      platform: strategy.mapPlatform(host),
      excerpt: truncateExcerpt(item.snippet, ACCOUNT_RESEARCH_EXCERPT_MAX_CHARS),
      publishedAt: normalizePublishedAt(item.date),
      confidence,
    });
    if (!parsed.success) continue;
    out.push(parsed.data);
  }

  return out;
}
