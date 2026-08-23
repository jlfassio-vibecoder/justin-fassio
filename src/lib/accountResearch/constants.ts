import type { AccountResearchRequestedScope, AccountResearchSourceType } from '@/types/database';

/** v1 API scopes (subset of schema CHECK). */
export const ACCOUNT_RESEARCH_V1_SCOPES = [
  'all',
  'website',
  'shopify',
  'instagram',
  'facebook',
  'tiktok',
  'pinterest',
] as const;

export type AccountResearchV1Scope = (typeof ACCOUNT_RESEARCH_V1_SCOPES)[number];

export const ACCOUNT_RESEARCH_PLATFORM_SCOPES = [
  'website',
  'shopify',
  'instagram',
  'facebook',
  'tiktok',
  'pinterest',
] as const satisfies readonly AccountResearchSourceType[];

export type AccountResearchPlatformScope = (typeof ACCOUNT_RESEARCH_PLATFORM_SCOPES)[number];

export const ACCOUNT_RESEARCH_FRESHNESS_DAYS = 7;
export const ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE = 5;
export const ACCOUNT_RESEARCH_EXCERPT_MAX_CHARS = 500;
export const ACCOUNT_RESEARCH_MANUAL_RUNS_PER_DAY = 3;
export const ACCOUNT_RESEARCH_PROVIDER_STEP_LIMIT = 4;
export const ACCOUNT_RESEARCH_STALE_RUNNING_MS = 120_000;
export const ACCOUNT_RESEARCH_BRIEF_MAX_CHARS = 4000;
export const ACCOUNT_RESEARCH_PROVIDER = 'perplexity_via_gateway';
export const ACCOUNT_RESEARCH_MODEL = 'openai/gpt-4o';

export function isAccountResearchV1Scope(value: unknown): value is AccountResearchV1Scope {
  return (
    typeof value === 'string' && (ACCOUNT_RESEARCH_V1_SCOPES as readonly string[]).includes(value)
  );
}

export function isAccountResearchPlatformScope(
  value: unknown,
): value is AccountResearchPlatformScope {
  return (
    typeof value === 'string' &&
    (ACCOUNT_RESEARCH_PLATFORM_SCOPES as readonly string[]).includes(value)
  );
}

export function scopesForRequested(scope: AccountResearchV1Scope): AccountResearchPlatformScope[] {
  if (scope === 'all') return [...ACCOUNT_RESEARCH_PLATFORM_SCOPES];
  return [scope];
}

export function toRequestedScope(scope: AccountResearchV1Scope): AccountResearchRequestedScope {
  return scope;
}
