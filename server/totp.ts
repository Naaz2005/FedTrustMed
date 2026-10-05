import crypto from 'crypto';

/* RFC 6238 TOTP (SHA-1, 6 digits, 30 s step) - compatible with Google Authenticator, Authy, etc. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Buffer {
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const generateTotpSecret = (): string => base32Encode(crypto.randomBytes(20));

export function totpAt(secretB32: string, timeMs: number, step = 30, digits = 6): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / step)));
  const h = crypto.createHmac('sha1', base32Decode(secretB32)).update(counter).digest();
  const off = h[h.length - 1] & 0xf;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

/** Accepts the current code and +/- `window` steps of clock drift. */
export function verifyTotp(secretB32: string, token: string, window = 1, nowMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(totpAt(secretB32, nowMs + w * 30000));
    if (crypto.timingSafeEqual(expected, Buffer.from(token))) ok = true; // no early exit
  }
  return ok;
}

export const otpauthUri = (secretB32: string, account: string, issuer = 'FedTrustMed'): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
