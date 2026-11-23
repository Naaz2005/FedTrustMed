import assert from 'node:assert/strict';
import crypto from 'node:crypto';

async function makeJsonRequest(
  url: string,
  method: string,
  body?: any,
  token?: string
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function loginUser(email: string, pass: string): Promise<{ status: number; body: any }> {
  return makeJsonRequest('http://localhost:3000/api/auth/login', 'POST', {
    email,
    password: pass,
  });
}

async function runM13Verification() {
  console.log('============================================================');
  console.log('Verifying Module M13: Approvals UI & Verification Workflows');
  console.log('============================================================\n');

  // Step 0: Acquire System Admin Token
  console.log('0. Authenticating as System Admin...');
  const adminLogin = await loginUser('system_admin@fedtrustmed.demo', 'Password123!');
  assert.equal(adminLogin.status, 200);
  const adminToken = adminLogin.body.token;
  console.log('  ✓ System Admin authenticated successfully.\n');

  // Setup: Create 2 pending users via registration endpoint
  console.log('Setup: Creating pending users for approval and rejection flows...');

  // User A: Pending Doctor for approval testing
  const doctorEmail = `doc.m13.${Date.now()}@test.org`;
  const doctorPassword = 'Password123!';
  const boundaryA = `----Boundary${Date.now()}A`;
  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Medical Licence) >>\nendobj\ntrailer\n<<>>\n%%EOF');

  const regAFields = [
    `--${boundaryA}\r\nContent-Disposition: form-data; name="fullName"\r\n\r\nDr. M13 Approval Test\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="email"\r\n\r\n${doctorEmail}\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="password"\r\n\r\n${doctorPassword}\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="role"\r\n\r\nDOCTOR\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="hospitalId"\r\n\r\nhosp-st-jude\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="departmentId"\r\n\r\nCardiology\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="aadhaar"\r\n\r\nTEST-AADHAAR-0005\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="medicalLicenseNumber"\r\n\r\nTEST-MED-LIC-0002\r\n`,
    `--${boundaryA}\r\nContent-Disposition: form-data; name="file"; filename="licence.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
  ];
  const regABody = Buffer.concat([
    Buffer.from(regAFields.join('')),
    pdfBuffer,
    Buffer.from(`\r\n--${boundaryA}--\r\n`),
  ]);

  const regARes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundaryA}`,
      'Content-Length': regABody.length.toString(),
    },
    body: regABody,
  });
  const regABodyJson = await regARes.json();
  if (regARes.status !== 200) {
    console.error('Registration A failed with:', regABodyJson);
  }
  assert.equal(regARes.status, 200);
  const pendingDoctorId = regABodyJson.user.id;
  console.log(`  ✓ Created pending doctor: ${doctorEmail} (ID: ${pendingDoctorId})`);

  // User B: Pending Patient for rejection testing
  const rejectUserEmail = `patient.reject.${Date.now()}@test.org`;
  const rejectUserPassword = 'Password123!';
  const boundaryB = `----Boundary${Date.now()}B`;
  const regBBody = Buffer.from(
    `--${boundaryB}\r\nContent-Disposition: form-data; name="fullName"\r\n\r\nRejection Candidate\r\n` +
    `--${boundaryB}\r\nContent-Disposition: form-data; name="email"\r\n\r\n${rejectUserEmail}\r\n` +
    `--${boundaryB}\r\nContent-Disposition: form-data; name="password"\r\n\r\n${rejectUserPassword}\r\n` +
    `--${boundaryB}\r\nContent-Disposition: form-data; name="role"\r\n\r\nPATIENT\r\n` +
    `--${boundaryB}\r\nContent-Disposition: form-data; name="hospitalId"\r\n\r\nhosp-st-jude\r\n` +
    `--${boundaryB}\r\nContent-Disposition: form-data; name="aadhaar"\r\n\r\nTEST-AADHAAR-0001\r\n` +
    `--${boundaryB}--\r\n`
  );

  const regBRes = await fetch('http://localhost:3000/api/auth/register', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundaryB}`,
      'Content-Length': regBBody.length.toString(),
    },
    body: regBBody,
  });
  const regBBodyJson = await regBRes.json();
  assert.equal(regBRes.status, 200);
  const rejectUserId = regBBodyJson.user.id;
  console.log(`  ✓ Created rejection candidate: ${rejectUserEmail} (ID: ${rejectUserId})\n`);

  // ========================================================================
  // CHECK 1: Approve pending doctor WITHOUT ticking boxes -> message instead of silent close
  // ========================================================================
  console.log('Check 1: Approving doctor without verification checkboxes...');
  // The client validation refuses to submit and displays the error message.
  // Moreover, if submitted to the server without prior document verification,
  // the server rejects with HTTP 403:
  const unverifiedApproveRes = await makeJsonRequest(
    'http://localhost:3000/api/admin/approve-user',
    'POST',
    { userId: pendingDoctorId, role: 'DOCTOR' },
    adminToken
  );
  console.log(`  -> Status: ${unverifiedApproveRes.status}`);
  console.log(`  -> Error Response:`, unverifiedApproveRes.body);
  assert.equal(unverifiedApproveRes.status, 403);
  assert.ok(
    unverifiedApproveRes.body.error.includes('Aadhaar') ||
    unverifiedApproveRes.body.error.includes('licence')
  );
  console.log('  ✓ Check 1 Passed: Unticked / unverified approval rejected with error message.\n');

  // ========================================================================
  // CHECK 2: Tick boxes, approve, and log in as that doctor
  // ========================================================================
  console.log('Check 2: Ticking verification boxes, approving doctor, and logging in...');

  // 1. Verify user documents (ticking "I verified the Aadhaar" and "I verified the licence")
  const verifyRes = await makeJsonRequest(
    'http://localhost:3000/api/admin/verify-user-documents',
    'POST',
    {
      userId: pendingDoctorId,
      aadhaarVerified: true,
      medicalLicenseVerified: true,
    },
    adminToken
  );
  assert.equal(verifyRes.status, 200);
  console.log('  -> Documents verified (Aadhaar: VERIFIED, Licence: VERIFIED)');

  // 2. Dispatch approval
  const approveRes = await makeJsonRequest(
    'http://localhost:3000/api/admin/approve-user',
    'POST',
    {
      userId: pendingDoctorId,
      role: 'DOCTOR',
      permissions: ['READ_RECORDS', 'WRITE_RECORDS', 'CONSENT_OVERRIDE'],
    },
    adminToken
  );
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.user.approvalStatus, 'APPROVED');
  console.log('  -> Doctor approval succeeded (200 OK)');

  // 3. Log in as that newly approved doctor
  const doctorLogin = await loginUser(doctorEmail, doctorPassword);
  console.log(`  -> Doctor Login Status: ${doctorLogin.status}`);
  assert.equal(doctorLogin.status, 200);
  assert.ok(doctorLogin.body.token, 'Doctor login returned valid JWT token');
  assert.equal(doctorLogin.body.user.role, 'DOCTOR');
  assert.equal(doctorLogin.body.user.approvalStatus, 'APPROVED');
  console.log('  ✓ Check 2 Passed: Approved doctor can now sign in successfully.\n');

  // ========================================================================
  // CHECK 3: Reject another user with reason and confirm account cannot log in
  // ========================================================================
  console.log('Check 3: Rejecting candidate with reason and verifying login blocked...');

  const rejectionReason = 'Aadhaar identity demographic verification failed against hospital registry.';

  // Attempt rejection with reason < 5 chars -> should fail
  const shortReasonRes = await makeJsonRequest(
    'http://localhost:3000/api/admin/reject-user',
    'POST',
    { userId: rejectUserId, reason: 'Bad' },
    adminToken
  );
  assert.equal(shortReasonRes.status, 400);
  console.log('  -> Rejection with < 5 chars rejected (400)');

  // Reject with valid 5-300 char reason
  const rejectRes = await makeJsonRequest(
    'http://localhost:3000/api/admin/reject-user',
    'POST',
    { userId: rejectUserId, reason: rejectionReason },
    adminToken
  );
  assert.equal(rejectRes.status, 200);
  assert.equal(rejectRes.body.user.approvalStatus, 'REJECTED');
  console.log(`  -> User rejected with reason: "${rejectionReason}"`);

  // Confirm that rejected account CANNOT log in
  const rejectLogin = await loginUser(rejectUserEmail, rejectUserPassword);
  console.log(`  -> Rejected User Login Status: ${rejectLogin.status}`);
  console.log(`  -> Rejected User Login Response:`, rejectLogin.body);
  assert.equal(rejectLogin.status, 403);
  assert.ok(rejectLogin.body.error.includes('rejected'));
  assert.ok(rejectLogin.body.error.includes(rejectionReason));
  console.log('  ✓ Check 3 Passed: Rejected account cannot sign in (403 Forbidden with rejection reason).\n');

  console.log('============================================================');
  console.log('ALL MODULE M13 CHECKS VERIFIED SUCCESSFULLY!');
  console.log('============================================================\n');
}

runM13Verification().catch((err) => {
  console.error('M13 Verification Failed:', err);
  process.exit(1);
});
