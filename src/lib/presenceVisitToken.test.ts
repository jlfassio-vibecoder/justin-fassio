import { describe, expect, it } from 'vitest';
import {
  appendPresenceVisitToken,
  isPresenceActive,
  signPresenceVisitToken,
  verifyPresenceVisitToken,
} from '@/lib/presenceVisitToken';

const SECRET = 'test-presence-secret-for-unit-tests';

describe('presenceVisitToken', () => {
  it('signs and verifies a visit token', () => {
    const token = signPresenceVisitToken(
      { prospectId: 42, systemMessageId: '11111111-1111-1111-1111-111111111111' },
      { secret: SECRET, now: new Date('2026-08-30T12:00:00Z') },
    );
    expect(token).toBeTruthy();
    const verified = verifyPresenceVisitToken(token!, {
      secret: SECRET,
      now: new Date('2026-08-30T12:00:00Z'),
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.payload.prospectId).toBe(42);
    expect(verified.payload.systemMessageId).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('rejects expired tokens', () => {
    const token = signPresenceVisitToken(
      { prospectId: 1, systemMessageId: '11111111-1111-1111-1111-111111111111' },
      {
        secret: SECRET,
        now: new Date('2026-01-01T00:00:00Z'),
        ttlMs: 1000,
      },
    );
    const verified = verifyPresenceVisitToken(token!, {
      secret: SECRET,
      now: new Date('2026-01-01T00:00:02Z'),
    });
    expect(verified.ok).toBe(false);
  });

  it('appends vt to absolute URLs', () => {
    const href = appendPresenceVisitToken(
      'https://justinfassio.com/old-guys-rule-wholesale/american-revival',
      { prospectId: 7, systemMessageId: '11111111-1111-1111-1111-111111111111' },
      { secret: SECRET },
    );
    expect(href).toContain('vt=');
    expect(
      href.startsWith('https://justinfassio.com/old-guys-rule-wholesale/american-revival'),
    ).toBe(true);
  });

  it('isPresenceActive respects the active window', () => {
    const asOf = new Date('2026-08-30T12:05:00Z');
    expect(isPresenceActive('2026-08-30T12:03:00Z', asOf, 5 * 60 * 1000)).toBe(true);
    expect(isPresenceActive('2026-08-30T11:50:00Z', asOf, 5 * 60 * 1000)).toBe(false);
  });
});
