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
import { saveEncryptedDocument } from '../server/uploads.js';

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
  const res = await makeHttpRequest(port, '/api/auth/login', 'POST', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload).toString(),
  }, payload);

  if (res.statusCode !== 200 || !res.body?.token) {
    throw new Error(`Login failed for ${email} with status ${res.statusCode}: ${JSON.stringify(res.body)}`);
  }
  return res.body.token;
}

async function runAllTests() {
  console.log('============================================================');
  console.log('Running Module M10: Approval Backend & Admin Controls Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    // 1. Authenticate users to acquire tokens
    const adminToken = await loginUser(port, 'system_admin@fedtrustmed.demo', 'Password123!');
    const doctorToken = await loginUser(port, 'doctor@fedtrustmed.demo', 'Password123!');
    const patientToken = await loginUser(port, 'patient@fedtrustmed.demo', 'Password123!');

    const adminHeaders = {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    };
    const doctorHeaders = {
      Authorization: `Bearer ${doctorToken}`,
      'Content-Type': 'application/json',
    };
    const patientHeaders = {
      Authorization: `Bearer ${patientToken}`,
      'Content-Type': 'application/json',
    };

    // ========================================================================
    // TEST GROUP 1: Non-admin gets 403 on EVERY admin route
    // ========================================================================
    console.log('1. Verifying non-admin gets 403 on every admin route:');

    const adminRoutes = [
      { path: '/api/admin/pending-users', method: 'GET' },
      { path: '/api/admin/verify-user-documents', method: 'POST', body: JSON.stringify({ userId: 'u1' }) },
      { path: '/api/admin/approve-user', method: 'POST', body: JSON.stringify({ userId: 'u1' }) },
      { path: '/api/admin/reject-user', method: 'POST', body: JSON.stringify({ userId: 'u1', reason: 'valid reason' }) },
      { path: '/api/admin/all-users', method: 'GET' },
      { path: '/api/admin/update-permissions', method: 'POST', body: JSON.stringify({ userId: 'u1', permissions: [] }) },
      { path: '/api/admin/documents/dummy-doc-id', method: 'GET' },
    ];

    for (const route of adminRoutes) {
      await runAsyncTest(`DOCTOR token on ${route.method} ${route.path} → 403`, async () => {
        const headers = { ...doctorHeaders };
        if (route.body) {
          headers['Content-Length'] = Buffer.byteLength(route.body).toString();
        }
        const res = await makeHttpRequest(port, route.path, route.method, headers, route.body);
        assert.equal(res.statusCode, 403);
      });

      await runAsyncTest(`PATIENT token on ${route.method} ${route.path} → 403`, async () => {
        const headers = { ...patientHeaders };
        if (route.body) {
          headers['Content-Length'] = Buffer.byteLength(route.body).toString();
        }
        const res = await makeHttpRequest(port, route.path, route.method, headers, route.body);
        assert.equal(res.statusCode, 403);
      });

      await runAsyncTest(`Unauthenticated on ${route.method} ${route.path} → 401`, async () => {
        const res = await makeHttpRequest(port, route.path, route.method, {}, route.body);
        assert.equal(res.statusCode, 401);
      });
    }

    // ========================================================================
    // TEST GROUP 2: Setup test users with PENDING approval status
    // ========================================================================
    console.log('\n2. Setting up test users with PENDING status:');

    const testPassword = 'Password123!';
    const testPasswordHash = await hashPassword(testPassword);

    // Test Patient: PENDING Aadhaar verification
    const pendingPatientId = `usr-test-pending-pat-${Date.now()}`;
    const pendingPatientEmail = `pending.pat.${Date.now()}@test.org`;
    const patientAadhaarHash = crypto.createHash('sha256').update(`aadhaar-pat-${Date.now()}`).digest('hex');

    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, password, aadhaar_hash, aadhaar_last4,
        approval_status, aadhaar_verification_status, hospital_id, hospital_name, created_at, updated_at
      ) VALUES ($1, $2, 'Pending Patient', 'PATIENT', $3, $4, '9991', 'PENDING', 'PENDING', 'hosp-st-jude', 'St. Jude General', NOW(), NOW())`,
      [pendingPatientId, pendingPatientEmail, testPasswordHash, patientAadhaarHash]
    );

    // Test Doctor: PENDING Aadhaar and PENDING Licence
    const pendingDoctorId = `usr-test-pending-doc-${Date.now()}`;
    const pendingDoctorEmail = `pending.doc.${Date.now()}@test.org`;
    const doctorAadhaarHash = crypto.createHash('sha256').update(`aadhaar-doc-${Date.now()}`).digest('hex');
    const doctorLicenseNumber = `MED-LIC-SUBMITTED-${Date.now()}`;

    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, password, aadhaar_hash, aadhaar_last4,
        approval_status, aadhaar_verification_status, medical_license_number,
        medical_license_verification_status, hospital_id, hospital_name, department_id, department_name, created_at, updated_at
      ) VALUES ($1, $2, 'Dr. Pending Doc', 'DOCTOR', $3, $4, '9992', 'PENDING', 'PENDING', $5, 'PENDING', 'hosp-st-jude', 'St. Jude General', 'dept-stjude-cardio', 'Cardiology', NOW(), NOW())`,
      [pendingDoctorId, pendingDoctorEmail, testPasswordHash, doctorAadhaarHash, doctorLicenseNumber]
    );

    // Store encrypted licence PDF for the doctor
    const samplePdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Doctor Medical Licence) >>\nendobj\ntrailer\n<<>>\n%%EOF');
    const storedDoc = await saveEncryptedDocument({
      ownerUserId: pendingDoctorId,
      kind: 'MEDICAL_LICENSE',
      fileBuffer: samplePdfBuffer,
      originalName: 'doctor_licence.pdf',
    });

    runTest('Test pending users and encrypted licence document created', () => {
      assert.ok(pendingPatientId);
      assert.ok(pendingDoctorId);
      assert.ok(storedDoc.id);
    });

    // ========================================================================
    // TEST GROUP 3: GET /api/admin/pending-users
    // ========================================================================
    console.log('\n3. Testing GET /api/admin/pending-users:');

    await runAsyncTest('GET /api/admin/pending-users returns pending users and documents', async () => {
      const res = await makeHttpRequest(port, '/api/admin/pending-users', 'GET', adminHeaders);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.users));

      const foundPatient = res.body.users.find((u: any) => u.id === pendingPatientId);
      assert.ok(foundPatient, 'Pending patient should be listed');
      assert.equal(foundPatient.approvalStatus, 'PENDING');
      assert.equal(foundPatient.password, undefined, 'Password must never be exposed');

      const foundDoctor = res.body.users.find((u: any) => u.id === pendingDoctorId);
      assert.ok(foundDoctor, 'Pending doctor should be listed');
      assert.equal(foundDoctor.medicalLicenseNumber, doctorLicenseNumber);
      assert.ok(Array.isArray(foundDoctor.documents));
      assert.ok(foundDoctor.documents.some((d: any) => d.id === storedDoc.id), 'Doctor uploaded licence document should be included');
    });

    // ========================================================================
    // TEST GROUP 4: Approve without verification gives 403
    // ========================================================================
    console.log('\n4. Testing approve without verification gives 403:');

    await runAsyncTest('Approve patient without Aadhaar verification → 403', async () => {
      const payload = JSON.stringify({ userId: pendingPatientId });
      const res = await makeHttpRequest(
        port,
        '/api/admin/approve-user',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 403);
      assert.ok(res.body.error.includes('Aadhaar'));

      // Verify user remains PENDING
      const checkRes = await pool.query('SELECT approval_status FROM users WHERE id = $1', [pendingPatientId]);
      assert.equal(checkRes.rows[0].approval_status, 'PENDING');
    });

    await runAsyncTest('Approve doctor without licence verification → 403', async () => {
      // First verify doctor's Aadhaar only
      await pool.query(
        "UPDATE users SET aadhaar_verification_status = 'VERIFIED' WHERE id = $1",
        [pendingDoctorId]
      );

      const payload = JSON.stringify({ userId: pendingDoctorId });
      const res = await makeHttpRequest(
        port,
        '/api/admin/approve-user',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 403);
      assert.ok(res.body.error.includes('licence'));

      // Verify doctor remains PENDING
      const checkRes = await pool.query('SELECT approval_status FROM users WHERE id = $1', [pendingDoctorId]);
      assert.equal(checkRes.rows[0].approval_status, 'PENDING');
    });

    // ========================================================================
    // TEST GROUP 5: Verify user documents via POST /api/admin/verify-user-documents
    // ========================================================================
    console.log('\n5. Testing POST /api/admin/verify-user-documents:');

    await runAsyncTest('Verify patient documents updates status to VERIFIED and writes audit log', async () => {
      const payload = JSON.stringify({
        userId: pendingPatientId,
        aadhaarVerified: true,
      });
      const res = await makeHttpRequest(
        port,
        '/api/admin/verify-user-documents',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.equal(res.body.user.aadhaarVerificationStatus, 'VERIFIED');

      // Check DB
      const dbRes = await pool.query('SELECT aadhaar_verification_status FROM users WHERE id = $1', [pendingPatientId]);
      assert.equal(dbRes.rows[0].aadhaar_verification_status, 'VERIFIED');

      // Check audit_logs
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'VERIFY_USER_DOCUMENTS' AND resource_id = $1",
        [pendingPatientId]
      );
      assert.ok(auditRes.rows.length > 0, 'Audit log row must be recorded');
    });

    await runAsyncTest('Verify doctor medical licence updates status to VERIFIED', async () => {
      const payload = JSON.stringify({
        userId: pendingDoctorId,
        aadhaarVerified: true,
        medicalLicenseVerified: true,
      });
      const res = await makeHttpRequest(
        port,
        '/api/admin/verify-user-documents',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.equal(res.body.user.medicalLicenseVerificationStatus, 'VERIFIED');

      const dbRes = await pool.query('SELECT medical_license_verification_status FROM users WHERE id = $1', [pendingDoctorId]);
      assert.equal(dbRes.rows[0].medical_license_verification_status, 'VERIFIED');
    });

    // ========================================================================
    // TEST GROUP 6: After verification gives 200, creates profile row, generates ECC keys
    // ========================================================================
    console.log('\n6. Testing approve after verification gives 200:');

    await runAsyncTest('Approve verified patient → 200, creates patients row, generates ECC keys, creates notification', async () => {
      const payload = JSON.stringify({ userId: pendingPatientId });
      const res = await makeHttpRequest(
        port,
        '/api/admin/approve-user',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.equal(res.body.user.approvalStatus, 'APPROVED');

      // 1. Verify user table updated
      const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [pendingPatientId]);
      const user = userRes.rows[0];
      assert.equal(user.approval_status, 'APPROVED');
      assert.ok(user.public_key_ecc, 'ECC public key must be generated');
      assert.ok(user.public_key_ecc.includes('BEGIN PUBLIC KEY'));
      assert.ok(user.private_key_enc, 'Sealed private key must be saved');

      // 2. Verify patients table row created
      const patRes = await pool.query('SELECT * FROM patients WHERE user_id = $1', [pendingPatientId]);
      assert.equal(patRes.rows.length, 1, 'patients row must be created');
      assert.equal(patRes.rows[0].email, pendingPatientEmail);
      assert.equal(patRes.rows[0].full_name, 'Pending Patient');

      // 3. Verify notification created
      const notifRes = await pool.query('SELECT * FROM notifications WHERE user_id = $1', [pendingPatientId]);
      assert.ok(notifRes.rows.length > 0, 'Notification must be created for approved user');
      assert.equal(notifRes.rows[0].type, 'SUCCESS');

      // 4. Verify audit log
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'USER_APPROVED' AND resource_id = $1",
        [pendingPatientId]
      );
      assert.ok(auditRes.rows.length > 0, 'Audit log for USER_APPROVED must exist');
    });

    await runAsyncTest('Approve verified doctor → 200, creates doctors row, NEVER overwrites licence number', async () => {
      const payload = JSON.stringify({ userId: pendingDoctorId });
      const res = await makeHttpRequest(
        port,
        '/api/admin/approve-user',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.equal(res.body.user.approvalStatus, 'APPROVED');

      // 1. Verify user table licence number NOT overwritten
      const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [pendingDoctorId]);
      assert.equal(userRes.rows[0].medical_license_number, doctorLicenseNumber, 'User licence number must be preserved');

      // 2. Verify doctors table row created with exact licence number
      const docRes = await pool.query('SELECT * FROM doctors WHERE user_id = $1', [pendingDoctorId]);
      assert.equal(docRes.rows.length, 1, 'doctors row must be created');
      assert.equal(docRes.rows[0].license_number, doctorLicenseNumber, 'Doctor profile licence must match submitted number');
      assert.equal(docRes.rows[0].full_name, 'Dr. Pending Doc');
    });

    // ========================================================================
    // TEST GROUP 7: The approved user can then log in and has a profile row
    // ========================================================================
    console.log('\n7. Testing approved user can now log in:');

    await runAsyncTest('Approved patient can now log in successfully (200) and receive JWT token', async () => {
      const token = await loginUser(port, pendingPatientEmail, testPassword);
      assert.ok(token, 'JWT token returned on login');

      // Verify profile row exists in PostgreSQL
      const patRes = await pool.query('SELECT * FROM patients WHERE user_id = $1', [pendingPatientId]);
      assert.equal(patRes.rows.length, 1, 'Patient has an active profile row');
    });

    await runAsyncTest('Approved doctor can now log in successfully (200) and has profile row', async () => {
      const token = await loginUser(port, pendingDoctorEmail, testPassword);
      assert.ok(token, 'JWT token returned on doctor login');

      const docRes = await pool.query('SELECT * FROM doctors WHERE user_id = $1', [pendingDoctorId]);
      assert.equal(docRes.rows.length, 1, 'Doctor has an active profile row');
    });

    // ========================================================================
    // TEST GROUP 8: Rejection flow & rejected user CANNOT log in
    // ========================================================================
    console.log('\n8. Testing user rejection flow & rejected user cannot log in:');

    // Create a pending user to test rejection
    const rejectTargetId = `usr-test-reject-${Date.now()}`;
    const rejectTargetEmail = `rejected.${Date.now()}@test.org`;
    const rejectAadhaarHash = crypto.createHash('sha256').update(`aadhaar-rej-${Date.now()}`).digest('hex');

    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, password, aadhaar_hash, aadhaar_last4,
        approval_status, aadhaar_verification_status, hospital_id, hospital_name, created_at, updated_at
      ) VALUES ($1, $2, 'To Be Rejected', 'PATIENT', $3, $4, '9993', 'PENDING', 'PENDING', 'hosp-st-jude', 'St. Jude General', NOW(), NOW())`,
      [rejectTargetId, rejectTargetEmail, testPasswordHash, rejectAadhaarHash]
    );

    await runAsyncTest('Reject user with reason too short (< 5 chars) → 400', async () => {
      const payload = JSON.stringify({ userId: rejectTargetId, reason: 'Bad' });
      const res = await makeHttpRequest(
        port,
        '/api/admin/reject-user',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 400);
      assert.ok(res.body.error.includes('between 5 and 300 characters'));
    });

    await runAsyncTest('Reject user with reason 5-300 chars → 200, updates status, saves reason, creates notification and audit log', async () => {
      const rejectionReason = 'Incomplete documentation: Aadhaar details could not be matched with hospital records.';
      const payload = JSON.stringify({ userId: rejectTargetId, reason: rejectionReason });
      const res = await makeHttpRequest(
        port,
        '/api/admin/reject-user',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.equal(res.body.user.approvalStatus, 'REJECTED');

      // Check DB
      const userRes = await pool.query('SELECT approval_status, rejection_reason FROM users WHERE id = $1', [rejectTargetId]);
      assert.equal(userRes.rows[0].approval_status, 'REJECTED');
      assert.equal(userRes.rows[0].rejection_reason, rejectionReason);

      // Check notification
      const notifRes = await pool.query('SELECT * FROM notifications WHERE user_id = $1', [rejectTargetId]);
      assert.ok(notifRes.rows.length > 0);
      assert.equal(notifRes.rows[0].type, 'ALERT');
      assert.equal(notifRes.rows[0].message, rejectionReason);

      // Check audit log
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'USER_REJECTED' AND resource_id = $1",
        [rejectTargetId]
      );
      assert.ok(auditRes.rows.length > 0);
    });

    await runAsyncTest('Rejected user cannot log in (returns 403 with rejection reason)', async () => {
      const payload = JSON.stringify({ email: rejectTargetEmail, password: testPassword });
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 403);
      assert.ok(res.body.error.includes('rejected'));
    });

    // ========================================================================
    // TEST GROUP 9: GET /api/admin/all-users and POST /api/admin/update-permissions
    // ========================================================================
    console.log('\n9. Testing GET /api/admin/all-users and POST /api/admin/update-permissions:');

    await runAsyncTest('GET /api/admin/all-users returns all users sanitized', async () => {
      const res = await makeHttpRequest(port, '/api/admin/all-users', 'GET', adminHeaders);
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);
      assert.ok(Array.isArray(res.body.users));
      assert.ok(res.body.users.length >= 3);

      for (const u of res.body.users) {
        assert.equal(u.password, undefined, 'No passwords allowed');
        assert.equal(u.privateKeyEnc, undefined, 'No sealed keys allowed');
      }
    });

    await runAsyncTest('POST /api/admin/update-permissions updates user permissions with audit log', async () => {
      const newPermissions = ['READ_RECORDS', 'AUDIT_EXPORT', 'CONSENT_OVERRIDE'];
      const payload = JSON.stringify({
        userId: pendingDoctorId,
        permissions: newPermissions,
      });
      const res = await makeHttpRequest(
        port,
        '/api/admin/update-permissions',
        'POST',
        { ...adminHeaders, 'Content-Length': Buffer.byteLength(payload).toString() },
        payload
      );
      assert.equal(res.statusCode, 200);
      assert.ok(res.body.success);

      const checkRes = await pool.query('SELECT data_access_permissions FROM users WHERE id = $1', [pendingDoctorId]);
      assert.deepEqual(checkRes.rows[0].data_access_permissions, newPermissions);

      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'PERMISSIONS_UPDATED' AND resource_id = $1",
        [pendingDoctorId]
      );
      assert.ok(auditRes.rows.length > 0);
    });

    // ========================================================================
    // TEST GROUP 10: GET /api/admin/documents/:id (opens licence document, audited)
    // ========================================================================
    console.log('\n10. Testing GET /api/admin/documents/:id:');

    await runAsyncTest('GET /api/admin/documents/:id decrypts and streams document byte-identical with audit log', async () => {
      const res = await makeHttpRequest(port, `/api/admin/documents/${storedDoc.id}`, 'GET', adminHeaders);
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
      assert.equal(res.headers['content-type'], 'application/pdf');
      assert.deepEqual(res.rawBody, samplePdfBuffer, 'Decrypted stream must match original PDF plaintext exactly');

      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'DOCUMENT_VIEW' AND resource_id = $1",
        [storedDoc.id]
      );
      assert.ok(auditRes.rows.length > 0, 'Document view must be audited');
    });

    await runAsyncTest('GET /api/admin/documents/:id for non-existent doc returns 404', async () => {
      const res = await makeHttpRequest(port, '/api/admin/documents/non-existent-doc-id', 'GET', adminHeaders);
      assert.equal(res.statusCode, 404);
    });

    console.log('\n============================================================');
    console.log(`ALL M10 APPROVAL BACKEND TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
    console.log('============================================================\n');

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Test suite failed:', err);
  pool.end().finally(() => process.exit(1));
});
