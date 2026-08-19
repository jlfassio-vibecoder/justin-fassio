import type { AccountContact } from '@/lib/accountContacts';

export const NO_SAVED_RECIPIENT_EMAIL_HINT = 'No saved recipient email. Enter an address.';

export type AccountProductEmailRecipientOption = {
  id: string;
  email: string;
  name: string;
};

export function contactEmail(contact: AccountContact): string {
  return (contact.email ?? '').trim();
}

export function accountContactsWithEmail(contacts: AccountContact[]): AccountContact[] {
  return contacts.filter((contact) => contactEmail(contact).length > 0);
}

/** Primary-with-email, else first contact that has an email. */
export function defaultAccountProductEmailContact(
  contacts: AccountContact[],
): AccountContact | null {
  const withEmail = accountContactsWithEmail(contacts);
  return withEmail.find((contact) => contact.isPrimary) ?? withEmail[0] ?? null;
}

export function accountProductEmailRecipientHint(contacts: AccountContact[]): string | null {
  return accountContactsWithEmail(contacts).length === 0 ? NO_SAVED_RECIPIENT_EMAIL_HINT : null;
}

export function toAccountProductEmailRecipientOptions(
  contacts: AccountContact[],
): AccountProductEmailRecipientOption[] {
  return accountContactsWithEmail(contacts).map((contact) => ({
    id: contact.id,
    email: contactEmail(contact),
    name: contact.fullName,
  }));
}
