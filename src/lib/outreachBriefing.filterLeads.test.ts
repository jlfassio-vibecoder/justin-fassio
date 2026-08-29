import { describe, expect, it, vi } from 'vitest';
import { filterOutreachLeadsByPrepScope } from '@/lib/outreachBriefing';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';

function stubLead(prospectId: number, name: string): OutreachLeadRow {
  return {
    prospectId,
    prospectName: name,
    accountStatus: 'prospect',
    leadState: 'warm',
    callToday: false,
    callTodayReasons: [],
    score: 5,
    rulesVersion: OUTREACH_LEAD_RULES.version,
    engagement: {
      prospectId,
      emailsSent: 1,
      lastSentAt: '2026-08-28T12:00:00Z',
      openCount: 1,
      clickCount: 0,
      messagesOpened: 1,
      messagesClicked: 0,
      distinctProductsOpened: 1,
      distinctProductsClicked: 0,
      maxClickCountOnMessage: 0,
      lastOpenedAt: '2026-08-28T12:00:00Z',
      lastClickedAt: null,
      lastEngagementAt: '2026-08-28T12:00:00Z',
      suppressed: false,
      reply: { attributed: false, confidence: 'none', lastMessageAt: null },
      unlinkedManualIncluded: 0,
    },
    lastEngagedCatalogItemId: null,
    emailsSentInWindow: 1,
    followUpOverdueDays: null,
    lastCallAtToday: null,
  };
}

function thenableClient(prospectRows: Array<{ id: number; region: string; city?: string | null }>) {
  const thenable = (result: { data: unknown; error: unknown }) => {
    const api: Record<string, unknown> = {};
    const self = () => thenable(result);
    for (const key of ['select', 'eq', 'in', 'not', 'or', 'is', 'lte', 'gte', 'order', 'limit']) {
      api[key] = vi.fn(self);
    }
    api.maybeSingle = vi.fn(async () => result);
    return {
      ...api,
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    };
  };
  return {
    from: vi.fn((table: string) => {
      if (table === 'prospects') {
        return thenable({ data: prospectRows, error: null });
      }
      return thenable({ data: [], error: null });
    }),
  };
}

describe('filterOutreachLeadsByPrepScope', () => {
  it('returns all leads when no region or city scope', async () => {
    const leads = [stubLead(1, 'A'), stubLead(2, 'B')];
    const client = thenableClient([]);
    const filtered = await filterOutreachLeadsByPrepScope({
      client: client as never,
      leads,
      crmRegion: null,
      city: null,
    });
    expect(filtered).toEqual(leads);
    expect(client.from).not.toHaveBeenCalled();
  });

  it('keeps only leads matching crmRegion', async () => {
    const leads = [stubLead(10, 'Coast'), stubLead(20, 'Inland')];
    const client = thenableClient([
      { id: 10, region: 'Oregon Coast', city: 'Newport' },
      { id: 20, region: 'Willamette Valley', city: 'Salem' },
    ]);
    const filtered = await filterOutreachLeadsByPrepScope({
      client: client as never,
      leads,
      crmRegion: 'Oregon Coast',
      city: null,
      storeTerritoryCode: 'or',
    });
    expect(filtered.map((l) => l.prospectId)).toEqual([10]);
  });

  it('applies city filter when set', async () => {
    const leads = [stubLead(10, 'Newport'), stubLead(11, 'Florence')];
    const client = thenableClient([
      { id: 10, region: 'Oregon Coast', city: 'Newport' },
      { id: 11, region: 'Oregon Coast', city: 'Florence' },
    ]);
    const filtered = await filterOutreachLeadsByPrepScope({
      client: client as never,
      leads,
      crmRegion: 'Oregon Coast',
      city: 'Newport',
      storeTerritoryCode: 'or',
    });
    expect(filtered.map((l) => l.prospectId)).toEqual([10]);
  });

  it('drops leads with no prospect row', async () => {
    const leads = [stubLead(99, 'Ghost')];
    const client = thenableClient([]);
    const filtered = await filterOutreachLeadsByPrepScope({
      client: client as never,
      leads,
      crmRegion: 'Oregon Coast',
      city: null,
    });
    expect(filtered).toEqual([]);
  });
});
