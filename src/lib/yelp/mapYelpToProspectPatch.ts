import { isDirectoryCitationHost } from '@/lib/companyWebResearch';
import { normalizeYelpPhone } from '@/lib/yelp/businessMatch';
import type { YelpBusiness, YelpPatchSkipReason, YelpProspectPatch } from '@/lib/yelp/types';

export type ProspectPatchInput = {
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  website?: string | null;
};

export type BlankOnlyPatchResult = {
  patch: YelpProspectPatch;
  skipped: Partial<Record<keyof YelpProspectPatch, YelpPatchSkipReason>>;
};

function isBlank(value: string | null | undefined): boolean {
  return !(value ?? '').trim();
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isUsableBusinessWebsite(url: string | null | undefined): string | null {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return null;
  const normalized = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/\//, '')}`;
  const host = hostnameFromUrl(normalized);
  if (!host || isDirectoryCitationHost(host)) return null;
  return normalized;
}

export function buildBlankOnlyProspectPatch(
  prospect: ProspectPatchInput,
  yelp: YelpBusiness,
): BlankOnlyPatchResult {
  const patch: YelpProspectPatch = {};
  const skipped: BlankOnlyPatchResult['skipped'] = {};

  const yelpPhone = normalizeYelpPhone(yelp.phone);
  if (yelpPhone) {
    if (isBlank(prospect.phone)) {
      patch.phone = yelpPhone;
    } else {
      skipped.phone = 'already_populated';
    }
  } else {
    skipped.phone = 'missing_yelp_value';
  }

  const yelpAddress = (yelp.address1 ?? '').trim();
  if (yelpAddress) {
    if (isBlank(prospect.address)) {
      patch.address = yelpAddress;
    } else {
      skipped.address = 'already_populated';
    }
  } else {
    skipped.address = 'missing_yelp_value';
  }

  const yelpCity = (yelp.city ?? '').trim();
  if (yelpCity) {
    if (isBlank(prospect.city)) {
      patch.city = yelpCity;
    } else {
      skipped.city = 'already_populated';
    }
  } else {
    skipped.city = 'missing_yelp_value';
  }

  const yelpPostal = (yelp.postalCode ?? '').trim();
  if (yelpPostal) {
    if (isBlank(prospect.postal_code)) {
      patch.postal_code = yelpPostal;
    } else {
      skipped.postal_code = 'already_populated';
    }
  } else {
    skipped.postal_code = 'missing_yelp_value';
  }

  const businessWebsite = isUsableBusinessWebsite(yelp.businessUrl);
  if (businessWebsite) {
    if (isBlank(prospect.website)) {
      patch.website = businessWebsite;
    } else {
      skipped.website = 'already_populated';
    }
  } else if (yelp.businessUrl) {
    skipped.website = 'directory_url';
  } else {
    skipped.website = 'missing_yelp_value';
  }

  return { patch, skipped };
}
