import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildUpsertPlan,
  mapDistrictToRegion,
  mapRetailCategoryToChannel,
  matchSheetToCrm,
  normalizeProspectName,
  parseBuyerVerified,
  parseProspectListHtml,
  renderUpsertSql,
  type CrmProspectRef,
  type SheetProspect,
} from '@/lib/prospectListImport';

const SAMPLE_HTML = `
<table>
<tr><th>4</th><td>Prospect ID</td><td>Business name</td><td>City</td><td>Subterritory</td><td>Primary district</td><td>Retail category</td><td>Website</td><td>Fit score</td><td>Annual</td><td>Ideal opening units</td><td>Priority</td><td>Provisional grade</td><td>Reason for inclusion</td><td>Verification status</td><td>Buyer verified?</td><td>Apparel capability</td><td>Existing OGR?</td><td>Qualification status</td><td>Next action</td><td>Source note</td></tr>
<tr><th>5</th><td>BC-001</td><td>Gallagher&#39;s Canyon Golf Club</td><td>Kelowna</td><td>Central Okanagan</td><td>Okanagan</td><td>Golf pro shop</td><td>https://example.com</td><td>10</td><td>#VALUE!</td><td>60</td><td>Tier 1</td><td>A (provisional)</td><td>Older male traffic</td><td>Directory lead</td><td>No</td><td>Unknown</td><td>Unknown</td><td>Unqualified</td><td>Research buyer</td><td>Public website</td></tr>
<tr><th>6</th><td>BC-260</td><td>The Cabana</td><td>Parksville</td><td>Vancouver Island Central</td><td>Vancouver Island</td><td>Independent gift / tourist store</td><td>https://thecabana.ca</td><td>10</td><td>#VALUE!</td><td>60</td><td>Tier 2</td><td>B (provisional)</td><td>Gift buyer</td><td>Known OGR</td><td>Yes</td><td>Unknown</td><td>Yes / reference</td><td>Unqualified</td><td>Email + phone</td><td>Public website</td></tr>
</table>
`;

function sheet(
  partial: Partial<SheetProspect> & Pick<SheetProspect, 'externalId' | 'name'>,
): SheetProspect {
  return {
    city: 'Kelowna',
    subterritory: 'Central Okanagan',
    primaryDistrict: 'Okanagan',
    retailCategory: 'Golf pro shop',
    website: '',
    fitScore: 8,
    idealOpeningUnits: 40,
    priority: 'Tier 1',
    provisionalGrade: 'A',
    fit: 'fit reason',
    verificationStatus: 'pending',
    buyerVerified: false,
    apparelCapability: 'Unknown',
    existingOgr: 'Unknown',
    qualificationStatus: 'Unqualified',
    nextAction: 'Call',
    sourceNote: 'note',
    ...partial,
  };
}

describe('prospectListImport mapping', () => {
  it('maps retail categories to CRM channels', () => {
    expect(mapRetailCategoryToChannel('Golf pro shop')).toBe('Golf');
    expect(mapRetailCategoryToChannel('Marine dealer / supply')).toBe('Marina');
    expect(mapRetailCategoryToChannel('Marina / resort store')).toBe('Marina');
    expect(mapRetailCategoryToChannel('Hardware / farm store with apparel')).toBe('Hardware');
    expect(mapRetailCategoryToChannel('Fishing / outdoor retailer')).toBe('Resort Gift');
  });

  it('maps districts to CRM regions', () => {
    expect(mapDistrictToRegion('Okanagan', 'Central Okanagan')).toBe('Okanagan');
    expect(mapDistrictToRegion('Vancouver Island', 'South Island')).toBe('Vancouver Island');
    expect(mapDistrictToRegion('Lower Mainland', 'Fraser Valley')).toBe('Fraser Valley');
    expect(mapDistrictToRegion('Lower Mainland', 'Sea-to-Sky')).toBe('Sea-to-Sky');
    expect(mapDistrictToRegion('Thompson and Kootenays', 'Shuswap')).toBe('Shuswap');
    expect(mapDistrictToRegion('Thompson and Kootenays', 'East Kootenay')).toBe('Kootenays');
    expect(mapDistrictToRegion('Northern British Columbia', 'Prince George')).toBe('Kootenays');
  });

  it('parses buyer verified flags', () => {
    expect(parseBuyerVerified('Yes')).toBe(true);
    expect(parseBuyerVerified('No')).toBe(false);
    expect(parseBuyerVerified('')).toBe(false);
  });

  it('normalizes names for matching', () => {
    expect(normalizeProspectName("Gallagher's Canyon Golf Club")).toBe(
      'gallagher s canyon golf club',
    );
  });
});

describe('parseProspectListHtml', () => {
  it('parses sample sheet rows with entity decoding', () => {
    const rows = parseProspectListHtml(SAMPLE_HTML);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      externalId: 'BC-001',
      name: "Gallagher's Canyon Golf Club",
      city: 'Kelowna',
      fitScore: 10,
      idealOpeningUnits: 60,
      buyerVerified: false,
      fit: 'Older male traffic',
    });
    expect(rows[1]).toMatchObject({
      externalId: 'BC-260',
      buyerVerified: true,
      existingOgr: 'Yes / reference',
    });
  });

  it('parses the real prospect-list.html without duplicate external ids', () => {
    const html = readFileSync(join(process.cwd(), 'docs/prospect-list.html'), 'utf8');
    const rows = parseProspectListHtml(html);
    expect(rows.length).toBe(423);
    const ids = rows.map((r) => r.externalId);
    expect(new Set(ids).size).toBe(423);
    expect(ids[0]).toBe('BC-001');
    expect(ids[422]).toBe('BC-423');
  });
});

describe('matchSheetToCrm', () => {
  const crm: CrmProspectRef[] = [
    { id: 5, name: "Gallagher's Canyon Golf Club", city: 'Kelowna', externalId: null },
    { id: 141, name: 'Whistler Golf Club Pro Shop', city: 'Whistler', externalId: null },
    { id: 143, name: 'Fairmont Chateau Whistler Golf Club', city: 'Whistler', externalId: null },
    { id: 99, name: 'Already Linked', city: 'Kelowna', externalId: 'BC-099' },
  ];

  it('matches by external_id first', () => {
    const result = matchSheetToCrm(
      {
        ...sheet({ externalId: 'BC-099', name: 'Already Linked' }),
        category: 'Golf',
        region: 'Okanagan',
      },
      crm,
      new Set(),
    );
    expect(result).toMatchObject({ kind: 'update', crmId: 99, matchVia: 'external_id' });
  });

  it('matches by exact name', () => {
    const result = matchSheetToCrm(
      {
        ...sheet({ externalId: 'BC-001', name: "Gallagher's Canyon Golf Club" }),
        category: 'Golf',
        region: 'Okanagan',
      },
      crm,
      new Set(),
    );
    expect(result).toMatchObject({ kind: 'update', crmId: 5, matchVia: 'name' });
  });

  it('ranks Whistler Golf Club toward Pro Shop over Fairmont', () => {
    const result = matchSheetToCrm(
      {
        ...sheet({
          externalId: 'BC-088',
          name: 'Whistler Golf Club',
          city: 'Whistler',
          primaryDistrict: 'Lower Mainland',
          subterritory: 'Sea-to-Sky',
        }),
        category: 'Golf',
        region: 'Sea-to-Sky',
      },
      crm,
      new Set(),
    );
    expect(result).toMatchObject({ kind: 'update', crmId: 141, matchVia: 'containment-ranked' });
  });

  it('inserts when no match', () => {
    const result = matchSheetToCrm(
      {
        ...sheet({ externalId: 'BC-400', name: 'Brand New Outfitters' }),
        category: 'Resort Gift',
        region: 'Okanagan',
      },
      crm,
      new Set(),
    );
    expect(result.kind).toBe('insert');
  });
});

describe('buildUpsertPlan + renderUpsertSql', () => {
  it('builds plan and SQL without duplicate external ids', () => {
    const sheets = parseProspectListHtml(SAMPLE_HTML);
    const crm: CrmProspectRef[] = [
      { id: 5, name: "Gallagher's Canyon Golf Club", city: 'Kelowna', externalId: null },
    ];
    const plan = buildUpsertPlan(sheets, crm);
    expect(plan.updates).toHaveLength(1);
    expect(plan.inserts).toHaveLength(1);
    expect(plan.ambiguous).toHaveLength(0);

    const sql = renderUpsertSql(plan, {
      nextIdStart: 250,
      generatedBy: 'test',
    });
    expect(sql).toContain('where id = 5;');
    expect(sql).toContain("external_id = 'BC-001'");
    expect(sql).toContain('(250,');
    expect(sql).toContain("'BC-260'");
    expect(sql).not.toContain('account_status =');
  });
});
