import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import { runMigrations } from './migrate.js';

// Master key resolution (must be 32 bytes / 64 hex characters)
function getMasterKey(): Buffer {
  const hex = process.env.MASTER_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  if (hex.length !== 64) {
    return crypto.createHash('sha256').update(hex).digest();
  }
  return Buffer.from(hex, 'hex');
}

// AES-256-GCM encryption helper
function encryptAesGcm(plainText: string, key: Buffer, aad?: string): { ciphertext: string; iv: string; authTag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) {
    cipher.setAAD(Buffer.from(aad, 'utf-8'));
  }
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

// Generate P-256 ECC key pair for users and seal private key with MASTER_KEY
function generateUserKeys(userId: string): { publicKeyEcc: string; privateKeyEnc: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const masterKey = getMasterKey();
  const { ciphertext, iv, authTag } = encryptAesGcm(privateKey, masterKey, `private_key:${userId}`);
  const privateKeyEnc = JSON.stringify({ ciphertext, iv, authTag });

  return {
    publicKeyEcc: publicKey,
    privateKeyEnc,
  };
}

// Peppered HMAC-SHA256 for Aadhaar simulation numbers
function computeAadhaarHash(aadhaar: string): string {
  const pepper = process.env.JWT_SECRET || 'fedtrustmed_aadhaar_pepper_secret_value';
  return crypto.createHmac('sha256', pepper).update(aadhaar).digest('hex');
}

export async function seedDatabase(): Promise<void> {
  console.log('--- Starting FedTrustMed Database Seed ---');

  // Step 1: Ensure migrations are executed first
  await runMigrations();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Seed Hospitals (3 Hospitals)
    const hospitals = [
      {
        id: 'hosp-st-jude',
        name: 'St. Jude General',
        code: 'ST-JUDE',
        region: 'North District',
        address: '100 Medical Center Blvd, North District',
        contact_email: 'contact@stjude.fedtrustmed.org',
        status: 'APPROVED',
        trust_score: 100.00,
        node_address: 'peer0.stjude.fedtrustmed.internal:7051',
        doctors_count: 1,
        patients_count: 1,
        records_count: 2,
      },
      {
        id: 'hosp-metro-heart',
        name: 'Metro Heart & Cancer Specialty',
        code: 'METRO-HCS',
        region: 'Central District',
        address: '250 Specialty Healthcare Way, Central District',
        contact_email: 'contact@metroheart.fedtrustmed.org',
        status: 'APPROVED',
        trust_score: 100.00,
        node_address: 'peer0.metroheart.fedtrustmed.internal:7051',
        doctors_count: 0,
        patients_count: 0,
        records_count: 0,
      },
      {
        id: 'hosp-city-memorial',
        name: 'City Memorial',
        code: 'CITY-MEM',
        region: 'East District',
        address: '500 Civic Memorial Ave, East District',
        contact_email: 'contact@citymemorial.fedtrustmed.org',
        status: 'APPROVED',
        trust_score: 100.00,
        node_address: 'peer0.citymemorial.fedtrustmed.internal:7051',
        doctors_count: 0,
        patients_count: 0,
        records_count: 0,
      },
    ];

    for (const hosp of hospitals) {
      await client.query(
        `INSERT INTO hospitals (id, name, code, region, address, contact_email, status, trust_score, node_address, doctors_count, patients_count, records_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           code = EXCLUDED.code,
           region = EXCLUDED.region,
           address = EXCLUDED.address,
           contact_email = EXCLUDED.contact_email,
           status = EXCLUDED.status,
           trust_score = EXCLUDED.trust_score,
           node_address = EXCLUDED.node_address,
           doctors_count = EXCLUDED.doctors_count,
           patients_count = EXCLUDED.patients_count,
           records_count = EXCLUDED.records_count;`,
        [hosp.id, hosp.name, hosp.code, hosp.region, hosp.address, hosp.contact_email, hosp.status, hosp.trust_score, hosp.node_address, hosp.doctors_count, hosp.patients_count, hosp.records_count]
      );
    }
    console.log(`[Seed] Seeded ${hospitals.length} hospitals.`);

    // 2. Seed Departments
    const departments = [
      { id: 'dept-stjude-cardio', hospital_id: 'hosp-st-jude', name: 'Cardiology', head_doctor_name: 'Dr. Priya Patel' },
      { id: 'dept-stjude-genmed', hospital_id: 'hosp-st-jude', name: 'General Medicine', head_doctor_name: 'Dr. Alok Verma' },
      { id: 'dept-metro-cardio', hospital_id: 'hosp-metro-heart', name: 'Cardiology', head_doctor_name: 'Dr. Rajesh Gupta' },
      { id: 'dept-metro-onco', hospital_id: 'hosp-metro-heart', name: 'Oncology', head_doctor_name: 'Dr. Sunita Rao' },
      { id: 'dept-city-genmed', hospital_id: 'hosp-city-memorial', name: 'General Medicine', head_doctor_name: 'Dr. Meera Iyer' },
    ];

    for (const dept of departments) {
      await client.query(
        `INSERT INTO departments (id, hospital_id, name, head_doctor_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           head_doctor_name = EXCLUDED.head_doctor_name;`,
        [dept.id, dept.hospital_id, dept.name, dept.head_doctor_name]
      );
    }
    console.log(`[Seed] Seeded ${departments.length} departments.`);

    // 3. Seed Demo Users (1 per role, bcrypt cost 12, approved AND identity-verified)
    const demoPassword = 'Password123!';
    const demoPasswordHash = await bcrypt.hash(demoPassword, 12);

    const demoUsers = [
      {
        id: 'usr-patient-001',
        email: 'patient@fedtrustmed.demo',
        full_name: 'Aarav Sharma',
        role: 'PATIENT',
        hospital_id: 'hosp-st-jude',
        hospital_name: 'St. Jude General',
        department_id: null,
        department_name: null,
        aadhaar_raw: 'TEST-AADHAAR-0001',
        aadhaar_last4: '0001',
        medical_license_number: null,
        medical_license_verification_status: 'NOT_REQUIRED',
        admin_authorization_code: null,
        affiliation_verification_status: 'NOT_REQUIRED',
      },
      {
        id: 'usr-doctor-001',
        email: 'doctor@fedtrustmed.demo',
        full_name: 'Dr. Priya Patel',
        role: 'DOCTOR',
        hospital_id: 'hosp-st-jude',
        hospital_name: 'St. Jude General',
        department_id: 'dept-stjude-cardio',
        department_name: 'Cardiology',
        aadhaar_raw: 'TEST-AADHAAR-0005',
        aadhaar_last4: '0005',
        medical_license_number: 'TEST-MED-LIC-0002',
        medical_license_verification_status: 'VERIFIED - SIMULATION',
        admin_authorization_code: null,
        affiliation_verification_status: 'NOT_REQUIRED',
      },
      {
        id: 'usr-hospadmin-001',
        email: 'hospital_admin@fedtrustmed.demo',
        full_name: 'Rajesh Verma',
        role: 'HOSPITAL_ADMIN',
        hospital_id: 'hosp-st-jude',
        hospital_name: 'St. Jude General',
        department_id: null,
        department_name: null,
        aadhaar_raw: 'TEST-AADHAAR-0003',
        aadhaar_last4: '0003',
        medical_license_number: null,
        medical_license_verification_status: 'NOT_REQUIRED',
        admin_authorization_code: 'HOSP-ADMIN-AUTH-001',
        affiliation_verification_status: 'VERIFIED - SIMULATION',
      },
      {
        id: 'usr-sysadmin-001',
        email: 'system_admin@fedtrustmed.demo',
        full_name: 'Vikram Malhotra',
        role: 'SYSTEM_ADMIN',
        hospital_id: null,
        hospital_name: null,
        department_id: null,
        department_name: null,
        aadhaar_raw: 'TEST-AADHAAR-0004',
        aadhaar_last4: '0004',
        medical_license_number: null,
        medical_license_verification_status: 'NOT_REQUIRED',
        admin_authorization_code: null,
        affiliation_verification_status: 'NOT_REQUIRED',
      },
    ];

    for (const u of demoUsers) {
      const { publicKeyEcc, privateKeyEnc } = generateUserKeys(u.id);
      const aadhaarHash = computeAadhaarHash(u.aadhaar_raw);

      await client.query(
        `INSERT INTO users (
           id, email, full_name, role, hospital_id, hospital_name, department_id, department_name,
           password, aadhaar_hash, aadhaar_last4, approval_status, aadhaar_verification_status,
           medical_license_number, medical_license_verification_status, admin_authorization_code,
           affiliation_verification_status, is_frozen, trust_score, mfa_enabled, private_key_enc,
           public_key_ecc, failed_login_count, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'APPROVED', 'VERIFIED - SIMULATION', $12, $13, $14, $15, FALSE, 100.00, FALSE, $16, $17, 0, NOW())
         ON CONFLICT (id) DO UPDATE SET
           email = EXCLUDED.email,
           full_name = EXCLUDED.full_name,
           role = EXCLUDED.role,
           hospital_id = EXCLUDED.hospital_id,
           hospital_name = EXCLUDED.hospital_name,
           department_id = EXCLUDED.department_id,
           department_name = EXCLUDED.department_name,
           password = EXCLUDED.password,
           aadhaar_hash = EXCLUDED.aadhaar_hash,
           aadhaar_last4 = EXCLUDED.aadhaar_last4,
           approval_status = 'APPROVED',
           aadhaar_verification_status = 'VERIFIED - SIMULATION',
           medical_license_number = EXCLUDED.medical_license_number,
           medical_license_verification_status = EXCLUDED.medical_license_verification_status,
           admin_authorization_code = EXCLUDED.admin_authorization_code,
           affiliation_verification_status = EXCLUDED.affiliation_verification_status,
           is_frozen = FALSE,
           trust_score = 100.00,
           private_key_enc = EXCLUDED.private_key_enc,
           public_key_ecc = EXCLUDED.public_key_ecc,
           failed_login_count = 0,
           updated_at = NOW();`,
        [
          u.id,
          u.email,
          u.full_name,
          u.role,
          u.hospital_id,
          u.hospital_name,
          u.department_id,
          u.department_name,
          demoPasswordHash,
          aadhaarHash,
          u.aadhaar_last4,
          u.medical_license_number,
          u.medical_license_verification_status,
          u.admin_authorization_code,
          u.affiliation_verification_status,
          privateKeyEnc,
          publicKeyEcc,
        ]
      );
    }
    console.log(`[Seed] Seeded ${demoUsers.length} demo users (all 4 roles).`);

    // 4. Seed Patient Profile for Patient Demo User
    await client.query(
      `INSERT INTO patients (
         id, user_id, full_name, email, dob, gender, blood_type, allergies, medical_conditions,
         primary_hospital_id, primary_hospital_name, emergency_contact, trust_score
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 100.00)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         blood_type = EXCLUDED.blood_type,
         allergies = EXCLUDED.allergies,
         medical_conditions = EXCLUDED.medical_conditions,
         emergency_contact = EXCLUDED.emergency_contact;`,
      [
        'pat-profile-001',
        'usr-patient-001',
        'Aarav Sharma',
        'patient@fedtrustmed.demo',
        '1988-06-15',
        'Male',
        'O+',
        ['Penicillin'],
        ['Hypertension'],
        'hosp-st-jude',
        'St. Jude General',
        '+91-9876543210 (Spouse)',
      ]
    );

    // 5. Seed Doctor Profile for Doctor Demo User
    await client.query(
      `INSERT INTO doctors (
         id, user_id, full_name, specialty, department_id, department_name,
         hospital_id, hospital_name, license_number, trust_score, assigned_patients_count
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 100.00, 1)
       ON CONFLICT (id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         specialty = EXCLUDED.specialty,
         department_id = EXCLUDED.department_id,
         department_name = EXCLUDED.department_name,
         hospital_id = EXCLUDED.hospital_id,
         hospital_name = EXCLUDED.hospital_name,
         license_number = EXCLUDED.license_number;`,
      [
        'doc-profile-001',
        'usr-doctor-001',
        'Dr. Priya Patel',
        'Cardiology',
        'dept-stjude-cardio',
        'Cardiology',
        'hosp-st-jude',
        'St. Jude General',
        'TEST-MED-LIC-0001',
      ]
    );
    console.log('[Seed] Seeded patient and doctor profile records.');

    // 6. Seed 2 Medical Records (Encrypted with AES-256-GCM)
    const masterKey = getMasterKey();

    const record1Data = JSON.stringify({
      history: 'Patient presents with intermittent exertional chest tightness for 2 weeks.',
      clinicalNotes: 'Resting ECG shows mild ST-depression in lateral leads. Stress test advised.',
      vitals: { heartRate: 74, bpSystolic: 130, bpDiastolic: 84, spO2: 98, temperature: 36.8 },
    });
    const dataKey1 = crypto.randomBytes(32);
    const encRecord1 = encryptAesGcm(record1Data, dataKey1, 'rec-demo-001');
    const wrappedKey1 = encryptAesGcm(dataKey1.toString('hex'), masterKey, 'data_key:rec-demo-001');
    const sha256Record1 = crypto.createHash('sha256').update(encRecord1.ciphertext).digest('hex');

    await client.query(
      `INSERT INTO medical_records (
         id, patient_id, patient_name, doctor_id, doctor_name, hospital_id, hospital_name,
         title, record_type, diagnosis, encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key,
         server_master_wrapped_key, sha256_hash, prescriptions, lab_tests
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         diagnosis = EXCLUDED.diagnosis,
         encrypted_content = EXCLUDED.encrypted_content,
         iv_aes = EXCLUDED.iv_aes,
         auth_tag = EXCLUDED.auth_tag,
         sha256_hash = EXCLUDED.sha256_hash;`,
      [
        'rec-demo-001',
        'pat-profile-001',
        'Aarav Sharma',
        'doc-profile-001',
        'Dr. Priya Patel',
        'hosp-st-jude',
        'St. Jude General',
        'Comprehensive Cardiac Evaluation',
        'Cardiology Report',
        'I20.9 - Angina pectoris, unspecified',
        encRecord1.ciphertext,
        encRecord1.iv,
        encRecord1.authTag,
        JSON.stringify(wrappedKey1),
        JSON.stringify(wrappedKey1),
        sha256Record1,
        ['Aspirin 75mg once daily', 'Atorvastatin 20mg once daily at bedtime'],
        ['Lipid Panel', '12-Lead Electrocardiogram', 'Troponin I'],
      ]
    );

    const record2Data = JSON.stringify({
      history: 'Routine annual preventive health assessment.',
      clinicalNotes: 'Elevated fasting triglycerides and LDL-C noted. Lifestyle modifications initiated.',
      vitals: { heartRate: 68, bpSystolic: 122, bpDiastolic: 78, spO2: 99, temperature: 36.6 },
    });
    const dataKey2 = crypto.randomBytes(32);
    const encRecord2 = encryptAesGcm(record2Data, dataKey2, 'rec-demo-002');
    const wrappedKey2 = encryptAesGcm(dataKey2.toString('hex'), masterKey, 'data_key:rec-demo-002');
    const sha256Record2 = crypto.createHash('sha256').update(encRecord2.ciphertext).digest('hex');

    await client.query(
      `INSERT INTO medical_records (
         id, patient_id, patient_name, doctor_id, doctor_name, hospital_id, hospital_name,
         title, record_type, diagnosis, encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key,
         server_master_wrapped_key, sha256_hash, prescriptions, lab_tests
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (id) DO UPDATE SET
         title = EXCLUDED.title,
         diagnosis = EXCLUDED.diagnosis,
         encrypted_content = EXCLUDED.encrypted_content,
         iv_aes = EXCLUDED.iv_aes,
         auth_tag = EXCLUDED.auth_tag,
         sha256_hash = EXCLUDED.sha256_hash;`,
      [
        'rec-demo-002',
        'pat-profile-001',
        'Aarav Sharma',
        'doc-profile-001',
        'Dr. Priya Patel',
        'hosp-st-jude',
        'St. Jude General',
        'Routine Blood Chemistry & Lipid Profile',
        'Diagnostic Report',
        'E78.5 - Hyperlipidemia, unspecified',
        encRecord2.ciphertext,
        encRecord2.iv,
        encRecord2.authTag,
        JSON.stringify(wrappedKey2),
        JSON.stringify(wrappedKey2),
        sha256Record2,
        ['Atorvastatin 10mg once daily'],
        ['Total Cholesterol', 'HDL', 'LDL', 'Triglycerides', 'Fasting Blood Glucose'],
      ]
    );
    console.log('[Seed] Seeded 2 medical records with AES-256-GCM encryption.');

    // 7. Seed 2 Consents (1 GRANTED, 1 PENDING)
    await client.query(
      `INSERT INTO consent_records (
         id, patient_id, patient_name, doctor_id, doctor_name, requesting_hospital_id,
         requesting_hospital_name, record_id, record_title, status, purpose, reason, granted_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW() + INTERVAL '30 days')
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         purpose = EXCLUDED.purpose,
         reason = EXCLUDED.reason;`,
      [
        'consent-demo-001',
        'pat-profile-001',
        'Aarav Sharma',
        'doc-profile-001',
        'Dr. Priya Patel',
        'hosp-st-jude',
        'St. Jude General',
        'rec-demo-001',
        'Comprehensive Cardiac Evaluation',
        'GRANTED',
        'Treatment',
        'Ongoing outpatient cardiovascular management',
      ]
    );

    await client.query(
      `INSERT INTO consent_records (
         id, patient_id, patient_name, doctor_id, doctor_name, requesting_hospital_id,
         requesting_hospital_name, record_id, record_title, status, purpose, reason, granted_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, NULL)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         purpose = EXCLUDED.purpose,
         reason = EXCLUDED.reason;`,
      [
        'consent-demo-002',
        'pat-profile-001',
        'Aarav Sharma',
        null,
        null,
        'hosp-metro-heart',
        'Metro Heart & Cancer Specialty',
        'rec-demo-002',
        'Routine Blood Chemistry & Lipid Profile',
        'PENDING',
        'Second opinion',
        'Cardiology specialist second opinion review',
      ]
    );
    console.log('[Seed] Seeded 2 consent records (1 GRANTED, 1 PENDING).');

    await client.query('COMMIT');
    console.log('[Seed] Database transaction committed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('[Seed] Error seeding database, transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }

  // Print Demo Logins clearly to console
  console.log('\n======================================================================');
  console.log('FedTrustMed Demo Logins (Approved & Identity-Verified)');
  console.log('======================================================================');
  console.log('1. PATIENT:');
  console.log('   Email:    patient@fedtrustmed.demo');
  console.log('   Password: Password123!');
  console.log('   Name:     Aarav Sharma (St. Jude General)');
  console.log('----------------------------------------------------------------------');
  console.log('2. DOCTOR:');
  console.log('   Email:    doctor@fedtrustmed.demo');
  console.log('   Password: Password123!');
  console.log('   Name:     Dr. Priya Patel (Cardiology, St. Jude General)');
  console.log('----------------------------------------------------------------------');
  console.log('3. HOSPITAL_ADMIN:');
  console.log('   Email:    hospital_admin@fedtrustmed.demo');
  console.log('   Password: Password123!');
  console.log('   Name:     Rajesh Verma (St. Jude General)');
  console.log('----------------------------------------------------------------------');
  console.log('4. SYSTEM_ADMIN:');
  console.log('   Email:    system_admin@fedtrustmed.demo');
  console.log('   Password: Password123!');
  console.log('   Name:     Vikram Malhotra (System Administrator)');
  console.log('======================================================================\n');
}

// Auto-run if executed as script
if (process.argv[1] && (process.argv[1].endsWith('seedDatabase.ts') || process.argv[1].endsWith('seedDatabase.js'))) {
  seedDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error('[Seed] Fatal error:', err);
      pool.end().finally(() => process.exit(1));
    });
}