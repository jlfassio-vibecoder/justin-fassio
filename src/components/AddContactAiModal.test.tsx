import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddContactAiModal } from '@/components/AddContactAiModal';
import { EMPTY_PROSPECT_PLANNING, type Prospect } from '@/lib/prospects';

const enrichContactMock = vi.fn();

vi.mock('@/lib/enrichContact', () => ({
  enrichContact: (...args: unknown[]) => enrichContactMock(...args),
}));

const EXISTING: Prospect = {
  id: 1,
  name: 'Kelowna Golf & Country Club',
  category: 'Golf',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '',
  phone: '',
  fit: '',
  accountStatus: 'active_account',
  convertedAt: null,
  initialOrderDate: null,
  notes: null,
  ...EMPTY_PROSPECT_PLANNING,
};

describe('AddContactAiModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires contact and company name', () => {
    render(<AddContactAiModal open prospects={[]} onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Add via AI' })).toBeDisabled();
  });

  it('creates prospect when no company match', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    enrichContactMock.mockResolvedValue({
      ok: true,
      prospect: { ...EXISTING, id: 250, name: 'Coastal Outfitters' },
      contact: {
        id: 'c1',
        accountId: 250,
        role: 'buyer',
        fullName: 'Sarah Jenkins',
        title: null,
        phone: null,
        email: null,
        isPrimary: true,
        notes: null,
        createdAt: '2026-08-01T00:00:00Z',
        updatedAt: '2026-08-01T00:00:00Z',
      },
    });

    render(<AddContactAiModal open prospects={[]} onClose={vi.fn()} onCreated={onCreated} />);
    await user.type(screen.getByPlaceholderText(/Sarah Jenkins/i), 'Sarah Jenkins');
    await user.type(screen.getByPlaceholderText(/Coastal Outfitters/i), 'Coastal Outfitters');
    await user.click(screen.getByRole('button', { name: 'Add via AI' }));

    await screen.findByRole('button', { name: 'Add via AI' });
    expect(enrichContactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contactName: 'Sarah Jenkins',
        companyName: 'Coastal Outfitters',
        mode: 'create_prospect',
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  it('shows attach/create confirm when company matches', async () => {
    const user = userEvent.setup();
    render(<AddContactAiModal open prospects={[EXISTING]} onClose={vi.fn()} onCreated={vi.fn()} />);

    await user.type(screen.getByPlaceholderText(/Sarah Jenkins/i), 'Sarah Jenkins');
    await user.type(
      screen.getByPlaceholderText(/Coastal Outfitters/i),
      'Kelowna Golf & Country Club',
    );
    await user.click(screen.getByRole('button', { name: 'Add via AI' }));

    expect(await screen.findByText(/already in directory/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Attach to selected/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create new prospect/i })).toBeInTheDocument();
    expect(enrichContactMock).not.toHaveBeenCalled();
  });
});
