export type AiAssistContextChip = {
  /** Optional for Insights catalog-only opens. */
  prospectId?: number;
  prospectName?: string;
  outcome?: string;
  objectionTags?: string[];
};

export type AiAssistPrefill = {
  chips?: AiAssistContextChip;
  draft?: string;
};

export type CallDraftFormat = 'email' | 'script';

export type AiAssistPrefillLine = {
  multiLineAi?: boolean;
  lineName?: string | null;
};

/** Flag-off copy kept verbatim so existing APF tests stay green. */
function lineRepPhrase(line: AiAssistPrefillLine | undefined, withOgrBrand: boolean): string {
  if (line?.multiLineAi && line.lineName?.trim()) {
    return `a ${line.lineName.trim()} sales rep`;
  }
  return withOgrBrand ? 'a BC wholesale apparel rep (Old Guys Rule)' : 'a BC wholesale apparel rep';
}

function prospectLabel(chip: AiAssistContextChip): string | null {
  if (chip.prospectId == null) return null;
  const name = chip.prospectName?.trim();
  return name ? `prospect ${chip.prospectId} (${name})` : `prospect ${chip.prospectId}`;
}

function feedbackClause(chip: AiAssistContextChip): string {
  const tags = (chip.objectionTags ?? []).map((t) => t.trim()).filter(Boolean);
  if (tags.length === 0) return '';
  return ` Account for buyer feedback: ${tags.map((t) => `"${t}"`).join(', ')}.`;
}

/** Human-readable chip label for the assist modal. */
export function formatAssistChipLabel(chip: AiAssistContextChip): string {
  const parts: string[] = [];
  if (chip.prospectId != null) {
    const name = chip.prospectName?.trim();
    parts.push(name ? `#${chip.prospectId} · ${name}` : `#${chip.prospectId}`);
  }
  const outcome = chip.outcome?.trim();
  if (outcome) parts.push(outcome);
  const tags = (chip.objectionTags ?? []).map((t) => t.trim()).filter(Boolean);
  if (tags.length > 0) parts.push(tags.join(', '));
  return parts.length > 0 ? parts.join(' · ') : 'Context';
}

/**
 * Outcome → email or call-script composer draft.
 * Prefer prospect id/name; include objection tags when present.
 */
export function buildCallDraft(
  chip: AiAssistContextChip,
  format: CallDraftFormat = 'email',
  line?: AiAssistPrefillLine,
): string {
  const outcome = chip.outcome?.trim() || 'a recent call';
  const label = prospectLabel(chip);
  const scope = label ? ` for ${label}` : '';
  const feedback = feedbackClause(chip);
  const ground = label
    ? ' Use CRM tools for store/call facts; do not invent store details.'
    : ' Do not invent store details.';

  if (format === 'script') {
    return `I just logged outcome "${outcome}"${scope}.${feedback} Draft a 30–60 second phone or in-person talk track for ${lineRepPhrase(line, true)}. Match tone to the outcome.${ground}`;
  }

  return `I just logged outcome "${outcome}"${scope}.${feedback} Draft a short follow-up email (subject + body) for ${lineRepPhrase(line, true)}. Match tone to the outcome.${ground}`;
}

/** Draft composer text from a CRM context chip (user edits/sends; not auto-sent). */
export function buildAssistDraft(chip: AiAssistContextChip, line?: AiAssistPrefillLine): string {
  const label = prospectLabel(chip);
  const outcome = chip.outcome?.trim();

  if (outcome && label) {
    return buildCallDraft(chip, 'email', line);
  }

  if (label) {
    return `Summarize ${label} call history and suggest next steps.`;
  }

  return `Help me coach through a recent buyer objection for ${lineRepPhrase(line, false)}.`;
}

/** Objection-coach draft from tags (+ optional prospect). */
export function buildObjectionDraft(chip: AiAssistContextChip, line?: AiAssistPrefillLine): string {
  const tags = (chip.objectionTags ?? []).map((t) => t.trim()).filter(Boolean);
  const tagPhrase =
    tags.length === 0
      ? 'buyer feedback'
      : tags.length === 1
        ? `buyer feedback "${tags[0]}"`
        : `buyer feedback: ${tags.map((t) => `"${t}"`).join(', ')}`;
  const label = prospectLabel(chip);
  const scope = label ? ` for ${label}` : '';
  const ground = label
    ? ' Ground in recent call tags if available via tools; do not invent store facts.'
    : ' Do not invent store facts.';

  return `Help me handle ${tagPhrase}${scope}. Give 2-3 short talk tracks for ${lineRepPhrase(line, false)}.${ground}`;
}

/**
 * Prospects Suggest draft: CRM-grounded summary + numbered follow-ups.
 * Prefer prospect id; falls back to a generic prompt if missing.
 */
export function buildSuggestDraft(chip: AiAssistContextChip, line?: AiAssistPrefillLine): string {
  const label = prospectLabel(chip);
  if (!label) {
    return `Summarize a prospect call history and give 3–5 concrete next follow-up actions as a numbered list for ${lineRepPhrase(line, false)}. Use CRM tools when a prospect id is available; do not invent store facts.`;
  }
  return `For ${label}, use CRM tools to load the store and recent calls. Write a short call-history summary, then give 3–5 concrete next follow-up actions as a numbered list for ${lineRepPhrase(line, true)}. Do not invent store facts.`;
}

/**
 * Prospects APF Brief draft: fit score, background, and walk-in script via getAccountProductFit.
 */
export function buildApfDraft(chip: AiAssistContextChip, line?: AiAssistPrefillLine): string {
  const label = prospectLabel(chip);
  const lineHint = line?.multiLineAi
    ? line.lineName?.trim()
      ? `${line.lineName.trim()} line only — do not default to another line's catalog`
      : 'the current sales line only — do not default to another line'
    : 'default Old Guys Rule / ogr line';
  if (!label) {
    return `Prepare an account-product-fit brief for a prospect: call getAccountProductFit with a prospect id (${lineHint}), then reply with Fit score (1–10) + rationale, a 2–3 sentence Background, and an Initial call/walk-in script (Opener, Product Anchor citing 1–2 real catalog items, CTA). Do not invent store or catalog facts.`;
  }
  return `For ${label}, call getAccountProductFit (${lineHint}). Reply with: (1) Fit score (1–10) and short rationale from category/region/fit vs catalog; (2) Background — 2–3 sentences on store positioning; (3) Initial call/walk-in script with Opener, Product Anchor (1–2 real SKUs/names from the tool), and CTA. Do not invent store or catalog facts.`;
}
