import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptRefreshToken,
  encryptRefreshToken,
  TokenCryptoError,
} from '@/lib/google/tokenCrypto';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');

describe('tokenCrypto', () => {
  it('round-trips a refresh token', () => {
    const plaintext = '1//refresh-token-sample';
    const ciphertext = encryptRefreshToken(plaintext, KEY);
    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(ciphertext).not.toContain(plaintext);
    expect(decryptRefreshToken(ciphertext, KEY)).toBe(plaintext);
  });

  it('rejects invalid ciphertext', () => {
    expect(() => decryptRefreshToken('not-valid', KEY)).toThrow(TokenCryptoError);
    expect(() => decryptRefreshToken('v1:@@@', KEY)).toThrow(TokenCryptoError);
  });

  it('rejects wrong key / tampered payload', () => {
    const ciphertext = encryptRefreshToken('secret-token', KEY);
    expect(() => decryptRefreshToken(ciphertext, OTHER_KEY)).toThrow(TokenCryptoError);
    const tampered = ciphertext.slice(0, -2) + 'aa';
    expect(() => decryptRefreshToken(tampered, KEY)).toThrow(TokenCryptoError);
  });

  it('rejects undersized encryption keys', () => {
    expect(() => encryptRefreshToken('x', Buffer.from('short').toString('base64'))).toThrow(
      TokenCryptoError,
    );
  });
});
