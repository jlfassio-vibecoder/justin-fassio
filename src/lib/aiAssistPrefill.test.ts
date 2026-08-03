import { describe, expect, it } from 'vitest';
import {
  buildAssistDraft,
  buildCallDraft,
  buildObjectionDraft,
  buildSuggestDraft,
  formatAssistChipLabel,
} from '@/lib/aiAssistPrefill';
import { CALL_OUTCOMES } from '@/lib/callOutcomes';
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

  it('delegates outcome drafts to buildCallDraft email', () => {
    const chip = {
      prospectId: 12,
      prospectName: 'Coastal Golf',
      outcome: 'Sample Package Requested',
    };
    expect(buildAssistDraft(chip)).toBe(buildCallDraft(chip, 'email'));
  });
});

describe('buildCallDraft', () => {
  it('builds email draft matched to outcome', () => {
    expect(
      buildCallDraft(
        {
          prospectId: 12,
          prospectName: 'Coastal Golf',
          outcome: 'Sample Package Requested',
        },
        'email',
      ),
    ).toBe(
      'I just logged outcome "Sample Package Requested" for prospect 12 (Coastal Golf). Draft a short follow-up email (subject + body) for a BC wholesale apparel rep (Old Guys Rule). Match tone to the outcome. Use CRM tools for store/call facts; do not invent store details.',
    );
  });

  it('builds script draft matched to outcome', () => {
    expect(
      buildCallDraft(
        {
          prospectId: 12,
          prospectName: 'Coastal Golf',
          outcome: 'Left Message / Gatekeeper',
        },
        'script',
      ),
    ).toBe(
      'I just logged outcome "Left Message / Gatekeeper" for prospect 12 (Coastal Golf). Draft a 30–60 second phone or in-person talk track for a BC wholesale apparel rep (Old Guys Rule). Match tone to the outcome. Use CRM tools for store/call facts; do not invent store details.',
    );
  });

  it('includes objection tags when present', () => {
    const draft = buildCallDraft(
      {
        prospectId: 3,
        prospectName: 'Marina Co',
        outcome: 'Follow-up Scheduled',
        objectionTags: ['Wants higher margin'],
      },
      'email',
    );
    expect(draft).toContain('Account for buyer feedback: "Wants higher margin".');
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

describe('buildSuggestDraft', () => {
  it('asks for summary plus numbered follow-ups for a prospect', () => {
    expect(buildSuggestDraft({ prospectId: 12, prospectName: 'Coastal Golf' })).toBe(
      'For prospect 12 (Coastal Golf), use CRM tools to load the store and recent calls. Write a short call-history summary, then give 3–5 concrete next follow-up actions as a numbered list for a BC wholesale apparel rep (Old Guys Rule). Do not invent store facts.',
    );
  });

  it('falls back when prospect id is missing', () => {
    expect(buildSuggestDraft({})).toContain('3–5 concrete next follow-up actions');
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

describe('callOutcomes', () => {
  it('lists the five Log Call outcomes', () => {
    expect(CALL_OUTCOMES).toEqual([
      'Closed PO / Written Order',
      'Sample Package Requested',
      'Follow-up Scheduled',
      'Left Message / Gatekeeper',
      'Not Interested / Bad Fit',
    ]);
  });
});
