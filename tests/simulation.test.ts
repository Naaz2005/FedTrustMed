import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { AddressInfo } from 'node:net';

// Set environment for test mode initially
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import {
  verifySimulationOnboarding,
  getSimulationRegistryList,
  isSimulationMode,
  SIMULATION_IDENTITIES,
} from '../server/simulationRegistry.js';

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
 * Builds a multipart/form-data payload Buffer with boundary.
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
 * Makes an HTTP request and parses response.
 */
function makeHttpRequest(
  port: number,
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: Buffer | string
): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  rawBody: string;
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
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data);
          } catch {
            // Not JSON
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            rawBody: data,
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
 * Login helper to get a JWT token.
 */
async function loginAs(
  port: number,
  email: string,
  password: string = 'Password123!'
): Promise<string> {
  const payload = JSON.stringify({ email, password });
  const res = await makeHttpRequest(
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
    throw new Error(`Login failed for ${email}: ${res.statusCode} ${res.rawBody}`);
  }
  return res.json.token;
}

// Minimal valid PDF for file uploads
const VALID_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
    'xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF\n',
  'utf-8'
);

async function main() {
  console.log('============================================================');
  console.log('FedTrustMed Module M9 - Simulation Registry Tests');
  console.log('============================================================\n');

  // ========================================================================
  // 1. UNIT TESTS: REGISTRY DEFINITIONS & VERIFICATION LOGIC
  // ========================================================================
  console.log('1. Testing Simulation Registry Definitions:');

  runTest('Registry contains exactly the 7 specified identities (0001..0006, 0009)', () => {
    const list = getSimulationRegistryList();
    assert.equal(list.length, 7);
    const aadhaarKeys = Object.keys(SIMULATION_IDENTITIES);
    assert.deepEqual(aadhaarKeys.sort(), [
      'TEST-AADHAAR-0001',
      'TEST-AADHAAR-0002',
      'TEST-AADHAAR-0003',
      'TEST-AADHAAR-0004',
      'TEST-AADHAAR-0005',
      'TEST-AADHAAR-0006',
      'TEST-AADHAAR-0009',
    ]);
  });

  runTest('TEST-AADHAAR-0001 binds correctly to Aarav Sharma, PATIENT, hosp-st-jude', () => {
    const res = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0001',
      fullName: 'Aarav Sharma',
      role: 'PATIENT',
      hospitalId: 'hosp-st-jude',
    });
    assert.equal(res.ok, true);
    assert.equal(res.isSimulation, true);
  });

  runTest('TEST-AADHAAR-0001 with wrong name fails with specific reason', () => {
    const res = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0001',
      fullName: 'Vikram Malhotra',
      role: 'PATIENT',
      hospitalId: 'hosp-st-jude',
    });
    assert.equal(res.ok, false);
    assert.ok(res.error?.includes('Name mismatch'));
    assert.ok(res.error?.includes('expected "Aarav Sharma"'));
  });

  runTest('TEST-AADHAAR-0001 with wrong role fails with specific reason', () => {
    const res = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0001',
      fullName: 'Aarav Sharma',
      role: 'DOCTOR',
      hospitalId: 'hosp-st-jude',
    });
    assert.equal(res.ok, false);
    assert.ok(res.error?.includes('Role mismatch'));
  });

  runTest('TEST-AADHAAR-0001 with wrong hospital fails with specific reason', () => {
    const res = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0001',
      fullName: 'Aarav Sharma',
      role: 'PATIENT',
      hospitalId: 'hosp-metro-heart',
    });
    assert.equal(res.ok, false);
    assert.ok(res.error?.includes('Hospital mismatch'));
  });

  runTest('Designated failure test identity -9999 is always rejected', () => {
    const res = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-9999',
      fullName: 'Any Name',
      role: 'PATIENT',
    });
    assert.equal(res.ok, false);
    assert.ok(res.error?.includes('-9999 is always rejected'));
  });

  runTest('Doctor TEST-AADHAAR-0002 requires matching licence TEST-MED-LIC-0001', () => {
    // Correct licence
    const passRes = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0002',
      fullName: 'Dr. Priya Patel',
      role: 'DOCTOR',
      hospitalId: 'hosp-st-jude',
      medicalLicenseNumber: 'TEST-MED-LIC-0001',
    });
    assert.equal(passRes.ok, true);

    // Mismatched licence (TEST-MED-LIC-0002)
    const failRes = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0002',
      fullName: 'Dr. Priya Patel',
      role: 'DOCTOR',
      hospitalId: 'hosp-st-jude',
      medicalLicenseNumber: 'TEST-MED-LIC-0002',
    });
    assert.equal(failRes.ok, false);
    assert.ok(failRes.error?.includes('Medical licence mismatch'));
  });

  runTest('Hospital Admin TEST-AADHAAR-0003 requires matching code HOSP-ADMIN-AUTH-001', () => {
    // Correct code
    const passRes = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0003',
      fullName: 'Rajesh Verma',
      role: 'HOSPITAL_ADMIN',
      hospitalId: 'hosp-st-jude',
      adminAuthorizationCode: 'HOSP-ADMIN-AUTH-001',
    });
    assert.equal(passRes.ok, true);

    // Mismatched code
    const failRes = verifySimulationOnboarding({
      aadhaar: 'TEST-AADHAAR-0003',
      fullName: 'Rajesh Verma',
      role: 'HOSPITAL_ADMIN',
      hospitalId: 'hosp-st-jude',
      adminAuthorizationCode: 'HOSP-ADMIN-AUTH-002',
    });
    assert.equal(failRes.ok, false);
    assert.ok(failRes.error?.includes('Authorization code mismatch'));
  });

  runTest('When SIMULATION_MODE flag is disabled, all TEST- values are rejected', () => {
    process.env.SIMULATION_MODE = 'false';
    try {
      const res = verifySimulationOnboarding({
        aadhaar: 'TEST-AADHAAR-0001',
        fullName: 'Aarav Sharma',
        role: 'PATIENT',
        hospitalId: 'hosp-st-jude',
      });
      assert.equal(res.ok, false);
      assert.ok(res.error?.includes('SIMULATION_MODE is disabled'));
    } finally {
      process.env.SIMULATION_MODE = 'true';
    }
  });

  // ========================================================================
  // 2. HTTP INTEGRATION TESTS: ONBOARDING WITH SIMULATION IDENTITIES
  // ========================================================================
  console.log('\n2. Testing HTTP Registration with Simulation Registry:');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  const testPassword = 'Password123!';

  try {
    // Ensure clean test environment for simulation identities from previous test runs
    await pool.query("DELETE FROM users WHERE email LIKE '%@sim.test'");

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 1: With flag on, matching TEST-AADHAAR-0001 passes
    // ──────────────────────────────────────────────────────────────────────────
    process.env.SIMULATION_MODE = 'true';
    const emailPatient1 = `aarav.sim.${Date.now()}@sim.test`;

    await runAsyncTest('With SIMULATION_MODE=true, matching TEST-AADHAAR-0001 passes registration', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Aarav Sharma',
        email: emailPatient1,
        password: testPassword,
        role: 'PATIENT',
        aadhaar: 'TEST-AADHAAR-0001',
        hospitalId: 'hosp-st-jude',
      });

      const res = await makeHttpRequest(
        port,
        '/api/auth/register',
        'POST',
        {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.rawBody}`);
      assert.ok(res.json.success);
      assert.equal(res.json.user.approvalStatus, 'PENDING');

      // Verify DB status is 'VERIFIED - SIMULATION' while approval_status remains 'PENDING'
      const dbRes = await pool.query('SELECT * FROM users WHERE email = $1', [emailPatient1]);
      assert.equal(dbRes.rows.length, 1);
      const user = dbRes.rows[0];

      assert.equal(
        user.aadhaar_verification_status,
        'VERIFIED - SIMULATION',
        'Expected aadhaar_verification_status to be VERIFIED - SIMULATION'
      );
      assert.equal(
        user.approval_status,
        'PENDING',
        'approval_status must remain PENDING even when simulation identity passes'
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 2: Wrong name fails with specific reason
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Wrong name on TEST-AADHAAR-0001 fails with specific reason (400)', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Wrong Name Sharma',
        email: `wrong.name.${Date.now()}@sim.test`,
        password: testPassword,
        role: 'PATIENT',
        aadhaar: 'TEST-AADHAAR-0001',
        hospitalId: 'hosp-st-jude',
      });

      const res = await makeHttpRequest(
        port,
        '/api/auth/register',
        'POST',
        {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.rawBody}`);
      assert.ok(
        res.json.error.includes('Name mismatch'),
        `Expected "Name mismatch" error, got: ${res.json.error}`
      );
      assert.ok(
        res.json.error.includes('Aarav Sharma'),
        `Expected error to state expected name, got: ${res.json.error}`
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 3: -9999 is always rejected
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Designated failure identity TEST-AADHAAR-9999 is rejected (400)', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Test Failure User',
        email: `fail.user.${Date.now()}@sim.test`,
        password: testPassword,
        role: 'PATIENT',
        aadhaar: 'TEST-AADHAAR-9999',
        hospitalId: 'hosp-st-jude',
      });

      const res = await makeHttpRequest(
        port,
        '/api/auth/register',
        'POST',
        {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400);
      assert.ok(
        res.json.error.includes('-9999') || res.json.error.includes('designated for failure'),
        `Unexpected error: ${res.json.error}`
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 4: Doctor with matching TEST-MED-LIC-0001 and licence PDF passes
    // ──────────────────────────────────────────────────────────────────────────
    const emailDoctor1 = `dr.priya.sim.${Date.now()}@sim.test`;
    await runAsyncTest('Doctor with matching TEST-MED-LIC-0001 passes with VERIFIED - SIMULATION', async () => {
      const { boundary, body } = buildMultipartPayload(
        {
          fullName: 'Dr. Priya Patel',
          email: emailDoctor1,
          password: testPassword,
          role: 'DOCTOR',
          aadhaar: 'TEST-AADHAAR-0002',
          medicalLicenseNumber: 'TEST-MED-LIC-0001',
          hospitalId: 'hosp-st-jude',
        },
        {
          fieldName: 'file',
          filename: 'licence.pdf',
          contentType: 'application/pdf',
          content: VALID_PDF,
        }
      );

      const res = await makeHttpRequest(
        port,
        '/api/auth/register',
        'POST',
        {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.rawBody}`);

      const dbRes = await pool.query('SELECT * FROM users WHERE email = $1', [emailDoctor1]);
      assert.equal(dbRes.rows.length, 1);
      const doc = dbRes.rows[0];

      assert.equal(doc.aadhaar_verification_status, 'VERIFIED - SIMULATION');
      assert.equal(doc.medical_license_verification_status, 'VERIFIED - SIMULATION');
      assert.equal(doc.approval_status, 'PENDING');
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 5: Doctor with mismatched licence (TEST-MED-LIC-0002) fails
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('Doctor with mismatched licence fails with specific reason (400)', async () => {
      const { boundary, body } = buildMultipartPayload(
        {
          fullName: 'Dr. Priya Patel',
          email: `dr.priya.wronglic.${Date.now()}@sim.test`,
          password: testPassword,
          role: 'DOCTOR',
          aadhaar: 'TEST-AADHAAR-0002',
          medicalLicenseNumber: 'TEST-MED-LIC-0002', // Mismatched licence (belongs to 0005)
          hospitalId: 'hosp-st-jude',
        },
        {
          fieldName: 'file',
          filename: 'licence.pdf',
          contentType: 'application/pdf',
          content: VALID_PDF,
        }
      );

      const res = await makeHttpRequest(
        port,
        '/api/auth/register',
        'POST',
        {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body
      );

      assert.equal(res.statusCode, 400);
      assert.ok(
        res.json.error.includes('Medical licence mismatch'),
        `Expected licence mismatch error, got: ${res.json.error}`
      );
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 6: With flag OFF, TEST- values are rejected
    // ──────────────────────────────────────────────────────────────────────────
    await runAsyncTest('With SIMULATION_MODE=false, any TEST- value is rejected (400)', async () => {
      process.env.SIMULATION_MODE = 'false';
      try {
        const { boundary, body } = buildMultipartPayload({
          fullName: 'Aarav Sharma',
          email: `aarav.disabled.${Date.now()}@sim.test`,
          password: testPassword,
          role: 'PATIENT',
          aadhaar: 'TEST-AADHAAR-0001',
          hospitalId: 'hosp-st-jude',
        });

        const res = await makeHttpRequest(
          port,
          '/api/auth/register',
          'POST',
          {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': String(body.length),
          },
          body
        );

        assert.equal(
          res.statusCode,
          400,
          `Expected 400 rejection when simulation mode is off, got ${res.statusCode}`
        );
        assert.ok(
          res.json.error.includes('disabled') ||
            res.json.error.includes('exactly 12 digits') ||
            res.json.error.includes('Simulation test identities are not accepted'),
          `Unexpected error: ${res.json.error}`
        );
      } finally {
        process.env.SIMULATION_MODE = 'true';
      }
    });

    // ──────────────────────────────────────────────────────────────────────────
    // CHECK 7: GET /api/auth/simulation-registry endpoint
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n3. Testing GET /api/auth/simulation-registry Endpoint:');

    // Login as seeded demo patient to test authenticated access
    const patientToken = await loginAs(port, 'patient@fedtrustmed.demo');

    await runAsyncTest('GET /api/auth/simulation-registry without token returns 401', async () => {
      const res = await makeHttpRequest(port, '/api/auth/simulation-registry', 'GET', {});
      assert.equal(res.statusCode, 401);
    });

    await runAsyncTest('GET /api/auth/simulation-registry with token returns the 7 identities', async () => {
      process.env.SIMULATION_MODE = 'true';
      const res = await makeHttpRequest(
        port,
        '/api/auth/simulation-registry',
        'GET',
        { Authorization: `Bearer ${patientToken}` }
      );

      assert.equal(res.statusCode, 200);
      assert.ok(res.json.success);
      assert.ok(Array.isArray(res.json.identities));
      assert.equal(res.json.identities.length, 7);

      const aadhaarNumbers = res.json.identities.map((i: any) => i.aadhaar);
      assert.ok(aadhaarNumbers.includes('TEST-AADHAAR-0001'));
      assert.ok(aadhaarNumbers.includes('TEST-AADHAAR-0002'));
      assert.ok(aadhaarNumbers.includes('TEST-AADHAAR-0003'));
      assert.ok(aadhaarNumbers.includes('TEST-AADHAAR-0004'));
      assert.ok(aadhaarNumbers.includes('TEST-AADHAAR-0005'));
      assert.ok(aadhaarNumbers.includes('TEST-AADHAAR-0006'));
      assert.ok(aadhaarNumbers.includes('TEST-AADHAAR-0009'));
    });

    await runAsyncTest('GET /api/auth/simulation-registry when flag is off returns 403', async () => {
      process.env.SIMULATION_MODE = 'false';
      try {
        const res = await makeHttpRequest(
          port,
          '/api/auth/simulation-registry',
          'GET',
          { Authorization: `Bearer ${patientToken}` }
        );

        assert.equal(res.statusCode, 403);
        assert.ok(res.json.error.includes('disabled'));
      } finally {
        process.env.SIMULATION_MODE = 'true';
      }
    });

  } finally {
    process.env.SIMULATION_MODE = 'true';
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }

  console.log('\n============================================================');
  console.log(`ALL M9 SIMULATION REGISTRY TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFatal test runner error in simulation.test.ts:', err);
  pool.end().finally(() => process.exit(1));
});
