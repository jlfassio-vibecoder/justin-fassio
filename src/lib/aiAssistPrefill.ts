export type AiAssistContextChip = {
  prospectId: number;
  prospectName?: string;
  outcome?: string;
};

export type AiAssistPrefill = {
  chips?: AiAssistContextChip;
  draft?: string;
};

/** Human-readable chip label for the assist modal. */
export function formatAssistChipLabel(chip: AiAssistContextChip): string {
  const name = chip.prospectName?.trim();
  const base = name ? `#${chip.prospectId} · ${name}` : `#${chip.prospectId}`;
  const outcome = chip.outcome?.trim();
  return outcome ? `${base} · ${outcome}` : base;
}

/** Draft composer text from a CRM context chip (user edits/sends; not auto-sent). */
export function buildAssistDraft(chip: AiAssistContextChip): string {
  const name = chip.prospectName?.trim();
  const prospectLabel = name
    ? `prospect ${chip.prospectId} (${name})`
    : `prospect ${chip.prospectId}`;
  const outcome = chip.outcome?.trim();

  if (outcome) {
    return `I just logged outcome "${outcome}" for ${prospectLabel}. Draft a short follow-up email.`;
  }

  return `Summarize ${prospectLabel} call history and suggest next steps.`;
}
