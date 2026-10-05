import crypto from 'crypto';

/*
 * Paillier additively homomorphic encryption (demonstration implementation).
 *
 *   Enc(a) * Enc(b) mod n^2  decrypts to  a + b
 *
 * This is a real scheme, but this code is NOT constant-time and has not
 * been audited - suitable for a research prototype only.
 */

const modPow = (base: bigint, exp: bigint, mod: bigint): bigint => {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
};

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));
const lcm = (a: bigint, b: bigint): bigint => (a / gcd(a, b)) * b;

const modInv = (a: bigint, m: bigint): bigint => {
  let [oldR, r] = [((a % m) + m) % m, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  if (oldR !== 1n) throw new Error('No modular inverse');
  return ((oldS % m) + m) % m;
};

const randomBelow = (n: bigint): bigint => {
  const bytes = Math.ceil(n.toString(2).length / 8) + 8; // extra bytes => negligible bias
  return (BigInt('0x' + crypto.randomBytes(bytes).toString('hex')) % (n - 1n)) + 1n;
};

export interface PaillierPublicKey { n: bigint; n2: bigint }
export interface PaillierKeyPair { publicKey: PaillierPublicKey; lambda: bigint; mu: bigint }

export function generatePaillierKeyPair(primeBits = 1024): PaillierKeyPair {
  let p: bigint, q: bigint, n: bigint;
  do {
    p = crypto.generatePrimeSync(primeBits, { bigint: true });
    q = crypto.generatePrimeSync(primeBits, { bigint: true });
    n = p * q;
  } while (p === q || gcd(n, (p - 1n) * (q - 1n)) !== 1n);
  const lambda = lcm(p - 1n, q - 1n);
  const mu = modInv(lambda, n); // valid because g = n + 1
  return { publicKey: { n, n2: n * n }, lambda, mu };
}

export function paillierEncrypt(pub: PaillierPublicKey, m: bigint): bigint {
  if (m < 0n || m >= pub.n) throw new RangeError('Plaintext out of range');
  let r: bigint;
  do { r = randomBelow(pub.n); } while (gcd(r, pub.n) !== 1n);
  return (((1n + m * pub.n) % pub.n2) * modPow(r, pub.n, pub.n2)) % pub.n2;
}

export function paillierDecrypt(kp: PaillierKeyPair, c: bigint): bigint {
  const { n, n2 } = kp.publicKey;
  const u = modPow(c, kp.lambda, n2);
  return (((u - 1n) / n) * kp.mu) % n;
}

/** Homomorphic addition of two ciphertexts. */
export const paillierAdd = (pub: PaillierPublicKey, c1: bigint, c2: bigint): bigint =>
  (c1 * c2) % pub.n2;

let cachedKeyPair: PaillierKeyPair | null = null;
export const getPaillierKeyPair = (): PaillierKeyPair => (cachedKeyPair ??= generatePaillierKeyPair());
