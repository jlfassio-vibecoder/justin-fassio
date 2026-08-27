import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentBriefingTab } from '@/components/tabs/AgentBriefingTab';
import { catalogItemStub } from '@/lib/catalog';
import type { OutreachBriefingDto } from '@/lib/outreachBriefingShared';

const getAgentProductOutreachDraftClientMock = vi.fn();
const createFollowUpDraftClientMock = vi.fn();

vi.mock('@/lib/agentProductOutreachDraftClient', () => ({
  getAgentProductOutreachDraftClient: (...args: unknown[]) =>
    getAgentProductOutreachDraftClientMock(...args),
  createFollowUpDraftClient: (...args: unknown[]) => createFollowUpDraftClientMock(...args),
}));

vi.mock('@/components/OgrProductEmailComposerModal', () => ({
  OgrProductEmailComposerModal: ({
    open,
    draft,
  }: {
    open: boolean;
    draft?: { id: string } | null;
  }) => (open && draft ? <div data-testid="composer-modal">Draft {draft.id}</div> : null),
}));

vi.mock('@/lib/lineContext', () => ({
  useOptionalLineContext: () => ({
    multiLineUi: false,
    salesLineId: null,
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'token' } },
      }),
    },
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
        primaryChannel: 'golf',
        createdAt: '2026-08-22T12:00:00Z',
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

function briefingProps(overrides: Record<string, unknown> = {}) {
  return {
    catalog: [catalogItem],
    onLogCallForLead: vi.fn(),
    onOpenProspect: vi.fn(),
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
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 10,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn();
    const onOpenProspect = vi.fn();
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead, onOpenProspect })} />);

    await waitFor(() => {
      expect(screen.getByText('Call Today Store')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Call Call Today Store' }));

    expect(onLogCallForLead).toHaveBeenCalledWith(42);
    expect(onOpenProspect).not.toHaveBeenCalled();
    expect(createFollowUpDraftClientMock).not.toHaveBeenCalled();
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
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastProductName: 'American Revival',
            lastProductId: PRODUCT_ID,
            score: 5,
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
      expect(createFollowUpDraftClientMock).toHaveBeenCalledWith(44);
      expect(screen.getByTestId('composer-modal')).toBeInTheDocument();
    });
    expect(onLogCallForLead).not.toHaveBeenCalled();
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
            lastEngagedAt: '2026-08-21T12:00:00Z',
            lastProductName: null,
            lastProductId: PRODUCT_ID,
            score: 1,
          },
        ],
      },
    });
    const user = userEvent.setup();
    const onLogCallForLead = vi.fn();
    const onOpenProspect = vi.fn();
    render(<AgentBriefingTab {...briefingProps({ onLogCallForLead, onOpenProspect })} />);

    await waitFor(() => {
      expect(screen.getByText('Clicked Prospect')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Open Clicked Prospect' }));

    expect(onOpenProspect).toHaveBeenCalledWith({
      prospectId: 55,
      accountStatus: 'prospect',
    });
    expect(onLogCallForLead).not.toHaveBeenCalled();
  });
});

describe('AgentBriefingTab research entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBriefingFetch(briefingPayload);
  });

  it('opens prospect drawer research from draft row Research button', async () => {
    const user = userEvent.setup();
    const onOpenProspect = vi.fn();
    render(<AgentBriefingTab {...briefingProps({ onOpenProspect })} />);

    await waitFor(() => {
      expect(screen.getByText('Coastal Golf')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Research' }));

    expect(onOpenProspect).toHaveBeenCalledWith({
      prospectId: 12,
      accountStatus: 'prospect',
      openResearch: true,
    });
  });
});

describe('AgentBriefingTab regional prep controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBriefingFetch(briefingPayload);
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
    });

    expect(screen.queryByLabelText('Operational territory')).toBeNull();
    expect(screen.queryByLabelText('Store geography')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Territory'), 'wa');
    await user.selectOptions(screen.getByLabelText('Region'), 'Eastern Washington');
    await user.click(screen.getByRole('button', { name: /Run prep now/ }));

    await waitFor(() => {
      const prepCall = fetchMock.mock.calls.find(
        (call) => typeof call[0] === 'string' && call[0].includes('/api/staff/outreach/prep'),
      );
      expect(prepCall).toBeTruthy();
      const body = JSON.parse(String((prepCall?.[1] as RequestInit)?.body ?? '{}')) as {
        operationalTerritoryId?: string;
        storeTerritoryCode?: string;
      };
      expect(body.storeTerritoryCode).toBe('wa');
      expect(body.operationalTerritoryId).toBe('ops-pnw-east');
    });
  });
});
