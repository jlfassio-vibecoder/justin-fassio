import { describe, expect, it } from 'vitest';
import { APPAREL_SEASON_LABELS, APPAREL_SEASONS, apparelSeasonLabel } from '@/lib/apparelSeasons';
import { EMPTY_PROSPECT_PLANNING, EMPTY_PROSPECT_TAXONOMY, mapProspectRow } from '@/lib/prospects';
import type { ProspectRow } from '@/types/database';

describe('apparelSeasons', () => {
  it('covers every season with a display label', () => {
    expect(APPAREL_SEASONS).toHaveLength(5);
    for (const season of APPAREL_SEASONS) {
      expect(APPAREL_SEASON_LABELS[season]).toBeTruthy();
      expect(apparelSeasonLabel(season)).toBe(APPAREL_SEASON_LABELS[season]);
    }
  });
});

describe('mapProspectRow', () => {
  it('maps lifecycle columns onto the app Prospect shape', () => {
    const row: ProspectRow = {
      id: 1,
      name: 'Kelowna Golf & Country Club',
      category: 'golf_retail',
      region: 'Okanagan',
      city: 'Kelowna',
      address: '1297 Glenmore Dr',
      phone: '250-762-2531',
      fit: 'Strong fit',
      account_status: 'active_account',
      converted_at: '2026-08-01T12:00:00Z',
      initial_order_date: '2026-08-01T12:00:00Z',
      notes: null,
      territory_id: '00000000-0000-4000-8000-0000000000bc',
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
      secondary_channels: [],
      retail_subchannels: [],
      venue_contexts: [],
      lifestyle_themes: [],
      retail_capabilities: [],

      updated_at: '2026-08-01T12:00:00Z',
    };

    expect(mapProspectRow(row)).toEqual({
      id: 1,
      name: 'Kelowna Golf & Country Club',
      category: 'golf_retail',
      region: 'Okanagan',
      city: 'Kelowna',
      address: '1297 Glenmore Dr',
      phone: '250-762-2531',
      fit: 'Strong fit',
      accountStatus: 'active_account',
      convertedAt: '2026-08-01T12:00:00Z',
      initialOrderDate: '2026-08-01T12:00:00Z',
      notes: null,
      territoryId: '00000000-0000-4000-8000-0000000000bc',
      territoryCode: null,
      territoryName: null,
      ...EMPTY_PROSPECT_PLANNING,
      ...EMPTY_PROSPECT_TAXONOMY,
    });
  });
});
