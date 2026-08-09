import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenCryptoError';
  }
}

function resolveKey(keyBase64: string | undefined): Buffer {
  if (!keyBase64 || !keyBase64.trim()) {
    throw new TokenCryptoError('GOOGLE_TOKEN_ENCRYPTION_KEY is not configured');
  }
  let key: Buffer;
  try {
    key = Buffer.from(keyBase64.trim(), 'base64');
  } catch {
    throw new TokenCryptoError('GOOGLE_TOKEN_ENCRYPTION_KEY must be valid base64');
  }
  if (key.length !== KEY_BYTES) {
    throw new TokenCryptoError(
      `GOOGLE_TOKEN_ENCRYPTION_KEY must decode to ${KEY_BYTES} bytes (use: openssl rand -base64 32)`,
    );
  }
  return key;
}

/** Encrypt a refresh token for database storage. Never log the plaintext. */
export function encryptRefreshToken(plaintext: string, keyBase64?: string): string {
  if (!plaintext) {
    throw new TokenCryptoError('Refresh token plaintext is required');
  }
  const key = resolveKey(keyBase64 ?? import.meta.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/** Decrypt a stored refresh token. Never log the plaintext or ciphertext. */
export function decryptRefreshToken(ciphertext: string, keyBase64?: string): string {
  if (!ciphertext || !ciphertext.startsWith(PREFIX)) {
    throw new TokenCryptoError('Invalid refresh token ciphertext');
  }
  const key = resolveKey(keyBase64 ?? import.meta.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  let packed: Buffer;
  try {
    packed = Buffer.from(ciphertext.slice(PREFIX.length), 'base64');
  } catch {
    throw new TokenCryptoError('Invalid refresh token ciphertext encoding');
  }
  if (packed.length < IV_BYTES + TAG_BYTES + 1) {
    throw new TokenCryptoError('Invalid refresh token ciphertext length');
  }
  const iv = packed.subarray(0, IV_BYTES);
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const encrypted = packed.subarray(IV_BYTES + TAG_BYTES);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    throw new TokenCryptoError('Failed to decrypt refresh token');
  }
}
