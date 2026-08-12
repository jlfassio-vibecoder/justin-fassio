import { describe, expect, it } from 'vitest';
import { pickLastTouchMessage, resolveAttributionChoice } from '@/lib/outreachAttribution';

describe('resolveAttributionChoice', () => {
  it('staff-confirmed when a message is selected', () => {
    expect(
      resolveAttributionChoice({
        staffSelectedMessageId: 'msg-1',
        lastTouchId: 'msg-2',
      }),
    ).toEqual({ model: 'staff_confirmed', attributedSystemMessageId: 'msg-1' });
  });

  it('last_touch_inferred when staff selects None but a candidate exists', () => {
    expect(
      resolveAttributionChoice({
        staffSelectedMessageId: null,
        lastTouchId: 'msg-2',
      }),
    ).toEqual({ model: 'last_touch_inferred', attributedSystemMessageId: 'msg-2' });
  });

  it('none when no messages', () => {
    expect(
      resolveAttributionChoice({
        staffSelectedMessageId: null,
        lastTouchId: null,
      }),
    ).toEqual({ model: 'none', attributedSystemMessageId: null });
  });
});

describe('pickLastTouchMessage', () => {
  it('picks most recent send before convertedAt within window', () => {
    const picked = pickLastTouchMessage({
      messages: [
        { id: 'a', sent_at: '2026-07-01T00:00:00Z' },
        { id: 'b', sent_at: '2026-08-01T00:00:00Z' },
        { id: 'c', sent_at: '2026-08-20T00:00:00Z' },
      ],
      convertedAt: '2026-08-10T12:00:00Z',
      windowStartIso: '2026-06-01T00:00:00Z',
    });
    expect(picked?.id).toBe('b');
  });

  it('ignores sends after convert', () => {
    const picked = pickLastTouchMessage({
      messages: [{ id: 'a', sent_at: '2026-08-20T00:00:00Z' }],
      convertedAt: '2026-08-10T12:00:00Z',
      windowStartIso: '2026-06-01T00:00:00Z',
    });
    expect(picked).toBeNull();
  });
});
