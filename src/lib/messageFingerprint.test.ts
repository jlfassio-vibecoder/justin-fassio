import { describe, expect, it } from 'vitest';
import {
  identityFingerprint,
  mappingStatusAfterInbound,
  normalizeIdentityPart,
} from '@/lib/messageFingerprint';

describe('identityFingerprint', () => {
  it('is stable across casing and whitespace', () => {
    const a = identityFingerprint({
      email: 'Sam@Example.com',
      businessName: '  Kelowna   Outfitters ',
      buyerName: 'Sam Buyer',
    });
    const b = identityFingerprint({
      email: 'sam@example.com',
      businessName: 'kelowna outfitters',
      buyerName: 'sam buyer',
    });
    expect(a).toBe(b);
    expect(a).toBe('sam@example.com|kelowna outfitters|sam buyer');
  });

  it('changes when business name changes', () => {
    const a = identityFingerprint({
      email: 'sam@example.com',
      businessName: 'Kelowna Outfitters',
      buyerName: 'Sam Buyer',
    });
    const b = identityFingerprint({
      email: 'sam@example.com',
      businessName: 'Kelowna Outfitters Ltd',
      buyerName: 'Sam Buyer',
    });
    expect(a).not.toBe(b);
  });
});

describe('normalizeIdentityPart', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeIdentityPart('  A   B  ')).toBe('a b');
  });
});

describe('mappingStatusAfterInbound', () => {
  it('keeps confirmed when fingerprint matches', () => {
    expect(
      mappingStatusAfterInbound({
        mappingStatus: 'confirmed',
        confirmedFingerprint: 'a|b|c',
        inboundFingerprint: 'a|b|c',
      }),
    ).toEqual({ mappingStatus: 'confirmed', needsReconfirm: false });
  });

  it('forces suggested when identity fingerprint changes after confirm', () => {
    expect(
      mappingStatusAfterInbound({
        mappingStatus: 'confirmed',
        confirmedFingerprint: 'a|b|c',
        inboundFingerprint: 'a|b-changed|c',
      }),
    ).toEqual({ mappingStatus: 'suggested', needsReconfirm: true });
  });

  it('leaves unmapped alone', () => {
    expect(
      mappingStatusAfterInbound({
        mappingStatus: 'unmapped',
        confirmedFingerprint: null,
        inboundFingerprint: 'x',
      }),
    ).toEqual({ mappingStatus: 'unmapped', needsReconfirm: false });
  });
});
