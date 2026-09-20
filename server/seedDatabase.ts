
import 'dotenv/config';
import pg from 'pg';
import { db } from './db.js';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'fedtrust',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function seedDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('Starting PostgreSQL seed...');

    // 1. Hospitals
    for (const hospital of db.hospitals) {
      await client.query(
        `INSERT INTO hospitals
        (id, name, code, region, address, contact_email, status,
         trust_score, node_address, doctors_count, patients_count,
         records_count, federated_weight_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO NOTHING`,
        [
          hospital.id,
          hospital.name,
          hospital.code,
          hospital.region,
          hospital.address,
          hospital.contactEmail,
          hospital.status,
          hospital.trustScore,
          hospital.nodeAddress,
          hospital.doctorsCount,
          hospital.patientsCount,
          hospital.recordsCount,
          hospital.federatedWeightVersion,
        ]
      );
    }

    console.log(`Hospitals seeded: ${db.hospitals.length}`);

    // 2. Departments
    for (const department of db.departments) {
      await client.query(
        `INSERT INTO departments
        (id, hospital_id, name, head_doctor_name)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (id) DO NOTHING`,
        [
          department.id,
          department.hospitalId,
          department.name,
          department.headDoctorName,
        ]
      );
    }

    console.log(`Departments seeded: ${db.departments.length}`);

    // 3. Users
    for (const user of db.users) {
      await client.query(
        `INSERT INTO users
        (id, email, full_name, role, hospital_id, hospital_name,
         department_id, department_name, trust_score, is_frozen,
         is_verified, approval_status, data_access_permissions,
         requested_permissions, rejection_reason, password, public_key_ecc,
         created_at)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (id) DO NOTHING`,
        [
          user.id,
          user.email,
          user.fullName,
          user.role,
          user.hospitalId ?? null,
          user.hospitalName ?? null,
          user.departmentId ?? null,
          user.departmentName ?? null,
          user.trustScore,
          user.isFrozen,
          user.isVerified,
          user.approvalStatus ?? null,
          user.dataAccessPermissions ?? [],
          user.requestedPermissions ?? [],
          user.rejectionReason ?? null,
          user.password ?? null,
          user.publicKeyEcc,
          user.createdAt,
        ]
      );
    }

    console.log(`Users seeded: ${db.users.length}`);

    // 4. Patients
    for (const patient of db.patients) {
      await client.query(
        `INSERT INTO patients
        (id, user_id, full_name, email, dob, gender, blood_type,
         allergies, medical_conditions, primary_hospital_id,
         primary_hospital_name, emergency_contact, trust_score,
         public_key_ecc)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (id) DO NOTHING`,
        [
          patient.id,
          patient.userId,
          patient.fullName,
          patient.email,
          patient.dob,
          patient.gender,
          patient.bloodType,
          patient.allergies ?? [],
          patient.medicalConditions ?? [],
          patient.primaryHospitalId,
          patient.primaryHospitalName,
          patient.emergencyContact,
          patient.trustScore,
          patient.publicKeyEcc,
        ]
      );
    }

    console.log(`Patients seeded: ${db.patients.length}`);

    // 5. Doctors
    for (const doctor of db.doctors) {
      await client.query(
        `INSERT INTO doctors
        (id, user_id, full_name, specialty, department_id,
         department_name, hospital_id, hospital_name, license_number,
         trust_score, assigned_patients_count)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING`,
        [
          doctor.id,
          doctor.userId,
          doctor.fullName,
          doctor.specialty,
          doctor.departmentId ?? null,
          doctor.departmentName ?? null,
          doctor.hospitalId ?? null,
          doctor.hospitalName ?? null,
          doctor.licenseNumber,
          doctor.trustScore,
          doctor.assignedPatientsCount,
        ]
      );
    }

    console.log(`Doctors seeded: ${db.doctors.length}`);

    // 6. Appointments
    for (const appointment of db.appointments) {
      await client.query(
        `INSERT INTO appointments
        (id, patient_id, patient_name, doctor_id, doctor_name,
         hospital_id, hospital_name, appointment_date,
         appointment_time, type, status, notes)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO NOTHING`,
        [
          appointment.id,
          appointment.patientId,
          appointment.patientName,
          appointment.doctorId,
          appointment.doctorName,
          appointment.hospitalId,
          appointment.hospitalName,
          appointment.date,
          appointment.time,
          appointment.type,
          appointment.status,
          appointment.notes ?? null,
        ]
      );
    }

    console.log(`Appointments seeded: ${db.appointments.length}`);

    // 7. Medical Records
    for (const record of db.medicalRecords) {
      await client.query(
        `INSERT INTO medical_records
        (id, patient_id, patient_name, doctor_id, doctor_name,
         hospital_id, hospital_name, title, record_type, diagnosis,
         encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key,
         sha256_hash, clsm_hash, mhe_ciphertext, encryption_time_ms,
         decryption_time_ms, fabric_tx_id, file_dag_cid, created_at,
         prescriptions, lab_tests, iot_device_id)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
         $16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        ON CONFLICT (id) DO NOTHING`,
        [
          record.id,
          record.patientId,
          record.patientName,
          record.doctorId,
          record.doctorName,
          record.hospitalId,
          record.hospitalName,
          record.title,
          record.recordType,
          record.diagnosis,
          record.encryptedContent,
          record.ivAes,
          record.authTag ?? null,
          record.eccEncryptedAesKey,
          record.sha256Hash,
          record.clsmHash ?? null,
          record.mheCiphertext ?? null,
          record.encryptionTimeMs ?? null,
          record.decryptionTimeMs ?? null,
          record.fabricTxId,
          record.fileDagCid ?? null,
          record.createdAt,
          record.prescriptions ?? [],
          record.labTests ?? [],
          record.iotDeviceId ?? null,
        ]
      );
    }

    console.log(`Medical records seeded: ${db.medicalRecords.length}`);

    // 8. Consent Records
    for (const consent of db.consentRecords) {
      await client.query(
        `INSERT INTO consent_records
        (id, patient_id, patient_name, doctor_id, doctor_name,
         requesting_hospital_id, requesting_hospital_name, record_id,
         record_title, status, purpose, granted_at, expires_at,
         fabric_tx_id, created_at)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (id) DO NOTHING`,
        [
          consent.id,
          consent.patientId,
          consent.patientName,
          consent.doctorId ?? null,
          consent.doctorName ?? null,
          consent.requestingHospitalId,
          consent.requestingHospitalName,
          consent.recordId ?? null,
          consent.recordTitle ?? null,
          consent.status,
          consent.purpose,
          consent.grantedAt ?? null,
          consent.expiresAt ?? null,
          consent.fabricTxId,
          consent.createdAt,
        ]
      );
    }

    console.log(`Consent records seeded: ${db.consentRecords.length}`);

    // 9. Audit Logs
    for (const log of db.auditLogs) {
      await client.query(
        `INSERT INTO audit_logs
        (id, user_id, user_name, user_role, hospital_name,
         action, resource_id, ip_address, trust_impact,
         fabric_tx_id, timestamp)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (id) DO NOTHING`,
        [
          log.id,
          log.userId,
          log.userName,
          log.userRole,
          log.hospitalName,
          log.action,
          log.resourceId ?? null,
          log.ipAddress,
          log.trustImpact,
          log.fabricTxId ?? null,
          log.timestamp,
        ]
      );
    }

    console.log(`Audit logs seeded: ${db.auditLogs.length}`);

    // 10. Notifications
    for (const notification of db.notifications) {
      await client.query(
        `INSERT INTO notifications
        (id, title, message, type, timestamp, read)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (id) DO NOTHING`,
        [
          notification.id,
          notification.title,
          notification.message,
          notification.type,
          notification.timestamp,
          notification.read,
        ]
      );
    }

    console.log(`Notifications seeded: ${db.notifications.length}`);

    await client.query('COMMIT');

    console.log('');
    console.log('======================================');
    console.log('PostgreSQL seed completed successfully');
    console.log('======================================');
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('Seed failed:');
    console.error(error);

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase();