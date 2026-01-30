import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(key, 'hex');
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:encrypted (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  // Detect format: hex (iv:enc:tag) vs base64 (iv:tag:enc)
  // Hex tokens have iv of 24 hex chars (12 bytes), base64 tokens have iv of 24 b64 chars (16+ bytes)
  const isHex = /^[0-9a-f]+$/i.test(parts[0]);

  let iv: Buffer, tag: Buffer, encrypted: Buffer;

  if (isHex) {
    // Format: iv:encrypted:tag (all hex)
    const [ivHex, encHex, tagHex] = parts;
    iv = Buffer.from(ivHex, 'hex');
    tag = Buffer.from(tagHex, 'hex');
    encrypted = Buffer.from(encHex, 'hex');
  } else {
    // Format: iv:tag:encrypted (all base64)
    const [ivB64, tagB64, encB64] = parts;
    iv = Buffer.from(ivB64, 'base64');
    tag = Buffer.from(tagB64, 'base64');
    encrypted = Buffer.from(encB64, 'base64');
  }

  if (tag.length !== TAG_LENGTH) {
    throw new Error('Invalid auth tag');
  }

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
