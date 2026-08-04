import { describe, expect, it } from 'vitest';
import { mapProspectRow } from '@/lib/prospects';
import type { ProspectRow } from '@/types/database';

describe('mapProspectRow notes', () => {
  it('maps notes onto the app Prospect shape', () => {
    const row: ProspectRow = {
      id: 1,
      name: 'Kelowna Golf & Country Club',
      category: 'Golf',
      region: 'Okanagan',
      city: 'Kelowna',
      address: '1297 Glenmore Dr',
      phone: '250-762-2531',
      fit: 'Strong fit',
      account_status: 'prospect',
      converted_at: null,
      initial_order_date: null,
      notes: 'Ask for Sarah Jenkins [Buyer]',
      external_id: null,
      subterritory: null,
      primary_district: null,
      retail_category: null,
      website: null,
      fit_score: null,
      ideal_opening_units: null,
      priority: null,
      provisional_grade: null,
      verification_status: null,
      buyer_verified: false,
      apparel_capability: null,
      existing_ogr: null,
      qualification_status: null,
      next_action: null,
      source_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-08-01T12:00:00Z',
    };

    expect(mapProspectRow(row).notes).toBe('Ask for Sarah Jenkins [Buyer]');
  });

  it('preserves null notes', () => {
    const row: ProspectRow = {
      id: 2,
      name: 'Sidney Marina Store',
      category: 'Marina',
      region: 'Vancouver Island',
      city: 'Sidney',
      address: '1 Harbour Rd',
      phone: '250-555-0100',
      fit: 'Dockside',
      account_status: 'prospect',
      converted_at: null,
      initial_order_date: null,
      notes: null,
      external_id: null,
      subterritory: null,
      primary_district: null,
      retail_category: null,
      website: null,
      fit_score: null,
      ideal_opening_units: null,
      priority: null,
      provisional_grade: null,
      verification_status: null,
      buyer_verified: false,
      apparel_capability: null,
      existing_ogr: null,
      qualification_status: null,
      next_action: null,
      source_note: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-08-01T12:00:00Z',
    };

    expect(mapProspectRow(row).notes).toBeNull();
  });
});
