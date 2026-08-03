import { describe, expect, it } from 'vitest';
import { formatProspectFit, nextProspectId } from '@/lib/createEnrichedProspect';

describe('formatProspectFit', () => {
  it('encodes score and notes for the fit column', () => {
    expect(
      formatProspectFit(8, 'Coastal golf shop with strong summer traffic. Good OGR fit.'),
    ).toBe('8/10 — Coastal golf shop with strong summer traffic. Good OGR fit.');
  });

  it('clamps score to 1–10 and collapses whitespace', () => {
    expect(formatProspectFit(0, '  soft   notes  ')).toBe('1/10 — soft notes');
    expect(formatProspectFit(15, 'too high')).toBe('10/10 — too high');
  });
});

describe('nextProspectId', () => {
  it('starts at 1 when empty', () => {
    expect(nextProspectId(null)).toBe(1);
    expect(nextProspectId(undefined)).toBe(1);
  });

  it('increments max id', () => {
    expect(nextProspectId(249)).toBe(250);
    expect(nextProspectId(12.9)).toBe(13);
  });
});
