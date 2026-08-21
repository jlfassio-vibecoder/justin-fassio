import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountContactsSection } from '@/components/AccountContactsSection';
import type { AccountContact } from '@/lib/accountContacts';

const fetchContactsForAccountMock = vi.fn();

vi.mock('@/lib/accountContacts', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/accountContacts')>('@/lib/accountContacts');
  return {
    ...actual,
    fetchContactsForAccount: (...args: unknown[]) => fetchContactsForAccountMock(...args),
  };
});

vi.mock('@/lib/lineContext', () => ({
  useOptionalLineContext: () => ({
    lineSlug: 'ogr',
    status: 'active',
    defaultCurrency: 'CAD',
    multiLineWrites: false,
    salesLineId: 'line-ogr',
    eaglePeakSelling: false,
    bigFishSelling: false,
  }),
}));

vi.mock('@/lib/retailerLineAccounts', async () => {
  const actual = await vi.importActual<typeof import('@/lib/retailerLineAccounts')>(
    '@/lib/retailerLineAccounts',
  );
  return {
    ...actual,
    isStaffSellingUiBlocked: () => false,
  };
});

function contact(
  partial: Partial<AccountContact> & Pick<AccountContact, 'id' | 'fullName'>,
): AccountContact {
  return {
    accountId: 1,
    role: 'buyer',
    title: 'Buyer',
    phone: '250-555-0100',
    email: 'pat@example.com',
    isPrimary: true,
    notes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('AccountContactsSection reloadToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchContactsForAccountMock.mockResolvedValue({ data: [], error: null });
  });

  it('refetches when reloadToken bumps after Log Call creates a contact', async () => {
    fetchContactsForAccountMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: [
          contact({
            id: 'c-new',
            fullName: 'New From Call',
            email: 'new@example.com',
            phone: '250-555-9999',
            title: 'Owner',
            isPrimary: true,
          }),
        ],
        error: null,
      });

    const { rerender } = render(<AccountContactsSection accountId={1} reloadToken={0} />);

    await waitFor(() => {
      expect(fetchContactsForAccountMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText(/No contacts yet/i)).toBeInTheDocument();

    rerender(<AccountContactsSection accountId={1} reloadToken={1} />);

    await waitFor(() => {
      expect(fetchContactsForAccountMock).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('New From Call')).toBeInTheDocument();
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText('250-555-9999')).toBeInTheDocument();
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });
});
