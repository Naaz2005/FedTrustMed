import crypto from 'crypto';
import { getMasterKey } from './security.js';

/**
 * Derives a dedicated 32-byte AES-256 key from the application MASTER_KEY
 * using HKDF (RFC 5869).
 */
export function deriveDocumentKey(context: string = 'fedtrustmed_document_aes256_gcm'): Buffer {
  const masterKey = getMasterKey();
  return Buffer.from(
    crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(context, 'utf-8'), 32)
  );
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: string; // 12-byte IV in hex (24 chars)
  authTag: string; // 16-byte auth tag in hex (32 chars)
}

/**
 * Encrypts a plaintext buffer using AES-256-GCM.
 * Generates a fresh cryptographically random 12-byte (96-bit) IV for each encryption.
 */
export function encryptAES256GCM(plaintext: Buffer, key?: Buffer): EncryptedPayload {
  if (!Buffer.isBuffer(plaintext)) {
    throw new TypeError('Plaintext must be a Buffer');
  }

  const encKey = key || deriveDocumentKey();
  if (encKey.length !== 32) {
    throw new Error('Encryption key must be exactly 32 bytes (256 bits)');
  }

  // NIST recommended 12-byte (96-bit) IV for AES-GCM
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypts an AES-256-GCM ciphertext payload and verifies authentication tag integrity.
 * Throws an error if ciphertext or auth tag has been tampered with.
 */
export function decryptAES256GCM(
  payload: {
    ciphertext: Buffer;
    iv: string | Buffer;
    authTag: string | Buffer;
  },
  key?: Buffer
): Buffer {
  const encKey = key || deriveDocumentKey();
  if (encKey.length !== 32) {
    throw new Error('Decryption key must be exactly 32 bytes (256 bits)');
  }

  const ivBuffer =
    typeof payload.iv === 'string' ? Buffer.from(payload.iv, 'hex') : payload.iv;
  const authTagBuffer =
    typeof payload.authTag === 'string' ? Buffer.from(payload.authTag, 'hex') : payload.authTag;

  if (ivBuffer.length !== 12 && ivBuffer.length !== 16) {
    throw new Error(`Invalid IV length: ${ivBuffer.length} bytes (expected 12 or 16)`);
  }
  if (authTagBuffer.length !== 16) {
    throw new Error(`Invalid auth tag length: ${authTagBuffer.length} bytes (expected 16)`);
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, ivBuffer);
  decipher.setAuthTag(authTagBuffer);

  return Buffer.concat([decipher.update(payload.ciphertext), decipher.final()]);
}

/**
 * Computes deterministic SHA-256 hash in hexadecimal format.
 */
export function computeSha256(data: Buffer | string): string {
  const hash = crypto.createHash('sha256');
  if (Buffer.isBuffer(data)) {
    hash.update(data);
  } else {
    hash.update(data, 'utf-8');
  }
  return hash.digest('hex');
}

/**
 * Generates a random secure identifier with optional prefix.
 */
export function generateSecureId(prefix: string = 'doc'): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Generates an ECC P-256 (prime256v1) key pair for an identity
 * and seals the private key using AES-256-GCM.
 */
export function generateUserKeys(userId: string): { publicKeyEcc: string; privateKeyEnc: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const { ciphertext, iv, authTag } = encryptAES256GCM(Buffer.from(privateKey, 'utf-8'));
  const privateKeyEnc = JSON.stringify({
    ciphertext: ciphertext.toString('base64'),
    iv,
    authTag,
    userId,
  });

  return {
    publicKeyEcc: publicKey,
    privateKeyEnc,
  };
}
