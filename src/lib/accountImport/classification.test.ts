import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_IMPORT_SOURCE_OPTIONS,
  ACCOUNT_IMPORT_SOURCE_TYPES,
  HISTORICAL_OGR_IMPORT_DEFAULTS,
  IMPORT_SETTABLE_MARKERS,
  LINE_ACCOUNT_MARKERS,
  ZOOMINFO_IMPORT_LINE_CODE,
  ZOOMINFO_LEAD_IMPORT_DEFAULTS,
  activityStatusFromEvidence,
  assertZoominfoImportClassification,
  defaultsForImportSource,
  hasMarker,
  isAccountImportSourceEnabled,
  markersAfterMarkUnresponsive,
  markersAfterOutreachOptIn,
  markersAfterReopenCandidate,
  withMarkers,
  withoutMarker,
} from '@/lib/accountImport/classification';
import { assertImportSourceLinePairing } from '@/lib/accountImport/lineGate';
import { zoominfoImportSeedNote } from '@/lib/accountImport/notes';
import { markersFromUnknown } from '@/lib/accountImport/preview';
import { isVerifiedIdentityStatus } from '@/lib/retailerFieldChanges';

describe('line account markers', () => {
  it('allows the F1–F4 marker set and keeps import from stamping opt-in or lookalike', () => {
    expect([...LINE_ACCOUNT_MARKERS]).toEqual([
      'historical_purchaser',
      'reactivation_candidate',
      'reactivation_unresponsive',
      'outreach_eligible',
      'lookalike_prospect',
    ]);
    expect([...IMPORT_SETTABLE_MARKERS]).toEqual([
      'historical_purchaser',
      'reactivation_candidate',
      'reactivation_unresponsive',
    ]);
    expect(IMPORT_SETTABLE_MARKERS).not.toContain('outreach_eligible');
    expect(IMPORT_SETTABLE_MARKERS).not.toContain('lookalike_prospect');
  });

  it('hasMarker is false for missing or empty lists', () => {
    expect(hasMarker(null, 'historical_purchaser')).toBe(false);
    expect(hasMarker([], 'historical_purchaser')).toBe(false);
    expect(hasMarker(['historical_purchaser'], 'historical_purchaser')).toBe(true);
  });

  it('withMarkers drops unknowns and duplicates while preserving order', () => {
    expect(withMarkers(['historical_purchaser', 'nope'], ['historical_purchaser'])).toEqual([
      'historical_purchaser',
    ]);
    expect(
      withMarkers([], ['reactivation_candidate', 'historical_purchaser', 'reactivation_candidate']),
    ).toEqual(['reactivation_candidate', 'historical_purchaser']);
  });

  it('withoutMarker removes outreach_eligible and drops unknowns', () => {
    expect(
      withoutMarker(
        ['historical_purchaser', 'reactivation_candidate', 'outreach_eligible'],
        'outreach_eligible',
      ),
    ).toEqual(['historical_purchaser', 'reactivation_candidate']);
    expect(withoutMarker(['nope', 'historical_purchaser'], 'historical_purchaser')).toEqual([]);
  });

  it('markersAfterOutreachOptIn toggles only the owner flag', () => {
    expect(
      markersAfterOutreachOptIn(['historical_purchaser', 'reactivation_candidate'], true),
    ).toEqual(['historical_purchaser', 'reactivation_candidate', 'outreach_eligible']);
    expect(
      markersAfterOutreachOptIn(
        ['historical_purchaser', 'reactivation_candidate', 'outreach_eligible'],
        false,
      ),
    ).toEqual(['historical_purchaser', 'reactivation_candidate']);
  });

  it('markersAfterMarkUnresponsive keeps historical_purchaser and drops candidate plus opt-in', () => {
    expect(
      markersAfterMarkUnresponsive([
        'historical_purchaser',
        'reactivation_candidate',
        'outreach_eligible',
      ]),
    ).toEqual(['historical_purchaser', 'reactivation_unresponsive']);
  });

  it('markersAfterReopenCandidate restores candidate without outreach_eligible', () => {
    expect(
      markersAfterReopenCandidate(['historical_purchaser', 'reactivation_unresponsive']),
    ).toEqual(['historical_purchaser', 'reactivation_candidate']);
    expect(
      markersAfterReopenCandidate([
        'historical_purchaser',
        'reactivation_unresponsive',
        'outreach_eligible',
      ]),
    ).toEqual(['historical_purchaser', 'reactivation_candidate']);
  });

  it('import marker parse never stamps outreach_eligible', () => {
    expect(
      markersFromUnknown(['historical_purchaser', 'reactivation_candidate', 'outreach_eligible']),
    ).toEqual(['historical_purchaser', 'reactivation_candidate']);
    expect(markersFromUnknown(['outreach_eligible'])).toEqual([]);
    expect(markersFromUnknown(['lookalike_prospect'])).toEqual([]);
  });
});

describe('historical OGR import defaults', () => {
  it('maps attested purchasers without fabricating orders or dates', () => {
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.relationshipStatus).toBe('opened');
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.accountStatus).toBe('active_account');
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.convertedAt).toBeNull();
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.initialOrderDate).toBeNull();
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.createOrders).toBe(false);
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.existingOgr).toBe('yes');
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.markers).toEqual([
      'historical_purchaser',
      'reactivation_candidate',
    ]);
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.importProtected).toBe(true);
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.qualificationStatus).toBe('reactivation');
    expect(HISTORICAL_OGR_IMPORT_DEFAULTS.productivityClass).toBe('unclassified');
  });

  it('enables ZoomInfo and keeps Research and Other disabled', () => {
    expect(ACCOUNT_IMPORT_SOURCE_TYPES).toContain('historical_customer');
    expect(ACCOUNT_IMPORT_SOURCE_TYPES).toContain('zoominfo_lead');
    expect(
      ACCOUNT_IMPORT_SOURCE_OPTIONS.find((opt) => opt.value === 'zoominfo_lead')?.enabled,
    ).toBe(true);
    expect(
      ACCOUNT_IMPORT_SOURCE_OPTIONS.find((opt) => opt.value === 'research_prospect')?.enabled,
    ).toBe(false);
    expect(ACCOUNT_IMPORT_SOURCE_OPTIONS.find((opt) => opt.value === 'other')?.enabled).toBe(false);
  });
});

describe('ZoomInfo lead import defaults', () => {
  it('maps never-ordered Eagle Peak prospects without OGR or reactivation stamps', () => {
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.relationshipStatus).toBe('prospect');
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.accountStatus).toBe('prospect');
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.markers).toEqual([]);
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.existingOgr).toBe('Unknown');
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.qualificationStatus).toBeNull();
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.createOrders).toBe(false);
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.convertedAt).toBeNull();
    expect(ZOOMINFO_LEAD_IMPORT_DEFAULTS.initialOrderDate).toBeNull();
    expect(defaultsForImportSource('zoominfo_lead')).toBe(ZOOMINFO_LEAD_IMPORT_DEFAULTS);
    expect(defaultsForImportSource('historical_customer')).toBe(HISTORICAL_OGR_IMPORT_DEFAULTS);
    expect(defaultsForImportSource('faire_customer')).toBe(HISTORICAL_OGR_IMPORT_DEFAULTS);
  });

  it('is enabled only for Eagle Peak', () => {
    expect(ZOOMINFO_IMPORT_LINE_CODE).toBe('eagle-peak');
    expect(isAccountImportSourceEnabled('zoominfo_lead', 'eagle-peak')).toBe(true);
    expect(isAccountImportSourceEnabled('zoominfo_lead', 'ogr')).toBe(false);
    expect(isAccountImportSourceEnabled('zoominfo_lead', 'big-fish')).toBe(false);
    expect(isAccountImportSourceEnabled('historical_customer', 'ogr')).toBe(true);
    expect(isAccountImportSourceEnabled('research_prospect', 'eagle-peak')).toBe(false);
    expect(assertImportSourceLinePairing('zoominfo_lead', { code: 'eagle-peak' }).ok).toBe(true);
    expect(assertImportSourceLinePairing('zoominfo_lead', { code: 'ogr' }).ok).toBe(false);
    expect(assertImportSourceLinePairing('historical_customer', { code: 'ogr' }).ok).toBe(true);
  });

  it('rejects opened, historical markers, outreach opt-in, and existing_ogr yes', () => {
    expect(
      assertZoominfoImportClassification({
        relationshipStatus: 'prospect',
        markers: [],
        existingOgr: 'Unknown',
      }).ok,
    ).toBe(true);
    expect(
      assertZoominfoImportClassification({
        relationshipStatus: 'opened',
        markers: [],
        existingOgr: 'Unknown',
      }).ok,
    ).toBe(false);
    expect(
      assertZoominfoImportClassification({
        relationshipStatus: 'prospect',
        markers: ['historical_purchaser'],
        existingOgr: 'Unknown',
      }).ok,
    ).toBe(false);
    expect(
      assertZoominfoImportClassification({
        relationshipStatus: 'prospect',
        markers: ['lookalike_prospect'],
        existingOgr: 'Unknown',
      }).ok,
    ).toBe(false);
    expect(
      assertZoominfoImportClassification({
        relationshipStatus: 'prospect',
        markers: ['outreach_eligible'],
        existingOgr: 'Unknown',
      }).ok,
    ).toBe(false);
    expect(
      assertZoominfoImportClassification({
        relationshipStatus: 'prospect',
        markers: [],
        existingOgr: 'yes',
      }).ok,
    ).toBe(false);
  });

  it('does not describe ZoomInfo leads as OGR purchasers', () => {
    const note = zoominfoImportSeedNote({ filename: 'leads.xlsx' });
    expect(note).toMatch(/ZoomInfo lead/);
    expect(note).toMatch(/never ordered/i);
    expect(note).not.toMatch(/verified past OGR customer/);
    expect(note).not.toMatch(/reactivation candidate/);
  });
});

describe('activityStatusFromEvidence', () => {
  it('prefers a qualifying order in the last 365 days', () => {
    expect(
      activityStatusFromEvidence({
        hasQualifyingOrderLast365Days: true,
        hasAnyNonDraftOrder: true,
        historicalPurchaser: true,
      }),
    ).toBe('active');
  });

  it('treats older orders as dormant', () => {
    expect(
      activityStatusFromEvidence({
        hasQualifyingOrderLast365Days: false,
        hasAnyNonDraftOrder: true,
        historicalPurchaser: false,
      }),
    ).toBe('dormant');
  });

  it('treats historical_purchaser with no ledger as dormant, not never_ordered', () => {
    expect(
      activityStatusFromEvidence({
        hasQualifyingOrderLast365Days: false,
        hasAnyNonDraftOrder: false,
        historicalPurchaser: true,
      }),
    ).toBe('dormant');
  });

  it('returns never_ordered only without orders and without historical_purchaser', () => {
    expect(
      activityStatusFromEvidence({
        hasQualifyingOrderLast365Days: false,
        hasAnyNonDraftOrder: false,
        historicalPurchaser: false,
      }),
    ).toBe('never_ordered');
  });
});

describe('import identity protection', () => {
  it('treats buyerVerified and Verified status as protected', () => {
    expect(isVerifiedIdentityStatus({ buyerVerified: true, verificationStatus: null })).toBe(true);
    expect(isVerifiedIdentityStatus({ buyerVerified: false, verificationStatus: 'Verified' })).toBe(
      true,
    );
    expect(
      isVerifiedIdentityStatus({ buyerVerified: false, verificationStatus: 'unverified' }),
    ).toBe(false);
  });

  it('treats importProtected as protected even when verification_status is import_verified', () => {
    expect(
      isVerifiedIdentityStatus({
        buyerVerified: false,
        verificationStatus: 'import_verified',
        importProtected: true,
      }),
    ).toBe(true);
  });

  it('does not treat import_verified status alone as /^verified$/i', () => {
    expect(
      isVerifiedIdentityStatus({
        buyerVerified: false,
        verificationStatus: 'import_verified',
        importProtected: false,
      }),
    ).toBe(false);
  });
});
