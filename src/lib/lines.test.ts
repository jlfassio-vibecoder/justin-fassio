import { describe, expect, it } from 'vitest';
import { mapLineRow } from '@/lib/lines';
import type { Line } from '@/types/database';

describe('mapLineRow', () => {
  it('maps marketing fields onto the app shape', () => {
    const row: Line = {
      id: 'line-1',
      code: 'ogr',
      name: 'Old Guys Rule',
      active: true,
      tagline: 'Now Repping',
      description: 'Apparel & lifestyle goods.',
      hero_image_path: 'line-1/brand/hero.jpg',
      hero_image_url: 'https://example.com/hero.jpg',
      sort_order: 10,
      public_showroom_path: '/old-guys-rule-wholesale',
      principal_id: null,
      status: 'active',
      acquisition_stage: null,
      default_currency: 'CAD',
      commission_rate: null,
      effective_date: null,
      termination_date: null,
      productivity_thresholds: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    };

    expect(mapLineRow(row)).toEqual({
      id: 'line-1',
      code: 'ogr',
      name: 'Old Guys Rule',
      active: true,
      tagline: 'Now Repping',
      description: 'Apparel & lifestyle goods.',
      heroImagePath: 'line-1/brand/hero.jpg',
      heroImageUrl: 'https://example.com/hero.jpg',
      sortOrder: 10,
      publicShowroomPath: '/old-guys-rule-wholesale',
    });
  });
});
