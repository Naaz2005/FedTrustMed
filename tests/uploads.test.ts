import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { AddressInfo } from 'node:net';

// Set environment for test mode
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import {
  encryptAES256GCM,
  decryptAES256GCM,
  computeSha256,
  generateSecureId,
  deriveDocumentKey,
} from '../server/cryptoUtils.js';
import { hashPassword } from '../server/security.js';
import {
  detectFileType,
  detectPdfActiveContent,
  sanitizeDisplayName,
  saveEncryptedDocument,
} from '../server/uploads.js';

let totalTests = 0;
let passedTests = 0;

function runTest(name: string, fn: () => void) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ ${name}: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name: string, fn: () => Promise<void>) {
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

/**
 * Builds a valid multipart/form-data payload Buffer with boundary.
 */
function buildMultipartPayload(
  fields: Record<string, string>,
  file?: { fieldName: string; filename: string; contentType: string; content: Buffer }
): { boundary: string; body: Buffer } {
  const boundary = `----WebKitFormBoundary${crypto.randomBytes(16).toString('hex')}`;
  const parts: Buffer[] = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      )
    );
  }

  if (file) {
    const header = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
    );
    const footer = Buffer.from('\r\n');
    parts.push(header, file.content, footer);
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    boundary,
    body: Buffer.concat(parts),
  };
}

/**
 * Makes an HTTP request and collects the response as a Buffer (preserves exact binary data).
 */
function makeHttpBinaryRequest(
  port: number,
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: Buffer | string
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  rawBuffer: Buffer;
  json: any;
}> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => {
          const rawBuffer = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(rawBuffer.toString('utf-8'));
          } catch {
            // Not JSON
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            rawBuffer,
            json,
          });
        });
      }
    );

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

/**
 * Helper: login as a seeded user and return the JWT token.
 */
async function loginAs(
  port: number,
  email: string,
  password: string = 'Password123!'
): Promise<string> {
  const payload = JSON.stringify({ email, password });
  const res = await makeHttpBinaryRequest(
    port,
    '/api/auth/login',
    'POST',
    {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(payload)),
    },
    payload
  );

  if (res.statusCode !== 200 || !res.json?.token) {
    throw new Error(`Login failed for ${email}: ${res.statusCode} ${res.rawBuffer.toString('utf-8')}`);
  }
  return res.json.token;
}

// Minimal valid PDF byte template
const VALID_PDF_CONTENT = Buffer.from(
  '%PDF-1.4\n' +
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n' +
    '4 0 obj\n<< /Length 53 >>\nstream\n' +
    'BT\n/F1 12 Tf\n72 712 Td\n(FedTrustMed Confidential Medical Record) Tj\nET\n' +
    'endstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000206 00000 n \n' +
    'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n320\n%%EOF\n',
  'utf-8'
);

// Minimal valid JPEG byte buffer (FF D8 FF ...)
const VALID_JPEG_CONTENT = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00,
  0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06,
  0xff, 0xd9,
]);

// Minimal valid PNG byte buffer (\x89PNG\r\n\x1a\n ...)
const VALID_PNG_CONTENT = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
  0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
  0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
  0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function main() {
  console.log('============================================================');
  console.log('FedTrustMed Module M7 - Secure Upload Service Tests');
  console.log('============================================================\n');

  // ========================================================================
  // 1. UNIT TESTS: AES-256-GCM HELPERS (server/cryptoUtils.ts)
  // ========================================================================
  console.log('1. Testing AES-256-GCM Cryptographic Helpers:');

  runTest('encryptAES256GCM and decryptAES256GCM roundtrip is byte-identical', () => {
    const plaintext = Buffer.from('Highly confidential patient diagnosis notes: patient is stable.');
    const encrypted = encryptAES256GCM(plaintext);

    assert.ok(encrypted.ciphertext.length > 0);
    assert.equal(typeof encrypted.iv, 'string');
    assert.equal(encrypted.iv.length, 24, '12-byte IV in hex should be 24 characters');
    assert.equal(typeof encrypted.authTag, 'string');
    assert.equal(encrypted.authTag.length, 32, '16-byte auth tag in hex should be 32 characters');

    // Ciphertext must not match or contain plaintext
    assert.ok(!encrypted.ciphertext.includes(plaintext));

    const decrypted = decryptAES256GCM(encrypted);
    assert.deepEqual(decrypted, plaintext);
    assert.equal(decrypted.toString('utf-8'), plaintext.toString('utf-8'));
  });

  runTest('Two encryptions of identical plaintext produce distinct IVs and ciphertexts (probabilistic encryption)', () => {
    const plaintext = Buffer.from('Identical diagnosis content');
    const enc1 = encryptAES256GCM(plaintext);
    const enc2 = encryptAES256GCM(plaintext);

    assert.notEqual(enc1.iv, enc2.iv);
    assert.notDeepEqual(enc1.ciphertext, enc2.ciphertext);

    // Both decrypt back to identical plaintext
    assert.deepEqual(decryptAES256GCM(enc1), plaintext);
    assert.deepEqual(decryptAES256GCM(enc2), plaintext);
  });

  runTest('Tampering with ciphertext causes decryption failure (integrity violation)', () => {
    const plaintext = Buffer.from('Confidential record');
    const enc = encryptAES256GCM(plaintext);

    // Flip bits in ciphertext
    const tamperedCiphertext = Buffer.from(enc.ciphertext);
    tamperedCiphertext[0] ^= 0x01;

    assert.throws(
      () => decryptAES256GCM({ ...enc, ciphertext: tamperedCiphertext }),
      /Unsupported state or unable to authenticate data|auth|tag/i
    );
  });

  runTest('Tampering with auth tag causes decryption failure (authenticity violation)', () => {
    const plaintext = Buffer.from('Confidential record');
    const enc = encryptAES256GCM(plaintext);

    // Alter auth tag
    const fakeAuthTag = '00'.repeat(16);
    assert.throws(
      () => decryptAES256GCM({ ...enc, authTag: fakeAuthTag }),
      /Unsupported state or unable to authenticate data|auth|tag/i
    );
  });

  runTest('computeSha256 produces deterministic hex hash', () => {
    const data = Buffer.from('Test Data');
    const hash1 = computeSha256(data);
    const hash2 = computeSha256(data);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64);
  });

  runTest('generateSecureId creates unique random IDs with prefix', () => {
    const id1 = generateSecureId('doc');
    const id2 = generateSecureId('doc');
    assert.ok(id1.startsWith('doc-'));
    assert.ok(id2.startsWith('doc-'));
    assert.notEqual(id1, id2);
  });

  // ========================================================================
  // 2. UNIT TESTS: MAGIC BYTES & ACTIVE CONTENT DETECTION (server/uploads.ts)
  // ========================================================================
  console.log('\n2. Testing Magic Bytes & Active Content Scanner:');

  runTest('detectFileType correctly recognizes PDF (%PDF-)', () => {
    const detected = detectFileType(VALID_PDF_CONTENT);
    assert.deepEqual(detected, { mime: 'application/pdf', ext: 'pdf' });
  });

  runTest('detectFileType correctly recognizes JPEG (FF D8 FF)', () => {
    const detected = detectFileType(VALID_JPEG_CONTENT);
    assert.deepEqual(detected, { mime: 'image/jpeg', ext: 'jpg' });
  });

  runTest('detectFileType correctly recognizes PNG (89 50 4E 47 0D 0A 1A 0A)', () => {
    const detected = detectFileType(VALID_PNG_CONTENT);
    assert.deepEqual(detected, { mime: 'image/png', ext: 'png' });
  });

  runTest('detectFileType rejects a text file disguised with .pdf extension', () => {
    const textBuffer = Buffer.from('This is a plain text file pretending to be a PDF.');
    const detected = detectFileType(textBuffer);
    assert.equal(detected, null);
  });

  runTest('detectFileType rejects a Windows .exe binary (MZ magic bytes)', () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const detected = detectFileType(exeBuffer);
    assert.equal(detected, null);
  });

  runTest('detectPdfActiveContent returns false for clean PDF', () => {
    const result = detectPdfActiveContent(VALID_PDF_CONTENT);
    assert.equal(result.hasActiveContent, false);
  });

  runTest('detectPdfActiveContent detects /JavaScript in PDF', () => {
    const maliciousPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Names << /JavaScript 3 0 R >> >>\nendobj\n%%EOF'
    );
    const result = detectPdfActiveContent(maliciousPdf);
    assert.equal(result.hasActiveContent, true);
    assert.equal(result.matchedKeyword, '/JavaScript');
  });

  runTest('detectPdfActiveContent detects /JS in PDF action dictionary', () => {
    const maliciousPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /S /JS /JS (app.alert("Pwned")) >>\nendobj\n%%EOF'
    );
    const result = detectPdfActiveContent(maliciousPdf);
    assert.equal(result.hasActiveContent, true);
  });

  runTest('detectPdfActiveContent detects /Launch external command execution in PDF', () => {
    const maliciousPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /Launch /F (cmd.exe) >>\nendobj\n%%EOF'
    );
    const result = detectPdfActiveContent(maliciousPdf);
    assert.equal(result.hasActiveContent, true);
    assert.equal(result.matchedKeyword, '/Launch');
  });

  runTest('detectPdfActiveContent detects /EmbeddedFile payload in PDF', () => {
    const maliciousPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Filespec /EF << /F 2 0 R >> /Type /EmbeddedFile >>\nendobj\n%%EOF'
    );
    const result = detectPdfActiveContent(maliciousPdf);
    assert.equal(result.hasActiveContent, true);
    assert.equal(result.matchedKeyword, '/EmbeddedFile');
  });

  runTest('detectPdfActiveContent detects hex-encoded PDF name escapes (e.g. /Java#53cript)', () => {
    const obfuscatedPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /Java#53cript >>\nendobj\n%%EOF'
    );
    const result = detectPdfActiveContent(obfuscatedPdf);
    assert.equal(result.hasActiveContent, true);
  });

  runTest('sanitizeDisplayName strips directory traversal and dangerous characters', () => {
    assert.equal(
      sanitizeDisplayName('../../../etc/passwd.pdf'),
      'passwd.pdf'
    );
    assert.equal(
      sanitizeDisplayName('..\\..\\Windows\\System32\\cmd.exe.pdf'),
      'cmd.exe.pdf'
    );
    assert.equal(
      sanitizeDisplayName('patient<report>:test|*?.pdf'),
      'patient_report__test___.pdf'
    );
    assert.equal(
      sanitizeDisplayName('  ...report.pdf...  '),
      'report.pdf'
    );
    assert.equal(
      sanitizeDisplayName('test\x00file\x1Fname.pdf'),
      'testfilename.pdf'
    );
    assert.equal(
      sanitizeDisplayName(''),
      'document.bin'
    );
  });

  // ========================================================================
  // 3. INTEGRATION HTTP TESTS (server/uploads.ts + PostgreSQL + server.ts)
  // ========================================================================
  console.log('\n3. Testing End-to-End Upload & Download Service:');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  let patientToken: string;
  let doctorToken: string;
  let systemAdminToken: string;
  let secondPatientToken: string;
  let uploadedDocId: string;

  try {
    // Authenticate demo users
    patientToken = await loginAs(port, 'patient@fedtrustmed.demo');
    doctorToken = await loginAs(port, 'doctor@fedtrustmed.demo');
    systemAdminToken = await loginAs(port, 'system_admin@fedtrustmed.demo');

    // Create a temporary second patient to verify cross-user isolation
    const secondPatientId = 'usr-patient-cross-check-002';
    const pwdHash = await hashPassword('Password123!');
    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, password, approval_status, aadhaar_verification_status, is_frozen, trust_score, updated_at
      ) VALUES (
        $1, 'patient2@fedtrustmed.demo', 'Second Patient', 'PATIENT',
        $2,
        'APPROVED', 'VERIFIED - SIMULATION', FALSE, 100.00, NOW()
      ) ON CONFLICT (id) DO UPDATE SET password = $2, approval_status = 'APPROVED', is_frozen = FALSE`,
      [secondPatientId, pwdHash]
    );
    secondPatientToken = await loginAs(port, 'patient2@fedtrustmed.demo');

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 1: Real PDF uploads and downloads byte-identical
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('A real PDF uploads successfully (201) and downloads byte-identical (200)', async () => {
      const { boundary, body } = buildMultipartPayload(
        { kind: 'LAB_REPORT' },
        {
          fieldName: 'file',
          filename: 'blood_test_report.pdf',
          contentType: 'application/pdf',
          content: VALID_PDF_CONTENT,
        }
      );

      const uploadRes = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(uploadRes.statusCode, 201, `Upload failed: ${uploadRes.rawBuffer.toString('utf-8')}`);
      assert.ok(uploadRes.json.success);
      assert.ok(uploadRes.json.document.id);
      assert.equal(uploadRes.json.document.mime, 'application/pdf');
      assert.equal(uploadRes.json.document.originalName, 'blood_test_report.pdf');
      assert.equal(uploadRes.json.document.size, VALID_PDF_CONTENT.length);

      uploadedDocId = uploadRes.json.document.id;

      // Now download the document as the owner patient
      const downloadRes = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadedDocId}`,
        'GET',
        {
          Authorization: `Bearer ${patientToken}`,
        }
      );

      assert.equal(downloadRes.statusCode, 200, `Download failed: ${downloadRes.rawBuffer.toString('utf-8')}`);
      // VERIFY BYTE-IDENTICAL
      assert.equal(downloadRes.rawBuffer.length, VALID_PDF_CONTENT.length);
      assert.deepEqual(downloadRes.rawBuffer, VALID_PDF_CONTENT);
      assert.equal(
        downloadRes.rawBuffer.toString('utf-8'),
        VALID_PDF_CONTENT.toString('utf-8'),
        'Decrypted PDF content is not byte-identical to original'
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK: Security headers (X-Content-Type-Options: nosniff)
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Download response includes X-Content-Type-Options: nosniff header', async () => {
      const downloadRes = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadedDocId}`,
        'GET',
        {
          Authorization: `Bearer ${patientToken}`,
        }
      );

      assert.equal(downloadRes.statusCode, 200);
      assert.equal(
        downloadRes.headers['x-content-type-options'],
        'nosniff',
        'Missing or incorrect X-Content-Type-Options header'
      );
      assert.equal(downloadRes.headers['content-type'], 'application/pdf');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 6: The ciphertext column does NOT contain the plaintext bytes
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('The ciphertext column in the documents table does NOT contain the plaintext bytes', async () => {
      const dbResult = await pool.query(
        'SELECT id, original_name, mime, size, sha256, iv, auth_tag, ciphertext FROM documents WHERE id = $1',
        [uploadedDocId]
      );
      assert.equal(dbResult.rows.length, 1);
      const row = dbResult.rows[0];

      // Ciphertext in PostgreSQL BYTEA returns as Buffer in node-pg
      assert.ok(Buffer.isBuffer(row.ciphertext), 'Expected ciphertext to be a Buffer');
      assert.ok(row.ciphertext.length > 0, 'Expected non-empty ciphertext');

      // Crucial security check: Ciphertext must NOT contain plaintext bytes
      assert.equal(
        row.ciphertext.includes(VALID_PDF_CONTENT),
        false,
        'CRITICAL SECURITY VULNERABILITY: Plaintext bytes found directly inside ciphertext column!'
      );
      assert.equal(
        row.ciphertext.includes(Buffer.from('FedTrustMed Confidential Medical Record')),
        false,
        'CRITICAL: Sensitive plaintext string found inside ciphertext column!'
      );
      assert.equal(
        row.ciphertext.includes(Buffer.from('%PDF')),
        false,
        'CRITICAL: PDF magic header found inside ciphertext column!'
      );

      // Verify that decrypting using the stored IV and auth tag produces exact plaintext
      const decrypted = decryptAES256GCM({
        ciphertext: row.ciphertext,
        iv: row.iv,
        authTag: row.auth_tag,
      });
      assert.deepEqual(decrypted, VALID_PDF_CONTENT);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK: Audit logs row written for upload and download
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Audit log row is written for DOCUMENT_UPLOAD and DOCUMENT_DOWNLOAD', async () => {
      const auditResult = await pool.query(
        `SELECT action, resource_id, user_id, details FROM audit_logs
         WHERE resource_id = $1 ORDER BY timestamp DESC`,
        [uploadedDocId]
      );

      assert.ok(auditResult.rows.length >= 2, 'Expected at least upload and download audit entries');
      const actions = auditResult.rows.map((r: any) => r.action);
      assert.ok(actions.includes('DOCUMENT_UPLOAD'), 'Missing DOCUMENT_UPLOAD audit row');
      assert.ok(actions.includes('DOCUMENT_DOWNLOAD'), 'Missing DOCUMENT_DOWNLOAD audit row');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 2: a .txt renamed to .pdf is rejected
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('A .txt renamed to .pdf is rejected (400)', async () => {
      const fakePdfContent = Buffer.from('Just plain text inside a file named sneaky.pdf');
      const { boundary, body } = buildMultipartPayload(
        { kind: 'LAB_REPORT' },
        {
          fieldName: 'file',
          filename: 'sneaky.pdf',
          contentType: 'application/pdf',
          content: fakePdfContent,
        }
      );

      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.rawBuffer.toString('utf-8')}`);
      assert.ok(
        res.json.error.includes('Unsupported or disguised file format'),
        `Unexpected error message: ${res.json.error}`
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 3: a 20 MB file is rejected
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('A 20 MB file is rejected (413 Payload Too Large)', async () => {
      // Allocate 20 MB buffer
      const twentyMbBuffer = Buffer.alloc(20 * 1024 * 1024, 0x41);
      const { boundary, body } = buildMultipartPayload(
        { kind: 'LARGE_DOC' },
        {
          fieldName: 'file',
          filename: 'huge_document.pdf',
          contentType: 'application/pdf',
          content: twentyMbBuffer,
        }
      );

      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(
        res.statusCode,
        413,
        `Expected 413, got ${res.statusCode}: ${res.rawBuffer.toString('utf-8')}`
      );
      assert.ok(
        res.json.error.includes('exceeds limit') || res.json.error.includes('too large'),
        `Unexpected error: ${res.json.error}`
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 4: a PDF containing /JavaScript is rejected
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('A PDF containing /JavaScript is rejected (400)', async () => {
      const maliciousJsPdf = Buffer.from(
        '%PDF-1.4\n' +
          '1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Names << /JavaScript 5 0 R >> >>\nendobj\n' +
          '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
          '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
          '5 0 obj\n<< /S /JavaScript /JS (app.alert("Attacking user!")) >>\nendobj\n' +
          'trailer\n<< /Size 6 /Root 1 0 R >>\n%%EOF\n',
        'utf-8'
      );

      const { boundary, body } = buildMultipartPayload(
        { kind: 'PRESCRIPTION' },
        {
          fieldName: 'file',
          filename: 'exploit_js.pdf',
          contentType: 'application/pdf',
          content: maliciousJsPdf,
        }
      );

      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.rawBuffer.toString('utf-8')}`);
      assert.ok(
        res.json.error.includes('active executable content') || res.json.error.includes('JavaScript'),
        `Expected active content rejection message, got: ${res.json.error}`
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK: Additional PDF active content variations (/Launch, /EmbeddedFile)
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('A PDF containing /Launch is rejected (400)', async () => {
      const maliciousLaunchPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Action /S /Launch /F (powershell.exe) >>\nendobj\n%%EOF\n',
        'utf-8'
      );

      const { boundary, body } = buildMultipartPayload(
        { kind: 'REPORT' },
        {
          fieldName: 'file',
          filename: 'launch_attack.pdf',
          contentType: 'application/pdf',
          content: maliciousLaunchPdf,
        }
      );

      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400);
      assert.ok(res.json.error.includes('active executable content'));
    });

    await runAsyncTest('A PDF containing /EmbeddedFile is rejected (400)', async () => {
      const maliciousEmbeddedPdf = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Filespec /EF << /F 2 0 R >> /Type /EmbeddedFile >>\nendobj\n%%EOF\n',
        'utf-8'
      );

      const { boundary, body } = buildMultipartPayload(
        { kind: 'REPORT' },
        {
          fieldName: 'file',
          filename: 'embedded_attack.pdf',
          contentType: 'application/pdf',
          content: maliciousEmbeddedPdf,
        }
      );

      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400);
      assert.ok(res.json.error.includes('active executable content'));
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 5: a .exe is rejected
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('A .exe binary file is rejected (400)', async () => {
      const exeBinary = Buffer.from([
        0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0xff, 0x00,
        0x00, 0xb8, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);

      const { boundary, body } = buildMultipartPayload(
        { kind: 'TEST' },
        {
          fieldName: 'file',
          filename: 'trojan.exe',
          contentType: 'application/x-msdownload',
          content: exeBinary,
        }
      );

      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.rawBuffer.toString('utf-8')}`);
      assert.ok(
        res.json.error.includes('Unsupported or disguised file format'),
        `Unexpected error message: ${res.json.error}`
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK: Real JPEG & PNG files upload and download byte-identical
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('A real JPEG uploads and downloads byte-identical', async () => {
      const { boundary, body } = buildMultipartPayload(
        { kind: 'SCAN' },
        {
          fieldName: 'file',
          filename: 'mri_scan.jpg',
          contentType: 'image/jpeg',
          content: VALID_JPEG_CONTENT,
        }
      );

      const uploadRes = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(uploadRes.statusCode, 201);
      assert.equal(uploadRes.json.document.mime, 'image/jpeg');

      const downloadRes = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadRes.json.document.id}`,
        'GET',
        { Authorization: `Bearer ${patientToken}` }
      );

      assert.equal(downloadRes.statusCode, 200);
      assert.deepEqual(downloadRes.rawBuffer, VALID_JPEG_CONTENT);
    });

    await runAsyncTest('A real PNG uploads and downloads byte-identical', async () => {
      const { boundary, body } = buildMultipartPayload(
        { kind: 'XRAY' },
        {
          fieldName: 'file',
          filename: 'chest_xray.png',
          contentType: 'image/png',
          content: VALID_PNG_CONTENT,
        }
      );

      const uploadRes = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(uploadRes.statusCode, 201);
      assert.equal(uploadRes.json.document.mime, 'image/png');

      const downloadRes = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadRes.json.document.id}`,
        'GET',
        { Authorization: `Bearer ${patientToken}` }
      );

      assert.equal(downloadRes.statusCode, 200);
      assert.deepEqual(downloadRes.rawBuffer, VALID_PNG_CONTENT);
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK: Filename sanitization on upload
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Filename with directory traversal is sanitized before storage', async () => {
      const { boundary, body } = buildMultipartPayload(
        { kind: 'RECORD' },
        {
          fieldName: 'file',
          filename: '../../../../sensitive/data.pdf',
          contentType: 'application/pdf',
          content: VALID_PDF_CONTENT,
        }
      );

      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads',
        'POST',
        {
          Authorization: `Bearer ${patientToken}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 201);
      assert.equal(res.json.document.originalName, 'data.pdf');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK: Authorization controls on download
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Unauthorized patient cannot download another patient document (403)', async () => {
      const res = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadedDocId}`,
        'GET',
        { Authorization: `Bearer ${secondPatientToken}` }
      );

      assert.equal(res.statusCode, 403, `Expected 403 Forbidden, got ${res.statusCode}`);
      assert.ok(res.json.error.includes('Access denied'));
    });

    await runAsyncTest('Doctor can download patient document for medical review (200)', async () => {
      const res = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadedDocId}`,
        'GET',
        { Authorization: `Bearer ${doctorToken}` }
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.rawBuffer, VALID_PDF_CONTENT);
    });

    await runAsyncTest('System admin can download document (200)', async () => {
      const res = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadedDocId}`,
        'GET',
        { Authorization: `Bearer ${systemAdminToken}` }
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.rawBuffer, VALID_PDF_CONTENT);
    });

    await runAsyncTest('Download without token returns 401', async () => {
      const res = await makeHttpBinaryRequest(
        port,
        `/api/test/uploads/${uploadedDocId}`,
        'GET',
        {}
      );

      assert.equal(res.statusCode, 401);
    });

    await runAsyncTest('Download non-existent document returns 404', async () => {
      const res = await makeHttpBinaryRequest(
        port,
        '/api/test/uploads/doc-non-existent-999',
        'GET',
        { Authorization: `Bearer ${patientToken}` }
      );

      assert.equal(res.statusCode, 404);
      assert.ok(res.json.error.includes('not found'));
    });

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }

  console.log('\n============================================================');
  console.log(`ALL M7 UPLOADS TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFatal test runner error in uploads.test.ts:', err);
  pool.end().finally(() => process.exit(1));
});
