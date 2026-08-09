import { describe, expect, it } from 'vitest';
import { GmailClientError } from '@/lib/google/gmailClient';
import { gmailClientErrorToClientMessage } from '@/lib/google/gmailErrors';

describe('gmailClientErrorToClientMessage', () => {
  it('maps API-not-enabled errors', () => {
    const err = new GmailClientError(
      'Gmail API has not been used in project 123 before or it is disabled.',
      { status: 403, reason: 'accessNotConfigured' },
    );
    const mapped = gmailClientErrorToClientMessage(err, 'fallback');
    expect(mapped.error).toMatch(/Gmail API is not enabled/i);
  });

  it('maps insufficient scope errors to reconnect', () => {
    const err = new GmailClientError('Request had insufficient authentication scopes.', {
      status: 403,
      reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
    });
    const mapped = gmailClientErrorToClientMessage(err, 'fallback');
    expect(mapped.needsReconnect).toBe(true);
    expect(mapped.error).toMatch(/reconnect/i);
  });

  it('keeps generic fallback for unknown errors', () => {
    const err = new GmailClientError('Something odd', { status: 500 });
    expect(gmailClientErrorToClientMessage(err, 'Failed to send Gmail message')).toEqual({
      error: 'Failed to send Gmail message',
    });
  });
});
