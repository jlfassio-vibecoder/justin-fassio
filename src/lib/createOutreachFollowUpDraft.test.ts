import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateProspectOutreachEngagement } from '@/lib/outreachEngagementAggregate';
import { OUTREACH_LEAD_RULES } from '@/lib/outreachLeadRules';

const listAgentProductOutreachDraftsMock = vi.fn();
const generateOgrProductOutreachDraftMock = vi.fn();
const getOutreachLeadForProspectMock = vi.fn();
const loadUniqueContactEmailsForProspectMock = vi.fn();
const loadOutreachMessagesForProspectMock = vi.fn();
const loadOutreachProductPoolMock = vi.fn();
const fetchRecentProductOutreachCatalogIdsByProspectMock = vi.fn();
const resolveOutreachLeadRulesMock = vi.fn();

vi.mock('@/lib/systemMessages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/systemMessages')>();
  return {
    ...actual,
    listAgentProductOutreachDrafts: (...args: unknown[]) =>
      listAgentProductOutreachDraftsMock(...args),
    fetchRecentProductOutreachCatalogIdsByProspect: (...args: unknown[]) =>
      fetchRecentProductOutreachCatalogIdsByProspectMock(...args),
  };
});

vi.mock('@/lib/generateOgrProductOutreachDraft', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/generateOgrProductOutreachDraft')>();
  return {
    ...actual,
    generateOgrProductOutreachDraft: (...args: unknown[]) =>
      generateOgrProductOutreachDraftMock(...args),
  };
});

vi.mock('@/lib/outreachLeadLists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachLeadLists')>();
  return {
    ...actual,
    getOutreachLeadForProspect: (...args: unknown[]) => getOutreachLeadForProspectMock(...args),
    loadUniqueContactEmailsForProspect: (...args: unknown[]) =>
      loadUniqueContactEmailsForProspectMock(...args),
  };
});

vi.mock('@/lib/outreachEngagementAggregate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachEngagementAggregate')>();
  return {
    ...actual,
    loadOutreachMessagesForProspect: (...args: unknown[]) =>
      loadOutreachMessagesForProspectMock(...args),
  };
});

vi.mock('@/lib/outreachProductSelection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachProductSelection')>();
  return {
    ...actual,
    loadOutreachProductPool: (...args: unknown[]) => loadOutreachProductPoolMock(...args),
  };
});

vi.mock('@/lib/resolveOutreachLeadRules', () => ({
  resolveOutreachLeadRules: (...args: unknown[]) => resolveOutreachLeadRulesMock(...args),
}));

import { createOutreachFollowUpDraft } from '@/lib/createOutreachFollowUpDraft';
import type { OutreachLeadRow } from '@/lib/outreachLeadLists';

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const asOf = new Date('2026-08-10T12:00:00Z');

const poolProductA = {
  id: PRODUCT_A,
  sku: 'A',
  name: 'Product A',
  publicSlug: 'product-a',
  isNew: false,
  publicSortOrder: 1,
  recommendedChannels: [],
  lifestyleThemes: [],
  salesRank: 1,
};
const poolProductB = {
  ...poolProductA,
  id: PRODUCT_B,
  sku: 'B',
  name: 'Product B',
  publicSlug: 'product-b',
  publicSortOrder: 2,
  salesRank: 2,
};

function warmClickLead(emailsSentInWindow: number): OutreachLeadRow {
  const messages = [
    {
      id: '1',
      prospect_id: 12,
      to_email: 'buyer@example.com',
      catalog_item_id: PRODUCT_A,
      sent_at: '2026-08-08T00:00:00Z',
      open_count: 1,
      click_count: 1,
      last_opened_at: '2026-08-09T00:00:00Z',
      last_clicked_at: '2026-08-09T00:00:00Z',
      bounced_at: null,
      complained_at: null,
      status: 'sent' as const,
    },
  ];
  return {
    prospectId: 12,
    prospectName: 'Warm Shop',
    accountStatus: 'prospect',
    leadState: 'warm',
    callToday: false,
    callTodayReasons: [],
    score: 5,
    rulesVersion: 'v1-provisional',
    engagement: aggregateProspectOutreachEngagement({ prospectId: 12, messages }),
    lastEngagedCatalogItemId: PRODUCT_A,
    emailsSentInWindow,
    followUpOverdueDays: null,
    lastCallAtToday: null,
  };
}

describe('createOutreachFollowUpDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveOutreachLeadRulesMock.mockResolvedValue({
      rules: OUTREACH_LEAD_RULES,
      source: 'provisional',
      meta: { adjustedFields: [] },
    });
    loadUniqueContactEmailsForProspectMock.mockResolvedValue(['buyer@example.com']);
    loadOutreachMessagesForProspectMock.mockResolvedValue({
      messages: [
        {
          id: '1',
          prospect_id: 12,
          to_email: 'buyer@example.com',
          catalog_item_id: PRODUCT_A,
          sent_at: '2026-08-08T00:00:00Z',
          open_count: 1,
          click_count: 1,
          last_opened_at: '2026-08-09T00:00:00Z',
          last_clicked_at: '2026-08-09T00:00:00Z',
          bounced_at: null,
          complained_at: null,
          status: 'sent',
        },
      ],
      unlinkedManualIncluded: 0,
    });
    loadOutreachProductPoolMock.mockResolvedValue({
      ok: true,
      pool: [poolProductA, poolProductB],
    });
    fetchRecentProductOutreachCatalogIdsByProspectMock.mockResolvedValue({
      ok: true,
      byProspectId: new Map([[12, new Set([PRODUCT_A])]]),
    });
    generateOgrProductOutreachDraftMock.mockResolvedValue({
      ok: true,
      draftId: 'new-draft',
      subject: 'Sub',
      introText: 'Intro',
      closingText: 'Close',
      fallback: 'none',
    });
  });

  it('reuses a pending draft without generating', async () => {
    listAgentProductOutreachDraftsMock.mockResolvedValue({
      ok: true,
      drafts: [
        {
          id: 'pending-1',
          catalogItemId: PRODUCT_B,
          payload: { name: 'Product B', sku: 'B' },
        },
      ],
    });
    const client = { from: vi.fn() } as never;
    const result = await createOutreachFollowUpDraft({
      client,
      prospectId: 12,
      userId: 'staff-1',
      asOf,
    });
    expect(result).toEqual({
      ok: true,
      draftId: 'pending-1',
      catalogItemId: PRODUCT_B,
      productName: 'Product B',
      reusedPending: true,
    });
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('rejects open-only cooldown', async () => {
    listAgentProductOutreachDraftsMock.mockResolvedValue({ ok: true, drafts: [] });
    const lead = warmClickLead(1);
    lead.engagement = {
      ...lead.engagement,
      clickCount: 0,
      lastClickedAt: null,
      distinctProductsClicked: 0,
    };
    getOutreachLeadForProspectMock.mockResolvedValue(lead);
    const result = await createOutreachFollowUpDraft({
      client: { from: vi.fn() } as never,
      prospectId: 12,
      userId: 'staff-1',
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(409);
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('rejects a second send in the window', async () => {
    listAgentProductOutreachDraftsMock.mockResolvedValue({ ok: true, drafts: [] });
    getOutreachLeadForProspectMock.mockResolvedValue(warmClickLead(2));
    const result = await createOutreachFollowUpDraft({
      client: { from: vi.fn() } as never,
      prospectId: 12,
      userId: 'staff-1',
      asOf,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/follow-up/i);
    }
  });

  it('generates a next-SKU draft when cooldown has a click', async () => {
    listAgentProductOutreachDraftsMock.mockResolvedValue({ ok: true, drafts: [] });
    getOutreachLeadForProspectMock.mockResolvedValue(warmClickLead(1));
    const from = vi.fn((table: string) => {
      const result = { data: null as unknown, error: null as unknown };
      if (table === 'prospects') {
        result.data = {
          id: 12,
          name: 'Warm Shop',
          category: 'golf_retail',
          region: 'Oregon',
          city: 'Portland',
          address: '',
          phone: null,
          fit: null,
          account_status: 'prospect',
          converted_at: null,
          initial_order_date: null,
          notes: null,
          territory_id: null,
          operational_territory_id: null,
          external_id: null,
          subterritory: null,
          primary_district: null,
          retail_category: null,
          website: null,
          fit_score: 8,
          ideal_opening_units: null,
          priority: 'Tier 1',
          provisional_grade: null,
          verification_status: null,
          buyer_verified: false,
          import_protected: false,
          apparel_capability: null,
          existing_ogr: null,
          qualification_status: null,
          next_action: null,
          source_note: null,
          postal_code: null,
          secondary_channels: [],
          retail_subchannels: [],
          venue_contexts: [],
          lifestyle_themes: [],
          retail_capabilities: [],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
      }
      if (table === 'account_contacts') {
        result.data = [
          {
            id: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            account_id: 12,
            role: 'buyer',
            full_name: 'Sam Buyer',
            title: null,
            phone: null,
            email: 'buyer@example.com',
            is_primary: true,
            notes: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ];
      }
      const api: Record<string, unknown> = {};
      const self = () =>
        Object.assign(api, {
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(result).then(onFulfilled, onRejected);
          },
        });
      for (const key of ['select', 'eq', 'order', 'in', 'not', 'maybeSingle']) {
        api[key] = vi.fn(self);
      }
      api.maybeSingle = vi.fn(async () => result);
      return self();
    });

    const result = await createOutreachFollowUpDraft({
      client: { from } as never,
      prospectId: 12,
      userId: 'staff-1',
      asOf,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reusedPending).toBe(false);
      expect(result.catalogItemId).toBe(PRODUCT_B);
    }
    expect(generateOgrProductOutreachDraftMock).toHaveBeenCalled();
    const genArg = generateOgrProductOutreachDraftMock.mock.calls[0]?.[1] as {
      target: { catalogItemId: string };
    };
    expect(genArg.target.catalogItemId).toBe(PRODUCT_B);
  });

  it('bumps the clicked SKU when the pool is exhausted by dedup', async () => {
    listAgentProductOutreachDraftsMock.mockResolvedValue({ ok: true, drafts: [] });
    getOutreachLeadForProspectMock.mockResolvedValue(warmClickLead(1));
    fetchRecentProductOutreachCatalogIdsByProspectMock.mockResolvedValue({
      ok: true,
      byProspectId: new Map([[12, new Set([PRODUCT_A, PRODUCT_B])]]),
    });
    const from = vi.fn((table: string) => {
      const result = { data: null as unknown, error: null as unknown };
      if (table === 'prospects') {
        result.data = {
          id: 12,
          name: 'Warm Shop',
          category: 'golf_retail',
          region: 'Oregon',
          city: 'Portland',
          address: '',
          phone: null,
          fit: null,
          account_status: 'prospect',
          converted_at: null,
          initial_order_date: null,
          notes: null,
          territory_id: null,
          operational_territory_id: null,
          external_id: null,
          subterritory: null,
          primary_district: null,
          retail_category: null,
          website: null,
          fit_score: 8,
          ideal_opening_units: null,
          priority: 'Tier 1',
          provisional_grade: null,
          verification_status: null,
          buyer_verified: false,
          import_protected: false,
          apparel_capability: null,
          existing_ogr: null,
          qualification_status: null,
          next_action: null,
          source_note: null,
          postal_code: null,
          secondary_channels: [],
          retail_subchannels: [],
          venue_contexts: [],
          lifestyle_themes: [],
          retail_capabilities: [],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        };
      }
      if (table === 'account_contacts') {
        result.data = [
          {
            id: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
            account_id: 12,
            role: 'buyer',
            full_name: 'Sam Buyer',
            title: null,
            phone: null,
            email: 'buyer@example.com',
            is_primary: true,
            notes: null,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ];
      }
      const api: Record<string, unknown> = {};
      const self = () =>
        Object.assign(api, {
          then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
            return Promise.resolve(result).then(onFulfilled, onRejected);
          },
        });
      for (const key of ['select', 'eq', 'order', 'in', 'not', 'maybeSingle']) {
        api[key] = vi.fn(self);
      }
      api.maybeSingle = vi.fn(async () => result);
      return self();
    });

    const result = await createOutreachFollowUpDraft({
      client: { from } as never,
      prospectId: 12,
      userId: 'staff-1',
      asOf,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.catalogItemId).toBe(PRODUCT_A);
    const genArg = generateOgrProductOutreachDraftMock.mock.calls[0]?.[1] as {
      target: { catalogItemId: string };
    };
    expect(genArg.target.catalogItemId).toBe(PRODUCT_A);
  });
});
