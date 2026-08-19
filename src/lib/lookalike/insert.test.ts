import { describe, expect, it } from 'vitest';
import { buildLookalikeInsertFields } from '@/lib/lookalike/insert';

describe('lookalike approve insert payload', () => {
  it('writes a never-ordered OGR prospect tagged lookalike_prospect only', () => {
    const fields = buildLookalikeInsertFields({
      jobId: '11111111-1111-4111-8111-111111111111',
      name: 'Deschutes Fly Shop',
      city: 'Bend',
      state: 'OR',
      website: 'https://example.com',
      territoryId: 'terr-or',
      salesLineTerritoryId: 'slt-or',
    });
    expect(fields.prospect.account_status).toBe('prospect');
    expect(fields.prospect.existing_ogr).toBe('Unknown');
    expect(fields.prospect.existing_ogr).not.toBe('yes');
    expect(fields.prospect.import_protected).toBe(true);
    expect(fields.prospect.qualification_status).toBeNull();
    expect(fields.rla.relationship_status).toBe('prospect');
    expect(fields.rla.line_account_markers).toEqual(['lookalike_prospect']);
    expect(fields.rla.line_account_markers).not.toContain('historical_purchaser');
    expect(fields.rla.line_account_markers).not.toContain('outreach_eligible');
    expect(fields.rla.existing_ogr).toBe('Unknown');
    expect(String(fields.prospect.notes)).toMatch(/never ordered/i);
    expect(String(fields.prospect.notes)).not.toMatch(/verified past OGR customer/i);
  });
});
