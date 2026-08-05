/** Normalize SKU strings for OCR matching (O/0, I/1, common suffixes). */

const KNOWN_SUFFIXES = ['-GM', '-S', '-LS', '-T', '-ZH', '-SPF'] as const;

export function normalizeSku(raw: string): string {
  let s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (s.startsWith('0G')) s = `OG${s.slice(2)}`;
  // After OG prefix, treat letter O as zero and I/l as one in the numeric body
  const m = /^OG(.+)$/.exec(s);
  if (m) {
    const body = m[1]!.replace(/O/g, '0').replace(/[IL]/g, '1');
    s = `OG${body}`;
  }
  return s;
}

/** Suggest possible corrections when OCR may have dropped a suffix. */
export function skuSuffixCandidates(sku: string): string[] {
  const base = normalizeSku(sku);
  const out = [base];
  for (const suffix of KNOWN_SUFFIXES) {
    if (!base.endsWith(suffix)) out.push(`${base}${suffix}`);
  }
  return out;
}

export function skusMatch(a: string, b: string): boolean {
  const na = normalizeSku(a);
  const nb = normalizeSku(b);
  if (na === nb) return true;
  return skuSuffixCandidates(na).includes(nb) || skuSuffixCandidates(nb).includes(na);
}
