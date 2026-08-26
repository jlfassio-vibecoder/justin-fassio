import { generateObject, generateText, gateway, stepCountIs } from 'ai';
import { z } from 'zod';

const EXCERPT_MAX_CHARS = 2000;

export type PublicRoleVerificationStatus = 'verified' | 'partial' | 'not_found';

export type PublicRoleVerificationSignals = {
  personName: boolean;
  company: boolean;
  role: boolean;
  location: boolean;
};

export type PublicRoleVerificationResult = {
  status: PublicRoleVerificationStatus;
  signals: PublicRoleVerificationSignals;
  matchedRole: string | null;
  matchedCompany: string | null;
  excerpt: string | null;
  sourceUrls: string[];
};

export type VerifyPublicContactRoleInput = {
  candidateName: string;
  businessName: string;
  city?: string | null;
  state?: string | null;
  proposedTitle?: string | null;
};

const roleVerificationSchema = z.object({
  status: z.enum(['verified', 'partial', 'not_found']),
  signals: z.object({
    personName: z.boolean(),
    company: z.boolean(),
    role: z.boolean(),
    location: z.boolean(),
  }),
  matchedRole: z
    .string()
    .nullable()
    .describe('Current role/title only when explicitly stated in a public snippet; otherwise null'),
  matchedCompany: z
    .string()
    .nullable()
    .describe(
      'Company/business name only when explicitly stated in a public snippet; otherwise null',
    ),
  sourceUrls: z.array(z.string()).describe('Public search result URLs only — no invented links'),
});

const NOT_FOUND_RESULT: PublicRoleVerificationResult = {
  status: 'not_found',
  signals: { personName: false, company: false, role: false, location: false },
  matchedRole: null,
  matchedCompany: null,
  excerpt: null,
  sourceUrls: [],
};

const STATUS_LABELS: Record<PublicRoleVerificationStatus, string> = {
  verified: 'Verified',
  partial: 'Partial public match',
  not_found: 'Not found',
};

function signalLabels(signals: PublicRoleVerificationSignals): string {
  const labels: string[] = [];
  if (signals.personName) labels.push('person');
  if (signals.company) labels.push('company');
  if (signals.role) labels.push('role');
  if (signals.location) labels.push('location');
  return labels.length > 0 ? labels.join(', ') : 'none';
}

/** Format LinkedIn verification evidence for account_contacts.notes. */
export function formatRoleVerificationNotes(result: PublicRoleVerificationResult): string | null {
  const parts = [`LinkedIn verification: ${STATUS_LABELS[result.status]}`];
  const signals = signalLabels(result.signals);
  if (signals !== 'none') {
    parts.push(`Signals: ${signals}`);
  }
  if (result.matchedRole && result.matchedCompany) {
    parts.push(`Role evidence: ${result.matchedRole} at ${result.matchedCompany}`);
  } else if (result.matchedRole) {
    parts.push(`Role evidence: ${result.matchedRole}`);
  }
  if (result.sourceUrls.length > 0) {
    parts.push(`Sources: ${result.sourceUrls.join(' · ')}`);
  }
  return parts.join('\n');
}

/**
 * Corroborate a named contact's role from public LinkedIn-indexed snippets only.
 * LinkedIn is confirmation, not discovery — caller must supply candidateName.
 */
export async function verifyPublicContactRole(
  input: VerifyPublicContactRoleInput,
): Promise<PublicRoleVerificationResult> {
  const candidateName = input.candidateName.trim();
  const businessName = input.businessName.trim();
  if (!candidateName || !businessName) {
    return NOT_FOUND_RESULT;
  }

  const city = input.city?.trim() || undefined;
  const state = input.state?.trim() || undefined;
  const location = city && state ? `${city}, ${state}` : city;
  const proposedTitle = input.proposedTitle?.trim() || undefined;

  try {
    const searchResult = await generateText({
      model: 'openai/gpt-4o',
      stopWhen: stepCountIs(3),
      tools: {
        perplexity_search: gateway.tools.perplexitySearch({
          maxResults: 5,
        }),
      },
      prompt: [
        'Corroborate whether a named contact holds a role at a specific business using PUBLIC web search snippets only.',
        'LinkedIn is a confirmation layer — do NOT discover new contacts here.',
        'Use public search-indexed LinkedIn snippets and similar results. Never log into LinkedIn or scrape profile HTML.',
        'Search patterns to try:',
        `"${candidateName}" "${businessName}" LinkedIn`,
        `site:linkedin.com/in "${candidateName}" "${businessName}"`,
        location ? `"${candidateName}" "${location}" LinkedIn` : '',
        `Candidate: ${candidateName}`,
        `Business: ${businessName}`,
        location ? `Location: ${location}` : '',
        proposedTitle ? `Discovery title hint (not proof): ${proposedTitle}` : '',
        'Return a short factual summary quoting any public snippets that mention this person, business, role, or location.',
        'If no usable public LinkedIn or web corroboration exists, say not found briefly.',
      ]
        .filter(Boolean)
        .join('\n'),
    });

    const excerpt = searchResult.text.trim().slice(0, EXCERPT_MAX_CHARS);
    if (!excerpt || /not found|no usable|no corroboration|no public linkedin/i.test(excerpt)) {
      return { ...NOT_FOUND_RESULT, excerpt: excerpt || null };
    }

    const parsed = await generateObject({
      model: 'openai/gpt-4o',
      schema: roleVerificationSchema,
      schemaName: 'PublicRoleVerification',
      prompt: [
        'Evaluate public search snippets for LinkedIn role verification only.',
        'Rules:',
        '- verified: snippet independently connects person + company + role (location strengthens)',
        '- partial: name/location suggest a match but company or role is not exposed in the public snippet',
        '- not_found: no usable public corroboration',
        'Set matchedRole and matchedCompany only when explicitly present in snippets — never invent.',
        'sourceUrls: include only URLs explicitly present in the search summary.',
        `Candidate: ${candidateName}`,
        `Business: ${businessName}`,
        location ? `Location: ${location}` : '',
        'Search summary:',
        excerpt,
      ]
        .filter(Boolean)
        .join('\n'),
    });

    return {
      status: parsed.object.status,
      signals: parsed.object.signals,
      matchedRole: parsed.object.matchedRole?.trim() || null,
      matchedCompany: parsed.object.matchedCompany?.trim() || null,
      excerpt,
      sourceUrls: parsed.object.sourceUrls.filter((url) => url.trim().length > 0),
    };
  } catch {
    return NOT_FOUND_RESULT;
  }
}
