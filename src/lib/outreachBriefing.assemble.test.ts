import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadOutreachGoalDashboardSnapshotMock = vi.fn();
const getRegionalOutreachPrepRunMock = vi.fn();
const getLatestRegionalOutreachPrepRunMock = vi.fn();
const getLatestOutreachAutomationRunForDateMock = vi.fn();
const listAgentProductOutreachDraftsMock = vi.fn();
const listOutreachLeadsMock = vi.fn();
const fetchPendingAgentProductOutreachProspectIdsMock = vi.fn();
const loadActiveFollowUpSnoozesMock = vi.fn();
const loadResearchQueueDismissalsMock = vi.fn();
const resolveOutreachLeadRulesMock = vi.fn();
const selectOutreachTargetsMock = vi.fn();
const buildFollowUpQueueMock = vi.fn();

vi.mock('@/lib/outreachGoalDashboard', () => ({
  loadOutreachGoalDashboardSnapshot: (...args: unknown[]) =>
    loadOutreachGoalDashboardSnapshotMock(...args),
}));

vi.mock('@/lib/outreachNightlyPrep', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachNightlyPrep')>();
  return {
    ...actual,
    getRegionalOutreachPrepRun: (...args: unknown[]) => getRegionalOutreachPrepRunMock(...args),
    getLatestRegionalOutreachPrepRun: (...args: unknown[]) =>
      getLatestRegionalOutreachPrepRunMock(...args),
    getLatestOutreachAutomationRunForDate: (...args: unknown[]) =>
      getLatestOutreachAutomationRunForDateMock(...args),
  };
});

vi.mock('@/lib/systemMessages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/systemMessages')>();
  return {
    ...actual,
    listAgentProductOutreachDrafts: (...args: unknown[]) =>
      listAgentProductOutreachDraftsMock(...args),
    fetchPendingAgentProductOutreachProspectIds: (...args: unknown[]) =>
      fetchPendingAgentProductOutreachProspectIdsMock(...args),
  };
});

vi.mock('@/lib/outreachLeadLists', () => ({
  listOutreachLeads: (...args: unknown[]) => listOutreachLeadsMock(...args),
}));

vi.mock('@/lib/outreachFollowUpSnooze', () => ({
  loadActiveFollowUpSnoozes: (...args: unknown[]) => loadActiveFollowUpSnoozesMock(...args),
}));

vi.mock('@/lib/outreachResearchQueueDismiss', () => ({
  loadResearchQueueDismissals: (...args: unknown[]) => loadResearchQueueDismissalsMock(...args),
}));

vi.mock('@/lib/resolveOutreachLeadRules', () => ({
  resolveOutreachLeadRules: (...args: unknown[]) => resolveOutreachLeadRulesMock(...args),
}));

vi.mock('@/lib/outreachSelectTargets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachSelectTargets')>();
  return {
    ...actual,
    selectOutreachTargets: (...args: unknown[]) => selectOutreachTargetsMock(...args),
  };
});

vi.mock('@/lib/outreachFollowUpQueue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachFollowUpQueue')>();
  return {
    ...actual,
    buildFollowUpQueue: (...args: unknown[]) => buildFollowUpQueueMock(...args),
  };
});

import { assembleOutreachBriefing } from '@/lib/outreachBriefing';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';

describe('assembleOutreachBriefing carryover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadOutreachGoalDashboardSnapshotMock.mockResolvedValue({
      ok: true,
      snapshot: {
        settings: { businessTimezone: 'America/Vancouver', adaptiveWeightsEnabled: true },
        progress: {
          monthlyTarget: 5,
          mtdAccounts: 1,
          remainingGoal: 4,
        },
        pace: {
          projectedAttainment: 4,
          recommendedDailySends: 3,
          rateSource: 'planning',
          goalMet: false,
        },
        performance: null,
      },
    });
    getRegionalOutreachPrepRunMock.mockResolvedValue({ ok: true, run: null });
    getLatestRegionalOutreachPrepRunMock.mockResolvedValue({
      ok: true,
      run: {
        id: 'prior-run',
        runDate: '2026-08-26',
        kind: 'manual_regional_prep',
        status: 'succeeded',
        channelAllocation: {
          identifiedTargets: [
            {
              prospectId: 99,
              prospectName: 'Needs Email Co',
              catalogItemId: 'c1',
              productName: 'Hat',
              productSku: 'SKU',
              productSlug: 'hat',
              primaryChannel: 'golf',
              needsEmail: true,
            },
            {
              prospectId: 12,
              prospectName: 'Already Drafted',
              catalogItemId: 'c1',
              productName: 'Hat',
              productSku: 'SKU',
              productSlug: 'hat',
              primaryChannel: 'golf',
              needsEmail: true,
            },
          ],
        },
      },
    });
    listAgentProductOutreachDraftsMock.mockResolvedValue({
      ok: true,
      drafts: [
        {
          id: 'draft-old',
          prospectId: 12,
          toName: 'Carryover Cafe',
          catalogItemId: 'c1',
          toEmail: 'a@b.com',
          createdAt: '2026-08-26T12:00:00.000Z',
          payload: {
            name: 'Hat',
            sku: 'SKU',
            slug: 'hat',
            generation: {
              preparationDate: '2026-08-26',
              primaryChannel: 'golf',
            },
          },
        },
      ],
    });
    listOutreachLeadsMock.mockResolvedValue([]);
    fetchPendingAgentProductOutreachProspectIdsMock.mockResolvedValue({
      ok: true,
      prospectIds: new Set([12]),
    });
    loadActiveFollowUpSnoozesMock.mockResolvedValue(new Set());
    loadResearchQueueDismissalsMock.mockResolvedValue(new Set());
    resolveOutreachLeadRulesMock.mockResolvedValue({
      rules: OUTREACH_LEAD_RULES,
      source: 'provisional',
      meta: { adjustedFields: [] },
    });
    buildFollowUpQueueMock.mockReturnValue([]);
    selectOutreachTargetsMock.mockResolvedValue({
      ok: true,
      targets: [],
      diagnostics: null,
    });
  });

  it('keeps yesterday pending drafts mounted and marks fromEarlierPrep', async () => {
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

    const client = {
      from: vi.fn((table: string) => {
        if (table === 'prospects') {
          return thenable({
            data: [
              {
                id: 12,
                name: 'Carryover Cafe',
                account_status: 'prospect',
                region: 'Oregon Coast',
              },
            ],
            error: null,
          });
        }
        return thenable({ data: [], error: null });
      }),
    };

    const result = await assembleOutreachBriefing({
      client: client as never,
      asOf: new Date('2026-08-27T18:00:00Z'),
      regionalPrepScope: {
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        crmRegion: 'Oregon Coast',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(listAgentProductOutreachDraftsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        prepScope: true,
        limit: 100,
      }),
    );
    const call = listAgentProductOutreachDraftsMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call.automationRunId).toBeUndefined();
    expect(call.preparationDate).toBeUndefined();

    expect(result.briefing.drafts).toEqual([
      expect.objectContaining({
        draftId: 'draft-old',
        prospectId: 12,
        fromEarlierPrep: true,
        preparationDate: '2026-08-26',
      }),
    ]);
    expect(result.briefing.identifiedTargets).toEqual([
      expect.objectContaining({ prospectId: 99, hasUsableEmail: false }),
    ]);
  });

  it('excludes research-queue dismissals from identifiedTargets', async () => {
    loadResearchQueueDismissalsMock.mockResolvedValue(new Set([99]));
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
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'prospects') {
          return thenable({
            data: [
              {
                id: 12,
                name: 'Carryover Cafe',
                account_status: 'prospect',
                region: 'Oregon Coast',
              },
            ],
            error: null,
          });
        }
        return thenable({ data: [], error: null });
      }),
    };

    const result = await assembleOutreachBriefing({
      client: client as never,
      asOf: new Date('2026-08-27T18:00:00Z'),
      regionalPrepScope: {
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        crmRegion: 'Oregon Coast',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.briefing.identifiedTargets.map((t) => t.prospectId)).toEqual([]);
  });

  it('excludes identifiedTargets still within outreach cooldown after send', async () => {
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
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'prospects') {
          return thenable({
            data: [
              {
                id: 12,
                name: 'Carryover Cafe',
                account_status: 'prospect',
                region: 'Oregon Coast',
              },
            ],
            error: null,
          });
        }
        if (table === 'system_messages') {
          return thenable({
            data: [
              {
                prospect_id: 99,
                to_email: 'needs@example.com',
                sent_at: '2026-08-25T12:00:00Z',
              },
            ],
            error: null,
          });
        }
        return thenable({ data: [], error: null });
      }),
    };

    const result = await assembleOutreachBriefing({
      client: client as never,
      asOf: new Date('2026-08-27T18:00:00Z'),
      regionalPrepScope: {
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        crmRegion: 'Oregon Coast',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.briefing.identifiedTargets.map((t) => t.prospectId)).toEqual([]);
  });

  it('excludes identifiedTargets when their contact email is in cooldown on another account', async () => {
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
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'prospects') {
          return thenable({
            data: [
              {
                id: 12,
                name: 'Carryover Cafe',
                account_status: 'prospect',
                region: 'Oregon Coast',
              },
            ],
            error: null,
          });
        }
        if (table === 'account_contacts') {
          return thenable({
            data: [
              {
                id: 'c-99',
                account_id: 99,
                role: 'buyer',
                full_name: 'Shared Buyer',
                title: null,
                phone: null,
                email: 'shared@example.com',
                is_primary: true,
                notes: null,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ],
            error: null,
          });
        }
        if (table === 'system_messages') {
          return thenable({
            data: [
              {
                prospect_id: 673,
                to_email: 'shared@example.com',
                sent_at: '2026-08-25T12:00:00Z',
              },
            ],
            error: null,
          });
        }
        return thenable({ data: [], error: null });
      }),
    };

    const result = await assembleOutreachBriefing({
      client: client as never,
      asOf: new Date('2026-08-27T18:00:00Z'),
      regionalPrepScope: {
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        crmRegion: 'Oregon Coast',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.briefing.identifiedTargets.map((t) => t.prospectId)).toEqual([]);
  });

  it('keeps identifiedTargets after cooldown window ends', async () => {
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
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'prospects') {
          return thenable({
            data: [
              {
                id: 12,
                name: 'Carryover Cafe',
                account_status: 'prospect',
                region: 'Oregon Coast',
              },
            ],
            error: null,
          });
        }
        if (table === 'system_messages') {
          return thenable({
            data: [
              {
                prospect_id: 99,
                to_email: 'needs@example.com',
                sent_at: '2026-07-01T12:00:00Z',
              },
            ],
            error: null,
          });
        }
        if (table === 'account_contacts') {
          return thenable({
            data: [
              {
                id: 'c-99',
                account_id: 99,
                role: 'buyer',
                full_name: 'Needs Email',
                title: null,
                phone: null,
                email: 'needs@example.com',
                is_primary: true,
                notes: null,
                created_at: '2026-01-01T00:00:00Z',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ],
            error: null,
          });
        }
        return thenable({ data: [], error: null });
      }),
    };

    const result = await assembleOutreachBriefing({
      client: client as never,
      asOf: new Date('2026-08-27T18:00:00Z'),
      regionalPrepScope: {
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        crmRegion: 'Oregon Coast',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.briefing.identifiedTargets).toEqual([
      expect.objectContaining({ prospectId: 99, hasUsableEmail: true }),
    ]);
  });

  it('passes region-filtered leads into buildFollowUpQueue', async () => {
    listOutreachLeadsMock.mockResolvedValue([
      {
        prospectId: 10,
        prospectName: 'Coast Shop',
        accountStatus: 'prospect',
        leadState: 'warm',
        callToday: false,
        callTodayReasons: [],
        score: 5,
        rulesVersion: OUTREACH_LEAD_RULES.version,
        engagement: {
          prospectId: 10,
          emailsSent: 1,
          lastSentAt: null,
          openCount: 1,
          clickCount: 0,
          messagesOpened: 1,
          messagesClicked: 0,
          distinctProductsOpened: 1,
          distinctProductsClicked: 0,
          maxClickCountOnMessage: 0,
          lastOpenedAt: null,
          lastClickedAt: null,
          lastEngagementAt: null,
          suppressed: false,
          reply: { attributed: false, confidence: 'none', lastMessageAt: null },
          unlinkedManualIncluded: 0,
        },
        lastEngagedCatalogItemId: null,
        emailsSentInWindow: 1,
        followUpOverdueDays: null,
        lastCallAtToday: null,
      },
      {
        prospectId: 20,
        prospectName: 'Valley Shop',
        accountStatus: 'prospect',
        leadState: 'warm',
        callToday: false,
        callTodayReasons: [],
        score: 4,
        rulesVersion: OUTREACH_LEAD_RULES.version,
        engagement: {
          prospectId: 20,
          emailsSent: 1,
          lastSentAt: null,
          openCount: 1,
          clickCount: 0,
          messagesOpened: 1,
          messagesClicked: 0,
          distinctProductsOpened: 1,
          distinctProductsClicked: 0,
          maxClickCountOnMessage: 0,
          lastOpenedAt: null,
          lastClickedAt: null,
          lastEngagementAt: null,
          suppressed: false,
          reply: { attributed: false, confidence: 'none', lastMessageAt: null },
          unlinkedManualIncluded: 0,
        },
        lastEngagedCatalogItemId: null,
        emailsSentInWindow: 1,
        followUpOverdueDays: null,
        lastCallAtToday: null,
      },
    ]);
    buildFollowUpQueueMock.mockReturnValue([
      {
        prospectId: 10,
        prospectName: 'Coast Shop',
        accountStatus: 'prospect',
        leadState: 'warm',
        recommendedAction: 'email',
        reasonLine: '1 sent',
        talkTrackHint: null,
        lastEngagedAt: null,
        lastProductName: null,
        lastProductId: null,
        score: 5,
        followUpOverdueDays: null,
      },
    ]);

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
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'prospects') {
          return thenable({
            data: [
              {
                id: 12,
                name: 'Carryover Cafe',
                account_status: 'prospect',
                region: 'Oregon Coast',
                city: 'Newport',
              },
              { id: 10, region: 'Oregon Coast', city: 'Newport' },
              { id: 20, region: 'Willamette Valley', city: 'Salem' },
            ],
            error: null,
          });
        }
        return thenable({ data: [], error: null });
      }),
    };

    const result = await assembleOutreachBriefing({
      client: client as never,
      asOf: new Date('2026-08-27T18:00:00Z'),
      regionalPrepScope: {
        operationalTerritoryId: 'ops-pnw-west',
        storeTerritoryCode: 'or',
        crmRegion: 'Oregon Coast',
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const queueArg = buildFollowUpQueueMock.mock.calls[0]?.[0] as {
      leads: Array<{ prospectId: number }>;
    };
    expect(queueArg.leads.map((l) => l.prospectId)).toEqual([10]);
    expect(result.briefing.followUps.map((r) => r.prospectId)).toEqual([10]);
  });

  it('passes all leads into buildFollowUpQueue when no region/city scope', async () => {
    getLatestOutreachAutomationRunForDateMock.mockResolvedValue({ ok: true, run: null });
    listOutreachLeadsMock.mockResolvedValue([
      {
        prospectId: 10,
        prospectName: 'Coast Shop',
        accountStatus: 'prospect',
        leadState: 'warm',
        callToday: false,
        callTodayReasons: [],
        score: 5,
        rulesVersion: OUTREACH_LEAD_RULES.version,
        engagement: {
          prospectId: 10,
          emailsSent: 1,
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
          reply: { attributed: false, confidence: 'none', lastMessageAt: null },
          unlinkedManualIncluded: 0,
        },
        lastEngagedCatalogItemId: null,
        emailsSentInWindow: 1,
        followUpOverdueDays: null,
        lastCallAtToday: null,
      },
      {
        prospectId: 20,
        prospectName: 'Valley Shop',
        accountStatus: 'prospect',
        leadState: 'warm',
        callToday: false,
        callTodayReasons: [],
        score: 4,
        rulesVersion: OUTREACH_LEAD_RULES.version,
        engagement: {
          prospectId: 20,
          emailsSent: 1,
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
          reply: { attributed: false, confidence: 'none', lastMessageAt: null },
          unlinkedManualIncluded: 0,
        },
        lastEngagedCatalogItemId: null,
        emailsSentInWindow: 1,
        followUpOverdueDays: null,
        lastCallAtToday: null,
      },
    ]);
    buildFollowUpQueueMock.mockReturnValue([]);

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
    const client = {
      from: vi.fn(() => thenable({ data: [], error: null })),
    };

    const result = await assembleOutreachBriefing({
      client: client as never,
      asOf: new Date('2026-08-27T18:00:00Z'),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const queueArg = buildFollowUpQueueMock.mock.calls[0]?.[0] as {
      leads: Array<{ prospectId: number }>;
    };
    expect(queueArg.leads.map((l) => l.prospectId)).toEqual([10, 20]);
  });
});
