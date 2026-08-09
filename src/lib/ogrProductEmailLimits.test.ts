import { describe, expect, it } from 'vitest';
import { isValidOgrProductEmailRecipient } from '@/lib/ogrProductEmailLimits';

describe('isValidOgrProductEmailRecipient', () => {
  it('accepts a basic email address', () => {
    expect(isValidOgrProductEmailRecipient('buyer@example.com')).toBe(true);
  });

  it('rejects missing domain dots and bare @', () => {
    expect(isValidOgrProductEmailRecipient('buyer@example')).toBe(false);
    expect(isValidOgrProductEmailRecipient('not-an-email')).toBe(false);
  });

  it('rejects whitespace and control characters', () => {
    expect(isValidOgrProductEmailRecipient('buyer @example.com')).toBe(false);
    expect(isValidOgrProductEmailRecipient('buyer@example.com\r\nBcc:evil@x.com')).toBe(false);
  });
});
