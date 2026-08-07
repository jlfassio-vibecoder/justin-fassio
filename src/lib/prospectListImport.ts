/**
 * Parse BC named prospect list HTML and map rows onto CRM prospect fields.
 * Used by scripts/import-prospect-list.mjs (via vitest/vite-node) and unit tests.
 */

export type ProspectCategory = import('@/lib/prospects').ProspectCategory;
export type ProspectRegion =
  'Okanagan' | 'Shuswap' | 'Vancouver Island' | 'Sea-to-Sky' | 'Kootenays' | 'Fraser Valley';

export type SheetProspect = {
  externalId: string;
  name: string;
  city: string;
  subterritory: string;
  primaryDistrict: string;
  retailCategory: string;
  website: string;
  fitScore: number | null;
  idealOpeningUnits: number | null;
  priority: string;
  provisionalGrade: string;
  fit: string;
  verificationStatus: string;
  buyerVerified: boolean;
  apparelCapability: string;
  existingOgr: string;
  qualificationStatus: string;
  nextAction: string;
  sourceNote: string;
};

export type CrmProspectRef = {
  id: number;
  name: string;
  city: string;
  externalId: string | null;
};

export type MappedProspectRow = SheetProspect & {
  category: ProspectCategory;
  region: ProspectRegion;
};

export type MatchResult =
  | { kind: 'update'; sheet: MappedProspectRow; crmId: number; matchVia: string }
  | { kind: 'insert'; sheet: MappedProspectRow }
  | { kind: 'ambiguous'; sheet: MappedProspectRow; candidates: CrmProspectRef[] };

function decodeEntities(raw: string): string {
  return raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseOptionalInt(raw: string): number | null {
  const t = raw.trim();
  if (!t || t === '#VALUE!' || t === '#N/A' || t === '—') return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseBuyerVerified(raw: string): boolean {
  const t = raw.trim().toLowerCase();
  return t === 'yes' || t === 'y' || t === 'true' || t === '1';
}

export function mapRetailCategoryToChannel(retailCategory: string): ProspectCategory {
  const t = retailCategory.trim().toLowerCase();
  if (t === 'golf pro shop') return 'golf_retail';
  if (t === 'marine dealer / supply' || t === 'marina / resort store') return 'marine_retail';
  if (t === 'hardware / farm store with apparel') return 'hardware_farm_rural';
  if (t.includes('fishing') || t.includes('outdoor')) return 'fishing_fly_tackle';
  if (t.includes('apparel') || t.includes('clothing')) return 'apparel_specialty';
  return 'gift_novelty_souvenir';
}

export function mapDistrictToRegion(primaryDistrict: string, subterritory: string): ProspectRegion {
  const district = primaryDistrict.trim().toLowerCase();
  const sub = subterritory.trim().toLowerCase();

  if (district === 'okanagan') return 'Okanagan';
  if (district === 'vancouver island') return 'Vancouver Island';
  if (district === 'lower mainland') {
    if (/\b(sea.?to.?sky|sunshine coast|squamish|whistler|pemberton)\b/.test(sub)) {
      return 'Sea-to-Sky';
    }
    return 'Fraser Valley';
  }
  if (district === 'thompson and kootenays') {
    if (/\b(shuswap|thompson|nicola|kamloops|salmon arm|sicamous|chase)\b/.test(sub)) {
      return 'Shuswap';
    }
    return 'Kootenays';
  }
  if (district === 'northern british columbia') return 'Kootenays';
  return 'Fraser Valley';
}

export function normalizeProspectName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`´]/g, "'")
    .replace(/&/g, 'and')
    .replace(/golf\s+(and|&)\s+country\s+club/g, 'golf club')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Prefer Pro Shop over Fairmont when both contain "Whistler Golf Club". */
function rankContainmentCandidate(sheetName: string, candidateName: string): number {
  const sn = normalizeProspectName(sheetName);
  const cn = normalizeProspectName(candidateName);
  if (cn === sn) return 0;
  // Prefer shorter CRM names that are prefixes/contained (Pro Shop vs Fairmont Chateau…)
  if (sn.includes(cn)) return cn.length;
  if (cn.includes(sn)) return 1000 + (cn.length - sn.length);
  return 2000;
}

export function parseProspectListHtml(html: string): SheetProspect[] {
  const rows: SheetProspect[] = [];
  const trRe = /<tr[\s\S]*?<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRe.exec(html)) != null) {
    const cells = [...trMatch[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) =>
      stripTags(m[1]),
    );
    if (cells.length < 12) continue;
    // Sheet export: [rowHeader?, Prospect ID, Business name, ...]
    let start = 0;
    if (/^\d+$/.test(cells[0]) && /^BC-\d+/i.test(cells[1] ?? '')) start = 1;
    else if (!/^BC-\d+/i.test(cells[0] ?? '')) continue;

    const slice = cells.slice(start);
    const externalId = slice[0]?.trim() ?? '';
    if (!/^BC-\d+$/i.test(externalId)) continue;

    rows.push({
      externalId: externalId.toUpperCase(),
      name: slice[1] ?? '',
      city: slice[2] ?? '',
      subterritory: slice[3] ?? '',
      primaryDistrict: slice[4] ?? '',
      retailCategory: slice[5] ?? '',
      website: slice[6] ?? '',
      fitScore: parseOptionalInt(slice[7] ?? ''),
      // slice[8] annual $ skipped
      idealOpeningUnits: parseOptionalInt(slice[9] ?? ''),
      priority: slice[10] ?? '',
      provisionalGrade: slice[11] ?? '',
      fit: slice[12] ?? '',
      verificationStatus: slice[13] ?? '',
      buyerVerified: parseBuyerVerified(slice[14] ?? ''),
      apparelCapability: slice[15] ?? '',
      existingOgr: slice[16] ?? '',
      qualificationStatus: slice[17] ?? '',
      nextAction: slice[18] ?? '',
      sourceNote: slice[19] ?? '',
    });
  }
  return rows;
}

export function mapSheetProspect(sheet: SheetProspect): MappedProspectRow {
  return {
    ...sheet,
    category: mapRetailCategoryToChannel(sheet.retailCategory),
    region: mapDistrictToRegion(sheet.primaryDistrict, sheet.subterritory),
  };
}

export function matchSheetToCrm(
  sheet: MappedProspectRow,
  crm: CrmProspectRef[],
  alreadyMatchedIds: Set<number>,
): MatchResult {
  const byExternal = crm.find(
    (p) =>
      p.externalId != null &&
      p.externalId.toUpperCase() === sheet.externalId &&
      !alreadyMatchedIds.has(p.id),
  );
  if (byExternal) {
    return { kind: 'update', sheet, crmId: byExternal.id, matchVia: 'external_id' };
  }

  const sheetNorm = normalizeProspectName(sheet.name);
  const sheetCity = normalizeProspectName(sheet.city);

  const exact = crm.filter(
    (p) => !alreadyMatchedIds.has(p.id) && normalizeProspectName(p.name) === sheetNorm,
  );
  if (exact.length === 1) {
    return { kind: 'update', sheet, crmId: exact[0].id, matchVia: 'name' };
  }
  if (exact.length > 1) {
    const byCity = exact.filter((p) => normalizeProspectName(p.city) === sheetCity);
    if (byCity.length === 1) {
      return { kind: 'update', sheet, crmId: byCity[0].id, matchVia: 'name+city' };
    }
    return { kind: 'ambiguous', sheet, candidates: byCity.length > 0 ? byCity : exact };
  }

  const contained = crm.filter((p) => {
    if (alreadyMatchedIds.has(p.id)) return false;
    const pn = normalizeProspectName(p.name);
    return pn.includes(sheetNorm) || sheetNorm.includes(pn);
  });

  if (contained.length === 1) {
    return { kind: 'update', sheet, crmId: contained[0].id, matchVia: 'containment' };
  }
  if (contained.length > 1) {
    const byCity = contained.filter((p) => normalizeProspectName(p.city) === sheetCity);
    const pool = byCity.length > 0 ? byCity : contained;
    if (pool.length === 1) {
      return { kind: 'update', sheet, crmId: pool[0].id, matchVia: 'containment+city' };
    }
    // Prefer best-ranked single winner (Whistler Golf Club Pro Shop over Fairmont)
    const ranked = [...pool].sort(
      (a, b) =>
        rankContainmentCandidate(sheet.name, a.name) - rankContainmentCandidate(sheet.name, b.name),
    );
    const best = ranked[0];
    const second = ranked[1];
    if (
      best &&
      second &&
      rankContainmentCandidate(sheet.name, best.name) <
        rankContainmentCandidate(sheet.name, second.name)
    ) {
      return { kind: 'update', sheet, crmId: best.id, matchVia: 'containment-ranked' };
    }
    return { kind: 'ambiguous', sheet, candidates: pool };
  }

  return { kind: 'insert', sheet };
}

export type UpsertPlan = {
  updates: Extract<MatchResult, { kind: 'update' }>[];
  inserts: Extract<MatchResult, { kind: 'insert' }>[];
  ambiguous: Extract<MatchResult, { kind: 'ambiguous' }>[];
};

export function buildUpsertPlan(sheets: SheetProspect[], crm: CrmProspectRef[]): UpsertPlan {
  const updates: UpsertPlan['updates'] = [];
  const inserts: UpsertPlan['inserts'] = [];
  const ambiguous: UpsertPlan['ambiguous'] = [];
  const matched = new Set<number>();

  for (const raw of sheets) {
    const sheet = mapSheetProspect(raw);
    const result = matchSheetToCrm(sheet, crm, matched);
    if (result.kind === 'update') {
      matched.add(result.crmId);
      updates.push(result);
    } else if (result.kind === 'insert') {
      inserts.push(result);
    } else {
      ambiguous.push(result);
    }
  }

  return { updates, inserts, ambiguous };
}

function sqlStr(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNullableStr(value: string): string {
  const t = value.trim();
  return t ? sqlStr(t) : 'null';
}

function sqlNullableInt(value: number | null): string {
  return value == null ? 'null' : String(value);
}

function planningSetClause(row: MappedProspectRow): string {
  return [
    `name = ${sqlStr(row.name)}`,
    `category = ${sqlStr(row.category)}`,
    `region = ${sqlStr(row.region)}`,
    `city = ${sqlStr(row.city)}`,
    `fit = ${sqlStr(row.fit)}`,
    `external_id = ${sqlStr(row.externalId)}`,
    `subterritory = ${sqlNullableStr(row.subterritory)}`,
    `primary_district = ${sqlNullableStr(row.primaryDistrict)}`,
    `retail_category = ${sqlNullableStr(row.retailCategory)}`,
    `website = ${sqlNullableStr(row.website)}`,
    `fit_score = ${sqlNullableInt(row.fitScore)}`,
    `ideal_opening_units = ${sqlNullableInt(row.idealOpeningUnits)}`,
    `priority = ${sqlNullableStr(row.priority)}`,
    `provisional_grade = ${sqlNullableStr(row.provisionalGrade)}`,
    `verification_status = ${sqlNullableStr(row.verificationStatus)}`,
    `buyer_verified = ${row.buyerVerified ? 'true' : 'false'}`,
    `apparel_capability = ${sqlNullableStr(row.apparelCapability)}`,
    `existing_ogr = ${sqlNullableStr(row.existingOgr)}`,
    `qualification_status = ${sqlNullableStr(row.qualificationStatus)}`,
    `next_action = ${sqlNullableStr(row.nextAction)}`,
    `source_note = ${sqlNullableStr(row.sourceNote)}`,
    `updated_at = now()`,
  ].join(',\n  ');
}

export function renderUpsertSql(
  plan: UpsertPlan,
  options: { nextIdStart: number; generatedBy: string },
): string {
  if (plan.ambiguous.length > 0) {
    const detail = plan.ambiguous
      .map(
        (a) =>
          `${a.sheet.externalId} ${a.sheet.name} → [${a.candidates.map((c) => `${c.id}:${c.name}`).join(', ')}]`,
      )
      .join('\n');
    throw new Error(`Ambiguous matches remain:\n${detail}`);
  }

  const parts: string[] = [
    `-- Upsert BC named prospect list from docs/prospect-list.html`,
    `-- Generated by ${options.generatedBy} — do not hand-edit bulk rows.`,
    `-- Updates: ${plan.updates.length}; inserts: ${plan.inserts.length}`,
    ``,
  ];

  for (const u of plan.updates) {
    parts.push(`update prospects set`);
    parts.push(`  ${planningSetClause(u.sheet)}`);
    parts.push(`where id = ${u.crmId};`);
    parts.push(``);
  }

  let nextId = options.nextIdStart;
  if (plan.inserts.length > 0) {
    const values = plan.inserts.map((ins) => {
      const r = ins.sheet;
      const id = nextId++;
      return `  (${id}, ${sqlStr(r.name)}, ${sqlStr(r.category)}, ${sqlStr(r.region)}, ${sqlStr(r.city)}, '', '', ${sqlStr(r.fit)}, 'prospect', ${sqlStr(r.externalId)}, ${sqlNullableStr(r.subterritory)}, ${sqlNullableStr(r.primaryDistrict)}, ${sqlNullableStr(r.retailCategory)}, ${sqlNullableStr(r.website)}, ${sqlNullableInt(r.fitScore)}, ${sqlNullableInt(r.idealOpeningUnits)}, ${sqlNullableStr(r.priority)}, ${sqlNullableStr(r.provisionalGrade)}, ${sqlNullableStr(r.verificationStatus)}, ${r.buyerVerified ? 'true' : 'false'}, ${sqlNullableStr(r.apparelCapability)}, ${sqlNullableStr(r.existingOgr)}, ${sqlNullableStr(r.qualificationStatus)}, ${sqlNullableStr(r.nextAction)}, ${sqlNullableStr(r.sourceNote)})`;
    });

    parts.push(`insert into prospects (`);
    parts.push(`  id, name, category, region, city, address, phone, fit, account_status,`);
    parts.push(`  external_id, subterritory, primary_district, retail_category, website,`);
    parts.push(
      `  fit_score, ideal_opening_units, priority, provisional_grade, verification_status,`,
    );
    parts.push(
      `  buyer_verified, apparel_capability, existing_ogr, qualification_status, next_action, source_note`,
    );
    parts.push(`)`);
    parts.push(`values`);
    parts.push(values.join(',\n'));
    parts.push(`;`);
    parts.push(``);
  }

  return parts.join('\n');
}
