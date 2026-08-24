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
 * Golf Canada and its provincial affiliates (golfcanada.ca, golfnb.ca,
 * golfontario.ca, golfsaskatchewan.org, golfinbritishcolumbia.com, …) all
 * share the same "golf<jurisdiction>.<tld>" naming and the same
 * "/golf-facility/<slug>-en/" listing-page template. New affiliate domains
 * turn up over time, so match the shared template instead of only the
 * specific hosts already added to the directory host list.
 */
function isGolfFacilityDirectoryUrl(url: string): boolean {
  const host = candidateHost(url);
  if (!host || !/^golf[a-z]+\.(ca|com|org)$/i.test(host)) return false;
  try {
    return new URL(url).pathname.includes('/golf-facility/');
  } catch {
    return false;
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

/**
 * Category/type words (golf, club, course, resort, …). Real official sites
 * almost always carry one of these somewhere in host+title, which is what
 * tells "Black Mountain Golf Club" apart from an unrelated "Black Mountain
 * Distillery" sharing the same place name. But the CRM's exact wording isn't
 * gospel — a course entered in the CRM as "... Golf Club" may call itself
 * "... Golf Course" on its own site (and vice versa), so requiring the CRM's
 * literal category word would reject the real site. These words are required
 * on a first, strict pass; if that finds nothing, a second pass drops them
 * and matches on place-name tokens alone (`websiteDistinctiveNameTokens`)
 * rather than returning no candidates at all.
 */
const WEBSITE_CATEGORY_WORDS = new Set([
  'golf',
  'club',
  'course',
  'resort',
  'hotel',
  'shop',
  'store',
  'centre',
  'center',
  'pro',
]);

/** Meaningful tokens from the CRM business name (e.g. black + mountain + golf + club). */
export function websiteNameMatchTokens(businessName: string): string[] {
  return businessName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !WEBSITE_NAME_FILLER_WORDS.has(t));
}

/** Place-name-only tokens, with category words dropped too — the relaxed fallback set. */
export function websiteDistinctiveNameTokens(businessName: string): string[] {
  return websiteNameMatchTokens(businessName).filter((t) => !WEBSITE_CATEGORY_WORDS.has(t));
}

function compactAlnum(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function matchesTokens(
  tokens: string[],
  businessName: string,
  candidate: { url: string; title: string | null; snippet?: string | null },
): boolean {
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

/** Strict pass: host or title must carry every meaningful token, category words included. */
export function websiteCandidateMatchesBusinessName(
  businessName: string,
  candidate: { url: string; title: string | null; snippet?: string | null },
): boolean {
  return matchesTokens(websiteNameMatchTokens(businessName), businessName, candidate);
}

/** Relaxed fallback pass: place-name tokens only, category words dropped. */
export function websiteCandidateMatchesDistinctiveName(
  businessName: string,
  candidate: { url: string; title: string | null; snippet?: string | null },
): boolean {
  return matchesTokens(websiteDistinctiveNameTokens(businessName), businessName, candidate);
}

function scoreWebsiteCandidate(
  businessName: string,
  candidate: { url: string; title: string | null; snippet: string | null },
): number {
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
    if (!host || isDirectoryCitationHost(host) || isGolfFacilityDirectoryUrl(normalized)) return;
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

  const all = [...byUrl.values()];
  const strict = all.filter((c) => websiteCandidateMatchesBusinessName(businessName, c));
  // Fall back to place-name-only matching only when the strict (category-word-
  // inclusive) pass finds nothing — e.g. the CRM says "Golf Club" but the site
  // calls itself "Golf Course". Preferring strict matches whenever they exist
  // keeps the stronger disambiguation from an unrelated same-place-name business.
  const pool =
    strict.length > 0
      ? strict
      : all.filter((c) => websiteCandidateMatchesDistinctiveName(businessName, c));

  return pool
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
