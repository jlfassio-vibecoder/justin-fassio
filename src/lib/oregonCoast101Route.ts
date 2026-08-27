import { normalizeProspectName } from '@/lib/prospectListImport';
import type { ProspectPriority, ProvisionalGrade } from '@/lib/prospectEnrichment/priorityGrade';

export type OregonCoast101RouteRow = {
  rawGrade: string;
  primaryGrade: string;
  name: string;
  city: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  contactRaw: string | null;
  why: string | null;
  state: string;
};

/** Clean city banners like "Coos BayCoos Bay, Oregon" → "Coos Bay". */
export function cleanOregonCoast101City(raw: string | null | undefined): string {
  let city = (raw ?? '').trim();
  if (!city) return '';
  city = city.replace(/,\s*Oregon$/i, '').trim();
  // Duplicated banner text: "Coos BayCoos Bay"
  const dup = city.match(/^(.+?)\1$/i);
  if (dup?.[1]) city = dup[1].trim();
  // "Warrenton / Hammond" → primary city
  if (city.includes(' / ')) {
    city = city.split(' / ')[0]?.trim() ?? city;
  }
  return city;
}

/** Normalize sheet grades (unicode minus, compound "A− / B+") to primary token. */
export function normalizeOregonCoast101Grade(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.normalize('NFKC').trim();
  s = s.replace(/[−–—]/g, '-');
  // Drop status suffixes: "B+ — STATUS CHECK"
  s = s.split(/\s+[—-]\s+/)[0]?.trim() ?? s;
  // Primary before slash: "A- / B+"
  s = s.split(/\s*\/\s*/)[0]?.trim() ?? s;
  s = s.replace(/\s+/g, '');
  if (!/^[A-F](\+\+|\+|-)?$/.test(s)) return null;
  return s;
}

export function mapOregonCoast101GradeToPriority(primaryGrade: string): {
  priority: ProspectPriority;
  provisionalGrade: ProvisionalGrade;
} {
  const g = primaryGrade.toUpperCase();
  if (g === 'A++' || g === 'A+' || g === 'A' || g === 'A-') {
    return { priority: 'Tier 1', provisionalGrade: 'A (provisional)' };
  }
  if (g === 'B+' || g === 'B' || g === 'B-') {
    return { priority: 'Tier 2', provisionalGrade: 'B (provisional)' };
  }
  return { priority: 'Tier 3', provisionalGrade: 'C (provisional)' };
}

export function gradeRank(primaryGrade: string): number {
  const order = ['A++', 'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D', 'F'];
  const idx = order.indexOf(primaryGrade.toUpperCase());
  return idx === -1 ? 99 : idx;
}

/** Prefer sheet grade when CRM blank or sheet is stronger (lower rank index). */
export function shouldApplySheetGrade(
  crmPriority: string | null | undefined,
  sheetPrimaryGrade: string,
): boolean {
  if (!crmPriority?.trim()) return true;
  const sheet = mapOregonCoast101GradeToPriority(sheetPrimaryGrade).priority;
  const order: ProspectPriority[] = ['Tier 1', 'Tier 2', 'Tier 3'];
  return order.indexOf(sheet) <= order.indexOf(crmPriority as ProspectPriority);
}

export function normalizeOregonCoast101Phone(value: string | null | undefined): string | null {
  const v = (value ?? '').trim();
  if (!v) return null;
  // "Golf Shop: 503-861-2545" / dual numbers — take first phone-like token
  const match = v.match(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  const digits = (match?.[0] ?? v).replace(/\D/g, '');
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return null;
}

/**
 * Split "Website • email@x.com" / "Website" / "Official website not found • Email not…"
 * into website URL (or null) and email (or null).
 */
export function parseOregonCoast101WebEmail(raw: string | null | undefined): {
  website: string | null;
  email: string | null;
} {
  const v = (raw ?? '').trim();
  if (!v) return { website: null, email: null };

  const emailMatch = v.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const email = emailMatch?.[0]?.toLowerCase() ?? null;

  const noWebsite =
    /website\/email not publicly resolved|official website not found|public email not found|tourism\/business page|corporate website|store page|etsy\/public|contact form|no verified/i.test(
      v,
    );

  let website: string | null = null;
  if (!noWebsite) {
    const withoutEmail = email ? v.replace(emailMatch![0]!, ' ') : v;
    const urlMatch = withoutEmail.match(
      /\b((?:https?:\/\/)?(?:www\.)?[a-z0-9][-a-z0-9.]*\.[a-z]{2,}(?:\/\S*)?)/i,
    );
    if (urlMatch?.[1] && !urlMatch[1].includes('@')) {
      const candidate = urlMatch[1].replace(/[.,;:]+$/, '');
      const host =
        candidate
          .replace(/^https?:\/\//i, '')
          .replace(/^www\./i, '')
          .split('/')[0] ?? '';
      const emailProviders = /^(gmail|yahoo|hotmail|msn|outlook|icloud|aol|me)\.com$/i;
      if (!emailProviders.test(host)) {
        website = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
      }
    }
  }

  return { website, email };
}

/** Extract a person name from contact/verification text when confident enough. */
export function parseOregonCoast101ContactName(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim();
  if (!v) return null;
  if (
    /not publicly|not confidently|not conclusively|unresolved|unspecified|centralized|corporate purchasing|no local|still unresolved|ownership source should be reconfirmed/i.test(
      v,
    ) &&
    !/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/.test(v)
  ) {
    // Still allow leading "First Last — …" patterns below
  }
  if (/centralized (corporate )?purchasing|corporate purchasing path/i.test(v) && !/—/.test(v)) {
    return null;
  }

  // "First Last — Role…" or "First Last - Role"
  const dash = v.match(
    /^([A-Z][a-z]+(?:\s+(?:&|and)\s+[A-Z][a-z]+)?(?:\s+[A-Z]["'a-z]+)+)\s*[—–-]\s*/,
  );
  if (dash?.[1]) {
    const name = dash[1].replace(/\s+/g, ' ').trim();
    if (/owner name|store owner|buyer|purchasing|decision-maker/i.test(name)) return null;
    return name;
  }

  // "First Last & First Last — Owners"
  const ampersand = v.match(/^([A-Z][a-z]+\s+[A-Z][a-z]+\s*&\s*[A-Z][a-z]+\s+[A-Z][a-z]+)\s*[—–-]/);
  if (ampersand?.[1]) return ampersand[1].replace(/\s+/g, ' ').trim();

  return null;
}

const CITATION_PAREN_RE =
  /^(tripadvisor|loc8\s*near\s*me|loc8nearme|bbb|better business bureau|linkedin|alignable|foofs\d*|hardware retailing|merchant maverick|kelli braun|oregon coast today|oregon voyager|discover newport|bizstanding|portland monthly|nextdoor|allbiz|odfw|pony village mall.*|retail pro|restaurantji|visit garibaldi.*|seaside oregon|cannon beach|warrenton oregon|manzanita links|website|yelp|facebook|instagram)$/i;

export function nameFromWhyParen(why: string | null | undefined): string | null {
  const v = (why ?? '').trim();
  if (!v) return null;
  const m = v.match(/\(([^)]+)\)\s*$/);
  const inner = m?.[1]?.trim();
  if (!inner || inner.length < 3) return null;
  if (/^https?:\/\//i.test(inner)) return null;
  if (CITATION_PAREN_RE.test(inner.trim())) return null;
  // Bare city-only citations
  if (
    /^(coos bay|north bend|newport|lincoln city|tillamook|rockaway beach|manzanita|nehalem|wheeler|seaside|gearhart|warrenton|bandon)$/i.test(
      inner.trim(),
    )
  ) {
    return null;
  }
  return inner;
}

export function isUnusableRouteName(name: string, city: string): boolean {
  const n = normalizeProspectName(name);
  const c = normalizeProspectName(city);
  if (!n || n.length < 3) return true;
  if (n === c || n === `${c} oregon`) return true;
  if (CITATION_PAREN_RE.test(name.trim())) return true;
  if (
    /^(website|linkedin|tripadvisor|alignable|restaurantji|visit garibaldi oregon|better business bureau|loc8 near me|loc8nearme|foofs\d*|merchant maverick|kelli braun|oregon coast today|seaside oregon|manzanita links)$/i.test(
      name.trim(),
    )
  ) {
    return true;
  }
  return false;
}

export function externalIdSlug(name: string): string {
  return normalizeProspectName(name).replace(/\s+/g, '-').slice(0, 48) || 'unnamed';
}

export function isBigWheelSkip(name: string): boolean {
  const n = normalizeProspectName(name);
  return n.includes('big wheel general store') || n === 'big wheel';
}

/**
 * Parse Sheet1 CSV rows (arrays of cell strings) into route prospect rows.
 * Stops at Washington section.
 */
export function parseOregonCoast101CsvRows(rows: string[][]): OregonCoast101RouteRow[] {
  let state = '';
  let cityBanner = '';
  const out: OregonCoast101RouteRow[] = [];

  for (const cols of rows) {
    const cells = [...cols];
    while (cells.length < 6) cells.push('');
    const [a0, b0, c0, d0, e0, f0] = cells;
    const a = (a0 ?? '').trim();
    const b = (b0 ?? '').trim();
    const c = (c0 ?? '').trim();
    const d = (d0 ?? '').trim();
    const e = (e0 ?? '').trim();
    const f = (f0 ?? '').trim();

    if (!a && !b && !c && !d && !e && !f) continue;

    if (/^oregon$/i.test(a) && !b && !c) {
      state = 'Oregon';
      continue;
    }
    if (/^washington$/i.test(a) && !b && !c) {
      state = 'Washington';
      continue;
    }
    if (state === 'Washington') break;

    if (/^grade$/i.test(a)) continue;

    if (a && !b && !c && !/^oregon$/i.test(a) && !/^washington$/i.test(a)) {
      cityBanner = a;
      continue;
    }

    const primaryGrade = normalizeOregonCoast101Grade(a);
    if (!primaryGrade || state !== 'Oregon') continue;

    let name = b;
    if (!name) name = nameFromWhyParen(f) ?? '';
    if (!name) continue;

    const city = cleanOregonCoast101City(cityBanner);
    if (!city) continue;
    if (isUnusableRouteName(name, city)) continue;

    const { website, email } = parseOregonCoast101WebEmail(d);
    out.push({
      rawGrade: a,
      primaryGrade,
      name,
      city,
      phone: normalizeOregonCoast101Phone(c),
      website,
      email,
      contactRaw: e || null,
      why: f || null,
      state,
    });
  }

  return out;
}
