import { describe, expect, it } from 'vitest';
import {
  CALENDAR_EVENTS_OWNED_SCOPE,
  GMAIL_COMPOSE_SCOPE,
  GMAIL_READONLY_SCOPE,
  scopesForPreset,
  scopesIncludeCalendarEvents,
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

  it('builds calendar_events preset with owned events scope (not full calendar)', () => {
    const scopes = scopesForPreset('calendar_events');
    expect(scopes).toContain(CALENDAR_EVENTS_OWNED_SCOPE);
    expect(scopes).toContain('openid');
    expect(scopes.some((s) => s.endsWith('/auth/calendar'))).toBe(false);
    expect(scopes).not.toContain('https://www.googleapis.com/auth/calendar.events');
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

  it('detects calendar.events.owned in stored scopes', () => {
    expect(scopesIncludeCalendarEvents(['openid', CALENDAR_EVENTS_OWNED_SCOPE])).toBe(true);
    expect(scopesIncludeCalendarEvents(['calendar.events.owned'])).toBe(true);
    expect(scopesIncludeCalendarEvents(['https://www.googleapis.com/auth/calendar.events'])).toBe(
      false,
    );
  });
});
