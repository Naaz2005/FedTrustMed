import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { AddressInfo } from 'node:net';

// Set environment for test mode
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/security.js';

let totalTests = 0;
let passedTests = 0;

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

function makeHttpRequest(
  port: number,
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: string | Buffer
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any; rawBody: Buffer }> {
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
          let parsed: any = null;
          try {
            parsed = JSON.parse(rawBuffer.toString('utf-8'));
          } catch {
            parsed = null;
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            rawBody: rawBuffer,
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

async function loginUser(port: number, email: string, pass: string): Promise<string> {
  const payload = JSON.stringify({ email, password: pass });
  const res = await makeHttpRequest(
    port,
    '/api/auth/login',
    'POST',
    {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload).toString(),
    },
    payload
  );

  if (res.statusCode !== 200 || !res.body?.token) {
    throw new Error(`Login failed for ${email} with status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function runAccessTests() {
  console.log('============================================================');
  console.log('FedTrustMed Module M17 - Record Access & Security Matrix Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const testSuffix = Date.now().toString();

  try {
    // Ensure break_glass_access table exists before testing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS break_glass_access (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        record_id VARCHAR(100) NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_break_glass_user ON break_glass_access(user_id);
      CREATE INDEX IF NOT EXISTS idx_break_glass_record ON break_glass_access(record_id);
    `);

    // 1. Authenticate standard demo users
    const patientToken = await loginUser(port, 'patient@fedtrustmed.demo', 'Password123!');
    const authorDoctorToken = await loginUser(port, 'doctor@fedtrustmed.demo', 'Password123!');
    const hospitalAdminToken = await loginUser(port, 'hospital_admin@fedtrustmed.demo', 'Password123!');
    const systemAdminToken = await loginUser(port, 'system_admin@fedtrustmed.demo', 'Password123!');

    const patientHeaders = {
      Authorization: `Bearer ${patientToken}`,
      'Content-Type': 'application/json',
    };
    const authorDoctorHeaders = {
      Authorization: `Bearer ${authorDoctorToken}`,
      'Content-Type': 'application/json',
    };
    const hospitalAdminHeaders = {
      Authorization: `Bearer ${hospitalAdminToken}`,
      'Content-Type': 'application/json',
    };
    const systemAdminHeaders = {
      Authorization: `Bearer ${systemAdminToken}`,
      'Content-Type': 'application/json',
    };

    // Get profiles for Patient and Authoring Doctor
    const patQuery = await pool.query(
      "SELECT p.id, p.full_name, p.user_id FROM patients p JOIN users u ON p.user_id = u.id WHERE u.email = 'patient@fedtrustmed.demo'"
    );
    const patientProfile = patQuery.rows[0];

    const authorDocQuery = await pool.query(
      "SELECT d.id, d.full_name, d.hospital_id, d.hospital_name, d.department_id, d.department_name, u.id as user_id FROM doctors d JOIN users u ON d.user_id = u.id WHERE u.email = 'doctor@fedtrustmed.demo'"
    );
    const authorDocProfile = authorDocQuery.rows[0];

    // Create a Second Doctor (Doctor 2) to test Un-consented -> Consented -> Revoked transitions
    const testPasswordHash = await hashPassword('Password123!');
    const doc2UserId = `usr-test-doc2-${testSuffix}`;
    const doc2Email = `doctor2.${testSuffix}@fedtrustmed.demo`;
    const doc2AadhaarHash = crypto.createHash('sha256').update(`doc2-${testSuffix}`).digest('hex');

    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, password, aadhaar_hash, aadhaar_last4, approval_status,
        aadhaar_verification_status, hospital_id, hospital_name, created_at, updated_at
      ) VALUES ($1, $2, 'Dr. External Specialist', 'DOCTOR', $3, $4, '7777', 'APPROVED', 'VERIFIED', $5, $6, NOW(), NOW())`,
      [doc2UserId, doc2Email, testPasswordHash, doc2AadhaarHash, authorDocProfile.hospital_id, authorDocProfile.hospital_name]
    );

    const doc2ProfileId = `doc-test2-${testSuffix}`;
    await pool.query(
      `INSERT INTO doctors (
        id, user_id, full_name, specialty, department_id, department_name,
        hospital_id, hospital_name, license_number, trust_score, created_at
      ) VALUES ($1, $2, 'Dr. External Specialist', 'Cardiology', $3, $4, $5, $6, 'MED-LIC-TEST-999', 100.00, NOW())`,
      [
        doc2ProfileId,
        doc2UserId,
        authorDocProfile.department_id,
        authorDocProfile.department_name,
        authorDocProfile.hospital_id,
        authorDocProfile.hospital_name,
      ]
    );

    const doc2Token = await loginUser(port, doc2Email, 'Password123!');
    const doc2Headers = {
      Authorization: `Bearer ${doc2Token}`,
      'Content-Type': 'application/json',
    };

    // Create a dedicated medical record owned by Patient 1 and authored by Author Doctor
    const testRecordId = `rec-access-test-${testSuffix}`;
    await pool.query(
      `INSERT INTO medical_records (
        id, patient_id, patient_name, doctor_id, doctor_name, hospital_id, hospital_name,
        title, record_type, diagnosis, encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key,
        sha256_hash, prescriptions, lab_tests, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Cardiology Report', 'Access Test Diagnosis', 'ciphertextTest123', 'ivTest123', 'tagTest123', 'eccKeyTest', 'shaTest', '{\"Aspirin\"}', '{\"ECG\"}', NOW())`,
      [
        testRecordId,
        patientProfile.id,
        patientProfile.full_name,
        authorDocProfile.id,
        authorDocProfile.full_name,
        authorDocProfile.hospital_id,
        authorDocProfile.hospital_name,
        `Secure Health Record ${testSuffix}`,
      ]
    );

    const decryptPayload = JSON.stringify({ recordId: testRecordId });
    const reportPath = `/api/medical-records/${testRecordId}/report`;

    // ========================================================================
    // 1. PATIENT WHO OWNS IT (200 ALLOWED)
    // ========================================================================
    console.log('1. Patient who owns the record:');

    await runAsyncTest('Patient can decrypt their own record (200)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...patientHeaders,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.record.id, testRecordId);
    });

    await runAsyncTest('Patient can download PDF report for their own record (200)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', patientHeaders);
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'] || '', /application\/pdf/i);
      assert.ok(res.rawBody.toString('utf-8').startsWith('%PDF-1.4'));
    });

    // ========================================================================
    // 2. AUTHORING DOCTOR (200 ALLOWED)
    // ========================================================================
    console.log('\n2. Doctor who authored the record:');

    await runAsyncTest('Authoring doctor can decrypt record (200)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...authorDoctorHeaders,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.record.id, testRecordId);
    });

    await runAsyncTest('Authoring doctor can download PDF report (200)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', authorDoctorHeaders);
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'] || '', /application\/pdf/i);
      assert.ok(res.rawBody.toString('utf-8').startsWith('%PDF-1.4'));
    });

    // ========================================================================
    // 3. UN-CONSENTED DOCTOR (403 FORBIDDEN & AUDITED)
    // ========================================================================
    console.log('\n3. Un-consented Doctor (no consent):');

    await runAsyncTest('Un-consented doctor is DENIED decrypt (403)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...doc2Headers,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    await runAsyncTest('Un-consented doctor is DENIED PDF report download (403)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', doc2Headers);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    // ========================================================================
    // 4. HOSPITAL ADMIN (403 FORBIDDEN - NEVER READ)
    // ========================================================================
    console.log('\n4. Hospital Admin (Hospital Admin can never read medical records):');

    await runAsyncTest('Hospital Admin is DENIED decrypt (403)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...hospitalAdminHeaders,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    await runAsyncTest('Hospital Admin is DENIED PDF report download (403)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', hospitalAdminHeaders);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    // ========================================================================
    // 5. SYSTEM ADMIN WITHOUT BREAK-GLASS (403 FORBIDDEN)
    // ========================================================================
    console.log('\n5. System Admin WITHOUT break-glass:');

    await runAsyncTest('System Admin without break-glass is DENIED decrypt (403)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...systemAdminHeaders,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    await runAsyncTest('System Admin without break-glass is DENIED PDF report download (403)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', systemAdminHeaders);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    // ========================================================================
    // 6. SYSTEM ADMIN BREAK-GLASS & WITH BREAK-GLASS (200 ALLOWED)
    // ========================================================================
    console.log('\n6. System Admin Break-Glass Execution & Access:');

    await runAsyncTest('Break-glass rejects short reason (< 15 chars) with 400', async () => {
      const bgPayload = JSON.stringify({ recordId: testRecordId, reason: 'Short reason' });
      const res = await makeHttpRequest(port, '/api/admin/break-glass', 'POST', {
        ...systemAdminHeaders,
        'Content-Length': Buffer.byteLength(bgPayload).toString(),
      }, bgPayload);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /at least 15 characters/i);
    });

    await runAsyncTest('Break-glass rejects reason exceeding 300 chars with 400', async () => {
      const bgPayload = JSON.stringify({ recordId: testRecordId, reason: 'x'.repeat(301) });
      const res = await makeHttpRequest(port, '/api/admin/break-glass', 'POST', {
        ...systemAdminHeaders,
        'Content-Length': Buffer.byteLength(bgPayload).toString(),
      }, bgPayload);

      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /not exceed 300 characters/i);
    });

    await runAsyncTest('System Admin executes break-glass; audited and notifies patient', async () => {
      const validReason = 'Emergency trauma override: critical unconscious patient cardiac review required';
      const bgPayload = JSON.stringify({ recordId: testRecordId, reason: validReason });
      const res = await makeHttpRequest(port, '/api/admin/break-glass', 'POST', {
        ...systemAdminHeaders,
        'Content-Length': Buffer.byteLength(bgPayload).toString(),
      }, bgPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);

      // Verify audit row for BREAK_GLASS_ACCESS
      const bgAudit = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'BREAK_GLASS_ACCESS'",
        [testRecordId]
      );
      assert.equal(bgAudit.rows.length, 1);
      assert.match(bgAudit.rows[0].details, /Emergency trauma override/i);

      // Verify patient was notified with ALERT type
      const notifRes = await pool.query(
        "SELECT * FROM notifications WHERE user_id = $1 AND title = 'Emergency Break-Glass Access' ORDER BY created_at DESC LIMIT 1",
        [patientProfile.user_id]
      );
      assert.equal(notifRes.rows.length, 1);
      assert.equal(notifRes.rows[0].type, 'ALERT');
      assert.match(notifRes.rows[0].message, /Emergency break-glass access/i);
    });

    await runAsyncTest('System Admin WITH break-glass can now decrypt record (200)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...systemAdminHeaders,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.record.id, testRecordId);
    });

    await runAsyncTest('System Admin WITH break-glass can now download PDF report (200)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', systemAdminHeaders);
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'] || '', /application\/pdf/i);
      assert.ok(res.rawBody.toString('utf-8').startsWith('%PDF-1.4'));
    });

    // ========================================================================
    // 7. CONSENTED DOCTOR (200 ALLOWED)
    // ========================================================================
    console.log('\n7. Consented Doctor (Granted Consent):');

    let consentDoc2Id = '';

    await runAsyncTest('Doctor 2 requests consent from Patient 1 for the test record', async () => {
      const reqPayload = JSON.stringify({
        patientId: patientProfile.id,
        purpose: 'Second opinion',
        reason: 'Specialist consultation',
        recordId: testRecordId,
      });

      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doc2Headers,
        'Content-Length': Buffer.byteLength(reqPayload).toString(),
      }, reqPayload);

      assert.equal(res.statusCode, 201);
      consentDoc2Id = res.body.consent.id;
    });

    await runAsyncTest('Patient 1 grants consent to Doctor 2', async () => {
      const grantPayload = JSON.stringify({ consentId: consentDoc2Id, recordId: testRecordId });
      const res = await makeHttpRequest(port, '/api/consent/grant', 'POST', {
        ...patientHeaders,
        'Content-Length': Buffer.byteLength(grantPayload).toString(),
      }, grantPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.consent.status, 'GRANTED');
    });

    await runAsyncTest('Consented Doctor can now decrypt record (200)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...doc2Headers,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.record.id, testRecordId);
    });

    await runAsyncTest('Consented Doctor can now download PDF report (200)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', doc2Headers);
      assert.equal(res.statusCode, 200);
      assert.match(res.headers['content-type'] || '', /application\/pdf/i);
      assert.ok(res.rawBody.toString('utf-8').startsWith('%PDF-1.4'));
    });

    // ========================================================================
    // 8. AFTER REVOKE: DOCTOR GETS 403 AGAIN
    // ========================================================================
    console.log('\n8. After Revocation: Previously Consented Doctor gets 403 again:');

    await runAsyncTest('Patient 1 revokes Doctor 2 consent', async () => {
      const revokePayload = JSON.stringify({ consentId: consentDoc2Id });
      const res = await makeHttpRequest(port, '/api/consent/revoke', 'POST', {
        ...patientHeaders,
        'Content-Length': Buffer.byteLength(revokePayload).toString(),
      }, revokePayload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.consent.status, 'REVOKED');
    });

    await runAsyncTest('After revoke: Doctor 2 is immediately DENIED decrypt (403)', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/decrypt', 'POST', {
        ...doc2Headers,
        'Content-Length': Buffer.byteLength(decryptPayload).toString(),
      }, decryptPayload);

      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    await runAsyncTest('After revoke: Doctor 2 is immediately DENIED PDF report download (403)', async () => {
      const res = await makeHttpRequest(port, reportPath, 'GET', doc2Headers);
      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /do not have permission/i);
    });

    // ========================================================================
    // 9. AUDIT VERIFICATION & GET /api/audit/my-access FOR PATIENTS
    // ========================================================================
    console.log('\n9. Audit Trails & GET /api/audit/my-access ("who looked at my data"):');

    await runAsyncTest('Audit rows exist for denied attempts, decrypted views, and PDF downloads', async () => {
      const deniedAudits = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'RECORD_ACCESS_DENIED'",
        [testRecordId]
      );
      assert.ok(deniedAudits.rows.length >= 4, 'Must have at least 4 denied attempt logs');

      const decryptedAudits = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'RECORD_DECRYPTED'",
        [testRecordId]
      );
      assert.ok(decryptedAudits.rows.length >= 3, 'Must have decrypted view audit logs');

      const reportAudits = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'RECORD_REPORT_DOWNLOADED'",
        [testRecordId]
      );
      assert.ok(reportAudits.rows.length >= 3, 'Must have report download audit logs');
    });

    await runAsyncTest('Non-patient calling GET /api/audit/my-access is rejected with 403', async () => {
      const res = await makeHttpRequest(port, '/api/audit/my-access', 'GET', authorDoctorHeaders);
      assert.equal(res.statusCode, 403);
    });

    await runAsyncTest('Patient calls GET /api/audit/my-access and receives complete access log history', async () => {
      const res = await makeHttpRequest(port, '/api/audit/my-access', 'GET', patientHeaders);
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok(Array.isArray(res.body.accessLogs));

      const actions = res.body.accessLogs.map((l: any) => l.action);
      assert.ok(actions.includes('RECORD_DECRYPTED'), 'Audit history must contain RECORD_DECRYPTED');
      assert.ok(actions.includes('RECORD_REPORT_DOWNLOADED'), 'Audit history must contain RECORD_REPORT_DOWNLOADED');
      assert.ok(actions.includes('RECORD_ACCESS_DENIED'), 'Audit history must contain RECORD_ACCESS_DENIED');
      assert.ok(actions.includes('BREAK_GLASS_ACCESS'), 'Audit history must contain BREAK_GLASS_ACCESS');
    });

    console.log('\n============================================================');
    console.log(`ALL ACCESS TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
    console.log('============================================================\n');
  } finally {
    // Clean up temporary records & second doctor user
    await pool.query("DELETE FROM break_glass_access WHERE record_id LIKE 'rec-access-test-%'");
    await pool.query("DELETE FROM medical_records WHERE id LIKE 'rec-access-test-%'");
    await pool.query("DELETE FROM consent_records WHERE doctor_id LIKE 'doc-test2-%'");
    await pool.query("DELETE FROM doctors WHERE id LIKE 'doc-test2-%'");
    await pool.query("DELETE FROM users WHERE id LIKE 'usr-test-doc2-%'");

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

runAccessTests().catch((err) => {
  console.error('\nAccess test run failed:', err);
  process.exit(1);
});
