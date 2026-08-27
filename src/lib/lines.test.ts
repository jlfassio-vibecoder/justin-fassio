import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapLineRow, mapPublicActiveLineRow, mergePublicLineCards } from '@/lib/lines';
import type { Line } from '@/types/database';
import {
  BIG_FISH_WHOLESALE_PATH,
  EAGLE_PEAK_WHOLESALE_PATH,
  LIVING_IN_SUNSHINE_WHOLESALE_PATH,
  OGR_WHOLESALE_PATH,
} from '@/data/landing';

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
      ai_profile: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-08-01T00:00:00Z',
    };

    expect(mapLineRow(row)).toEqual({
      id: 'line-1',
      code: 'ogr',
      name: 'Old Guys Rule',
      active: true,
      status: 'active',
      tagline: 'Now Repping',
      description: 'Apparel & lifestyle goods.',
      heroImagePath: 'line-1/brand/hero.jpg',
      heroImageUrl: 'https://example.com/hero.jpg',
      sortOrder: 10,
      publicShowroomPath: '/old-guys-rule-wholesale',
      defaultCurrency: 'CAD',
    });
  });
});

describe('public line cards', () => {
  it('maps RPC rows onto the public card shape', () => {
    expect(
      mapPublicActiveLineRow({
        id: 'ep-1',
        code: 'eagle-peak',
        name: 'Eagle Peak',
        tagline: 'Now Repping',
        description: 'Canopy / shade products (onboarding).',
        hero_image_url: 'https://example.com/ep.png',
        sort_order: 30,
        public_showroom_path: EAGLE_PEAK_WHOLESALE_PATH,
      }),
    ).toEqual({
      id: 'ep-1',
      code: 'eagle-peak',
      name: 'Eagle Peak',
      tagline: 'Now Repping',
      description: 'Canopy / shade products (onboarding).',
      heroImageUrl: 'https://example.com/ep.png',
      sortOrder: 30,
      publicShowroomPath: EAGLE_PEAK_WHOLESALE_PATH,
    });
  });

  it('fills missing represented cards from fallbacks and keeps live heroes', () => {
    const merged = mergePublicLineCards([
      {
        id: 'live-ogr',
        code: 'ogr',
        name: 'Old Guys Rule',
        tagline: 'Even if you do not think you are an old guy yet',
        description: 'Apparel & lifestyle goods.',
        heroImageUrl: 'https://example.com/ogr.jpg',
        sortOrder: 10,
        publicShowroomPath: OGR_WHOLESALE_PATH,
      },
    ]);

    expect(merged.map((row) => row.code)).toEqual([
      'ogr',
      'living-in-sunshine',
      'eagle-peak',
      'big-fish',
    ]);
    expect(merged[0]?.heroImageUrl).toBe('https://example.com/ogr.jpg');
    expect(merged[1]?.publicShowroomPath).toBe(LIVING_IN_SUNSHINE_WHOLESALE_PATH);
    expect(merged[1]?.tagline).toBe('Now Repping');
    expect(merged[2]?.publicShowroomPath).toBe(EAGLE_PEAK_WHOLESALE_PATH);
    expect(merged[2]?.tagline).toBe('Now Repping');
    expect(merged[3]?.tagline).toBe('Coming soon');
    expect(merged[3]?.publicShowroomPath).toBe(BIG_FISH_WHOLESALE_PATH);
  });

  it('keeps get_public_active_lines OGR-only and adds get_public_line_cards', () => {
    const schema = readFileSync(resolve(process.cwd(), 'supabase/schema.sql'), 'utf8');
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20260827201000_living_in_sunshine_line.sql'),
      'utf8',
    );
    const types = readFileSync(resolve(process.cwd(), 'src/types/database.ts'), 'utf8');
    const lines = readFileSync(resolve(process.cwd(), 'src/lib/lines.ts'), 'utf8');

    expect(schema).toMatch(
      /create or replace function public\.get_public_active_lines\(\)[\s\S]*?where l\.active = true[\s\S]*?\$\$;/i,
    );
    expect(schema).toMatch(
      /create or replace function public\.get_public_line_cards\(\)[\s\S]*?code in \('ogr', 'living-in-sunshine', 'eagle-peak', 'big-fish'\)[\s\S]*?\$\$;/i,
    );
    expect(schema).not.toMatch(/get_public_eagle_peak/);
    expect(schema).not.toMatch(/get_public_big_fish/);
    expect(schema).toMatch(/get_public_living_in_sunshine_products/);
    expect(migration).toMatch(/living-in-sunshine/);
    expect(migration).toMatch(/LIS-GO-HAMMOCK/);
    expect(migration).not.toMatch(/active = true/);
    expect(types).toMatch(/get_public_line_cards:/);
    expect(types).toMatch(/get_public_living_in_sunshine_products:/);
    expect(lines).toContain("supabase.rpc('get_public_line_cards')");
  });
});
