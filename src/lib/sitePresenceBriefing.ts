/**
 * Briefing helpers: load active site presence and merge into Call today.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';
import { PRESENCE_ACTIVE_WINDOW_MS, isPresenceActive } from '@/lib/presenceVisitToken';

type Client = SupabaseClient<Database>;

export type SitePresenceRow = {
  prospectId: number;
  lastSeenAt: string;
  lastPath: string | null;
  active: boolean;
};

export async function loadActiveSitePresence(
  client: Client,
  opts?: { asOf?: Date; windowMs?: number },
): Promise<SitePresenceRow[]> {
  const asOf = opts?.asOf ?? new Date();
  const windowMs = opts?.windowMs ?? PRESENCE_ACTIVE_WINDOW_MS;
  // Load a slightly wider window so UI can show "Xm ago" after Active expires;
  // Call today merge still uses `active` for pinning.
  const sinceIso = new Date(asOf.getTime() - Math.max(windowMs, 60 * 60 * 1000)).toISOString();

  const { data, error } = await client
    .from('prospect_site_presence')
    .select('prospect_id, last_seen_at, last_path')
    .gte('last_seen_at', sinceIso)
    .order('last_seen_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return data
    .filter((row) => typeof row.prospect_id === 'number' && row.last_seen_at)
    .map((row) => ({
      prospectId: row.prospect_id,
      lastSeenAt: row.last_seen_at,
      lastPath: row.last_path ?? null,
      active: isPresenceActive(row.last_seen_at, asOf, windowMs),
    }));
}

function emptyEngagement(prospectId: number) {
  return {
    prospectId,
    emailsSent: 0,
    lastSentAt: null,
    openCount: 0,
    clickCount: 0,
    messagesOpened: 0,
    messagesClicked: 0,
    distinctProductsOpened: 0,
    distinctProductsClicked: 0,
    maxClickCountOnMessage: 0,
    lastOpenedAt: null,
    lastClickedAt: null,
    lastEngagementAt: null,
    suppressed: false,
    reply: {
      attributed: false as const,
      confidence: 'none' as const,
      lastMessageAt: null,
    },
    unlinkedManualIncluded: 0,
  };
}

/**
 * Ensure active (and recently active) presence prospects appear on Call today
 * with `on_site`, and attach sitePresence metadata for UI tags.
 */
export function mergeSitePresenceIntoCallToday(params: {
  callToday: OutreachLeadRow[];
  allLeads: OutreachLeadRow[];
  presence: SitePresenceRow[];
  prospectNames: Map<number, string>;
  accountStatusById?: Map<number, OutreachLeadRow['accountStatus']>;
}): OutreachLeadRow[] {
  const byId = new Map<number, OutreachLeadRow>();
  for (const row of params.callToday) {
    byId.set(row.prospectId, { ...row, callTodayReasons: [...row.callTodayReasons] });
  }
  const leadById = new Map(params.allLeads.map((l) => [l.prospectId, l]));

  for (const p of params.presence) {
    if (!p.active) {
      // Still attach metadata if already on Call today (show time since).
      const existing = byId.get(p.prospectId);
      if (existing) {
        existing.sitePresence = {
          lastSeenAt: p.lastSeenAt,
          lastPath: p.lastPath,
          active: false,
        };
      }
      continue;
    }

    const existing = byId.get(p.prospectId);
    if (existing) {
      if (!existing.callTodayReasons.includes('on_site')) {
        existing.callTodayReasons = ['on_site', ...existing.callTodayReasons];
      }
      existing.callToday = true;
      existing.sitePresence = {
        lastSeenAt: p.lastSeenAt,
        lastPath: p.lastPath,
        active: true,
      };
      continue;
    }

    const fromLeads = leadById.get(p.prospectId);
    if (fromLeads) {
      byId.set(p.prospectId, {
        ...fromLeads,
        callToday: true,
        callTodayReasons: ['on_site', ...fromLeads.callTodayReasons.filter((r) => r !== 'on_site')],
        sitePresence: {
          lastSeenAt: p.lastSeenAt,
          lastPath: p.lastPath,
          active: true,
        },
      });
      continue;
    }

    const name = params.prospectNames.get(p.prospectId)?.trim() || `Prospect #${p.prospectId}`;
    byId.set(p.prospectId, {
      prospectId: p.prospectId,
      prospectName: name,
      accountStatus: params.accountStatusById?.get(p.prospectId) ?? 'prospect',
      leadState: 'warm',
      callToday: true,
      callTodayReasons: ['on_site'],
      score: OUTREACH_LEAD_RULES.warmScoreMin,
      rulesVersion: OUTREACH_LEAD_RULES.version,
      engagement: emptyEngagement(p.prospectId),
      lastEngagedCatalogItemId: null,
      emailsSentInWindow: 0,
      followUpOverdueDays: null,
      lastCallAtToday: null,
      sitePresence: {
        lastSeenAt: p.lastSeenAt,
        lastPath: p.lastPath,
        active: true,
      },
    });
  }

  return [...byId.values()];
}
