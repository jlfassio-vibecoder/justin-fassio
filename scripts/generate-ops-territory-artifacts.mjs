/**
 * One-shot generator for West Coast operational territory Phase 0 artifacts + SQL seed.
 * Run: node scripts/generate-ops-territory-artifacts.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsDir = resolve(root, 'docs/territories');
mkdirSync(docsDir, { recursive: true });

const SOURCE =
  'Staff-approved Cascades / CA sales corridors (Census county FIPS 2024; LA ZIP partition v1)';
const EFFECTIVE_DATE = '2026-08-22';

/** @type {Record<string, { name: string, fips: string }[]>} */
const WA = {
  'pnw-west': [
    ['Clallam', '53009'],
    ['Clark', '53011'],
    ['Cowlitz', '53015'],
    ['Grays Harbor', '53027'],
    ['Island', '53029'],
    ['Jefferson', '53031'],
    ['King', '53033'],
    ['Kitsap', '53035'],
    ['Lewis', '53041'],
    ['Mason', '53045'],
    ['Pacific', '53049'],
    ['Pierce', '53053'],
    ['San Juan', '53055'],
    ['Skagit', '53057'],
    ['Skamania', '53059'],
    ['Snohomish', '53061'],
    ['Thurston', '53067'],
    ['Wahkiakum', '53069'],
    ['Whatcom', '53073'],
  ],
  'pnw-east': [
    ['Adams', '53001'],
    ['Asotin', '53003'],
    ['Benton', '53005'],
    ['Chelan', '53007'],
    ['Columbia', '53013'],
    ['Douglas', '53017'],
    ['Ferry', '53019'],
    ['Franklin', '53021'],
    ['Garfield', '53023'],
    ['Grant', '53025'],
    ['Kittitas', '53037'],
    ['Klickitat', '53039'],
    ['Lincoln', '53043'],
    ['Okanogan', '53047'],
    ['Pend Oreille', '53051'],
    ['Spokane', '53063'],
    ['Stevens', '53065'],
    ['Walla Walla', '53071'],
    ['Whitman', '53075'],
    ['Yakima', '53077'],
  ],
};

const OR = {
  'pnw-west': [
    ['Benton', '41003'],
    ['Clackamas', '41005'],
    ['Clatsop', '41007'],
    ['Columbia', '41009'],
    ['Coos', '41011'],
    ['Curry', '41015'],
    ['Douglas', '41019'],
    ['Jackson', '41029'],
    ['Josephine', '41033'],
    ['Lane', '41039'],
    ['Lincoln', '41041'],
    ['Linn', '41043'],
    ['Marion', '41047'],
    ['Multnomah', '41051'],
    ['Polk', '41053'],
    ['Tillamook', '41057'],
    ['Washington', '41067'],
    ['Yamhill', '41071'],
  ],
  'pnw-east': [
    ['Baker', '41001'],
    ['Crook', '41013'],
    ['Deschutes', '41017'],
    ['Gilliam', '41021'],
    ['Grant', '41023'],
    ['Harney', '41025'],
    ['Hood River', '41027'],
    ['Jefferson', '41031'],
    ['Klamath', '41035'],
    ['Lake', '41037'],
    ['Malheur', '41045'],
    ['Morrow', '41049'],
    ['Sherman', '41055'],
    ['Umatilla', '41059'],
    ['Union', '41061'],
    ['Wallowa', '41063'],
    ['Wasco', '41065'],
    ['Wheeler', '41069'],
  ],
};

/** CA counties except Los Angeles (06037) — locked: Monterey→coastal, Fresno→inland, Kern→t7 */
const CA = {
  'norcal-coastal': [
    ['Del Norte', '06015'],
    ['Humboldt', '06023'],
    ['Marin', '06041'],
    ['Mendocino', '06045'],
    ['Monterey', '06053'],
    ['San Francisco', '06075'],
    ['San Mateo', '06081'],
    ['Santa Cruz', '06087'],
    ['Sonoma', '06097'],
  ],
  'norcal-inland': [
    ['Alameda', '06001'],
    ['Alpine', '06003'],
    ['Amador', '06005'],
    ['Butte', '06007'],
    ['Calaveras', '06009'],
    ['Colusa', '06011'],
    ['Contra Costa', '06013'],
    ['El Dorado', '06017'],
    ['Fresno', '06019'],
    ['Glenn', '06021'],
    ['Lake', '06033'],
    ['Lassen', '06035'],
    ['Madera', '06039'],
    ['Mariposa', '06043'],
    ['Merced', '06047'],
    ['Modoc', '06049'],
    ['Napa', '06055'],
    ['Nevada', '06057'],
    ['Placer', '06061'],
    ['Plumas', '06063'],
    ['Sacramento', '06067'],
    ['San Joaquin', '06077'],
    ['Shasta', '06089'],
    ['Sierra', '06091'],
    ['Siskiyou', '06093'],
    ['Solano', '06095'],
    ['Stanislaus', '06099'],
    ['Sutter', '06101'],
    ['Tehama', '06103'],
    ['Trinity', '06105'],
    ['Tuolumne', '06109'],
    ['Yolo', '06113'],
    ['Yuba', '06115'],
  ],
  'ca-central-la-north': [
    ['San Benito', '06069'],
    ['San Luis Obispo', '06079'],
    ['Santa Barbara', '06083'],
    ['Santa Clara', '06085'],
    ['Ventura', '06111'],
  ],
  'la-metro-oc': [['Orange', '06059']],
  'ie-san-diego': [
    ['Imperial', '06025'],
    ['Inyo', '06027'],
    ['Kern', '06029'],
    ['Kings', '06031'],
    ['Mono', '06051'],
    ['Riverside', '06065'],
    ['San Bernardino', '06071'],
    ['San Diego', '06073'],
    ['Tulare', '06107'],
  ],
};

/** LA County ZIPs: Territory 5 = north/valley/west foothills; Territory 6 = metro core/south/east. */
const LA_T5 = [
  // Santa Clarita / Antelope Valley / northern foothills
  '91321',
  '91350',
  '91351',
  '91354',
  '91355',
  '91381',
  '91382',
  '91384',
  '91387',
  '91390',
  '93510',
  '93532',
  '93534',
  '93535',
  '93536',
  '93539',
  '93543',
  '93550',
  '93551',
  '93552',
  '93553',
  '93591',
  // San Fernando Valley / Glendale / Burbank / Pasadena / foothills
  '91001',
  '91006',
  '91007',
  '91010',
  '91011',
  '91016',
  '91020',
  '91024',
  '91030',
  '91040',
  '91042',
  '91101',
  '91103',
  '91104',
  '91105',
  '91106',
  '91107',
  '91108',
  '91201',
  '91202',
  '91203',
  '91204',
  '91205',
  '91206',
  '91207',
  '91208',
  '91214',
  '91301',
  '91302',
  '91303',
  '91304',
  '91306',
  '91307',
  '91311',
  '91316',
  '91324',
  '91325',
  '91326',
  '91331',
  '91335',
  '91340',
  '91342',
  '91343',
  '91344',
  '91345',
  '91352',
  '91356',
  '91364',
  '91367',
  '91401',
  '91402',
  '91403',
  '91405',
  '91406',
  '91411',
  '91423',
  '91436',
  '91501',
  '91502',
  '91504',
  '91505',
  '91506',
  '91601',
  '91602',
  '91604',
  '91605',
  '91606',
  '91607',
  '91608',
  // Malibu / Calabasas / Agoura / Topanga (north-west coastal corridor)
  '90263',
  '90265',
  '90290',
  '91361',
  '91362',
];

const LA_T6 = [
  // Central / downtown / mid-city / Hollywood / Westside metro
  '90001',
  '90002',
  '90003',
  '90004',
  '90005',
  '90006',
  '90007',
  '90008',
  '90010',
  '90011',
  '90012',
  '90013',
  '90014',
  '90015',
  '90016',
  '90017',
  '90018',
  '90019',
  '90020',
  '90021',
  '90022',
  '90023',
  '90024',
  '90025',
  '90026',
  '90027',
  '90028',
  '90029',
  '90031',
  '90032',
  '90033',
  '90034',
  '90035',
  '90036',
  '90037',
  '90038',
  '90039',
  '90041',
  '90042',
  '90043',
  '90044',
  '90045',
  '90046',
  '90047',
  '90048',
  '90049',
  '90056',
  '90057',
  '90058',
  '90059',
  '90061',
  '90062',
  '90063',
  '90064',
  '90065',
  '90066',
  '90067',
  '90068',
  '90069',
  '90071',
  '90077',
  '90089',
  '90094',
  '90095',
  // South Bay / coastal south / airport
  '90230',
  '90232',
  '90245',
  '90247',
  '90248',
  '90249',
  '90250',
  '90254',
  '90260',
  '90266',
  '90274',
  '90275',
  '90277',
  '90278',
  '90291',
  '90292',
  '90293',
  '90301',
  '90302',
  '90303',
  '90304',
  '90305',
  '90401',
  '90402',
  '90403',
  '90404',
  '90405',
  '90501',
  '90502',
  '90503',
  '90504',
  '90505',
  // Southeast / Gateway / Whittier / Long Beach
  '90601',
  '90602',
  '90603',
  '90604',
  '90605',
  '90606',
  '90638',
  '90640',
  '90650',
  '90660',
  '90670',
  '90701',
  '90703',
  '90706',
  '90710',
  '90712',
  '90713',
  '90715',
  '90716',
  '90717',
  '90723',
  '90731',
  '90732',
  '90744',
  '90745',
  '90746',
  '90755',
  '90802',
  '90803',
  '90804',
  '90805',
  '90806',
  '90807',
  '90808',
  '90810',
  '90813',
  '90814',
  '90815',
  // East SGV in LA County
  '91702',
  '91706',
  '91711',
  '91722',
  '91723',
  '91724',
  '91731',
  '91732',
  '91733',
  '91740',
  '91741',
  '91744',
  '91745',
  '91746',
  '91748',
  '91754',
  '91755',
  '91770',
  '91773',
  '91775',
  '91776',
  '91780',
  '91789',
  '91790',
  '91791',
  '91792',
  '91801',
  '91803',
];

function pairsToRows(state, codeMap) {
  const rows = [];
  for (const [code, pairs] of Object.entries(codeMap)) {
    for (const [name, fips] of pairs) {
      rows.push({ state_code: state, county_fips: fips, county_name: name, territory_code: code });
    }
  }
  return rows;
}

function assertUniqueFips(rows, label) {
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.county_fips)) throw new Error(`Duplicate FIPS in ${label}: ${r.county_fips}`);
    seen.add(r.county_fips);
  }
  return seen;
}

const waAll = pairsToRows('WA', WA);
const orAll = pairsToRows('OR', OR);
const caAll = pairsToRows('CA', CA);

assertUniqueFips(waAll, 'WA');
assertUniqueFips(orAll, 'OR');
assertUniqueFips(caAll, 'CA');

if (waAll.length !== 39) throw new Error(`WA expected 39 counties, got ${waAll.length}`);
if (orAll.length !== 36) throw new Error(`OR expected 36 counties, got ${orAll.length}`);
if (caAll.length !== 57) throw new Error(`CA expected 57 counties (ex-LA), got ${caAll.length}`);
if (caAll.some((r) => r.county_fips === '06037'))
  throw new Error('LA county must not be in CA county list');

const laT5 = [...new Set(LA_T5)].sort();
const laT6 = [...new Set(LA_T6)].sort();
const laOverlap = laT5.filter((z) => laT6.includes(z));
if (laOverlap.length) throw new Error(`LA ZIP overlap: ${laOverlap.join(',')}`);

const provenance = { source: SOURCE, effective_date: EFFECTIVE_DATE };

writeFileSync(resolve(docsDir, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');

writeFileSync(
  resolve(docsDir, 'wa-or-counties.json'),
  JSON.stringify(
    {
      ...provenance,
      description:
        'Cascades crest split: west = PNW West, east = PNW East. Every WA/OR county exactly once.',
      counties: [...waAll, ...orAll],
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  resolve(docsDir, 'ca-counties.json'),
  JSON.stringify(
    {
      ...provenance,
      description:
        'All CA counties except Los Angeles (06037). Monterey→norcal-coastal, Fresno→norcal-inland, Kern→ie-san-diego.',
      excluded_county_fips: ['06037'],
      counties: caAll,
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  resolve(docsDir, 'la-zips.json'),
  JSON.stringify(
    {
      ...provenance,
      description:
        'Exact five-digit LA County ZIPs only. Territory 5 = Central Coast South & LA North corridor; Territory 6 = LA Metro. No county row for LA.',
      zips: [
        ...laT5.map((zip) => ({ state_code: 'CA', zip, territory_code: 'ca-central-la-north' })),
        ...laT6.map((zip) => ({ state_code: 'CA', zip, territory_code: 'la-metro-oc' })),
      ],
    },
    null,
    2,
  ) + '\n',
);

writeFileSync(
  resolve(docsDir, 'README.md'),
  `# West Coast operational territory memberships (Phase 0)

**Source:** ${SOURCE}  
**Effective date:** ${EFFECTIVE_DATE}

## Artifacts

| File | Contents |
|------|----------|
| \`provenance.json\` | Seed source + effective_date |
| \`wa-or-counties.json\` | Every WA (39) and OR (36) county → pnw-west or pnw-east |
| \`ca-counties.json\` | Every CA county except LA → territories 3–7 |
| \`la-zips.json\` | Exact LA County ZIPs → ca-central-la-north (5) or la-metro-oc (6) |

## Locked locks

- Monterey \`06053\` → norcal-coastal
- Fresno \`06019\` → norcal-inland
- Kern \`06029\` → ie-san-diego
- Los Angeles \`06037\` → **no county membership** (ZIP only)

## Coverage rules

- WA/OR/CA (ex-LA) counties appear exactly once
- Each approved LA ZIP appears exactly once
- Unknown ZIPs resolve to review, never inferred
`,
);

// Also emit a compact TS module for tests/resolver fixtures
const tsPath = resolve(root, 'src/lib/operationalTerritories/membershipSeedData.ts');
const ts = `/** Auto-generated by scripts/generate-ops-territory-artifacts.mjs — do not edit by hand. */
export const OPS_TERRITORY_SEED_SOURCE = ${JSON.stringify(SOURCE)} as const;
export const OPS_TERRITORY_SEED_EFFECTIVE_DATE = ${JSON.stringify(EFFECTIVE_DATE)} as const;

export const OPS_TERRITORY_CODES = [
  'pnw-west',
  'pnw-east',
  'norcal-coastal',
  'norcal-inland',
  'ca-central-la-north',
  'la-metro-oc',
  'ie-san-diego',
] as const;

export type OpsTerritoryCode = (typeof OPS_TERRITORY_CODES)[number];

export type CountyMembershipSeed = {
  state_code: 'WA' | 'OR' | 'CA';
  county_fips: string;
  county_name: string;
  territory_code: OpsTerritoryCode;
};

export type ZipMembershipSeed = {
  state_code: 'CA';
  zip: string;
  territory_code: 'ca-central-la-north' | 'la-metro-oc';
};

export const COUNTY_MEMBERSHIP_SEEDS: readonly CountyMembershipSeed[] = ${JSON.stringify(
  [...waAll, ...orAll, ...caAll],
  null,
  2,
)} as const;

export const ZIP_MEMBERSHIP_SEEDS: readonly ZipMembershipSeed[] = ${JSON.stringify(
  [
    ...laT5.map((zip) => ({ state_code: 'CA', zip, territory_code: 'ca-central-la-north' })),
    ...laT6.map((zip) => ({ state_code: 'CA', zip, territory_code: 'la-metro-oc' })),
  ],
  null,
  2,
)} as const;

/** Census county counts as of seed effective date. */
export const EXPECTED_COUNTY_COUNTS = { WA: 39, OR: 36, CA_EX_LA: 57 } as const;
export const LA_COUNTY_FIPS = '06037' as const;
`;

writeFileSync(tsPath, ts);

console.log('Wrote docs/territories/* and membershipSeedData.ts');
console.log({
  wa: waAll.length,
  or: orAll.length,
  ca: caAll.length,
  laZips: laT5.length + laT6.length,
});
