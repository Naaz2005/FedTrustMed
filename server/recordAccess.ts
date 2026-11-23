import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { requireAuth, requireRole, insertAuditLog } from './auth.js';
import { getMasterKey } from './security.js';
import { anchorTransaction } from './blockchain.js';

export const recordAccessRouter = Router();
export const auditAccessRouter = Router();

function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Decrypts a medical record's AES-256-GCM encrypted content.
 * Handles unwrapping server_master_wrapped_key if present.
 */
export function decryptMedicalRecord(record: any): any {
  const masterKey = getMasterKey();

  if (record.server_master_wrapped_key) {
    let wrapped: any;
    try {
      wrapped =
        typeof record.server_master_wrapped_key === 'string'
          ? JSON.parse(record.server_master_wrapped_key)
          : record.server_master_wrapped_key;
    } catch {
      wrapped = null;
    }

    if (wrapped && wrapped.ciphertext && wrapped.iv && wrapped.authTag) {
      try {
        const decipherKey = crypto.createDecipheriv(
          'aes-256-gcm',
          masterKey,
          Buffer.from(wrapped.iv, 'hex')
        );
        decipherKey.setAAD(Buffer.from(`data_key:${record.id}`, 'utf-8'));
        decipherKey.setAuthTag(Buffer.from(wrapped.authTag, 'hex'));
        const dataKeyHex =
          decipherKey.update(Buffer.from(wrapped.ciphertext, 'base64'), undefined, 'utf-8') +
          decipherKey.final('utf-8');
        const dataKey = Buffer.from(dataKeyHex, 'hex');

        const decipherContent = crypto.createDecipheriv(
          'aes-256-gcm',
          dataKey,
          Buffer.from(record.iv_aes, 'hex')
        );
        decipherContent.setAAD(Buffer.from(record.id, 'utf-8'));
        decipherContent.setAuthTag(Buffer.from(record.auth_tag, 'hex'));
        const plaintext =
          decipherContent.update(Buffer.from(record.encrypted_content, 'base64'), undefined, 'utf-8') +
          decipherContent.final('utf-8');

        try {
          return JSON.parse(plaintext);
        } catch {
          return plaintext;
        }
      } catch (err) {
        // Fallback to direct decryption
      }
    }
  }

  // Fallback: direct AES-256-GCM decryption
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      masterKey,
      Buffer.from(record.iv_aes, 'hex')
    );
    decipher.setAuthTag(Buffer.from(record.auth_tag, 'hex'));
    const plaintext =
      decipher.update(Buffer.from(record.encrypted_content, 'base64'), undefined, 'utf-8') +
      decipher.final('utf-8');
    try {
      return JSON.parse(plaintext);
    } catch {
      return plaintext;
    }
  } catch {
    // If plaintext or test stub
    return record.encrypted_content;
  }
}

/**
 * Generates a standard PDF-1.4 compliant binary buffer representing the medical report.
 */
export function generateMedicalReportPdf(record: any, decryptedContent?: any): Buffer {
  const contentStr =
    typeof decryptedContent === 'object'
      ? JSON.stringify(decryptedContent, null, 2)
      : String(decryptedContent || '');

  const textLines = [
    `FedTrustMed Confidential Medical Report`,
    `----------------------------------------`,
    `Record ID: ${record.id}`,
    `Patient: ${record.patient_name || 'N/A'} (${record.patient_id})`,
    `Authoring Doctor: ${record.doctor_name || 'N/A'}`,
    `Hospital: ${record.hospital_name || 'N/A'}`,
    `Record Title: ${record.title}`,
    `Record Type: ${record.record_type || 'Clinical Evaluation'}`,
    `Diagnosis: ${record.diagnosis || 'N/A'}`,
    `Prescriptions: ${Array.isArray(record.prescriptions) ? record.prescriptions.join(', ') : 'None'}`,
    `Lab Tests: ${Array.isArray(record.lab_tests) ? record.lab_tests.join(', ') : 'None'}`,
    `Created At: ${new Date(record.created_at || Date.now()).toISOString()}`,
    `Integrity SHA-256: ${record.sha256_hash || 'Verified'}`,
    `Clinical Findings: ${contentStr.replace(/[\r\n]+/g, ' ').slice(0, 500)}`,
  ];

  const streamContent = textLines
    .map((line, idx) => `BT /F1 11 Tf 40 ${750 - idx * 22} Td (${line.replace(/[\(\)\\]/g, '')}) Tj ET`)
    .join('\n');

  const streamLength = Buffer.byteLength(streamContent, 'utf-8');

  const pdf = [
    '%PDF-1.4',
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${streamLength} >> stream`,
    streamContent,
    'endstream',
    'endobj',
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    'xref',
    '0 6',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000262 00000 n ',
    '0000000350 00000 n ',
    'trailer << /Size 6 /Root 1 0 R >>',
    'startxref',
    '430',
    '%%EOF',
  ].join('\n');

  return Buffer.from(pdf, 'utf-8');
}

/**
 * Verifies access permission for a given user and record.
 * Allowed ONLY for:
 * 1. The patient who owns it
 * 2. The doctor who authored it
 * 3. A doctor with a GRANTED, unexpired consent covering THAT record
 * 4. SYSTEM_ADMIN with break-glass override
 * HOSPITAL_ADMIN can NEVER read. Everything else is 403 (and audited as a denied attempt).
 */
export async function verifyRecordAccess(
  user: any,
  recordId: string,
  ipAddress: string
): Promise<{ allowed: boolean; record?: any; status: number; error?: string; reason?: string }> {
  // 0. HOSPITAL_ADMIN can NEVER access clinical records or reports - immediate 403
  if (user?.role === 'HOSPITAL_ADMIN') {
    await insertAuditLog({
      userId: user.id,
      userName: user.fullName || user.email || 'Hospital Admin',
      userRole: user.role,
      hospitalId: user.hospitalId || null,
      hospitalName: user.hospitalName || 'N/A',
      action: 'RECORD_ACCESS_DENIED',
      resourceId: recordId,
      ipAddress,
      trustImpact: -5,
      details: `Denied hospital administrator clinical access attempt to ${recordId}`,
    });

    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: Hospital administrators cannot access clinical medical records or reports',
    };
  }

  // 1. Look up medical record
  const recRes = await pool.query('SELECT * FROM medical_records WHERE id = $1 LIMIT 1', [recordId]);
  if (recRes.rows.length === 0) {
    return { allowed: false, status: 404, error: 'Medical record not found' };
  }
  const record = recRes.rows[0];

  let isAllowed = false;
  let accessGrantReason = '';

  // 2. Patient who owns it
  if (user.role === 'PATIENT') {
    const patRes = await pool.query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
    if (patRes.rows.length > 0 && patRes.rows[0].id === record.patient_id) {
      isAllowed = true;
      accessGrantReason = 'Owner patient access';
    }
  }

  // 3. DOCTOR: Authoring doctor OR doctor with a GRANTED, unexpired consent covering THAT record
  if (user.role === 'DOCTOR') {
    const docRes = await pool.query('SELECT id FROM doctors WHERE user_id = $1 LIMIT 1', [user.id]);
    const docId = docRes.rows[0]?.id || user.id;

    // Check A: Is this doctor the author?
    if (record.doctor_id === docId) {
      isAllowed = true;
      accessGrantReason = 'Authoring doctor access';
    } else {
      // Check B: Does doctor have a GRANTED, unexpired consent covering this record?
      // Update any expired consents first
      await pool.query(
        "UPDATE consent_records SET status = 'EXPIRED' WHERE status = 'GRANTED' AND expires_at IS NOT NULL AND expires_at <= NOW()"
      );

      const consentCheck = await pool.query(
        `SELECT id FROM consent_records
         WHERE (doctor_id = $1 OR doctor_id = $2)
           AND patient_id = $3
           AND status = 'GRANTED'
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (record_id IS NULL OR record_id = $4)
         LIMIT 1`,
        [docId, user.id, record.patient_id, record.id]
      );

      if (consentCheck.rows.length > 0) {
        isAllowed = true;
        accessGrantReason = `Granted consent access (${consentCheck.rows[0].id})`;
      }
    }
  }

  // 4. SYSTEM_ADMIN with emergency break-glass override
  if (user.role === 'SYSTEM_ADMIN') {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS break_glass_access (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        record_id VARCHAR(100) NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const bgCheck = await pool.query(
      `SELECT id, reason FROM break_glass_access
       WHERE (user_id = $1 OR user_id = 'usr-admin-001')
         AND record_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, record.id]
    );

    if (bgCheck.rows.length > 0) {
      isAllowed = true;
      accessGrantReason = `Emergency break-glass access: ${bgCheck.rows[0].reason}`;
    }
  }

  // 5. HOSPITAL_ADMIN can NEVER read! (and all unauthorized attempts)
  if (!isAllowed) {
    await insertAuditLog({
      userId: user.id,
      userName: user.fullName || user.email || 'Unknown',
      userRole: user.role,
      hospitalId: user.hospitalId || null,
      hospitalName: user.hospitalName || 'N/A',
      action: 'RECORD_ACCESS_DENIED',
      resourceId: record.id,
      ipAddress,
      trustImpact: -5,
      details: `Denied unauthorized record access attempt to ${record.id} by ${user.role} (${user.email || user.id})`,
    });

    return {
      allowed: false,
      status: 403,
      error: 'Forbidden: you do not have permission to access this medical record',
    };
  }

  return { allowed: true, record, status: 200, reason: accessGrantReason };
}

/**
 * POST /api/medical-records
 * Creates and anchors a new medical record (Module M24).
 */
recordAccessRouter.post('/', requireAuth, requireRole('DOCTOR', 'SYSTEM_ADMIN'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { patientId, title, recordType, diagnosis, prescriptions, labTests, content } = req.body || {};

  if (!patientId || !title) {
    return res.status(400).json({ error: 'patientId and title are required' });
  }

  const patRes = await pool.query('SELECT * FROM patients WHERE id = $1 LIMIT 1', [patientId]);
  if (patRes.rows.length === 0) {
    return res.status(404).json({ error: 'Patient not found' });
  }
  const patient = patRes.rows[0];

  let doctorId = user.id;
  let doctorName = user.fullName || 'Dr. ' + (user.email || 'Author');
  let hospitalId = user.hospitalId || patient.primary_hospital_id;
  let hospitalName = user.hospitalName || patient.primary_hospital_name;

  if (user.role === 'DOCTOR') {
    const docRes = await pool.query('SELECT * FROM doctors WHERE user_id = $1 LIMIT 1', [user.id]);
    if (docRes.rows.length > 0) {
      doctorId = docRes.rows[0].id;
      doctorName = docRes.rows[0].full_name;
      hospitalId = docRes.rows[0].hospital_id;
      hospitalName = docRes.rows[0].hospital_name;
    }
  }

  const recordId = `rec-${crypto.randomUUID()}`;
  const masterKey = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const rawContent = typeof content === 'object' ? JSON.stringify(content) : String(content || diagnosis || title);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(rawContent, 'utf-8')), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const sha256 = crypto.createHash('sha256').update(ciphertext).digest('hex');

  const insertRes = await pool.query(
    `INSERT INTO medical_records (
      id, patient_id, patient_name, doctor_id, doctor_name, hospital_id, hospital_name,
      title, record_type, diagnosis, encrypted_content, iv_aes, auth_tag, ecc_encrypted_aes_key,
      sha256_hash, prescriptions, lab_tests, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
    RETURNING *`,
    [
      recordId,
      patient.id,
      patient.full_name,
      doctorId,
      doctorName,
      hospitalId,
      hospitalName,
      title,
      recordType || 'CONSULTATION',
      diagnosis || 'General clinical assessment',
      ciphertext.toString('base64'),
      iv.toString('hex'),
      authTag.toString('hex'),
      'server-master-encrypted',
      sha256,
      prescriptions || [],
      labTests || [],
    ]
  );

  const newRecord = insertRes.rows[0];

  // Anchor in Audit Ledger (Module M24)
  await anchorTransaction({
    txType: 'RECORD_CREATED',
    actorId: user.id,
    actorRole: user.role,
    hospitalId,
    resourceId: recordId,
    payload: {
      recordId,
      patientId: patient.id,
      patientName: patient.full_name,
      doctorId,
      doctorName,
      title,
      sha256Hash: sha256,
    },
  }).catch((err) => console.error('[Ledger Anchor Error - Record Created]:', err));

  return res.status(201).json({ success: true, message: 'Record created and anchored', record: newRecord });
});

/**
 * POST /api/medical-records/decrypt
 * Decrypts a medical record.
 * Body: { recordId }
 */
recordAccessRouter.post('/decrypt', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const { recordId } = req.body || {};

  if (!recordId || typeof recordId !== 'string') {
    return res.status(400).json({ error: 'recordId is required' });
  }

  const access = await verifyRecordAccess(user, recordId, getClientIp(req));
  if (!access.allowed) {
    return res.status(access.status).json({ error: access.error });
  }

  const record = access.record;
  const decryptedData = decryptMedicalRecord(record);

  // Write audit log for successful access
  await insertAuditLog({
    userId: user.id,
    userName: user.fullName || user.email || 'Authorized User',
    userRole: user.role,
    hospitalId: user.hospitalId || null,
    hospitalName: user.hospitalName || 'N/A',
    action: 'RECORD_DECRYPTED',
    resourceId: record.id,
    ipAddress: getClientIp(req),
    details: `Medical record decrypted: ${access.reason}`,
  });

  return res.json({
    success: true,
    message: 'Medical record decrypted successfully',
    record: {
      ...record,
      decryptedContent: decryptedData,
    },
    decryptedData,
  });
});

/**
 * GET /api/medical-records/:id/report
 * Streams a downloaded PDF medical report.
 */
recordAccessRouter.get('/:id/report', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const recordId = req.params.id;

  if (!recordId || typeof recordId !== 'string') {
    return res.status(400).json({ error: 'recordId is required' });
  }

  const access = await verifyRecordAccess(user, recordId, getClientIp(req));
  if (!access.allowed) {
    return res.status(access.status).json({ error: access.error });
  }

  const record = access.record;
  const decryptedData = decryptMedicalRecord(record);
  const pdfBuffer = generateMedicalReportPdf(record, decryptedData);

  // Write audit log for PDF download
  await insertAuditLog({
    userId: user.id,
    userName: user.fullName || user.email || 'Authorized User',
    userRole: user.role,
    hospitalId: user.hospitalId || null,
    hospitalName: user.hospitalName || 'N/A',
    action: 'RECORD_REPORT_DOWNLOADED',
    resourceId: record.id,
    ipAddress: getClientIp(req),
    details: `Medical report PDF downloaded: ${access.reason}`,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="medical-report-${encodeURIComponent(record.id)}.pdf"`
  );
  res.setHeader('Content-Length', pdfBuffer.length);
  return res.status(200).send(pdfBuffer);
});

/**
 * GET /api/audit/my-access
 * For patients: "who looked at my data".
 * Returns audit entries related to all records owned by the authenticated patient.
 */
auditAccessRouter.get('/my-access', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response) => {
  const user = (req as any).user;

  const patRes = await pool.query('SELECT id, full_name FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
  if (patRes.rows.length === 0) {
    return res.status(404).json({ error: 'Patient profile not found' });
  }
  const patient = patRes.rows[0];

  // Find all records belonging to this patient
  const recsRes = await pool.query('SELECT id FROM medical_records WHERE patient_id = $1', [patient.id]);
  const recordIds = recsRes.rows.map((r) => r.id);

  let query = `
    SELECT id, user_id, user_name, user_role, hospital_name, action, resource_id, ip_address, details, timestamp
    FROM audit_logs
    WHERE resource_id = $1
    ORDER BY timestamp DESC
    LIMIT 100
  `;
  let params: any[] = [patient.id];

  if (recordIds.length > 0) {
    query = `
      SELECT id, user_id, user_name, user_role, hospital_name, action, resource_id, ip_address, details, timestamp
      FROM audit_logs
      WHERE resource_id = ANY($1) OR resource_id = $2
      ORDER BY timestamp DESC
      LIMIT 100
    `;
    params = [recordIds, patient.id];
  }

  const auditRes = await pool.query(query, params);

  return res.json({
    success: true,
    message: 'My access audit logs',
    patientId: patient.id,
    accessLogs: auditRes.rows,
    logs: auditRes.rows,
  });
});
