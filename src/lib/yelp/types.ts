/** Normalized Yelp business DTO (decoupled from raw Fusion API JSON). */
export type YelpBusiness = {
  id: string;
  name: string;
  /** Yelp business alias for yelp.com/biz/{alias} URLs. */
  alias: string | null;
  /** Yelp listing page URL. */
  url: string;
  phone: string | null;
  address1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** Official business website when Yelp exposes one (not the Yelp listing URL). */
  businessUrl: string | null;
  categories: string[];
  isClaimed: boolean | null;
  reviewCount: number | null;
  rating: number | null;
};

export type YelpMatchConfidence = 'high' | 'medium' | 'low';

export type YelpMatchMethod = 'business_match' | 'business_search';

export type YelpMatchResult = {
  business: YelpBusiness;
  confidence: YelpMatchConfidence;
  matchMethod: YelpMatchMethod;
  score: number;
  reasons: string[];
  /** Raw Yelp candidates scored before picking the best match. */
  candidateCount: number;
  /** Scored candidates that remain plausible after filtering mismatches. */
  viableCandidateCount: number;
};

/** Blank-only prospect scalar patch from Yelp directory data. */
export type YelpProspectPatch = {
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  website?: string;
};

export type YelpProspectMatchInput = {
  name: string;
  address?: string | null;
  city?: string | null;
  postalCode?: string | null;
  phone?: string | null;
};

export type YelpPatchSkipReason = 'already_populated' | 'directory_url' | 'missing_yelp_value';
