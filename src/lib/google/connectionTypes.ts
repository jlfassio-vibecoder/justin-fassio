/** Safe, browser-facing connection status — never includes tokens. */
export type GoogleConnectionStatusValue = 'active' | 'revoked' | 'error';

export type GoogleConnectionPublic = {
  connected: boolean;
  googleEmail: string | null;
  status: GoogleConnectionStatusValue | null;
  scopes: string[];
  /** True when stored scopes include gmail.readonly (Phase B). */
  hasGmailReadonly: boolean;
  /** True when stored scopes include gmail.compose (Phase C). */
  hasGmailCompose: boolean;
};
