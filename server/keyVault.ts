import crypto from 'crypto';
import { getMasterKey } from './security.js';

export interface SealedKey {
  ciphertext: string; // base64
  iv: string;         // hex
  authTag: string;    // hex
  algorithm: string;
  curve: string;
  userId?: string;
  createdAt: string;
}

export interface GeneratedUserKeys {
  publicKeyEcc: string;
  privateKeyEnc: string;
}

/**
 * Derives a dedicated key-vault AES-256 encryption key from MASTER_KEY
 * using HKDF (RFC 5869).
 */
export function deriveKeyVaultKey(context: string = 'fedtrustmed_ecc_keyvault'): Buffer {
  const masterKey = getMasterKey();
  return Buffer.from(
    crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(context, 'utf-8'), 32)
  );
}

/**
 * Generates an ECC P-256 (prime256v1) key pair.
 * Returns public key in SPKI PEM and private key in PKCS#8 PEM.
 */
export function generateEccKeyPair(): { publicKeyPem: string; privateKeyPem: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Seals a private key string under MASTER_KEY using AES-256-GCM.
 * Optional userId binds the sealed key to the specific user via Authenticated Additional Data (AAD).
 */
export function sealPrivateKey(privateKeyPem: string, userId?: string): string {
  if (!privateKeyPem || typeof privateKeyPem !== 'string') {
    throw new TypeError('Private key PEM must be a non-empty string');
  }

  const encKey = deriveKeyVaultKey();
  // 12-byte IV for AES-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);

  if (userId) {
    cipher.setAAD(Buffer.from(`user_ecc_key:${userId}`, 'utf-8'));
  }

  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(privateKeyPem, 'utf-8')),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const payload: SealedKey = {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    algorithm: 'AES-256-GCM',
    curve: 'prime256v1',
    userId,
    createdAt: new Date().toISOString(),
  };

  return JSON.stringify(payload);
}

/**
 * Unseals (decrypts) a sealed private key payload using MASTER_KEY.
 * Verifies ciphertext authenticity tag and optional user AAD binding.
 */
export function unsealPrivateKey(sealed: string | SealedKey, userId?: string): string {
  const payload: SealedKey = typeof sealed === 'string' ? JSON.parse(sealed) : sealed;
  if (!payload || !payload.ciphertext || !payload.iv || !payload.authTag) {
    throw new Error('Invalid sealed key payload: missing ciphertext, iv, or authTag');
  }

  const encKey = deriveKeyVaultKey();
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, iv);
  const targetUserId = userId || payload.userId;
  if (targetUserId) {
    decipher.setAAD(Buffer.from(`user_ecc_key:${targetUserId}`, 'utf-8'));
  }
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf-8');
}

/**
 * Generates an ECC P-256 key pair for a user and seals the private key under MASTER_KEY.
 * Returns public key in PEM format and private key sealed with AES-256-GCM.
 */
export function generateAndSealUserKeys(userId: string): GeneratedUserKeys {
  const { publicKeyPem, privateKeyPem } = generateEccKeyPair();
  const privateKeyEnc = sealPrivateKey(privateKeyPem, userId);
  return {
    publicKeyEcc: publicKeyPem,
    privateKeyEnc,
  };
}

// Export alias for backward compatibility
export const generateUserKeys = generateAndSealUserKeys;
