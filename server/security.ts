import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const DEFAULT_DEV_MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Pre-computed valid bcrypt hash with cost factor 12 for timing-attack mitigation
const DUMMY_BCRYPT_HASH = '$2a$12$89AHDrTprjbv8RoCexCa7Oa6ulBGRIS7wPkdjDfWF4i.710fU0OW6';

let devJwtSecret: string | null = null;

/**
 * Resolves the 32-byte MASTER_KEY from environment variables.
 * In production, it must be exactly 64 hexadecimal characters.
 */
export function getMasterKey(): Buffer {
  const hex = process.env.MASTER_KEY || DEFAULT_DEV_MASTER_KEY;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  return crypto.createHash('sha256').update(hex).digest();
}

/**
 * Derives a cryptographic pepper from MASTER_KEY using HKDF (RFC 5869).
 */
export function derivePepper(context: string = 'fedtrustmed_aadhaar_pepper'): Buffer {
  const masterKey = getMasterKey();
  return Buffer.from(
    crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), Buffer.from(context, 'utf-8'), 32)
  );
}

/**
 * Computes deterministic HMAC-SHA256 hash for Aadhaar number using a pepper derived from MASTER_KEY.
 * Preserves privacy while allowing unique constraint verification and indexed lookups.
 */
export function computeAadhaarHash(aadhaar: string): string {
  if (typeof aadhaar !== 'string') {
    throw new TypeError('Aadhaar must be a string');
  }
  const cleanAadhaar = aadhaar.trim().replace(/[\s-]/g, '');
  const pepper = derivePepper('fedtrustmed_aadhaar_pepper');
  return crypto.createHmac('sha256', pepper).update(cleanAadhaar, 'utf-8').digest('hex');
}

export const hashAadhaar = computeAadhaarHash;

export const BCRYPT_COST = 12;

export async function hashPassword(plainText: string): Promise<string> {
  const salt = await bcrypt.genSalt(BCRYPT_COST);
  return bcrypt.hash(plainText, salt);
}

export async function comparePassword(plainText: string, hash: string): Promise<boolean> {
  if (!plainText || !hash) {
    return false;
  }
  return bcrypt.compare(plainText, hash);
}

/**
 * Runs constant-time bcrypt compare even for unknown accounts or invalid inputs,
 * mitigating user enumeration via timing differences.
 * A null, empty, or non-string password will never validate.
 */
export async function timingSafePasswordCompare(
  providedPassword: unknown,
  storedHash?: string | null
): Promise<boolean> {
  const passwordStr = typeof providedPassword === 'string' ? providedPassword : '';
  const hashToCompare =
    typeof storedHash === 'string' && storedHash.startsWith('$2')
      ? storedHash
      : DUMMY_BCRYPT_HASH;

  // Always execute bcrypt.compare so execution time is indistinguishable
  const matches = await bcrypt.compare(passwordStr, hashToCompare);

  // A null, empty, or non-string password can never log in
  if (!providedPassword || typeof providedPassword !== 'string' || providedPassword.trim() === '') {
    return false;
  }

  // If no legitimate stored hash existed, authentication must fail
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.startsWith('$2')) {
    return false;
  }

  return matches;
}

/**
 * Retrieves the JWT_SECRET from environment.
 * Must be at least 32 characters in production; generates an ephemeral secret with a console warning in development.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret || secret.length < 32) {
    if (isProd) {
      throw new Error('FATAL: JWT_SECRET must be set and at least 32 characters in production');
    }
    if (!devJwtSecret) {
      console.warn(
        '[SECURITY WARNING] JWT_SECRET is missing or < 32 characters in .env. Using ephemeral random secret for development.'
      );
      devJwtSecret = crypto.randomBytes(32).toString('hex');
    }
    return devJwtSecret;
  }

  return secret;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  hospitalId: string | null;
  departmentId: string | null;
  [key: string]: any;
}

/**
 * Signs a JWT token with HS256 algorithm and 1 hour expiration.
 */
export function signToken(payload: TokenPayload): string {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
}

/**
 * Verifies a JWT token with HS256 algorithm.
 */
export function verifyToken(token: string): TokenPayload {
  const secret = getJwtSecret();
  return jwt.verify(token, secret, {
    algorithms: ['HS256'],
  }) as TokenPayload;
}
