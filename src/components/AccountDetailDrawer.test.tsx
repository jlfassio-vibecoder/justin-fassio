import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountDetailDrawer } from '@/components/AccountDetailDrawer';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';
import type { LineContextValue } from '@/lib/lineContext';
import { catalogItemStub } from '@/lib/catalog';

const lineState = vi.hoisted(() => {
  const base: LineContextValue = {
    multiLineUi: false,
    multiLineWrites: false,
    multiLineAi: false,
    multiLineTerritoryAdmin: false,
    eaglePeakSelling: false,
    eaglePeakOutreach: true,
    bigFishSelling: false,
    bigFishOutreach: true,
    salesLineId: '11111111-1111-4111-8111-111111111111',
    lineSlug: 'ogr',
    status: 'active',
    defaultCurrency: 'USD',
    name: 'Old Guys Rule',
    loading: false,
    error: null,
    unknownLine: false,
    representedLines: [],
    selectLineSlug: () => undefined,
  };
  return { current: { ...base }, base };
});

const handoffMocks = vi.hoisted(() => ({
  generateDraftFromAccountEmailPick: vi.fn(),
}));

vi.mock('@/lib/lineContext', () => ({
  useOptionalLineContext: () => lineState.current,
}));

vi.mock('@/lib/retailerLineAccounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/retailerLineAccounts')>(
    '@/lib/retailerLineAccounts',
  );
  return {
    ...actual,
    fetchOperationalLineAccount: vi.fn(async () => ({
      data: {
        id: 'rla-1',
        retailerId: 7,
        salesLineId: '11111111-1111-4111-8111-111111111111',
        relationshipStatus: 'opened',
        notes: null,
        salesLineTerritoryId: null,
      },
      error: null,
    })),
  };
});

vi.mock('@/lib/accountResearchDraftHandoff', async () => {
  const actual = await vi.importActual<typeof import('@/lib/accountResearchDraftHandoff')>(
    '@/lib/accountResearchDraftHandoff',
  );
  return {
    ...actual,
    generateDraftFromAccountEmailPick: handoffMocks.generateDraftFromAccountEmailPick,
  };
});

vi.mock('@/components/AccountContactsSection', () => ({
  AccountContactsSection: () => null,
}));
vi.mock('@/components/AccountNotesEditor', () => ({
  AccountNotesEditor: () => null,
}));
vi.mock('@/components/calendar/AccountCalendarSection', () => ({
  AccountCalendarSection: () => null,
}));
vi.mock('@/components/calendar/ScheduleMeetingModal', () => ({
  ScheduleMeetingModal: () => null,
}));
vi.mock('@/components/messages/AccountEmailSection', () => ({
  AccountEmailSection: () => null,
}));
vi.mock('@/components/messages/AccountMessagesSection', () => ({
  AccountMessagesSection: () => null,
}));
vi.mock('@/components/ProspectTaxonomyEditor', () => ({
  ProspectTaxonomyEditor: () => null,
}));
vi.mock('@/components/AccountDetailsEditor', () => ({
  AccountDetailsEditor: () => null,
}));
vi.mock('@/components/OutreachLeadStateChip', () => ({
  OutreachLeadStateChip: () => null,
}));
vi.mock('@/components/accountResearch/AccountResearchPanel', () => ({
  AccountResearchPanel: () => <div>Account research panel</div>,
}));

vi.mock('@/components/AccountEmailProductPickerModal', () => ({
  AccountEmailProductPickerModal: ({
    open,
    onClose,
    onPick,
  }: {
    open: boolean;
    onClose: () => void;
    onPick: (pick: {
      item: ReturnType<typeof catalogItemStub>;
      to: string;
      recipientName: string;
      accountContactId: string | null;
      recipientHint: string | null;
      recipientOptions: unknown[];
    }) => void | Promise<void>;
  }) =>
    open ? (
      <div>
        <p>Product picker</p>
        <button type="button" onClick={onClose}>
          Cancel picker
        </button>
        <button
          type="button"
          onClick={() =>
            void onPick({
              item: catalogItemStub({
                id: 'prod-1',
                publicSlug: 'american-revival',
                sku: 'OGR-101',
                name: 'American Revival',
              }),
              to: 'buyer@example.com',
              recipientName: 'Sam',
              accountContactId: 'c1',
              recipientHint: null,
              recipientOptions: [],
            })
          }
        >
          Email this
        </button>
      </div>
    ) : null,
}));

vi.mock('@/components/OgrProductEmailComposerModal', () => ({
  OgrProductEmailComposerModal: ({
    open,
    onClose,
    onSent,
    draft,
  }: {
    open: boolean;
    onClose: () => void;
    onSent: () => void;
    draft?: { id: string } | null;
  }) =>
    open ? (
      <div>
        <p>Product composer</p>
        {draft ? <p>Draft review {draft.id}</p> : <p>Manual compose</p>}
        <button type="button" onClick={onClose}>
          Cancel composer
        </button>
        <button
          type="button"
          onClick={() => {
            onSent();
            onClose();
          }}
        >
          Send product email
        </button>
      </div>
    ) : null,
}));

const ACCOUNT: Prospect = {
  id: 7,
  name: 'Kelowna Golf & Country Club',
  category: 'golf_retail',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '1297 Glenmore Dr',
  phone: '250-762-2531',
  fit: 'Test',
  accountStatus: 'active_account',
  convertedAt: '2026-01-01T00:00:00Z',
  initialOrderDate: '2026-01-02T00:00:00Z',
  notes: null,
  ...EMPTY_PROSPECT_PLANNING,
  ...EMPTY_PROSPECT_TAXONOMY,
  ...BC_PROSPECT_TERRITORY,
};

function renderDrawer() {
  return render(
    <AccountDetailDrawer
      account={ACCOUNT}
      onClose={vi.fn()}
      onLogCall={vi.fn()}
      onLogOrder={vi.fn()}
    />,
  );
}

describe('AccountDetailDrawer email product flow', () => {
  beforeEach(() => {
    lineState.current = { ...lineState.base };
    handoffMocks.generateDraftFromAccountEmailPick.mockReset();
    handoffMocks.generateDraftFromAccountEmailPick.mockResolvedValue({
      ok: true,
      systemMessageId: 'draft-aa-1',
      draft: {
        id: 'draft-aa-1',
        to: 'buyer@example.com',
        toName: 'Sam',
        subject: 'Subject',
        introText: 'Intro',
        closingText: 'Closing',
        prospectId: 7,
        accountContactId: 'c1',
        catalogItemId: 'prod-1',
      },
      catalogItem: catalogItemStub({
        id: 'prod-1',
        publicSlug: 'american-revival',
        sku: 'OGR-101',
        name: 'American Revival',
      }),
    });
  });

  it('opens the picker as a sibling overlay and keeps the account mounted', async () => {
    const user = userEvent.setup();
    renderDrawer();
    expect(screen.getByRole('dialog', { name: /kelowna golf/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Email product' }));
    expect(screen.getByText('Product picker')).toBeInTheDocument();
    expect(screen.queryByText('Product composer')).not.toBeInTheDocument();
    expect(screen.getByText('Kelowna Golf & Country Club')).toBeInTheDocument();
    expect(document.querySelector('aside[role="dialog"]')).toHaveAttribute('inert');
  });

  it('returns to the closed account on picker cancel', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Email product' }));
    await user.click(screen.getByRole('button', { name: 'Cancel picker' }));
    expect(screen.queryByText('Product picker')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /kelowna golf/i })).toBeInTheDocument();
    expect(document.querySelector('aside[role="dialog"]')).not.toHaveAttribute('inert');
  });

  it('generates an AI draft review after pick instead of manual compose', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Email product' }));
    await user.click(screen.getByRole('button', { name: 'Email this' }));
    await waitFor(() => {
      expect(screen.getByText('Draft review draft-aa-1')).toBeInTheDocument();
    });
    expect(screen.queryByText('Manual compose')).not.toBeInTheDocument();
    expect(screen.queryByText('Product picker')).not.toBeInTheDocument();
    expect(handoffMocks.generateDraftFromAccountEmailPick).toHaveBeenCalledWith(
      expect.objectContaining({
        contact: expect.objectContaining({
          accountContactId: 'c1',
          toEmail: 'buyer@example.com',
        }),
        catalogItem: expect.objectContaining({ id: 'prod-1' }),
      }),
    );
  });

  it('closes draft review on cancel without returning to the picker', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Email product' }));
    await user.click(screen.getByRole('button', { name: 'Email this' }));
    await waitFor(() => {
      expect(screen.getByText('Product composer')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Cancel composer' }));
    expect(screen.queryByText('Product composer')).not.toBeInTheDocument();
    expect(screen.queryByText('Product picker')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /kelowna golf/i })).toBeInTheDocument();
  });

  it('returns to the open account after send', async () => {
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Email product' }));
    await user.click(screen.getByRole('button', { name: 'Email this' }));
    await waitFor(() => {
      expect(screen.getByText('Product composer')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Send product email' }));
    expect(screen.queryByText('Product picker')).not.toBeInTheDocument();
    expect(screen.queryByText('Product composer')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: /kelowna golf/i })).toBeInTheDocument();
  });

  it('keeps the picker open with an error when draft generation fails', async () => {
    handoffMocks.generateDraftFromAccountEmailPick.mockResolvedValue({
      ok: false,
      error: 'Select a saved contact with an email to send product email.',
    });
    const user = userEvent.setup();
    renderDrawer();
    await user.click(screen.getByRole('button', { name: 'Email product' }));
    await user.click(screen.getByRole('button', { name: 'Email this' }));
    await waitFor(() => {
      expect(
        screen.getByText('Select a saved contact with an email to send product email.'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Product picker')).toBeInTheDocument();
    expect(screen.queryByText('Product composer')).not.toBeInTheDocument();
  });

  it('hides Email product when Eagle Peak outreach is blocked', () => {
    lineState.current = {
      ...lineState.base,
      lineSlug: 'eagle-peak',
      eaglePeakOutreach: false,
    };
    renderDrawer();
    expect(screen.queryByRole('button', { name: 'Email product' })).not.toBeInTheDocument();
  });

  it('hides Email product when Big Fish outreach is blocked', () => {
    lineState.current = {
      ...lineState.base,
      lineSlug: 'big-fish',
      bigFishOutreach: false,
    };
    renderDrawer();
    expect(screen.queryByRole('button', { name: 'Email product' })).not.toBeInTheDocument();
  });

  it('still shows Email product when selling is blocked', () => {
    lineState.current = {
      ...lineState.base,
      multiLineWrites: true,
      lineSlug: 'eagle-peak',
      eaglePeakSelling: false,
      eaglePeakOutreach: true,
      status: 'active',
    };
    renderDrawer();
    expect(screen.getByRole('button', { name: 'Email product' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '+ Log Order / Reorder' })).not.toBeInTheDocument();
  });

  it('renders the Research section with AccountResearchPanel', () => {
    renderDrawer();
    expect(screen.getByRole('button', { name: 'Research' })).toBeInTheDocument();
    expect(screen.getByText('Account research panel')).toBeInTheDocument();
  });
});
