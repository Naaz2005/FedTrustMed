import { Router, Request, Response } from 'express';
import { pool } from './db.js';
import { requireAuth, requireRole } from './auth.js';

export const hospitalAdminRouter = Router();

// Apply auth and hospital admin role to all routes in this router
hospitalAdminRouter.use(requireAuth, requireRole('HOSPITAL_ADMIN'));

/**
 * Helper to resolve the hospital ID for the current authenticated hospital admin
 */
async function getAdminHospitalId(req: Request): Promise<{ hospitalId: string | null; hospitalName: string | null }> {
  const user = (req as any).user;
  let hospitalId = user?.hospitalId || null;
  let hospitalName = user?.hospitalName || null;

  if (!hospitalId && user?.id) {
    const userRes = await pool.query('SELECT hospital_id, hospital_name FROM users WHERE id = $1', [user.id]);
    if (userRes.rows.length > 0) {
      hospitalId = userRes.rows[0].hospital_id;
      hospitalName = userRes.rows[0].hospital_name;
    }
  }

  // If hospitalName is still missing, lookup from hospitals table
  if (hospitalId && !hospitalName) {
    const hospRes = await pool.query('SELECT name FROM hospitals WHERE id = $1', [hospitalId]);
    if (hospRes.rows.length > 0) {
      hospitalName = hospRes.rows[0].name;
    }
  }

  return { hospitalId, hospitalName };
}

/**
 * GET /api/hospital/overview
 * Returns key metrics for the hospital admin's hospital:
 * - doctorsCount
 * - patientsCount
 * - pendingStaffCount
 * - hospitalId & hospitalName
 */
hospitalAdminRouter.get('/overview', async (req: Request, res: Response) => {
  const { hospitalId, hospitalName } = await getAdminHospitalId(req);

  if (!hospitalId) {
    return res.status(400).json({ error: 'Hospital administrator is not associated with a hospital' });
  }

  // 1. Doctors count in this hospital
  const docRes = await pool.query(
    'SELECT COUNT(*)::int AS count FROM doctors WHERE hospital_id = $1',
    [hospitalId]
  );
  const doctorsCount = docRes.rows[0]?.count || 0;

  // 2. Patients count whose primary hospital is this hospital
  const patRes = await pool.query(
    'SELECT COUNT(*)::int AS count FROM patients WHERE primary_hospital_id = $1',
    [hospitalId]
  );
  const patientsCount = patRes.rows[0]?.count || 0;

  // 3. Pending staff count for this hospital (doctors or hospital admins pending approval)
  const pendingRes = await pool.query(
    `SELECT COUNT(*)::int AS count FROM users
     WHERE hospital_id = $1 AND approval_status = 'PENDING' AND role != 'PATIENT'`,
    [hospitalId]
  );
  const pendingStaffCount = pendingRes.rows[0]?.count || 0;

  return res.json({
    success: true,
    hospitalId,
    hospitalName: hospitalName || 'Hospital Node',
    doctorsCount,
    patientsCount,
    pendingStaffCount,
  });
});

/**
 * GET /api/hospital/staff
 * Returns affiliated medical practitioners for the admin's hospital ONLY.
 */
hospitalAdminRouter.get('/staff', async (req: Request, res: Response) => {
  const { hospitalId } = await getAdminHospitalId(req);

  if (!hospitalId) {
    return res.json({ success: true, message: 'Hospital staff list', staff: [] });
  }

  const result = await pool.query(
    `SELECT d.id, d.user_id, d.full_name, d.specialty, d.department_name, d.hospital_name,
            d.license_number, d.trust_score, d.assigned_patients_count, d.created_at, u.email
     FROM doctors d
     JOIN users u ON d.user_id = u.id
     WHERE d.hospital_id = $1
     ORDER BY d.created_at DESC`,
    [hospitalId]
  );

  return res.json({
    success: true,
    message: 'Hospital staff list',
    staff: result.rows,
  });
});

/**
 * GET /api/hospital/patients
 * Returns registered patients whose primary hospital is the admin's hospital ONLY.
 * Excludes clinical details (diagnoses, ciphertexts) to maintain non-clinical boundary.
 */
hospitalAdminRouter.get('/patients', async (req: Request, res: Response) => {
  const { hospitalId } = await getAdminHospitalId(req);

  if (!hospitalId) {
    return res.json({ success: true, message: 'Hospital patients list', patients: [] });
  }

  const result = await pool.query(
    `SELECT p.id, p.full_name, p.email, p.gender, p.blood_type,
            p.primary_hospital_id, p.primary_hospital_name, p.trust_score, p.created_at
     FROM patients p
     WHERE p.primary_hospital_id = $1
     ORDER BY p.created_at DESC`,
    [hospitalId]
  );

  return res.json({
    success: true,
    message: 'Hospital patients list',
    patients: result.rows,
  });
});

/**
 * GET /api/hospital/pending-approvals
 * Returns pending staff applications belonging to the admin's hospital ONLY.
 */
hospitalAdminRouter.get('/pending-approvals', async (req: Request, res: Response) => {
  const { hospitalId } = await getAdminHospitalId(req);

  if (!hospitalId) {
    return res.json({ success: true, message: 'Pending approvals', approvals: [], pendingStaff: [] });
  }

  const result = await pool.query(
    `SELECT id, email, full_name, role, hospital_name, department_name,
            medical_license_number, admin_authorization_code, approval_status, created_at
     FROM users
     WHERE approval_status = 'PENDING'
       AND hospital_id = $1
     ORDER BY created_at ASC`,
    [hospitalId]
  );

  return res.json({
    success: true,
    message: 'Pending approvals',
    approvals: result.rows,
    pendingStaff: result.rows,
  });
});

/**
 * GET /api/hospital/activity
 * Returns a non-clinical activity list for the admin's own hospital ONLY.
 * Strips clinical content and diagnoses, providing timestamps and action metadata.
 */
hospitalAdminRouter.get('/activity', async (req: Request, res: Response) => {
  const { hospitalId } = await getAdminHospitalId(req);

  if (!hospitalId) {
    return res.json({ success: true, message: 'Hospital activity list', logs: [], activity: [] });
  }

  const result = await pool.query(
    `SELECT id, user_id, user_name, user_role, hospital_id, hospital_name, action, resource_id, timestamp,
            CASE
              WHEN action IN ('RECORD_CREATED', 'RECORD_DECRYPTED', 'RECORD_REPORT_DOWNLOADED', 'DOCUMENT_DOWNLOAD')
              THEN action || ' (Resource: ' || COALESCE(resource_id, 'N/A') || ')'
              ELSE details
            END AS details
     FROM audit_logs
     WHERE hospital_id = $1
     ORDER BY timestamp DESC
     LIMIT 100`,
    [hospitalId]
  );

  return res.json({
    success: true,
    message: 'Hospital activity list',
    logs: result.rows,
    activity: result.rows,
  });
});

