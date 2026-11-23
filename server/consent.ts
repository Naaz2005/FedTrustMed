import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { requireAuth, requireRole, insertAuditLog } from './auth.js';
import { anchorTransaction } from './blockchain.js';
import {
  validateConsentPurpose,
  validateConsentReason,
  ALLOWED_CONSENT_PURPOSES,
} from './validators.js';

export const consentRouter = Router();

function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Writes a row to the notifications table.
 */
export async function insertNotification(params: {
  userId: string;
  title: string;
  message: string;
  type?: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
}): Promise<void> {
  const notifId = `notif-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
     VALUES ($1, $2, $3, $4, $5, FALSE, NOW())`,
    [notifId, params.userId, params.title, params.message, params.type || 'INFO']
  );
}

/**
 * Helper to update expired granted consents in the database to status 'EXPIRED'.
 */
export async function expireOutdatedConsents(): Promise<void> {
  await pool.query(
    "UPDATE consent_records SET status = 'EXPIRED' WHERE status = 'GRANTED' AND expires_at IS NOT NULL AND expires_at <= NOW()"
  );
}

/**
 * GET /api/consent
 * Returns consent records based on role:
 * - PATIENT: sees only their own consents.
 * - DOCTOR: sees consents granted/requested to them.
 * - HOSPITAL_ADMIN: sees consents within their hospital.
 * - SYSTEM_ADMIN: sees all consents.
 */
consentRouter.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  await expireOutdatedConsents();

  let query = 'SELECT * FROM consent_records ORDER BY created_at DESC LIMIT 50';
  let params: any[] = [];

  if (user.role === 'PATIENT') {
    const patRes = await pool.query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
    if (patRes.rows.length === 0) {
      return res.json({ success: true, message: 'Consent records', consents: [] });
    }
    query = 'SELECT * FROM consent_records WHERE patient_id = $1 ORDER BY created_at DESC';
    params = [patRes.rows[0].id];
  } else if (user.role === 'DOCTOR') {
    const docRes = await pool.query('SELECT id FROM doctors WHERE user_id = $1 LIMIT 1', [user.id]);
    const docId = docRes.rows[0]?.id || user.id;
    query = 'SELECT * FROM consent_records WHERE (doctor_id = $1 OR doctor_id = $2) ORDER BY created_at DESC';
    params = [docId, user.id];
  } else if (user.role === 'HOSPITAL_ADMIN' && user.hospitalId) {
    query = 'SELECT * FROM consent_records WHERE requesting_hospital_id = $1 ORDER BY created_at DESC';
    params = [user.hospitalId];
  }

  const result = await pool.query(query, params);
  res.json({ success: true, message: 'Consent records', consents: result.rows });
});

/**
 * POST /api/consent/request
 * Doctor requests consent from a patient.
 * Body: { patientId, purpose (enum), reason?, recordId? }
 * The doctor and hospital come strictly from the token / authenticated doctor profile.
 * Every action writes an audit row and a notification to the patient.
 */
consentRouter.post('/request', requireAuth, requireRole('DOCTOR'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { patientId, purpose, reason, recordId } = req.body || {};

  if (!patientId || typeof patientId !== 'string') {
    return res.status(400).json({ error: 'patientId is required' });
  }

  // Validate Purpose Enum
  const purposeRes = validateConsentPurpose(purpose);
  if (!purposeRes.ok) {
    return res.status(400).json({ error: purposeRes.error });
  }

  // Validate Reason (optional, max 200 chars)
  const reasonRes = validateConsentReason(reason);
  if (!reasonRes.ok) {
    return res.status(400).json({ error: reasonRes.error });
  }

  // Verify Patient exists
  const patRes = await pool.query(
    'SELECT id, user_id, full_name, primary_hospital_id, primary_hospital_name FROM patients WHERE id = $1 OR user_id = $1 LIMIT 1',
    [patientId]
  );
  if (patRes.rows.length === 0) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  const patient = patRes.rows[0];

  // If recordId is provided, verify it belongs to this patient
  let recordTitle: string | null = null;
  if (recordId) {
    const recRes = await pool.query(
      'SELECT id, title FROM medical_records WHERE id = $1 AND patient_id = $2 LIMIT 1',
      [recordId, patient.id]
    );
    if (recRes.rows.length === 0) {
      return res.status(404).json({ error: 'Specified medical record not found for this patient' });
    }
    recordTitle = recRes.rows[0].title;
  }

  // Resolve Doctor and Hospital strictly from authenticated doctor profile/token
  const docRes = await pool.query('SELECT * FROM doctors WHERE user_id = $1 LIMIT 1', [user.id]);
  const doctor = docRes.rows[0];

  const doctorId = doctor?.id || null;
  const doctorName = doctor?.full_name || user.fullName;
  const hospitalId = doctor?.hospital_id || user.hospitalId || 'hosp-st-jude';
  const hospitalName = doctor?.hospital_name || user.hospitalName || 'St. Jude General';

  const consentId = `consent-${crypto.randomUUID()}`;

  const insertRes = await pool.query(
    `INSERT INTO consent_records (
      id, patient_id, patient_name, doctor_id, doctor_name,
      requesting_hospital_id, requesting_hospital_name,
      record_id, record_title, status, purpose, reason, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'PENDING', $10, $11, NOW())
    RETURNING *`,
    [
      consentId,
      patient.id,
      patient.full_name,
      doctorId,
      doctorName,
      hospitalId,
      hospitalName,
      recordId || null,
      recordTitle || null,
      purposeRes.value,
      reasonRes.value || null,
    ]
  );

  const newConsent = insertRes.rows[0];

  // Write audit row
  await insertAuditLog({
    userId: user.id,
    userName: doctorName,
    userRole: user.role,
    hospitalId,
    hospitalName,
    action: 'CONSENT_REQUESTED',
    resourceId: consentId,
    ipAddress: getClientIp(req),
    details: `Doctor requested consent for patient ${patient.full_name} (${patient.id}), purpose: ${purposeRes.value}`,
  });

  // Write notification for the patient
  await insertNotification({
    userId: patient.user_id,
    title: 'Consent Request',
    message: `Dr. ${doctorName} (${hospitalName}) requested access to your medical records for purpose: ${purposeRes.value}.`,
    type: 'INFO',
  });

  return res.status(201).json({ success: true, message: 'Consent request created', consent: newConsent });
});

/**
 * POST /api/consent/grant
 * Patient grants consent.
 * Body: { consentId, recordId? to narrow to one record, expiresAt? }
 * The patient can act only on their own consents.
 * Every action writes an audit row and a notification to the doctor.
 */
consentRouter.post('/grant', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { consentId, recordId, expiresAt } = req.body || {};

  if (!consentId || typeof consentId !== 'string') {
    return res.status(400).json({ error: 'consentId is required' });
  }

  // Find patient profile
  const patRes = await pool.query('SELECT * FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
  if (patRes.rows.length === 0) {
    return res.status(404).json({ error: 'Patient profile not found' });
  }
  const patient = patRes.rows[0];

  // Find consent record
  const consentRes = await pool.query('SELECT * FROM consent_records WHERE id = $1 LIMIT 1', [consentId]);
  if (consentRes.rows.length === 0) {
    return res.status(404).json({ error: 'Consent record not found' });
  }
  const consent = consentRes.rows[0];

  // The patient can act only on their own consents
  if (consent.patient_id !== patient.id) {
    return res.status(403).json({ error: 'Unauthorized: patient can act only on their own consents' });
  }

  // Narrowing to one record if recordId is specified
  let targetRecordId: string | null = consent.record_id;
  let targetRecordTitle: string | null = consent.record_title;

  if (recordId !== undefined) {
    if (recordId === null || recordId === '') {
      targetRecordId = null;
      targetRecordTitle = null;
    } else {
      const recRes = await pool.query(
        'SELECT id, title FROM medical_records WHERE id = $1 AND patient_id = $2 LIMIT 1',
        [recordId, patient.id]
      );
      if (recRes.rows.length === 0) {
        return res.status(400).json({ error: 'Specified record does not belong to this patient' });
      }
      targetRecordId = recRes.rows[0].id;
      targetRecordTitle = recRes.rows[0].title;
    }
  }

  // Handle expiresAt
  let expDate: Date;
  if (expiresAt) {
    expDate = new Date(expiresAt);
    if (isNaN(expDate.getTime())) {
      return res.status(400).json({ error: 'Invalid expiresAt date format' });
    }
  } else {
    expDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default
  }

  const updateRes = await pool.query(
    `UPDATE consent_records
     SET status = 'GRANTED',
         record_id = $1,
         record_title = $2,
         granted_at = NOW(),
         expires_at = $3
     WHERE id = $4
     RETURNING *`,
    [targetRecordId, targetRecordTitle, expDate, consentId]
  );

  const updatedConsent = updateRes.rows[0];

  // Write audit row
  await insertAuditLog({
    userId: user.id,
    userName: patient.full_name,
    userRole: user.role,
    hospitalId: patient.primary_hospital_id,
    hospitalName: patient.primary_hospital_name,
    action: 'CONSENT_GRANTED',
    resourceId: consentId,
    ipAddress: getClientIp(req),
    details: `Patient granted consent to Dr. ${consent.doctor_name || 'N/A'}${targetRecordId ? ` (narrowed to record ${targetRecordId})` : ''}`,
  });

  // Write notification for the doctor
  let doctorUserId: string | null = null;
  if (consent.doctor_id) {
    const docUserRes = await pool.query('SELECT user_id FROM doctors WHERE id = $1 LIMIT 1', [consent.doctor_id]);
    doctorUserId = docUserRes.rows[0]?.user_id || consent.doctor_id;
  }
  if (doctorUserId) {
    await insertNotification({
      userId: doctorUserId,
      title: 'Consent Granted',
      message: `Patient ${patient.full_name} has granted your consent request.`,
      type: 'SUCCESS',
    });
  }

  // Anchor in Audit Ledger (Module M24)
  await anchorTransaction({
    txType: 'CONSENT_GRANTED',
    actorId: user.id,
    actorRole: user.role,
    hospitalId: patient.primary_hospital_id,
    resourceId: consentId,
    payload: {
      consentId,
      patientId: patient.id,
      doctorId: consent.doctor_id,
      recordId: targetRecordId,
      expiresAt: expDate.toISOString(),
      purpose: consent.purpose,
    },
  }).catch((err) => console.error('[Ledger Anchor Error - Consent Granted]:', err));

  return res.json({ success: true, message: 'Consent granted', consent: updatedConsent });
});

/**
 * POST /api/consent/deny
 * Patient denies consent.
 * Body: { consentId, reason? }
 * The patient can act only on their own consents.
 * Every action writes an audit row and a notification to the doctor.
 */
consentRouter.post('/deny', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { consentId } = req.body || {};

  if (!consentId || typeof consentId !== 'string') {
    return res.status(400).json({ error: 'consentId is required' });
  }

  const patRes = await pool.query('SELECT * FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
  if (patRes.rows.length === 0) {
    return res.status(404).json({ error: 'Patient profile not found' });
  }
  const patient = patRes.rows[0];

  const consentRes = await pool.query('SELECT * FROM consent_records WHERE id = $1 LIMIT 1', [consentId]);
  if (consentRes.rows.length === 0) {
    return res.status(404).json({ error: 'Consent record not found' });
  }
  const consent = consentRes.rows[0];

  // The patient can act only on their own consents
  if (consent.patient_id !== patient.id) {
    return res.status(403).json({ error: 'Unauthorized: patient can act only on their own consents' });
  }

  const updateRes = await pool.query(
    "UPDATE consent_records SET status = 'DENIED' WHERE id = $1 RETURNING *",
    [consentId]
  );
  const updatedConsent = updateRes.rows[0];

  // Write audit row
  await insertAuditLog({
    userId: user.id,
    userName: patient.full_name,
    userRole: user.role,
    hospitalId: patient.primary_hospital_id,
    hospitalName: patient.primary_hospital_name,
    action: 'CONSENT_DENIED',
    resourceId: consentId,
    ipAddress: getClientIp(req),
    details: `Patient denied consent request from Dr. ${consent.doctor_name || 'N/A'}`,
  });

  // Write notification for the doctor
  let doctorUserId: string | null = null;
  if (consent.doctor_id) {
    const docUserRes = await pool.query('SELECT user_id FROM doctors WHERE id = $1 LIMIT 1', [consent.doctor_id]);
    doctorUserId = docUserRes.rows[0]?.user_id || consent.doctor_id;
  }
  if (doctorUserId) {
    await insertNotification({
      userId: doctorUserId,
      title: 'Consent Denied',
      message: `Patient ${patient.full_name} has denied your consent request.`,
      type: 'WARNING',
    });
  }

  // Anchor in Audit Ledger (Module M24)
  await anchorTransaction({
    txType: 'CONSENT_REVOKED',
    actorId: user.id,
    actorRole: user.role,
    hospitalId: patient.primary_hospital_id,
    resourceId: consentId,
    payload: {
      consentId,
      patientId: patient.id,
      status: 'DENIED',
      doctorId: consent.doctor_id,
    },
  }).catch((err) => console.error('[Ledger Anchor Error - Consent Denied]:', err));

  return res.json({ success: true, message: 'Consent denied', consent: updatedConsent });
});

/**
 * Revoke handler used by both POST /api/consent/revoke and POST /api/consent/:id/revoke
 */
async function handleRevoke(req: Request, res: Response) {
  const user = (req as any).user;
  const consentId = req.body?.consentId || req.body?.id || req.params?.id;

  if (!consentId || typeof consentId !== 'string') {
    return res.status(400).json({ error: 'consentId is required' });
  }

  const patRes = await pool.query('SELECT * FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
  if (patRes.rows.length === 0) {
    return res.status(404).json({ error: 'Patient profile not found' });
  }
  const patient = patRes.rows[0];

  const consentRes = await pool.query('SELECT * FROM consent_records WHERE id = $1 LIMIT 1', [consentId]);
  if (consentRes.rows.length === 0) {
    return res.status(404).json({ error: 'Consent record not found' });
  }
  const consent = consentRes.rows[0];

  // The patient can act only on their own consents
  if (consent.patient_id !== patient.id) {
    return res.status(403).json({ error: 'Unauthorized: patient can act only on their own consents' });
  }

  const updateRes = await pool.query(
    "UPDATE consent_records SET status = 'REVOKED' WHERE id = $1 RETURNING *",
    [consentId]
  );
  const updatedConsent = updateRes.rows[0];

  // Write audit row
  await insertAuditLog({
    userId: user.id,
    userName: patient.full_name,
    userRole: user.role,
    hospitalId: patient.primary_hospital_id,
    hospitalName: patient.primary_hospital_name,
    action: 'CONSENT_REVOKED',
    resourceId: consentId,
    ipAddress: getClientIp(req),
    details: `Patient revoked consent for Dr. ${consent.doctor_name || 'N/A'}`,
  });

  // Write notification for the doctor
  let doctorUserId: string | null = null;
  if (consent.doctor_id) {
    const docUserRes = await pool.query('SELECT user_id FROM doctors WHERE id = $1 LIMIT 1', [consent.doctor_id]);
    doctorUserId = docUserRes.rows[0]?.user_id || consent.doctor_id;
  }
  if (doctorUserId) {
    await insertNotification({
      userId: doctorUserId,
      title: 'Consent Revoked',
      message: `Patient ${patient.full_name} has revoked consent for medical records access.`,
      type: 'ALERT',
    });
  }

  // Anchor in Audit Ledger (Module M24)
  await anchorTransaction({
    txType: 'CONSENT_REVOKED',
    actorId: user.id,
    actorRole: user.role,
    hospitalId: patient.primary_hospital_id,
    resourceId: consentId,
    payload: {
      consentId,
      patientId: patient.id,
      status: 'REVOKED',
      doctorId: consent.doctor_id,
    },
  }).catch((err) => console.error('[Ledger Anchor Error - Consent Revoked]:', err));

  return res.json({ success: true, message: 'Consent revoked', consent: updatedConsent });
}

/**
 * POST /api/consent/revoke
 * POST /api/consent/:id/revoke
 * Patient revokes consent.
 */
consentRouter.post('/revoke', requireAuth, requireRole('PATIENT'), handleRevoke);
consentRouter.post('/:id/revoke', requireAuth, requireRole('PATIENT'), handleRevoke);

/**
 * POST /api/consent (Backwards-compatibility for existing UI modal)
 * Patient directly creates a consent directive.
 */
consentRouter.post('/', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { doctorName, hospitalName, purpose, validityDays, recordId } = req.body || {};

  const patRes = await pool.query('SELECT id, full_name, primary_hospital_id, primary_hospital_name FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
  const patientId = patRes.rows[0]?.id || `pat-${user.id}`;
  const patientName = patRes.rows[0]?.full_name || user.fullName;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (Number(validityDays) || 30));

  const consentId = `consent-${Date.now()}`;
  const insertRes = await pool.query(`
    INSERT INTO consent_records (
      id, patient_id, patient_name, doctor_id, doctor_name, requesting_hospital_id, requesting_hospital_name,
      purpose, status, expires_at, record_id, created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'GRANTED', $9, $10, NOW())
    RETURNING *
  `, [
    consentId,
    patientId,
    patientName,
    'doc-profile-001',
    doctorName || 'Dr. Priya Patel',
    'hosp-st-jude',
    hospitalName || 'St. Jude General',
    purpose || 'Treatment',
    expiresAt,
    recordId || null,
  ]);

  await insertAuditLog({
    userId: user.id,
    userName: patientName,
    userRole: user.role,
    hospitalId: patRes.rows[0]?.primary_hospital_id || null,
    hospitalName: patRes.rows[0]?.primary_hospital_name || 'N/A',
    action: 'CONSENT_GRANTED',
    resourceId: consentId,
    ipAddress: getClientIp(req),
    details: `Patient directly created consent directive for Dr. ${doctorName || 'Dr. Priya Patel'}`,
  });

  res.json({ success: true, consent: insertRes.rows[0] });
});

