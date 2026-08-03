import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LogCallModal } from '@/components/LogCallModal';
import type { Prospect } from '@/lib/prospects';

const insertMock = vi.fn();

const TEST_PROSPECTS: Prospect[] = [
  {
    id: 1,
    name: 'Kelowna Golf & Country Club',
    category: 'Golf',
    region: 'Okanagan',
    city: 'Kelowna',
    address: '1297 Glenmore Dr',
    phone: '250-762-2531',
    fit: 'Test',
  },
];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'calls') {
        throw new Error(`Unexpected table: ${table}`);
      }
      return {
        insert: (row: unknown) => insertMock(row),
      };
    },
  },
}));

function ModalHarness({
  initialOpen = true,
  onClose = vi.fn(),
  onSaved = vi.fn(),
}: {
  initialOpen?: boolean;
  onClose?: () => void;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [storeId, setStoreId] = useState<number | null>(1);

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Reopen
      </button>
      <LogCallModal
        open={open}
        prospects={TEST_PROSPECTS}
        storeId={storeId}
        onClose={() => {
          onClose();
          setOpen(false);
        }}
        onStoreChange={setStoreId}
        onSaved={onSaved}
      />
    </div>
  );
}

describe('LogCallModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertMock.mockResolvedValue({ error: null });
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

  it('inserts a call and closes on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<ModalHarness onClose={onClose} onSaved={onSaved} />);

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Dave Miller (Owner)');
    await user.click(screen.getByRole('checkbox', { name: /Loves display rack/i }));
    await user.type(screen.getByPlaceholderText(/Call summary/i), 'Interested in spring book.');
    await user.click(screen.getByRole('button', { name: /Save Call Record/i }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith({
        prospect_id: 1,
        contact_name: 'Dave Miller (Owner)',
        outcome: 'Closed PO / Written Order',
        pmf_score: 10,
        order_value_cad: 0,
        objection_tags: ['Loves display rack'],
        notes: 'Interested in spring book.',
      });
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
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
