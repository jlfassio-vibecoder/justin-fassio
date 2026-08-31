import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBriefingTab } from '@/components/tabs/AgentBriefingTab';
import { catalogItemStub } from '@/lib/catalog';
import type { OutreachBriefingDto } from '@/lib/outreachBriefingShared';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';

const getAgentProductOutreachDraftClientMock = vi.fn();
const createFollowUpDraftClientMock = vi.fn();
const cancelAgentProductOutreachDraftClientMock = vi.fn();
const { useOptionalLineContextMock } = vi.hoisted(() => ({
  useOptionalLineContextMock: vi.fn(() => ({
    multiLineUi: false,
    salesLineId: null as string | null,
  })),
}));

vi.mock('@/lib/agentProductOutreachDraftClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/agentProductOutreachDraftClient')>();
  return {
    ...actual,
    getAgentProductOutreachDraftClient: (...args: unknown[]) =>
      getAgentProductOutreachDraftClientMock(...args),
    createFollowUpDraftClient: (...args: unknown[]) => createFollowUpDraftClientMock(...args),
    cancelAgentProductOutreachDraftClient: (...args: unknown[]) =>
      cancelAgentProductOutreachDraftClientMock(...args),
  };
});

vi.mock('@/components/OgrProductEmailComposerModal', () => ({
  OgrProductEmailComposerModal: ({
    open,
    draft,
  }: {
    open: boolean;
    draft?: { id: string } | null;
  }) => (open && draft ? <div data-testid="composer-modal">Draft {draft.id}</div> : null),
}));

vi.mock('@/components/ProspectDetailDrawer', () => ({
  ProspectDetailDrawer: ({
    prospect,
    initialScrollToResearch,
  }: {
    prospect: Prospect | null;
    initialScrollToResearch?: boolean;
  }) =>
    prospect ? (
      <div data-testid="prospect-detail-drawer">
        <span>{prospect.name}</span>
        {initialScrollToResearch ? <span data-testid="research-scroll" /> : null}
      </div>
    ) : null,
}));

vi.mock('@/components/AccountDetailDrawer', () => ({
  AccountDetailDrawer: ({
    account,
    initialSection,
  }: {
    account: Prospect | null;
    initialSection?: string;
  }) =>
    account ? (
      <div data-testid="account-detail-drawer">
        <span>{account.name}</span>
        {initialSection === 'research' ? <span data-testid="research-scroll" /> : null}
      </div>
    ) : null,
}));

vi.mock('@/lib/lineContext', () => ({
  useOptionalLineContext: () => useOptionalLineContextMock(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'token' } },
      }),
    },
    from: vi.fn(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = self;
      chain.eq = self;
      chain.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
      return chain;
    }),
  },
}));

vi.mock('@/lib/operationalTerritories/fetchOperationalTerritories', () => ({
  fetchOperationalTerritories: vi.fn().mockResolvedValue({
    data: [
      { id: 'ops-pnw-west', code: 'pnw-west', name: 'PNW West' },
      { id: 'ops-pnw-east', code: 'pnw-east', name: 'PNW East' },
    ],
    error: null,
  }),
}));

const PRODUCT_ID = 'b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
const DRAFT_ID = 'draft-abc-123';
const catalogItem = catalogItemStub({
  id: PRODUCT_ID,
  sku: 'OGR-101',
  name: 'American Revival',
  publicSlug: 'american-revival',
});

const briefingPayload: { briefing: OutreachBriefingDto } = {
  briefing: {
    asOfDate: '2026-08-22',
    sellingDate: '2026-08-25',
    prep: { run: null, status: 'missing', message: 'No prep' },
    goal: {
      monthlyTarget: 5,
      mtdAccounts: 1,
      remainingGoal: 4,
      projectedAttainment: 4,
      recommendedDailySends: 3,
      rateSource: 'planning',
      goalMet: false,
    },
    drafts: [
      {
        draftId: DRAFT_ID,
        prospectId: 12,
        prospectName: 'Coastal Golf',
        catalogItemId: PRODUCT_ID,
        productName: 'American Revival',
        productSku: 'OGR-101',
        productSlug: 'american-revival',
        toEmail: 'buyer@coastalgolf.com',
        primaryChannel: 'golf_retail',
        createdAt: '2026-08-22T12:00:00Z',
        preparationDate: '2026-08-22',
        fromEarlierPrep: false,
      },
    ],
    identifiedTargets: [],
    channelAllocation: null,
    callToday: [],
    hot: [],
    warm: [],
    followUps: [],
    recentEngagement: [],
    recentConversions: [],
    performance: null,
    leadRules: { source: 'provisional', version: 'v1-provisional', adjustedFields: [] },
    adaptiveWeightsEnabled: true,
  },
};

function prospectStub(
  id: number,
  name: string,
  accountStatus: Prospect['accountStatus'] = 'prospect',
): Prospect {
  return {
    id,
    name,
    category: 'golf_retail',
    region: 'Oregon Coast',
    city: 'Newport',
    address: '',
    phone: '',
    fit: '',
    accountStatus,
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    ...BC_PROSPECT_TERRITORY,
  };
}

const defaultProspects = [
  prospectStub(12, 'Coastal Golf'),
  prospectStub(44, 'Needs Email Shop'),
  prospectStub(42, 'Call Today Store'),
  prospectStub(55, 'Clicked Prospect'),
  prospectStub(77, 'Warm Shop'),
  prospectStub(88, 'Engaged Shop'),
];

function briefingProps(overrides: Record<string, unknown> = {}) {
  return {
    catalog: [catalogItem],
    prospects: defaultProspects,
    onLogCallForLead: vi.fn(),
    onLogCall: vi.fn(),
    ...overrides,
  };
}

function mockBriefingFetch(payload: { briefing: OutreachBriefingDto } = briefingPayload) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => payload,
    }),
  );
}

describe('AgentBriefingTab draft review', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBriefingFetch();
    getAgentProductOutreachDraftClientMock.mockResolvedValue({
      ok: true,
      draft: {
        id: DRAFT_ID,
        toEmail: 'buyer@coastalgolf.com',
        toName: 'Sam',
        subject: 'Old Guys Rule — American Revival',
        introText: 'Custom intro',
        closingText: 'Custom close',
        prospectId: 12,
        accountContactId: 'contact-1',
        catalogItemId: PRODUCT_ID,
        payload: { sku: 'OGR-101', slug: 'american-revival' },
      },
    });
  });

  it('dismisses a draft from Drafts ready for review', async () => {
    const user = userEvent.setup();
    let draftDismissed = false;
    cancelAgentProductOutreachDraftClientMock.mockImplementation(async () => {
      draftDismissed = true;
      return {
        ok: true,
        draft: { id: DRAFT_ID, status: 'cancelled' },
      };
    });
    const fetchMock = vi.fn().mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.includes('/api/staff/outreach/briefing')) {
        return {
          ok: true,
          json: async () =>
            draftDismissed
              ? { briefing: { ...briefingPayload.briefing, drafts: [] } }
              : briefingPayload,
        };
      }
      return { ok: false, json: async () => ({ error: 'unexpected' }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Dismiss draft for Coastal Golf' }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Dismiss draft for Coastal Golf' }));

    await waitFor(() => {
      expect(cancelAgentProductOutreachDraftClientMock).toHaveBeenCalledWith(DRAFT_ID);
    });
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/Dismissed draft for Coastal Golf/i);
    });
    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Dismiss draft for Coastal Golf' }),
      ).not.toBeInTheDocument();
    });
  });

  it('opens composer modal in Briefing when product is clicked', async () => {
    const user = userEvent.setup();
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Coastal Golf')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /American Revival/i }));

    await waitFor(() => {
      expect(getAgentProductOutreachDraftClientMock).toHaveBeenCalledWith(DRAFT_ID);
      expect(screen.getByTestId('composer-modal')).toHaveTextContent(DRAFT_ID);
    });
  });

  it('opens composer from deep-link props and consumes the link', async () => {
    const onDeepLinkConsumed = vi.fn();
    render(
      <AgentBriefingTab
        {...briefingProps({
          deepLinkSku: 'OGR-101',
          deepLinkDraftId: DRAFT_ID,
          onDeepLinkConsumed,
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('composer-modal')).toBeInTheDocument();
      expect(onDeepLinkConsumed).toHaveBeenCalled();
    });
  });

  it('shows error when catalog item is missing', async () => {
    const user = userEvent.setup();
    render(<AgentBriefingTab {...briefingProps({ catalog: [] })} />);

    await waitFor(() => {
      expect(screen.getByText('Coastal Golf')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /American Revival/i }));

    await waitFor(() => {
      expect(screen.getByText(/Product not found in catalog/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('composer-modal')).not.toBeInTheDocument();
    expect(getAgentProductOutreachDraftClientMock).not.toHaveBeenCalled();
  });
});

describe('AgentBriefingTab follow-up queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOptionalLineContextMock.mockReturnValue({
      multiLineUi: false,
      salesLineId: null,
    });
    createFollowUpDraftClientMock.mockResolvedValue({
      ok: true,
      draftId: DRAFT_ID,
      catalogItemId: PRODUCT_ID,
      productName: 'American Revival',
      reusedPending: false,
    });
    getAgentProductOutreachDraftClientMock.mockResolvedValue({
      ok: true,
      draft: {
        id: DRAFT_ID,
        toEmail: 'buyer@example.com',
        toName: 'Buyer',
        subject: 'Subject',
        introText: 'Intro',
        closingText: 'Close',
        prospectId: 42,
        accountContactId: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
        catalogItemId: PRODUCT_ID,
        payload: { sku: 'OGR-101', slug: 'american-revival', name: 'American Revival' },
      },
    });
  });

  it('renders Top leads quick view and Open for Warm without follow-up action', async () => {
    const warmLead = {
      prospectId: 77,
      prospectName: 'Warm Shop',
      accountStatus: 'prospect' as const,
      leadState: 'warm' as const,
      callToday: false,
      callTodayReasons: [],
      score: 5,
      rulesVersion: 'v1-provisional' as const,
      engagement: {
        prospectId: 77,
        emailsSent: 1,
        lastSentAt: null,
        openCount: 1,
        clickCount: 1,
        messagesOpened: 1,
        messagesClicked: 1,
        distinctProductsOpened: 1,
        distinctProductsClicked: 1,
        maxClickCountOnMessage: 1,
        lastOpenedAt: '2026-08-21T12:00:00Z',
        lastClickedAt: '2026-08-21T12:00:00Z',
        lastEngagementAt: '2026-08-21T12:00:00Z',
        suppressed: false,
        reply: { attributed: false, confidence: 'none' as const, lastMessageAt: null },
        unlinkedManualIncluded: 0,
      },
      lastEngagedCatalogItemId: null,
      emailsSentInWindow: 1,
      followUpOverdueDays: null,
      lastCallAtToday: null,
    };
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        warm: [warmLead],
        recentEngagement: [
          {
            prospectId: 88,
            prospectName: 'Engaged Shop',
            lastEngagedAt: '2026-08-22T10:00:00Z',
            openCount: 2,
            clickCount: 0,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn();
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead })} />);

    await waitFor(() => {
      expect(screen.getByTestId('top-leads-quick-view')).toBeInTheDocument();
    });
    expect(screen.getByText('Warm Shop')).toBeInTheDocument();
    expect(screen.getByText('Engaged Shop')).toBeInTheDocument();
    const warmRow = screen.getByTestId('top-lead-warm-77');
    expect(warmRow).toHaveTextContent('1 click');
    expect(warmRow).toHaveTextContent('1 open');
    const engagedRow = screen.getByTestId('top-lead-engaged-88');
    expect(engagedRow).toHaveTextContent('2 opens');
    expect(engagedRow).not.toHaveTextContent('click');

    await user.click(screen.getByRole('button', { name: 'Open Warm Shop' }));
    expect(screen.getByTestId('prospect-detail-drawer')).toHaveTextContent('Warm Shop');
    expect(screen.queryByTestId('research-scroll')).not.toBeInTheDocument();
    expect(onLogCallForLead).not.toHaveBeenCalled();
    expect(createFollowUpDraftClientMock).not.toHaveBeenCalled();
  });

  it('shows open and click counts together on Call today and Engaged', async () => {
    const callLead = {
      prospectId: 42,
      prospectName: 'Call Today Store',
      accountStatus: 'prospect' as const,
      leadState: 'hot' as const,
      callToday: true,
      callTodayReasons: ['hot_intent' as const],
      score: 12,
      rulesVersion: 'v1-provisional' as const,
      engagement: {
        prospectId: 42,
        emailsSent: 2,
        lastSentAt: null,
        openCount: 4,
        clickCount: 3,
        messagesOpened: 2,
        messagesClicked: 2,
        distinctProductsOpened: 2,
        distinctProductsClicked: 2,
        maxClickCountOnMessage: 2,
        lastOpenedAt: '2026-08-21T12:00:00Z',
        lastClickedAt: '2026-08-21T12:00:00Z',
        lastEngagementAt: '2026-08-21T12:00:00Z',
        suppressed: false,
        reply: { attributed: false, confidence: 'none' as const, lastMessageAt: null },
        unlinkedManualIncluded: 0,
      },
      lastEngagedCatalogItemId: PRODUCT_ID,
      emailsSentInWindow: 2,
      followUpOverdueDays: null,
      lastCallAtToday: null,
    };
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        callToday: [callLead],
        hot: [callLead],
        recentEngagement: [
          {
            prospectId: 99,
            prospectName: 'Both Counts Shop',
            lastEngagedAt: '2026-08-22T10:00:00Z',
            openCount: 5,
            clickCount: 2,
          },
        ],
      },
    });
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByTestId('top-lead-call-42')).toBeInTheDocument();
    });
    const callRow = screen.getByTestId('top-lead-call-42');
    expect(callRow).toHaveTextContent('3 clicks');
    expect(callRow).toHaveTextContent('4 opens');
    const engagedRow = screen.getByTestId('top-lead-engaged-99');
    expect(engagedRow).toHaveTextContent('2 clicks');
    expect(engagedRow).toHaveTextContent('5 opens');
  });

  it('runs Call from Top leads when the follow-ups queue recommends Call', async () => {
    const callLead = {
      prospectId: 42,
      prospectName: 'Call Today Store',
      accountStatus: 'prospect' as const,
      leadState: 'hot' as const,
      callToday: true,
      callTodayReasons: ['hot_intent' as const],
      score: 12,
      rulesVersion: 'v1-provisional' as const,
      engagement: {
        prospectId: 42,
        emailsSent: 1,
        lastSentAt: null,
        openCount: 2,
        clickCount: 2,
        messagesOpened: 1,
        messagesClicked: 1,
        distinctProductsOpened: 2,
        distinctProductsClicked: 2,
        maxClickCountOnMessage: 2,
        lastOpenedAt: '2026-08-21T12:00:00Z',
        lastClickedAt: '2026-08-21T12:00:00Z',
        lastEngagementAt: '2026-08-21T12:00:00Z',
        suppressed: false,
        reply: { attributed: false, confidence: 'none' as const, lastMessageAt: null },
        unlinkedManualIncluded: 0,
      },
      lastEngagedCatalogItemId: PRODUCT_ID,
      emailsSentInWindow: 1,
      followUpOverdueDays: null,
      lastCallAtToday: null,
    };
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        callToday: [callLead],
        hot: [callLead],
        followUps: [
          {
            prospectId: 42,
            prospectName: 'Call Today Store',
            accountStatus: 'prospect',
            leadState: 'hot',
            recommendedAction: 'call',
            reasonLine: 'Hot intent',
            talkTrackHint: 'Hot intent — lead with what they viewed online.',
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 12,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn().mockResolvedValue(true);
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead })} />);

    await waitFor(() => {
      expect(screen.getByTestId('top-lead-call-42')).toBeInTheDocument();
    });

    const topRow = screen.getByTestId('top-lead-call-42');
    await user.click(within(topRow).getByRole('button', { name: 'Call Call Today Store' }));
    expect(onLogCallForLead).toHaveBeenCalledWith(42, {
      talkTrackHint: 'Hot intent — lead with what they viewed online.',
      lastProductName: 'American Revival',
    });
  });

  it('opens log call for Call rows', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 42,
            prospectName: 'Call Today Store',
            accountStatus: 'prospect',
            leadState: 'hot',
            recommendedAction: 'call',
            reasonLine: 'Follow-up due',
            talkTrackHint: 'Follow-up scheduled — check in on your last conversation.',
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 10,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn();
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead })} />);

    await waitFor(() => {
      expect(screen.getByText('Call Today Store')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Call Call Today Store' }));

    expect(onLogCallForLead).toHaveBeenCalledWith(42, {
      talkTrackHint: 'Follow-up scheduled — check in on your last conversation.',
      lastProductName: 'American Revival',
    });
    expect(screen.queryByTestId('prospect-detail-drawer')).not.toBeInTheDocument();
    expect(createFollowUpDraftClientMock).not.toHaveBeenCalled();
  });

  it('shows an error when Call cannot open Log Call', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 42,
            prospectName: 'Call Today Store',
            accountStatus: 'prospect',
            leadState: 'hot',
            recommendedAction: 'call',
            reasonLine: 'Follow-up due',
            talkTrackHint: 'Follow-up scheduled — check in on your last conversation.',
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 10,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn().mockResolvedValue(false);
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead })} />);

    await waitFor(() => {
      expect(screen.getByText('Call Today Store')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Call Call Today Store' }));

    await waitFor(() => {
      expect(screen.getByText(/Could not open Log Call/i)).toBeInTheDocument();
    });
  });

  it('opens a follow-up draft for Email rows', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 44,
            prospectName: 'Warm Lead Shop',
            accountStatus: 'prospect',
            leadState: 'warm',
            recommendedAction: 'email',
            reasonLine: '1 product clicked',
            talkTrackHint: null,
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 5,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn();
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead })} />);

    await waitFor(() => {
      expect(screen.getByText('Warm Lead Shop')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Email Warm Lead Shop' }));

    await waitFor(() => {
      expect(createFollowUpDraftClientMock).toHaveBeenCalledWith(44, { salesLineId: null });
      expect(screen.getByTestId('composer-modal')).toBeInTheDocument();
    });
    expect(onLogCallForLead).not.toHaveBeenCalled();
  });

  it('passes salesLineId when creating a follow-up draft on a multi-line context', async () => {
    useOptionalLineContextMock.mockReturnValue({
      multiLineUi: true,
      salesLineId: '11111111-1111-4111-8111-111111111111',
    });
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 44,
            prospectName: 'Warm Lead Shop',
            accountStatus: 'prospect',
            leadState: 'warm',
            recommendedAction: 'email',
            reasonLine: '1 product clicked',
            talkTrackHint: null,
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 5,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Warm Lead Shop')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Email Warm Lead Shop' }));

    await waitFor(() => {
      expect(createFollowUpDraftClientMock).toHaveBeenCalledWith(44, {
        salesLineId: '11111111-1111-4111-8111-111111111111',
      });
    });
  });

  it('opens the drawer for Watch rows', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 55,
            prospectName: 'Clicked Prospect',
            accountStatus: 'prospect',
            leadState: 'cold',
            recommendedAction: 'watch',
            reasonLine: '1 product opened',
            talkTrackHint: null,
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: null,
            lastProductId: PRODUCT_ID,
            score: 1,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn();
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead })} />);

    await waitFor(() => {
      expect(screen.getByText('Clicked Prospect')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Watch Clicked Prospect' }));

    expect(screen.getByTestId('prospect-detail-drawer')).toHaveTextContent('Clicked Prospect');
    expect(screen.queryByTestId('research-scroll')).not.toBeInTheDocument();
    expect(onLogCallForLead).not.toHaveBeenCalled();
  });

  it('opens Log Call from Email follow-up rows', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 44,
            prospectName: 'Warm Lead Shop',
            accountStatus: 'prospect',
            leadState: 'warm',
            recommendedAction: 'email',
            reasonLine: '1 product clicked',
            talkTrackHint: null,
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 5,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn().mockResolvedValue(true);
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead })} />);

    await waitFor(() => {
      expect(screen.getByText('Warm Lead Shop')).toBeInTheDocument();
      expect(screen.getByText(/emailed \(90d\) · opens first/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Log Call Warm Lead Shop' }));

    expect(onLogCallForLead).toHaveBeenCalledWith(44, {
      talkTrackHint: null,
      lastProductName: 'American Revival',
    });
    expect(createFollowUpDraftClientMock).not.toHaveBeenCalled();
  });

  it('snoozes a follow-up row until tomorrow', async () => {
    const followUpBriefing = {
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 66,
            prospectName: 'Snooze Me Shop',
            accountStatus: 'prospect',
            leadState: 'hot',
            recommendedAction: 'call',
            reasonLine: 'Hot intent',
            talkTrackHint: 'Hot intent on the product — lead with what they viewed online.',
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 10,
            followUpOverdueDays: null,
          },
        ],
      },
    };
    let snoozed = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/api/staff/outreach/follow-up-snooze')) {
          snoozed = true;
          return {
            ok: true,
            json: async () => ({ ok: true, snoozedUntil: '2026-08-23' }),
          };
        }
        if (url.includes('/api/staff/outreach/briefing')) {
          return {
            ok: true,
            json: async () =>
              snoozed
                ? {
                    briefing: { ...briefingPayload.briefing, followUps: [] },
                  }
                : followUpBriefing,
          };
        }
        void init;
        return { ok: false, json: async () => ({ error: 'unexpected fetch' }) };
      }),
    );

    const user = userEvent.setup();
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Snooze Me Shop')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Snooze Snooze Me Shop until tomorrow' }));

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/staff/outreach/follow-up-snooze',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('filters Today’s follow-ups by search text', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        followUps: [
          {
            prospectId: 42,
            prospectName: 'Alpha Surf',
            accountStatus: 'prospect',
            leadState: 'hot',
            recommendedAction: 'call',
            reasonLine: 'Hot intent',
            talkTrackHint: null,
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastOpenedAt: '2026-08-21T12:00:00Z',
            lastSentAt: '2026-08-20T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 10,
            followUpOverdueDays: null,
          },
          {
            prospectId: 55,
            prospectName: 'Beta Gift',
            accountStatus: 'prospect',
            leadState: 'warm',
            recommendedAction: 'email',
            reasonLine: '1 product clicked',
            talkTrackHint: null,
            lastEngagedAt: '2026-08-21T11:00:00Z',
            lastOpenedAt: '2026-08-21T11:00:00Z',
            lastSentAt: '2026-08-20T11:00:00Z',
            lastProductName: null,
            lastProductId: null,
            score: 4,
            followUpOverdueDays: null,
          },
        ],
      },
    });
    const user = userEvent.setup();
    render(
      <AgentBriefingTab
        {...briefingProps({
          prospects: [
            ...defaultProspects,
            prospectStub(42, 'Alpha Surf'),
            prospectStub(55, 'Beta Gift'),
          ],
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('follow-up-row-42')).toBeInTheDocument();
      expect(screen.getByTestId('follow-up-row-55')).toBeInTheDocument();
    });

    await user.type(screen.getByRole('searchbox', { name: /search today’s follow-ups/i }), 'beta');

    expect(screen.queryByTestId('follow-up-row-42')).not.toBeInTheDocument();
    expect(screen.getByTestId('follow-up-row-55')).toBeInTheDocument();
  });
});

describe('AgentBriefingTab research entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBriefingFetch(briefingPayload);
  });

  it('opens prospect drawer research from draft row Research button', async () => {
    const user = userEvent.setup();
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Coastal Golf')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Research' }));

    expect(screen.getByTestId('prospect-detail-drawer')).toHaveTextContent('Coastal Golf');
    expect(screen.getByTestId('research-scroll')).toBeInTheDocument();
  });

  it('shows an error when Research store is missing from the directory', async () => {
    const user = userEvent.setup();
    render(<AgentBriefingTab {...briefingProps({ prospects: [] })} />);

    await waitFor(() => {
      expect(screen.getByText('Coastal Golf')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Research' }));

    expect(screen.queryByTestId('prospect-detail-drawer')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/not in the loaded directory/i);
  });

  it('disables Run prep until a usable contact email is on file', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        identifiedTargets: [
          {
            prospectId: 44,
            prospectName: 'Needs Email Shop',
            catalogItemId: PRODUCT_ID,
            productName: 'American Revival',
            productSku: 'OGR-101',
            productSlug: 'american-revival',
            primaryChannel: 'golf_retail',
            needsEmail: true,
            hasUsableEmail: false,
            sharedEmailStoreNames: [],
          },
        ],
      },
    });
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Needs Email Shop')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Run prep' })).toBeDisabled();
    expect(screen.getByText('Needs research')).toBeInTheDocument();
  });

  it('posts identified-target-draft from research-queue Run prep', async () => {
    const user = userEvent.setup();
    const researchBriefing = {
      briefing: {
        ...briefingPayload.briefing,
        identifiedTargets: [
          {
            prospectId: 44,
            prospectName: 'Needs Email Shop',
            catalogItemId: PRODUCT_ID,
            productName: 'American Revival',
            productSku: 'OGR-101',
            productSlug: 'american-revival',
            primaryChannel: 'golf_retail',
            needsEmail: true,
            hasUsableEmail: true,
            sharedEmailStoreNames: ['Sister Store'],
          },
        ],
      },
    };
    const fetchMock = vi.fn().mockImplementation(async (path: string, init?: RequestInit) => {
      if (
        typeof path === 'string' &&
        path.includes('/api/staff/outreach/identified-target-draft')
      ) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            draftId: 'new-d1',
            productName: 'American Revival',
            reusedPending: false,
          }),
        };
      }
      if (typeof path === 'string' && path.includes('/api/staff/outreach/briefing')) {
        return { ok: true, json: async () => researchBriefing };
      }
      void init;
      return { ok: false, json: async () => ({ error: 'unexpected' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Needs Email Shop')).toBeInTheDocument();
    });
    expect(screen.getByText(/Also on: Sister Store/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run prep' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (c) =>
          typeof c[0] === 'string' && c[0].includes('/api/staff/outreach/identified-target-draft'),
      );
      expect(call).toBeTruthy();
      const body = JSON.parse(String((call?.[1] as RequestInit)?.body ?? '{}')) as {
        prospectId?: number;
        catalogItemId?: string;
        operationalTerritoryId?: string;
        preparationDate?: string;
      };
      expect(body.prospectId).toBe(44);
      expect(body.catalogItemId).toBe(PRODUCT_ID);
      expect(body.operationalTerritoryId).toBeTruthy();
      expect(body.preparationDate).toBe('2026-08-25');
    });
  });

  it('posts research-queue-dismiss from Dismiss and reloads briefing', async () => {
    const user = userEvent.setup();
    let dismissed = false;
    const researchBriefing = {
      briefing: {
        ...briefingPayload.briefing,
        identifiedTargets: [
          {
            prospectId: 44,
            prospectName: 'Needs Email Shop',
            catalogItemId: PRODUCT_ID,
            productName: 'American Revival',
            productSku: 'OGR-101',
            productSlug: 'american-revival',
            primaryChannel: 'golf_retail',
            needsEmail: true,
            hasUsableEmail: true,
            sharedEmailStoreNames: [],
          },
        ],
      },
    };
    const fetchMock = vi.fn().mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.includes('/api/staff/outreach/research-queue-dismiss')) {
        dismissed = true;
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (typeof path === 'string' && path.includes('/api/staff/outreach/briefing')) {
        return {
          ok: true,
          json: async () =>
            dismissed
              ? { briefing: { ...researchBriefing.briefing, identifiedTargets: [] } }
              : researchBriefing,
        };
      }
      return { ok: false, json: async () => ({ error: 'unexpected' }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Needs Email Shop')).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole('button', { name: 'Dismiss Needs Email Shop from research queue' }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/staff/outreach/research-queue-dismiss',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const dismissCall = fetchMock.mock.calls.find(
      (c) =>
        typeof c[0] === 'string' && c[0].includes('/api/staff/outreach/research-queue-dismiss'),
    );
    const body = JSON.parse(String((dismissCall?.[1] as RequestInit)?.body ?? '{}')) as {
      prospectId?: number;
    };
    expect(body.prospectId).toBe(44);
    await waitFor(() => {
      expect(screen.queryByText('Needs Email Shop')).not.toBeInTheDocument();
    });
  });
});

describe('AgentBriefingTab regional prep controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBriefingFetch(briefingPayload);
  });

  it('shows humanized Channel labels on drafts', async () => {
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByText('Coastal Golf')).toBeInTheDocument();
    });

    expect(screen.getAllByText('Golf Courses, Resorts & Pro Shops').length).toBeGreaterThan(0);
    expect(screen.queryByText('golf_retail')).not.toBeInTheDocument();
  });

  it('shows Run prep now count from regional pool capped by prep limit', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        regionalPool: {
          inRegion: 40,
          withUsableEmail: 12,
          sendableNow: 5,
          queuedWithoutEmail: 2,
          excluded: {
            noUsableEmail: 0,
            pendingDraft: 10,
            cooldown: 8,
            contactSuppressed: 0,
            noProduct: 0,
            other: 0,
          },
        },
      },
    });
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run prep now (7)' })).toBeInTheDocument();
    });
  });

  it('disables Run prep now when regional pool has zero available accounts', async () => {
    mockBriefingFetch({
      briefing: {
        ...briefingPayload.briefing,
        regionalPool: {
          inRegion: 10,
          withUsableEmail: 0,
          sendableNow: 0,
          queuedWithoutEmail: 0,
          excluded: {
            noUsableEmail: 2,
            pendingDraft: 3,
            cooldown: 5,
            contactSuppressed: 0,
            noProduct: 0,
            other: 0,
          },
        },
      },
    });
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Run prep now (0)' })).toBeDisabled();
    });
  });

  it('uses Territory + Region labels and posts mapped ops + storeTerritoryCode', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockImplementation(async (path: string) => {
      if (typeof path === 'string' && path.includes('/api/staff/outreach/prep')) {
        return {
          ok: true,
          json: async () => ({ ok: true, noop: true }),
        };
      }
      return {
        ok: true,
        json: async () => briefingPayload,
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByLabelText('Territory')).toBeInTheDocument();
      expect(screen.getByLabelText('Region')).toBeInTheDocument();
      expect(screen.getByLabelText('Channel')).toBeInTheDocument();
    });

    expect(screen.queryByLabelText('Operational territory')).toBeNull();
    expect(screen.queryByLabelText('Store geography')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Territory'), 'wa');
    await user.selectOptions(screen.getByLabelText('Region'), 'Eastern Washington');
    await user.selectOptions(screen.getByLabelText('Channel'), 'golf_retail');
    await user.click(screen.getByRole('button', { name: /Run prep now/ }));

    await waitFor(() => {
      const prepCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/staff/outreach/prep'),
      );
      expect(prepCall).toBeTruthy();
      const body = JSON.parse(String((prepCall?.[1] as RequestInit)?.body ?? '{}')) as {
        operationalTerritoryId?: string;
        storeTerritoryCode?: string;
        channel?: string;
        limit?: number;
      };
      expect(body.storeTerritoryCode).toBe('wa');
      expect(body.operationalTerritoryId).toBe('ops-pnw-east');
      expect(body.channel).toBe('golf_retail');
      expect(body.limit).toBe(25);
    });

    await waitFor(() => {
      const briefingCall = fetchMock.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('/api/staff/outreach/briefing') &&
          call[0].includes('channel=golf_retail'),
      );
      expect(briefingCall).toBeTruthy();
    });
  });
});

describe('AgentBriefingTab active audience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches briefing with audience=active_account and shows Active Account Briefing', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => briefingPayload,
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AgentBriefingTab {...briefingProps({ audience: 'active_account', embedded: true })} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Active Account Briefing' })).toBeInTheDocument();
    });
    const briefingCall = fetchMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/staff/outreach/briefing'),
    );
    expect(String(briefingCall?.[0])).toContain('audience=active_account');
  });

  it('omits audience on Daily Briefing fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => briefingPayload,
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<AgentBriefingTab {...briefingProps()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Daily Agent Briefing' })).toBeInTheDocument();
    });
    const briefingCall = fetchMock.mock.calls.find(
      (call) => typeof call[0] === 'string' && call[0].includes('/api/staff/outreach/briefing'),
    );
    expect(String(briefingCall?.[0])).not.toContain('audience=');
  });
});
