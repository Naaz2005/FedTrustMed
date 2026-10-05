import { pool } from './db.js';
import type { MedicalRecord, ConsentRecord } from '../src/types/index.js';

/*
 * Durable storage for records and consents.
 * Before this module they lived only in process memory, so every restart erased consents
 * (a patient's revocation could silently "un-revoke") and all newly created records.
 */

const iso = (v: any): string | undefined => (v ? new Date(v).toISOString() : undefined);

export async function saveRecord(r: MedicalRecord): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO medical_records
        (id, patient_id, patient_name, doctor_id, doctor_name, hospital_id, hospital_name, title, record_type, diagnosis,
         encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key, sha256_hash, clsm_hash, mhe_ciphertext,
         encryption_time_ms, decryption_time_ms, fabric_tx_id, file_dag_cid, created_at, prescriptions, lab_tests, iot_device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       ON CONFLICT (id) DO NOTHING`,
      [r.id, r.patientId, r.patientName, r.doctorId, r.doctorName, r.hospitalId, r.hospitalName, r.title, r.recordType,
       r.diagnosis, r.encryptedContent, r.ivAes, r.authTag ?? null, r.eccEncryptedAesKey, r.sha256Hash, r.clsmHash ?? null,
       r.mheCiphertext ?? null, r.encryptionTimeMs ?? null, r.decryptionTimeMs ?? null, r.fabricTxId, r.fileDagCid ?? null,
       r.createdAt, r.prescriptions ?? [], r.labTests ?? [], r.iotDeviceId ?? null]
    );
  } catch (e) {
    console.error('[persistence] saveRecord failed:', (e as Error).message);
  }
}

export async function saveConsent(c: ConsentRecord): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO consent_records
        (id, patient_id, patient_name, doctor_id, doctor_name, requesting_hospital_id, requesting_hospital_name,
         record_id, record_title, status, purpose, granted_at, expires_at, fabric_tx_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (id) DO UPDATE SET
         record_id = EXCLUDED.record_id, record_title = EXCLUDED.record_title, status = EXCLUDED.status,
         granted_at = EXCLUDED.granted_at, expires_at = EXCLUDED.expires_at, fabric_tx_id = EXCLUDED.fabric_tx_id`,
      [c.id, c.patientId, c.patientName, c.doctorId ?? null, c.doctorName ?? null, c.requestingHospitalId,
       c.requestingHospitalName, c.recordId ?? null, c.recordTitle ?? null, c.status, c.purpose, c.grantedAt ?? null,
       c.expiresAt ?? null, c.fabricTxId, c.createdAt]
    );
  } catch (e) {
    console.error('[persistence] saveConsent failed:', (e as Error).message);
  }
}

export async function loadRecords(): Promise<MedicalRecord[]> {
  const { rows } = await pool.query('SELECT * FROM medical_records ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id, patientId: r.patient_id, patientName: r.patient_name, doctorId: r.doctor_id, doctorName: r.doctor_name,
    hospitalId: r.hospital_id, hospitalName: r.hospital_name, title: r.title, recordType: r.record_type,
    diagnosis: r.diagnosis, encryptedContent: r.encrypted_content, ivAes: r.iv_aes, authTag: r.auth_tag ?? undefined,
    eccEncryptedAesKey: r.ecc_encrypted_aes_key, sha256Hash: r.sha256_hash, clsmHash: r.clsm_hash ?? undefined,
    mheCiphertext: r.mhe_ciphertext ?? undefined,
    encryptionTimeMs: r.encryption_time_ms != null ? Number(r.encryption_time_ms) : undefined,
    decryptionTimeMs: r.decryption_time_ms != null ? Number(r.decryption_time_ms) : undefined,
    fabricTxId: r.fabric_tx_id, fileDagCid: r.file_dag_cid ?? undefined, createdAt: iso(r.created_at)!,
    prescriptions: r.prescriptions ?? [], labTests: r.lab_tests ?? [], iotDeviceId: r.iot_device_id ?? undefined,
  })) as MedicalRecord[];
}

export async function loadConsents(): Promise<ConsentRecord[]> {
  const { rows } = await pool.query('SELECT * FROM consent_records ORDER BY created_at DESC');
  return rows.map((r) => ({
    id: r.id, patientId: r.patient_id, patientName: r.patient_name, doctorId: r.doctor_id ?? undefined,
    doctorName: r.doctor_name ?? undefined, requestingHospitalId: r.requesting_hospital_id,
    requestingHospitalName: r.requesting_hospital_name, recordId: r.record_id ?? undefined,
    recordTitle: r.record_title ?? undefined, status: r.status, purpose: r.purpose, grantedAt: iso(r.granted_at),
    expiresAt: iso(r.expires_at), fabricTxId: r.fabric_tx_id, createdAt: iso(r.created_at)!,
  })) as ConsentRecord[];
}
