import { describe, expect, it } from 'vitest';
import {
  cleanOregonCoast101City,
  externalIdSlug,
  isBigWheelSkip,
  isUnusableRouteName,
  mapOregonCoast101GradeToPriority,
  normalizeOregonCoast101Grade,
  normalizeOregonCoast101Phone,
  parseOregonCoast101ContactName,
  parseOregonCoast101CsvRows,
  parseOregonCoast101WebEmail,
  shouldApplySheetGrade,
} from '@/lib/oregonCoast101Route';

describe('cleanOregonCoast101City', () => {
  it('strips Oregon suffix and duplicated banners', () => {
    expect(cleanOregonCoast101City('Coos BayCoos Bay, Oregon')).toBe('Coos Bay');
    expect(cleanOregonCoast101City('North Bend, Oregon')).toBe('North Bend');
    expect(cleanOregonCoast101City('Warrenton / Hammond, Oregon')).toBe('Warrenton');
  });
});

describe('normalizeOregonCoast101Grade', () => {
  it('handles unicode minus and compound grades', () => {
    expect(normalizeOregonCoast101Grade('A−')).toBe('A-');
    expect(normalizeOregonCoast101Grade('A− / B+')).toBe('A-');
    expect(normalizeOregonCoast101Grade('A++')).toBe('A++');
    expect(normalizeOregonCoast101Grade('B+ — STATUS CHECK')).toBe('B+');
    expect(normalizeOregonCoast101Grade('Grade')).toBeNull();
  });
});

describe('mapOregonCoast101GradeToPriority', () => {
  it('maps A band to Tier 1 and C to Tier 3', () => {
    expect(mapOregonCoast101GradeToPriority('A+')).toEqual({
      priority: 'Tier 1',
      provisionalGrade: 'A (provisional)',
    });
    expect(mapOregonCoast101GradeToPriority('B-')).toEqual({
      priority: 'Tier 2',
      provisionalGrade: 'B (provisional)',
    });
    expect(mapOregonCoast101GradeToPriority('C+')).toEqual({
      priority: 'Tier 3',
      provisionalGrade: 'C (provisional)',
    });
  });
});

describe('shouldApplySheetGrade', () => {
  it('applies when CRM blank or sheet is stronger', () => {
    expect(shouldApplySheetGrade(null, 'B+')).toBe(true);
    expect(shouldApplySheetGrade('Tier 3', 'A')).toBe(true);
    expect(shouldApplySheetGrade('Tier 1', 'C')).toBe(false);
  });
});

describe('normalizeOregonCoast101Phone', () => {
  it('normalizes labeled and raw phones', () => {
    expect(normalizeOregonCoast101Phone('Golf Shop: 503-861-2545')).toBe('503-861-2545');
    expect(normalizeOregonCoast101Phone('541-808-0878')).toBe('541-808-0878');
    expect(normalizeOregonCoast101Phone('503-812-3023 / 503-812-4729')).toBe('503-812-3023');
  });
});

describe('parseOregonCoast101WebEmail', () => {
  it('extracts email and host when present', () => {
    expect(parseOregonCoast101WebEmail('Website • bayshoregiftscoosbay@gmail.com')).toEqual({
      website: null,
      email: 'bayshoregiftscoosbay@gmail.com',
    });
    expect(parseOregonCoast101WebEmail('cannonbeachhardware.com')).toEqual({
      website: 'https://cannonbeachhardware.com',
      email: null,
    });
    expect(parseOregonCoast101WebEmail('Website • newport@englundmarine.com').email).toBe(
      'newport@englundmarine.com',
    );
  });
});

describe('parseOregonCoast101ContactName', () => {
  it('reads leading First Last before em dash', () => {
    expect(parseOregonCoast101ContactName('Lorna Lewis — current 2026 Chamber contact')).toBe(
      'Lorna Lewis',
    );
    expect(parseOregonCoast101ContactName('Centralized corporate purchasing')).toBeNull();
  });
});

describe('parseOregonCoast101CsvRows', () => {
  it('parses Oregon section and stops at Washington', () => {
    const rows = parseOregonCoast101CsvRows([
      ['OREGON', '', '', '', '', ''],
      ['Coos BayCoos Bay, Oregon', '', '', '', '', ''],
      ['Grade', 'Prospect', 'Phone', 'Website / Email', 'Contact / verification', 'Why OGR fits'],
      [
        'A+',
        'Bayshore Gifts & Gallery',
        '541-808-0878',
        'Website • bayshoregiftscoosbay@gmail.com',
        'Lorna Lewis — current 2026 Chamber contact',
        'Best account. (Bayshore Gifts)',
      ],
      [
        'A−',
        '',
        '541-614-0015',
        'Website • thehoodieshoppeinfo@gmail.com',
        '',
        'Fit. (The Hoodie Shoppe)',
      ],
      ['WASHINGTON', '', '', '', '', ''],
      ['Chinook', '', '', '', '', ''],
      ['A+', 'Should Skip WA', '360-555-0100', 'Website', 'Owner', 'Nope'],
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.name).toBe('Bayshore Gifts & Gallery');
    expect(rows[0]?.city).toBe('Coos Bay');
    expect(rows[0]?.primaryGrade).toBe('A+');
    expect(rows[0]?.email).toBe('bayshoregiftscoosbay@gmail.com');
    expect(rows[1]?.name).toBe('The Hoodie Shoppe');
    expect(rows[1]?.primaryGrade).toBe('A-');
  });
});

describe('helpers', () => {
  it('slugs and skips Big Wheel and junk names', () => {
    expect(externalIdSlug('Bayshore Gifts & Gallery')).toContain('bayshore');
    expect(isBigWheelSkip('Big Wheel General Store')).toBe(true);
    expect(isBigWheelSkip('Bayshore Gifts')).toBe(false);
    expect(isUnusableRouteName('Cannon Beach', 'Cannon Beach')).toBe(true);
    expect(isUnusableRouteName('LinkedIn', 'Gearhart')).toBe(true);
    expect(isUnusableRouteName('The Hoodie Shoppe', 'Lincoln City')).toBe(false);
  });
});
