const TRACKING_PARAM_EXACT = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid']);

function shouldDropQueryParam(key: string): boolean {
  const lower = key.toLowerCase();
  if (TRACKING_PARAM_EXACT.has(lower)) return true;
  return lower.startsWith('utm_');
}

/**
 * Normalize a citation URL for dedupe keys.
 * Lowercases host, strips www/fragment/tracking params, trailing slash (except root).
 */
export function normalizeSourceUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  let host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || !host.includes('.')) return null;
  if (host.startsWith('www.')) host = host.slice(4);

  const params = new URLSearchParams(parsed.search);
  const kept = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (shouldDropQueryParam(key)) continue;
    kept.append(key, value);
  }
  const search = kept.toString();

  let pathname = parsed.pathname || '/';
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const query = search ? `?${search}` : '';
  return `https://${host}${pathname}${query}`;
}

export function truncateExcerpt(text: string | null | undefined, maxChars: number): string | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
