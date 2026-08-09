import { describe, expect, it } from 'vitest';
import {
  GMAIL_COMPOSE_SCOPE,
  GMAIL_READONLY_SCOPE,
  scopesForPreset,
  scopesIncludeGmailCompose,
  scopesIncludeGmailReadonly,
} from '@/lib/google/config';

describe('google config scopes', () => {
  it('builds identity and gmail_readonly presets', () => {
    expect(scopesForPreset('identity')).toEqual(['openid', 'email', 'profile']);
    expect(scopesForPreset('gmail_readonly')).toContain(GMAIL_READONLY_SCOPE);
    expect(scopesForPreset('gmail_readonly')).toContain('openid');
  });

  it('builds gmail_compose preset with readonly + compose (not gmail.send)', () => {
    const scopes = scopesForPreset('gmail_compose');
    expect(scopes).toContain(GMAIL_READONLY_SCOPE);
    expect(scopes).toContain(GMAIL_COMPOSE_SCOPE);
    expect(scopes).toContain('openid');
    expect(scopes.join(' ')).not.toContain('gmail.send');
  });

  it('detects gmail.readonly in stored scopes', () => {
    expect(scopesIncludeGmailReadonly(['openid', GMAIL_READONLY_SCOPE])).toBe(true);
    expect(scopesIncludeGmailReadonly(['gmail.readonly'])).toBe(true);
    expect(scopesIncludeGmailReadonly(['openid', 'email'])).toBe(false);
  });

  it('detects gmail.compose in stored scopes', () => {
    expect(scopesIncludeGmailCompose(['openid', GMAIL_COMPOSE_SCOPE])).toBe(true);
    expect(scopesIncludeGmailCompose(['gmail.compose'])).toBe(true);
    expect(scopesIncludeGmailCompose([GMAIL_READONLY_SCOPE])).toBe(false);
  });
});
