-- ============================================================
-- FedTrustMed Research Prototype Database Schema
-- PostgreSQL 14+ compatible
-- ============================================================

-- 1. HOSPITALS
CREATE TABLE IF NOT EXISTS hospitals (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    region VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'APPROVED'
        CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED')),
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    node_address VARCHAR(255) NOT NULL,
    doctors_count INTEGER NOT NULL DEFAULT 0,
    patients_count INTEGER NOT NULL DEFAULT 0,
    records_count INTEGER NOT NULL DEFAULT 0,
    federated_weight_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. DEPARTMENTS
CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(100) PRIMARY KEY,
    hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    head_doctor_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. USERS
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL
        CHECK (role IN ('PATIENT', 'DOCTOR', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN')),
    hospital_id VARCHAR(100) REFERENCES hospitals(id) ON DELETE SET NULL,
    hospital_name VARCHAR(255),
    department_id VARCHAR(100) REFERENCES departments(id) ON DELETE SET NULL,
    department_name VARCHAR(255),
    password TEXT NOT NULL,
    aadhaar_hash TEXT UNIQUE,
    aadhaar_last4 VARCHAR(10),
    approval_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    aadhaar_verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING'
        CHECK (aadhaar_verification_status IN ('PENDING', 'VERIFIED - SIMULATION', 'VERIFIED', 'REJECTED')),
    medical_license_number VARCHAR(100),
    medical_license_verification_status VARCHAR(30) DEFAULT 'NOT_REQUIRED',
    admin_authorization_code VARCHAR(100),
    affiliation_verification_status VARCHAR(30) DEFAULT 'NOT_REQUIRED',
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_enc TEXT,
    private_key_enc TEXT,
    public_key_ecc TEXT,
    failed_login_count INTEGER NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    data_access_permissions TEXT[] NOT NULL DEFAULT '{}',
    requested_permissions TEXT[] NOT NULL DEFAULT '{}',
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. PATIENTS
CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    dob DATE,
    gender VARCHAR(50) NOT NULL,
    blood_type VARCHAR(20) NOT NULL,
    allergies TEXT[] NOT NULL DEFAULT '{}',
    medical_conditions TEXT[] NOT NULL DEFAULT '{}',
    primary_hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    primary_hospital_name VARCHAR(255) NOT NULL,
    emergency_contact TEXT NOT NULL,
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    public_key_ecc TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. DOCTORS
CREATE TABLE IF NOT EXISTS doctors (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    specialty VARCHAR(255) NOT NULL,
    department_id VARCHAR(100) NOT NULL REFERENCES departments(id),
    department_name VARCHAR(255) NOT NULL,
    hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    hospital_name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 100.00,
    assigned_patients_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. MEDICAL RECORDS
CREATE TABLE IF NOT EXISTS medical_records (
    id VARCHAR(100) PRIMARY KEY,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL,
    doctor_id VARCHAR(100) NOT NULL REFERENCES doctors(id),
    doctor_name VARCHAR(255) NOT NULL,
    hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    hospital_name VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    record_type VARCHAR(50) NOT NULL,
    diagnosis TEXT NOT NULL,
    encrypted_content TEXT NOT NULL,
    iv_aes TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    ecc_encrypted_aes_key TEXT NOT NULL,
    server_master_wrapped_key TEXT,
    sha256_hash VARCHAR(128) NOT NULL,
    prescriptions TEXT[] NOT NULL DEFAULT '{}',
    lab_tests TEXT[] NOT NULL DEFAULT '{}',
    iot_device_id VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. DOCUMENTS
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(100) PRIMARY KEY,
    owner_user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_id VARCHAR(100) REFERENCES medical_records(id) ON DELETE SET NULL,
    kind VARCHAR(50) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    size BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    iv VARCHAR(64) NOT NULL,
    auth_tag VARCHAR(64) NOT NULL,
    ciphertext BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. CONSENT RECORDS
CREATE TABLE IF NOT EXISTS consent_records (
    id VARCHAR(100) PRIMARY KEY,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL,
    doctor_id VARCHAR(100) REFERENCES doctors(id) ON DELETE SET NULL,
    doctor_name VARCHAR(255),
    requesting_hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    requesting_hospital_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(100) REFERENCES medical_records(id) ON DELETE SET NULL,
    record_title VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'GRANTED', 'REVOKED', 'DENIED', 'EXPIRED')),
    purpose VARCHAR(100) NOT NULL,
    reason TEXT,
    granted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(30) NOT NULL,
    hospital_id VARCHAR(100) REFERENCES hospitals(id) ON DELETE SET NULL,
    hospital_name VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_id VARCHAR(100),
    ip_address VARCHAR(255) NOT NULL,
    trust_impact NUMERIC(5,2) NOT NULL DEFAULT 0,
    details TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'INFO'
        CHECK (type IN ('INFO', 'WARNING', 'ALERT', 'SUCCESS')),
    read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. BREAK-GLASS ACCESS OVERRIDES
CREATE TABLE IF NOT EXISTS break_glass_access (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    record_id VARCHAR(100) NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES ON FOREIGN KEYS AND COMMON QUERY FIELDS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_departments_hospital_id ON departments(hospital_id);
CREATE INDEX IF NOT EXISTS idx_users_hospital_id ON users(hospital_id);
CREATE INDEX IF NOT EXISTS idx_users_department_id ON users(department_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);
CREATE INDEX IF NOT EXISTS idx_users_aadhaar_hash ON users(aadhaar_hash);

CREATE INDEX IF NOT EXISTS idx_patients_user_id ON patients(user_id);
CREATE INDEX IF NOT EXISTS idx_patients_primary_hospital ON patients(primary_hospital_id);

CREATE INDEX IF NOT EXISTS idx_doctors_user_id ON doctors(user_id);
CREATE INDEX IF NOT EXISTS idx_doctors_hospital_id ON doctors(hospital_id);
CREATE INDEX IF NOT EXISTS idx_doctors_department_id ON doctors(department_id);

CREATE INDEX IF NOT EXISTS idx_medical_records_patient ON medical_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_doctor ON medical_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_hospital ON medical_records(hospital_id);

CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_documents_record ON documents(record_id);

CREATE INDEX IF NOT EXISTS idx_consent_patient ON consent_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_consent_doctor ON consent_records(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consent_hospital ON consent_records(requesting_hospital_id);
CREATE INDEX IF NOT EXISTS idx_consent_record ON consent_records(record_id);
CREATE INDEX IF NOT EXISTS idx_consent_status ON consent_records(status);

CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_hospital ON audit_logs(hospital_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);

CREATE INDEX IF NOT EXISTS idx_break_glass_user ON break_glass_access(user_id);
CREATE INDEX IF NOT EXISTS idx_break_glass_record ON break_glass_access(record_id);

-- 12. AUDIT LEDGER BLOCKS (Module M24)
CREATE TABLE IF NOT EXISTS ledger_blocks (
    block_index INTEGER PRIMARY KEY,
    block_hash VARCHAR(64) NOT NULL UNIQUE,
    prev_hash VARCHAR(64) NOT NULL,
    merkle_root VARCHAR(64) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    signatures JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. AUDIT LEDGER TRANSACTIONS (Module M24)
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

-- 14. ACCOUNT SAFETY & TRUST EVENTS (Module M25)
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

-- 15. THREAT ALERTS (Module M26)
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



