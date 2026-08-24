import { ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE } from '@/lib/accountResearch/constants';
import type { SocialPlatform } from '@/lib/accountResearch/context';
import { normalizeSourceUrl, truncateExcerpt } from '@/lib/accountResearch/normalizeUrl';
import {
  canonicalizeSocialProfileUrl,
  scoreSocialCandidateForBusiness,
} from '@/lib/accountResearch/socialProfile';
import { isDirectoryCitationHost } from '@/lib/companyWebResearch';

export type SearchCandidate = {
  rank: number;
  url: string;
  title: string | null;
  snippet: string | null;
};

function candidateHost(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Pure connective/legal filler — never appears on a real business's own site as
 * an identifier, so it's safe to drop from the required match set.
 *
 * Category words (golf, club, resort, hotel, shop, store, …) are deliberately
 * KEPT out of this list, unlike an earlier version of this filter. Stripping
 * them left only the place-name tokens (e.g. "black" + "mountain") as the
 * entire match requirement, which let an unrelated business sharing that place
 * name (e.g. "Black Mountain Distillery") pass the gate for a CRM entry named
 * "Black Mountain Golf Club" and outrank the real site. Real official sites
 * almost always carry the category word in their title even when the domain
 * abbreviates it, so requiring it costs little recall while fixing precision.
 */
const WEBSITE_NAME_FILLER_WORDS = new Set(['the', 'and', 'llc', 'inc', 'ltd', 'company']);

/** Meaningful tokens from the CRM business name (e.g. black + mountain + golf + club). */
export function websiteNameMatchTokens(businessName: string): string[] {
  return businessName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !WEBSITE_NAME_FILLER_WORDS.has(t));
}

function compactAlnum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** True when host or title clearly refers to this business — not a peer in the same city. */
export function websiteCandidateMatchesBusinessName(
  businessName: string,
  candidate: { url: string; title: string | null; snippet?: string | null },
): boolean {
  const tokens = websiteNameMatchTokens(businessName);
  const host = candidateHost(candidate.url) ?? '';
  const compactHost = compactAlnum(host);
  const title = (candidate.title ?? '').toLowerCase();
  const compactTitle = compactAlnum(title);
  const hay = `${compactHost} ${title}`;

  if (tokens.length === 0) {
    const compactName = compactAlnum(businessName);
    if (compactName.length < 4) return true;
    return compactHost.includes(compactName) || compactTitle.includes(compactName);
  }

  return tokens.every((t) => hay.includes(t) || compactHost.includes(t));
}

function scoreWebsiteCandidate(
  businessName: string,
  candidate: { url: string; title: string | null; snippet: string | null },
): number {
  if (!websiteCandidateMatchesBusinessName(businessName, candidate)) return -1;
  const host = candidateHost(candidate.url) ?? '';
  const tokens = websiteNameMatchTokens(businessName);
  const compactHost = compactAlnum(host);
  const hay = `${candidate.title ?? ''} ${candidate.snippet ?? ''}`.toLowerCase();
  let score = tokens.filter((t) => compactHost.includes(t)).length * 3;
  score += tokens.filter((t) => hay.includes(t)).length;
  try {
    const path = new URL(candidate.url).pathname;
    if (path === '/' || path === '') score += 2;
  } catch {
    /* ignore */
  }
  return score;
}

/** Pull bare www.example.com / https://example.com mentions out of SERP text. */
export function extractUrlsFromSerpText(text: string): string[] {
  if (!text.trim()) return [];
  const out: string[] = [];
  const patterns = [
    /\bhttps?:\/\/[^\s)\]>"']+/gi,
    /\bwww\.[a-z0-9][-a-z0-9.]+\.[a-z]{2,}(?:\/[^\s)\]>"']*)?/gi,
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const raw = match[0]?.replace(/[.,;:]+$/, '') ?? '';
      if (raw) out.push(raw);
    }
  }
  return out;
}

export function toSearchCandidates(
  hits: ReadonlyArray<{ url?: string; title?: string | null; snippet?: string | null }>,
  args?: { hostFilter?: string[] },
): SearchCandidate[] {
  const out: SearchCandidate[] = [];
  const seen = new Set<string>();
  const hosts = args?.hostFilter?.map((h) => h.toLowerCase()) ?? [];

  for (const hit of hits) {
    if (out.length >= ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE) break;
    const normalized = hit.url ? normalizeSourceUrl(hit.url) : null;
    if (!normalized || seen.has(normalized)) continue;
    const host = candidateHost(normalized);
    if (!host) continue;
    if (hosts.length > 0 && !hosts.some((h) => host === h || host.endsWith(`.${h}`))) continue;
    seen.add(normalized);
    out.push({
      rank: out.length + 1,
      url: normalized,
      title: hit.title?.trim() || null,
      snippet: truncateExcerpt(hit.snippet, 240),
    });
  }
  return out;
}

/**
 * Website discovery candidates: skip directory SERP hosts, and promote official
 * domains mentioned inside directory snippets (e.g. www.kelownagolf…).
 */
export function toWebsiteSearchCandidates(
  businessName: string,
  hits: ReadonlyArray<{ url?: string; title?: string | null; snippet?: string | null }>,
): SearchCandidate[] {
  const byUrl = new Map<string, SearchCandidate>();

  const add = (rawUrl: string, title: string | null, snippet: string | null) => {
    const normalized = normalizeSourceUrl(rawUrl);
    if (!normalized) return;
    const host = candidateHost(normalized);
    if (!host || isDirectoryCitationHost(host)) return;
    const existing = byUrl.get(normalized);
    if (existing) {
      byUrl.set(normalized, {
        ...existing,
        title: existing.title ?? title,
        snippet: existing.snippet ?? snippet,
      });
      return;
    }
    byUrl.set(normalized, {
      rank: 0,
      url: normalized,
      title,
      snippet,
    });
  };

  for (const hit of hits) {
    const title = hit.title?.trim() || null;
    const snippet = truncateExcerpt(hit.snippet, 240);
    if (hit.url) add(hit.url, title, snippet);
    for (const embedded of extractUrlsFromSerpText(`${hit.title ?? ''} ${hit.snippet ?? ''}`)) {
      add(embedded, title ?? 'Official website (from search snippet)', snippet);
    }
  }

  return [...byUrl.values()]
    .filter((c) => websiteCandidateMatchesBusinessName(businessName, c))
    .sort((a, b) => scoreWebsiteCandidate(businessName, b) - scoreWebsiteCandidate(businessName, a))
    .slice(0, ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

/** Social discovery: profile/page URLs only, ranked by business-name match. */
export function toSocialProfileCandidates(
  platform: SocialPlatform,
  businessName: string,
  hits: ReadonlyArray<{ url?: string; title?: string | null; snippet?: string | null }>,
): SearchCandidate[] {
  const byUrl = new Map<string, SearchCandidate>();

  for (const hit of hits) {
    if (!hit.url) continue;
    const profileUrl = canonicalizeSocialProfileUrl(platform, hit.url);
    if (!profileUrl) continue;
    const normalized = normalizeSourceUrl(profileUrl);
    if (!normalized) continue;
    const existing = byUrl.get(normalized);
    const next: SearchCandidate = {
      rank: 0,
      url: normalized,
      title: hit.title?.trim() || existing?.title || null,
      snippet: truncateExcerpt(hit.snippet, 240) ?? existing?.snippet ?? null,
    };
    if (!existing) {
      byUrl.set(normalized, next);
      continue;
    }
    byUrl.set(normalized, {
      ...existing,
      title: existing.title ?? next.title,
      snippet: existing.snippet ?? next.snippet,
    });
  }

  return [...byUrl.values()]
    .sort(
      (a, b) =>
        scoreSocialCandidateForBusiness(platform, businessName, b) -
        scoreSocialCandidateForBusiness(platform, businessName, a),
    )
    .slice(0, ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}

export function readSearchCandidates(metadata: Record<string, unknown> | null): SearchCandidate[] {
  const raw = metadata?.candidates;
  if (!Array.isArray(raw)) return [];
  const out: SearchCandidate[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    if (typeof rec.url !== 'string' || !rec.url) continue;
    out.push({
      rank: typeof rec.rank === 'number' ? rec.rank : out.length + 1,
      url: rec.url,
      title: typeof rec.title === 'string' ? rec.title : null,
      snippet: typeof rec.snippet === 'string' ? rec.snippet : null,
    });
  }
  return out;
}

export function prependUniqueCandidate(
  candidates: SearchCandidate[],
  extra: SearchCandidate | null,
): SearchCandidate[] {
  if (!extra) return candidates;
  const normalized = normalizeSourceUrl(extra.url);
  if (!normalized) return candidates;
  if (candidates.some((c) => normalizeSourceUrl(c.url) === normalized)) return candidates;
  return [{ ...extra, url: normalized, rank: 1 }, ...candidates]
    .slice(0, ACCOUNT_RESEARCH_MAX_RESULTS_PER_SOURCE)
    .map((c, i) => ({ ...c, rank: i + 1 }));
}
