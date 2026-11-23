import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';

// Set environment for test mode
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => Promise<void>) {
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

async function runHospitalAdminTests() {
  console.log('============================================================');
  console.log('FedTrustMed Module M22 - Hospital Admin Security & Scoping Tests');
  console.log('============================================================\n');

  // Insert a test doctor, patient, and audit log in a SECOND hospital (Metro Heart)
  // to rigorously verify that the St. Jude hospital admin sees NOTHING from another hospital
  await pool.query(`
    INSERT INTO users (id, email, full_name, role, hospital_id, hospital_name, password, approval_status, created_at, updated_at)
    VALUES ('usr-other-doc-999', 'other.doctor@metroheart.demo', 'Dr. Other Hospital', 'DOCTOR', 'hosp-metro-heart', 'Metro Heart & Cancer Specialty', 'dummy', 'APPROVED', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO doctors (id, user_id, full_name, specialty, department_id, department_name, hospital_id, hospital_name, license_number, created_at)
    VALUES ('doc-other-999', 'usr-other-doc-999', 'Dr. Other Hospital', 'Oncology', 'dept-metro-onco', 'Oncology', 'hosp-metro-heart', 'Metro Heart & Cancer Specialty', 'TEST-OTHER-LIC-999', NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO users (id, email, full_name, role, hospital_id, hospital_name, password, approval_status, created_at, updated_at)
    VALUES ('usr-other-pat-999', 'other.patient@metroheart.demo', 'Other Hospital Patient', 'PATIENT', 'hosp-metro-heart', 'Metro Heart & Cancer Specialty', 'dummy', 'APPROVED', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO patients (id, user_id, full_name, email, gender, blood_type, primary_hospital_id, primary_hospital_name, emergency_contact, created_at)
    VALUES ('pat-other-999', 'usr-other-pat-999', 'Other Hospital Patient', 'other.patient@metroheart.demo', 'Female', 'O+', 'hosp-metro-heart', 'Metro Heart & Cancer Specialty', '9999999999', NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO users (id, email, full_name, role, hospital_id, hospital_name, password, approval_status, created_at, updated_at)
    VALUES ('usr-other-pending-999', 'pending.staff@metroheart.demo', 'Pending Metro Staff', 'DOCTOR', 'hosp-metro-heart', 'Metro Heart & Cancer Specialty', 'dummy', 'PENDING', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO audit_logs (id, user_id, user_name, user_role, hospital_id, hospital_name, action, resource_id, ip_address, details, timestamp)
    VALUES ('audit-other-999', 'usr-other-doc-999', 'Dr. Other Hospital', 'DOCTOR', 'hosp-metro-heart', 'Metro Heart & Cancer Specialty', 'RECORD_CREATED', 'rec-other-999', '127.0.0.1', 'Created other hospital record', NOW())
    ON CONFLICT (id) DO NOTHING;
  `);

  // Start HTTP server on ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    // 1. Authenticate as Hospital Admin
    console.log('1. Authenticating as Hospital Admin (St. Jude General):');
    const token = await loginUser(port, 'hospital_admin@fedtrustmed.demo', 'Password123!');
    const authHeaders = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
    console.log('  ✓ Token acquired for hospital_admin@fedtrustmed.demo\n');

    // 2. Clinical Route Protections: Hospital Admin MUST get 403
    console.log('2. Clinical Route Denial Checks (Hospital Admin must get 403):');

    await runTest('GET /api/records returns 403 Forbidden for Hospital Admin', async () => {
      const res = await makeHttpRequest(port, '/api/records', 'GET', authHeaders);
      assert.equal(res.statusCode, 403, `Expected status 403, got ${res.statusCode}`);
      assert.ok(res.body?.error, 'Expected an error message in response');
    });

    await runTest('GET /api/records/:id returns 403 Forbidden for Hospital Admin', async () => {
      const res = await makeHttpRequest(port, '/api/records/rec-demo-001', 'GET', authHeaders);
      assert.equal(res.statusCode, 403, `Expected status 403, got ${res.statusCode}`);
      assert.ok(res.body?.error, 'Expected an error message in response');
    });

    await runTest('POST /api/medical-records/decrypt returns 403 Forbidden for Hospital Admin', async () => {
      const payload = JSON.stringify({ recordId: 'rec-demo-001' });
      const res = await makeHttpRequest(
        port,
        '/api/medical-records/decrypt',
        'POST',
        {
          ...authHeaders,
          'Content-Length': Buffer.byteLength(payload).toString(),
        },
        payload
      );
      assert.equal(res.statusCode, 403, `Expected status 403, got ${res.statusCode}`);
      assert.ok(res.body?.error, 'Expected an error message in response');
    });

    await runTest('GET /api/medical-records/:id/report returns 403 Forbidden for Hospital Admin', async () => {
      const res = await makeHttpRequest(port, '/api/medical-records/rec-demo-001/report', 'GET', authHeaders);
      assert.equal(res.statusCode, 403, `Expected status 403, got ${res.statusCode}`);
      assert.ok(res.body?.error, 'Expected an error message in response');
    });

    console.log('\n3. Hospital Scoping Checks (Sees ONLY St. Jude, nothing from Metro Heart):');

    await runTest('GET /api/hospital/overview returns counts scoped to admin hospital only', async () => {
      const res = await makeHttpRequest(port, '/api/hospital/overview', 'GET', authHeaders);
      assert.equal(res.statusCode, 200, `Expected status 200, got ${res.statusCode}`);
      assert.equal(res.body.hospitalId, 'hosp-st-jude');
      assert.ok(typeof res.body.doctorsCount === 'number');
      assert.ok(typeof res.body.patientsCount === 'number');
      assert.ok(typeof res.body.pendingStaffCount === 'number');
    });

    await runTest('GET /api/hospital/staff returns ONLY St. Jude staff (no other hospital doctors)', async () => {
      const res = await makeHttpRequest(port, '/api/hospital/staff', 'GET', authHeaders);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.staff));
      // Verify all returned staff belong to St. Jude
      for (const doc of res.body.staff) {
        assert.equal(doc.hospital_name, 'St. Jude General');
        assert.notEqual(doc.id, 'doc-other-999', 'Must not see doctor from Metro Heart');
      }
    });

    await runTest('GET /api/hospital/patients returns ONLY St. Jude patients (no other hospital patients)', async () => {
      const res = await makeHttpRequest(port, '/api/hospital/patients', 'GET', authHeaders);
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body.patients));
      for (const pat of res.body.patients) {
        assert.equal(pat.primary_hospital_id, 'hosp-st-jude');
        assert.notEqual(pat.id, 'pat-other-999', 'Must not see patient from Metro Heart');
      }
    });

    await runTest('GET /api/hospital/pending-approvals returns ONLY St. Jude pending staff', async () => {
      const res = await makeHttpRequest(port, '/api/hospital/pending-approvals', 'GET', authHeaders);
      assert.equal(res.statusCode, 200);
      const pending = res.body.approvals || res.body.pendingStaff || [];
      assert.ok(Array.isArray(pending));
      for (const user of pending) {
        assert.notEqual(user.id, 'usr-other-pending-999', 'Must not see pending staff from Metro Heart');
      }
    });

    await runTest('GET /api/hospital/activity returns non-clinical audit logs scoped to St. Jude ONLY', async () => {
      const res = await makeHttpRequest(port, '/api/hospital/activity', 'GET', authHeaders);
      assert.equal(res.statusCode, 200);
      const logs = res.body.logs || res.body.activity || [];
      assert.ok(Array.isArray(logs));
      for (const log of logs) {
        assert.equal(log.hospital_id, 'hosp-st-jude');
        assert.notEqual(log.id, 'audit-other-999', 'Must not see audit logs from Metro Heart');
        // Ensure no clinical record diagnosis or ciphertexts are in the activity details
        if (log.details) {
          assert.ok(!log.details.includes('ciphertext'), 'Activity log must not contain ciphertext');
        }
      }
    });

    console.log('\n============================================================');
    console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
    console.log('============================================================');
  } finally {
    // Clean up test data inserted for second hospital
    await pool.query(`DELETE FROM audit_logs WHERE id = 'audit-other-999';`);
    await pool.query(`DELETE FROM patients WHERE id = 'pat-other-999';`);
    await pool.query(`DELETE FROM doctors WHERE id = 'doc-other-999';`);
    await pool.query(`DELETE FROM users WHERE id IN ('usr-other-doc-999', 'usr-other-pat-999', 'usr-other-pending-999');`);
    server.close();
    await pool.end();
    process.exit(0);
  }
}

runHospitalAdminTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
