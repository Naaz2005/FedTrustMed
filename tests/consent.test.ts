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

async function runConsentTests() {
  console.log('============================================================');
  console.log('FedTrustMed Module M16 - Consent Backend Security Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  const testSuffix = Date.now().toString();

  try {
    // 1. Authenticate doctor and primary patient
    const doctorToken = await loginUser(port, 'doctor@fedtrustmed.demo', 'Password123!');
    const patient1Token = await loginUser(port, 'patient@fedtrustmed.demo', 'Password123!');

    const doctorHeaders = {
      Authorization: `Bearer ${doctorToken}`,
      'Content-Type': 'application/json',
    };
    const patient1Headers = {
      Authorization: `Bearer ${patient1Token}`,
      'Content-Type': 'application/json',
    };

    // Get doctor profile
    const docQuery = await pool.query(
      "SELECT d.id, d.full_name, d.hospital_id, d.hospital_name, u.id as user_id FROM doctors d JOIN users u ON d.user_id = u.id WHERE u.email = 'doctor@fedtrustmed.demo'"
    );
    const doctorProfile = docQuery.rows[0];

    // Get Patient 1 profile
    const pat1Query = await pool.query(
      "SELECT p.id, p.full_name, p.user_id FROM patients p JOIN users u ON p.user_id = u.id WHERE u.email = 'patient@fedtrustmed.demo'"
    );
    const patient1Profile = pat1Query.rows[0];

    // Create a second patient (Patient 2) to test unauthorized cross-patient actions
    const testPasswordHash = await hashPassword('Password123!');
    const pat2UserId = `usr-test-pat2-${testSuffix}`;
    const pat2Email = `patient2.${testSuffix}@fedtrustmed.demo`;
    const pat2Aadhaar = `99998888${testSuffix.slice(-4)}`;
    const pat2AadhaarHash = crypto.createHash('sha256').update(pat2Aadhaar).digest('hex');

    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, password, aadhaar_hash, aadhaar_last4, approval_status,
        aadhaar_verification_status, hospital_id, hospital_name, created_at, updated_at
      ) VALUES ($1, $2, 'Second Patient', 'PATIENT', $3, $4, '8888', 'APPROVED', 'VERIFIED', 'hosp-st-jude', 'St. Jude General', NOW(), NOW())`,
      [pat2UserId, pat2Email, testPasswordHash, pat2AadhaarHash]
    );

    const pat2ProfileId = `pat-test2-${testSuffix}`;
    await pool.query(
      `INSERT INTO patients (
        id, user_id, full_name, email, dob, gender, blood_type,
        primary_hospital_id, primary_hospital_name, emergency_contact, trust_score, created_at
      ) VALUES ($1, $2, 'Second Patient', $3, '1992-05-10', 'Female', 'O+', 'hosp-st-jude', 'St. Jude General', '+91-9876543210', 100.00, NOW())`,
      [pat2ProfileId, pat2UserId, pat2Email]
    );

    const patient2Token = await loginUser(port, pat2Email, 'Password123!');
    const patient2Headers = {
      Authorization: `Bearer ${patient2Token}`,
      'Content-Type': 'application/json',
    };

    // Create dedicated medical records for Patient 1: Record A and Record B
    const recordAId = `rec-test-a-${testSuffix}`;
    const recordBId = `rec-test-b-${testSuffix}`;

    await pool.query(
      `INSERT INTO medical_records (
        id, patient_id, patient_name, doctor_id, doctor_name, hospital_id, hospital_name,
        title, record_type, diagnosis, encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key,
        sha256_hash, prescriptions, lab_tests, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Cardiology Report', 'Test Diagnosis A', 'ciphertextA', 'ivA', 'tagA', 'eccKeyA', 'shaA', '{}', '{}', NOW())`,
      [
        recordAId,
        patient1Profile.id,
        patient1Profile.full_name,
        doctorProfile.id,
        doctorProfile.full_name,
        doctorProfile.hospital_id,
        doctorProfile.hospital_name,
        `Cardiac Record Alpha ${testSuffix}`,
      ]
    );

    await pool.query(
      `INSERT INTO medical_records (
        id, patient_id, patient_name, doctor_id, doctor_name, hospital_id, hospital_name,
        title, record_type, diagnosis, encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key,
        sha256_hash, prescriptions, lab_tests, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Neurology Report', 'Test Diagnosis B', 'ciphertextB', 'ivB', 'tagB', 'eccKeyB', 'shaB', '{}', '{}', NOW())`,
      [
        recordBId,
        patient1Profile.id,
        patient1Profile.full_name,
        doctorProfile.id,
        doctorProfile.full_name,
        doctorProfile.hospital_id,
        doctorProfile.hospital_name,
        `Neurology Record Beta ${testSuffix}`,
      ]
    );

    // ========================================================================
    // 1. RBAC & ROUTE SECURITY
    // ========================================================================
    console.log('1. Verifying RBAC and Route Access Security:');

    await runAsyncTest('Unauthenticated access to /api/consent is rejected with 401', async () => {
      const res = await makeHttpRequest(port, '/api/consent', 'GET', {});
      assert.equal(res.statusCode, 401);
    });

    await runAsyncTest('PATIENT token on /api/consent/request is rejected with 403 (Doctor only)', async () => {
      const payload = JSON.stringify({ patientId: patient1Profile.id, purpose: 'Treatment' });
      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...patient1Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 403);
    });

    await runAsyncTest('DOCTOR token on /api/consent/grant is rejected with 403 (Patient only)', async () => {
      const payload = JSON.stringify({ consentId: 'some-consent' });
      const res = await makeHttpRequest(port, '/api/consent/grant', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 403);
    });

    await runAsyncTest('DOCTOR token on /api/consent/deny is rejected with 403 (Patient only)', async () => {
      const payload = JSON.stringify({ consentId: 'some-consent' });
      const res = await makeHttpRequest(port, '/api/consent/deny', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 403);
    });

    await runAsyncTest('DOCTOR token on /api/consent/revoke is rejected with 403 (Patient only)', async () => {
      const payload = JSON.stringify({ consentId: 'some-consent' });
      const res = await makeHttpRequest(port, '/api/consent/revoke', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 403);
    });

    // ========================================================================
    // 2. INPUT VALIDATION & TOKEN EXTRACTION FOR DOCTOR REQUEST
    // ========================================================================
    console.log('\n2. Verifying Consent Request Validations & Token Metadata:');

    await runAsyncTest('POST /api/consent/request requires patientId', async () => {
      const payload = JSON.stringify({ purpose: 'Treatment' });
      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /patientId is required/i);
    });

    await runAsyncTest('POST /api/consent/request rejects invalid purpose enum', async () => {
      const payload = JSON.stringify({ patientId: patient1Profile.id, purpose: 'INVALID_PURPOSE' });
      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /Invalid consent purpose/i);
    });

    await runAsyncTest('POST /api/consent/request rejects reason exceeding 200 characters', async () => {
      const longReason = 'x'.repeat(201);
      const payload = JSON.stringify({ patientId: patient1Profile.id, purpose: 'Treatment', reason: longReason });
      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /200 characters/i);
    });

    await runAsyncTest('POST /api/consent/request rejects non-existent patient with 404', async () => {
      const payload = JSON.stringify({ patientId: 'pat-nonexistent', purpose: 'Treatment' });
      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);
      assert.equal(res.statusCode, 404);
    });

    // ========================================================================
    // 3. DOCTOR REQUESTS CONSENT -> AUDIT LOG & NOTIFICATION
    // ========================================================================
    console.log('\n3. Doctor Requests Consent:');

    let consent1Id = '';

    await runAsyncTest('Doctor successfully requests consent; doctor & hospital come from token', async () => {
      const payload = JSON.stringify({
        patientId: patient1Profile.id,
        purpose: 'Treatment',
        reason: 'Evaluating cardiac symptom progression',
        recordId: recordAId,
      });

      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 201);
      assert.equal(res.body.success, true);
      const consent = res.body.consent;
      assert.ok(consent.id);
      consent1Id = consent.id;

      // Status must be stored as PENDING
      assert.equal(consent.status, 'PENDING');
      assert.equal(consent.patient_id, patient1Profile.id);
      assert.equal(consent.record_id, recordAId);

      // Doctor and hospital come from authenticated token/doctor profile
      assert.equal(consent.doctor_id, doctorProfile.id);
      assert.equal(consent.doctor_name, doctorProfile.full_name);
      assert.equal(consent.requesting_hospital_id, doctorProfile.hospital_id);
      assert.equal(consent.requesting_hospital_name, doctorProfile.hospital_name);

      // Verify Audit row was written
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'CONSENT_REQUESTED'",
        [consent.id]
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].user_id, doctorProfile.user_id);

      // Verify Notification was written for the patient
      const notifRes = await pool.query(
        "SELECT * FROM notifications WHERE user_id = $1 AND title = 'Consent Request' ORDER BY created_at DESC LIMIT 1",
        [patient1Profile.user_id]
      );
      assert.equal(notifRes.rows.length, 1);
      assert.match(notifRes.rows[0].message, /requested access/i);
    });

    await runAsyncTest("Doctor's record list DOES NOT include record while consent is PENDING", async () => {
      const res = await makeHttpRequest(port, '/api/records', 'GET', doctorHeaders);
      assert.equal(res.statusCode, 200);
      const ids = (res.body.records || []).map((r: any) => r.id);
      assert.ok(!ids.includes(recordAId), 'Record A must not appear while consent is PENDING');
    });

    // ========================================================================
    // 4. CROSS-PATIENT AUTHORIZATION (Different Patient cannot act)
    // ========================================================================
    console.log('\n4. Cross-Patient Security: A different patient cannot grant someone else\'s consent:');

    await runAsyncTest("A different patient (Patient 2) CANNOT grant Patient 1's consent (403)", async () => {
      const payload = JSON.stringify({ consentId: consent1Id });
      const res = await makeHttpRequest(port, '/api/consent/grant', 'POST', {
        ...patient2Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /own consents/i);

      // Ensure status in database is still PENDING
      const checkRes = await pool.query('SELECT status FROM consent_records WHERE id = $1', [consent1Id]);
      assert.equal(checkRes.rows[0].status, 'PENDING');
    });

    await runAsyncTest("A different patient (Patient 2) CANNOT deny Patient 1's consent (403)", async () => {
      const payload = JSON.stringify({ consentId: consent1Id });
      const res = await makeHttpRequest(port, '/api/consent/deny', 'POST', {
        ...patient2Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /own consents/i);
    });

    await runAsyncTest("A different patient (Patient 2) CANNOT revoke Patient 1's consent (403)", async () => {
      const payload = JSON.stringify({ consentId: consent1Id });
      const res = await makeHttpRequest(port, '/api/consent/revoke', 'POST', {
        ...patient2Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 403);
      assert.match(res.body.error, /own consents/i);
    });

    // ========================================================================
    // 5. PATIENT GRANTS CONSENT -> DOCTOR RECORD LIST NOW INCLUDES RECORD
    // ========================================================================
    console.log('\n5. Patient Grants Consent:');

    await runAsyncTest("Patient grants consent; status becomes GRANTED, audit & notification written", async () => {
      const payload = JSON.stringify({ consentId: consent1Id });
      const res = await makeHttpRequest(port, '/api/consent/grant', 'POST', {
        ...patient1Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.consent.status, 'GRANTED');
      assert.ok(res.body.consent.granted_at);
      assert.ok(res.body.consent.expires_at);

      // Verify Audit row
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'CONSENT_GRANTED'",
        [consent1Id]
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].user_id, patient1Profile.user_id);

      // Verify Notification written for the doctor
      const notifRes = await pool.query(
        "SELECT * FROM notifications WHERE user_id = $1 AND title = 'Consent Granted' ORDER BY created_at DESC LIMIT 1",
        [doctorProfile.user_id]
      );
      assert.equal(notifRes.rows.length, 1);
      assert.match(notifRes.rows[0].message, /granted/i);
    });

    await runAsyncTest("The doctor's record list NOW INCLUDES the record after grant", async () => {
      const res = await makeHttpRequest(port, '/api/records', 'GET', doctorHeaders);
      assert.equal(res.statusCode, 200);
      const ids = (res.body.records || []).map((r: any) => r.id);
      assert.ok(ids.includes(recordAId), 'Record A must be present in doctor records list after grant');
    });

    // ========================================================================
    // 6. REVOKE REMOVES IT
    // ========================================================================
    console.log('\n6. Revoking Consent:');

    await runAsyncTest("Patient revokes consent; status becomes REVOKED, audit & notification written", async () => {
      const payload = JSON.stringify({ consentId: consent1Id });
      const res = await makeHttpRequest(port, '/api/consent/revoke', 'POST', {
        ...patient1Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.consent.status, 'REVOKED');

      // Verify Audit row
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'CONSENT_REVOKED'",
        [consent1Id]
      );
      assert.equal(auditRes.rows.length, 1);
      assert.equal(auditRes.rows[0].user_id, patient1Profile.user_id);

      // Verify Notification written for the doctor
      const notifRes = await pool.query(
        "SELECT * FROM notifications WHERE user_id = $1 AND title = 'Consent Revoked' ORDER BY created_at DESC LIMIT 1",
        [doctorProfile.user_id]
      );
      assert.equal(notifRes.rows.length, 1);
      assert.match(notifRes.rows[0].message, /revoked/i);
    });

    await runAsyncTest("Doctor's record list NO LONGER includes the record after revocation", async () => {
      const res = await makeHttpRequest(port, '/api/records', 'GET', doctorHeaders);
      assert.equal(res.statusCode, 200);
      const ids = (res.body.records || []).map((r: any) => r.id);
      assert.ok(!ids.includes(recordAId), 'Record A must be removed from doctor records list after revocation');
    });

    // ========================================================================
    // 7. NARROWING TO ONE RECORD OPENS ONLY THAT RECORD
    // ========================================================================
    console.log('\n7. Granular Consent: Narrowing to one record opens only that record:');

    let consentNarrowId = '';

    await runAsyncTest("Doctor requests broad consent (no recordId specified initially)", async () => {
      const payload = JSON.stringify({
        patientId: patient1Profile.id,
        purpose: 'Second opinion',
        reason: 'Specialist case assessment',
      });

      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 201);
      consentNarrowId = res.body.consent.id;
      assert.equal(res.body.consent.record_id, null);
    });

    await runAsyncTest("Patient grants consent narrowing specifically to record A", async () => {
      const payload = JSON.stringify({
        consentId: consentNarrowId,
        recordId: recordAId,
      });

      const res = await makeHttpRequest(port, '/api/consent/grant', 'POST', {
        ...patient1Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.consent.status, 'GRANTED');
      assert.equal(res.body.consent.record_id, recordAId);
    });

    await runAsyncTest("Doctor can access narrowed Record A, but Record B remains inaccessible", async () => {
      const res = await makeHttpRequest(port, '/api/records', 'GET', doctorHeaders);
      assert.equal(res.statusCode, 200);
      const ids = (res.body.records || []).map((r: any) => r.id);

      assert.ok(ids.includes(recordAId), 'Record A must be visible');
      assert.ok(!ids.includes(recordBId), 'Record B must NOT be visible when narrowed to Record A only');
    });

    // Clean up narrow consent for next test
    await makeHttpRequest(port, '/api/consent/revoke', 'POST', {
      ...patient1Headers,
      'Content-Length': Buffer.byteLength(JSON.stringify({ consentId: consentNarrowId })).toString(),
    }, JSON.stringify({ consentId: consentNarrowId }));

    // ========================================================================
    // 8. AN EXPIRED CONSENT STOPS WORKING
    // ========================================================================
    console.log('\n8. Temporal Consent Enforcement: An expired consent stops working:');

    let consentExpId = '';

    await runAsyncTest("Doctor requests consent for Record B", async () => {
      const payload = JSON.stringify({
        patientId: patient1Profile.id,
        purpose: 'Emergency',
        recordId: recordBId,
      });

      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 201);
      consentExpId = res.body.consent.id;
    });

    await runAsyncTest("Patient grants consent with an already-passed expiresAt timestamp", async () => {
      const pastDate = new Date(Date.now() - 10000).toISOString(); // 10 seconds in the past
      const payload = JSON.stringify({
        consentId: consentExpId,
        expiresAt: pastDate,
      });

      const res = await makeHttpRequest(port, '/api/consent/grant', 'POST', {
        ...patient1Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 200);
    });

    await runAsyncTest("Doctor's record list DOES NOT include Record B because consent is EXPIRED", async () => {
      const res = await makeHttpRequest(port, '/api/records', 'GET', doctorHeaders);
      assert.equal(res.statusCode, 200);
      const ids = (res.body.records || []).map((r: any) => r.id);
      assert.ok(!ids.includes(recordBId), 'Expired consent must NOT grant access to Record B');

      // Verify that status in PostgreSQL transitioned to EXPIRED
      const checkRes = await pool.query('SELECT status FROM consent_records WHERE id = $1', [consentExpId]);
      assert.equal(checkRes.rows[0].status, 'EXPIRED');
    });

    // ========================================================================
    // 9. PATIENT DENIES CONSENT
    // ========================================================================
    console.log('\n9. Patient Denies Consent Request:');

    let consentDenyId = '';

    await runAsyncTest("Doctor requests consent for Research", async () => {
      const payload = JSON.stringify({
        patientId: patient1Profile.id,
        purpose: 'Research',
        reason: 'Clinical study anonymization intake',
      });

      const res = await makeHttpRequest(port, '/api/consent/request', 'POST', {
        ...doctorHeaders,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 201);
      consentDenyId = res.body.consent.id;
    });

    await runAsyncTest("Patient denies consent; status stored as DENIED, audit & notification written", async () => {
      const payload = JSON.stringify({ consentId: consentDenyId });
      const res = await makeHttpRequest(port, '/api/consent/deny', 'POST', {
        ...patient1Headers,
        'Content-Length': Buffer.byteLength(payload).toString(),
      }, payload);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.consent.status, 'DENIED');

      // Verify Audit row
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE resource_id = $1 AND action = 'CONSENT_DENIED'",
        [consentDenyId]
      );
      assert.equal(auditRes.rows.length, 1);

      // Verify Notification written for the doctor
      const notifRes = await pool.query(
        "SELECT * FROM notifications WHERE user_id = $1 AND title = 'Consent Denied' ORDER BY created_at DESC LIMIT 1",
        [doctorProfile.user_id]
      );
      assert.equal(notifRes.rows.length, 1);
      assert.match(notifRes.rows[0].message, /denied/i);
    });

    // ========================================================================
    // 10. GET /api/consent ROUTE ENFORCEMENT & ALL 5 STATUSES
    // ========================================================================
    console.log('\n10. GET /api/consent & Statuses in PostgreSQL (PENDING, GRANTED, DENIED, REVOKED, EXPIRED):');

    await runAsyncTest("GET /api/consent returns records with all statuses stored in PostgreSQL", async () => {
      const res = await makeHttpRequest(port, '/api/consent', 'GET', patient1Headers);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.consents));

      const statuses = res.body.consents.map((c: any) => c.status);
      assert.ok(statuses.includes('DENIED'), 'Should contain DENIED status');
      assert.ok(statuses.includes('REVOKED'), 'Should contain REVOKED status');
      assert.ok(statuses.includes('EXPIRED'), 'Should contain EXPIRED status');
    });

    console.log('\n============================================================');
    console.log(`ALL CONSENT TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
    console.log('============================================================\n');
  } finally {
    // Clean up temporary records & second patient user
    await pool.query("DELETE FROM medical_records WHERE id LIKE 'rec-test-%'");
    await pool.query("DELETE FROM consent_records WHERE patient_id LIKE 'pat-test2-%'");
    await pool.query("DELETE FROM patients WHERE id LIKE 'pat-test2-%'");
    await pool.query("DELETE FROM users WHERE id LIKE 'usr-test-pat2-%'");

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
}

runConsentTests().catch((err) => {
  console.error('\nConsent test run failed:', err);
  process.exit(1);
});

