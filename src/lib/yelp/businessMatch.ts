import { normalizeProspectName } from '@/lib/prospectListImport';
import { ensureYelpFusionApiKey } from '@/lib/yelp/yelpFusionEnv';
import type {
  YelpBusiness,
  YelpMatchConfidence,
  YelpMatchMethod,
  YelpMatchResult,
  YelpProspectMatchInput,
} from '@/lib/yelp/types';

const YELP_API_BASE = 'https://api.yelp.com/v3';

export type YelpFetchFn = (url: string, init?: RequestInit) => Promise<Response>;

type RawYelpLocation = {
  address1?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
};

type RawYelpCategory = {
  alias?: string | null;
  title?: string | null;
};

type RawYelpBusiness = {
  id?: string;
  alias?: string | null;
  name?: string;
  url?: string | null;
  phone?: string | null;
  location?: RawYelpLocation | null;
  categories?: RawYelpCategory[] | null;
  is_claimed?: boolean | null;
  review_count?: number | null;
  rating?: number | null;
  /** Some Fusion responses expose an official site here. */
  business_url?: string | null;
};

function getYelpApiKey(): string {
  const key = ensureYelpFusionApiKey();
  if (!key) {
    throw new Error('YELP_FUSION_API_KEY is required');
  }
  return key;
}

function defaultFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, init);
}

function normalizeCity(value: string | null | undefined): string {
  return normalizeProspectName(value ?? '');
}

/** Strip location/store parentheticals from CRM names, e.g. "Sassy Seagull (Bandon Store)". */
export function stripParentheticalName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
}

/** Normalize business names for Yelp matching (CRM import quirks + leading "The"). */
export function normalizeYelpMatchName(name: string): string {
  const stripped = stripParentheticalName(name.replace(/^\d+\s+/, ''));
  const normalized = normalizeProspectName(stripped);
  return normalized.replace(/^the\s+/, '');
}

export function compactYelpNameKey(name: string): string {
  return normalizeYelpMatchName(name).replace(/\s+/g, '');
}

function phoneDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function parseStreetAddress(full: string | null | undefined): string {
  const trimmed = (full ?? '').trim();
  if (!trimmed) return '';
  const comma = trimmed.indexOf(',');
  if (comma > 0) return trimmed.slice(0, comma).trim();
  return trimmed;
}

export function normalizeYelpPhone(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return v;
}

function normalizeBusinessUrl(raw: RawYelpBusiness): string | null {
  const candidate = (raw.business_url ?? '').trim();
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (/^www\./i.test(candidate) || candidate.includes('.')) {
    return `https://${candidate.replace(/^\/\//, '')}`;
  }
  return null;
}

function mapYelpCategories(raw: RawYelpBusiness): string[] {
  return (raw.categories ?? []).map((c) => c.title?.trim()).filter((t): t is string => Boolean(t));
}

/** Canonical yelp.com/biz URL without tracking params. */
export function yelpBizSearchUrl(business: YelpBusiness): string {
  const alias = business.alias?.trim();
  if (alias) return `https://www.yelp.com/biz/${alias}`;
  const match = business.url.match(/yelp\.com\/biz\/([^?/#]+)/i);
  if (match?.[1]) return `https://www.yelp.com/biz/${match[1]}`;
  return business.url;
}

export function mapRawYelpBusiness(raw: RawYelpBusiness): YelpBusiness | null {
  const id = (raw.id ?? '').trim();
  const name = (raw.name ?? '').trim();
  if (!id || !name) return null;

  const location = raw.location ?? {};
  const alias = (raw.alias ?? '').trim() || null;
  const yelpUrl =
    (raw.url ?? '').trim() ||
    (alias ? `https://www.yelp.com/biz/${alias}` : `https://www.yelp.com/biz/${id}`);

  return {
    id,
    alias,
    name,
    url: yelpUrl,
    phone: normalizeYelpPhone(raw.phone),
    address1: (location.address1 ?? '').trim() || null,
    city: (location.city ?? '').trim() || null,
    state: (location.state ?? '').trim() || null,
    postalCode: (location.zip_code ?? '').trim() || null,
    businessUrl: normalizeBusinessUrl(raw),
    categories: mapYelpCategories(raw),
    isClaimed: typeof raw.is_claimed === 'boolean' ? raw.is_claimed : null,
    reviewCount:
      typeof raw.review_count === 'number' && Number.isFinite(raw.review_count)
        ? raw.review_count
        : null,
    rating: typeof raw.rating === 'number' && Number.isFinite(raw.rating) ? raw.rating : null,
  };
}

type ScoredCandidate = {
  business: YelpBusiness;
  score: number;
  reasons: string[];
};

export function scoreYelpMatch(
  input: YelpProspectMatchInput,
  business: YelpBusiness,
): ScoredCandidate {
  const reasons: string[] = [];
  let score = 0;

  const inputName = normalizeYelpMatchName(input.name);
  const yelpName = normalizeYelpMatchName(business.name);
  const inputCompact = compactYelpNameKey(input.name);
  const yelpCompact = compactYelpNameKey(business.name);
  const inputCity = normalizeCity(input.city);
  const yelpCity = normalizeCity(business.city);

  if (inputName && yelpName && inputName === yelpName) {
    score += 50;
    reasons.push('exact_name');
  } else if (inputCompact && yelpCompact && inputCompact === yelpCompact) {
    score += 50;
    reasons.push('compact_name');
  } else if (
    inputName &&
    yelpName &&
    (inputName.includes(yelpName) || yelpName.includes(inputName))
  ) {
    score += 30;
    reasons.push('partial_name');
  } else if (
    inputCompact &&
    yelpCompact &&
    (inputCompact.includes(yelpCompact) || yelpCompact.includes(inputCompact))
  ) {
    score += 30;
    reasons.push('partial_compact_name');
  } else {
    reasons.push('name_mismatch');
  }

  if (inputCity && yelpCity && inputCity === yelpCity) {
    score += 30;
    reasons.push('city_match');
  } else if (inputCity && yelpCity) {
    reasons.push('city_mismatch');
  }

  const inputPostal = (input.postalCode ?? '').trim();
  const yelpPostal = (business.postalCode ?? '').trim();
  if (inputPostal && yelpPostal && inputPostal === yelpPostal) {
    score += 10;
    reasons.push('postal_match');
  }

  const inputPhone = phoneDigits(input.phone);
  const yelpPhone = phoneDigits(business.phone);
  if (inputPhone.length >= 10 && yelpPhone.length >= 10 && inputPhone === yelpPhone) {
    score += 10;
    reasons.push('phone_match');
  }

  return { business, score, reasons };
}

export function confidenceFromScore(
  score: number,
  reasons: string[],
  candidateCount: number,
): YelpMatchConfidence {
  const hasExactName = reasons.includes('exact_name') || reasons.includes('compact_name');
  const hasCityMatch = reasons.includes('city_match');
  const hasNameMismatch = reasons.includes('name_mismatch');

  if (candidateCount > 1) return 'low';
  if (hasExactName && hasCityMatch && score >= 80) return 'high';
  if (hasNameMismatch) return 'low';
  if (score >= 60) return 'medium';
  return 'low';
}

/** Count Yelp candidates that could plausibly match after scoring (excludes clear mismatches). */
export function countViableYelpCandidates(scored: ScoredCandidate[]): number {
  if (scored.length <= 1) return scored.length;
  const top = scored[0];
  return scored.filter((candidate) => {
    if (candidate.score < top.score - 25) return false;
    if (candidate.reasons.includes('name_mismatch') && !top.reasons.includes('name_mismatch')) {
      return false;
    }
    return true;
  }).length;
}

function buildYelpUrl(path: string, params: Record<string, string | undefined>): string {
  const url = new URL(`${YELP_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value.trim() !== '') {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function yelpGet(
  fetchFn: YelpFetchFn,
  path: string,
  params: Record<string, string | undefined>,
): Promise<unknown> {
  const url = buildYelpUrl(path, params);
  const res = await fetchFn(url, {
    headers: { Authorization: `Bearer ${getYelpApiKey()}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Yelp API ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<unknown>;
}

async function businessMatch(
  fetchFn: YelpFetchFn,
  input: YelpProspectMatchInput,
): Promise<RawYelpBusiness[]> {
  const address1 = parseStreetAddress(input.address);
  const matchName = stripParentheticalName(input.name) || input.name;
  const payload = await yelpGet(fetchFn, '/businesses/matches', {
    name: matchName,
    address1: address1 || '',
    city: input.city ?? undefined,
    state: 'OR',
    country: 'US',
    postal_code: input.postalCode ?? undefined,
    phone: input.phone ?? undefined,
    match_threshold: address1 ? 'strict' : 'default',
    limit: '3',
  });
  const businesses = (payload as { businesses?: RawYelpBusiness[] }).businesses ?? [];
  return businesses;
}

async function businessSearch(
  fetchFn: YelpFetchFn,
  input: YelpProspectMatchInput,
): Promise<RawYelpBusiness[]> {
  const location = input.city?.trim() ? `${input.city.trim()}, OR` : 'Oregon';
  const term = stripParentheticalName(input.name) || input.name;
  const payload = await yelpGet(fetchFn, '/businesses/search', {
    term,
    location,
    limit: '3',
  });
  return (payload as { businesses?: RawYelpBusiness[] }).businesses ?? [];
}

async function businessPhoneSearch(
  fetchFn: YelpFetchFn,
  phone: string | null | undefined,
): Promise<RawYelpBusiness[]> {
  const digits = phoneDigits(phone);
  if (digits.length < 10) return [];
  const payload = await yelpGet(fetchFn, '/businesses/search/phone', {
    phone: digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+1${digits}`,
  });
  return (payload as { businesses?: RawYelpBusiness[] }).businesses ?? [];
}

export async function fetchYelpBusinessDetails(
  id: string,
  options: { fetchFn?: YelpFetchFn } = {},
): Promise<YelpBusiness> {
  const fetchFn = options.fetchFn ?? defaultFetch;
  const payload = await yelpGet(fetchFn, `/businesses/${encodeURIComponent(id)}`, {});
  const mapped = mapRawYelpBusiness(payload as RawYelpBusiness);
  if (!mapped) {
    throw new Error(`Yelp business details missing id/name for ${id}`);
  }
  return mapped;
}

function pickBestMatch(
  input: YelpProspectMatchInput,
  rawBusinesses: RawYelpBusiness[],
  matchMethod: YelpMatchMethod,
): YelpMatchResult | null {
  const scored = rawBusinesses
    .map((raw) => mapRawYelpBusiness(raw))
    .filter((b): b is YelpBusiness => b != null)
    .map((business) => scoreYelpMatch(input, business))
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const best = scored[0];
  const viableCount = countViableYelpCandidates(scored);
  const confidence = confidenceFromScore(best.score, best.reasons, viableCount);

  return {
    business: best.business,
    confidence,
    matchMethod,
    score: best.score,
    reasons: best.reasons,
    candidateCount: scored.length,
    viableCandidateCount: viableCount,
  };
}

export async function matchProspectToYelp(
  input: YelpProspectMatchInput,
  options: { fetchFn?: YelpFetchFn; enrichDetails?: boolean } = {},
): Promise<YelpMatchResult | null> {
  const fetchFn = options.fetchFn ?? defaultFetch;
  const enrichDetails = options.enrichDetails ?? true;

  let match = pickBestMatch(input, await businessMatch(fetchFn, input), 'business_match');

  if (!match || match.confidence === 'low') {
    const searchHits = await businessSearch(fetchFn, input);
    const searchMatch = pickBestMatch(input, searchHits, 'business_search');
    if (searchMatch && (!match || searchMatch.score > match.score)) {
      match = searchMatch;
    }
  }

  if (!match || match.confidence === 'low') {
    const phoneHits = await businessPhoneSearch(fetchFn, input.phone);
    const phoneMatch = pickBestMatch(input, phoneHits, 'business_search');
    if (phoneMatch && (!match || phoneMatch.score > match.score)) {
      match = { ...phoneMatch, matchMethod: 'business_search' };
    }
  }

  if (!match) return null;

  if (enrichDetails) {
    const details = await fetchYelpBusinessDetails(match.business.id, { fetchFn });
    const rescored = scoreYelpMatch(input, details);
    match = {
      business: details,
      confidence: confidenceFromScore(rescored.score, rescored.reasons, match.viableCandidateCount),
      matchMethod: match.matchMethod,
      score: rescored.score,
      reasons: rescored.reasons,
      candidateCount: match.candidateCount,
      viableCandidateCount: match.viableCandidateCount,
    };
  }

  return match;
}
