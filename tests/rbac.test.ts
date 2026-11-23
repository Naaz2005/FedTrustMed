import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';

// Set environment for test mode
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';

import { app } from '../server.js';
import { pool } from '../server/db.js';
import { verifyToken } from '../server/security.js';

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

/**
 * Helper: login as a seeded user and return the JWT token.
 */
async function loginAs(
  port: number,
  email: string,
  password: string = 'Password123!'
): Promise<string> {
  const res = await makeHttpRequest(
    port,
    '/api/auth/login',
    'POST',
    { 'Content-Type': 'application/json' },
    JSON.stringify({ email, password })
  );

  if (res.statusCode !== 200) {
    throw new Error(`Login failed for ${email}: ${res.statusCode} ${res.rawBody}`);
  }
  return res.body.token;
}

async function main() {
  console.log('============================================================');
  console.log('FedTrustMed Module M5 - RBAC (Role-Based Access Control) Tests');
  console.log('============================================================\n');

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // ========================================================================
    // 1. PUBLIC ROUTES: accessible without auth
    // ========================================================================
    console.log('Testing public routes (no auth required):');

    await runAsyncTest('GET /api/health is public (200)', async () => {
      const res = await makeHttpRequest(port, '/api/health', 'GET', {});
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { ok: true });
    });

    await runAsyncTest('GET /api/hospitals is public (200) and returns id+name only', async () => {
      const res = await makeHttpRequest(port, '/api/hospitals', 'GET', {});
      assert.equal(res.statusCode, 200);
      assert.ok(Array.isArray(res.body), 'Expected hospitals array');
      assert.ok(res.body.length > 0, 'Expected at least one hospital');
      // Verify only id and name fields are returned (no region, address, etc.)
      for (const h of res.body) {
        assert.ok(h.id, 'Expected id field');
        assert.ok(h.name, 'Expected name field');
        const keys = Object.keys(h);
        assert.equal(keys.length, 2, `Expected only id and name fields, got: ${keys.join(', ')}`);
      }
    });

    await runAsyncTest('POST /api/auth/login is public (accepts requests without auth header)', async () => {
      // Even a bad login should return 401, NOT a "token required" error
      const res = await makeHttpRequest(
        port,
        '/api/auth/login',
        'POST',
        { 'Content-Type': 'application/json' },
        JSON.stringify({ email: 'nobody@example.com', password: 'wrong' })
      );
      assert.equal(res.statusCode, 401);
      // The error should be "Invalid credentials" not "Authentication token required"
      assert.ok(!res.body.error.includes('token'), 'Login should not require a token');
    });

    // ========================================================================
    // 2. NO TOKEN → 401 ON EVERY NON-PUBLIC ROUTE (loop over route list)
    // ========================================================================
    console.log('\nTesting 401 on non-public routes without token:');

    const protectedRoutes = [
      { method: 'GET', path: '/api/auth/me' },
      { method: 'GET', path: '/api/admin/users' },
      { method: 'GET', path: '/api/admin/audit-logs' },
      { method: 'GET', path: '/api/hospital/staff' },
      { method: 'GET', path: '/api/hospital/pending-approvals' },
      { method: 'GET', path: '/api/records' },
      { method: 'GET', path: '/api/patients' },
      { method: 'GET', path: '/api/patients/me' },
      { method: 'GET', path: '/api/patients/me/records' },
      { method: 'GET', path: '/api/consent' },
      { method: 'GET', path: '/api/notifications' },
    ];

    for (const route of protectedRoutes) {
      await runAsyncTest(`${route.method} ${route.path} without token → 401`, async () => {
        const res = await makeHttpRequest(port, route.path, route.method, {});
        assert.equal(
          res.statusCode,
          401,
          `Expected 401 for ${route.method} ${route.path}, got ${res.statusCode}: ${res.rawBody}`
        );
        assert.ok(res.body && typeof res.body.error === 'string', 'Expected error message');
      });
    }

    // ========================================================================
    // 3. PATIENT TOKEN ON ADMIN ROUTE → 403
    // ========================================================================
    console.log('\nTesting role-based access (patient token on restricted routes):');

    const patientToken = await loginAs(port, 'patient@fedtrustmed.demo');
    const doctorToken = await loginAs(port, 'doctor@fedtrustmed.demo');
    const hospitalAdminToken = await loginAs(port, 'hospital_admin@fedtrustmed.demo');
    const systemAdminToken = await loginAs(port, 'system_admin@fedtrustmed.demo');

    // Admin-only routes should reject patient
    const adminOnlyRoutes = [
      { method: 'GET', path: '/api/admin/users' },
      { method: 'GET', path: '/api/admin/audit-logs' },
    ];

    for (const route of adminOnlyRoutes) {
      await runAsyncTest(`PATIENT token on ${route.path} → 403`, async () => {
        const res = await makeHttpRequest(port, route.path, route.method, {
          Authorization: `Bearer ${patientToken}`,
        });
        assert.equal(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
        assert.ok(res.body.error.includes('Access denied'), 'Expected Access denied message');
      });
    }

    // Hospital admin routes should reject patient
    const hospitalAdminRoutes = [
      { method: 'GET', path: '/api/hospital/staff' },
      { method: 'GET', path: '/api/hospital/pending-approvals' },
    ];

    for (const route of hospitalAdminRoutes) {
      await runAsyncTest(`PATIENT token on ${route.path} → 403`, async () => {
        const res = await makeHttpRequest(port, route.path, route.method, {
          Authorization: `Bearer ${patientToken}`,
        });
        assert.equal(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
        assert.ok(res.body.error.includes('Access denied'), 'Expected Access denied message');
      });
    }

    // Doctor routes should reject patient
    const doctorRoutes = [
      { method: 'GET', path: '/api/records' },
      { method: 'GET', path: '/api/patients' },
    ];

    for (const route of doctorRoutes) {
      await runAsyncTest(`PATIENT token on ${route.path} → 403`, async () => {
        const res = await makeHttpRequest(port, route.path, route.method, {
          Authorization: `Bearer ${patientToken}`,
        });
        assert.equal(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
        assert.ok(res.body.error.includes('Access denied'), 'Expected Access denied message');
      });
    }

    // Patient-only routes should reject doctor
    await runAsyncTest('DOCTOR token on /api/patients/me → 403', async () => {
      const res = await makeHttpRequest(port, '/api/patients/me', 'GET', {
        Authorization: `Bearer ${doctorToken}`,
      });
      assert.equal(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
      assert.ok(res.body.error.includes('Access denied'));
    });

    await runAsyncTest('DOCTOR token on /api/patients/me/records → 403', async () => {
      const res = await makeHttpRequest(port, '/api/patients/me/records', 'GET', {
        Authorization: `Bearer ${doctorToken}`,
      });
      assert.equal(res.statusCode, 403, `Expected 403, got ${res.statusCode}`);
      assert.ok(res.body.error.includes('Access denied'));
    });

    // ========================================================================
    // 4. VALID ROLE ACCESS — each role succeeds on its allowed routes
    // ========================================================================
    console.log('\nTesting valid role access (each role succeeds on its own routes):');

    await runAsyncTest('SYSTEM_ADMIN can access /api/admin/users', async () => {
      const res = await makeHttpRequest(port, '/api/admin/users', 'GET', {
        Authorization: `Bearer ${systemAdminToken}`,
      });
      assert.equal(res.statusCode, 200);
    });

    await runAsyncTest('SYSTEM_ADMIN can access /api/admin/audit-logs', async () => {
      const res = await makeHttpRequest(port, '/api/admin/audit-logs', 'GET', {
        Authorization: `Bearer ${systemAdminToken}`,
      });
      assert.equal(res.statusCode, 200);
    });

    await runAsyncTest('HOSPITAL_ADMIN can access /api/hospital/staff', async () => {
      const res = await makeHttpRequest(port, '/api/hospital/staff', 'GET', {
        Authorization: `Bearer ${hospitalAdminToken}`,
      });
      assert.equal(res.statusCode, 200);
    });

    await runAsyncTest('DOCTOR can access /api/records', async () => {
      const res = await makeHttpRequest(port, '/api/records', 'GET', {
        Authorization: `Bearer ${doctorToken}`,
      });
      assert.equal(res.statusCode, 200);
    });

    await runAsyncTest('PATIENT can access /api/patients/me', async () => {
      const res = await makeHttpRequest(port, '/api/patients/me', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(res.statusCode, 200);
    });

    await runAsyncTest('All authenticated users can access /api/consent', async () => {
      for (const [role, token] of Object.entries({
        PATIENT: patientToken,
        DOCTOR: doctorToken,
        HOSPITAL_ADMIN: hospitalAdminToken,
        SYSTEM_ADMIN: systemAdminToken,
      })) {
        const res = await makeHttpRequest(port, '/api/consent', 'GET', {
          Authorization: `Bearer ${token}`,
        });
        assert.equal(res.statusCode, 200, `Expected 200 for ${role} on /api/consent`);
      }
    });

    await runAsyncTest('All authenticated users can access /api/notifications', async () => {
      for (const [role, token] of Object.entries({
        PATIENT: patientToken,
        DOCTOR: doctorToken,
        HOSPITAL_ADMIN: hospitalAdminToken,
        SYSTEM_ADMIN: systemAdminToken,
      })) {
        const res = await makeHttpRequest(port, '/api/notifications', 'GET', {
          Authorization: `Bearer ${token}`,
        });
        assert.equal(res.statusCode, 200, `Expected 200 for ${role} on /api/notifications`);
      }
    });

    // ========================================================================
    // 5. is_frozen=true IN DB MAKES EXISTING TOKEN FAIL ON NEXT REQUEST
    // ========================================================================
    console.log('\nTesting is_frozen revocation (existing token fails after freeze):');

    // First verify the patient token still works
    await runAsyncTest('Patient token works BEFORE freeze', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(res.statusCode, 200);
    });

    // Get the patient userId from token
    const patientPayload = verifyToken(patientToken);
    const patientUserId = patientPayload.userId;

    // Freeze the account in the database
    await pool.query('UPDATE users SET is_frozen = TRUE, updated_at = NOW() WHERE id = $1', [patientUserId]);

    await runAsyncTest('Patient token FAILS (403) immediately after is_frozen=true in DB', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(res.statusCode, 403, `Expected 403 for frozen user, got ${res.statusCode}`);
      assert.ok(res.body.error.includes('frozen'), 'Expected frozen message');
    });

    // Also verify frozen token fails on role-protected routes
    await runAsyncTest('Frozen patient token also fails on /api/patients/me', async () => {
      const res = await makeHttpRequest(port, '/api/patients/me', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(res.statusCode, 403, `Expected 403 for frozen user, got ${res.statusCode}`);
      assert.ok(res.body.error.includes('frozen'), 'Expected frozen message');
    });

    // Also verify frozen token fails on /api/consent (generic auth route)
    await runAsyncTest('Frozen patient token also fails on /api/consent', async () => {
      const res = await makeHttpRequest(port, '/api/consent', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(res.statusCode, 403, `Expected 403 for frozen user, got ${res.statusCode}`);
      assert.ok(res.body.error.includes('frozen'));
    });

    // Unfreeze for cleanup
    await pool.query('UPDATE users SET is_frozen = FALSE, updated_at = NOW() WHERE id = $1', [patientUserId]);

    await runAsyncTest('Patient token works again AFTER unfreeze', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${patientToken}`,
      });
      assert.equal(res.statusCode, 200);
    });

    // ========================================================================
    // 6. APPROVAL STATUS REVOCATION — setting approval_status = 'PENDING' blocks
    // ========================================================================
    console.log('\nTesting approval status revocation (token fails if not APPROVED):');

    // Change doctor approval status to PENDING
    const doctorPayload = verifyToken(doctorToken);
    const doctorUserId = doctorPayload.userId;

    await pool.query("UPDATE users SET approval_status = 'PENDING', updated_at = NOW() WHERE id = $1", [doctorUserId]);

    await runAsyncTest('Doctor token fails (403) after approval_status set to PENDING', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Bearer ${doctorToken}`,
      });
      assert.equal(res.statusCode, 403, `Expected 403 for non-approved user, got ${res.statusCode}`);
      assert.ok(res.body.error.includes('not approved'), 'Expected not approved message');
    });

    // Restore
    await pool.query("UPDATE users SET approval_status = 'APPROVED', updated_at = NOW() WHERE id = $1", [doctorUserId]);

    // ========================================================================
    // 7. INVALID / EXPIRED / TAMPERED TOKENS
    // ========================================================================
    console.log('\nTesting invalid tokens:');

    await runAsyncTest('Completely invalid token → 401', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: 'Bearer not.a.valid.jwt.token',
      });
      assert.equal(res.statusCode, 401);
    });

    await runAsyncTest('Empty Bearer → 401', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: 'Bearer ',
      });
      assert.equal(res.statusCode, 401);
    });

    await runAsyncTest('Missing Bearer prefix → 401', async () => {
      const res = await makeHttpRequest(port, '/api/auth/me', 'GET', {
        Authorization: `Token ${patientToken}`,
      });
      assert.equal(res.statusCode, 401);
    });

    // ========================================================================
    // 8. CROSS-ROLE ESCALATION TABLE — comprehensive matrix
    // ========================================================================
    console.log('\nTesting complete role escalation matrix:');

    const roleTokenMap: Record<string, string> = {
      PATIENT: patientToken,
      DOCTOR: doctorToken,
      HOSPITAL_ADMIN: hospitalAdminToken,
      SYSTEM_ADMIN: systemAdminToken,
    };

    // Routes and their allowed roles
    const routePermissions = [
      { path: '/api/admin/users', allowed: ['SYSTEM_ADMIN'] },
      { path: '/api/admin/audit-logs', allowed: ['SYSTEM_ADMIN'] },
      { path: '/api/hospital/staff', allowed: ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'] },
      { path: '/api/hospital/pending-approvals', allowed: ['HOSPITAL_ADMIN', 'SYSTEM_ADMIN'] },
      { path: '/api/records', allowed: ['DOCTOR', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'] },
      { path: '/api/patients', allowed: ['DOCTOR', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'] },
      { path: '/api/patients/me', allowed: ['PATIENT'] },
      { path: '/api/patients/me/records', allowed: ['PATIENT'] },
    ];

    for (const route of routePermissions) {
      for (const [role, token] of Object.entries(roleTokenMap)) {
        const isAllowed = route.allowed.includes(role);
        const expectedStatus = isAllowed ? 200 : 403;

        await runAsyncTest(
          `${role} on ${route.path} → ${expectedStatus} (${isAllowed ? 'allowed' : 'denied'})`,
          async () => {
            const res = await makeHttpRequest(port, route.path, 'GET', {
              Authorization: `Bearer ${token}`,
            });
            assert.equal(
              res.statusCode,
              expectedStatus,
              `Expected ${expectedStatus} for ${role} on ${route.path}, got ${res.statusCode}: ${res.rawBody}`
            );
          }
        );
      }
    }

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await pool.end();
  }

  console.log('\n============================================================');
  console.log(`ALL RBAC TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
  console.log('============================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFatal test runner error:', err);
  pool.end().finally(() => process.exit(1));
});
