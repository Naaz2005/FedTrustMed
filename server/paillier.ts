// server/paillier.ts
import { generateRandomKeys } from 'paillier-bigint';
import { createHash } from 'crypto';

// Generate a 2048‑bit Paillier key pair once on module load.
// In a real system keys would be persisted securely; for this demo we keep them in memory.
let publicKey: any = null;
let privateKey: any = null;

async function initKeys() {
  if (!publicKey) {
    const { publicKey: pk, privateKey: sk } = await generateRandomKeys(2048);
    publicKey = pk;
    privateKey = sk;
  }
}

/** Encrypt a non‑negative integer value. Returns a BigInt ciphertext (hex string). */
export async function encrypt(value: number): Promise<string> {
  await initKeys();
  const ciphertext = publicKey.encrypt(BigInt(value));
  // Represent as hex for DB storage
  return ciphertext.toString(16);
}

/** Homomorphic addition of two ciphertexts (hex strings). Returns new ciphertext hex. */
export async function add(cipherHex1: string, cipherHex2: string): Promise<string> {
  await initKeys();
  const c1 = BigInt('0x' + cipherHex1);
  const c2 = BigInt('0x' + cipherHex2);
  const sum = publicKey.addition(c1, c2);
  return sum.toString(16);
}

/** Decrypt a ciphertext hex back to a number. */
export async function decrypt(cipherHex: string): Promise<number> {
  await initKeys();
  const c = BigInt('0x' + cipherHex);
  const plaintext = privateKey.decrypt(c);
  return Number(plaintext);
}

/** Simple hash of the public key for ledger anchoring (SHA‑256). */
export async function publicKeyHash(): Promise<string> {
  await initKeys();
  const keyPem = publicKey.toString();
  const hash = createHash('sha256').update(keyPem).digest('hex');
  return hash;
}

export const paillier = { encrypt, add, decrypt, publicKeyHash };
