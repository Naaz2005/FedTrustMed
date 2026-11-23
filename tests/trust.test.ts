import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';

process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import { hashPassword } from '../server/security.js';
import {
  FREEZE_THRESHOLD,
  getUserTrustEvents,
  recordDeniedAccess,
  recordOffHoursAccess,
  recordGoodBehaviour,
} from '../server/trustEngine.js';

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

async function runTrustTests() {
  console.log('============================================================');
  console.log('FedTrustMed Module M25 - Account Safety & Trust Engine Tests');
  console.log('============================================================\n');

  // Start test HTTP server
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  console.log(`[Test Server] Listening on http://127.0.0.1:${port}\n`);

  // Ensure clean dedicated test user in database
  const testEmail = 'patient_trust_m25@fedtrustmed.demo';
  const testPassword = 'TrustTestPassword123!';
  const hashedPassword = await hashPassword(testPassword);
  const testUserId = 'usr-trust-m25-test';
  const testPatientId = 'pat-trust-m25-test';

  await pool.query('DELETE FROM users WHERE email = $1 OR id = $2', [testEmail, testUserId]);
  await pool.query('DELETE FROM trust_events WHERE user_id = $1', [testUserId]);

  await pool.query(
    `INSERT INTO users (
      id, email, full_name, role, password, approval_status,
      aadhaar_verification_status, is_frozen, trust_score, mfa_enabled,
      failed_login_count, created_at, updated_at
    ) VALUES (
      $1, $2, 'Aarav Trust Test Patient', 'PATIENT', $3, 'APPROVED',
      'VERIFIED', FALSE, 100.00, FALSE,
      0, NOW(), NOW()
    )`,
    [testUserId, testEmail, hashedPassword]
  );

  await pool.query(
    `INSERT INTO patients (
      id, user_id, full_name, email, gender, blood_type, primary_hospital_id, primary_hospital_name, emergency_contact, created_at
    ) VALUES (
      $1, $2, 'Aarav Trust Test Patient', $3, 'Male', 'O+', 'hosp-st-jude', 'St. Jude General', '9876543210', NOW()
    ) ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email`,
    [testPatientId, testUserId, testEmail]
  );

  try {
    // 1. Initial State & Token Issuance
    let userToken = '';
    await runTest('User starts with 100.0 trust score and authenticates successfully', async () => {
      userToken = await loginUser(port, testEmail, testPassword);
      assert.ok(userToken, 'Valid JWT token must be returned');

      const meRes = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${userToken}`,
      });
      assert.strictEqual(meRes.statusCode, 200);
      assert.strictEqual(meRes.body.user.isFrozen, false);
      assert.strictEqual(meRes.body.user.trustScore, 100);
      assert.strictEqual(meRes.body.user.accountStanding, 'Your account is in good standing');
    });

    // 2. Repeated Failed Logins Lower Score
    await runTest('Repeated failed logins lower the trust score (-15.0 delta per attempt)', async () => {
      // Failed login attempt 1: 100 -> 85
      const fail1 = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: 'WrongPassword1' })
      );
      assert.strictEqual(fail1.statusCode, 401);

      const db1 = await pool.query('SELECT trust_score, is_frozen FROM users WHERE id = $1', [testUserId]);
      assert.strictEqual(parseFloat(db1.rows[0].trust_score), 85.0);
      assert.strictEqual(db1.rows[0].is_frozen, false);

      // Failed login attempt 2: 85 -> 70
      const fail2 = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: 'WrongPassword2' })
      );
      assert.strictEqual(fail2.statusCode, 401);

      const db2 = await pool.query('SELECT trust_score, is_frozen FROM users WHERE id = $1', [testUserId]);
      assert.strictEqual(parseFloat(db2.rows[0].trust_score), 70.0);
      assert.strictEqual(db2.rows[0].is_frozen, false);

      // Failed login attempt 3: 70 -> 55 (Still above 50.0 threshold)
      const fail3 = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: 'WrongPassword3' })
      );
      assert.strictEqual(fail3.statusCode, 401);

      const db3 = await pool.query('SELECT trust_score, is_frozen FROM users WHERE id = $1', [testUserId]);
      assert.strictEqual(parseFloat(db3.rows[0].trust_score), 55.0);
      assert.strictEqual(db3.rows[0].is_frozen, false);

      // Existing open session token still functions while above threshold
      const stillActiveRes = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${userToken}`,
      });
      assert.strictEqual(stillActiveRes.statusCode, 200);
    });

    // 3. Below Threshold Triggers Automated Freeze
    await runTest(`Trust score falling below threshold (${FREEZE_THRESHOLD}.0) automatically freezes the account`, async () => {
      // Failed login attempt 4: 55 -> 40 (Below 50.0 threshold)
      const fail4 = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: testEmail, password: 'WrongPassword4' })
      );
      assert.strictEqual(fail4.statusCode, 401);

      const db4 = await pool.query('SELECT trust_score, is_frozen FROM users WHERE id = $1', [testUserId]);
      const currentScore = parseFloat(db4.rows[0].trust_score);
      assert.strictEqual(currentScore, 40.0, 'Score must be lowered to 40.0');
      assert.strictEqual(db4.rows[0].is_frozen, true, 'User must be automatically frozen');

      // Verify trust_events table logged all 4 events with reason and delta
      const events = await getUserTrustEvents(testUserId);
      assert.strictEqual(events.length, 4, 'Should have recorded 4 trust events');
      assert.strictEqual(events[0].eventType, 'FAILED_LOGIN');
      assert.strictEqual(events[0].delta, -15.0);
      assert.strictEqual(events[0].newScore, 40.0);
    });

    // 4. Existing Open Session Stops Working At Once
    await runTest('Existing open session token immediately stops working (403 Forbidden) via per-request DB check', async () => {
      const blockedRes = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${userToken}`,
      });
      assert.strictEqual(blockedRes.statusCode, 403, 'Existing session token must immediately return 403 Forbidden');
      assert.ok(blockedRes.body.error.includes('frozen'), 'Response must explain account is frozen');

      const blockedRecordsRes = await makeHttpRequest(port, '/api/patients/me', 'GET', {
        Authorization: `Bearer ${userToken}`,
      });
      assert.strictEqual(blockedRecordsRes.statusCode, 403, 'Clinical routes must reject frozen token');
    });

    // 5. System Admin Can View Event Log Per User & Account Safety Summary
    let adminToken = '';
    await runTest('System Admin can view account safety overview and user trust event log', async () => {
      adminToken = await loginUser(port, 'system_admin@fedtrustmed.demo', 'Password123!');

      // Account safety overview
      const safetyRes = await makeHttpRequest(port, '/api/admin/account-safety', 'GET', {
        Authorization: `Bearer ${adminToken}`,
      });
      assert.strictEqual(safetyRes.statusCode, 200);
      assert.strictEqual(safetyRes.body.success, true);
      assert.strictEqual(safetyRes.body.threshold, FREEZE_THRESHOLD);

      const targetUser = safetyRes.body.users.find((u: any) => u.id === testUserId);
      assert.ok(targetUser, 'Safety overview must include test user');
      assert.strictEqual(targetUser.isFrozen, true);
      assert.strictEqual(targetUser.trustScore, 40);

      // Event log per user
      const eventsRes = await makeHttpRequest(port, `/api/admin/trust-events/${testUserId}`, 'GET', {
        Authorization: `Bearer ${adminToken}`,
      });
      assert.strictEqual(eventsRes.statusCode, 200);
      assert.strictEqual(eventsRes.body.success, true);
      assert.strictEqual(eventsRes.body.count, 4);
    });

    // 6. Admin Unfreeze Restores Access Immediately
    await runTest('Admin can unfreeze with a required reason, immediately restoring open session access', async () => {
      // Unfreeze without reason fails (400)
      const failUnfreeze = await makeHttpRequest(
        port,
        '/api/admin/toggle-freeze',
        'POST',
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        JSON.stringify({ userId: testUserId, isFrozen: false, reason: '' })
      );
      assert.strictEqual(failUnfreeze.statusCode, 400);

      // Unfreeze with reason succeeds (200)
      const unfreezePayload = JSON.stringify({
        userId: testUserId,
        isFrozen: false,
        reason: 'Investigated failed logins; patient verified identity via out-of-band phone call',
      });
      const unfreezeRes = await makeHttpRequest(
        port,
        '/api/admin/toggle-freeze',
        'POST',
        {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(unfreezePayload).toString(),
          Authorization: `Bearer ${adminToken}`,
        },
        unfreezePayload
      );
      assert.strictEqual(unfreezeRes.statusCode, 200);
      assert.strictEqual(unfreezeRes.body.success, true);

      // User in DB is unfrozen and trust score is restored
      const dbUnfrozen = await pool.query('SELECT trust_score, is_frozen FROM users WHERE id = $1', [testUserId]);
      assert.strictEqual(dbUnfrozen.rows[0].is_frozen, false, 'User must be unfrozen in database');
      assert.strictEqual(parseFloat(dbUnfrozen.rows[0].trust_score), 100.0, 'Score must be restored to 100.0');

      // The original userToken immediately works again without re-login!
      const restoredRes = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${userToken}`,
      });
      assert.strictEqual(restoredRes.statusCode, 200, 'Original token must immediately return 200 OK after unfreeze');
      assert.strictEqual(restoredRes.body.user.isFrozen, false);
      assert.strictEqual(restoredRes.body.user.accountStanding, 'Your account is in good standing');
    });

    // 7. Additional Trust Events: Denied Access, Off-Hours & Good Behaviour
    await runTest('Records other trust events (denied access, off-hours, admin change, good behaviour)', async () => {
      // A. Denied access attempt (-20.0)
      const denied = await recordDeniedAccess(testUserId, 'Unauthorized clinical record access attempt without consent');
      assert.strictEqual(denied.event.delta, -20.0);
      assert.strictEqual(denied.user.trustScore, 80.0);

      // B. Off-hours access anomaly (-10.0)
      const offHours = await recordOffHoursAccess(testUserId, 'Anomalous record query detected at 03:42 AM local hospital time');
      assert.strictEqual(offHours.event.delta, -10.0);
      assert.strictEqual(offHours.user.trustScore, 70.0);

      // C. Good behaviour reward (+5.0)
      const good = await recordGoodBehaviour(testUserId, '30 days compliant session activity with zero infractions');
      assert.strictEqual(good.event.delta, 5.0);
      assert.strictEqual(good.user.trustScore, 75.0);

      // D. Manual admin score adjustment via API
      const adjPayload = JSON.stringify({
        userId: testUserId,
        delta: 15,
        reason: 'Special compliance audit passed',
      });
      const adjRes = await makeHttpRequest(
        port,
        '/api/admin/adjust-trust-score',
        'POST',
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        adjPayload
      );
      assert.strictEqual(adjRes.statusCode, 200);
      assert.strictEqual(adjRes.body.result.user.trustScore, 90.0);
    });

    console.log('\n============================================================');
    console.log(`ALL ACCOUNT SAFETY & TRUST TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
    console.log('============================================================\n');
  } finally {
    // Cleanup test server and pool
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.query('DELETE FROM trust_events WHERE user_id = $1', [testUserId]);
    await pool.end();
  }
}

runTrustTests().catch((err) => {
  console.error('\nTest suite execution failed:', err);
  process.exit(1);
});
