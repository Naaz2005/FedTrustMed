import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';

// Set environment for test mode
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import { hashPassword, verifyToken, BCRYPT_COST } from '../server/security.js';

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
  body?: string
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: any; rawBody: string }> {
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
          let parsed = null;
          try {
            parsed = JSON.parse(data);
          } catch {
            // raw string
          }
          resolve({
            statusCode: res.statusCode || 500,
            headers: res.headers,
            body: parsed,
            rawBody: data,
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

async function main() {
  console.log('============================================================');
  console.log('FedTrustMed Module M4 - Authentication & Login Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  // Track created test users for cleanup
  const cleanupUserIds: string[] = [];

  try {
    // ------------------------------------------------------------------------
    // 1. Logs in each seeded role
    // ------------------------------------------------------------------------
    console.log('Testing login for each seeded role:');

    const seededUsers = [
      { role: 'PATIENT', email: 'patient@fedtrustmed.demo', name: 'Aarav Sharma' },
      { role: 'DOCTOR', email: 'doctor@fedtrustmed.demo', name: 'Dr. Priya Patel' },
      { role: 'HOSPITAL_ADMIN', email: 'hospital_admin@fedtrustmed.demo', name: 'Rajesh Verma' },
      { role: 'SYSTEM_ADMIN', email: 'system_admin@fedtrustmed.demo', name: 'Vikram Malhotra' },
    ];

    const tokens: Record<string, string> = {};

    for (const u of seededUsers) {
      await runAsyncTest(`Login successful for seeded role: ${u.role} (${u.email})`, async () => {
        const payload = JSON.stringify({
          email: u.email,
          password: 'Password123!',
        });

        const res = await makeHttpRequest(
          port,
          '/api/auth/login',
          'POST',
          { 'Content-Type': 'application/json' },
          payload
        );

        assert.equal(res.statusCode, 200, `Expected 200 for ${u.role}, got ${res.statusCode}: ${res.rawBody}`);
        assert.equal(res.body.success, true, 'Expected success: true');
        assert.ok(typeof res.body.token === 'string' && res.body.token.length > 20, 'Expected valid token string');
        assert.ok(res.body.user, 'Expected user object in response');
        assert.equal(res.body.user.role, u.role, `Expected user role ${u.role}`);
        assert.equal(res.body.user.email, u.email);
        assert.equal(res.body.user.fullName, u.name);

        // Verify token can be decoded and verified with HS256
        const decoded = verifyToken(res.body.token);
        assert.equal(decoded.email, u.email);
        assert.equal(decoded.role, u.role);

        tokens[u.role] = res.body.token;
      });
    }

    // ------------------------------------------------------------------------
    // 2. GET /api/auth/me for each logged-in role
    // ------------------------------------------------------------------------
    console.log('\nTesting GET /api/auth/me profile verification:');

    for (const u of seededUsers) {
      await runAsyncTest(`GET /api/auth/me returns profile for ${u.role}`, async () => {
        const token = tokens[u.role];
        assert.ok(token, `Missing token for ${u.role}`);

        const res = await makeHttpRequest(
          port,
          '/api/auth/me',
          'GET',
          { Authorization: `Bearer ${token}` }
        );

        assert.equal(res.statusCode, 200);
        assert.equal(res.body.success, true);
        assert.ok(res.body.user);
        assert.equal(res.body.user.role, u.role);
        assert.equal(res.body.user.email, u.email);
      });
    }

    // ------------------------------------------------------------------------
    // 3. Wrong password and unknown email return IDENTICAL text
    // ------------------------------------------------------------------------
    console.log('\nTesting timing-safe identical error message for wrong credentials:');

    let wrongPasswordResponse: any = null;
    let unknownEmailResponse: any = null;

    await runAsyncTest('Login with wrong password returns 401 with generic error', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
          email: 'patient@fedtrustmed.demo',
          password: 'IncorrectPassword999!',
        })
      );

      assert.equal(res.statusCode, 401);
      assert.ok(res.body && typeof res.body.error === 'string');
      wrongPasswordResponse = res.body;
    });

    await runAsyncTest('Login with unknown email returns 401 with generic error', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
          email: 'nonexistent.user.ghost@fedtrustmed.demo',
          password: 'Password123!',
        })
      );

      assert.equal(res.statusCode, 401);
      assert.ok(res.body && typeof res.body.error === 'string');
      unknownEmailResponse = res.body;
    });

    runTest('Wrong password and unknown email return IDENTICAL error text', () => {
      assert.ok(wrongPasswordResponse && unknownEmailResponse);
      assert.equal(
        wrongPasswordResponse.error,
        unknownEmailResponse.error,
        `Expected identical error text: "${wrongPasswordResponse.error}" vs "${unknownEmailResponse.error}"`
      );
      assert.equal(
        JSON.stringify(wrongPasswordResponse),
        JSON.stringify(unknownEmailResponse),
        'Expected entire response JSON payload to be identical'
      );
    });

    // ------------------------------------------------------------------------
    // 4. No response contains "password"
    // ------------------------------------------------------------------------
    console.log('\nTesting strict secret exclusion (no response contains "password"):');

    for (const u of seededUsers) {
      await runAsyncTest(`Login response for ${u.role} contains NO password or password_hash fields`, async () => {
        const res = await makeHttpRequest(
          port,
          '/api/auth/login',
          'POST',
          { 'Content-Type': 'application/json' },
          JSON.stringify({ email: u.email, password: 'Password123!' })
        );

        assert.equal(res.statusCode, 200);
        const user = res.body.user;

        assert.equal('password' in user, false, 'User object must NOT contain password field');
        assert.equal('password_hash' in user, false, 'User object must NOT contain password_hash field');
        assert.equal('passwordHash' in user, false, 'User object must NOT contain passwordHash field');

        // Verify that the entire JSON payload does not contain the word "password"
        assert.equal(
          res.rawBody.toLowerCase().includes('password'),
          false,
          `Response payload must not contain "password": ${res.rawBody}`
        );
      });

      await runAsyncTest(`GET /api/auth/me response for ${u.role} contains NO "password"`, async () => {
        const token = tokens[u.role];
        const res = await makeHttpRequest(
          port,
          '/api/auth/me',
          'GET',
          { Authorization: `Bearer ${token}` }
        );

        assert.equal(res.statusCode, 200);
        assert.equal(
          res.rawBody.toLowerCase().includes('password'),
          false,
          `Me response must not contain "password": ${res.rawBody}`
        );
      });
    }

    runTest('Error response contains NO "password"', () => {
      assert.equal(
        JSON.stringify(wrongPasswordResponse).toLowerCase().includes('password'),
        false,
        'Error payload must not contain the word "password"'
      );
    });

    // ------------------------------------------------------------------------
    // 5. A pending user is blocked with a clear message
    // ------------------------------------------------------------------------
    console.log('\nTesting blocked status for PENDING and REJECTED accounts:');

    const testPasswordHash = await hashPassword('Password123!');

    const pendingUserId = 'usr-test-pending-001';
    cleanupUserIds.push(pendingUserId);
    await pool.query(
      `INSERT INTO users (id, email, full_name, role, password, approval_status, trust_score, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'PENDING', 100.00, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET approval_status = 'PENDING', password = $5`,
      [pendingUserId, 'pending.user@fedtrustmed.demo', 'Pending Applicant', 'PATIENT', testPasswordHash]
    );

    await runAsyncTest('Pending user is blocked with a clear message', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
          email: 'pending.user@fedtrustmed.demo',
          password: 'Password123!',
        })
      );

      assert.equal(res.statusCode, 403, 'Pending user must receive 403 Forbidden');
      assert.ok(res.body && typeof res.body.error === 'string');
      assert.match(res.body.error, /pending administrator approval/i, 'Expected clear pending message');
      assert.equal(res.body.token, undefined, 'No token should be issued to pending user');
    });

    // Test REJECTED user
    const rejectedUserId = 'usr-test-rejected-001';
    cleanupUserIds.push(rejectedUserId);
    await pool.query(
      `INSERT INTO users (id, email, full_name, role, password, approval_status, rejection_reason, trust_score, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'REJECTED', 'Medical council licence invalid', 100.00, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET approval_status = 'REJECTED', rejection_reason = 'Medical council licence invalid', password = $5`,
      [rejectedUserId, 'rejected.user@fedtrustmed.demo', 'Rejected Applicant', 'DOCTOR', testPasswordHash]
    );

    await runAsyncTest('Rejected user is blocked with a clear message and reason', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
          email: 'rejected.user@fedtrustmed.demo',
          password: 'Password123!',
        })
      );

      assert.equal(res.statusCode, 403, 'Rejected user must receive 403 Forbidden');
      assert.ok(res.body && typeof res.body.error === 'string');
      assert.match(res.body.error, /rejected/i, 'Expected clear rejected message');
      assert.match(res.body.error, /Medical council licence invalid/i, 'Expected rejection reason in message');
      assert.equal(res.body.token, undefined, 'No token should be issued to rejected user');
    });

    // ------------------------------------------------------------------------
    // 6. A null password can never log in
    // ------------------------------------------------------------------------
    console.log('\nTesting null password and empty input restrictions:');

    await runAsyncTest('Null password in login request cannot log in', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
          email: 'patient@fedtrustmed.demo',
          password: null,
        })
      );

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error, wrongPasswordResponse.error);
      assert.equal(res.body.token, undefined);
    });

    await runAsyncTest('Empty password in login request cannot log in', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
          email: 'patient@fedtrustmed.demo',
          password: '',
        })
      );

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error, wrongPasswordResponse.error);
      assert.equal(res.body.token, undefined);
    });

    // Test database user with NULL or empty password
    const nullPasswordUserId = 'usr-test-nullpass-001';
    cleanupUserIds.push(nullPasswordUserId);
    await pool.query(
      `INSERT INTO users (id, email, full_name, role, password, approval_status, trust_score, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '', 'APPROVED', 100.00, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET password = '', approval_status = 'APPROVED'`,
      [nullPasswordUserId, 'nullpass.user@fedtrustmed.demo', 'No Password User', 'PATIENT']
    );

    await runAsyncTest('User with empty/null password in database can NEVER log in', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({
          email: 'nullpass.user@fedtrustmed.demo',
          password: 'Password123!',
        })
      );

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.error, wrongPasswordResponse.error);
      assert.equal(res.body.token, undefined);
    });

    // ------------------------------------------------------------------------
    // 7. GET /api/auth/me without token or with invalid token
    // ------------------------------------------------------------------------
    console.log('\nTesting GET /api/auth/me authentication requirements:');

    await runAsyncTest('GET /api/auth/me without Authorization header returns 401', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {});
      assert.equal(res.statusCode, 401);
      assert.ok(res.body && typeof res.body.error === 'string');
    });

    await runAsyncTest('GET /api/auth/me with invalid token returns 401', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/me',
        'GET',
        { Authorization: 'Bearer this.is.an.invalid.token' }
      );
      assert.equal(res.statusCode, 401);
      assert.ok(res.body && typeof res.body.error === 'string');
    });

  } finally {
    // Clean up temporary test users
    if (cleanupUserIds.length > 0) {
      await pool.query('DELETE FROM users WHERE id = ANY($1)', [cleanupUserIds]);
    }

    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }

  console.log('\n============================================================');
  console.log(`ALL AUTH TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFatal test runner error:', err);
  pool.end().finally(() => process.exit(1));
});
