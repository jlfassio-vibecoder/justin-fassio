import { describe, expect, it } from 'vitest';
import { CONTACT_EMAIL } from '@/data/landing';
import {
  formatOutreachFromHeader,
  isUsableStaffDisplayName,
  OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
  resolveStaffOutreachSenderNames,
} from '@/lib/ogrProductEmailSender';

describe('isUsableStaffDisplayName', () => {
  it('rejects the mailbox local-part of office@justinfassio.com', () => {
    expect(isUsableStaffDisplayName('office', [CONTACT_EMAIL])).toBe(false);
    expect(isUsableStaffDisplayName('Office', [CONTACT_EMAIL])).toBe(false);
    expect(isUsableStaffDisplayName(CONTACT_EMAIL, [CONTACT_EMAIL])).toBe(false);
  });

  it('accepts a real profile display name', () => {
    expect(isUsableStaffDisplayName('Justin Fassio', [CONTACT_EMAIL])).toBe(true);
    expect(isUsableStaffDisplayName('Alex Rivera', ['alex@example.com'])).toBe(true);
  });
});

describe('resolveStaffOutreachSenderNames', () => {
  it('uses full display name for From and first name for signature', () => {
    expect(resolveStaffOutreachSenderNames('Alex Rivera')).toEqual({
      fromDisplayName: 'Alex Rivera',
      signatureName: 'Alex',
    });
  });

  it('collapses whitespace and still prefers the first token for signature', () => {
    expect(resolveStaffOutreachSenderNames('  Sam   Lee  ')).toEqual({
      fromDisplayName: 'Sam Lee',
      signatureName: 'Sam',
    });
  });

  it('falls back to brand when display_name is blank (not a person and not an email local-part)', () => {
    expect(resolveStaffOutreachSenderNames(null)).toEqual({
      fromDisplayName: OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
      signatureName: OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
    });
    expect(resolveStaffOutreachSenderNames('   ')).toEqual({
      fromDisplayName: OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
      signatureName: OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
    });
    expect(OGR_PRODUCT_EMAIL_SENDER_FALLBACK).toBe('Old Guys Rule');
    expect(OGR_PRODUCT_EMAIL_SENDER_FALLBACK.toLowerCase()).not.toContain('office');
    expect(OGR_PRODUCT_EMAIL_SENDER_FALLBACK.toLowerCase()).not.toContain('justin');
  });

  it('rejects handle_new_user local-part seeds like office', () => {
    expect(
      resolveStaffOutreachSenderNames({
        displayName: 'office',
        emails: ['office@justinfassio.com'],
      }),
    ).toEqual({
      fromDisplayName: OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
      signatureName: OGR_PRODUCT_EMAIL_SENDER_FALLBACK,
    });
  });

  it('uses additional auth metadata when display_name is the local-part', () => {
    expect(
      resolveStaffOutreachSenderNames({
        displayName: 'office',
        additionalNames: ['Justin Fassio'],
        emails: ['office@justinfassio.com'],
      }),
    ).toEqual({
      fromDisplayName: 'Justin Fassio',
      signatureName: 'Justin',
    });
  });
});

describe('formatOutreachFromHeader', () => {
  it('formats Display Name <office email>', () => {
    expect(formatOutreachFromHeader('Alex Rivera')).toBe(`Alex Rivera <${CONTACT_EMAIL}>`);
  });

  it('never emits a bare address or office local-part display name', () => {
    expect(formatOutreachFromHeader('office', CONTACT_EMAIL)).toBe(
      `Old Guys Rule <${CONTACT_EMAIL}>`,
    );
    expect(formatOutreachFromHeader('', CONTACT_EMAIL)).toBe(`Old Guys Rule <${CONTACT_EMAIL}>`);
    expect(formatOutreachFromHeader('office')).not.toMatch(/^office\s*</i);
  });

  it('quotes names that need escaping', () => {
    expect(formatOutreachFromHeader('Alex "A" Rivera', CONTACT_EMAIL)).toBe(
      `"Alex \\"A\\" Rivera" <${CONTACT_EMAIL}>`,
    );
  });
});
