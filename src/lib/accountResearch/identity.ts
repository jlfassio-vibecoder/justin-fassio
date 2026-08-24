import { isSharedDirectoryHost } from '@/lib/companyWebResearch';
import { hostnameFromUrl } from '@/lib/enrichGuidance';
import { hasConflictingGeography } from '@/lib/accountResearch/socialProfile';
import type { AccountResearchIdentityConfidence } from '@/types/database';

export type IdentityCorroborator =
  'website_match' | 'city_match' | 'region_match' | 'phone_match' | 'name_on_host';

export type IdentityResolutionInput = {
  businessName: string;
  city?: string | null;
  region?: string | null;
  phone?: string | null;
  website?: string | null;
  /** Hostname observed on official-domain evidence (optional). */
  evidenceOfficialHostname?: string | null;
  /** Text blobs from official-host pages used for corroboration. */
  officialHostEvidenceText?: string | null;
  /** True when evidence points at a same-name business in a different city. */
  conflictingCityEvidence?: boolean;
};

export type IdentityResolution = {
  identity_confidence: AccountResearchIdentityConfidence;
  identity_review_status: 'not_required' | 'pending';
  resolved_website: string | null;
  identity_resolution: string | null;
  official_hostname: string | null;
  corroborators: IdentityCorroborator[];
};

function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
}

function includesNormalized(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.trim().toLowerCase());
}

function strongNameMatch(text: string, businessName: string): boolean {
  const name = businessName.trim().toLowerCase();
  if (name.length < 3) return false;
  const compact = text.toLowerCase();
  if (compact.includes(name)) return true;
  const tokens = name.split(/\s+/).filter((t) => t.length > 2);
  if (tokens.length === 0) return false;
  const hit = tokens.filter((t) => compact.includes(t)).length;
  return hit >= Math.ceil(tokens.length * 0.6);
}

/**
 * Pure identity ladder. Model confidence alone is never sufficient for `high`.
 */
export function resolveAccountIdentity(input: IdentityResolutionInput): IdentityResolution {
  const prospectHost = input.website ? hostnameFromUrl(input.website) : null;
  const evidenceHost = input.evidenceOfficialHostname
    ? input.evidenceOfficialHostname.toLowerCase().replace(/^www\./, '')
    : null;

  const officialHostname =
    (prospectHost && !isSharedDirectoryHost(prospectHost) ? prospectHost : null) ??
    (evidenceHost && !isSharedDirectoryHost(evidenceHost) ? evidenceHost : null);

  const corroborators: IdentityCorroborator[] = [];
  const evidenceText = (input.officialHostEvidenceText ?? '').trim();

  if (prospectHost && officialHostname && prospectHost === officialHostname) {
    corroborators.push('website_match');
  }

  if (input.conflictingCityEvidence) {
    return {
      identity_confidence: 'low',
      identity_review_status: 'pending',
      resolved_website: officialHostname ? `https://${officialHostname}` : null,
      identity_resolution: 'Same-name evidence conflicts with prospect city',
      official_hostname: officialHostname,
      corroborators,
    };
  }

  if (evidenceText && hasConflictingGeography(evidenceText)) {
    return {
      identity_confidence: 'low',
      identity_review_status: 'pending',
      resolved_website: officialHostname ? `https://${officialHostname}` : null,
      identity_resolution: 'Evidence conflicts with prospect geography',
      official_hostname: officialHostname,
      corroborators,
    };
  }

  if (!officialHostname) {
    return {
      identity_confidence: 'unresolved',
      identity_review_status: 'pending',
      resolved_website: null,
      identity_resolution: 'No usable official website hostname',
      official_hostname: null,
      corroborators,
    };
  }

  if (evidenceText) {
    if (input.city?.trim() && includesNormalized(evidenceText, input.city)) {
      corroborators.push('city_match');
    }
    if (input.region?.trim() && includesNormalized(evidenceText, input.region)) {
      corroborators.push('region_match');
    }
    const phoneDigits = normalizePhoneDigits(input.phone);
    if (phoneDigits && evidenceText.replace(/\D/g, '').includes(phoneDigits.slice(-7))) {
      corroborators.push('phone_match');
    }
    if (strongNameMatch(evidenceText, input.businessName)) {
      corroborators.push('name_on_host');
    }
  }

  const hasWebsiteAgreement =
    Boolean(prospectHost) &&
    !isSharedDirectoryHost(prospectHost) &&
    prospectHost === officialHostname;

  const extraCorroborators = corroborators.filter((c) => c !== 'website_match');
  const hasNameOrCity =
    corroborators.includes('name_on_host') || corroborators.includes('city_match');

  if (hasNameOrCity || (hasWebsiteAgreement && extraCorroborators.length >= 1)) {
    return {
      identity_confidence: 'high',
      identity_review_status: 'not_required',
      resolved_website: `https://${officialHostname}`,
      identity_resolution: `Official host ${officialHostname} with corroborators: ${corroborators.join(', ') || 'name/city on evidence'}`,
      official_hostname: officialHostname,
      corroborators,
    };
  }

  if (hasWebsiteAgreement || extraCorroborators.length >= 1) {
    return {
      identity_confidence: 'medium',
      identity_review_status: 'pending',
      resolved_website: `https://${officialHostname}`,
      identity_resolution: hasWebsiteAgreement
        ? 'Official host matches CRM website but lacks location/phone/name corroboration'
        : 'Likely official host with weak CRM website agreement',
      official_hostname: officialHostname,
      corroborators,
    };
  }

  if (isSharedDirectoryHost(prospectHost) || isSharedDirectoryHost(evidenceHost)) {
    return {
      identity_confidence: 'low',
      identity_review_status: 'pending',
      resolved_website: null,
      identity_resolution: 'Only directory/shared hosts available; not operational identity proof',
      official_hostname: null,
      corroborators,
    };
  }

  return {
    identity_confidence: 'low',
    identity_review_status: 'pending',
    resolved_website: officialHostname ? `https://${officialHostname}` : null,
    identity_resolution: 'Weak identity signals',
    official_hostname: officialHostname,
    corroborators,
  };
}
