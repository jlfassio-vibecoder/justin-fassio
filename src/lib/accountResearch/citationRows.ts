import type { AccountResearchIdentityConfidence } from '@/types/database';
import { normalizeSourceUrl } from '@/lib/accountResearch/normalizeUrl';
import type { CitationCandidate } from '@/lib/accountResearch/sources';

export type SourceCitationRow = {
  source_url: string;
  source_url_normalized: string;
  title: string | null;
  platform: CitationCandidate['platform'];
  published_at: string | null;
  observed_at: string;
  excerpt: string | null;
  confidence: CitationCandidate['confidence'];
  identity_confidence: AccountResearchIdentityConfidence;
  acceptance_status: 'accepted' | 'pending';
  acceptance_basis: 'staff' | 'confirmed_profile' | 'identity_gate' | null;
  provider_metadata: Record<string, unknown>;
};

export function mapOutcomeCitations(args: {
  citations: CitationCandidate[];
  isSocial: boolean;
  lockedUrl: string | null;
  identityConfidence: AccountResearchIdentityConfidence;
  attributedHandle?: string | null;
}): SourceCitationRow[] {
  const normalizedLock = args.lockedUrl
    ? (normalizeSourceUrl(args.lockedUrl) ?? args.lockedUrl)
    : null;
  const observedAt = new Date().toISOString();

  return args.citations.map((c) => {
    const base = {
      source_url: c.url,
      source_url_normalized: c.url,
      title: c.title,
      platform: c.platform,
      published_at: c.publishedAt,
      observed_at: observedAt,
      excerpt: c.excerpt,
      confidence: c.confidence,
      identity_confidence: args.identityConfidence,
    };

    if (args.isSocial && normalizedLock) {
      return {
        ...base,
        acceptance_status: 'accepted' as const,
        acceptance_basis:
          c.url === normalizedLock ? ('staff' as const) : ('confirmed_profile' as const),
        provider_metadata: args.attributedHandle
          ? { attributed_handle: args.attributedHandle }
          : {},
      };
    }

    if (normalizedLock) {
      return {
        ...base,
        acceptance_status: 'accepted' as const,
        acceptance_basis: 'staff' as const,
        provider_metadata: {},
      };
    }

    return {
      ...base,
      acceptance_status: 'pending' as const,
      acceptance_basis: null,
      provider_metadata: {},
    };
  });
}
