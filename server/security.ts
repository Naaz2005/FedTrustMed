import type { User } from '../src/types/index.js';

/** Fields that must never leave the server. */
const SECRET_FIELDS = ['password', 'privateKeyEnc', 'mfaSecret', 'mfaSecretEnc', 'aadhaarHash'] as const;

export function publicUser<T extends Partial<User> & Record<string, any>>(user: T): Omit<T, (typeof SECRET_FIELDS)[number]> {
  const copy: Record<string, any> = { ...user };
  for (const f of SECRET_FIELDS) delete copy[f];
  return copy as any;
}

/* Verhoeff checksum - every valid Aadhaar number satisfies it. */
const d = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0],
];
const p = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],
  [9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8],
];

export function isValidAadhaar(num: string): boolean {
  if (!/^[2-9]\d{11}$/.test(num)) return false; // 12 digits, cannot start with 0 or 1
  let c = 0;
  const digits = num.split('').reverse().map(Number);
  digits.forEach((dig, i) => { c = d[c][p[i % 8][dig]]; });
  return c === 0;
}

export const isStrongPassword = (pw: unknown): pw is string =>
  typeof pw === 'string' && pw.length >= 10 && pw.length <= 128 && /[a-z]/i.test(pw) && /\d/.test(pw);

export const isEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Account lockout: 5 failures in 15 minutes locks the (email, ip) pair for 15 minutes. */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;
const failures = new Map<string, { count: number; first: number }>();

export const loginKey = (email: string, ip: string) => `${email.toLowerCase()}|${ip}`;
export function isLockedOut(key: string): boolean {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.first > WINDOW_MS) { failures.delete(key); return false; }
  return f.count >= MAX_FAILS;
}
export function recordLoginFailure(key: string): number {
  const f = failures.get(key);
  if (!f || Date.now() - f.first > WINDOW_MS) { failures.set(key, { count: 1, first: Date.now() }); return 1; }
  f.count += 1;
  return f.count;
}
export const clearLoginFailures = (key: string) => void failures.delete(key);
