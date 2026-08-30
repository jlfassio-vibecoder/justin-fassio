import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogCallModal } from '@/components/LogCallModal';
import { AiAssistProvider } from '@/lib/AiAssistProvider';
import {
  BC_PROSPECT_TERRITORY,
  EMPTY_PROSPECT_PLANNING,
  EMPTY_PROSPECT_TAXONOMY,
  type Prospect,
} from '@/lib/prospects';

const insertMock = vi.fn();
const convertMock = vi.fn();
const openAssistMock = vi.fn();
const insertAccountContactMock = vi.fn();
const fetchContactActivityHistoryMock = vi.fn();
let previousCallRows: Record<string, unknown>[] = [];
const contactsRows: Record<string, unknown>[] = [];
let systemMessageRows: Record<string, unknown>[] = [];
let useActivityHistoryMock = false;

const TEST_PROSPECTS: Prospect[] = [
  {
    id: 1,
    name: 'Kelowna Golf & Country Club',
    category: 'golf_retail',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '1297 Glenmore Dr',
    phone: '250-762-2531',
    fit: 'Test',
    accountStatus: 'prospect',
    convertedAt: null,
    initialOrderDate: null,
    notes: null,
    ...EMPTY_PROSPECT_PLANNING,
    ...EMPTY_PROSPECT_TAXONOMY,
    ...BC_PROSPECT_TERRITORY,
  },
];

vi.mock('@/lib/contactActivityHistory', async () => {
  const actual = await vi.importActual<typeof import('@/lib/contactActivityHistory')>(
    '@/lib/contactActivityHistory',
  );
  return {
    ...actual,
    fetchContactActivityHistory: (...args: unknown[]) => {
      if (useActivityHistoryMock) {
        return fetchContactActivityHistoryMock(...args);
      }
      return actual.fetchContactActivityHistory(
        ...(args as Parameters<typeof actual.fetchContactActivityHistory>),
      );
    },
  };
});

vi.mock('@/hooks/useAiAssist', () => ({
  useAiAssist: () => ({ openAssist: openAssistMock }),
}));

vi.mock('@/lib/accountContacts', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/accountContacts')>('@/lib/accountContacts');
  return {
    ...actual,
    insertAccountContact: (...args: unknown[]) => insertAccountContactMock(...args),
  };
});

vi.mock('@/lib/convertToActiveAccount', async () => {
  const actual = await vi.importActual<typeof import('@/lib/convertToActiveAccount')>(
    '@/lib/convertToActiveAccount',
  );
  return {
    ...actual,
    convertToActiveAccount: (...args: unknown[]) => convertMock(...args),
  };
});

vi.mock('@/lib/outreachAttribution', () => ({
  listLinkedOutreachCandidates: vi.fn(async () => ({ ok: true, candidates: [] })),
  recordConversionAttribution: vi.fn(async () => ({ ok: true, id: 'attr-1' })),
}));

vi.mock('@/lib/retailerLineAccounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/retailerLineAccounts')>(
    '@/lib/retailerLineAccounts',
  );
  return {
    ...actual,
    ensureRetailerLineAccount: vi.fn(async () => ({
      gate: 'allow',
      data: { id: 'rla-ogr', relationshipStatus: 'prospect' },
      error: null,
    })),
  };
});

function chainable(result: { data: unknown; error: unknown }) {
  const api: Record<string, unknown> = {};
  const self = () => api;
  api.select = self;
  api.eq = self;
  api.order = self;
  api.limit = () => Promise.resolve(result);
  api.maybeSingle = () => Promise.resolve(result);
  api.single = () => Promise.resolve(result);
  api.insert = (row: unknown) => insertMock(row);
  api.update = () => ({
    eq: () => Promise.resolve({ error: null }),
  });
  return api;
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'calls') {
        return {
          insert: (row: unknown) => {
            const payload = row as Record<string, unknown>;
            previousCallRows = [
              {
                id: `call-${previousCallRows.length + 1}`,
                call_date: payload.call_date,
                contact_name: payload.contact_name,
                outcome: payload.outcome,
                objection_tags: payload.objection_tags ?? [],
                follow_up_date: payload.follow_up_date ?? null,
                notes: payload.notes ?? null,
                created_at: new Date().toISOString(),
              },
              ...previousCallRows,
            ];
            return insertMock(row);
          },
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  order: () => ({
                    limit: async () => ({ data: previousCallRows, error: null }),
                  }),
                }),
              }),
              order: () => ({
                order: () => ({
                  limit: async () => ({ data: previousCallRows, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'prospects') {
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      }
      if (table === 'account_contacts') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                order: async () => ({ data: contactsRows, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'system_messages') {
        const api: Record<string, unknown> = {};
        const self = () => api;
        api.select = self;
        api.eq = self;
        api.not = self;
        api.or = self;
        api.order = self;
        api.limit = async () => ({ data: systemMessageRows, error: null });
        return api;
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async () => ({ data: [], error: null }),
          }),
        };
      }
      if (table === 'lines') {
        return chainable({ data: { id: 'line-ogr' }, error: null });
      }
      if (table === 'account_research_source_locks') {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

function ModalHarness({
  initialOpen = true,
  initialStoreId = 1 as number | null,
  onClose = vi.fn(),
  onSaved = vi.fn(),
  onConverted = vi.fn(),
  prospects = TEST_PROSPECTS,
}: {
  initialOpen?: boolean;
  initialStoreId?: number | null;
  onClose?: () => void;
  onSaved?: () => void;
  onConverted?: () => void;
  prospects?: Prospect[];
}) {
  const [open, setOpen] = useState(initialOpen);
  const [storeId, setStoreId] = useState<number | null>(initialStoreId);

  return (
    <AiAssistProvider>
      <div>
        <button type="button" onClick={() => setOpen(true)}>
          Reopen
        </button>
        <LogCallModal
          open={open}
          prospects={prospects}
          storeId={storeId}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          onStoreChange={setStoreId}
          onSaved={onSaved}
          onConverted={onConverted}
        />
      </div>
    </AiAssistProvider>
  );
}

describe('LogCallModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    previousCallRows = [];
    contactsRows.length = 0;
    systemMessageRows = [];
    useActivityHistoryMock = false;
    insertMock.mockResolvedValue({ error: null });
    convertMock.mockResolvedValue({ ok: true, alreadyActive: false });
    insertAccountContactMock.mockResolvedValue({
      data: {
        id: 'c-new',
        accountId: 1,
        role: 'buyer',
        fullName: 'New Contact',
        title: 'Buyer',
        phone: null,
        email: 'new@example.com',
        alternateEmail: null,
        isPrimary: false,
        notes: null,
        createdAt: '',
        updatedAt: '',
      },
      error: null,
    });
  });

  it('shows Log Prospect Call for prospect records', () => {
    render(<ModalHarness />);
    expect(screen.getByText('Log Prospect Call')).toBeInTheDocument();
    expect(screen.queryByText(/Draft as/i)).not.toBeInTheDocument();
  });

  it('shows Log Call for active accounts with account feedback tags', async () => {
    const activeProspects: Prospect[] = [
      { ...TEST_PROSPECTS[0]!, accountStatus: 'active_account' },
    ];
    render(<ModalHarness prospects={activeProspects} />);
    expect(screen.getByText('Log Call')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Happy with assortment/i })).toBeInTheDocument();
    expect(screen.queryByText(/PMF fit score/i)).not.toBeInTheDocument();
  });

  it('requires selecting a record when opened without storeId', async () => {
    const user = userEvent.setup();
    render(<ModalHarness initialStoreId={null} />);
    expect(screen.getByRole('button', { name: /Save Call Record/i })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('clears feedback checkboxes after cancel and reopen', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ModalHarness onClose={onClose} />);

    const checkbox = screen.getByRole('checkbox', { name: /Loves display rack/i });
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.queryByRole('checkbox', { name: /Loves display rack/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Reopen/i }));
    expect(screen.getByRole('checkbox', { name: /Loves display rack/i })).not.toBeChecked();
  });

  it('after Closed PO save, prompts convert instead of opening AI', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const { container } = render(<ModalHarness onClose={onClose} onSaved={onSaved} />);

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Dave Miller (Owner)');
    fireEvent.change(screen.getByPlaceholderText(/0 if no PO/i), { target: { value: '1200' } });
    fireEvent.change(screen.getByPlaceholderText('1.45'), { target: { value: '1.45' } });
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        call_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        order_value_original_currency: 'USD',
        order_value_original_amount: 1200,
        order_value_exchange_rate: 1.45,
        order_value_cad: 1740,
      }),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(openAssistMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/Convert to Active Account/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('1200')).toBeInTheDocument();
    expect(screen.getByText(/CAD reporting amount: 1740/i)).toBeInTheDocument();
  });

  it('after non-conversion save, stays open with optional AI draft (default off)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<ModalHarness onClose={onClose} onSaved={onSaved} />);

    await user.selectOptions(screen.getByDisplayValue(/Closed PO/i), 'Follow-up Scheduled');
    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Dave Miller (Owner)');
    const followUp = screen.getByLabelText(/Follow-up date/i);
    fireEvent.change(followUp, { target: { value: '2026-09-01' } });
    await user.type(screen.getByPlaceholderText(/Call summary/i), 'Discussed spring reorder');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(openAssistMock).not.toHaveBeenCalled();
    expect(await screen.findByText(/Call saved/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Draft follow-up with AI/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Draft follow-up with AI/i }));
    expect(openAssistMock).toHaveBeenCalled();
  });

  it('round-trips notes and structured fields into Previous activity after save', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.selectOptions(screen.getByDisplayValue(/Closed PO/i), 'Follow-up Scheduled');
    await user.click(screen.getByRole('checkbox', { name: /Loves display rack/i }));
    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Sam Buyer (Buyer)');
    fireEvent.change(screen.getByLabelText(/Follow-up date/i), { target: { value: '2026-10-15' } });
    await user.type(screen.getByPlaceholderText(/Call summary/i), 'Full notes for history panel');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contact_name: 'Sam Buyer (Buyer)',
          outcome: 'Follow-up Scheduled',
          follow_up_date: '2026-10-15',
          notes: 'Full notes for history panel',
          objection_tags: ['Loves display rack'],
        }),
      );
    });

    const history = await screen.findByLabelText(/Previous activity/i);
    expect(within(history).getByText(/^Call$/i)).toBeInTheDocument();
    expect(within(history).getByText(/Full notes for history panel/i)).toBeInTheDocument();
    expect(within(history).getByText(/Sam Buyer \(Buyer\)/i)).toBeInTheDocument();
    expect(within(history).getByText(/Follow-up Scheduled/i)).toBeInTheDocument();
    expect(within(history).getByText(/Loves display rack/i)).toBeInTheDocument();
    expect(within(history).getByText(/Follow-up 2026-10-15/i)).toBeInTheDocument();
  });

  it('shows sent product email once in Previous activity with Email badge', async () => {
    systemMessageRows = [
      {
        id: 'sm-1',
        to_email: 'buyer@example.com',
        to_name: 'Pat Buyer',
        subject: 'Trail Cap for your shop',
        status: 'sent',
        origin: 'manual_product_email',
        intro_text: null,
        sent_at: '2026-08-21T14:30:00.000Z',
        prospect_id: 1,
        account_contact_id: null,
        retailer_line_account_id: null,
        catalog_item_id: 'cat-1',
        sent_by: null,
        payload: {
          sku: 'TC-1',
          name: 'Trail Cap',
          slug: 'trail-cap',
          productHref: 'https://example.com/p',
        },
        created_at: '2026-08-21T14:30:00.000Z',
      },
    ];

    render(<ModalHarness />);

    const history = await screen.findByLabelText(/Previous activity/i);
    await waitFor(() => {
      expect(within(history).getByText(/^Email$/i)).toBeInTheDocument();
    });
    expect(within(history).getByText(/Trail Cap for your shop/i)).toBeInTheDocument();
    expect(within(history).getByText(/Trail Cap \(TC-1\)/i)).toBeInTheDocument();
    expect(within(history).getAllByText(/^Email$/i)).toHaveLength(1);
  });

  it('skips convert prompt when prospect is already an active account', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const activeProspects: Prospect[] = [
      { ...TEST_PROSPECTS[0]!, accountStatus: 'active_account' },
    ];
    render(<ModalHarness onClose={onClose} onSaved={onSaved} prospects={activeProspects} />);

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Dave Miller (Owner)');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(openAssistMock).not.toHaveBeenCalled();
    expect(screen.queryByText(/Convert to Active Account/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Call saved/i)).toBeInTheDocument();
  });

  it('skips convert prompt when prospect is inactive', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    const inactiveProspects: Prospect[] = [{ ...TEST_PROSPECTS[0]!, accountStatus: 'inactive' }];
    render(<ModalHarness onClose={onClose} onSaved={onSaved} prospects={inactiveProspects} />);

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Dave Miller (Owner)');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Convert to Active Account/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/Call saved/i)).toBeInTheDocument();
  });

  it('shows an error and stays open when insert fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    insertMock.mockResolvedValue({ error: { message: 'new row violates row-level security' } });
    render(<ModalHarness onClose={onClose} onSaved={onSaved} />);

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Test Contact');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    expect(await screen.findByText(/row-level security/i)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Save Call Record/i })).toBeInTheDocument();
  });

  it('does not create a CRM contact when only typing a call contact name', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.type(screen.getByPlaceholderText(/Call summary/i), 'Keep these notes');
    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Typed Only Person');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    expect(insertAccountContactMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ contact_name: 'Typed Only Person' }),
    );
  });

  it('Add new contact creates CRM contact, selects it, and preserves call notes', async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.type(screen.getByPlaceholderText(/Call summary/i), 'Notes stay while adding');
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add new contact/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /Add new contact/i }));
    expect(screen.getByText('New contact')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Notes stay while adding')).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/^e\.g\. Dave Miller$/i), 'New Contact');
    await user.click(screen.getByRole('button', { name: /Save contact/i }));

    await waitFor(() => {
      expect(insertAccountContactMock).toHaveBeenCalledWith(
        expect.objectContaining({
          account_id: 1,
          full_name: 'New Contact',
        }),
        expect.anything(),
      );
    });

    expect(screen.queryByText('New contact')).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Notes stay while adding')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Dave Miller \(Owner\)/i)).toHaveValue(
      'New Contact (Buyer)',
    );
    expect(screen.getByRole('option', { name: /New Contact \(Buyer\)/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));
    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          contact_name: expect.stringContaining('New Contact'),
          notes: 'Notes stay while adding',
        }),
      );
    });
  });

  it('clears activity on store change and ignores stale history responses', async () => {
    const user = userEvent.setup();
    useActivityHistoryMock = true;

    let resolveFirst!: (value: {
      data: Array<{
        kind: 'call';
        id: string;
        occurredAt: string;
        sortAt: string;
        contactLabel: string | null;
        outcome: string;
        notes: string;
        objectionTags: string[];
        followUpDate: null;
      }>;
      error: null;
    }) => void;

    const firstPromise = new Promise<Parameters<typeof resolveFirst>[0]>((resolve) => {
      resolveFirst = resolve;
    });

    fetchContactActivityHistoryMock.mockImplementation(
      (input: { prospectId: number; salesLineId: string | null }) => {
        if (input.prospectId === 1) return firstPromise;
        return Promise.resolve({ data: [], error: null });
      },
    );

    const prospects: Prospect[] = [
      TEST_PROSPECTS[0]!,
      {
        ...TEST_PROSPECTS[0]!,
        id: 2,
        name: 'Other Store',
        city: 'Vernon',
      },
    ];

    render(<ModalHarness prospects={prospects} />);

    await user.selectOptions(screen.getByDisplayValue(/Kelowna Golf & Country Club/i), '2');

    expect(screen.getByLabelText(/Previous activity/i)).toHaveTextContent(
      /No prior activity on this line/i,
    );

    resolveFirst({
      data: [
        {
          kind: 'call',
          id: 'stale-call',
          occurredAt: '2026-08-01',
          sortAt: '2026-08-01T00:00:00.000Z',
          contactLabel: 'Stale Contact',
          outcome: 'Left Message / Gatekeeper',
          notes: 'Should not appear',
          objectionTags: [],
          followUpDate: null,
        },
      ],
      error: null,
    });

    await waitFor(() => {
      expect(fetchContactActivityHistoryMock).toHaveBeenCalledWith(
        expect.objectContaining({ prospectId: 2 }),
      );
    });

    expect(screen.queryByText(/Should not appear/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Stale Contact/i)).not.toBeInTheDocument();
  });
});
