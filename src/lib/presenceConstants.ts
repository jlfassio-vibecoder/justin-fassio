/** Client-safe presence constants (no Node crypto). */

export const PRESENCE_VISIT_QUERY_PARAM = 'vt';
export const PRESENCE_COOKIE_NAME = 'jf_presence';
/** Call today treats presence as Active within this window. */
export const PRESENCE_ACTIVE_WINDOW_MS = 5 * 60 * 1000;
/** Cookie / claim lifetime (90 days). */
export const PRESENCE_CLAIM_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Visit-token lifetime when stamped on outreach links (90 days). */
export const PRESENCE_VISIT_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;
