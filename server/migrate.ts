import { pool } from './db.js';

/* Idempotent migrations so the code and database schema cannot drift apart. */
export async function runMigrations(): Promise<void> {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_last4 VARCHAR(4);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_verification_status VARCHAR(20) DEFAULT 'PENDING';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_license_number VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_license_verification_status VARCHAR(20) DEFAULT 'PENDING';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_license_document_name VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_enc TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS private_key_enc TEXT;
    ALTER TABLE patients ALTER COLUMN dob DROP NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_aadhaar_hash ON users(aadhaar_hash) WHERE aadhaar_hash IS NOT NULL;
  `);
}
