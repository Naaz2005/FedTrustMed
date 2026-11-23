import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

async function makeMultipartRequest(
  url: string,
  fields: Record<string, string>,
  file?: { fieldName: string; filename: string; contentType: string; buffer: Buffer }
): Promise<{ status: number; body: any }> {
  const boundary = `----WebKitFormBoundary${Date.now()}`;
  const chunks: Buffer[] = [];

  for (const [key, val] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
  }

  if (file) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      )
    );
    chunks.push(file.buffer);
    chunks.push(Buffer.from('\r\n'));
  }

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const fullBody = Buffer.concat(chunks);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': fullBody.length.toString(),
    },
    body: fullBody,
  });

  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  return { status: res.status, body };
}

import { pool } from '../server/db.js';

async function runM11Checks() {
  console.log('============================================================');
  console.log('Verifying Module M11 4 Checks against Running Server');
  console.log('============================================================\n');

  // Clean up any test artifacts from prior runs
  await pool.query("DELETE FROM users WHERE aadhaar_last4 = '0002' OR email IN ('dr.priya.m11@test.org', 'another.priya.m11@test.org', 'dr.rajesh.m11@test.org')");

  const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Medical Licence) >>\nendobj\ntrailer\n<<>>\n%%EOF');
  const txtBuffer = Buffer.from('This is a plain text file, not a valid medical licence.');

  // Step 1: Register doctor with TEST-AADHAAR-0002 and a PDF licence
  console.log('Step 1: Registering doctor with TEST-AADHAAR-0002 and PDF licence...');
  const reg1 = await makeMultipartRequest('http://localhost:3000/api/auth/register', {
    fullName: 'Dr. Priya Patel',
    email: 'dr.priya.m11@test.org',
    password: 'Password123!',
    role: 'DOCTOR',
    hospitalId: 'hosp-st-jude',
    departmentId: 'Cardiology',
    aadhaar: 'TEST-AADHAAR-0002',
    medicalLicenseNumber: 'TEST-MED-LIC-0001',
  }, {
    fieldName: 'file',
    filename: 'licence.pdf',
    contentType: 'application/pdf',
    buffer: pdfBuffer,
  });

  console.log(`  -> Status: ${reg1.status}`);
  console.log(`  -> Response:`, reg1.body);
  assert.equal(reg1.status, 200);
  assert.equal(reg1.body.user.approvalStatus, 'PENDING');
  console.log('  ✓ Step 1 Passed: Doctor registered with PENDING approval status\n');

  // Step 2: Log in and see the "pending approval" message
  console.log('Step 2: Attempting login with pending doctor credentials...');
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'dr.priya.m11@test.org',
      password: 'Password123!',
    }),
  });
  const loginBody = await loginRes.json();
  console.log(`  -> Status: ${loginRes.status}`);
  console.log(`  -> Response:`, loginBody);
  assert.equal(loginRes.status, 403);
  assert.ok(loginBody.error.includes('pending administrator approval'));
  console.log(`  ✓ Step 2 Passed: Received pending approval message: "${loginBody.error}"\n`);

  // Step 3: Register the same Aadhaar again and see the real error text
  console.log('Step 3: Registering the same Aadhaar again (TEST-AADHAAR-0002)...');
  const reg2 = await makeMultipartRequest('http://localhost:3000/api/auth/register', {
    fullName: 'Dr. Priya Patel',
    email: 'another.priya.m11@test.org',
    password: 'Password123!',
    role: 'DOCTOR',
    hospitalId: 'hosp-st-jude',
    departmentId: 'Cardiology',
    aadhaar: 'TEST-AADHAAR-0002',
    medicalLicenseNumber: 'TEST-MED-LIC-0001',
  }, {
    fieldName: 'file',
    filename: 'licence.pdf',
    contentType: 'application/pdf',
    buffer: pdfBuffer,
  });

  console.log(`  -> Status: ${reg2.status}`);
  console.log(`  -> Response:`, reg2.body);
  assert.equal(reg2.status, 400);
  assert.ok(reg2.body.error.includes('already registered'));
  console.log(`  ✓ Step 3 Passed: Received duplicate Aadhaar error: "${reg2.body.error}"\n`);

  // Step 4: Try a .txt licence and see the file-type message
  console.log('Step 4: Registering with a .txt licence file...');
  const reg3 = await makeMultipartRequest('http://localhost:3000/api/auth/register', {
    fullName: 'Dr. Rajesh Gupta',
    email: 'dr.rajesh.m11@test.org',
    password: 'Password123!',
    role: 'DOCTOR',
    hospitalId: 'hosp-metro-heart',
    departmentId: 'Cardiology',
    aadhaar: 'TEST-AADHAAR-0005',
    medicalLicenseNumber: 'TEST-MED-LIC-0002',
  }, {
    fieldName: 'file',
    filename: 'licence.txt',
    contentType: 'text/plain',
    buffer: txtBuffer,
  });

  console.log(`  -> Status: ${reg3.status}`);
  console.log(`  -> Response:`, reg3.body);
  assert.equal(reg3.status, 400);
  assert.ok(reg3.body.error.includes('PDF, JPG, or PNG'));
  console.log(`  ✓ Step 4 Passed: Received file-type error message: "${reg3.body.error}"\n`);

  console.log('============================================================');
  console.log('ALL 4 MODULE M11 CHECKS VERIFIED SUCCESSFULLY!');
  console.log('============================================================');
  process.exit(0);
}

runM11Checks().catch((err) => {
  console.error('Check failed:', err);
  process.exit(1);
});
