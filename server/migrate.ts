import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Idempotent database migrations for FedTrustMed.
 * Safe to execute multiple times against any existing or fresh database.
 */
export async function runMigrations(): Promise<void> {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

  console.log('[Migrate] Applying schema from schema.sql...');
  await pool.query(schemaSql);

  // Additional defensive idempotent ALTERs to guarantee schema consistency
  await pool.query(`
    -- Ensure all columns and indexes in users table are present
    ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_hash TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_last4 VARCHAR(10);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'PENDING';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_verification_status VARCHAR(30) DEFAULT 'PENDING';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_license_number VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS medical_license_verification_status VARCHAR(30) DEFAULT 'NOT_REQUIRED';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_authorization_code VARCHAR(100);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliation_verification_status VARCHAR(30) DEFAULT 'NOT_REQUIRED';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_frozen BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score NUMERIC(5,2) DEFAULT 100.00;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_enc TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS private_key_enc TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS public_key_ecc TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS data_access_permissions TEXT[] DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_permissions TEXT[] DEFAULT '{}';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Ensure unique constraint on users(aadhaar_hash) if not already created
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_aadhaar_hash ON users(aadhaar_hash) WHERE aadhaar_hash IS NOT NULL;

    -- Ensure patients table columns
    ALTER TABLE patients ALTER COLUMN dob DROP NOT NULL;
    ALTER TABLE patients ADD COLUMN IF NOT EXISTS public_key_ecc TEXT;

    -- Ensure audit ledger tables (Module M24)
    CREATE TABLE IF NOT EXISTS ledger_blocks (
      block_index INTEGER PRIMARY KEY,
      block_hash VARCHAR(64) NOT NULL UNIQUE,
      prev_hash VARCHAR(64) NOT NULL,
      merkle_root VARCHAR(64) NOT NULL,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ledger_transactions (
      id VARCHAR(100) PRIMARY KEY,
      block_index INTEGER NOT NULL REFERENCES ledger_blocks(block_index) ON DELETE CASCADE,
      tx_hash VARCHAR(64) NOT NULL,
      tx_type VARCHAR(50) NOT NULL,
      actor_id VARCHAR(100),
      actor_role VARCHAR(50),
      hospital_id VARCHAR(100),
      resource_id VARCHAR(100),
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_ledger_blocks_hash ON ledger_blocks(block_hash);
    CREATE INDEX IF NOT EXISTS idx_ledger_tx_block_index ON ledger_transactions(block_index);
    CREATE INDEX IF NOT EXISTS idx_ledger_tx_type ON ledger_transactions(tx_type);
    CREATE INDEX IF NOT EXISTS idx_ledger_tx_resource ON ledger_transactions(resource_id);

    -- Ensure trust events table (Module M25)
    CREATE TABLE IF NOT EXISTS trust_events (
      id VARCHAR(100) PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      reason TEXT NOT NULL,
      delta NUMERIC(5,2) NOT NULL,
      previous_score NUMERIC(5,2) NOT NULL,
      new_score NUMERIC(5,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_trust_events_user_id ON trust_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_trust_events_created_at ON trust_events(created_at DESC);

    -- Ensure threat alerts table (Module M26)
    CREATE TABLE IF NOT EXISTS threat_alerts (
      id VARCHAR(100) PRIMARY KEY,
      rule VARCHAR(100) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      evidence TEXT NOT NULL,
      target_user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
      target_ip VARCHAR(100) NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_threat_alerts_created_at ON threat_alerts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_threat_alerts_rule ON threat_alerts(rule);
  `);

  console.log('[Migrate] Database migrations applied successfully.');
}

// Execute directly if invoked via CLI
if (process.argv[1] && (process.argv[1].endsWith('migrate.ts') || process.argv[1].endsWith('migrate.js'))) {
  runMigrations()
    .then(() => {
      console.log('[Migrate] Migration script finished.');
      return pool.end();
    })
    .catch((err) => {
      console.error('[Migrate] Error running migrations:', err);
      pool.end().finally(() => process.exit(1));
    });
}
