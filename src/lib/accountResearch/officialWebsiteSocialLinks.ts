import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type {
  ShopifyEvidence,
  SocialPlatform,
  WebsiteSocialLink,
} from '@/lib/accountResearch/context';
import { extractHandleFromProfileUrl } from '@/lib/accountResearch/socialProfile';

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_BYTES = 1_500_000;

const SOCIAL_HOST_PATTERNS: { platform: SocialPlatform; hosts: string[] }[] = [
  { platform: 'instagram', hosts: ['instagram.com', 'www.instagram.com'] },
  { platform: 'facebook', hosts: ['facebook.com', 'www.facebook.com', 'fb.com'] },
  { platform: 'tiktok', hosts: ['tiktok.com', 'www.tiktok.com'] },
  { platform: 'pinterest', hosts: ['pinterest.com', 'www.pinterest.com'] },
];

function isPrivateIp(ip: string): boolean {
  if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') return true;
  const kind = isIP(ip);
  if (kind === 4) {
    const parts = ip.split('.').map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (kind === 6) {
    const lower = ip.toLowerCase();
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
    if (lower.startsWith('fe80')) return true;
  }
  return false;
}

export async function assertPublicHostname(hostname: string): Promise<void> {
  const normalized = hostname.toLowerCase().replace(/^www\./, '');
  const results = await lookup(normalized, { all: true });
  for (const entry of results) {
    if (isPrivateIp(entry.address)) {
      throw new Error('Blocked private network address');
    }
  }
}

function normalizeOfficialHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function matchSocialPlatform(url: string): SocialPlatform | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    for (const entry of SOCIAL_HOST_PATTERNS) {
      if (entry.hosts.some((h) => host === h.replace(/^www\./, ''))) {
        return entry.platform;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function parseAnchorLinks(html: string): string[] {
  const urls: string[] = [];
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]?.trim();
    if (href && /^https?:\/\//i.test(href)) urls.push(href);
  }
  return urls;
}

function parseJsonLdSameAs(html: string): string[] {
  const urls: string[] = [];
  const re = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const data = JSON.parse(raw) as unknown;
      const nodes = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const sameAs = (node as { sameAs?: unknown }).sameAs;
        if (typeof sameAs === 'string') urls.push(sameAs);
        if (Array.isArray(sameAs)) {
          for (const item of sameAs) {
            if (typeof item === 'string') urls.push(item);
          }
        }
      }
    } catch {
      // ignore malformed JSON-LD blocks
    }
  }
  return urls;
}

export function extractSocialLinksFromHtml(
  html: string,
): Partial<Record<SocialPlatform, WebsiteSocialLink>> {
  const found: Partial<Record<SocialPlatform, WebsiteSocialLink>> = {};
  const jsonLdUrls = new Set(parseJsonLdSameAs(html));
  const candidates = [...parseAnchorLinks(html), ...jsonLdUrls];

  for (const url of candidates) {
    const platform = matchSocialPlatform(url);
    if (!platform || found[platform]) continue;
    const handle = extractHandleFromProfileUrl(platform, url);
    if (!handle) continue;
    found[platform] = {
      url,
      handle,
      source: jsonLdUrls.has(url) ? 'json_ld_sameAs' : 'html_anchor',
    };
  }

  return found;
}

/**
 * Same "what counts as Shopify evidence" bar as the locked-citation path
 * (`isShopifyEvidenceUrl` in sources.ts): a myshopify.com link, a
 * cdn.shopify.com/shopifycdn.com asset reference, or a literal
 * "Powered by Shopify" footer credit.
 */
export function extractShopifyEvidenceFromHtml(html: string): ShopifyEvidence {
  const anchorUrls = parseAnchorLinks(html);
  for (const url of anchorUrls) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      if (
        host.endsWith('.myshopify.com') ||
        host === 'myshopify.com' ||
        host.includes('cdn.shopify.com') ||
        host.includes('shopifycdn.com')
      ) {
        return { found: true, evidenceUrl: url };
      }
    } catch {
      continue;
    }
  }

  if (/powered\s+by\s+shopify/i.test(html)) {
    return { found: true, evidenceUrl: null };
  }

  return { found: false, evidenceUrl: null };
}

async function fetchWithGuards(
  url: string,
  expectedHost: string,
  redirectCount = 0,
): Promise<string> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('Too many redirects');
  }

  const parsed = new URL(url);
  const host = normalizeOfficialHostname(parsed.hostname);
  if (host !== expectedHost) {
    throw new Error('Host not allowed');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Unsupported protocol');
  }

  await assertPublicHostname(host);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'RepCommandCenter-AccountResearch/1.0' },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw new Error('Redirect without location');
      const next = new URL(location, url);
      if (normalizeOfficialHostname(next.hostname) !== expectedHost) {
        throw new Error('Redirect left official host');
      }
      return fetchWithGuards(next.toString(), expectedHost, redirectCount + 1);
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) return '';
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.length;
      if (total > MAX_BYTES) throw new Error('Response too large');
      chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(merged);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchOfficialWebsiteEvidence(args: {
  officialHostname: string;
  websiteUrl?: string | null;
}): Promise<{
  fetchUrl: string;
  links: Partial<Record<SocialPlatform, WebsiteSocialLink>>;
  shopifyEvidence: ShopifyEvidence;
}> {
  const host = normalizeOfficialHostname(args.officialHostname);
  const startUrl =
    args.websiteUrl && /^https?:\/\//i.test(args.websiteUrl) ? args.websiteUrl : `https://${host}/`;

  const html = await fetchWithGuards(startUrl, host);
  const links = extractSocialLinksFromHtml(html);
  const shopifyEvidence = extractShopifyEvidenceFromHtml(html);
  return { fetchUrl: startUrl, links, shopifyEvidence };
}
