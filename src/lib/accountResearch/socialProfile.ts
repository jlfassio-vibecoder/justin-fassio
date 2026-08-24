import type { SocialPlatform, WebsiteSocialLink } from '@/lib/accountResearch/context';
import { hostFromUrl } from '@/lib/accountResearch/sources';

export type ConfirmedProfile = {
  profileUrl: string;
  handle: string;
  resolutionMethod: 'website_html_link' | 'profile_search' | 'staff_lock';
};

export type ProfileCandidateEvidence = {
  url: string;
  title: string | null;
  excerpt: string | null;
};

export const SOCIAL_PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  pinterest: 'Pinterest',
};

const CONFLICTING_GEO_PATTERNS: RegExp[] = [
  /\bvernon\s*,\s*nj\b/i,
  /\bvernon\s*,\s*new\s+jersey\b/i,
  /\bmt\.?\s*vernon\s*,\s*il\b/i,
  /\bmount\s+vernon\s*,\s*il\b/i,
  /\bnorth\s+palm\s+beach\b/i,
  /\bflorida\b/i,
  /\bnew\s+jersey\b/i,
  /\billinois\b/i,
];

const GENERIC_NAME_TOKENS = new Set([
  'golf',
  'club',
  'country',
  'course',
  'resort',
  'shop',
  'store',
  'the',
  'and',
  'inc',
  'ltd',
  'llc',
  'page',
  'pages',
  'official',
]);

function distinctiveNameTokens(businessName: string): string[] {
  return businessName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !GENERIC_NAME_TOKENS.has(t));
}

function normalizeHandle(handle: string): string {
  return handle.trim().replace(/^@/, '').toLowerCase();
}

export function profileMatchesBusinessName(
  businessName: string,
  candidate: { url: string; handle: string; title: string | null; excerpt: string | null },
  officialHostname?: string | null,
): boolean {
  const tokens = distinctiveNameTokens(businessName);
  const serpText = `${candidate.title ?? ''} ${candidate.excerpt ?? ''}`.toLowerCase();
  const compactSerp = serpText.replace(/[^a-z0-9]+/g, '');
  if (tokens.length > 0 && tokens.every((token) => compactSerp.includes(token))) {
    return true;
  }
  const host = officialHostname?.toLowerCase().replace(/^www\./, '');
  if (host && serpText.includes(host)) {
    return true;
  }
  return false;
}

export function hasConflictingGeography(text: string): boolean {
  return CONFLICTING_GEO_PATTERNS.some((re) => re.test(text));
}

/**
 * Discovery query for Perplexity Search via AI Gateway.
 * Quoted name + site: host + page/profile intent — avoids Marketplace/group noise.
 */
export function buildSocialSearchQuery(platform: SocialPlatform, businessName: string): string {
  const name = businessName.trim();
  const quoted = `"${name}"`;
  switch (platform) {
    case 'facebook':
      return `${quoted} official Facebook page site:facebook.com`;
    case 'instagram':
      return `${quoted} official Instagram profile site:instagram.com`;
    case 'tiktok':
      return `${quoted} official TikTok profile site:tiktok.com`;
    case 'pinterest':
      return `${quoted} official Pinterest profile site:pinterest.com`;
  }
}

/** Domain allowlist for Exa includeDomains (social discovery). */
export function socialSearchDomainFilter(platform: SocialPlatform): string[] {
  switch (platform) {
    case 'facebook':
      return ['facebook.com', 'fb.com'];
    case 'instagram':
      return ['instagram.com'];
    case 'tiktok':
      return ['tiktok.com'];
    case 'pinterest':
      return ['pinterest.com'];
  }
}

/**
 * Map a social SERP hit to a canonical profile/page URL staff can lock.
 * Drops Marketplace/Groups/watch noise; collapses posts → parent profile.
 */
export function canonicalizeSocialProfileUrl(platform: SocialPlatform, url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.includes('://') ? url : `https://${url}`);
  } catch {
    return null;
  }

  const path = parsed.pathname.toLowerCase();
  if (platform === 'facebook') {
    if (
      path.startsWith('/marketplace') ||
      path.startsWith('/groups') ||
      path.startsWith('/watch') ||
      path.startsWith('/share') ||
      path.startsWith('/login') ||
      path.includes('permalink.php') ||
      path.includes('story.php')
    ) {
      return null;
    }
  }
  if (platform === 'instagram' && (path.startsWith('/explore') || path.startsWith('/accounts'))) {
    return null;
  }

  if (isProfileUrl(platform, url)) {
    const handle = extractHandleFromProfileUrl(platform, url);
    if (!handle) return null;
    return buildCanonicalProfileUrl(platform, handle);
  }

  const handle = extractHandleFromLockedUrl(platform, url);
  if (!handle) return null;
  return buildCanonicalProfileUrl(platform, handle);
}

export function buildCanonicalProfileUrl(platform: SocialPlatform, handle: string): string {
  const h = normalizeHandle(handle);
  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${h}`;
    case 'facebook':
      return `https://facebook.com/${h}`;
    case 'tiktok':
      return `https://tiktok.com/@${h}`;
    case 'pinterest':
      return `https://pinterest.com/${h}`;
  }
}

/** Prefer candidates whose title/snippet/handle mention distinctive business tokens. */
export function scoreSocialCandidateForBusiness(
  platform: SocialPlatform,
  businessName: string,
  candidate: { url: string; title: string | null; snippet: string | null },
): number {
  const handle = extractHandleFromLockedUrl(platform, candidate.url);
  const tokens = distinctiveNameTokens(businessName);
  if (tokens.length === 0) return 0;
  const hay =
    `${candidate.title ?? ''} ${candidate.snippet ?? ''} ${handle ?? ''} ${candidate.url}`.toLowerCase();
  const compact = hay.replace(/[^a-z0-9]+/g, '');
  return tokens.filter((t) => compact.includes(t) || hay.includes(t)).length;
}

export function confirmProfileFromWebsiteLink(
  platform: SocialPlatform,
  link: WebsiteSocialLink,
): ConfirmedProfile {
  return {
    profileUrl: link.url,
    handle: normalizeHandle(link.handle),
    resolutionMethod: 'website_html_link',
  };
}

export function selectFirstProfileFromSearchResults(
  platform: SocialPlatform,
  hits: ProfileCandidateEvidence[],
  businessName: string,
  officialHostname?: string | null,
): ConfirmedProfile | null {
  for (const hit of hits) {
    if (!hit.url || !isProfileUrl(platform, hit.url)) continue;
    const handle = extractHandleFromProfileUrl(platform, hit.url);
    if (!handle) continue;
    if (
      !profileMatchesBusinessName(
        businessName,
        {
          url: hit.url,
          handle,
          title: hit.title,
          excerpt: hit.excerpt,
        },
        officialHostname,
      )
    ) {
      continue;
    }
    return {
      profileUrl: hit.url,
      handle,
      resolutionMethod: 'profile_search',
    };
  }
  return null;
}

const FACEBOOK_RESERVED_SLUGS = new Set([
  'posts',
  'videos',
  'watch',
  'reel',
  'reels',
  'photo',
  'photos',
  'events',
  'groups',
  'marketplace',
  'login',
  'share',
  'permalink.php',
  'story.php',
  'profile.php',
  'pages',
  'p',
]);

const FACEBOOK_PROFILE_TABS = new Set([
  'photos',
  'about',
  'reviews',
  'reels',
  'posts',
  'videos',
  'events',
]);

function facebookProfileHandle(path: string): string | null {
  const normalized = path.toLowerCase();
  if (normalized.includes('permalink.php') || normalized.includes('story.php')) {
    return null;
  }
  if (/\/posts\/\d+/i.test(path) || /\/videos\/\d+/i.test(path)) {
    return null;
  }

  const pMatch = path.match(/^\/p\/([a-z0-9._-]+)\/?$/i);
  if (pMatch?.[1]) return normalizeHandle(pMatch[1]);

  const pagesMatch = path.match(/^\/pages\/([a-z0-9._-]+)\/(\d+)\/?$/i);
  if (pagesMatch?.[1]) return normalizeHandle(pagesMatch[1]);

  const segments = path.split('/').filter(Boolean);
  const slug = segments[0];
  if (!slug || FACEBOOK_RESERVED_SLUGS.has(slug.toLowerCase())) return null;
  if (segments.length === 1) return normalizeHandle(slug);
  if (segments.length === 2 && FACEBOOK_PROFILE_TABS.has(segments[1].toLowerCase())) {
    return normalizeHandle(slug);
  }

  return null;
}

export function isProfileUrl(platform: SocialPlatform, url: string): boolean {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    switch (platform) {
      case 'instagram':
        return (
          /^\/[a-z0-9._]+\/?$/i.test(path) && !path.startsWith('/p/') && !path.startsWith('/reel/')
        );
      case 'facebook':
        return facebookProfileHandle(parsed.pathname) !== null;
      case 'tiktok':
        return /^\/@[a-z0-9._-]+\/?$/i.test(path);
      case 'pinterest':
        return /^\/[a-z0-9._-]+\/?$/i.test(path) && !path.startsWith('/pin/');
    }
  } catch {
    return false;
  }
}

export function extractHandleFromLockedUrl(platform: SocialPlatform, url: string): string | null {
  const fromProfile = extractHandleFromProfileUrl(platform, url);
  if (fromProfile) return fromProfile;
  try {
    const path = new URL(url).pathname;
    switch (platform) {
      case 'instagram': {
        const m = path.match(/^\/([a-z0-9._]+)\/(p|reel|reels|tv|stories)\//i);
        if (m?.[1] && !['p', 'reel', 'reels', 'tv', 'stories'].includes(m[1].toLowerCase())) {
          return normalizeHandle(m[1]);
        }
        return null;
      }
      case 'facebook': {
        const pMatch = path.match(/^\/p\/([a-z0-9._-]+)/i);
        if (pMatch?.[1]) return normalizeHandle(pMatch[1]);
        const pagesMatch = path.match(/^\/pages\/([a-z0-9._-]+)\//i);
        if (pagesMatch?.[1]) return normalizeHandle(pagesMatch[1]);
        const segments = path.split('/').filter(Boolean);
        const slug = segments[0];
        if (!slug || FACEBOOK_RESERVED_SLUGS.has(slug.toLowerCase())) return null;
        return normalizeHandle(slug);
      }
      case 'tiktok': {
        const m = path.match(/^\/@([a-z0-9._-]+)/i);
        return m?.[1] ? normalizeHandle(m[1]) : null;
      }
      case 'pinterest': {
        const m = path.match(/^\/([a-z0-9._-]+)\//i);
        if (m?.[1] && m[1].toLowerCase() !== 'pin') return normalizeHandle(m[1]);
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function extractHandleFromProfileUrl(platform: SocialPlatform, url: string): string | null {
  try {
    const path = new URL(url).pathname;
    switch (platform) {
      case 'instagram': {
        const m = path.match(/^\/([a-z0-9._]+)\/?$/i);
        return m?.[1] ? normalizeHandle(m[1]) : null;
      }
      case 'facebook':
        return facebookProfileHandle(path);
      case 'tiktok': {
        const m = path.match(/^\/@([a-z0-9._-]+)\/?$/i);
        return m?.[1] ? normalizeHandle(m[1]) : null;
      }
      case 'pinterest': {
        const m = path.match(/^\/([a-z0-9._-]+)\/?$/i);
        return m?.[1] ? normalizeHandle(m[1]) : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export type PostAttribution = {
  verified: boolean;
  method: string | null;
};

export function attributeInstagramPost(url: string, handle: string): PostAttribution {
  const h = normalizeHandle(handle);
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path === `/${h}` || path.startsWith(`/${h}/`)) {
      return { verified: true, method: 'url_path_prefix' };
    }
    return { verified: false, method: null };
  } catch {
    return { verified: false, method: null };
  }
}

export function attributeTikTokPost(url: string, handle: string): PostAttribution {
  const h = normalizeHandle(handle);
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.includes(`/@${h}/`) || path.startsWith(`/@${h}/`)) {
      return { verified: true, method: 'tiktok_handle_in_path' };
    }
    return { verified: false, method: null };
  } catch {
    return { verified: false, method: null };
  }
}

export function attributeFacebookPost(url: string, handle: string): PostAttribution {
  const h = normalizeHandle(handle);
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.toLowerCase();
    if (path.startsWith(`/${h}/`) || path === `/${h}`) {
      return { verified: true, method: 'facebook_page_path' };
    }
    if (path.startsWith(`/p/${h}/`) || path === `/p/${h}`) {
      return { verified: true, method: 'facebook_p_path' };
    }
    if (path.startsWith(`/pages/${h}/`)) {
      return { verified: true, method: 'facebook_pages_path' };
    }
    const host = hostFromUrl(url);
    if (host && (host === 'facebook.com' || host.endsWith('.facebook.com'))) {
      const segments = path.split('/').filter(Boolean);
      if (segments[0] === h || segments[1] === h) {
        return { verified: true, method: 'facebook_page_slug' };
      }
    }
    return { verified: false, method: null };
  } catch {
    return { verified: false, method: null };
  }
}

export function attributePinterestPost(url: string, handle: string): PostAttribution {
  const h = normalizeHandle(handle);
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.startsWith(`/${h}/`) || path === `/${h}`) {
      return { verified: true, method: 'pinterest_user_path' };
    }
    return { verified: false, method: null };
  } catch {
    return { verified: false, method: null };
  }
}

export function attributePostToConfirmedProfile(
  platform: SocialPlatform,
  url: string,
  handle: string,
): PostAttribution {
  switch (platform) {
    case 'instagram':
      return attributeInstagramPost(url, handle);
    case 'tiktok':
      return attributeTikTokPost(url, handle);
    case 'facebook':
      return attributeFacebookPost(url, handle);
    case 'pinterest':
      return attributePinterestPost(url, handle);
  }
}
