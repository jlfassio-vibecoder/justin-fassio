import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_IMPORT_SOURCE_TYPES,
  HISTORICAL_OGR_IMPORT_DEFAULTS,
  IMPORT_SETTABLE_MARKERS,
  LINE_ACCOUNT_MARKERS,
  activityStatusFromEvidence,
  hasMarker,
  markersAfterMarkUnresponsive,
  markersAfterOutreachOptIn,
  markersAfterReopenCandidate,
  withMarkers,
  withoutMarker,
} from '@/lib/accountImport/classification';
import { markersFromUnknown } from '@/lib/accountImport/preview';
import { isVerifiedIdentityStatus } from '@/lib/retailerFieldChanges';

describe('line account markers', () => {
  it('allows the F1 marker set including outreach_eligible', () => {
    expect([...LINE_ACCOUNT_MARKERS]).toEqual([
      'historical_purchaser',
      'reactivation_candidate',
      'reactivation_unresponsive',
      'outreach_eligible',
    ]);
    expect([...IMPORT_SETTABLE_MARKERS]).toEqual([
      'historical_purchaser',
      'reactivation_candidate',
      'reactivation_unresponsive',
    ]);
    expect(IMPORT_SETTABLE_MARKERS).not.toContain('outreach_eligible');
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

  it('lists source types without requiring ZoomInfo in this phase', () => {
    expect(ACCOUNT_IMPORT_SOURCE_TYPES).toContain('historical_customer');
    expect(ACCOUNT_IMPORT_SOURCE_TYPES).toContain('zoominfo_lead');
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
