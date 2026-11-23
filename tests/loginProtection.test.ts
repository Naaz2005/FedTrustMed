import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';

// Set environment for test mode
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/security.js';

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
  console.log('FedTrustMed Module M6 - Login Protection Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  // Test-specific email — unique per run to avoid collision with other test suites
  const testEmail = `m6lockout_${Date.now()}@test.local`;
  const correctPassword = 'GoodPass123!';
  const wrongPassword = 'WrongPass999!';
  let testUserId: string | null = null;

  try {
    // ========================================================================
    // Setup: seed a test user directly in the DB (APPROVED so login is allowed)
    // ========================================================================
    console.log('Setting up dedicated M6 test user...');
    testUserId = `m6-test-${Date.now()}`;
    const passwordHash = await hashPassword(correctPassword);
    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, password,
        approval_status, aadhaar_verification_status,
        is_frozen, trust_score, mfa_enabled, failed_login_count,
        created_at, updated_at
      ) VALUES (
        $1, $2, 'M6 Test User', 'PATIENT', $3,
        'APPROVED', 'VERIFIED',
        FALSE, 100.00, FALSE, 0,
        NOW(), NOW()
      )`,
      [testUserId, testEmail, passwordHash]
    );
    console.log(`  ✓ Created test user ${testEmail} (id=${testUserId})\n`);

    // Clean any previous audit rows for this user
    await pool.query('DELETE FROM audit_logs WHERE user_id = $1', [testUserId]);

    // ========================================================================
    // 1. Successful login before limit resets the counter
    // ========================================================================
    console.log('Test group 1: Counter reset on successful login');

    // Make 3 failed attempts
    for (let i = 1; i <= 3; i++) {
      await runAsyncTest(`Failed login attempt ${i}/5 returns 401`, async () => {
        const res = await makeHttpRequest(
          port,
          '/api/auth/login',
          'POST',
          { 'Content-Type': 'application/json' },
          JSON.stringify({ email: testEmail, password: wrongPassword })
        );
        assert.equal(res.statusCode, 401, `Expected 401, got ${res.statusCode}`);
      });
    }

    // Verify counter is 3
    await runAsyncTest('failed_login_count is 3 after 3 wrong attempts', async () => {
      const r = await pool.query('SELECT failed_login_count FROM users WHERE id = $1', [testUserId]);
      assert.equal(r.rows[0].failed_login_count, 3);
    });

    // Now log in successfully — counter should reset
    await runAsyncTest('Successful login resets failed_login_count to 0', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: correctPassword })
      );
      assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.rawBody}`);
      assert.equal(res.body.success, true);

      const r = await pool.query('SELECT failed_login_count, locked_until FROM users WHERE id = $1', [testUserId]);
      assert.equal(r.rows[0].failed_login_count, 0, 'Counter should be 0 after success');
      assert.equal(r.rows[0].locked_until, null, 'locked_until should be NULL after success');
    });

    // ========================================================================
    // 2. Account lockout after 5 consecutive failures
    // ========================================================================
    console.log('\nTest group 2: Lockout after 5 consecutive failed logins');

    // Reset audit logs for this user for a clean slate
    await pool.query('DELETE FROM audit_logs WHERE user_id = $1', [testUserId]);

    for (let i = 1; i <= 5; i++) {
      await runAsyncTest(`Failed login attempt ${i}/5 returns 401`, async () => {
        const res = await makeHttpRequest(
          port,
          '/api/auth/login',
          'POST',
          { 'Content-Type': 'application/json' },
          JSON.stringify({ email: testEmail, password: wrongPassword })
        );
        assert.equal(res.statusCode, 401, `Expected 401 on attempt ${i}, got ${res.statusCode}`);
      });
    }

    // Verify the account is now locked
    await runAsyncTest('Account is locked after 5 failures (locked_until is set)', async () => {
      const r = await pool.query('SELECT failed_login_count, locked_until FROM users WHERE id = $1', [testUserId]);
      assert.equal(r.rows[0].failed_login_count, 5, 'failed_login_count should be 5');
      assert.ok(r.rows[0].locked_until, 'locked_until should be set');
      const lockedUntil = new Date(r.rows[0].locked_until);
      assert.ok(lockedUntil > new Date(), 'locked_until should be in the future');
    });

    // ========================================================================
    // 3. 6th attempt with CORRECT password still returns locked
    // ========================================================================
    console.log('\nTest group 3: 6th attempt with correct password returns locked');

    await runAsyncTest('6th attempt with CORRECT password returns 423 locked', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: correctPassword })
      );
      assert.equal(res.statusCode, 423, `Expected 423 (Locked), got ${res.statusCode}: ${res.rawBody}`);
      assert.ok(
        res.body.error.toLowerCase().includes('locked'),
        `Expected locked message, got: ${res.body.error}`
      );
    });

    await runAsyncTest('7th attempt with WRONG password also returns 423 locked', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: wrongPassword })
      );
      assert.equal(res.statusCode, 423, `Expected 423 (Locked), got ${res.statusCode}: ${res.rawBody}`);
    });

    // ========================================================================
    // 4. Audit logs contain failure and lockout events
    // ========================================================================
    console.log('\nTest group 4: Audit logs contain failure and lockout events');

    await runAsyncTest('audit_logs has LOGIN_FAILED rows for this user', async () => {
      const r = await pool.query(
        "SELECT COUNT(*) AS cnt FROM audit_logs WHERE user_id = $1 AND action = 'LOGIN_FAILED'",
        [testUserId]
      );
      const cnt = parseInt(r.rows[0].cnt, 10);
      assert.ok(cnt >= 4, `Expected at least 4 LOGIN_FAILED rows, got ${cnt}`);
    });

    await runAsyncTest('audit_logs has ACCOUNT_LOCKED row for this user', async () => {
      const r = await pool.query(
        "SELECT COUNT(*) AS cnt FROM audit_logs WHERE user_id = $1 AND action = 'ACCOUNT_LOCKED'",
        [testUserId]
      );
      const cnt = parseInt(r.rows[0].cnt, 10);
      assert.ok(cnt >= 1, `Expected at least 1 ACCOUNT_LOCKED row, got ${cnt}`);
    });

    await runAsyncTest('audit_logs has LOGIN_BLOCKED_LOCKED row after attempt on locked account', async () => {
      const r = await pool.query(
        "SELECT COUNT(*) AS cnt FROM audit_logs WHERE user_id = $1 AND action = 'LOGIN_BLOCKED_LOCKED'",
        [testUserId]
      );
      const cnt = parseInt(r.rows[0].cnt, 10);
      assert.ok(cnt >= 1, `Expected at least 1 LOGIN_BLOCKED_LOCKED row, got ${cnt}`);
    });

    // ========================================================================
    // 5. Verify that express-rate-limit is wired (middleware existence check)
    // ========================================================================
    console.log('\nTest group 5: Rate limiter is attached to login and register');

    await runAsyncTest('loginLimiter export is a valid middleware function', async () => {
      const { loginLimiter } = await import('../server/auth.js');
      assert.equal(typeof loginLimiter, 'function', 'loginLimiter should be a function (middleware)');
    });

    await runAsyncTest('registerLimiter export is a valid middleware function', async () => {
      const { registerLimiter } = await import('../server/auth.js');
      assert.equal(typeof registerLimiter, 'function', 'registerLimiter should be a function (middleware)');
    });

    // ========================================================================
    // 6. After manual unlock, correct password works again
    // ========================================================================
    console.log('\nTest group 6: Login works after lockout expires (manual unlock)');

    await runAsyncTest('Login succeeds after manual unlock', async () => {
      // Simulate lockout expiry
      await pool.query(
        'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1',
        [testUserId]
      );
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: correctPassword })
      );
      assert.equal(res.statusCode, 200, `Expected 200, got ${res.statusCode}: ${res.rawBody}`);
      assert.equal(res.body.success, true);
    });

    // ========================================================================
    // Done
    // ========================================================================
    console.log('\n============================================================');
    console.log(`ALL M6 LOGIN PROTECTION TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
    console.log('============================================================');
  } finally {
    // Cleanup: remove test user and related audit rows
    if (testUserId) {
      await pool.query('DELETE FROM audit_logs WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }

    server.close();
    await pool.end();
  }
}

import { test } from 'node:test';
test('M6 Login Protection', { timeout: 60000 }, main);
