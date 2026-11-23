import crypto from 'crypto';
import { pool } from './db.js';
import { getMasterKey } from './security.js';

export interface LedgerTransaction {
  id: string;
  blockIndex: number;
  txHash: string;
  txType: 'CONSENT_GRANTED' | 'CONSENT_REVOKED' | 'RECORD_CREATED' | 'FILE_ANCHORED' | 'BREAK_GLASS_USED' | 'GENESIS';
  actorId?: string;
  actorRole?: string;
  hospitalId?: string;
  resourceId?: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface BlockSignature {
  orgId: string;
  publicKey: string; // 32-byte raw hex representation of Ed25519 public key
  signature: string; // 64-byte hex representation of Ed25519 signature
}

export interface LedgerBlock {
  index: number;
  blockHash: string;
  prevHash: string;
  merkleRoot: string;
  timestamp: string;
  signatures: BlockSignature[];
  transactions: LedgerTransaction[];
  createdAt?: string;
}

export interface BlockVerificationDetail {
  index: number;
  blockHash: string;
  valid: boolean;
  status: 'VERIFIED' | 'LEGACY_UNSIGNED' | 'INVALID';
  validSignaturesCount: number;
  totalSignaturesCount: number;
  error?: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalBlocks: number;
  verifiedBlocks: number;
  legacyUnsignedBlocks: number;
  quorumPassedBlocks: number;
  errors: string[];
  details: BlockVerificationDetail[];
}

export const ORGANISATIONS = [
  { id: 'org-stjude', name: 'St. Jude General Hospital Node' },
  { id: 'org-metroheart', name: 'Metro Heart & Cancer Specialty Node' },
  { id: 'org-citymemorial', name: 'City Memorial Hospital Node' },
] as const;

export type OrgId = (typeof ORGANISATIONS)[number]['id'];

const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

/**
 * Derives a deterministic Ed25519 KeyObject pair for an organization
 * from MASTER_KEY using HKDF (RFC 5869) and RFC 8410 PKCS#8 DER.
 */
export function getOrgKeyPair(orgId: string): {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  publicKeyHex: string;
} {
  const masterKey = getMasterKey();
  const info = Buffer.from(`fedtrustmed_ledger_ed25519_${orgId}`, 'utf-8');
  const seed = Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), info, 32));

  const pkcs8Key = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const privateKey = crypto.createPrivateKey({ key: pkcs8Key, format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey(privateKey);
  const spki = publicKey.export({ format: 'der', type: 'spki' });
  // The raw 32-byte Ed25519 public key starts at byte 12 in the SPKI DER structure
  const publicKeyHex = spki.subarray(12).toString('hex');

  return { privateKey, publicKey, publicKeyHex };
}

/**
 * Deterministic JSON stringifier with lexicographically sorted object keys.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(obj[k])).join(',') + '}';
}

/**
 * Computes deterministic SHA-256 hash for a transaction.
 */
export function computeTxHash(tx: {
  txType: string;
  actorId?: string;
  resourceId?: string;
  payload: any;
}): string {
  const serialized = `${tx.txType}:${tx.actorId || ''}:${tx.resourceId || ''}:${canonicalJson(tx.payload || {})}`;
  return crypto.createHash('sha256').update(serialized, 'utf-8').digest('hex');
}

/**
 * Computes deterministic Merkle Root for an array of transaction hashes.
 * Follows standard binary tree hashing: H(left + right), duplicating the last element if count is odd.
 */
export function computeMerkleRoot(txHashes: string[]): string {
  if (!txHashes || txHashes.length === 0) {
    return crypto.createHash('sha256').update('EMPTY_MERKLE_ROOT', 'utf-8').digest('hex');
  }
  if (txHashes.length === 1) {
    return txHashes[0];
  }

  let currentLevel = [...txHashes];
  while (currentLevel.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : left;
      const combined = crypto.createHash('sha256').update(left + right, 'utf-8').digest('hex');
      nextLevel.push(combined);
    }
    currentLevel = nextLevel;
  }
  return currentLevel[0];
}

/**
 * Computes deterministic SHA-256 block hash over the block header.
 */
export function computeBlockHash(
  index: number,
  prevHash: string,
  merkleRoot: string,
  timestamp: string
): string {
  const header = `${index}:${prevHash}:${merkleRoot}:${timestamp}`;
  return crypto.createHash('sha256').update(header, 'utf-8').digest('hex');
}

/**
 * Signs a block hash with an organization's derived Ed25519 key.
 */
export function signBlockHash(blockHash: string, orgId: string): BlockSignature {
  const { privateKey, publicKeyHex } = getOrgKeyPair(orgId);
  const sigBuffer = crypto.sign(null, Buffer.from(blockHash, 'hex'), privateKey);
  return {
    orgId,
    publicKey: publicKeyHex,
    signature: sigBuffer.toString('hex'),
  };
}

/**
 * Signs a block hash with all 3 configured organisations.
 */
export function signBlockWithAllOrgs(blockHash: string): BlockSignature[] {
  return ORGANISATIONS.map((org) => signBlockHash(blockHash, org.id));
}

/**
 * Verifies an Ed25519 signature against an organization's derived public key for a block hash.
 */
export function verifyBlockSignature(blockHash: string, sig: BlockSignature): boolean {
  try {
    const org = ORGANISATIONS.find((o) => o.id === sig.orgId);
    if (!org) return false;

    const { publicKey, publicKeyHex } = getOrgKeyPair(sig.orgId);
    if (sig.publicKey !== publicKeyHex) return false;

    const sigBuffer = Buffer.from(sig.signature, 'hex');
    if (sigBuffer.length !== 64) return false;

    return crypto.verify(null, Buffer.from(blockHash, 'hex'), publicKey, sigBuffer);
  } catch {
    return false;
  }
}

/**
 * Verifies a single block and enforces 2-of-3 Ed25519 quorum.
 * Blocks without signatures are reported as "legacy unsigned", not failures.
 */
export function verifyBlock(
  block: LedgerBlock,
  prevBlock?: LedgerBlock,
  allPreviousBlocks?: LedgerBlock[]
): BlockVerificationDetail {
  // 1. Verify previous hash link
  if (block.index === 0) {
    const expectedGenesisPrev = '0'.repeat(64);
    if (block.prevHash !== expectedGenesisPrev) {
      return {
        index: block.index,
        blockHash: block.blockHash,
        valid: false,
        status: 'INVALID',
        validSignaturesCount: 0,
        totalSignaturesCount: block.signatures?.length || 0,
        error: `Genesis block invalid prevHash: expected ${expectedGenesisPrev}, got ${block.prevHash}`,
      };
    }
  } else {
    if (!prevBlock) {
      return {
        index: block.index,
        blockHash: block.blockHash,
        valid: false,
        status: 'INVALID',
        validSignaturesCount: 0,
        totalSignaturesCount: block.signatures?.length || 0,
        error: `Block #${block.index} missing previous block reference`,
      };
    }
    if (block.prevHash !== prevBlock.blockHash) {
      return {
        index: block.index,
        blockHash: block.blockHash,
        valid: false,
        status: 'INVALID',
        validSignaturesCount: 0,
        totalSignaturesCount: block.signatures?.length || 0,
        error: `Broken chain link at block #${block.index}: prevHash ${block.prevHash} does not match block #${prevBlock.index} hash ${prevBlock.blockHash}`,
      };
    }
  }

  // 2. Recompute transaction hashes (detects tampered payload)
  const computedTxHashes: string[] = [];
  for (let i = 0; i < block.transactions.length; i++) {
    const tx = block.transactions[i];
    const expectedHash = computeTxHash(tx);
    if (tx.txHash !== expectedHash) {
      return {
        index: block.index,
        blockHash: block.blockHash,
        valid: false,
        status: 'INVALID',
        validSignaturesCount: 0,
        totalSignaturesCount: block.signatures?.length || 0,
        error: `Tampered payload in transaction ${tx.id || i}: expected hash ${expectedHash}, found ${tx.txHash}`,
      };
    }
    computedTxHashes.push(expectedHash);
  }

  // 3. Recompute Merkle root
  const recomputedMerkle = computeMerkleRoot(computedTxHashes);
  if (recomputedMerkle !== block.merkleRoot) {
    return {
      index: block.index,
      blockHash: block.blockHash,
      valid: false,
      status: 'INVALID',
      validSignaturesCount: 0,
      totalSignaturesCount: block.signatures?.length || 0,
      error: `Merkle root mismatch at block #${block.index}: expected ${recomputedMerkle}, found ${block.merkleRoot}`,
    };
  }

  // 4. Recompute block hash (detects tampered block headers)
  const recomputedHash = computeBlockHash(
    block.index,
    block.prevHash,
    block.merkleRoot,
    block.timestamp
  );
  if (recomputedHash !== block.blockHash) {
    return {
      index: block.index,
      blockHash: block.blockHash,
      valid: false,
      status: 'INVALID',
      validSignaturesCount: 0,
      totalSignaturesCount: block.signatures?.length || 0,
      error: `Tampered block header at block #${block.index}: recomputed hash ${recomputedHash} does not match ${block.blockHash}`,
    };
  }

  // 5. Check signatures and enforce 2-of-3 quorum
  const signatures = Array.isArray(block.signatures) ? block.signatures : [];
  if (signatures.length === 0) {
    // Reported as "legacy unsigned", not a failure
    return {
      index: block.index,
      blockHash: block.blockHash,
      valid: true,
      status: 'LEGACY_UNSIGNED',
      validSignaturesCount: 0,
      totalSignaturesCount: 0,
    };
  }

  const seenOrgs = new Set<string>();
  const validOrgs = new Set<string>();
  for (const sig of signatures) {
    if (seenOrgs.has(sig.orgId)) {
      return {
        index: block.index,
        blockHash: block.blockHash,
        valid: false,
        status: 'INVALID',
        validSignaturesCount: validOrgs.size,
        totalSignaturesCount: signatures.length,
        error: `Replayed signature detected: duplicate signature for organisation ${sig.orgId} at block #${block.index}`,
      };
    }
    seenOrgs.add(sig.orgId);

    if (!verifyBlockSignature(block.blockHash, sig)) {
      const isReplayed = allPreviousBlocks && allPreviousBlocks.length > 0 && allPreviousBlocks.some((pb) => verifyBlockSignature(pb.blockHash, sig));
      return {
        index: block.index,
        blockHash: block.blockHash,
        valid: false,
        status: 'INVALID',
        validSignaturesCount: validOrgs.size,
        totalSignaturesCount: signatures.length,
        error: isReplayed
          ? `Replayed signature detected: valid signature for organisation ${sig.orgId} was replayed from another block`
          : `Forged or invalid signature detected for organisation ${sig.orgId} at block #${block.index}`,
      };
    }
    validOrgs.add(sig.orgId);
  }

  // Enforce 2-of-3 quorum
  if (validOrgs.size < 2) {
    return {
      index: block.index,
      blockHash: block.blockHash,
      valid: false,
      status: 'INVALID',
      validSignaturesCount: validOrgs.size,
      totalSignaturesCount: signatures.length,
      error: `Quorum failure at block #${block.index}: required at least 2 valid Ed25519 signatures, but verified only ${validOrgs.size} of 3`,
    };
  }

  return {
    index: block.index,
    blockHash: block.blockHash,
    valid: true,
    status: 'VERIFIED',
    validSignaturesCount: validOrgs.size,
    totalSignaturesCount: signatures.length,
  };
}

/**
 * Recomputes all hashes, Merkle roots, and verifies signatures across the entire chain.
 */
export function verifyChain(blocks?: LedgerBlock[]): ChainVerificationResult {
  const chainToVerify = blocks || Blockchain.getInstance().getBlocksSync();
  const result: ChainVerificationResult = {
    valid: true,
    totalBlocks: chainToVerify.length,
    verifiedBlocks: 0,
    legacyUnsignedBlocks: 0,
    quorumPassedBlocks: 0,
    errors: [],
    details: [],
  };

  if (chainToVerify.length === 0) {
    return result;
  }

  const allPreviousBlocks: LedgerBlock[] = [];
  for (let i = 0; i < chainToVerify.length; i++) {
    const prevBlock = i > 0 ? chainToVerify[i - 1] : undefined;
    const detail = verifyBlock(chainToVerify[i], prevBlock, allPreviousBlocks);
    result.details.push(detail);

    if (!detail.valid) {
      result.valid = false;
      if (detail.error) {
        result.errors.push(detail.error);
      }
    } else {
      if (detail.status === 'VERIFIED') {
        result.verifiedBlocks++;
        result.quorumPassedBlocks++;
      } else if (detail.status === 'LEGACY_UNSIGNED') {
        result.legacyUnsignedBlocks++;
      }
    }
    allPreviousBlocks.push(chainToVerify[i]);
  }

  return result;
}

/**
 * Blockchain Singleton maintaining the hash chain and PostgreSQL synchronization.
 */
export class Blockchain {
  private static instance: Blockchain | null = null;
  private chain: LedgerBlock[] = [];
  private isLoaded: boolean = false;
  private loadPromise: Promise<void> | null = null;

  public static getInstance(): Blockchain {
    if (!Blockchain.instance) {
      Blockchain.instance = new Blockchain();
    }
    return Blockchain.instance;
  }

  public static resetInstance(): void {
    Blockchain.instance = null;
  }

  public getBlocksSync(): LedgerBlock[] {
    return [...this.chain];
  }

  public getChain(): LedgerBlock[] {
    return [...this.chain];
  }

  public async reload(): Promise<void> {
    this.chain = [];
    this.isLoaded = false;
    this.loadPromise = null;
    await this.loadFromDatabase();
  }

  /**
   * Initializes tables if needed and loads all hash-chained blocks and transactions.
   * If empty, creates and persists the Genesis block.
   */
  public async loadFromDatabase(): Promise<void> {
    if (this.isLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      // 1. Ensure tables exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS ledger_blocks (
          block_index INTEGER PRIMARY KEY,
          block_hash VARCHAR(64) NOT NULL UNIQUE,
          prev_hash VARCHAR(64) NOT NULL,
          merkle_root VARCHAR(64) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS ledger_transactions (
          id VARCHAR(100) PRIMARY KEY,
          block_index INTEGER NOT NULL REFERENCES ledger_blocks(block_index) ON DELETE CASCADE,
          tx_hash VARCHAR(64) NOT NULL,
          tx_type VARCHAR(50) NOT NULL,
          actor_id VARCHAR(100),
          actor_role VARCHAR(50),
          hospital_id VARCHAR(100),
          resource_id VARCHAR(100),
          payload JSONB NOT NULL DEFAULT '{}'::jsonb,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      // 2. Query blocks ordered by block_index
      const blocksRes = await pool.query(
        'SELECT * FROM ledger_blocks ORDER BY block_index ASC'
      );

      // 3. Query all transactions
      const txRes = await pool.query(
        'SELECT * FROM ledger_transactions ORDER BY block_index ASC, timestamp ASC'
      );

      // Group transactions by block_index
      const txMap = new Map<number, LedgerTransaction[]>();
      for (const row of txRes.rows) {
        const list = txMap.get(row.block_index) || [];
        list.push({
          id: row.id,
          blockIndex: row.block_index,
          txHash: row.tx_hash,
          txType: row.tx_type,
          actorId: row.actor_id,
          actorRole: row.actor_role,
          hospitalId: row.hospital_id,
          resourceId: row.resource_id,
          payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
          timestamp: new Date(row.timestamp).toISOString(),
        });
        txMap.set(row.block_index, list);
      }

      this.chain = blocksRes.rows.map((b: any) => ({
        index: b.block_index,
        blockHash: b.block_hash,
        prevHash: b.prev_hash,
        merkleRoot: b.merkle_root,
        timestamp: new Date(b.timestamp).toISOString(),
        signatures: typeof b.signatures === 'string' ? JSON.parse(b.signatures) : b.signatures || [],
        transactions: txMap.get(b.block_index) || [],
        createdAt: new Date(b.created_at).toISOString(),
      }));

      // 4. Create Genesis block if empty
      if (this.chain.length === 0) {
        await this.createGenesisBlock();
      }

      this.isLoaded = true;
    })();

    return this.loadPromise;
  }

  private async createGenesisBlock(): Promise<LedgerBlock> {
    const timestamp = '2026-01-01T00:00:00.000Z';
    const prevHash = '0'.repeat(64);

    const genesisTx: LedgerTransaction = {
      id: 'tx-genesis-000',
      blockIndex: 0,
      txHash: '',
      txType: 'GENESIS',
      actorId: 'system-governance',
      actorRole: 'SYSTEM_ADMIN',
      payload: {
        network: 'FedTrustMed Audit Ledger',
        description: 'Simulated Fabric-style peer consensus ledger genesis anchor',
        version: '1.0.0',
        organisations: ORGANISATIONS.map((o) => o.id),
      },
      timestamp,
    };
    genesisTx.txHash = computeTxHash(genesisTx);

    const merkleRoot = computeMerkleRoot([genesisTx.txHash]);
    const blockHash = computeBlockHash(0, prevHash, merkleRoot, timestamp);
    const signatures = signBlockWithAllOrgs(blockHash);

    const genesisBlock: LedgerBlock = {
      index: 0,
      blockHash,
      prevHash,
      merkleRoot,
      timestamp,
      signatures,
      transactions: [genesisTx],
      createdAt: new Date().toISOString(),
    };

    // Save to PostgreSQL
    await pool.query(
      `INSERT INTO ledger_blocks (block_index, block_hash, prev_hash, merkle_root, timestamp, signatures, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [0, blockHash, prevHash, merkleRoot, timestamp, JSON.stringify(signatures)]
    );

    await pool.query(
      `INSERT INTO ledger_transactions (id, block_index, tx_hash, tx_type, actor_id, actor_role, payload, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        genesisTx.id,
        0,
        genesisTx.txHash,
        genesisTx.txType,
        genesisTx.actorId,
        genesisTx.actorRole,
        JSON.stringify(genesisTx.payload),
        timestamp,
      ]
    );

    this.chain.push(genesisBlock);
    return genesisBlock;
  }

  /**
   * Anchors a new business event transaction into a new signed hash-chained block.
   */
  public async anchorTransaction(params: {
    txType: 'CONSENT_GRANTED' | 'CONSENT_REVOKED' | 'RECORD_CREATED' | 'FILE_ANCHORED' | 'BREAK_GLASS_USED';
    actorId?: string;
    actorRole?: string;
    hospitalId?: string;
    resourceId?: string;
    payload: Record<string, any>;
    customTimestamp?: string;
  }): Promise<{ block: LedgerBlock; transaction: LedgerTransaction }> {
    await this.loadFromDatabase();

    const lastBlock = this.chain[this.chain.length - 1];
    const newIndex = lastBlock.index + 1;
    const timestamp = params.customTimestamp || new Date().toISOString();

    const tx: LedgerTransaction = {
      id: `tx-${crypto.randomUUID()}`,
      blockIndex: newIndex,
      txHash: '',
      txType: params.txType,
      actorId: params.actorId,
      actorRole: params.actorRole,
      hospitalId: params.hospitalId,
      resourceId: params.resourceId,
      payload: params.payload,
      timestamp,
    };
    tx.txHash = computeTxHash(tx);

    const merkleRoot = computeMerkleRoot([tx.txHash]);
    const blockHash = computeBlockHash(newIndex, lastBlock.blockHash, merkleRoot, timestamp);
    const signatures = signBlockWithAllOrgs(blockHash);

    const block: LedgerBlock = {
      index: newIndex,
      blockHash,
      prevHash: lastBlock.blockHash,
      merkleRoot,
      timestamp,
      signatures,
      transactions: [tx],
      createdAt: new Date().toISOString(),
    };

    // Persist block to database
    await pool.query(
      `INSERT INTO ledger_blocks (block_index, block_hash, prev_hash, merkle_root, timestamp, signatures, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [newIndex, blockHash, lastBlock.blockHash, merkleRoot, timestamp, JSON.stringify(signatures)]
    );

    // Persist transaction to database
    await pool.query(
      `INSERT INTO ledger_transactions (id, block_index, tx_hash, tx_type, actor_id, actor_role, hospital_id, resource_id, payload, timestamp)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        tx.id,
        newIndex,
        tx.txHash,
        tx.txType,
        tx.actorId || null,
        tx.actorRole || null,
        tx.hospitalId || null,
        tx.resourceId || null,
        JSON.stringify(tx.payload),
        timestamp,
      ]
    );

    this.chain.push(block);
    return { block, transaction: tx };
  }

  public async getBlocks(): Promise<LedgerBlock[]> {
    await this.loadFromDatabase();
    return [...this.chain];
  }

  public async getBlockByIndex(index: number): Promise<LedgerBlock | null> {
    await this.loadFromDatabase();
    return this.chain.find((b) => b.index === index) || null;
  }

  public async verify(): Promise<ChainVerificationResult> {
    await this.loadFromDatabase();
    return verifyChain(this.chain);
  }
}

export const blockchain = Blockchain.getInstance();

export async function anchorTransaction(params: Parameters<Blockchain['anchorTransaction']>[0]) {
  return blockchain.anchorTransaction(params);
}

export async function verifyChainIntegrity() {
  return blockchain.verify();
}

