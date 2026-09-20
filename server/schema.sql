-- ============================================================
-- FedTrustMed PostgreSQL Schema
-- Database: fedtrust
-- PostgreSQL 18+
-- ============================================================

CREATE TABLE IF NOT EXISTS hospitals (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    region VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'APPROVED', 'SUSPENDED')),
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    node_address VARCHAR(255) NOT NULL,
    doctors_count INTEGER NOT NULL DEFAULT 0,
    patients_count INTEGER NOT NULL DEFAULT 0,
    records_count INTEGER NOT NULL DEFAULT 0,
    federated_weight_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS departments (
    id VARCHAR(100) PRIMARY KEY,
    hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    name VARCHAR(255) NOT NULL,
    head_doctor_name VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL,
    hospital_id VARCHAR(100) REFERENCES hospitals(id),
    hospital_name VARCHAR(255),
    department_id VARCHAR(100) REFERENCES departments(id),
    department_name VARCHAR(255),
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    approval_status VARCHAR(20) DEFAULT 'PENDING',
    data_access_permissions TEXT[] NOT NULL DEFAULT '{}',
    requested_permissions TEXT[] NOT NULL DEFAULT '{}',
    rejection_reason TEXT,
    password TEXT,
    public_key_ecc TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS patients (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) UNIQUE NOT NULL REFERENCES users(id),
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    dob DATE NOT NULL,
    gender VARCHAR(50) NOT NULL,
    blood_type VARCHAR(20) NOT NULL,
    allergies TEXT[] NOT NULL DEFAULT '{}',
    medical_conditions TEXT[] NOT NULL DEFAULT '{}',
    primary_hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    primary_hospital_name VARCHAR(255) NOT NULL,
    emergency_contact TEXT NOT NULL,
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    public_key_ecc TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS doctors (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) UNIQUE NOT NULL REFERENCES users(id),
    full_name VARCHAR(255) NOT NULL,
    specialty VARCHAR(255) NOT NULL,
    department_id VARCHAR(100) NOT NULL REFERENCES departments(id),
    department_name VARCHAR(255) NOT NULL,
    hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    hospital_name VARCHAR(255) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    trust_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    assigned_patients_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS appointments (
    id VARCHAR(100) PRIMARY KEY,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(id),
    patient_name VARCHAR(255) NOT NULL,
    doctor_id VARCHAR(100) NOT NULL REFERENCES doctors(id),
    doctor_name VARCHAR(255) NOT NULL,
    hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    hospital_name VARCHAR(255) NOT NULL,
    appointment_date DATE NOT NULL,
    appointment_time VARCHAR(50) NOT NULL,
    type VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED'
        CHECK (status IN ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
    notes TEXT
);

CREATE TABLE IF NOT EXISTS medical_records (
    id VARCHAR(100) PRIMARY KEY,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(id),
    patient_name VARCHAR(255) NOT NULL,
    doctor_id VARCHAR(100) NOT NULL REFERENCES doctors(id),
    doctor_name VARCHAR(255) NOT NULL,
    hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    hospital_name VARCHAR(255) NOT NULL,
    title VARCHAR(500) NOT NULL,
    record_type VARCHAR(50) NOT NULL,
    diagnosis TEXT NOT NULL,

    encrypted_content TEXT NOT NULL,
    iv_aes TEXT NOT NULL,
    auth_tag TEXT,
    ecc_encrypted_aes_key TEXT NOT NULL,

    sha256_hash VARCHAR(128) NOT NULL,
    clsm_hash VARCHAR(255),
    mhe_ciphertext TEXT,

    encryption_time_ms NUMERIC,
    decryption_time_ms NUMERIC,

    fabric_tx_id VARCHAR(255) NOT NULL,
    file_dag_cid VARCHAR(255),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    prescriptions TEXT[] NOT NULL DEFAULT '{}',
    lab_tests TEXT[] NOT NULL DEFAULT '{}',
    iot_device_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS consent_records (
    id VARCHAR(100) PRIMARY KEY,
    patient_id VARCHAR(100) NOT NULL REFERENCES patients(id),
    patient_name VARCHAR(255) NOT NULL,
    doctor_id VARCHAR(100) REFERENCES doctors(id),
    doctor_name VARCHAR(255),
    requesting_hospital_id VARCHAR(100) NOT NULL REFERENCES hospitals(id),
    requesting_hospital_name VARCHAR(255) NOT NULL,
    record_id VARCHAR(100) REFERENCES medical_records(id),
    record_title VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'GRANTED', 'REVOKED', 'EXPIRED')),
    purpose TEXT NOT NULL,
    granted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    fabric_tx_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id),
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(30) NOT NULL,
    hospital_name VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    resource_id VARCHAR(100),
    ip_address VARCHAR(255) NOT NULL,
    trust_impact NUMERIC(5,2) NOT NULL DEFAULT 0,
    fabric_tx_id VARCHAR(255),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'INFO'
        CHECK (type IN ('INFO', 'WARNING', 'ALERT', 'SUCCESS')),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read BOOLEAN NOT NULL DEFAULT FALSE
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_email
    ON users(email);

CREATE INDEX IF NOT EXISTS idx_users_hospital
    ON users(hospital_id);

CREATE INDEX IF NOT EXISTS idx_users_approval
    ON users(approval_status);

CREATE INDEX IF NOT EXISTS idx_patients_user
    ON patients(user_id);

CREATE INDEX IF NOT EXISTS idx_doctors_user
    ON doctors(user_id);

CREATE INDEX IF NOT EXISTS idx_doctors_hospital
    ON doctors(hospital_id);

CREATE INDEX IF NOT EXISTS idx_medical_records_patient
    ON medical_records(patient_id);

CREATE INDEX IF NOT EXISTS idx_medical_records_doctor
    ON medical_records(doctor_id);

CREATE INDEX IF NOT EXISTS idx_consent_patient
    ON consent_records(patient_id);

CREATE INDEX IF NOT EXISTS idx_audit_user
    ON audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_read
    ON notifications(read);

-- ============================================================
-- Schema complete
-- ============================================================