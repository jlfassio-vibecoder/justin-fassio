import { OGR_WHOLESALE_PATH } from '@/data/landing';

export { OGR_WHOLESALE_PATH };

const DEFAULT_PUBLIC_SITE_ORIGIN = 'https://justinfassio.com';

/**
 * Trim + lowercase. Throws if empty, contains '/', '?', '#', or whitespace mid-slug.
 */
export function normalizeOgrProductSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!normalized) {
    throw new Error('OGR product slug is required');
  }
  if (/[\s/?#]/.test(normalized)) {
    throw new Error(`Invalid OGR product slug: ${JSON.stringify(slug)}`);
  }
  return normalized;
}

/** `/old-guys-rule-wholesale/{slug}` — no query/hash. Throws on invalid slug. */
export function buildOgrProductPath(slug: string): string {
  const normalized = normalizeOgrProductSlug(slug);
  return `${OGR_WHOLESALE_PATH}/${encodeURIComponent(normalized)}`;
}

/** Same as `buildOgrProductPath`, but returns null instead of throwing on invalid slug. */
export function tryBuildOgrProductPath(slug: string): string | null {
  try {
    return buildOgrProductPath(slug);
  } catch {
    return null;
  }
}

function normalizeOriginBase(origin: string): string {
  const trimmed = origin.trim();
  if (!trimmed) {
    throw new Error('Origin is required');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid origin: ${JSON.stringify(origin)}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported origin protocol: ${parsed.protocol}`);
  }
  // Origin only — strip path, query, and hash so join stays deterministic.
  return parsed.origin;
}

/**
 * Join origin + path via `new URL(path, originBase)`.
 * Strips origin path/query/hash; requires http(s).
 * Throws on invalid origin or non-absolute path.
 */
export function buildCanonicalUrl(path: string, origin: string): string {
  const trimmedPath = path.trim();
  if (!trimmedPath.startsWith('/')) {
    throw new Error(`Path must be absolute (start with /): ${JSON.stringify(path)}`);
  }
  if (/[?#]/.test(trimmedPath)) {
    throw new Error(`Canonical path must not include query or hash: ${JSON.stringify(path)}`);
  }
  const originBase = normalizeOriginBase(origin);
  return new URL(trimmedPath, `${originBase}/`).toString();
}

export function buildOgrCollectionUrl(origin: string): string {
  return buildCanonicalUrl(OGR_WHOLESALE_PATH, origin);
}

export function buildOgrProductUrl(slug: string, origin: string): string {
  return buildCanonicalUrl(buildOgrProductPath(slug), origin);
}

/** Same as `buildOgrProductUrl`, but returns null instead of throwing on invalid slug/origin. */
export function tryBuildOgrProductUrl(slug: string, origin: string): string | null {
  try {
    return buildOgrProductUrl(slug, origin);
  } catch {
    return null;
  }
}

export type ResolvePublicSiteOriginInput = {
  /** Highest priority (tests / explicit caller). */
  explicitOrigin?: string | null;
  /** Injected PUBLIC_SITE_URL (tests); default reads import.meta.env.PUBLIC_SITE_URL. */
  envSiteUrl?: string | null;
  /**
   * Request host (e.g. Astro.url.origin). Used only when env/explicit unset.
   * Not preferred for production canonical/email when PUBLIC_SITE_URL is set.
   */
  requestOrigin?: string | null;
};

function readEnvSiteUrl(): string | null {
  const fromEnv = import.meta.env.PUBLIC_SITE_URL;
  if (typeof fromEnv === 'string' && fromEnv.trim()) return fromEnv;
  return null;
}

/**
 * Precedence: explicitOrigin → PUBLIC_SITE_URL → requestOrigin → https://justinfassio.com
 * Normalizes trailing slash; throws if a provided candidate is malformed non-empty.
 */
export function resolvePublicSiteOrigin(input: ResolvePublicSiteOriginInput = {}): string {
  const candidates: Array<string | null | undefined> = [
    input.explicitOrigin,
    input.envSiteUrl !== undefined ? input.envSiteUrl : readEnvSiteUrl(),
    input.requestOrigin,
  ];

  for (const candidate of candidates) {
    if (candidate == null) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return normalizeOriginBase(trimmed);
  }

  return DEFAULT_PUBLIC_SITE_ORIGIN;
}
