import crypto from 'crypto';
import { env } from '../config/env.js';

// AES-256-GCM symmetric encryption for OAuth tokens at rest.
// Format on disk: base64( iv(12) || authTag(16) || ciphertext )
// The optional `label` arg is accepted for compatibility with imported code that
// passes a domain hint (e.g., "facebook"); we ignore it and use one global key.

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  // Accept hex (64 chars) or raw (32 bytes). If hex, decode; otherwise assume utf8.
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const buf = Buffer.from(raw, 'utf8');
  if (buf.length === 32) return buf;
  if (buf.length > 32) return buf.subarray(0, 32);
  // Pad with SHA-256 to derive a stable 32-byte key from a shorter secret.
  return crypto.createHash('sha256').update(buf).digest();
}

const KEY = getKey();

export function encryptToken(plaintext, _label) {
  if (plaintext == null) return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptToken(ciphertext, _label) {
  if (!ciphertext) return null;
  try {
    const buf = Buffer.from(ciphertext, 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
