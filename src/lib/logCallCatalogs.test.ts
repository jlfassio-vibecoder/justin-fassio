import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_CALL_OUTCOMES,
  ACCOUNT_FEEDBACK_TAGS,
  defaultOutcomeForMode,
  feedbackTagsForMode,
  isFollowUpScheduledOutcome,
  logCallTitle,
  resolveLogCallMode,
} from '@/lib/logCallCatalogs';
import { formatCallContactName } from '@/lib/logCallForm';
import type { AccountContact } from '@/lib/accountContacts';

describe('logCallCatalogs', () => {
  it('routes active and inactive to account mode', () => {
    expect(resolveLogCallMode('active_account')).toBe('account');
    expect(resolveLogCallMode('inactive')).toBe('account');
    expect(resolveLogCallMode('prospect')).toBe('prospect');
    expect(resolveLogCallMode(undefined)).toBe('prospect');
  });

  it('titles and catalogs differ by mode', () => {
    expect(logCallTitle('account')).toBe('Log Call');
    expect(logCallTitle('prospect')).toBe('Log Prospect Call');
    expect(ACCOUNT_CALL_OUTCOMES).toContain('Reorder discussion');
    expect(feedbackTagsForMode('account')).toEqual([...ACCOUNT_FEEDBACK_TAGS]);
    expect(defaultOutcomeForMode('account')).toBe(ACCOUNT_CALL_OUTCOMES[0]);
    expect(isFollowUpScheduledOutcome('Follow-up Scheduled')).toBe(true);
  });
});

describe('formatCallContactName', () => {
  const baseContact: AccountContact = {
    id: 'c1',
    accountId: 1,
    role: 'buyer',
    fullName: 'Dave Miller',
    title: 'Owner',
    phone: null,
    email: null,
    isPrimary: true,
    notes: null,
    createdAt: '',
    updatedAt: '',
  };

  it('prefers title over role', () => {
    expect(formatCallContactName(baseContact)).toBe('Dave Miller (Owner)');
  });

  it('appends phone when present', () => {
    expect(
      formatCallContactName({
        ...baseContact,
        title: null,
        phone: '250-555-1234',
      }),
    ).toBe('Dave Miller (Buyer) · 250-555-1234');
  });

  it('omits phone suffix when phone is empty', () => {
    expect(
      formatCallContactName({
        ...baseContact,
        title: null,
        phone: '   ',
      }),
    ).toBe('Dave Miller (Buyer)');
  });
});
