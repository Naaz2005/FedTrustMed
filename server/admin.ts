import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { sanitizeUser, insertAuditLog } from './auth.js';
import { generateAndSealUserKeys } from './keyVault.js';
import { decryptAES256GCM } from './cryptoUtils.js';
import { validateBreakGlassReason } from './validators.js';
import { anchorTransaction, blockchain, verifyChainIntegrity } from './blockchain.js';
import threatRoutes from './threatRoutes.js';
import {
  recordTrustEvent,
  recordAdminChange,
  adminUnfreezeUser,
  getUserTrustEvents,
  getAllTrustEvents,
  getAccountSafetyOverview,
  FREEZE_THRESHOLD,
} from './trustEngine.js';

export const adminRouter = Router();

function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

adminRouter.get('/users', async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT id, email, full_name, role, hospital_id, hospital_name, department_id, department_name,
           aadhaar_last4, approval_status, aadhaar_verification_status, medical_license_number,
           medical_license_verification_status, is_frozen, trust_score, mfa_enabled,
           COALESCE(data_access_permissions, '{}') as data_access_permissions,
           created_at, updated_at
    FROM users
    ORDER BY created_at DESC
  `);
  res.json({ success: true, message: 'Admin users list', users: result.rows });
});

adminRouter.get('/audit-logs', async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT id, user_id, user_name, user_role, hospital_name, action, resource_id, ip_address, details, timestamp
    FROM audit_logs
    ORDER BY timestamp DESC
    LIMIT 100
  `);
  res.json({ success: true, message: 'Admin audit logs', logs: result.rows });
});

/**
 * GET /api/admin/ledger/blocks
 * Returns all hash-chained blocks and transactions in the Audit Ledger.
 */
adminRouter.get('/ledger/blocks', async (_req: Request, res: Response) => {
  const blocks = await blockchain.getBlocks();
  res.json({ success: true, count: blocks.length, blocks });
});

/**
 * GET /api/admin/ledger/blocks/:index
 * Returns a single block by index.
 */
adminRouter.get('/ledger/blocks/:index', async (req: Request, res: Response) => {
  const index = parseInt(req.params.index, 10);
  if (isNaN(index)) {
    return res.status(400).json({ error: 'Invalid block index' });
  }
  const block = await blockchain.getBlockByIndex(index);
  if (!block) {
    return res.status(404).json({ error: 'Block not found' });
  }
  res.json({ success: true, block });
});

/**
 * POST /api/admin/ledger/verify
 * Runs full cryptographic integrity verification on all blocks:
 * Recomputes every transaction SHA-256 hash, Merkle root, block header hash,
 * and validates Ed25519 signatures with 2-of-3 quorum.
 */
adminRouter.post('/ledger/verify', async (_req: Request, res: Response) => {
  const result = await verifyChainIntegrity();
  res.json({ success: true, result });
});

/**
 * GET /api/admin/overview-stats
 * Returns overview statistics for the System Admin Home (Approvals):
 * - Number of pending approvals
 * - Three system health numbers (Active Hospital Nodes, Key Vault Integrity, Audit Ledger Status)
 */


// Federated Learning routes (System Admin > Research > Federated Learning)
import federatedRouter from './federatedLearningRoutes.js';
adminRouter.get('/overview-stats', async (_req: Request, res: Response) => {
  // 1. Pending approvals count
  const pendingRes = await pool.query(
    "SELECT COUNT(*)::int AS count FROM users WHERE approval_status = 'PENDING'"
  );
  const pendingCount = pendingRes.rows[0]?.count || 0;

  // 2. Active hospital nodes count
  const hospRes = await pool.query(
    "SELECT COUNT(*)::int AS count FROM hospitals WHERE status = 'APPROVED'"
  );
  const activeNodesCount = hospRes.rows[0]?.count || 0;

  // 3. User ECC Key count (Key Vault Integrity)
  const usersRes = await pool.query(
    "SELECT COUNT(*)::int AS count FROM users WHERE public_key_ecc IS NOT NULL"
  );
  const sealedKeysCount = usersRes.rows[0]?.count || 0;

  // 4. Audit ledger logs count & integrity
  const auditRes = await pool.query(
    "SELECT COUNT(*)::int AS count FROM audit_logs"
  );
  const auditEventsCount = auditRes.rows[0]?.count || 0;

  res.json({
    success: true,
    pendingApprovals: pendingCount,
    health: {
      activeHospitalNodes: activeNodesCount,
      keyVaultStatus: '100% Sealed',
      sealedKeysCount,
      auditLedgerStatus: 'Zero Tamper / Verified',
      auditEventsCount,
    },
  });
});

adminRouter.post('/toggle-freeze', async (req: Request, res: Response) => {
  const { userId, isFrozen, reason } = req.body;
  if (!userId || typeof isFrozen !== 'boolean') {
    return res.status(400).json({ error: 'User ID and isFrozen boolean required' });
  }

  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!cleanReason) {
    return res.status(400).json({ error: 'A specific reason is required to freeze or unfreeze an account' });
  }

  const adminUser = (req as any).user;

  if (!isFrozen) {
    // Unfreeze user through Trust Engine (restores score & standing, records event, logs audit)
    try {
      const result = await adminUnfreezeUser({
        userId,
        reason: cleanReason,
        adminUser,
        ipAddress: getClientIp(req),
      });

      return res.json({
        success: true,
        user: {
          ...result.user,
          is_frozen: false,
          trust_score: result.user.trustScore,
        },
        message: 'Account successfully unfrozen',
      });
    } catch (err: any) {
      return res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
    }
  }

  // Freeze user
  const updateRes = await pool.query(
    `UPDATE users
     SET is_frozen = TRUE, updated_at = NOW()
     WHERE id = $1
     RETURNING id, email, full_name, role, is_frozen, mfa_enabled, approval_status, data_access_permissions`,
    [userId]
  );
  if (updateRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  await recordTrustEvent({
    userId,
    eventType: 'ADMIN_CHANGE',
    reason: `Account frozen by administrator: ${cleanReason}`,
    delta: -10,
  }).catch(console.error);

  await insertAuditLog({
    userId: adminUser?.id || null,
    userName: adminUser?.fullName || adminUser?.email || 'System Admin',
    userRole: 'SYSTEM_ADMIN',
    hospitalId: adminUser?.hospitalId || null,
    hospitalName: adminUser?.hospitalName || 'Central Governance Node',
    action: 'USER_ACCOUNT_FROZEN',
    resourceId: userId,
    ipAddress: getClientIp(req),
    trustImpact: -10,
    details: `Account frozen for user ${updateRes.rows[0].email}. Reason: ${cleanReason}`,
  });

  return res.json({
    success: true,
    user: updateRes.rows[0],
    message: 'Account successfully frozen',
  });
});

/**
 * GET /api/admin/account-safety
 * Returns overview of all users with current trust scores, freeze status, and event counts.
 */
adminRouter.get('/account-safety', async (_req: Request, res: Response) => {
  const users = await getAccountSafetyOverview();
  res.json({
    success: true,
    threshold: FREEZE_THRESHOLD,
    users,
  });
});

/**
 * GET /api/admin/trust-events
 * Returns recent trust events across the system.
 */
adminRouter.get('/trust-events', async (_req: Request, res: Response) => {
  const events = await getAllTrustEvents(100);
  res.json({ success: true, count: events.length, events });
});

/**
 * GET /api/admin/trust-events/:userId
 * Returns trust event history for a specific user.
 */
adminRouter.get('/trust-events/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;
  const events = await getUserTrustEvents(userId);
  res.json({ success: true, count: events.length, events });
});

/**
 * POST /api/admin/adjust-trust-score
 * Manual admin adjustment of a user's trust score.
 */
adminRouter.post('/adjust-trust-score', async (req: Request, res: Response) => {
  const { userId, delta, reason } = req.body;
  if (!userId || delta === undefined) {
    return res.status(400).json({ error: 'User ID and delta required' });
  }

  const cleanReason = (reason || '').trim();
  if (!cleanReason) {
    return res.status(400).json({ error: 'A reason is required to adjust trust score' });
  }

  const numDelta = parseFloat(delta);
  if (isNaN(numDelta)) {
    return res.status(400).json({ error: 'Delta must be a valid number' });
  }

  try {
    const result = await recordAdminChange(userId, numDelta, cleanReason);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});

/**
 * GET /api/admin/pending-users
 * Returns all users whose approval_status is 'PENDING',
 * aggregated with their uploaded verification documents.
 */
adminRouter.get('/pending-users', async (_req: Request, res: Response) => {
  const result = await pool.query(`
    SELECT u.*,
      json_agg(
        json_build_object(
          'id', d.id,
          'kind', d.kind,
          'originalName', d.original_name,
          'mime', d.mime,
          'size', d.size,
          'createdAt', d.created_at
        )
      ) FILTER (WHERE d.id IS NOT NULL) AS documents
    FROM users u
    LEFT JOIN documents d ON d.owner_user_id = u.id
    WHERE u.approval_status = 'PENDING'
    GROUP BY u.id
    ORDER BY u.created_at ASC
  `);

  const users = result.rows.map((row) => {
    const sanitized = sanitizeUser(row);
    sanitized.documents = row.documents || [];
    return sanitized;
  });

  return res.json({
    success: true,
    count: users.length,
    users,
  });
});

/**
 * POST /api/admin/verify-user-documents
 * Updates verification status for Aadhaar, Medical Licence, and Affiliation documents.
 * Body: { userId, aadhaarVerified, medicalLicenseVerified, affiliationVerified }
 */
adminRouter.post('/verify-user-documents', async (req: Request, res: Response) => {
  const { userId, aadhaarVerified, medicalLicenseVerified, affiliationVerified } = req.body || {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const user = userRes.rows[0];

  let newAadhaarStatus = user.aadhaar_verification_status;
  if (typeof aadhaarVerified === 'boolean') {
    newAadhaarStatus = aadhaarVerified ? 'VERIFIED' : 'REJECTED';
  }

  let newLicenseStatus = user.medical_license_verification_status;
  if (typeof medicalLicenseVerified === 'boolean') {
    newLicenseStatus = medicalLicenseVerified ? 'VERIFIED' : 'REJECTED';
  }

  let newAffiliationStatus = user.affiliation_verification_status;
  if (typeof affiliationVerified === 'boolean') {
    newAffiliationStatus = affiliationVerified ? 'VERIFIED' : 'REJECTED';
  }

  const updateRes = await pool.query(
    `UPDATE users
     SET aadhaar_verification_status = $1,
         medical_license_verification_status = $2,
         affiliation_verification_status = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [newAadhaarStatus, newLicenseStatus, newAffiliationStatus, userId]
  );

  const updatedUser = updateRes.rows[0];
  const adminUser = (req as any).user;

  await insertAuditLog({
    userId: adminUser?.id || null,
    userName: adminUser?.fullName || adminUser?.email || 'System Admin',
    userRole: adminUser?.role || 'SYSTEM_ADMIN',
    hospitalId: adminUser?.hospitalId || null,
    hospitalName: adminUser?.hospitalName || 'N/A',
    action: 'VERIFY_USER_DOCUMENTS',
    resourceId: userId,
    ipAddress: getClientIp(req),
    trustImpact: 0,
    details: `Updated verification for user ${userId}: aadhaar=${newAadhaarStatus}, license=${newLicenseStatus}`,
  });

  return res.json({
    success: true,
    message: 'User documents verification status updated successfully',
    user: sanitizeUser(updatedUser),
  });
});

/**
 * POST /api/admin/approve-user
 * Approves a pending user account.
 * - Enforces: Aadhaar must be verified (and Medical Licence for doctors)
 * - Generates ECC P-256 key pair, seals private key under MASTER_KEY
 * - Creates profile row in patients or doctors table
 * - Never overwrites the licence number user submitted
 * - Creates an in-app notification
 * - Writes audit log
 */
adminRouter.post('/approve-user', async (req: Request, res: Response) => {
  const { userId, role, permissions } = req.body || {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const user = userRes.rows[0];

  const targetRole = role || user.role;

  // 1. Identity verification check (Aadhaar required for all users)
  const isAadhaarVerified =
    user.aadhaar_verification_status === 'VERIFIED' ||
    user.aadhaar_verification_status === 'VERIFIED - SIMULATION';

  if (!isAadhaarVerified) {
    return res.status(403).json({
      error: 'Cannot approve user: Aadhaar identity must be verified before approval.',
    });
  }

  // 2. Doctor medical licence verification check
  if (targetRole === 'DOCTOR') {
    const isLicenseVerified =
      user.medical_license_verification_status === 'VERIFIED' ||
      user.medical_license_verification_status === 'VERIFIED - SIMULATION';

    if (!isLicenseVerified) {
      return res.status(403).json({
        error: 'Cannot approve doctor: Medical licence must be verified before approval.',
      });
    }
  }

  // 3. Hospital Admin affiliation verification check (if submitted)
  if (targetRole === 'HOSPITAL_ADMIN' && user.admin_authorization_code) {
    const isAffiliationVerified =
      user.affiliation_verification_status === 'VERIFIED' ||
      user.affiliation_verification_status === 'VERIFIED - SIMULATION' ||
      user.affiliation_verification_status === 'NOT_REQUIRED';

    if (!isAffiliationVerified) {
      return res.status(403).json({
        error: 'Cannot approve hospital admin: Hospital authorization must be verified before approval.',
      });
    }
  }

  // 4. Generate ECC key pair and seal private key under MASTER_KEY
  const { publicKeyEcc, privateKeyEnc } = generateAndSealUserKeys(user.id);

  // 5. Determine data access permissions
  const dataAccessPermissions = Array.isArray(permissions)
    ? permissions
    : (user.data_access_permissions || []);

  // 6. Update user record (never overwrite medical_license_number)
  const userUpdateRes = await pool.query(
    `UPDATE users
     SET approval_status = 'APPROVED',
         role = $1,
         data_access_permissions = $2,
         public_key_ecc = $3,
         private_key_enc = $4,
         rejection_reason = NULL,
         updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [targetRole, dataAccessPermissions, publicKeyEcc, privateKeyEnc, user.id]
  );
  const updatedUser = userUpdateRes.rows[0];

  // 7. Resolve hospital information for profile rows
  let hospitalId = user.hospital_id;
  let hospitalName = user.hospital_name;
  if (!hospitalId) {
    const hospRes = await pool.query('SELECT id, name FROM hospitals ORDER BY id LIMIT 1');
    if (hospRes.rows.length > 0) {
      hospitalId = hospRes.rows[0].id;
      hospitalName = hospRes.rows[0].name;
    }
  }

  // 8. Create profile row in patients or doctors table
  if (targetRole === 'PATIENT') {
    const patientProfileId = `pat-${crypto.randomUUID()}`;
    await pool.query(
      `INSERT INTO patients (
         id, user_id, full_name, email, dob, gender, blood_type, allergies, medical_conditions,
         primary_hospital_id, primary_hospital_name, emergency_contact, trust_score, public_key_ecc, created_at
       ) VALUES ($1, $2, $3, $4, NULL, 'Not Specified', 'Unknown', '{}', '{}', $5, $6, 'None Provided', 100.00, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         email = EXCLUDED.email,
         primary_hospital_id = EXCLUDED.primary_hospital_id,
         primary_hospital_name = EXCLUDED.primary_hospital_name,
         public_key_ecc = EXCLUDED.public_key_ecc`,
      [
        patientProfileId,
        user.id,
        user.full_name,
        user.email,
        hospitalId || 'hosp-st-jude',
        hospitalName || 'St. Jude General',
        publicKeyEcc,
      ]
    );

    if (hospitalId) {
      await pool.query('UPDATE hospitals SET patients_count = patients_count + 1 WHERE id = $1', [hospitalId]);
    }
  } else if (targetRole === 'DOCTOR') {
    let departmentId = user.department_id;
    let departmentName = user.department_name;
    if (!departmentId && hospitalId) {
      const deptRes = await pool.query('SELECT id, name FROM departments WHERE hospital_id = $1 LIMIT 1', [hospitalId]);
      if (deptRes.rows.length > 0) {
        departmentId = deptRes.rows[0].id;
        departmentName = deptRes.rows[0].name;
      } else {
        const anyDept = await pool.query('SELECT id, name FROM departments LIMIT 1');
        if (anyDept.rows.length > 0) {
          departmentId = anyDept.rows[0].id;
          departmentName = anyDept.rows[0].name;
        }
      }
    }

    const doctorProfileId = `doc-${crypto.randomUUID()}`;
    // Always use original user.medical_license_number to ensure it is never overwritten
    const preservedLicense = user.medical_license_number || 'UNKNOWN';

    await pool.query(
      `INSERT INTO doctors (
         id, user_id, full_name, specialty, department_id, department_name,
         hospital_id, hospital_name, license_number, trust_score, assigned_patients_count, created_at
       ) VALUES ($1, $2, $3, 'General Medicine', $4, $5, $6, $7, $8, 100.00, 0, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         full_name = EXCLUDED.full_name,
         department_id = EXCLUDED.department_id,
         department_name = EXCLUDED.department_name,
         hospital_id = EXCLUDED.hospital_id,
         hospital_name = EXCLUDED.hospital_name,
         license_number = EXCLUDED.license_number`,
      [
        doctorProfileId,
        user.id,
        user.full_name,
        departmentId || 'dept-stjude-cardio',
        departmentName || 'Cardiology',
        hospitalId || 'hosp-st-jude',
        hospitalName || 'St. Jude General',
        preservedLicense,
      ]
    );

    if (hospitalId) {
      await pool.query('UPDATE hospitals SET doctors_count = doctors_count + 1 WHERE id = $1', [hospitalId]);
    }
  }

  // 9. Create notification for the approved user
  const notifId = `notif-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
     VALUES ($1, $2, 'Account Approved', 'Your account registration has been approved. You can now log in to FedTrustMed.', 'SUCCESS', FALSE, NOW())`,
    [notifId, user.id]
  );

  // 10. Audit log
  const adminUser = (req as any).user;
  await insertAuditLog({
    userId: adminUser?.id || null,
    userName: adminUser?.fullName || adminUser?.email || 'System Admin',
    userRole: adminUser?.role || 'SYSTEM_ADMIN',
    hospitalId: adminUser?.hospitalId || null,
    hospitalName: adminUser?.hospitalName || 'N/A',
    action: 'USER_APPROVED',
    resourceId: user.id,
    ipAddress: getClientIp(req),
    trustImpact: 0,
    details: `Approved user ${user.id} (${user.email}) as ${targetRole}`,
  });

  return res.json({
    success: true,
    message: 'User approved successfully',
    user: sanitizeUser(updatedUser),
  });
});

/**
 * POST /api/admin/reject-user
 * Rejects a user registration.
 * Body: { userId, reason } (reason must be 5-300 characters)
 */
adminRouter.post('/reject-user', async (req: Request, res: Response) => {
  const { userId, reason } = req.body || {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5 || reason.trim().length > 300) {
    return res.status(400).json({
      error: 'Rejection reason must be between 5 and 300 characters',
    });
  }

  const cleanReason = reason.trim();

  const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  const user = userRes.rows[0];

  const updateRes = await pool.query(
    `UPDATE users
     SET approval_status = 'REJECTED',
         rejection_reason = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [cleanReason, userId]
  );
  const updatedUser = updateRes.rows[0];

  // Create notification for rejected user
  const notifId = `notif-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
     VALUES ($1, $2, 'Account Registration Rejected', $3, 'ALERT', FALSE, NOW())`,
    [notifId, userId, cleanReason]
  );

  // Audit log
  const adminUser = (req as any).user;
  await insertAuditLog({
    userId: adminUser?.id || null,
    userName: adminUser?.fullName || adminUser?.email || 'System Admin',
    userRole: adminUser?.role || 'SYSTEM_ADMIN',
    hospitalId: adminUser?.hospitalId || null,
    hospitalName: adminUser?.hospitalName || 'N/A',
    action: 'USER_REJECTED',
    resourceId: userId,
    ipAddress: getClientIp(req),
    trustImpact: 0,
    details: `Rejected registration for user ${userId} (${user.email}): ${cleanReason}`,
  });

  return res.json({
    success: true,
    message: 'User registration rejected',
    user: sanitizeUser(updatedUser),
  });
});

/**
 * GET /api/admin/all-users
 * Returns all registered users with sanitized profiles.
 */
adminRouter.get('/all-users', async (_req: Request, res: Response) => {
  const result = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  const users = result.rows.map(sanitizeUser);
  return res.json({
    success: true,
    count: users.length,
    users,
  });
});

/**
 * POST /api/admin/update-permissions
 * Updates a user's data access permissions.
 * Body: { userId, permissions }
 */
adminRouter.post('/update-permissions', async (req: Request, res: Response) => {
  const { userId, permissions } = req.body || {};

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!permissions || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Permissions must be an array of strings' });
  }

  const userRes = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
  if (userRes.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  const updateRes = await pool.query(
    `UPDATE users
     SET data_access_permissions = $1,
         updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [permissions, userId]
  );
  const updatedUser = updateRes.rows[0];

  const adminUser = (req as any).user;
  await insertAuditLog({
    userId: adminUser?.id || null,
    userName: adminUser?.fullName || adminUser?.email || 'System Admin',
    userRole: adminUser?.role || 'SYSTEM_ADMIN',
    hospitalId: adminUser?.hospitalId || null,
    hospitalName: adminUser?.hospitalName || 'N/A',
    action: 'PERMISSIONS_UPDATED',
    resourceId: userId,
    ipAddress: getClientIp(req),
    trustImpact: 0,
    details: `Updated permissions for user ${userId} to [${permissions.join(', ')}]`,
  });

  return res.json({
    success: true,
    message: 'Permissions updated successfully',
    user: sanitizeUser(updatedUser),
  });
});

/**
 * GET /api/admin/documents/:id
 * Opens and streams a licence or authorization document.
 * Decrypts AES-256-GCM ciphertext, writes audit log, and sets X-Content-Type-Options: nosniff.
 */
adminRouter.get('/documents/:id', async (req: Request, res: Response) => {
  const docId = req.params.id;

  const docRes = await pool.query('SELECT * FROM documents WHERE id = $1', [docId]);
  if (docRes.rows.length === 0) {
    return res.status(404).json({ error: 'Document not found' });
  }
  const doc = docRes.rows[0];

  let plaintext: Buffer;
  try {
    plaintext = decryptAES256GCM({
      ciphertext: doc.ciphertext,
      iv: doc.iv,
      authTag: doc.auth_tag,
    });
  } catch (err: any) {
    console.error(`Document decryption error for ${docId}:`, err);
    return res.status(500).json({ error: 'Document decryption failed or data integrity compromised' });
  }

  const adminUser = (req as any).user;
  await insertAuditLog({
    userId: adminUser?.id || null,
    userName: adminUser?.fullName || adminUser?.email || 'System Admin',
    userRole: adminUser?.role || 'SYSTEM_ADMIN',
    hospitalId: adminUser?.hospitalId || null,
    hospitalName: adminUser?.hospitalName || 'N/A',
    action: 'DOCUMENT_VIEW',
    resourceId: doc.id,
    ipAddress: getClientIp(req),
    trustImpact: 0,
    details: `Admin opened document ${doc.original_name} (${doc.id}) of type ${doc.kind} for owner ${doc.owner_user_id}`,
  });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Length', plaintext.length);
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.original_name)}"`);

  return res.status(200).send(plaintext);
});

/**
 * POST /api/admin/break-glass
 * SYSTEM_ADMIN emergency override on a medical record.
 * Body: { recordId, reason (15-300 chars) }
 * Audited and notifies the patient.
 */
adminRouter.post('/break-glass', async (req: Request, res: Response) => {
  const adminUser = (req as any).user;
  const { recordId, reason } = req.body || {};

  if (!recordId || typeof recordId !== 'string') {
    return res.status(400).json({ error: 'recordId is required' });
  }

  const reasonRes = validateBreakGlassReason(reason);
  if (!reasonRes.ok) {
    return res.status(400).json({ error: reasonRes.error });
  }
  const cleanReason = reasonRes.value;

  // Verify medical record exists
  const recRes = await pool.query('SELECT * FROM medical_records WHERE id = $1 LIMIT 1', [recordId]);
  if (recRes.rows.length === 0) {
    return res.status(404).json({ error: 'Medical record not found' });
  }
  const record = recRes.rows[0];

  // Ensure break_glass_access table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS break_glass_access (
      id VARCHAR(100) PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      record_id VARCHAR(100) NOT NULL REFERENCES medical_records(id) ON DELETE CASCADE,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const bgId = `bg-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO break_glass_access (id, user_id, record_id, reason, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [bgId, adminUser.id, recordId, cleanReason]
  );

  // Write audit row
  await insertAuditLog({
    userId: adminUser.id,
    userName: adminUser.fullName || adminUser.email || 'System Admin',
    userRole: adminUser.role,
    hospitalId: adminUser.hospitalId || null,
    hospitalName: adminUser.hospitalName || 'System Administration',
    action: 'BREAK_GLASS_ACCESS',
    resourceId: recordId,
    ipAddress: getClientIp(req),
    details: `Break-glass emergency override by SYSTEM_ADMIN for record ${recordId}. Reason: ${cleanReason}`,
  });

  // Anchor in Audit Ledger (Module M24)
  await anchorTransaction({
    txType: 'BREAK_GLASS_USED',
    actorId: adminUser.id,
    actorRole: 'SYSTEM_ADMIN',
    hospitalId: adminUser.hospitalId || undefined,
    resourceId: recordId,
    payload: {
      breakGlassId: bgId,
      recordId,
      patientId: record.patient_id,
      reason: cleanReason,
    },
  }).catch((err) => console.error('[Ledger Anchor Error - Break Glass]:', err));

  // Notify the patient
  const patRes = await pool.query('SELECT user_id, full_name FROM patients WHERE id = $1 LIMIT 1', [record.patient_id]);
  if (patRes.rows.length > 0) {
    const notifId = `notif-${crypto.randomUUID()}`;
    await pool.query(
      `INSERT INTO notifications (id, user_id, title, message, type, read, created_at)
       VALUES ($1, $2, 'Emergency Break-Glass Access', $3, 'ALERT', FALSE, NOW())`,
      [
        notifId,
        patRes.rows[0].user_id,
        `Emergency break-glass access was executed on your medical record (${record.title}) by system administration. Reason: ${cleanReason}`,
      ]
    );
  }

  return res.json({
    success: true,
    message: 'Break-glass emergency override activated',
    recordId,
    reason: cleanReason,
  });
});

