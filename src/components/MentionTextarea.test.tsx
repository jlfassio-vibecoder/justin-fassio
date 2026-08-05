import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MentionTextarea } from '@/components/MentionTextarea';
import type { AccountContact } from '@/lib/accountContacts';
import { catalogItemStub } from '@/lib/catalog';

const ITEMS = [
  catalogItemStub({
    page: 1,
    cat: 'Tees',
    sku: 'OG2511',
    name: 'Old Guys Rule Classic Tee',
    color: 'Navy',
    priceUsd: 12.5,
    msrpCad: 42,
    isNameDrop: true,
  }),
];

const CONTACTS: AccountContact[] = [
  {
    id: 'c1',
    accountId: 1,
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
];

function Harness({ contacts, accountId = 1 }: { contacts?: AccountContact[]; accountId?: number }) {
  const [value, setValue] = useState('');
  return (
    <MentionTextarea
      aria-label="Notes"
      value={value}
      onChange={setValue}
      items={ITEMS}
      contacts={contacts}
      accountId={accountId}
    />
  );
}

describe('MentionTextarea', () => {
  it('inserts formatted product on Enter after #query', async () => {
    const user = userEvent.setup();
    render(<Harness contacts={CONTACTS} />);

    const field = screen.getByLabelText('Notes');
    await user.type(field, '#Classic');
    expect(await screen.findByRole('option', { name: /OG2511/i })).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(field).toHaveValue('Old Guys Rule Classic Tee (SKU: OG2511) ');
  });

  it('inserts formatted contact on Enter after @query', async () => {
    const user = userEvent.setup();
    render(<Harness contacts={CONTACTS} />);

    const field = screen.getByLabelText('Notes');
    await user.type(field, '@Sarah');
    expect(await screen.findByRole('option', { name: /Sarah Jenkins/i })).toBeInTheDocument();

    await user.keyboard('{Enter}');
    expect(field).toHaveValue('Sarah Jenkins [Buyer] ');
  });
});
