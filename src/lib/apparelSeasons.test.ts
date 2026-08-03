import { describe, expect, it } from 'vitest';
import { APPAREL_SEASON_LABELS, APPAREL_SEASONS, apparelSeasonLabel } from '@/lib/apparelSeasons';
import { mapProspectRow } from '@/lib/prospects';
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
      category: 'Golf',
      region: 'Okanagan',
      city: 'Kelowna',
      address: '1297 Glenmore Dr',
      phone: '250-762-2531',
      fit: 'Strong fit',
      account_status: 'active_account',
      converted_at: '2026-08-01T12:00:00Z',
      initial_order_date: '2026-08-01T12:00:00Z',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-08-01T12:00:00Z',
    };

    expect(mapProspectRow(row)).toEqual({
      id: 1,
      name: 'Kelowna Golf & Country Club',
      category: 'Golf',
      region: 'Okanagan',
      city: 'Kelowna',
      address: '1297 Glenmore Dr',
      phone: '250-762-2531',
      fit: 'Strong fit',
      accountStatus: 'active_account',
      convertedAt: '2026-08-01T12:00:00Z',
      initialOrderDate: '2026-08-01T12:00:00Z',
    });
  });
});
