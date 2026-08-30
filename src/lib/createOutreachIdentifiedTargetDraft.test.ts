import { beforeEach, describe, expect, it, vi } from 'vitest';

const listAgentProductOutreachDraftsMock = vi.fn();
const generateOgrProductOutreachDraftMock = vi.fn();
const getLatestRegionalOutreachPrepRunMock = vi.fn();
const selectProductForProspectMock = vi.fn();
const loadLatestProductOutreachSendsMock = vi.fn();

vi.mock('@/lib/systemMessages', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/systemMessages')>();
  return {
    ...actual,
    listAgentProductOutreachDrafts: (...args: unknown[]) =>
      listAgentProductOutreachDraftsMock(...args),
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

vi.mock('@/lib/outreachNightlyPrep', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachNightlyPrep')>();
  return {
    ...actual,
    getLatestRegionalOutreachPrepRun: (...args: unknown[]) =>
      getLatestRegionalOutreachPrepRunMock(...args),
  };
});

vi.mock('@/lib/outreachProductSelection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachProductSelection')>();
  return {
    ...actual,
    selectProductForProspect: (...args: unknown[]) => selectProductForProspectMock(...args),
  };
});

vi.mock('@/lib/outreachLatestSends', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/outreachLatestSends')>();
  return {
    ...actual,
    loadLatestProductOutreachSends: (...args: unknown[]) =>
      loadLatestProductOutreachSendsMock(...args),
  };
});

import { createOutreachIdentifiedTargetDraft } from '@/lib/createOutreachIdentifiedTargetDraft';

const PRODUCT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRODUCT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RUN_ID = 'run-regional-1';

const prospectRow = {
  id: 12,
  name: 'Research Shop',
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

const contactRow = {
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
};

function chainFrom(
  table: string,
  contacts: unknown[] | null = [contactRow],
  options?: { suppressedSystemMessages?: unknown[] },
) {
  const result = { data: null as unknown, error: null as unknown };
  if (table === 'prospects') result.data = prospectRow;
  if (table === 'account_contacts') result.data = contacts;
  if (table === 'system_messages') result.data = options?.suppressedSystemMessages ?? [];
  const api: Record<string, unknown> = {};
  const self = () =>
    Object.assign(api, {
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    });
  for (const key of ['select', 'eq', 'order', 'in', 'not', 'or', 'ilike', 'limit', 'maybeSingle']) {
    api[key] = vi.fn(self);
  }
  api.maybeSingle = vi.fn(async () => result);
  return self();
}

describe('createOutreachIdentifiedTargetDraft', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAgentProductOutreachDraftsMock.mockResolvedValue({ ok: true, drafts: [] });
    loadLatestProductOutreachSendsMock.mockResolvedValue({
      ok: true,
      byProspectId: new Map(),
      byEmail: new Map(),
    });
    getLatestRegionalOutreachPrepRunMock.mockResolvedValue({
      ok: true,
      run: {
        id: RUN_ID,
        channelAllocation: {
          identifiedTargets: [
            {
              prospectId: 12,
              prospectName: 'Research Shop',
              catalogItemId: PRODUCT_A,
              productName: 'Frozen Product A',
              productSku: 'A',
              productSlug: 'product-a',
              primaryChannel: 'golf',
              needsEmail: true,
            },
          ],
        },
      },
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
    const result = await createOutreachIdentifiedTargetDraft({
      client: { from: vi.fn() } as never,
      prospectId: 12,
      catalogItemId: PRODUCT_A,
      operationalTerritoryId: 'ops-1',
      preparationDate: '2026-08-25',
      userId: 'staff-1',
    });
    expect(result).toEqual({
      ok: true,
      draftId: 'pending-1',
      catalogItemId: PRODUCT_B,
      productName: 'Product B',
      reusedPending: true,
    });
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
    expect(getLatestRegionalOutreachPrepRunMock).not.toHaveBeenCalled();
    expect(selectProductForProspectMock).not.toHaveBeenCalled();
  });

  it('returns no_email when live contact has no usable email', async () => {
    const from = vi.fn((table: string) => chainFrom(table, []));
    const result = await createOutreachIdentifiedTargetDraft({
      client: { from } as never,
      prospectId: 12,
      catalogItemId: PRODUCT_A,
      operationalTerritoryId: 'ops-1',
      preparationDate: '2026-08-25',
      userId: 'staff-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/no usable outreach email/i);
    }
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
    expect(selectProductForProspectMock).not.toHaveBeenCalled();
  });

  it('rejects when live contact email is suppressed', async () => {
    const from = vi.fn((table: string) =>
      chainFrom(table, [contactRow], {
        suppressedSystemMessages: [{ id: 'sup-1', to_email: 'buyer@example.com' }],
      }),
    );
    const result = await createOutreachIdentifiedTargetDraft({
      client: { from } as never,
      prospectId: 12,
      catalogItemId: PRODUCT_A,
      operationalTerritoryId: 'ops-1',
      preparationDate: '2026-08-25',
      userId: 'staff-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/suppressed/i);
    }
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('rejects when prospect is within outreach cooldown', async () => {
    loadLatestProductOutreachSendsMock.mockResolvedValue({
      ok: true,
      byProspectId: new Map([[12, '2026-08-20T12:00:00Z']]),
      byEmail: new Map(),
    });
    const from = vi.fn((table: string) => chainFrom(table));
    const result = await createOutreachIdentifiedTargetDraft({
      client: { from } as never,
      prospectId: 12,
      catalogItemId: PRODUCT_A,
      operationalTerritoryId: 'ops-1',
      preparationDate: '2026-08-25',
      userId: 'staff-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/cooldown/i);
    }
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('rejects when contact email is within cooldown on another account', async () => {
    loadLatestProductOutreachSendsMock.mockResolvedValue({
      ok: true,
      byProspectId: new Map(),
      byEmail: new Map([['buyer@example.com', '2026-08-20T12:00:00Z']]),
    });
    const from = vi.fn((table: string) => chainFrom(table));
    const result = await createOutreachIdentifiedTargetDraft({
      client: { from } as never,
      prospectId: 12,
      catalogItemId: PRODUCT_A,
      operationalTerritoryId: 'ops-1',
      preparationDate: '2026-08-25',
      userId: 'staff-1',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.error).toMatch(/contact email was emailed/i);
      expect(result.error).toMatch(/shared/i);
    }
    expect(generateOgrProductOutreachDraftMock).not.toHaveBeenCalled();
  });

  it('drafts with frozen product and live contact (does not re-select product)', async () => {
    const from = vi.fn((table: string) => chainFrom(table));
    const result = await createOutreachIdentifiedTargetDraft({
      client: { from } as never,
      prospectId: 12,
      catalogItemId: PRODUCT_A,
      operationalTerritoryId: 'ops-1',
      storeTerritoryCode: 'or',
      crmRegion: 'Oregon',
      preparationDate: '2026-08-25',
      userId: 'staff-1',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.reusedPending).toBe(false);
      expect(result.catalogItemId).toBe(PRODUCT_A);
      expect(result.productName).toBe('Frozen Product A');
      expect(result.draftId).toBe('new-draft');
    }
    expect(selectProductForProspectMock).not.toHaveBeenCalled();
    expect(generateOgrProductOutreachDraftMock).toHaveBeenCalled();
    const genArg = generateOgrProductOutreachDraftMock.mock.calls[0]?.[1] as {
      automationRunId?: string;
      copyMode?: string;
      target: {
        catalogItemId: string;
        productName: string;
        toEmail: string;
        needsEmail?: boolean;
        accountContactId: string;
      };
    };
    expect(genArg.automationRunId).toBe(RUN_ID);
    expect(genArg.copyMode).toBe('generic_stub');
    expect(genArg.target.catalogItemId).toBe(PRODUCT_A);
    expect(genArg.target.productName).toBe('Frozen Product A');
    expect(genArg.target.toEmail).toBe('buyer@example.com');
    expect(genArg.target.needsEmail).toBe(false);
    expect(genArg.target.accountContactId).toBe(contactRow.id);
  });
});
