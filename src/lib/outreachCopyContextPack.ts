/**
 * Slice B: allowlisted research/profile pack for outreach copy prompts.
 * Hostname/platform only for locks — never full URLs in the pack DTO.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNT_RESEARCH_PLATFORM_SCOPES,
  type AccountResearchPlatformScope,
} from '@/lib/accountResearch/constants';
import { loadSourceLocks, type SourceLockMap } from '@/lib/accountResearch/locks';
import { loadPersistedYelpMatchForRetailer } from '@/lib/accountResearch/verifyYelpDirectoryMatch';
import { ACCOUNT_CONTACT_ROLES, accountContactRoleLabel } from '@/lib/accountContacts';
import type { YelpMatchResult } from '@/lib/yelp/types';
import type { AccountContactRole, Database } from '@/types/database';

type DbClient = SupabaseClient<Database>;

export const OGR_OUTREACH_RESEARCH_NOTES_MAX = 5;
export const OGR_OUTREACH_COPY_RESEARCH_TEXT_MAX_CHARS = 1200;
export const OGR_OUTREACH_BRIEF_BULLETS_MAX = 3;
export const OGR_OUTREACH_BRIEF_BULLET_MAX_CHARS = 120;

export type OutreachLockedProfile = {
  platform: AccountResearchPlatformScope;
  hostname: string;
};

export type OutreachCopyContextPack = {
  storeWebsiteHost: string | null;
  lockedProfiles: OutreachLockedProfile[];
  contactRole: string | null;
  contactTitle: string | null;
  recentPublicNotes: string[];
  researchBriefBullets: string[];
  directorySignals: string | null;
};

export type OutreachCopyContextFlags = {
  hasWebsiteHost: boolean;
  acceptedNoteCount: number;
  lockedSourceCount: number;
  hasContactRole: boolean;
  hasBriefBullets: boolean;
  hasDirectorySignals: boolean;
};

/** Extract hostname from a store website URL for safe prompt context (never full URL). */
export function hostnameFromWebsite(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(withScheme).hostname.replace(/^www\./i, '').trim();
    return host || null;
  } catch {
    return null;
  }
}

export function stripUrlsFromResearchNote(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\bwww\.\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Latest completed research run's accepted citation notes (plain text, no URLs).
 * Missing research is fine — returns [].
 */
export async function loadAcceptedResearchNotesForOutreach(
  client: DbClient,
  prospectId: number,
  limit = OGR_OUTREACH_RESEARCH_NOTES_MAX,
): Promise<string[]> {
  const { data: runs, error: runError } = await client
    .from('account_research_runs')
    .select('id, completed_at')
    .eq('retailer_id', prospectId)
    .in('status', ['succeeded', 'partial'])
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (runError || !runs?.[0]?.id) return [];

  const { data: citations, error: citeError } = await client
    .from('account_research_citations')
    .select('platform, title, excerpt')
    .eq('research_run_id', runs[0].id)
    .eq('acceptance_status', 'accepted')
    .order('observed_at', { ascending: false })
    .limit(limit);
  if (citeError || !citations) return [];

  const notes: string[] = [];
  for (const row of citations) {
    const platform = typeof row.platform === 'string' ? row.platform.trim() : '';
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const excerpt = typeof row.excerpt === 'string' ? row.excerpt.trim() : '';
    const body = stripUrlsFromResearchNote(excerpt || title);
    if (!body) continue;
    const clipped = body.slice(0, 180);
    notes.push(platform ? `${platform}: ${clipped}` : clipped);
    if (notes.length >= limit) break;
  }
  return notes;
}

export function lockedProfilesFromSourceLocks(locks: SourceLockMap): OutreachLockedProfile[] {
  const profiles: OutreachLockedProfile[] = [];
  for (const platform of ACCOUNT_RESEARCH_PLATFORM_SCOPES) {
    const lock = locks[platform];
    if (!lock) continue;
    const hostname = hostnameFromWebsite(lock.locked_url);
    if (!hostname) continue;
    profiles.push({ platform, hostname });
  }
  return profiles;
}

/** Split latest research brief into 1–3 short URL-free bullets. */
export function briefBulletsFromResearchBrief(
  raw: string | null | undefined,
  maxBullets = OGR_OUTREACH_BRIEF_BULLETS_MAX,
  maxChars = OGR_OUTREACH_BRIEF_BULLET_MAX_CHARS,
): string[] {
  const cleaned = stripUrlsFromResearchNote(raw ?? '');
  if (!cleaned) return [];

  const chunks: string[] = [];
  for (const line of cleaned.split(/\n+/)) {
    const trimmed = line.replace(/^[-*•]\s*/, '').trim();
    if (!trimmed) continue;
    const sentences = trimmed
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length > 1) {
      chunks.push(...sentences);
    } else {
      chunks.push(trimmed);
    }
  }

  const bullets: string[] = [];
  for (const chunk of chunks) {
    const clipped = chunk.slice(0, maxChars).trim();
    if (!clipped) continue;
    bullets.push(clipped);
    if (bullets.length >= maxBullets) break;
  }
  return bullets;
}

/** Yelp verified name + categories as plain text (never listing URL). */
export function directorySignalsFromYelpMatch(
  match: YelpMatchResult | null | undefined,
): string | null {
  if (!match?.business) return null;
  const name = match.business.name?.trim() || '';
  const categories = (match.business.categories ?? []).map((c) => c.trim()).filter(Boolean);
  if (!name && categories.length === 0) return null;
  const categoryPart = categories.join(', ');
  if (name && categoryPart) return stripUrlsFromResearchNote(`${name} · ${categoryPart}`);
  return stripUrlsFromResearchNote(name || categoryPart) || null;
}

/**
 * Cap combined research text (notes + brief bullets + directory).
 * Trims directory first, then brief bullets from the end, then notes from the end.
 */
export function clipResearchTextBudget(input: {
  recentPublicNotes: string[];
  researchBriefBullets: string[];
  directorySignals: string | null;
  maxChars?: number;
}): {
  recentPublicNotes: string[];
  researchBriefBullets: string[];
  directorySignals: string | null;
} {
  const maxChars = input.maxChars ?? OGR_OUTREACH_COPY_RESEARCH_TEXT_MAX_CHARS;
  const notes = [...input.recentPublicNotes];
  const bullets = [...input.researchBriefBullets];
  let directory = input.directorySignals?.trim() || null;

  const total = () => [...notes, ...bullets, ...(directory ? [directory] : [])].join('\n').length;

  while (total() > maxChars) {
    if (directory) {
      directory = null;
      continue;
    }
    if (bullets.length > 0) {
      bullets.pop();
      continue;
    }
    if (notes.length > 0) {
      notes.pop();
      continue;
    }
    break;
  }

  return {
    recentPublicNotes: notes,
    researchBriefBullets: bullets,
    directorySignals: directory,
  };
}

export function contextFlagsFromPack(pack: OutreachCopyContextPack): OutreachCopyContextFlags {
  return {
    hasWebsiteHost: Boolean(pack.storeWebsiteHost),
    acceptedNoteCount: pack.recentPublicNotes.length,
    lockedSourceCount: pack.lockedProfiles.length,
    hasContactRole: Boolean(pack.contactRole || pack.contactTitle),
    hasBriefBullets: pack.researchBriefBullets.length > 0,
    hasDirectorySignals: Boolean(pack.directorySignals),
  };
}

async function loadLatestResearchBrief(
  client: DbClient,
  prospectId: number,
): Promise<string | null> {
  const { data, error } = await client
    .from('account_research_runs')
    .select('research_brief')
    .eq('retailer_id', prospectId)
    .in('status', ['succeeded', 'partial'])
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1);
  if (error || !data?.[0]) return null;
  const brief = data[0].research_brief;
  return typeof brief === 'string' && brief.trim() ? brief : null;
}

async function loadContactRoleTitle(
  client: DbClient,
  contactId: string,
): Promise<{ contactRole: string | null; contactTitle: string | null }> {
  const { data, error } = await client
    .from('account_contacts')
    .select('role, title')
    .eq('id', contactId)
    .maybeSingle();
  if (error || !data) return { contactRole: null, contactTitle: null };

  const roleRaw = data.role;
  const contactRole =
    typeof roleRaw === 'string' && (ACCOUNT_CONTACT_ROLES as readonly string[]).includes(roleRaw)
      ? accountContactRoleLabel(roleRaw as AccountContactRole)
      : null;
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  return {
    contactRole,
    contactTitle: title || null,
  };
}

async function loadProspectWebsite(client: DbClient, prospectId: number): Promise<string | null> {
  const { data, error } = await client
    .from('prospects')
    .select('website')
    .eq('id', prospectId)
    .maybeSingle();
  if (error || !data) return null;
  return typeof data.website === 'string' ? data.website : null;
}

/**
 * Load allowlisted copy context for one prospect (+ optional contact).
 * Optional loads fail soft → empty fields.
 */
export async function loadOutreachCopyContextPack(
  client: DbClient,
  prospectId: number,
  contactId?: string | null,
): Promise<OutreachCopyContextPack> {
  const empty: OutreachCopyContextPack = {
    storeWebsiteHost: null,
    lockedProfiles: [],
    contactRole: null,
    contactTitle: null,
    recentPublicNotes: [],
    researchBriefBullets: [],
    directorySignals: null,
  };

  if (!Number.isFinite(prospectId) || prospectId <= 0) return empty;

  let lockedProfiles: OutreachLockedProfile[] = [];
  try {
    const locks = await loadSourceLocks(client, prospectId);
    lockedProfiles = lockedProfilesFromSourceLocks(locks);
  } catch {
    /* keep [] */
  }

  const websiteLockHost = lockedProfiles.find((p) => p.platform === 'website')?.hostname ?? null;

  let prospectWebsite: string | null = null;
  try {
    prospectWebsite = await loadProspectWebsite(client, prospectId);
  } catch {
    /* keep null */
  }
  const storeWebsiteHost = websiteLockHost ?? hostnameFromWebsite(prospectWebsite);

  let contactRole: string | null = null;
  let contactTitle: string | null = null;
  const trimmedContactId = typeof contactId === 'string' ? contactId.trim() : '';
  if (trimmedContactId) {
    try {
      const contact = await loadContactRoleTitle(client, trimmedContactId);
      contactRole = contact.contactRole;
      contactTitle = contact.contactTitle;
    } catch {
      /* keep null */
    }
  }

  let recentPublicNotes: string[] = [];
  try {
    recentPublicNotes = await loadAcceptedResearchNotesForOutreach(client, prospectId);
  } catch {
    /* keep [] */
  }

  let researchBriefBullets: string[] = [];
  try {
    const brief = await loadLatestResearchBrief(client, prospectId);
    researchBriefBullets = briefBulletsFromResearchBrief(brief);
  } catch {
    /* keep [] */
  }

  let directorySignals: string | null = null;
  try {
    const yelp = await loadPersistedYelpMatchForRetailer(client, prospectId);
    directorySignals = directorySignalsFromYelpMatch(yelp);
  } catch {
    /* keep null */
  }

  const clipped = clipResearchTextBudget({
    recentPublicNotes,
    researchBriefBullets,
    directorySignals,
  });

  return {
    storeWebsiteHost,
    lockedProfiles,
    contactRole,
    contactTitle,
    recentPublicNotes: clipped.recentPublicNotes,
    researchBriefBullets: clipped.researchBriefBullets,
    directorySignals: clipped.directorySignals,
  };
}
