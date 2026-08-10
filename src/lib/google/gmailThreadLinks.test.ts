import { describe, expect, it } from 'vitest';
import { toPublicGmailThreadLink, type GmailThreadLinkRow } from '@/lib/google/gmailThreadLinks';

const row: GmailThreadLinkRow = {
  id: 'link-1',
  google_connection_id: 'conn-1',
  gmail_thread_id: 'thread-1',
  prospect_id: 42,
  account_contact_id: 'contact-1',
  link_status: 'confirmed',
  subject: 'Re: Quote',
  snippet: 'Thanks',
  participants: ['a@example.com', 'b@example.com'],
  unread: true,
  last_message_at: '2026-08-09T12:00:00.000Z',
  created_at: '2026-08-09T00:00:00.000Z',
  updated_at: '2026-08-09T12:00:00.000Z',
};

describe('toPublicGmailThreadLink', () => {
  it('maps row without secrets', () => {
    const pub = toPublicGmailThreadLink(row);
    expect(pub).toEqual({
      id: 'link-1',
      googleConnectionId: 'conn-1',
      gmailThreadId: 'thread-1',
      prospectId: 42,
      accountContactId: 'contact-1',
      linkStatus: 'confirmed',
      subject: 'Re: Quote',
      snippet: 'Thanks',
      participants: ['a@example.com', 'b@example.com'],
      unread: true,
      lastMessageAt: '2026-08-09T12:00:00.000Z',
    });
    expect(JSON.stringify(pub)).not.toMatch(/refresh_token|ciphertext/i);
  });
});
