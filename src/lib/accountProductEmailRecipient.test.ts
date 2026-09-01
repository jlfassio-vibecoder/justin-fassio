import { describe, expect, it } from 'vitest';
import type { AccountContact } from '@/lib/accountContacts';
import {
  accountContactsWithEmail,
  accountProductEmailRecipientHint,
  defaultAccountProductEmailContact,
  NO_SAVED_RECIPIENT_EMAIL_HINT,
  toAccountProductEmailRecipientOptions,
} from '@/lib/accountProductEmailRecipient';

function contact(
  partial: Partial<AccountContact> & Pick<AccountContact, 'id' | 'fullName'>,
): AccountContact {
  return {
    accountId: 1,
    role: 'buyer',
    title: null,
    phone: null,
    email: null,
    alternateEmail: null,
    isPrimary: false,
    notes: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...partial,
  };
}

describe('accountProductEmailRecipient', () => {
  it('defaults to the primary contact that has an email', () => {
    const contacts = [
      contact({ id: 'c1', fullName: 'First', email: 'first@example.com' }),
      contact({ id: 'c2', fullName: 'Primary', email: 'primary@example.com', isPrimary: true }),
    ];
    expect(defaultAccountProductEmailContact(contacts)?.id).toBe('c2');
  });

  it('falls back to the first contact with email when primary has none', () => {
    const contacts = [
      contact({ id: 'c1', fullName: 'Primary', isPrimary: true }),
      contact({ id: 'c2', fullName: 'Buyer', email: 'buyer@example.com' }),
      contact({ id: 'c3', fullName: 'Later', email: 'later@example.com' }),
    ];
    expect(defaultAccountProductEmailContact(contacts)?.id).toBe('c2');
  });

  it('returns null and a hint when no contact has email', () => {
    const contacts = [contact({ id: 'c1', fullName: 'Primary', isPrimary: true })];
    expect(defaultAccountProductEmailContact(contacts)).toBeNull();
    expect(accountContactsWithEmail(contacts)).toEqual([]);
    expect(accountProductEmailRecipientHint(contacts)).toBe(NO_SAVED_RECIPIENT_EMAIL_HINT);
    expect(toAccountProductEmailRecipientOptions(contacts)).toEqual([]);
  });

  it('maps contacts with email into recipient options', () => {
    const contacts = [
      contact({ id: 'c1', fullName: 'Sam', email: '  sam@example.com  ' }),
      contact({ id: 'c2', fullName: 'Pat' }),
    ];
    expect(toAccountProductEmailRecipientOptions(contacts)).toEqual([
      { id: 'c1', email: 'sam@example.com', name: 'Sam' },
    ]);
    expect(accountProductEmailRecipientHint(contacts)).toBeNull();
  });
});
