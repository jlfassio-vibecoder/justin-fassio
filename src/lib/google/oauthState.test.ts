import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOAuthState, OAuthStateError, verifyOAuthState } from '@/lib/google/oauthState';

describe('oauthState', () => {
  beforeEach(() => {
    vi.stubEnv('GOOGLE_TOKEN_ENCRYPTION_KEY', randomBytes(32).toString('base64'));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates and verifies a state token for a profile', () => {
    const state = createOAuthState('profile-1', 1_000_000);
    const payload = verifyOAuthState(state, 'profile-1', 1_000_100);
    expect(payload.profileId).toBe('profile-1');
    expect(payload.nonce).toBeTruthy();
    expect(payload.exp).toBeGreaterThan(1_000_000);
  });

  it('rejects expired state', () => {
    const state = createOAuthState('profile-1', 1_000_000);
    expect(() => verifyOAuthState(state, undefined, 1_000_000 + 11 * 60 * 1000)).toThrow(
      OAuthStateError,
    );
  });

  it('rejects tampered state', () => {
    const state = createOAuthState('profile-1');
    const [body] = state.split('.');
    expect(() => verifyOAuthState(`${body}.deadbeef`)).toThrow(OAuthStateError);
  });

  it('rejects profile mismatch when expected', () => {
    const state = createOAuthState('profile-1');
    expect(() => verifyOAuthState(state, 'other-profile')).toThrow(OAuthStateError);
  });

  it('rejects missing state', () => {
    expect(() => verifyOAuthState('')).toThrow(OAuthStateError);
  });
});
