import { describe, expect, it } from 'vitest';
import {
  buildAssistDraft,
  buildObjectionDraft,
  formatAssistChipLabel,
} from '@/lib/aiAssistPrefill';
import { OBJECTION_TAGS, objectionCatalogBlurb } from '@/lib/objectionCatalog';

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

  it('formats tags-only chip', () => {
    expect(formatAssistChipLabel({ objectionTags: ['Wants higher margin'] })).toBe(
      'Wants higher margin',
    );
  });

  it('appends tags after prospect', () => {
    expect(
      formatAssistChipLabel({
        prospectId: 12,
        prospectName: 'Coastal Golf',
        objectionTags: ['Wants higher margin', 'Pre-booked budget'],
      }),
    ).toBe('#12 · Coastal Golf · Wants higher margin, Pre-booked budget');
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

describe('buildObjectionDraft', () => {
  it('builds catalog-only draft', () => {
    expect(buildObjectionDraft({ objectionTags: ['Wants higher margin'] })).toBe(
      'Help me handle buyer feedback "Wants higher margin". Give 2-3 short talk tracks for a BC wholesale apparel rep. Do not invent store facts.',
    );
  });

  it('includes prospect when present', () => {
    expect(
      buildObjectionDraft({
        prospectId: 12,
        prospectName: 'Coastal Golf',
        objectionTags: ['Pre-booked budget'],
      }),
    ).toBe(
      'Help me handle buyer feedback "Pre-booked budget" for prospect 12 (Coastal Golf). Give 2-3 short talk tracks for a BC wholesale apparel rep. Ground in recent call tags if available via tools; do not invent store facts.',
    );
  });
});

describe('objectionCatalog', () => {
  it('lists the four Log Call feedback tags', () => {
    expect(OBJECTION_TAGS).toEqual([
      'Loves display rack',
      'Seasonal rush fit',
      'Pre-booked budget',
      'Wants higher margin',
    ]);
  });

  it('blurbs catalog for the system prompt', () => {
    expect(objectionCatalogBlurb()).toContain('"Pre-booked budget"');
    expect(objectionCatalogBlurb()).toContain('"Wants higher margin"');
  });
});
