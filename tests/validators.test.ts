import assert from 'node:assert/strict';
import { AddressInfo } from 'node:net';
import http from 'node:http';

// Set test environment before imports
process.env.NODE_ENV = 'test';
process.env.SIMULATION_MODE = 'true';
process.env.MASTER_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

import {
  validateFullName,
  validateEmail,
  validatePassword,
  validateAadhaar,
  validateLicenceNumber,
  validateHospitalAuthCode,
  validateRole,
  validateHospital,
  validateDepartment,
  validateRecordType,
  validateDeviceType,
  validateConsentPurpose,
  validateRecordTitle,
  validateDiagnosis,
  validateClinicalNote,
  validatePrescriptionItem,
  validatePrescriptions,
  validateLabTests,
  validateRejectionReason,
  validateBreakGlassReason,
  validateDeviceReadings,
  validateHeartRate,
  validateSpO2,
  validateSystolic,
  validateDiastolic,
  validateTemperature,
  stripControlChars,
  cleanInput,
  computeAadhaarHash,
  hashAadhaar,
  validateVerhoeff,
} from '../server/validators.js';

import { app } from '../server.js';

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

function testValidator<T>(
  validatorName: string,
  validatorFn: (val: any) => { ok: boolean; value?: T; error?: string },
  goodCases: any[],
  badCases: any[]
) {
  console.log(`\nTesting ${validatorName} (Good: ${goodCases.length}, Bad: ${badCases.length}):`);
  assert(goodCases.length >= 5, `${validatorName} must have at least 5 good test cases`);
  assert(badCases.length >= 5, `${validatorName} must have at least 5 bad test cases`);

  goodCases.forEach((val, idx) => {
    runTest(`${validatorName} accepts good case #${idx + 1}: ${JSON.stringify(val)}`, () => {
      const res = validatorFn(val);
      assert.equal(res.ok, true, `Expected good case to pass: ${JSON.stringify(val)}, got error: ${res.error}`);
      assert.notEqual(res.value, undefined, 'Expected valid value to be returned');
    });
  });

  badCases.forEach((val, idx) => {
    runTest(`${validatorName} rejects bad case #${idx + 1}: ${JSON.stringify(val)}`, () => {
      const res = validatorFn(val);
      assert.equal(res.ok, false, `Expected bad case to fail: ${JSON.stringify(val)}`);
      assert.ok(typeof res.error === 'string' && res.error.length > 0, 'Expected readable error message');
    });
  });
}

console.log('============================================================');
console.log('FedTrustMed Module M3 - Validator & Server Security Tests');
console.log('============================================================');

// 1. Full Name Validator
testValidator(
  'validateFullName',
  validateFullName,
  [
    'Aarav Sharma',
    'Dr. Priya Patel',
    "Jean-Luc O'Connor",
    'Mary-Jane Watson',
    'Meera K. Iyer',
  ],
  [
    'A', // Too short (< 2)
    'John Doe 123', // Contains numbers
    'Dr. Smith <script>', // Special symbols
    '    ', // Whitespace only
    'A'.repeat(85), // Too long (> 80)
    null, // Not a string
  ]
);

// 2. Email Validator
testValidator(
  'validateEmail',
  validateEmail,
  [
    'aarav.sharma@example.com',
    'priya.patel@stjude.org',
    'DOCTOR.RESEARCH@METROHEART.ORG', // Test lower-casing
    'admin+emergency@hospital.net',
    'user123@sub.domain.co',
  ],
  [
    'invalid-email-address',
    '@nodomain.com',
    'missinguser@',
    'user@nodot',
    'a'.repeat(250) + '@example.com', // > 254 chars
    'user space@example.com',
  ]
);

// Verify email lower-cased requirement specifically
runTest('validateEmail converts value to lower-case', () => {
  const res = validateEmail('DOCTOR.Patel@Hospital.ORG');
  assert.equal(res.ok, true);
  assert.equal(res.value, 'doctor.patel@hospital.org');
});

// 3. Password Validator
testValidator(
  'validatePassword',
  validatePassword,
  [
    'Password123!',
    'FedTrustMed2026',
    'SecurePassw0rd',
    'a1b2c3d4e5f6',
    'longPassphraseWithNumber9',
  ],
  [
    'Pass1', // < 10 chars
    'OnlyLettersNoNumbers', // No number
    '1234567890123', // No letter
    '!@#$%^&*()_+=', // No letters or numbers
    'Password1' + 'a'.repeat(125), // > 128 chars
    12345678901, // Not a string
  ]
);

// 4. Aadhaar Validator with Verhoeff checksum & simulation mode
testValidator(
  'validateAadhaar',
  validateAadhaar,
  [
    '234567890124', // Valid 12 digits, starts with 2, valid Verhoeff
    '345678901238', // Valid 12 digits, starts with 3, valid Verhoeff
    '456789012341', // Valid 12 digits, starts with 4, valid Verhoeff
    '567890123458', // Valid 12 digits, starts with 5, valid Verhoeff
    '987654321096', // Valid 12 digits, starts with 9, valid Verhoeff
    'TEST-AADHAAR-0001', // Simulation mode allowed
  ],
  [
    '012345678901', // Starts with 0
    '123456789012', // Starts with 1
    '23456789012', // 11 digits
    '2345678901245', // 13 digits
    '234567890125', // Invalid Verhoeff checksum digit
    '23456789012A', // Contains letter
  ]
);

// 5. Licence Number Validator
testValidator(
  'validateLicenceNumber',
  validateLicenceNumber,
  [
    'MH-123456',
    'DL/9876543',
    'KA12345678',
    'MED-1234',
    'TEST-MED-LIC-0001', // Simulation mode
    'WB-9999999999',
  ],
  [
    'M-12345', // Less than 2 letters
    'STATE-12345', // More than 4 letters
    'MH-123', // Less than 4 digits
    'MH-123456789012', // More than 10 digits
    'MH@12345', // Invalid separator
    '', // Empty
  ]
);

// 6. Hospital Authorization Code Validator
testValidator(
  'validateHospitalAuthCode',
  validateHospitalAuthCode,
  [
    'HOSP-ADMIN-AUTH-001',
    'HOSP-ADMIN-AUTH-042',
    'HOSP-ADMIN-AUTH-100',
    'HOSP-ADMIN-AUTH-789',
    'HOSP-ADMIN-AUTH-999',
  ],
  [
    'HOSP-ADMIN-AUTH-12', // 2 digits instead of 3
    'HOSP-ADMIN-AUTH-1234', // 4 digits instead of 3
    'HOSP-ADMIN-AUTH-ABC', // Non-digits
    'HOSP-AUTH-001', // Missing ADMIN
    'hosp-admin-auth-001', // Lowercase
    '', // Empty
  ]
);

// 7. Role Enum Validator
testValidator(
  'validateRole',
  validateRole,
  [
    'PATIENT',
    'DOCTOR',
    'HOSPITAL_ADMIN',
    'SYSTEM_ADMIN',
    'PATIENT ', // Cleaned/trimmed
  ],
  [
    'SUPER_ADMIN',
    'NURSE',
    'GUEST',
    'patient',
    '',
    null,
  ]
);

// 8. Hospital Enum Validator
testValidator(
  'validateHospital',
  validateHospital,
  [
    'hosp-st-jude',
    'hosp-metro-heart',
    'hosp-city-memorial',
    'ST-JUDE',
    'METRO-HCS',
  ],
  [
    'hosp-unknown',
    'unregistered-clinic',
    'City General',
    '',
    123,
  ]
);

// 9. Department Enum Validator
testValidator(
  'validateDepartment',
  validateDepartment,
  [
    'dept-stjude-cardio',
    'dept-stjude-genmed',
    'dept-metro-cardio',
    'dept-metro-onco',
    'dept-city-genmed',
  ],
  [
    'dept-radiology',
    'dept-fake',
    'Pediatrics',
    '',
    false,
  ]
);

// 10. Record Type Enum Validator
testValidator(
  'validateRecordType',
  validateRecordType,
  [
    'Cardiology Report',
    'Diagnostic Report',
    'Prescription',
    'Lab Report',
    'Discharge Summary',
  ],
  [
    'Secret Dossier',
    'Financial Invoice',
    'Personal Diary',
    'X-Ray Scan',
    '',
  ]
);

// 11. Device Type Enum Validator
testValidator(
  'validateDeviceType',
  validateDeviceType,
  [
    'Heart Rate Monitor',
    'Pulse Oximeter',
    'Blood Pressure Monitor',
    'Thermometer',
    'ECG Monitor',
  ],
  [
    'Smart Phone',
    'Fitness Tracker',
    'Security Camera',
    'Microphone',
    '',
  ]
);

// 12. Consent Purpose Enum Validator
testValidator(
  'validateConsentPurpose',
  validateConsentPurpose,
  [
    'Treatment',
    'Second opinion',
    'Emergency',
    'Research',
    ' Treatment ', // Trimmed
  ],
  [
    'Commercial Marketing',
    'Insurance Investigation',
    'Law Enforcement',
    'Third Party Sale',
    '',
  ]
);

// 13. Record Title Validator
testValidator(
  'validateRecordTitle',
  validateRecordTitle,
  [
    'Comprehensive Cardiac Evaluation',
    'Annual Routine Blood Work',
    'Post-Operative Recovery Plan',
    'ECG Rhythm Analysis Report',
    'General Consultation Notes',
  ],
  [
    'AB', // < 3 chars
    '', // Empty
    '   ', // Whitespace only
    'A'.repeat(101), // > 100 chars
    '\x00\x01\x02', // Control characters only
  ]
);

// 14. Diagnosis Validator
testValidator(
  'validateDiagnosis',
  (val: any) => validateDiagnosis(val),
  [
    'I20.9 - Angina pectoris, unspecified',
    'E78.5 - Hyperlipidemia, unspecified',
    'I10 - Essential (primary) hypertension',
    'E11.9 - Type 2 diabetes mellitus without complications',
    'J45.909 - Unspecified asthma, uncomplicated',
  ],
  [
    'Unspecified Headache', // Not in coded list
    'COVID-19',
    'Common Cold',
    '',
    1234,
  ]
);

// 15. Clinical Note Validator
testValidator(
  'validateClinicalNote',
  validateClinicalNote,
  [
    'Patient presents with stable vitals and mild fatigue.',
    'Advised low sodium diet and 30 minutes daily walking.',
    'Follow-up appointment scheduled in 14 days.',
    'Allergy alert: Patient has mild sensitivity to penicillin.',
    '', // Optional: empty string is valid
  ],
  [
    '<script>alert("xss")</script>', // HTML tag
    '<div style="color:red">Note</div>', // HTML tag
    'Click <a href="http://evil.com">here</a>', // HTML tag
    'A'.repeat(1005), // > 1000 chars
    { text: 'not a string' }, // Non-string
  ]
);

// 16. Prescription Validator (Structured rows vs comma-separated text)
testValidator(
  'validatePrescriptionItem',
  validatePrescriptionItem,
  [
    { drug: 'Aspirin', dose: '75mg', frequency: 'Once daily', days: 30 },
    { drug: 'Atorvastatin', dose: '20mg', frequency: 'Once daily at bedtime', days: 90 },
    { drug: 'Metformin', dose: '500mg', frequency: 'Twice daily', days: 60 },
    { drug: 'Amoxicillin', dose: '500mg', frequency: 'Every 8 hours', days: 7 },
    { drug: 'Paracetamol', dose: '650mg', frequency: 'As needed (PRN)', days: 5 },
  ],
  [
    { drug: 'UnapprovedDrug', dose: '10mg', frequency: 'Once daily', days: 10 },
    { drug: 'Aspirin', dose: '75mg', frequency: 'Whenever', days: 10 },
    { drug: 'Aspirin', dose: '75mg', frequency: 'Once daily', days: 0 }, // days < 1
    { drug: 'Aspirin', dose: '75mg', frequency: 'Once daily', days: 400 }, // days > 365
    { drug: 'Aspirin', dose: '', frequency: 'Once daily', days: 10 }, // Empty dose
  ]
);

runTest('validatePrescriptions rejects comma-separated string format', () => {
  const res = validatePrescriptions('Aspirin 75mg once daily, Atorvastatin 20mg');
  assert.equal(res.ok, false);
  assert.match(res.error!, /never comma-separated text/i);
});

// 17. Lab Tests Validator
testValidator(
  'validateLabTests',
  validateLabTests,
  [
    ['Lipid Panel', '12-Lead Electrocardiogram'],
    ['Troponin I'],
    ['Complete Blood Count (CBC)', 'Fasting Blood Glucose', 'HbA1c'],
    ['Urinalysis', 'Comprehensive Metabolic Panel'],
    ['Liver Function Tests', 'Thyroid Stimulating Hormone (TSH)'],
  ],
  [
    'Lipid Panel, Troponin I', // Comma separated text string
    ['Unauthorized Experimental Test'], // Not in allowed list
    [], // Empty selection
    ['Lipid Panel', 1234], // Non-string item
    null, // Not array
  ]
);

// 18. Rejection Reason Validator (5-300 chars)
testValidator(
  'validateRejectionReason',
  validateRejectionReason,
  [
    'Medical licence could not be verified with council.',
    'Hospital authorization code expired.',
    'Uploaded identity proof is blurry and unreadable.',
    'Department does not match current staff directory.',
    'Insufficient supporting documentation for affiliation.',
  ],
  [
    'No', // < 5 chars
    'Bad', // < 5 chars
    '', // Empty
    'A'.repeat(305), // > 300 chars
    12345, // Not string
  ]
);

// 19. Break-Glass Reason Validator (15-300 chars)
testValidator(
  'validateBreakGlassReason',
  validateBreakGlassReason,
  [
    'Emergency patient arrived unconscious needing immediate cardiac records.',
    'Immediate allergy profile required for emergency surgical anesthesia.',
    'Critical trauma patient in ICU requiring immediate medical history.',
    'Patient in acute anaphylactic shock requiring emergency intervention history.',
    'Cardiac arrest resuscitation protocol requiring urgent prescription check.',
  ],
  [
    'Emergency', // < 15 chars
    'Need file now', // < 15 chars
    '', // Empty
    'A'.repeat(305), // > 300 chars
    null, // Not string
  ]
);

// 20. Device Readings Validator
testValidator(
  'validateDeviceReadings',
  validateDeviceReadings,
  [
    { heartRate: 72, spO2: 98, systolic: 120, diastolic: 80, temperature: 36.8 },
    { heartRate: 20, spO2: 50, systolic: 50, diastolic: 30, temperature: 30.0 }, // Minimum boundaries
    { heartRate: 250, spO2: 100, systolic: 260, diastolic: 160, temperature: 45.0 }, // Maximum boundaries
    { heartRate: 85, spO2: 96 }, // Valid partial
    { systolic: 130, diastolic: 85, temperature: 37.0 }, // Valid partial
  ],
  [
    { heartRate: 15 }, // HR < 20
    { heartRate: 260 }, // HR > 250
    { spO2: 45 }, // SpO2 < 50
    { systolic: 120, diastolic: 130 }, // systolic <= diastolic
    { temperature: 48 }, // temp > 45
    {}, // Empty object
  ]
);

// 21. Control-character stripping & string cleaning
console.log('\nTesting Control-Character Stripping & Sanitization:');
runTest('stripControlChars removes ASCII control chars', () => {
  assert.equal(stripControlChars('Hello\x00\x07World\x1F!'), 'HelloWorld!');
  assert.equal(stripControlChars('Dr. Priya\x00 Patel'), 'Dr. Priya Patel');
  assert.equal(stripControlChars('Item\x7fDEL'), 'ItemDEL');
});

runTest('stripControlChars preserves newlines when allowMultiline is true', () => {
  const textWithBreaks = 'Line 1\r\nLine 2\tTabbed\x00Stripped';
  const cleaned = stripControlChars(textWithBreaks, true);
  assert.equal(cleaned, 'Line 1\r\nLine 2\tTabbedStripped');
});

const cleanInputsGood = ['  Normal text  ', 'Text\x00WithNull', 'Hello\x07Bell', 'Clean\x1fChar', 'Test\x7fDel'];
const cleanInputsBad = ['\x00\x01\x02', '\x1f\x7f', '', '    ', 12345];
testValidator('cleanInput', cleanInput, cleanInputsGood, cleanInputsBad);

// 22. Aadhaar HMAC-SHA256 Peppered Hash Helper
console.log('\nTesting Aadhaar HMAC-SHA256 Hash Helper:');
runTest('computeAadhaarHash produces deterministic 64-character hex output', () => {
  const hash1 = computeAadhaarHash('234567890124');
  const hash2 = computeAadhaarHash('234567890124');
  assert.equal(hash1, hash2, 'Hash must be strictly deterministic');
  assert.equal(hash1.length, 64, 'HMAC-SHA256 must produce 64 hex characters');
  assert.match(hash1, /^[0-9a-f]{64}$/, 'Hash must be valid hex');
});

runTest('computeAadhaarHash normalizes whitespace and formatting', () => {
  const hashRaw = computeAadhaarHash('234567890124');
  const hashFormatted = computeAadhaarHash('2345 6789 0124');
  const hashDashed = computeAadhaarHash('2345-6789-0124');
  assert.equal(hashFormatted, hashRaw);
  assert.equal(hashDashed, hashRaw);
});

runTest('computeAadhaarHash produces distinct hashes for distinct Aadhaar numbers', () => {
  const numbers = [
    '234567890124',
    '345678901238',
    '456789012341',
    '567890123458',
    '987654321096',
    'TEST-AADHAAR-0001',
  ];
  const hashes = numbers.map(computeAadhaarHash);
  const uniqueHashes = new Set(hashes);
  assert.equal(uniqueHashes.size, numbers.length, 'All distinct numbers must produce unique hashes');
});

// 23. Express Server Integration Tests
console.log('\nTesting Server Foundation, Error Handling & Body Parser:');

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
            // Raw text response
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

async function runServerIntegrationTests() {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;

  try {
    // 1. Health check returns 200 { ok: true }
    await runAsyncTest('GET /api/health returns 200 with { ok: true } and Helmet headers', async () => {
      const res = await makeHttpRequest(port, '/api/health', 'GET', {});
      assert.equal(res.statusCode, 200);
      assert.deepEqual(res.body, { ok: true });
      assert.ok(res.headers['x-content-type-options'], 'Expected Helmet header X-Content-Type-Options');
    });

    // 2. Invalid JSON body returns 400 {"error": "..."}
    await runAsyncTest('Invalid JSON body returns 400 {"error": "..."} without stack trace', async () => {
      const res = await makeHttpRequest(
        port,
        '/api/test/echo',
        'POST',
        { 'Content-Type': 'application/json' },
        '{"invalidJson": unquotedValue'
      );
      assert.equal(res.statusCode, 400, 'Expected 400 status for invalid JSON body');
      assert.ok(res.body, 'Expected JSON body');
      assert.ok(typeof res.body.error === 'string', 'Expected error message in body');
      assert.equal(res.body.stack, undefined, 'Stack trace must not be exposed');
      assert.equal(res.rawBody.includes('SyntaxError'), false, 'Internal SyntaxError class must not leak');
    });

    // 3. Thrown error returns 500 {"error": "..."} with no stack trace
    await runAsyncTest('Thrown error returns 500 {"error": "..."} with NO stack trace', async () => {
      const res = await makeHttpRequest(port, '/api/test/error', 'GET', {});
      assert.equal(res.statusCode, 500, 'Expected 500 status for unhandled thrown error');
      assert.ok(res.body, 'Expected JSON body');
      assert.equal(res.body.error, 'Internal server error');
      assert.equal(res.body.stack, undefined, 'Stack trace must not be exposed');
      assert.equal(res.rawBody.includes('Simulated unhandled'), false, 'Internal exception details must not leak');
      assert.equal(res.rawBody.includes('at '), false, 'Call stack must not be in response body');
    });

    // 4. JSON body limit test (exceeding 100 KB returns 413)
    await runAsyncTest('JSON body exceeding 100 KB limit returns 413 error', async () => {
      const oversizedPayload = JSON.stringify({ data: 'A'.repeat(105 * 1024) });
      const res = await makeHttpRequest(
        port,
        '/api/test/echo',
        'POST',
        { 'Content-Type': 'application/json' },
        oversizedPayload
      );
      assert.equal(res.statusCode, 413);
      assert.ok(res.body && typeof res.body.error === 'string');
      assert.equal(res.body.stack, undefined);
    });

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

await runServerIntegrationTests();

console.log('\n============================================================');
console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} assertions verified!`);
console.log('============================================================\n');
process.exit(0);
