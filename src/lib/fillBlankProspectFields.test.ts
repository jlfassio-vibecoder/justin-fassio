import { describe, expect, it } from 'vitest';
import {
  buildFillBlankProposal,
  isBlankProspectValue,
  mergeFillBlankFields,
  type FillBlankEvidence,
  type FillBlankProspectFields,
} from '@/lib/fillBlankProspectFields';
import { EMPTY_PROSPECT_PLANNING, type Prospect } from '@/lib/prospects';

const base: Prospect = {
  id: 10,
  name: 'Known Store',
  category: 'Golf',
  region: 'Okanagan',
  city: 'Kelowna',
  address: '',
  phone: '',
  fit: '7/10 — Existing fit.',
  accountStatus: 'prospect',
  convertedAt: null,
  initialOrderDate: null,
  notes: 'Keep notes',
  ...EMPTY_PROSPECT_PLANNING,
  apparelCapability: 'Unknown',
  buyerVerified: false,
  existingOgr: 'Unknown',
  externalId: 'BC-010',
  retailCategory: 'Golf pro shop',
  subterritory: 'Central Okanagan',
  primaryDistrict: 'Okanagan',
  fitScore: 7,
};

const inferred: FillBlankProspectFields = {
  name: 'Hijacked Name',
  category: 'Hardware',
  region: 'Shuswap',
  city: 'Salmon Arm',
  address: '9 Lake Ave',
  phone: '250-555-0100',
  fitScore: 9,
  fit: '9/10 — Should not replace fit.',
  website: 'https://example.com',
  subterritory: 'Central Okanagan',
  primaryDistrict: 'Okanagan',
  retailCategory: 'Golf pro shop',
  apparelCapability: 'Confirmed',
  verificationStatus: 'Website confirmed',
  idealOpeningUnits: 60,
  priority: 'Tier 1',
  provisionalGrade: 'A (provisional)',
  nextAction: 'Call buyer',
};

const evidence: FillBlankEvidence = {
  officialWebsite: 'https://example.com',
  address: '9 Lake Ave',
  phone: '250-555-0100',
  retailCategory: 'Golf pro shop',
  categoryRationale: 'Pro shop merch',
  apparelCapability: 'Confirmed',
  lifestyleThemes: ['golf'],
  customerAlignmentNotes: 'Gift traffic',
  strategicReference: false,
  strategicReferenceReason: null,
  operatingConfirmed: true,
  directoryOnly: false,
  sourceUrls: ['https://example.com'],
};

describe('isBlankProspectValue', () => {
  it('treats empty strings, Unknown apparel, and Needs mapping as blank', () => {
    expect(isBlankProspectValue('address', '')).toBe(true);
    expect(isBlankProspectValue('address', '  ')).toBe(true);
    expect(isBlankProspectValue('address', '1 Main')).toBe(false);
    expect(isBlankProspectValue('apparelCapability', 'Unknown')).toBe(true);
    expect(isBlankProspectValue('apparelCapability', 'Confirmed')).toBe(false);
    expect(isBlankProspectValue('fitScore', null)).toBe(true);
    expect(isBlankProspectValue('fitScore', 8)).toBe(false);
    expect(isBlankProspectValue('subterritory', 'Needs mapping')).toBe(true);
    expect(isBlankProspectValue('primaryDistrict', 'Needs mapping')).toBe(true);
  });
});

describe('mergeFillBlankFields', () => {
  it('fills only blank allowlisted fields and never touches excluded columns', () => {
    const { proposed, dbPatch, filledKeys } = mergeFillBlankFields(base, inferred);

    expect(proposed.name).toBe('Known Store');
    expect(proposed.category).toBe('Golf');
    expect(proposed.region).toBe('Okanagan');
    expect(proposed.city).toBe('Kelowna');
    expect(proposed.fit).toBe('7/10 — Existing fit.');
    expect(proposed.address).toBe('9 Lake Ave');
    expect(proposed.phone).toBe('250-555-0100');
    expect(proposed.website).toBe('https://example.com');
    expect(proposed.apparelCapability).toBe('Confirmed');
    expect(proposed.verificationStatus).toBe('Website confirmed');
    expect(proposed.fitScore).toBe(7);

    expect(proposed.externalId).toBe('BC-010');
    expect(proposed.buyerVerified).toBe(false);
    expect(proposed.existingOgr).toBe('Unknown');
    expect(proposed.notes).toBe('Keep notes');

    expect(dbPatch).not.toHaveProperty('external_id');
    expect(dbPatch).not.toHaveProperty('buyer_verified');
    expect(dbPatch).not.toHaveProperty('existing_ogr');
    expect(dbPatch).toMatchObject({
      address: '9 Lake Ave',
      phone: '250-555-0100',
      website: 'https://example.com',
      apparel_capability: 'Confirmed',
    });
    expect(filledKeys).toContain('address');
    expect(filledKeys).not.toContain('name');
    expect(filledKeys).not.toContain('fit');
    expect(filledKeys).not.toContain('fitScore');
  });

  it('fills calculated score/priority/units when blank and never writes excluded columns', () => {
    const withBlanks: Prospect = {
      ...base,
      fit: '',
      fitScore: null,
      priority: null,
      provisionalGrade: null,
      idealOpeningUnits: null,
      nextAction: null,
      apparelCapability: 'Unknown',
    };
    const { proposed, dbPatch, filledKeys } = mergeFillBlankFields(withBlanks, inferred);

    expect(proposed.fitScore).toBe(9);
    expect(proposed.priority).toBe('Tier 1');
    expect(proposed.provisionalGrade).toBe('A (provisional)');
    expect(proposed.idealOpeningUnits).toBe(60);
    expect(proposed.nextAction).toBe('Call buyer');
    expect(proposed.fit).toBe('9/10 — Should not replace fit.');
    expect(dbPatch).toMatchObject({
      fit_score: 9,
      priority: 'Tier 1',
      provisional_grade: 'A (provisional)',
      ideal_opening_units: 60,
      next_action: 'Call buyer',
    });
    expect(filledKeys).toEqual(
      expect.arrayContaining([
        'fitScore',
        'priority',
        'provisionalGrade',
        'idealOpeningUnits',
        'nextAction',
        'fit',
      ]),
    );
    expect(dbPatch).not.toHaveProperty('buyer_verified');
    expect(dbPatch).not.toHaveProperty('existing_ogr');
    expect(dbPatch).not.toHaveProperty('external_id');
  });
});

describe('buildFillBlankProposal', () => {
  it('calculates seed score and priority from category + territory', () => {
    const blankPlanning: Prospect = {
      ...base,
      fit: '',
      fitScore: null,
      priority: null,
      provisionalGrade: null,
      idealOpeningUnits: null,
      nextAction: null,
      website: null,
      apparelCapability: 'Unknown',
      verificationStatus: null,
    };
    const fields = buildFillBlankProposal(blankPlanning, evidence);
    expect(fields.fitScore).toBe(10);
    expect(fields.idealOpeningUnits).toBe(60);
    expect(fields.priority).toBeTruthy();
    expect(fields.provisionalGrade).toBeTruthy();
    expect(fields.address).toBe('9 Lake Ave');
    expect(fields.phone).toBe('250-555-0100');
    expect(fields.website).toBe('https://example.com');
    expect(fields.apparelCapability).toBe('Confirmed');
    expect(fields.fit).toMatch(/^10\/10/);
  });

  it('maps territory from city when Needs mapping', () => {
    const unmapped: Prospect = {
      ...base,
      city: 'Whistler',
      subterritory: 'Needs mapping',
      primaryDistrict: 'Needs mapping',
      fitScore: null,
      priority: null,
      idealOpeningUnits: null,
      provisionalGrade: null,
    };
    const fields = buildFillBlankProposal(unmapped, {
      ...evidence,
      officialWebsite: null,
      address: null,
      phone: null,
      apparelCapability: 'Unknown',
      operatingConfirmed: false,
      directoryOnly: true,
    });
    expect(fields.subterritory).toBe('Sea-to-Sky');
    expect(fields.primaryDistrict).toBe('Lower Mainland');
  });

  it('does not label Website confirmed without an official site', () => {
    const blank: Prospect = {
      ...base,
      website: null,
      verificationStatus: null,
      fitScore: null,
      priority: null,
      idealOpeningUnits: null,
      provisionalGrade: null,
    };
    const fields = buildFillBlankProposal(blank, {
      ...evidence,
      officialWebsite: null,
      operatingConfirmed: true,
      directoryOnly: true,
    });
    expect(fields.verificationStatus).toBe('Directory lead');
  });
});
