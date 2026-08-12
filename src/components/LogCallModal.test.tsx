import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: (table: string) => {
      if (table === 'calls') {
        return {
          insert: (row: unknown) => insertMock(row),
        };
      }
      if (table === 'lines') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { id: 'line-ogr' }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  },
}));

function ModalHarness({
  initialOpen = true,
  onClose = vi.fn(),
  onSaved = vi.fn(),
  onConverted = vi.fn(),
  prospects = TEST_PROSPECTS,
}: {
  initialOpen?: boolean;
  onClose?: () => void;
  onSaved?: () => void;
  onConverted?: () => void;
  prospects?: Prospect[];
}) {
  const [open, setOpen] = useState(initialOpen);
  const [storeId, setStoreId] = useState<number | null>(1);

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
    insertMock.mockResolvedValue({ error: null });
    convertMock.mockResolvedValue({ ok: true, alreadyActive: false });
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

  it('after Closed PO save, prompts convert instead of closing immediately', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<ModalHarness onClose={onClose} onSaved={onSaved} />);

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Dave Miller (Owner)');
    await user.type(screen.getByPlaceholderText(/0 if no PO/i), '1200');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalled();
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(await screen.findByText(/Convert to Active Account/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('1200')).toBeInTheDocument();
  });

  it('closes without convert prompt for non-conversion outcomes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<ModalHarness onClose={onClose} onSaved={onSaved} />);

    await user.selectOptions(screen.getByDisplayValue(/Closed PO/i), 'Follow-up Scheduled');
    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Dave Miller (Owner)');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Convert to Active Account/i)).not.toBeInTheDocument();
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
      expect(onClose).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Convert to Active Account/i)).not.toBeInTheDocument();
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
      expect(onClose).toHaveBeenCalled();
    });
    expect(screen.queryByText(/Convert to Active Account/i)).not.toBeInTheDocument();
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
});
