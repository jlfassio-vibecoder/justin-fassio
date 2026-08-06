import { describe, expect, it } from 'vitest';
import { CHAT_WITTY_LINES, pickWittyLine } from '@/lib/chatWittyLines';

describe('pickWittyLine', () => {
  it('has a non-empty bank', () => {
    expect(CHAT_WITTY_LINES.length).toBeGreaterThan(3);
  });

  it('is stable for the same seed', () => {
    const a = pickWittyLine('thread-1');
    const b = pickWittyLine('thread-1');
    expect(a).toBe(b);
    expect(CHAT_WITTY_LINES).toContain(a);
  });

  it('can rotate across seeds', () => {
    const lines = new Set(Array.from({ length: 20 }, (_, i) => pickWittyLine(`seed-${i}`)));
    expect(lines.size).toBeGreaterThan(1);
  });
});
