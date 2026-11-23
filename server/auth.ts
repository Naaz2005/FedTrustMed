import crypto from 'crypto';
import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { pool } from './db.js';
import { timingSafePasswordCompare, signToken, verifyToken, hashPassword } from './security.js';
import {
  validateFullName,
  validateEmail,
  validatePassword,
  validateAadhaar,
  validateRole,
  validateLicenceNumber,
  validateHospitalAuthCode,
  computeAadhaarHash,
} from './validators.js';
import type { Role } from './validators.js';
import { saveEncryptedDocument, detectFileType, detectPdfActiveContent } from './uploads.js';
import { generateUserKeys } from './cryptoUtils.js';
import {
  verifySimulationOnboarding,
  getSimulationRegistryList,
  isSimulationMode,
} from './simulationRegistry.js';
import { recordFailedLogin } from './trustEngine.js';

export const authRouter = Router();

// Constant error message for invalid credentials to prevent email enumeration
export const INVALID_CREDENTIALS_MSG = 'Invalid credentials';

// ============================================================================
// RATE LIMITING (M6) – per-IP on login and register
// ============================================================================

// In test mode, skip rate limiting so per-account lockout logic can be exercised.
// The rate limiter middleware remains attached and returns RateLimit-* headers.

/**
 * Rate limiter for /register – 10 requests per 15-minute window per IP.
 * Returns a JSON error response consistent with the rest of the API.
 */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many registration attempts from this IP. Please try again in 15 minutes.' },
});

/**
 * Rate limiter for /login – 10 requests per 15-minute window per IP.
 * This is a separate defence-in-depth layer on top of the per-account
 * lockout (failed_login_count / locked_until) already in the login handler.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Too many login attempts from this IP. Please try again in 15 minutes.' },
});

/**
 * Sanitizes user database row into a safe client representation.
 * Explicitly strips all secrets (password, private keys, MFA secrets, etc.).
 */
export function sanitizeUser(u: any) {
  const sanitized: Record<string, any> = {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    hospitalId: u.hospital_id,
    hospitalName: u.hospital_name,
    departmentId: u.department_id,
    departmentName: u.department_name,
    aadhaarLast4: u.aadhaar_last4,
    approvalStatus: u.approval_status,
    aadhaarVerificationStatus: u.aadhaar_verification_status,
    medicalLicenseNumber: u.medical_license_number,
    medicalLicenseVerificationStatus: u.medical_license_verification_status,
    adminAuthorizationCode: u.admin_authorization_code,
    affiliationVerificationStatus: u.affiliation_verification_status,
    isFrozen: u.is_frozen,
    trustScore: typeof u.trust_score === 'string' ? parseFloat(u.trust_score) : u.trust_score,
    accountStanding: u.is_frozen ? 'Your account is frozen, contact admin' : 'Your account is in good standing',
    mfaEnabled: u.mfa_enabled,
    dataAccessPermissions: u.data_access_permissions || [],
    publicKeyEcc: u.public_key_ecc,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };

  // Extra safety guarantee: never expose any key containing 'password'
  for (const k of Object.keys(sanitized)) {
    if (k.toLowerCase().includes('password')) {
      delete sanitized[k];
    }
  }

  return sanitized;
}

// ============================================================================
// AUDIT LOG HELPER
// ============================================================================

/**
 * Extracts the client IP address from the request.
 * Does NOT trust X-Forwarded-For unless Express trust proxy is configured.
 */
function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Writes a row to the audit_logs table for security event tracking.
 */
export async function insertAuditLog(params: {
  userId: string | null;
  userName: string;
  userRole: string;
  hospitalId: string | null;
  hospitalName: string;
  action: string;
  resourceId?: string | null;
  ipAddress: string;
  trustImpact?: number;
  details?: string | null;
}): Promise<void> {
  const id = `audit-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO audit_logs (id, user_id, user_name, user_role, hospital_id, hospital_name, action, resource_id, ip_address, trust_impact, details, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      id,
      params.userId,
      params.userName,
      params.userRole,
      params.hospitalId,
      params.hospitalName,
      params.action,
      params.resourceId || null,
      params.ipAddress,
      params.trustImpact ?? 0,
      params.details || null,
    ]
  );
}

/**
 * Multer middleware for multipart/form-data registration requests.
 * Parses form fields and processes document uploads.
 */
const regUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

const handleRegistrationUpload = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    regUpload.any()(req, res, (err: any) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ error: 'Uploaded file exceeds 10 MB limit' });
          }
          return res.status(400).json({ error: `Upload error: ${err.message}` });
        }
        return res.status(400).json({ error: err.message || 'File upload failed' });
      }
      if (req.files && Array.isArray(req.files) && req.files.length > 0) {
        req.file = req.files[0];
      }
      next();
    });
  } else {
    next();
  }
};

/**
 * POST /api/auth/register
 * Registers a new user with full input validation, role checks, and secure document storage.
 * - Doctors must upload a licence file (PDF/JPG/PNG) and provide medical licence number.
 * - Hospital Admins must upload an authorization letter (PDF) and provide admin auth code.
 * - Patients upload nothing.
 * - Stores only the Aadhaar HMAC hash and last 4 digits.
 * - All new accounts are created with approval_status = 'PENDING'.
 * - Duplicate Aadhaar or email returns 400 with a clear message ("already registered"), never 500.
 */
authRouter.post('/register', registerLimiter, handleRegistrationUpload, async (req: Request, res: Response) => {
  const body = req.body || {};

  // 1. Full name validation
  const rawFullName = body.fullName || body.full_name || body.name;
  const nameRes = validateFullName(rawFullName);
  if (!nameRes.ok) {
    return res.status(400).json({ error: nameRes.error });
  }
  const fullName = nameRes.value;

  // 2. Email validation
  const emailRes = validateEmail(body.email);
  if (!emailRes.ok) {
    return res.status(400).json({ error: emailRes.error });
  }
  const email = emailRes.value;

  // 3. Password validation
  const passRes = validatePassword(body.password);
  if (!passRes.ok) {
    return res.status(400).json({ error: passRes.error });
  }
  const password = passRes.value;

  // 4. Role validation
  const roleRes = validateRole(body.role);
  if (!roleRes.ok) {
    return res.status(400).json({ error: roleRes.error });
  }
  const role = roleRes.value;

  // 5. Aadhaar validation & hashing
  const rawAadhaar = body.aadhaar || body.aadhaarNumber || body.aadhaar_raw;
  const aadhaarRes = validateAadhaar(rawAadhaar);
  if (!aadhaarRes.ok) {
    return res.status(400).json({ error: aadhaarRes.error });
  }
  const cleanAadhaar = aadhaarRes.value;
  const aadhaarHash = computeAadhaarHash(cleanAadhaar);
  const aadhaarLast4 = cleanAadhaar.slice(-4);

  // 6. Simulation Registry Verification (Module M9)
  const rawLic = body.medicalLicenseNumber || body.medical_license_number || body.licenseNumber || body.licenceNumber;
  const rawCode = body.adminAuthorizationCode || body.admin_authorization_code || body.authorizationCode || body.hospitalAuthCode;
  const rawHospital = body.hospitalId || body.hospital_id || body.hospital;

  const simCheck = verifySimulationOnboarding({
    aadhaar: cleanAadhaar,
    fullName,
    role,
    hospitalId: rawHospital,
    medicalLicenseNumber: rawLic,
    adminAuthorizationCode: rawCode,
  });

  if (!simCheck.ok) {
    return res.status(400).json({ error: simCheck.error });
  }

  const isSimulationPass = simCheck.isSimulation;
  const aadhaarVerificationStatus = isSimulationPass ? 'VERIFIED - SIMULATION' : 'PENDING';
  const licenceVerificationStatus = (role === 'DOCTOR')
    ? (isSimulationPass ? 'VERIFIED - SIMULATION' : 'PENDING')
    : 'NOT_REQUIRED';
  const affiliationVerificationStatus = (role === 'HOSPITAL_ADMIN')
    ? (isSimulationPass ? 'VERIFIED - SIMULATION' : 'PENDING')
    : 'NOT_REQUIRED';

  // 7. Proactive duplicate check
  const duplicateCheck = await pool.query(
    'SELECT email, aadhaar_hash FROM users WHERE email = $1 OR aadhaar_hash = $2',
    [email, aadhaarHash]
  );
  if (duplicateCheck.rows.length > 0) {
    const match = duplicateCheck.rows[0];
    if (match.aadhaar_hash === aadhaarHash) {
      return res.status(400).json({ error: 'An account with this Aadhaar number is already registered.' });
    }
    if (match.email === email) {
      return res.status(400).json({ error: 'An account with this email address is already registered.' });
    }
    return res.status(400).json({ error: 'An account with these details is already registered.' });
  }

  // 7. Role-specific validation
  let medicalLicenseNumber: string | null = null;
  let adminAuthorizationCode: string | null = null;
  let uploadKind: string | null = null;

  if (role === 'DOCTOR') {
    const licRes = validateLicenceNumber(rawLic);
    if (!licRes.ok) {
      return res.status(400).json({ error: licRes.error });
    }
    medicalLicenseNumber = licRes.value;

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'Doctor registration requires uploading a medical licence file' });
    }

    const detected = detectFileType(req.file.buffer);
    if (!detected || !['application/pdf', 'image/jpeg', 'image/png'].includes(detected.mime)) {
      return res.status(400).json({
        error: 'Invalid licence file format: medical licence must be a valid PDF, JPG, or PNG document',
      });
    }

    if (detected.mime === 'application/pdf') {
      const activeScan = detectPdfActiveContent(req.file.buffer);
      if (activeScan.hasActiveContent) {
        return res.status(400).json({
          error: `Licence PDF rejected: contains active executable content (${activeScan.matchedKeyword})`,
        });
      }
    }
    uploadKind = 'MEDICAL_LICENSE';
  } else if (role === 'HOSPITAL_ADMIN') {
    const authCodeRes = validateHospitalAuthCode(rawCode);
    if (!authCodeRes.ok) {
      return res.status(400).json({ error: authCodeRes.error });
    }
    adminAuthorizationCode = authCodeRes.value;

    if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({ error: 'Hospital admin registration requires uploading an authorization letter' });
    }

    const detected = detectFileType(req.file.buffer);
    if (!detected || detected.mime !== 'application/pdf') {
      return res.status(400).json({
        error: 'Invalid authorization letter: hospital admins must upload an authorization letter in PDF format',
      });
    }

    const activeScan = detectPdfActiveContent(req.file.buffer);
    if (activeScan.hasActiveContent) {
      return res.status(400).json({
        error: `Authorization letter rejected: contains active executable content (${activeScan.matchedKeyword})`,
      });
    }
    uploadKind = 'AUTHORIZATION_LETTER';
  }

  // 8. Hospital & Department resolution (optional)
  let hospitalId: string | null = null;
  let hospitalName: string | null = null;
  if (rawHospital && typeof rawHospital === 'string' && rawHospital.trim()) {
    const hospRes = await pool.query(
      'SELECT id, name FROM hospitals WHERE id = $1 OR code = $1',
      [rawHospital.trim()]
    );
    if (hospRes.rows.length > 0) {
      hospitalId = hospRes.rows[0].id;
      hospitalName = hospRes.rows[0].name;
    } else {
      hospitalId = rawHospital.trim();
    }
  } else if (simCheck.isSimulation && simCheck.identity?.hospitalId) {
    hospitalId = simCheck.identity.hospitalId;
    hospitalName = simCheck.identity.hospitalName;
  }

  let departmentId: string | null = null;
  let departmentName: string | null = null;
  const rawDept = body.departmentId || body.department_id || body.department;
  if (rawDept && typeof rawDept === 'string' && rawDept.trim()) {
    const deptRes = await pool.query(
      'SELECT id, name FROM departments WHERE id = $1 OR name = $1',
      [rawDept.trim()]
    );
    if (deptRes.rows.length > 0) {
      departmentId = deptRes.rows[0].id;
      departmentName = deptRes.rows[0].name;
    } else {
      departmentId = rawDept.trim();
    }
  }

  // 9. Hash password & generate sealed ECC key pair
  const userId = `usr-${crypto.randomUUID()}`;
  const passwordHash = await hashPassword(password);
  const { publicKeyEcc, privateKeyEnc } = generateUserKeys(userId);

  // 10. Insert user with approval_status PENDING
  try {
    await pool.query(
      `INSERT INTO users (
        id, email, full_name, role, hospital_id, hospital_name, department_id, department_name,
        password, aadhaar_hash, aadhaar_last4, approval_status, aadhaar_verification_status,
        medical_license_number, medical_license_verification_status,
        admin_authorization_code, affiliation_verification_status,
        is_frozen, trust_score, mfa_enabled, private_key_enc, public_key_ecc,
        failed_login_count, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8,
        $9, $10, $11, 'PENDING', $12,
        $13, $14,
        $15, $16,
        FALSE, 100.00, FALSE, $17, $18,
        0, NOW(), NOW()
      )`,
      [
        userId,
        email,
        fullName,
        role,
        hospitalId,
        hospitalName,
        departmentId,
        departmentName,
        passwordHash,
        aadhaarHash,
        aadhaarLast4,
        aadhaarVerificationStatus,
        medicalLicenseNumber,
        licenceVerificationStatus,
        adminAuthorizationCode,
        affiliationVerificationStatus,
        privateKeyEnc,
        publicKeyEcc,
      ]
    );
  } catch (dbErr: any) {
    if (dbErr.code === '23505') {
      const detail = String(dbErr.detail || dbErr.message || '');
      if (detail.includes('aadhaar') || dbErr.constraint?.includes('aadhaar')) {
        return res.status(400).json({ error: 'An account with this Aadhaar number is already registered.' });
      }
      if (detail.includes('email') || dbErr.constraint?.includes('email')) {
        return res.status(400).json({ error: 'An account with this email address is already registered.' });
      }
      return res.status(400).json({ error: 'An account with this information is already registered.' });
    }
    throw dbErr;
  }

  // 11. Securely store uploaded document via M7 service
  if (req.file && uploadKind) {
    try {
      await saveEncryptedDocument({
        ownerUserId: userId,
        recordId: null,
        kind: uploadKind,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
      });
    } catch (uploadErr: any) {
      // Rollback user if file persistence fails
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      return res.status(400).json({ error: `Document encryption failed: ${uploadErr.message}` });
    }
  }

  // 12. Write audit log row
  await insertAuditLog({
    userId,
    userName: fullName,
    userRole: role,
    hospitalId,
    hospitalName: hospitalName || 'N/A',
    action: 'USER_REGISTERED',
    resourceId: userId,
    ipAddress: getClientIp(req),
    trustImpact: 0,
    details: `New ${role} registration pending administrator approval`,
  });

  return res.status(200).json({
    success: true,
    message: 'Registration submitted successfully. Your account is pending administrator approval.',
    user: {
      id: userId,
      email,
      fullName,
      role,
      approvalStatus: 'PENDING',
      aadhaarLast4,
    },
  });
});

/**
 * POST /api/auth/login
 * Authenticates user credentials with timing-safe bcrypt comparison.
 * Returns { success: true, token, user } on success.
 */
authRouter.post('/login', loginLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body || {};

  // Validate email format
  const emailRes = validateEmail(email);
  if (!emailRes.ok || !password || typeof password !== 'string') {
    // Run dummy compare to match execution timing of valid requests
    await timingSafePasswordCompare(password, null);
    // Audit: failed login (invalid input)
    await insertAuditLog({
      userId: null,
      userName: typeof email === 'string' ? email.slice(0, 100) : 'unknown',
      userRole: 'UNKNOWN',
      hospitalId: null,
      hospitalName: 'N/A',
      action: 'LOGIN_FAILED',
      ipAddress: getClientIp(req),
      trustImpact: 0,
      details: 'Invalid email format or missing password',
    });
    return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
  }

  const normalizedEmail = emailRes.value;

  // Retrieve user record from database
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [normalizedEmail]);
  const user = result.rows[0];

  // If user does not exist, run compare with dummy hash to prevent timing enumeration
  if (!user) {
    await timingSafePasswordCompare(password, null);
    // Audit: failed login (unknown email)
    await insertAuditLog({
      userId: null,
      userName: normalizedEmail,
      userRole: 'UNKNOWN',
      hospitalId: null,
      hospitalName: 'N/A',
      action: 'LOGIN_FAILED',
      ipAddress: getClientIp(req),
      trustImpact: 0,
      details: 'No account found for email',
    });
    return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
  }

  // Check account lockout status before validating password
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    await timingSafePasswordCompare(password, user.password);
    // Audit: login attempt while account is locked
    await insertAuditLog({
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      hospitalId: user.hospital_id || null,
      hospitalName: user.hospital_name || 'N/A',
      action: 'LOGIN_BLOCKED_LOCKED',
      ipAddress: getClientIp(req),
      trustImpact: -1,
      details: `Login attempt while account is locked until ${user.locked_until}`,
    });
    return res.status(423).json({
      error: 'Account is temporarily locked due to multiple failed login attempts. Please try again in 15 minutes.',
    });
  }

  // Verify password using timing-safe compare (a null password in DB or input can never log in)
  const isMatch = await timingSafePasswordCompare(password, user.password);

  if (!isMatch) {
    const failedCount = (user.failed_login_count || 0) + 1;

    // Module M25: Record failed login in Trust Engine (lowers score and auto-freezes if below threshold)
    await recordFailedLogin(user.id, `Failed password attempt ${failedCount} of 5`).catch((err) =>
      console.error('[TrustEngine Error on Failed Login]:', err)
    );

    if (failedCount >= 5) {
      await pool.query(
        "UPDATE users SET failed_login_count = $1, locked_until = NOW() + INTERVAL '15 minutes', updated_at = NOW() WHERE id = $2",
        [failedCount, user.id]
      );
      // Audit: account locked out
      await insertAuditLog({
        userId: user.id,
        userName: user.full_name,
        userRole: user.role,
        hospitalId: user.hospital_id || null,
        hospitalName: user.hospital_name || 'N/A',
        action: 'ACCOUNT_LOCKED',
        ipAddress: getClientIp(req),
        trustImpact: -10,
        details: `Account locked after ${failedCount} consecutive failed login attempts`,
      });
    } else {
      await pool.query(
        'UPDATE users SET failed_login_count = $1, updated_at = NOW() WHERE id = $2',
        [failedCount, user.id]
      );
      // Audit: failed login (wrong password)
      await insertAuditLog({
        userId: user.id,
        userName: user.full_name,
        userRole: user.role,
        hospitalId: user.hospital_id || null,
        hospitalName: user.hospital_name || 'N/A',
        action: 'LOGIN_FAILED',
        ipAddress: getClientIp(req),
        trustImpact: -2,
        details: `Failed login attempt ${failedCount} of 5`,
      });
    }
    return res.status(401).json({ error: INVALID_CREDENTIALS_MSG });
  }

  // Verify account approval status
  if (user.approval_status === 'PENDING') {
    return res.status(403).json({
      error: 'Your account registration is pending administrator approval.',
    });
  }

  if (user.approval_status === 'REJECTED') {
    const reasonText = user.rejection_reason ? `: ${user.rejection_reason}` : '';
    return res.status(403).json({
      error: `Your account registration has been rejected${reasonText}. Please contact your hospital administrator.`,
    });
  }

  if (user.approval_status !== 'APPROVED') {
    return res.status(403).json({
      error: `Your account approval status is ${user.approval_status}. Access not permitted.`,
    });
  }

  // Check if account is frozen
  if (user.is_frozen) {
    return res.status(403).json({
      error: 'Your account has been frozen due to security policy. Please contact an administrator.',
    });
  }

  // Check MFA if enabled on user account
  if (user.mfa_enabled) {
    const otp = req.body?.otp || req.body?.mfaCode;
    if (!otp) {
      return res.json({
        mfaRequired: true,
        userId: user.id,
        email: user.email,
        message: 'MFA authentication required. Please enter your 6-digit OTP code.',
      });
    }
  }

  // Reset failed login counter on successful authentication
  if (user.failed_login_count > 0 || user.locked_until) {
    await pool.query(
      'UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE id = $1',
      [user.id]
    );
  }

  // Issue 1-hour HS256 JWT token
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    hospitalId: user.hospital_id,
    departmentId: user.department_id,
  });

  const safeUser = sanitizeUser(user);

  // Audit: successful login
  await insertAuditLog({
    userId: user.id,
    userName: user.full_name,
    userRole: user.role,
    hospitalId: user.hospital_id || null,
    hospitalName: user.hospital_name || 'N/A',
    action: 'LOGIN_SUCCESS',
    ipAddress: getClientIp(req),
    trustImpact: 0,
    details: 'Successful authentication',
  });

  return res.json({
    success: true,
    token,
    user: safeUser,
  });
});

/**
 * Authentication verification middleware.
 * Validates HS256 JWT token from Authorization header and loads sanitized user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication token required' });
  }

  try {
    const payload = verifyToken(token);

    // On EVERY request, re-read user from PostgreSQL
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [payload.userId]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User account no longer exists' });
    }

    const user = result.rows[0];

    // Reject if account is frozen
    if (user.is_frozen) {
      return res.status(403).json({
        error: 'Your account has been frozen due to security policy. Please contact an administrator.',
      });
    }

    // Reject if account is not APPROVED
    if (user.approval_status !== 'APPROVED') {
      return res.status(403).json({
        error: 'Account registration is not approved.',
      });
    }

    // Reject if DB role differs from token role (privilege escalation detection)
    if (user.role !== payload.role) {
      return res.status(403).json({
        error: 'Token role does not match current account role. Please re-authenticate.',
      });
    }

    (req as any).user = sanitizeUser(user);
    (req as any).tokenPayload = payload;
    next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

/**
 * Role-based access control middleware factory.
 * Returns 403 if the authenticated user's role is not in the allowed list.
 * Must be used AFTER requireAuth.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user;
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(user.role as Role)) {
      return res.status(403).json({
        error: `Access denied. This resource requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
}

/**
 * GET /api/auth/me
 * Returns current authenticated user profile.
 */
authRouter.get('/me', requireAuth, async (req: Request, res: Response) => {
  return res.json({
    success: true,
    user: (req as any).user,
  });
});

/**
 * GET /api/auth/simulation-registry
 * Authenticated endpoint: returns the simulation test identifiers for demo page listing.
 * Only available when SIMULATION_MODE=true.
 */
authRouter.get('/simulation-registry', requireAuth, (_req: Request, res: Response) => {
  if (!isSimulationMode()) {
    return res.status(403).json({ error: 'Simulation registry is disabled when SIMULATION_MODE is off' });
  }
  return res.json({
    success: true,
    identities: getSimulationRegistryList(),
  });
});

/**
 * GET /api/auth/simulation-info
 * Public helper endpoint for the UI to know if SIMULATION_MODE is enabled
 * and retrieve simulation identities without requiring an existing login.
 */
authRouter.get('/simulation-info', (_req: Request, res: Response) => {
  const active = isSimulationMode();
  return res.json({
    simulationMode: active,
    identities: active ? getSimulationRegistryList() : [],
  });
});

// ============================================================================
// PUBLIC HOSPITALS ROUTER
// ============================================================================

export const hospitalsRouter = Router();

/**
 * GET /api/hospitals
 * Public endpoint - returns list of hospitals with id and name only.
 * No authentication required.
 */
hospitalsRouter.get('/', async (_req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT id, name FROM hospitals ORDER BY name ASC'
  );
  return res.json(result.rows);
});

/**
 * GET /api/hospitals/departments/all
 * Public endpoint - returns all hospital departments.
 */
hospitalsRouter.get('/departments/all', async (_req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT id, name, hospital_id FROM departments ORDER BY name ASC'
  );
  return res.json(result.rows);
});

/**
 * GET /api/hospitals/:id/departments
 * Returns departments belonging to a specific hospital.
 */
hospitalsRouter.get('/:id/departments', async (req: Request, res: Response) => {
  const result = await pool.query(
    'SELECT id, name, hospital_id FROM departments WHERE hospital_id = $1 ORDER BY name ASC',
    [req.params.id]
  );
  return res.json(result.rows);
});
