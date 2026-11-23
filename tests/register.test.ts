import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { AddressInfo } from 'node:net';

// Set environment for test mode
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import { generateVerhoeff, validateVerhoeff } from '../server/validators.js';

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
 * Makes an HTTP request and parses JSON or text response.
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

// Minimal valid PDF template for test uploads
const VALID_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n' +
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n' +
    'xref\n0 4\n0000000000 65535 f \ntrailer\n<< /Size 4 /Root 1 0 R >>\n%%EOF\n',
  'utf-8'
);

// Minimal valid JPEG template
const VALID_JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00,
  0x60, 0x00, 0x60, 0x00, 0x00, 0xff, 0xd9,
]);

async function main() {
  console.log('============================================================');
  console.log('FedTrustMed Module M8 - Registration Backend Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  function makeRandomValidAadhaar(): string {
    const prefix = '2' + String(Math.floor(1000000000 + Math.random() * 9000000000));
    const checkDigit = generateVerhoeff(prefix);
    return prefix + checkDigit;
  }

  const validAadhaar1 = makeRandomValidAadhaar();
  const validAadhaar2 = makeRandomValidAadhaar();
  const validAadhaar3 = makeRandomValidAadhaar();

  // Invalid Aadhaar checksum
  const wrongChecksumAadhaar = validAadhaar1.slice(0, 11) + ((parseInt(validAadhaar1.slice(11), 10) + 1) % 10);
  assert.equal(validateVerhoeff(validAadhaar1), true);
  assert.equal(validateVerhoeff(wrongChecksumAadhaar), false);

  const testEmailPatient = `patient.test.${Date.now()}.${Math.floor(Math.random() * 10000)}@fedtrustmed.test`;
  const testPassword = 'Password123!';

  try {
    // Clean up any test users that might conflict
    await pool.query("DELETE FROM users WHERE email LIKE '%@fedtrustmed.test' OR email LIKE 'patient.test.%' OR email LIKE 'dr.%' OR email LIKE 'admin.%'");

    // ========================================================================
    // 1. VALID PATIENT REGISTRATION (200)
    // ========================================================================
    console.log('1. Testing Valid Patient Registration:');

    await runAsyncTest('Valid patient registration returns 200 with PENDING approval status', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Ananya Sharma',
        email: testEmailPatient,
        password: testPassword,
        role: 'PATIENT',
        aadhaar: validAadhaar1,
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
      assert.ok(res.json.success, 'Expected success: true');
      assert.ok(res.json.user, 'Expected user in response');
      assert.equal(res.json.user.email, testEmailPatient);
      assert.equal(res.json.user.fullName, 'Ananya Sharma');
      assert.equal(res.json.user.role, 'PATIENT');
      assert.equal(res.json.user.approvalStatus, 'PENDING');
      assert.equal(res.json.user.aadhaarLast4, validAadhaar1.slice(-4));

      // Direct Database Assertions
      const dbRes = await pool.query('SELECT * FROM users WHERE email = $1', [testEmailPatient]);
      assert.equal(dbRes.rows.length, 1);
      const user = dbRes.rows[0];

      assert.equal(user.approval_status, 'PENDING');
      assert.equal(user.aadhaar_last4, validAadhaar1.slice(-4));
      assert.ok(!user.password.includes(testPassword), 'Password must be hashed, not plaintext');
      assert.ok(user.password.startsWith('$2'), 'Password must be bcrypt hash');
      assert.ok(user.aadhaar_hash, 'Aadhaar hash must be computed and stored');
      assert.notEqual(user.aadhaar_hash, validAadhaar1, 'Aadhaar hash must not equal plaintext');
    });

    // ========================================================================
    // 2. WRONG AADHAAR CHECKSUM (400)
    // ========================================================================
    console.log('\n2. Testing Aadhaar Checksum Validation:');

    await runAsyncTest('Wrong Aadhaar checksum returns 400', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Rahul Verma',
        email: `rahul.verma.${Date.now()}@fedtrustmed.demo`,
        password: testPassword,
        role: 'PATIENT',
        aadhaar: wrongChecksumAadhaar,
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
      assert.ok(res.json.error.includes('Verhoeff') || res.json.error.includes('Aadhaar'));
    });

    // ========================================================================
    // 3. WEAK PASSWORD (400)
    // ========================================================================
    console.log('\n3. Testing Password Strength Requirements:');

    await runAsyncTest('Weak password (< 10 chars) returns 400', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Sneha Rao',
        email: `sneha.rao.${Date.now()}@fedtrustmed.demo`,
        password: 'pass1', // < 10 chars
        role: 'PATIENT',
        aadhaar: validAadhaar2,
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
      assert.ok(res.json.error.includes('Password') || res.json.error.includes('10 characters'));
    });

    await runAsyncTest('Weak password (no numbers) returns 400', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Sneha Rao',
        email: `sneha.rao2.${Date.now()}@fedtrustmed.demo`,
        password: 'longpasswordwithnonumbers',
        role: 'PATIENT',
        aadhaar: validAadhaar2,
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
      assert.ok(res.json.error.includes('number'));
    });

    // ========================================================================
    // 4. DOCTOR WITHOUT LICENCE FILE (400)
    // ========================================================================
    console.log('\n4. Testing Doctor Registration Requirements:');

    await runAsyncTest('Doctor without licence file returns 400', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Dr. Alok Verma',
        email: `dr.alok.${Date.now()}@fedtrustmed.demo`,
        password: testPassword,
        role: 'DOCTOR',
        aadhaar: validAadhaar2,
        medicalLicenseNumber: 'MED-12345',
        // No file uploaded
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
      assert.ok(res.json.error.includes('licence file') || res.json.error.includes('license'));
    });

    // ========================================================================
    // 5. DOCTOR WITH A .TXT LICENCE (400)
    // ========================================================================
    await runAsyncTest('Doctor with a .txt licence file disguised as PDF returns 400', async () => {
      const fakeLicenceContent = Buffer.from('Plain text medical licence document');
      const { boundary, body } = buildMultipartPayload(
        {
          fullName: 'Dr. Vikram Seth',
          email: `dr.vikram.${Date.now()}@fedtrustmed.demo`,
          password: testPassword,
          role: 'DOCTOR',
          aadhaar: validAadhaar2,
          medicalLicenseNumber: 'MED-54321',
        },
        {
          fieldName: 'licenceFile',
          filename: 'licence.txt',
          contentType: 'text/plain',
          content: fakeLicenceContent,
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

      assert.equal(res.statusCode, 400, `Expected 400, got ${res.statusCode}: ${res.rawBody}`);
      assert.ok(
        res.json.error.includes('licence') || res.json.error.includes('format'),
        `Unexpected error: ${res.json.error}`
      );
    });

    // ========================================================================
    // 6. DUPLICATE AADHAAR (400 "already registered")
    // ========================================================================
    console.log('\n5. Testing Duplicate Aadhaar and Email Handling:');

    await runAsyncTest('Duplicate Aadhaar returns 400 containing "already registered"', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Another Person',
        email: `different.email.${Date.now()}@fedtrustmed.demo`,
        password: testPassword,
        role: 'PATIENT',
        aadhaar: validAadhaar1, // Reusing validAadhaar1 registered in step 1
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
        res.json.error.toLowerCase().includes('already registered'),
        `Expected error to contain "already registered", got: ${res.json.error}`
      );
      assert.ok(
        res.json.error.toLowerCase().includes('aadhaar'),
        `Expected error to mention Aadhaar, got: ${res.json.error}`
      );
    });

    // ========================================================================
    // 7. DUPLICATE EMAIL (400)
    // ========================================================================
    await runAsyncTest('Duplicate email returns 400 containing "already registered"', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Another Person Two',
        email: testEmailPatient, // Reusing testEmailPatient from step 1
        password: testPassword,
        role: 'PATIENT',
        aadhaar: validAadhaar3, // Fresh Aadhaar
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
        res.json.error.toLowerCase().includes('already registered'),
        `Expected error to contain "already registered", got: ${res.json.error}`
      );
      assert.ok(
        res.json.error.toLowerCase().includes('email'),
        `Expected error to mention email, got: ${res.json.error}`
      );
    });

    // ========================================================================
    // 8. PENDING USER CANNOT LOG IN
    // ========================================================================
    console.log('\n6. Testing Login Protection for Pending Users:');

    await runAsyncTest('Newly registered pending user cannot log in (403 Forbidden)', async () => {
      const loginPayload = JSON.stringify({
        email: testEmailPatient,
        password: testPassword,
      });

      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        {
          'Content-Type': 'application/json',
          'Content-Length': String(Buffer.byteLength(loginPayload)),
        },
        loginPayload
      );

      assert.equal(res.statusCode, 403, `Expected 403, got ${res.statusCode}: ${res.rawBody}`);
      assert.ok(
        res.json.error.toLowerCase().includes('pending') ||
          res.json.error.toLowerCase().includes('approval'),
        `Expected pending approval message, got: ${res.json.error}`
      );
    });

    // ========================================================================
    // 9. VALID DOCTOR REGISTRATION WITH REAL PDF LICENCE FILE
    // ========================================================================
    console.log('\n7. Testing Doctor & Hospital Admin End-to-End Registration:');

    const doctorEmail = `dr.valid.${Date.now()}@fedtrustmed.demo`;
    await runAsyncTest('Doctor with valid licence number and PDF licence file succeeds (200)', async () => {
      const { boundary, body } = buildMultipartPayload(
        {
          fullName: 'Dr. Priya Nambiar',
          email: doctorEmail,
          password: testPassword,
          role: 'DOCTOR',
          aadhaar: validAadhaar2,
          medicalLicenseNumber: 'MED-99881',
          hospitalId: 'hosp-st-jude',
        },
        {
          fieldName: 'licence',
          filename: 'medical_council_licence.pdf',
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
      assert.equal(res.json.user.role, 'DOCTOR');
      assert.equal(res.json.user.approvalStatus, 'PENDING');

      // Verify licence document was encrypted and saved into documents table
      const docRes = await pool.query(
        "SELECT * FROM documents WHERE owner_user_id = $1 AND kind = 'MEDICAL_LICENSE'",
        [res.json.user.id]
      );
      assert.equal(docRes.rows.length, 1, 'Expected licence document in documents table');
      assert.equal(docRes.rows[0].mime, 'application/pdf');
    });

    // ========================================================================
    // 10. HOSPITAL ADMIN REGISTRATION (PDF REQUIRED)
    // ========================================================================
    await runAsyncTest('Hospital admin without authorization letter returns 400', async () => {
      const { boundary, body } = buildMultipartPayload({
        fullName: 'Admin Ramesh',
        email: `admin.ramesh.${Date.now()}@fedtrustmed.demo`,
        password: testPassword,
        role: 'HOSPITAL_ADMIN',
        aadhaar: validAadhaar3,
        adminAuthorizationCode: 'HOSP-ADMIN-AUTH-777',
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
      assert.ok(res.json.error.includes('authorization letter'));
    });

    await runAsyncTest('Hospital admin with non-PDF file (JPEG) returns 400', async () => {
      const { boundary, body } = buildMultipartPayload(
        {
          fullName: 'Admin Ramesh',
          email: `admin.ramesh2.${Date.now()}@fedtrustmed.demo`,
          password: testPassword,
          role: 'HOSPITAL_ADMIN',
          aadhaar: validAadhaar3,
          adminAuthorizationCode: 'HOSP-ADMIN-AUTH-777',
        },
        {
          fieldName: 'letter',
          filename: 'letter.jpg',
          contentType: 'image/jpeg',
          content: VALID_JPEG,
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
      assert.ok(res.json.error.includes('PDF'));
    });

    await runAsyncTest('Hospital admin with valid PDF authorization letter succeeds (200)', async () => {
      const adminEmail = `admin.valid.${Date.now()}@fedtrustmed.demo`;
      const { boundary, body } = buildMultipartPayload(
        {
          fullName: 'Suresh Menon',
          email: adminEmail,
          password: testPassword,
          role: 'HOSPITAL_ADMIN',
          aadhaar: validAadhaar3,
          adminAuthorizationCode: 'HOSP-ADMIN-AUTH-888',
          hospitalId: 'hosp-st-jude',
        },
        {
          fieldName: 'authorizationLetter',
          filename: 'board_approval.pdf',
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

      assert.equal(res.statusCode, 200);
      assert.equal(res.json.user.role, 'HOSPITAL_ADMIN');
      assert.equal(res.json.user.approvalStatus, 'PENDING');

      // Verify authorization letter was stored in documents
      const docRes = await pool.query(
        "SELECT * FROM documents WHERE owner_user_id = $1 AND kind = 'AUTHORIZATION_LETTER'",
        [res.json.user.id]
      );
      assert.equal(docRes.rows.length, 1);
    });

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }

  console.log('\n============================================================');
  console.log(`ALL M8 REGISTRATION TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFatal test runner error in register.test.ts:', err);
  pool.end().finally(() => process.exit(1));
});
