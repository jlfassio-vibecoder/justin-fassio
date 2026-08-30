import { describe, expect, it } from 'vitest';
import { resolveProductOutreachSendEmails } from '@/lib/resolveProductOutreachSendEmails';

describe('resolveProductOutreachSendEmails', () => {
  it('returns only the fallback when contact is not primary', () => {
    expect(
      resolveProductOutreachSendEmails(
        {
          isPrimary: false,
          email: 'a@example.com',
          alternateEmail: 'b@example.com',
        },
        'a@example.com',
      ),
    ).toEqual(['a@example.com']);
  });

  it('returns email + alternate for a primary contact', () => {
    expect(
      resolveProductOutreachSendEmails(
        {
          isPrimary: true,
          email: 'primary@example.com',
          alternateEmail: 'alt@example.com',
        },
        'primary@example.com',
      ),
    ).toEqual(['primary@example.com', 'alt@example.com']);
  });

  it('dedupes case-insensitively when alternate matches email', () => {
    expect(
      resolveProductOutreachSendEmails(
        {
          isPrimary: true,
          email: 'Same@Example.com',
          alternateEmail: 'same@example.com',
        },
        'Same@Example.com',
      ),
    ).toEqual(['same@example.com']);
  });

  it('keeps intended to first when it matches the alternate field', () => {
    expect(
      resolveProductOutreachSendEmails(
        {
          isPrimary: true,
          email: 'primary@example.com',
          alternateEmail: 'alt@example.com',
        },
        'alt@example.com',
      ),
    ).toEqual(['alt@example.com', 'primary@example.com']);
  });

  it('returns fallback only when primary has a single usable email', () => {
    expect(
      resolveProductOutreachSendEmails(
        {
          isPrimary: true,
          email: 'primary@example.com',
          alternateEmail: '  ',
        },
        'primary@example.com',
      ),
    ).toEqual(['primary@example.com']);
  });

  it('returns fallback alone when contact is missing', () => {
    expect(resolveProductOutreachSendEmails(null, 'solo@example.com')).toEqual([
      'solo@example.com',
    ]);
  });

  it('does not fan out to an unrelated fallbackTo for Primary contacts', () => {
    expect(
      resolveProductOutreachSendEmails(
        {
          isPrimary: true,
          email: 'primary@example.com',
          alternateEmail: 'alt@example.com',
        },
        'unrelated@example.com',
      ),
    ).toEqual(['primary@example.com', 'alt@example.com']);
  });

  it('uses fallbackTo alone when Primary has no usable emails', () => {
    expect(
      resolveProductOutreachSendEmails(
        {
          isPrimary: true,
          email: '  ',
          alternateEmail: null,
        },
        'fallback@example.com',
      ),
    ).toEqual(['fallback@example.com']);
  });
});
