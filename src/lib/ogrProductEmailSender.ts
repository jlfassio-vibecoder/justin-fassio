import { CONTACT_EMAIL } from '@/data/landing';

/** Clean multi-rep fallback when staff profile has no usable display_name. */
export const OGR_PRODUCT_EMAIL_SENDER_FALLBACK = 'Old Guys Rule';

export type StaffOutreachSenderNames = {
  /** From header display name (full profile display_name when present). */
  fromDisplayName: string;
  /** Body signature — first name when available, else the same fallback. */
  signatureName: string;
};

export type ResolveStaffOutreachSenderNamesInput = {
  displayName?: string | null;
  /** Extra candidates (auth user_metadata). First usable wins after displayName. */
  additionalNames?: Array<string | null | undefined>;
  /** Emails whose local-part must never be used as a visible name. */
  emails?: Array<string | null | undefined>;
};

function emailLocalPart(email: string | null | undefined): string | null {
  const trimmed = (email ?? '').trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) return null;
  const local = trimmed.split('@')[0]?.trim() ?? '';
  return local || null;
}

/**
 * True when a candidate is a real person/brand name, not an email or mailbox local-part.
 */
export function isUsableStaffDisplayName(
  value: string | null | undefined,
  emails: Array<string | null | undefined> = [],
): boolean {
  const name = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return false;
  if (name.includes('@')) return false;
  const normalized = name.toLowerCase();
  const emailsToCheck = [...emails, CONTACT_EMAIL];
  for (const email of emailsToCheck) {
    const local = emailLocalPart(email);
    if (local && normalized === local) return false;
    const full = (email ?? '').trim().toLowerCase();
    if (full && normalized === full) return false;
  }
  return true;
}

function firstUsableName(
  candidates: Array<string | null | undefined>,
  emails: Array<string | null | undefined>,
): string {
  for (const candidate of candidates) {
    const name = (candidate ?? '').trim().replace(/\s+/g, ' ');
    if (isUsableStaffDisplayName(name, emails)) return name;
  }
  return OGR_PRODUCT_EMAIL_SENDER_FALLBACK;
}

/**
 * Resolve visible sender names from the authenticated staff profile.
 * Never derives identity from an email local-part and never hardcodes a person.
 */
export function resolveStaffOutreachSenderNames(
  displayNameOrInput: string | null | undefined | ResolveStaffOutreachSenderNamesInput,
  emails?: Array<string | null | undefined>,
): StaffOutreachSenderNames {
  const input: ResolveStaffOutreachSenderNamesInput =
    displayNameOrInput && typeof displayNameOrInput === 'object'
      ? displayNameOrInput
      : { displayName: displayNameOrInput, emails };

  const full = firstUsableName(
    [input.displayName, ...(input.additionalNames ?? [])],
    input.emails ?? [],
  );
  if (full === OGR_PRODUCT_EMAIL_SENDER_FALLBACK) {
    return {
      fromDisplayName: full,
      signatureName: full,
    };
  }
  const first = full.split(' ')[0] ?? full;
  return {
    fromDisplayName: full,
    signatureName: first,
  };
}

/**
 * Format `Display Name <email>` for Resend. Always includes a display name
 * so Resend cannot synthesize one from the mailbox local-part (`office`).
 */
export function formatOutreachFromHeader(
  displayName: string,
  email: string = CONTACT_EMAIL,
): string {
  const addr = email.trim() || CONTACT_EMAIL;
  const name = isUsableStaffDisplayName(displayName, [addr])
    ? displayName.trim().replace(/\s+/g, ' ')
    : OGR_PRODUCT_EMAIL_SENDER_FALLBACK;
  if (/[",\\<>]/.test(name)) {
    const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}" <${addr}>`;
  }
  return `${name} <${addr}>`;
}
