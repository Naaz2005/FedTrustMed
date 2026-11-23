import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

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

async function runSystemAdminTests() {
  console.log('============================================================');
  console.log('FedTrustMed Module M23 - System Admin & User Governance Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const port = (server.address() as AddressInfo).port;
  console.log(`[Test Server] Running on http://127.0.0.1:${port}\n`);

  try {
    // 1. Authenticate tokens
    const sysAdminToken = await loginUser(port, 'system_admin@fedtrustmed.demo', 'Password123!');
    const patientToken = await loginUser(port, 'patient@fedtrustmed.demo', 'Password123!');

    // Fetch patient ID
    const meRes = await makeHttpRequest(port, '/api/auth/me', 'GET', {
      Authorization: `Bearer ${patientToken}`,
    });
    assert.equal(meRes.statusCode, 200);
    const patientId = meRes.body?.user?.id;
    assert.ok(patientId, 'Patient user ID should exist');

    // TEST 1: System Admin Home (Approvals): Overview Stats endpoint
    await runTest('GET /api/admin/overview-stats returns pending count and 3 health stats', async () => {
      const res = await makeHttpRequest(port, '/api/admin/overview-stats', 'GET', {
        Authorization: `Bearer ${sysAdminToken}`,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.success, true);
      assert.equal(typeof res.body?.pendingApprovals, 'number');
      assert.ok(res.body?.health, 'Health numbers must be present');
      assert.equal(typeof res.body?.health?.activeHospitalNodes, 'number');
      assert.ok(res.body?.health?.keyVaultStatus, 'Key Vault status should exist');
      assert.ok(res.body?.health?.auditLedgerStatus, 'Audit Ledger status should exist');
    });

    // TEST 2: Users directory returns users with MFA, frozen, and permissions fields
    await runTest('GET /api/admin/users returns detailed directory with mfa and permissions', async () => {
      const res = await makeHttpRequest(port, '/api/admin/users', 'GET', {
        Authorization: `Bearer ${sysAdminToken}`,
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.success, true);
      assert.ok(Array.isArray(res.body?.users), 'Users should be an array');
      const patient = res.body.users.find((u: any) => u.id === patientId);
      assert.ok(patient, 'Patient must be in directory list');
      assert.equal(typeof patient.is_frozen, 'boolean');
      assert.equal(typeof patient.mfa_enabled, 'boolean');
      assert.ok(Array.isArray(patient.data_access_permissions));
    });

    // TEST 3: Freeze requires reason parameter
    await runTest('POST /api/admin/toggle-freeze fails (400) if reason is empty or missing', async () => {
      const noReasonPayload = JSON.stringify({
        userId: patientId,
        isFrozen: true,
        reason: '   ',
      });
      const res = await makeHttpRequest(
        port,
        '/api/admin/toggle-freeze',
        'POST',
        {
          Authorization: `Bearer ${sysAdminToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(noReasonPayload).toString(),
        },
        noReasonPayload
      );
      assert.equal(res.statusCode, 400);
      assert.match(res.body?.error, /reason/i);
    });

    // TEST 4: Freeze action succeeds and writes audit log
    await runTest('POST /api/admin/toggle-freeze freezes patient account with audit log', async () => {
      const freezePayload = JSON.stringify({
        userId: patientId,
        isFrozen: true,
        reason: 'Security Incident SEC-9021: Suspicious credential telemetry',
      });
      const res = await makeHttpRequest(
        port,
        '/api/admin/toggle-freeze',
        'POST',
        {
          Authorization: `Bearer ${sysAdminToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(freezePayload).toString(),
        },
        freezePayload
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.success, true);
      assert.equal(res.body?.user?.is_frozen, true);

      // Verify audit log
      const auditRes = await pool.query(
        "SELECT * FROM audit_logs WHERE action = 'USER_ACCOUNT_FROZEN' AND resource_id = $1 ORDER BY timestamp DESC LIMIT 1",
        [patientId]
      );
      assert.equal(auditRes.rows.length, 1);
      assert.match(auditRes.rows[0].details, /SEC-9021/);
    });

    // TEST 5: Frozen user's open session immediately fails on the next action (403)
    await runTest('Frozen user open session immediately fails with 403 on next action', async () => {
      const actionRes = await makeHttpRequest(port, '/api/patients/me/records', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(actionRes.statusCode, 403);
      assert.match(actionRes.body?.error, /frozen|suspended/i);

      // Even /api/auth/me fails immediately
      const meCheck = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(meCheck.statusCode, 403);
      assert.match(meCheck.body?.error, /frozen|suspended/i);
    });

    // TEST 6: Unfreezing restores session immediately without re-login
    await runTest('Unfreezing user restores open session immediately on next action (200)', async () => {
      const unfreezePayload = JSON.stringify({
        userId: patientId,
        isFrozen: false,
        reason: 'Security Incident SEC-9021 Resolved: Identity re-authenticated',
      });
      const res = await makeHttpRequest(
        port,
        '/api/admin/toggle-freeze',
        'POST',
        {
          Authorization: `Bearer ${sysAdminToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(unfreezePayload).toString(),
        },
        unfreezePayload
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.success, true);
      assert.equal(res.body?.user?.is_frozen, false);

      // Next action with same open token immediately succeeds!
      const restoredAction = await makeHttpRequest(port, '/api/patients/me/records', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(restoredAction.statusCode, 200);
      assert.equal(restoredAction.body?.success, true);

      // /api/auth/me also succeeds immediately
      const restoredMe = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(restoredMe.statusCode, 200);
      assert.equal(restoredMe.body?.user?.isFrozen, false);
    });

    // TEST 7: Permission edits update permissions and create audit log
    await runTest('POST /api/admin/update-permissions updates user permissions and writes audit log', async () => {
      const newPerms = ['READ_RECORDS', 'WRITE_RECORDS', 'EXPORT_RECORDS'];
      const permPayload = JSON.stringify({
        userId: patientId,
        permissions: newPerms,
      });
      const res = await makeHttpRequest(
        port,
        '/api/admin/update-permissions',
        'POST',
        {
          Authorization: `Bearer ${sysAdminToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(permPayload).toString(),
        },
        permPayload
      );
      assert.equal(res.statusCode, 200);
      assert.equal(res.body?.success, true);
      assert.deepEqual(res.body?.user?.dataAccessPermissions, newPerms);

      // Verify database
      const dbRes = await pool.query('SELECT data_access_permissions FROM users WHERE id = $1', [patientId]);
      assert.deepEqual(dbRes.rows[0].data_access_permissions, newPerms);
    });

    // TEST 8: Verify zero occurrences of Hyperledger in src/
    await runTest('Grep check: src/ contains zero occurrences of "Hyperledger"', async () => {
      function searchDirectory(dir: string): string[] {
        let matches: string[] = [];
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            matches = matches.concat(searchDirectory(fullPath));
          } else if (/\.(tsx?|jsx?|html|css|json)$/.test(file)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (/Hyperledger/i.test(content)) {
              matches.push(fullPath);
            }
          }
        }
        return matches;
      }

      const srcDir = path.resolve('src');
      const matches = searchDirectory(srcDir);
      assert.equal(matches.length, 0, `Found "Hyperledger" in files: ${matches.join(', ')}`);
    });

  } finally {
    server.close();
  }

  console.log(`\nResults: ${passedTests}/${totalTests} tests passed.`);
  if (passedTests === totalTests) {
    console.log('All M23 System Admin & User Governance checks PASSED successfully!');
  } else {
    throw new Error(`Only ${passedTests}/${totalTests} passed.`);
  }
}

runSystemAdminTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
