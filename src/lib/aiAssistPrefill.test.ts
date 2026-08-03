import { describe, expect, it } from 'vitest';
import { buildAssistDraft, formatAssistChipLabel } from '@/lib/aiAssistPrefill';

describe('formatAssistChipLabel', () => {
  it('formats id only', () => {
    expect(formatAssistChipLabel({ prospectId: 12 })).toBe('#12');
  });

  it('includes name and outcome when present', () => {
    expect(
      formatAssistChipLabel({
        prospectId: 12,
        prospectName: 'Coastal Golf',
        outcome: 'Sample Package Requested',
      }),
    ).toBe('#12 · Coastal Golf · Sample Package Requested');
  });
});

describe('buildAssistDraft', () => {
  it('builds summary draft for prospect without outcome', () => {
    expect(buildAssistDraft({ prospectId: 12, prospectName: 'Coastal Golf' })).toBe(
      'Summarize prospect 12 (Coastal Golf) call history and suggest next steps.',
    );
  });

  it('builds summary draft without name', () => {
    expect(buildAssistDraft({ prospectId: 7 })).toBe(
      'Summarize prospect 7 call history and suggest next steps.',
    );
  });

  it('builds follow-up draft when outcome is present', () => {
    expect(
      buildAssistDraft({
        prospectId: 12,
        prospectName: 'Coastal Golf',
        outcome: 'Sample Package Requested',
      }),
    ).toBe(
      'I just logged outcome "Sample Package Requested" for prospect 12 (Coastal Golf). Draft a short follow-up email.',
    );
  });
});
