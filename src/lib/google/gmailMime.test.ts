import { describe, expect, it } from 'vitest';
import {
  buildGmailRawMessage,
  buildReplyAllRecipients,
  buildRfc2822Message,
  chainReferences,
  encodeGmailRaw,
  extractEmailAddress,
  normalizeSubjectForReply,
} from '@/lib/google/gmailMime';

describe('gmailMime', () => {
  it('builds RFC 2822 headers and plain body', () => {
    const raw = buildRfc2822Message({
      to: ['a@example.com'],
      cc: ['b@example.com'],
      subject: 'Hello',
      bodyText: 'Line one\nLine two',
      inReplyTo: '<msg1@mail>',
      references: '<msg0@mail> <msg1@mail>',
    });
    expect(raw).toContain('To: a@example.com');
    expect(raw).toContain('Cc: b@example.com');
    expect(raw).toContain('Subject: Hello');
    expect(raw).toContain('In-Reply-To: <msg1@mail>');
    expect(raw).toContain('References: <msg0@mail> <msg1@mail>');
    expect(raw).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(raw).toContain('Line one\r\nLine two');
  });

  it('encodes base64url raw without padding', () => {
    const encoded = encodeGmailRaw('hi');
    expect(encoded).not.toMatch(/[+/=]/);
    expect(buildGmailRawMessage({ to: ['a@example.com'], subject: 'S', bodyText: 'B' })).toMatch(
      /^[A-Za-z0-9_-]+$/,
    );
  });

  it('adds Re: when missing', () => {
    expect(normalizeSubjectForReply('Hello')).toBe('Re: Hello');
    expect(normalizeSubjectForReply('Re: Hello')).toBe('Re: Hello');
    expect(normalizeSubjectForReply('re: already')).toBe('re: already');
  });

  it('trims self from reply-all recipients', () => {
    const result = buildReplyAllRecipients({
      fromHeader: 'Alice <alice@example.com>',
      toHeader: 'Me <me@example.com>, Bob <bob@example.com>',
      ccHeader: 'Carol <carol@example.com>, me@example.com',
      selfEmail: 'me@example.com',
    });
    expect(result.to).toEqual(['alice@example.com', 'bob@example.com']);
    expect(result.cc).toEqual(['carol@example.com']);
  });

  it('extracts email addresses', () => {
    expect(extractEmailAddress('Name <x@y.com>')).toBe('x@y.com');
    expect(extractEmailAddress('bad')).toBeNull();
  });

  it('chains References', () => {
    expect(chainReferences('<a@x>', '<b@x>')).toBe('<a@x> <b@x>');
    expect(chainReferences('<a@x> <b@x>', '<b@x>')).toBe('<a@x> <b@x>');
  });
});
