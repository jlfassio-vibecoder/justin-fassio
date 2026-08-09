import { describe, expect, it } from 'vitest';
import {
  GMAIL_READONLY_SCOPE,
  scopesForPreset,
  scopesIncludeGmailReadonly,
} from '@/lib/google/config';

describe('google config scopes', () => {
  it('builds identity and gmail_readonly presets', () => {
    expect(scopesForPreset('identity')).toEqual(['openid', 'email', 'profile']);
    expect(scopesForPreset('gmail_readonly')).toContain(GMAIL_READONLY_SCOPE);
    expect(scopesForPreset('gmail_readonly')).toContain('openid');
  });

  it('detects gmail.readonly in stored scopes', () => {
    expect(scopesIncludeGmailReadonly(['openid', GMAIL_READONLY_SCOPE])).toBe(true);
    expect(scopesIncludeGmailReadonly(['gmail.readonly'])).toBe(true);
    expect(scopesIncludeGmailReadonly(['openid', 'email'])).toBe(false);
  });
});
