import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  Blockchain,
  verifyBlock,
  verifyChain,
  computeTxHash,
  computeMerkleRoot,
  computeBlockHash,
  signBlockHash,
  signBlockWithAllOrgs,
  getOrgKeyPair,
  ORGANISATIONS,
  LedgerBlock,
  LedgerTransaction,
} from '../server/blockchain.js';
import { pool } from '../server/db.js';

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => Promise<void> | void) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

async function runLedgerUnitTests() {
  console.log('============================================================');
  console.log('FedTrustMed Module M24 - Audit Ledger Cryptographic Unit Tests');
  console.log('============================================================\n');

  // Clean ledger tables for clean test state
  const client = await pool.connect();
  try {
    await client.query('TRUNCATE TABLE ledger_transactions, ledger_blocks RESTART IDENTITY CASCADE');
  } finally {
    client.release();
  }

  // 1. Initial State & Genesis Creation
  Blockchain.resetInstance();
  const bc = Blockchain.getInstance();
  await bc.loadFromDatabase();

  await runTest('Genesis block is created, hash-chained, and signed by 3 organizations', async () => {
    const blocks = await bc.getBlocks();
    assert.strictEqual(blocks.length, 1, 'Should have exactly 1 Genesis block');
    const genesis = blocks[0];
    assert.strictEqual(genesis.index, 0);
    assert.strictEqual(genesis.prevHash, '0'.repeat(64));
    assert.strictEqual(genesis.signatures.length, 3, 'Genesis should have signatures from all 3 orgs');

    const result = await bc.verify();
    assert.strictEqual(result.valid, true, 'Genesis chain must be valid');
    assert.strictEqual(result.verifiedBlocks, 1);
    assert.strictEqual(result.quorumPassedBlocks, 1);
  });

  // 2. Anchor Business Events
  await runTest('Anchors business events (consent grant/revoke, record creation, file SHA-256, break-glass)', async () => {
    // A. Consent Grant
    await bc.anchorTransaction({
      txType: 'CONSENT_GRANTED',
      actorId: 'usr-patient-001',
      actorRole: 'PATIENT',
      hospitalId: 'hosp-stjude-001',
      resourceId: 'consent-771',
      payload: {
        consentId: 'consent-771',
        patientId: 'pat-001',
        doctorId: 'doc-001',
        purpose: 'Cardiology evaluation',
      },
    });

    // B. Consent Revoke
    await bc.anchorTransaction({
      txType: 'CONSENT_REVOKED',
      actorId: 'usr-patient-001',
      actorRole: 'PATIENT',
      hospitalId: 'hosp-stjude-001',
      resourceId: 'consent-771',
      payload: {
        consentId: 'consent-771',
        patientId: 'pat-001',
        doctorId: 'doc-001',
        status: 'DENIED',
      },
    });

    // C. Record Creation
    await bc.anchorTransaction({
      txType: 'RECORD_CREATED',
      actorId: 'usr-doctor-001',
      actorRole: 'DOCTOR',
      hospitalId: 'hosp-stjude-001',
      resourceId: 'rec-cardio-991',
      payload: {
        recordId: 'rec-cardio-991',
        patientId: 'pat-001',
        sha256Hash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      },
    });

    // D. File SHA-256 Anchored
    await bc.anchorTransaction({
      txType: 'FILE_ANCHORED',
      actorId: 'usr-patient-001',
      resourceId: 'doc-scan-008',
      payload: {
        documentId: 'doc-scan-008',
        sha256: '9f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a32109f8e7d6c5b4a3210',
        originalName: 'cardio_scan.pdf',
        size: 2048576,
      },
    });

    // E. Break-Glass Override
    await bc.anchorTransaction({
      txType: 'BREAK_GLASS_USED',
      actorId: 'usr-admin-001',
      actorRole: 'SYSTEM_ADMIN',
      resourceId: 'rec-cardio-991',
      payload: {
        breakGlassId: 'bg-991',
        recordId: 'rec-cardio-991',
        reason: 'Emergency ICU resuscitation requiring prior cardiology history',
      },
    });

    const blocks = await bc.getBlocks();
    assert.strictEqual(blocks.length, 6, 'Should have Genesis + 5 event blocks');

    const result = await bc.verify();
    assert.strictEqual(result.valid, true, 'Full hash-chained ledger must be valid');
    assert.strictEqual(result.verifiedBlocks, 6);
    assert.strictEqual(result.quorumPassedBlocks, 6);
    assert.strictEqual(result.errors.length, 0);
  });

  // 3. Detect Tampered Payload
  await runTest('Proves a tampered payload in a transaction is detected and fails verification', () => {
    const blocks = bc.getBlocksSync();
    // Deep clone blocks to avoid corrupting the base test state
    const clonedBlocks: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));

    // Tamper with transaction payload in block #1
    const targetBlock = clonedBlocks[1];
    assert.ok(targetBlock.transactions.length > 0);
    targetBlock.transactions[0].payload.purpose = 'MALICIOUS_TAMPERED_PURPOSE';

    // Verify tampered block directly
    const blockDetail = verifyBlock(targetBlock, clonedBlocks[0]);
    assert.strictEqual(blockDetail.valid, false, 'Tampered payload must fail block verification');
    assert.strictEqual(blockDetail.status, 'INVALID');
    assert.ok(blockDetail.error?.includes('Tampered payload'), `Expected error to mention Tampered payload, got: ${blockDetail.error}`);

    // Verify entire chain fails
    const chainResult = verifyChain(clonedBlocks);
    assert.strictEqual(chainResult.valid, false, 'Chain must be invalid when payload is tampered');
    assert.ok(chainResult.errors.some((e) => e.includes('Tampered payload')));
  });

  // 4. Detect Tampered Block Header
  await runTest('Proves a tampered block header (blockHash, prevHash, timestamp) is detected', () => {
    const blocks = bc.getBlocksSync();

    // A. Tamper block hash
    const cloned1: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));
    cloned1[2].blockHash = 'deadbeef'.repeat(8);
    const result1 = verifyChain(cloned1);
    assert.strictEqual(result1.valid, false, 'Tampered block hash must fail verification');
    assert.ok(result1.errors.some((e) => e.includes('Tampered block header')));

    // B. Tamper previous hash link
    const cloned2: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));
    cloned2[3].prevHash = 'badc0ffe'.repeat(8);
    const result2 = verifyChain(cloned2);
    assert.strictEqual(result2.valid, false, 'Broken previous hash chain link must fail verification');
    assert.ok(result2.errors.some((e) => e.includes('Broken chain link')));

    // C. Tamper block timestamp
    const cloned3: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));
    cloned3[4].timestamp = '2099-01-01T00:00:00.000Z';
    const result3 = verifyChain(cloned3);
    assert.strictEqual(result3.valid, false, 'Modified timestamp changes header hash and must fail');
    assert.ok(result3.errors.some((e) => e.includes('Tampered block header')));
  });

  // 5. Detect Forged Signature
  await runTest('Proves a forged signature is detected and fails verification', () => {
    const blocks = bc.getBlocksSync();
    const cloned: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));

    // Replace organization signature on block #1 with a forged signature
    const block = cloned[1];
    // Generate an unauthorized foreign Ed25519 key pair
    const foreignKey = crypto.generateKeyPairSync('ed25519');
    const forgedSig = crypto.sign(null, Buffer.from(block.blockHash, 'hex'), foreignKey.privateKey);

    // Corrupt St. Jude's signature with foreign signature
    block.signatures[0].signature = forgedSig.toString('hex');

    const detail = verifyBlock(block, cloned[0]);
    assert.strictEqual(detail.valid, false, 'Block with forged signature must be invalid');
    assert.strictEqual(detail.status, 'INVALID');
    assert.ok(
      detail.error?.includes('Forged or invalid signature'),
      `Expected error to mention Forged or invalid signature, got: ${detail.error}`
    );

    const chainResult = verifyChain(cloned);
    assert.strictEqual(chainResult.valid, false, 'Chain with forged signature must be invalid');
    assert.ok(chainResult.errors.some((e) => e.includes('Forged or invalid signature')));
  });

  // 6. Detect Replayed Signature
  await runTest('Proves a replayed signature (duplicate org or copied from another block) is detected', () => {
    const blocks = bc.getBlocksSync();

    // Case A: Duplicate / Replayed signature for the same organization within the same block
    const clonedDup: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));
    const blockDup = clonedDup[2];
    // Replay St. Jude signature twice instead of second org
    blockDup.signatures = [
      blockDup.signatures[0],
      { ...blockDup.signatures[0] }, // Duplicated/replayed signature
    ];

    const detailDup = verifyBlock(blockDup, clonedDup[1]);
    assert.strictEqual(detailDup.valid, false, 'Duplicate signature replay must be rejected');
    assert.strictEqual(detailDup.status, 'INVALID');
    assert.ok(
      detailDup.error?.includes('Replayed signature detected'),
      `Expected error to mention Replayed signature detected, got: ${detailDup.error}`
    );

    // Case B: Replay signature from Block #0 into Block #3
    const clonedCross: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));
    const genesisSig = clonedCross[0].signatures[0];
    // Replace block #3 signature with Genesis signature
    clonedCross[3].signatures[0] = { ...genesisSig };

    const chainResult = verifyChain(clonedCross);
    assert.strictEqual(chainResult.valid, false, 'Cross-block replayed signature must fail');
    assert.ok(chainResult.errors.some((e) => e.includes('Replayed signature detected') || e.includes('signature detected')));
  });

  // 7. Legacy Unsigned Block Handling
  await runTest('Blocks without signatures are reported as "legacy unsigned", not failures', () => {
    const blocks = bc.getBlocksSync();
    const cloned: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));

    // Strip signatures from block #5
    cloned[5].signatures = [];

    const detail = verifyBlock(cloned[5], cloned[4]);
    assert.strictEqual(detail.valid, true, 'Legacy unsigned block is valid');
    assert.strictEqual(detail.status, 'LEGACY_UNSIGNED', 'Status must be LEGACY_UNSIGNED');

    const chainResult = verifyChain(cloned);
    assert.strictEqual(chainResult.valid, true, 'Chain remains valid with legacy unsigned blocks');
    assert.strictEqual(chainResult.legacyUnsignedBlocks, 1);
    assert.strictEqual(chainResult.quorumPassedBlocks, 5);
  });

  // 8. 2-of-3 Quorum Policy
  await runTest('Enforces 2-of-3 quorum: 2 valid signatures pass; 1 valid signature fails', () => {
    const blocks = bc.getBlocksSync();

    // 2 valid signatures -> PASS
    const cloned2of3: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));
    cloned2of3[1].signatures = [cloned2of3[1].signatures[0], cloned2of3[1].signatures[1]]; // 2 distinct orgs
    const detail2 = verifyBlock(cloned2of3[1], cloned2of3[0]);
    assert.strictEqual(detail2.valid, true, '2 valid signatures must pass 2-of-3 quorum');
    assert.strictEqual(detail2.status, 'VERIFIED');
    assert.strictEqual(detail2.validSignaturesCount, 2);

    // 1 valid signature -> FAIL
    const cloned1of3: LedgerBlock[] = JSON.parse(JSON.stringify(blocks));
    cloned1of3[1].signatures = [cloned1of3[1].signatures[0]]; // Only 1 org
    const detail1 = verifyBlock(cloned1of3[1], cloned1of3[0]);
    assert.strictEqual(detail1.valid, false, '1 valid signature must fail 2-of-3 quorum');
    assert.strictEqual(detail1.status, 'INVALID');
    assert.ok(detail1.error?.includes('Quorum failure'));
  });

  // 9. Reload on Server Restart
  await runTest('Ledger still verifies after a server restart (reloads from PostgreSQL)', async () => {
    // Simulate server restart:
    // 1. Wipe in-memory singleton
    Blockchain.resetInstance();

    // 2. Instantiate fresh Blockchain as on server boot
    const restartedBlockchain = Blockchain.getInstance();

    // 3. Reload everything from PostgreSQL
    await restartedBlockchain.loadFromDatabase();
    const loadedBlocks = await restartedBlockchain.getBlocks();

    assert.strictEqual(loadedBlocks.length, 6, 'Must reload all 6 blocks from PostgreSQL');
    assert.strictEqual(loadedBlocks[0].index, 0, 'Genesis block intact');
    assert.strictEqual(loadedBlocks[5].index, 5, 'Latest block intact');

    // 4. Verify chain integrity on reloaded state
    const verifyResult = await restartedBlockchain.verify();
    assert.strictEqual(verifyResult.valid, true, 'Reloaded blockchain must be 100% valid after server restart');
    assert.strictEqual(verifyResult.totalBlocks, 6);
    assert.strictEqual(verifyResult.verifiedBlocks, 6);
    assert.strictEqual(verifyResult.quorumPassedBlocks, 6);
    assert.strictEqual(verifyResult.errors.length, 0);
  });

  console.log('\n============================================================');
  console.log(`ALL LEDGER TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
  console.log('============================================================\n');

  await pool.end();
}

runLedgerUnitTests().catch((err) => {
  console.error('\nTest suite execution failed:', err);
  process.exit(1);
});
