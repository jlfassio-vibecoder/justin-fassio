import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AddAccountContactInline } from '@/components/AddAccountContactInline';
import type { AccountContact } from '@/lib/accountContacts';

const insertAccountContactMock = vi.fn();
const demoteAccountPrimaryContactMock = vi.fn();
const restoreAccountPrimaryContactMock = vi.fn();

vi.mock('@/lib/accountContacts', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/accountContacts')>('@/lib/accountContacts');
  return {
    ...actual,
    insertAccountContact: (...args: unknown[]) => insertAccountContactMock(...args),
    demoteAccountPrimaryContact: (...args: unknown[]) => demoteAccountPrimaryContactMock(...args),
    restoreAccountPrimaryContact: (...args: unknown[]) => restoreAccountPrimaryContactMock(...args),
  };
});

function contact(
  partial: Partial<AccountContact> & Pick<AccountContact, 'id' | 'fullName'>,
): AccountContact {
  return {
    accountId: 1,
    role: 'buyer',
    title: null,
    phone: null,
    email: null,
    isPrimary: false,
    notes: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  };
}

describe('AddAccountContactInline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    demoteAccountPrimaryContactMock.mockResolvedValue({ error: null });
    restoreAccountPrimaryContactMock.mockResolvedValue({ error: null });
    insertAccountContactMock.mockResolvedValue({
      data: contact({
        id: 'new-1',
        fullName: 'New Person',
        email: 'new@example.com',
        role: 'buyer',
      }),
      error: null,
    });
  });

  it('hard-blocks exact email duplicate and does not insert', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const onSelectExisting = vi.fn();
    const existing = [
      contact({ id: 'c1', fullName: 'Pat Buyer', email: 'pat@example.com', isPrimary: true }),
    ];

    render(
      <AddAccountContactInline
        accountId={1}
        existingContacts={existing}
        onCreated={onCreated}
        onCancel={vi.fn()}
        onSelectExisting={onSelectExisting}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Someone Else');
    await user.type(screen.getByLabelText(/^Email$/i), 'pat@example.com');
    await user.click(screen.getByRole('button', { name: /Save contact/i }));

    expect(await screen.findByText(/email already exists/i)).toBeInTheDocument();
    expect(insertAccountContactMock).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Save contact/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Use existing contact/i }));
    expect(onSelectExisting).toHaveBeenCalledWith(existing[0]);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('name-only match warns and Create anyway inserts', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    const existing = [contact({ id: 'c1', fullName: 'Pat Buyer', email: null })];

    render(
      <AddAccountContactInline
        accountId={1}
        existingContacts={existing}
        writeOpts={{ salesLineId: 'line-1' }}
        onCreated={onCreated}
        onCancel={vi.fn()}
        onSelectExisting={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'Pat Buyer');
    await user.click(screen.getByRole('button', { name: /Save contact/i }));

    expect(await screen.findByText(/similar name already exists/i)).toBeInTheDocument();
    expect(insertAccountContactMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Create anyway/i }));
    await waitFor(() => {
      expect(insertAccountContactMock).toHaveBeenCalledWith(
        expect.objectContaining({ full_name: 'Pat Buyer' }),
        { salesLineId: 'line-1' },
      );
    });
    expect(onCreated).toHaveBeenCalled();
  });

  it('confirms before replacing primary; decline still inserts as non-primary', async () => {
    const user = userEvent.setup();
    const confirmMock = vi.fn(() => false);
    vi.stubGlobal('confirm', confirmMock);
    const onCreated = vi.fn();
    const existing = [contact({ id: 'c1', fullName: 'Pat Buyer', isPrimary: true })];

    render(
      <AddAccountContactInline
        accountId={1}
        existingContacts={existing}
        onCreated={onCreated}
        onCancel={vi.fn()}
        onSelectExisting={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'New Person');
    await user.click(screen.getByRole('checkbox', { name: /Primary contact/i }));
    await user.click(screen.getByRole('button', { name: /Save contact/i }));

    await waitFor(() => {
      expect(insertAccountContactMock).toHaveBeenCalled();
    });
    expect(confirmMock).toHaveBeenCalled();
    expect(demoteAccountPrimaryContactMock).not.toHaveBeenCalled();
    expect(insertAccountContactMock).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'New Person',
        is_primary: false,
      }),
      undefined,
    );
    vi.unstubAllGlobals();
  });

  it('demotes existing primary when user confirms replace', async () => {
    const user = userEvent.setup();
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal('confirm', confirmMock);
    const onCreated = vi.fn();
    const existing = [contact({ id: 'c1', fullName: 'Pat Buyer', isPrimary: true })];

    render(
      <AddAccountContactInline
        accountId={1}
        existingContacts={existing}
        writeOpts={{ salesLineId: 'line-1' }}
        onCreated={onCreated}
        onCancel={vi.fn()}
        onSelectExisting={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'New Person');
    await user.click(screen.getByRole('checkbox', { name: /Primary contact/i }));
    await user.click(screen.getByRole('button', { name: /Save contact/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
    expect(demoteAccountPrimaryContactMock).toHaveBeenCalledWith('c1', { salesLineId: 'line-1' });
    expect(insertAccountContactMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_primary: true, full_name: 'New Person' }),
      { salesLineId: 'line-1' },
    );
    expect(restoreAccountPrimaryContactMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('restores previous primary when create fails after demote', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'confirm',
      vi.fn(() => true),
    );
    insertAccountContactMock.mockResolvedValue({
      data: null,
      error: 'insert failed',
    });
    const existing = [contact({ id: 'c1', fullName: 'Pat Buyer', isPrimary: true })];

    render(
      <AddAccountContactInline
        accountId={1}
        existingContacts={existing}
        writeOpts={{ salesLineId: 'line-1' }}
        onCreated={vi.fn()}
        onCancel={vi.fn()}
        onSelectExisting={vi.fn()}
      />,
    );

    await user.type(screen.getByPlaceholderText(/Dave Miller/i), 'New Person');
    await user.click(screen.getByRole('checkbox', { name: /Primary contact/i }));
    await user.click(screen.getByRole('button', { name: /Save contact/i }));

    await waitFor(() => {
      expect(restoreAccountPrimaryContactMock).toHaveBeenCalledWith('c1', {
        salesLineId: 'line-1',
      });
    });
    expect(await screen.findByText(/insert failed/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
