import { describe, expect, it } from 'vitest';
import {
  assertNoSecretsInPublic,
  toPublicConnection,
  type GoogleConnectionRow,
} from '@/lib/google/tokenStore';

const row: GoogleConnectionRow = {
  id: 'conn-1',
  profile_id: 'profile-1',
  google_sub: 'google-sub-1',
  google_email: 'staff@example.com',
  refresh_token_ciphertext: 'v1:SECRET_CIPHERTEXT',
  scopes: ['openid', 'email', 'profile'],
  status: 'active',
  created_at: '2026-08-09T00:00:00.000Z',
  updated_at: '2026-08-09T00:00:00.000Z',
};

describe('tokenStore public mapping', () => {
  it('maps verified Google identity without secrets', () => {
    const pub = toPublicConnection(row);
    expect(pub).toEqual({
      connected: true,
      googleEmail: 'staff@example.com',
      status: 'active',
      scopes: ['openid', 'email', 'profile'],
      hasGmailReadonly: false,
    });
    expect(JSON.stringify(pub)).not.toContain('SECRET_CIPHERTEXT');
    expect(JSON.stringify(pub)).not.toContain('refresh_token');
    assertNoSecretsInPublic(pub);
  });

  it('returns disconnected when no row', () => {
    expect(toPublicConnection(null)).toEqual({
      connected: false,
      googleEmail: null,
      status: null,
      scopes: [],
      hasGmailReadonly: false,
    });
  });

  it('sets hasGmailReadonly when scope is present', () => {
    const pub = toPublicConnection({
      ...row,
      scopes: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'],
    });
    expect(pub.hasGmailReadonly).toBe(true);
  });
});
