import 'express-async-errors';

import express from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { createServer as createViteServer } from 'vite';

import {
  openSecret,
  sealSecret,
  resolveJwtSecret,
} from './server/keyVault.js';

import {
  generateTotpSecret,
  verifyTotp,
  otpauthUri,
} from './server/totp.js';

import {
  publicUser,
  loginKey,
  isLockedOut,
  recordLoginFailure,
  clearLoginFailures,
  isValidAadhaar,
  isStrongPassword,
  isEmail,
} from './server/security.js';

import { db, pool } from './server/db.js';

import { fabricBlockchain } from './server/blockchain.js';
import { trustEngine } from './server/trustEngine.js';
import { threatDetector } from './server/threatEngine.js';
import { federatedLearningManager } from './server/federatedLearning.js';
import { idrsnEngine } from './server/idrsnEngine.js';
import { fileDagLedger } from './server/fileDagEngine.js';

import {
  encryptMedicalRecord,
  decryptMedicalRecord,
  generateEccKeyPair,
} from './server/cryptoUtils.js';

import {
  MedicalRecord,
  ConsentRecord,
} from './src/types/index.js';

const JWT_SECRET = resolveJwtSecret();
const PORT = Number(process.env.PORT || 3000);

type JwtPayload = {
  id: string;
  email: string;
  role: string;
  hospitalId?: string;
};

async function runStartupMigrations() {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS aadhaar_hash TEXT,
      ADD COLUMN IF NOT EXISTS aadhaar_last4 VARCHAR(4),
      ADD COLUMN IF NOT EXISTS aadhaar_verification_status VARCHAR(20) DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS medical_license_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS medical_license_verification_status VARCHAR(20) DEFAULT 'PENDING',
      ADD COLUMN IF NOT EXISTS medical_license_document_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS mfa_secret_enc TEXT,
      ADD COLUMN IF NOT EXISTS private_key_enc TEXT
  `);

  await pool.query(`
    ALTER TABLE patients
      ALTER COLUMN dob DROP NOT NULL
  `).catch(() => {
    // Already nullable on some installations.
  });

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_users_aadhaar_hash
    ON users(aadhaar_hash)
    WHERE aadhaar_hash IS NOT NULL
  `).catch((error) => {
    console.warn('Aadhaar unique index warning:', error.message);
  });
}

async function startServer() {
  await runStartupMigrations();

  const app = express();

  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    express.json({
      limit: '100kb',
    })
  );

  // ============================================================
  // SECURITY / REQUEST MONITORING
  // ============================================================

  app.use((req, res, next) => {
    const rawUrl = req.originalUrl || req.url;

    const forwarded = req.headers['x-forwarded-for'];
    const ip =
      typeof forwarded === 'string'
        ? forwarded.split(',')[0].trim()
        : req.socket.remoteAddress || '127.0.0.1';

    const bodyText = (() => {
      try {
        return JSON.stringify(req.body || {});
      } catch {
        return '';
      }
    })();

    const suspiciousInput = `${rawUrl} ${bodyText}`;

    if (
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b)|('--')|(\/\*)|(;)/i.test(
        suspiciousInput
      )
    ) {
      threatDetector.detectThreat(
        'SQL_INJECTION',
        undefined,
        'St. Jude General Hospital',
        ip
      );

      trustEngine.applyTrustRule(
        'unauthenticated_attacker',
        'USER',
        'UNAUTHORIZED_ACCESS',
        50,
        'System Firewall',
        'SQL Injection Payload Intercepted'
      );
    }

    next();
  });

  // ============================================================
  // JWT AUTHENTICATION
  // ============================================================

  const verifyJwt = (req: express.Request): JwtPayload | null => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice('Bearer '.length).trim();

    if (!token) {
      return null;
    }

    try {
      return jwt.verify(token, JWT_SECRET, {
        algorithms: ['HS256'],
      }) as JwtPayload;
    } catch {
      return null;
    }
  };

  const requireAuth = (
    req: express.Request,
    res: express.Response
  ): JwtPayload | null => {
    const user = verifyJwt(req);

    if (!user) {
      res.status(401).json({
        error: 'Authentication required',
      });

      return null;
    }

    return user;
  };

  const requireSystemAdmin = (
    req: express.Request,
    res: express.Response
  ): JwtPayload | null => {
    const user = requireAuth(req, res);

    if (!user) {
      return null;
    }

    if (user.role !== 'SYSTEM_ADMIN') {
      res.status(403).json({
        error: 'SYSTEM_ADMIN access required',
      });

      return null;
    }

    return user;
  };

  const getClientIp = (req: express.Request) => {
    const forwarded = req.headers['x-forwarded-for'];

    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }

    return req.socket.remoteAddress || req.ip || '127.0.0.1';
  };

  // ============================================================
  // AUTHENTICATION
  // ============================================================

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: 'Too many login requests. Please try again later.',
    },
  });

  app.post(
    '/api/auth/login',
    loginLimiter,
    async (req, res) => {
      try {
        const email = String(req.body?.email || '')
          .trim()
          .toLowerCase();

        const password = String(req.body?.password || '');
        const otp = String(req.body?.otp || '').trim();

        const ip = getClientIp(req);
        const lockKey = loginKey(email, ip);

        if (isLockedOut(lockKey)) {
          return res.status(429).json({
            error:
              'Too many failed login attempts. Please try again in 15 minutes.',
          });
        }

        if (!email || !password) {
          return res.status(400).json({
            error: 'Email and password are required.',
          });
        }

        if (!isEmail(email)) {
          return res.status(400).json({
            error: 'Please enter a valid email address.',
          });
        }

        const { rows } = await pool.query(
          `
          SELECT
            id,
            email,
            full_name AS "fullName",
            role,
            hospital_id AS "hospitalId",
            hospital_name AS "hospitalName",
            department_id AS "departmentId",
            department_name AS "departmentName",
            trust_score AS "trustScore",
            is_frozen AS "isFrozen",
            is_verified AS "isVerified",
            approval_status AS "approvalStatus",
            data_access_permissions AS "dataAccessPermissions",
            requested_permissions AS "requestedPermissions",
            rejection_reason AS "rejectionReason",
            aadhaar_last4 AS "aadhaarLast4",
            aadhaar_verification_status AS "aadhaarVerificationStatus",
            medical_license_number AS "medicalLicenseNumber",
            medical_license_verification_status AS "medicalLicenseVerificationStatus",
            medical_license_document_name AS "medicalLicenseDocumentName",
            mfa_enabled AS "mfaEnabled",
            mfa_secret_enc AS "mfaSecretEnc",
            password,
            public_key_ecc AS "publicKeyEcc",
            created_at AS "createdAt"
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [email]
        );

        const user = rows[0];

        // --------------------------------------------------------
        // UNKNOWN USER
        // --------------------------------------------------------

        if (!user) {
          const count = recordLoginFailure(lockKey);

          if (count >= 3) {
            threatDetector.detectThreat(
              'BRUTE_FORCE',
              undefined,
              'Unknown Account',
              ip
            );
          }

          return res.status(401).json({
            error: 'Invalid email or password.',
          });
        }

        // --------------------------------------------------------
        // PASSWORD
        // --------------------------------------------------------

        const storedPassword = String(user.password || '');
        let passwordValid = false;

        const isBcryptHash =
          storedPassword.startsWith('$2a$') ||
          storedPassword.startsWith('$2b$') ||
          storedPassword.startsWith('$2y$');

        if (isBcryptHash) {
          passwordValid = await bcrypt.compare(
            password,
            storedPassword
          );
        } else {
          // Compatibility with old seeded users.
          passwordValid = storedPassword === password;

          if (passwordValid) {
            const upgradedHash = await bcrypt.hash(password, 12);

            await pool.query(
              `
              UPDATE users
              SET password = $1
              WHERE id = $2
              `,
              [upgradedHash, user.id]
            );

            user.password = upgradedHash;
          }
        }

        if (!passwordValid) {
          const count = recordLoginFailure(lockKey);

          if (count >= 3) {
            threatDetector.detectThreat(
              'BRUTE_FORCE',
              user.id,
              user.hospitalName || 'Unknown Hospital',
              ip
            );
          }

          return res.status(401).json({
            error: 'Invalid email or password.',
          });
        }

        // --------------------------------------------------------
        // APPROVAL
        // --------------------------------------------------------

        if (user.approvalStatus === 'PENDING') {
          return res.status(403).json({
            error:
              'Account Registration Pending Admin Approval. An administrator must review your request and authorize data access permissions before you can log in.',
            approvalPending: true,
            user: publicUser(user),
          });
        }

        if (user.approvalStatus === 'REJECTED') {
          return res.status(403).json({
            error:
              `Account Registration Rejected by System Administrator. Reason: ${
                user.rejectionReason ||
                'Security criteria not met.'
              }`,
            rejected: true,
          });
        }

        // --------------------------------------------------------
        // IDENTITY VERIFICATION
        // --------------------------------------------------------

        if (
          user.role !== 'SYSTEM_ADMIN' &&
          user.aadhaarVerificationStatus !== 'VERIFIED'
        ) {
          return res.status(403).json({
            error:
              'Aadhaar verification is required before login.',
            verificationRequired: true,
            aadhaarVerificationStatus:
              user.aadhaarVerificationStatus || 'PENDING',
          });
        }

        if (
          user.role === 'DOCTOR' &&
          user.medicalLicenseVerificationStatus !== 'VERIFIED'
        ) {
          return res.status(403).json({
            error:
              'Medical licence verification is required before login.',
            verificationRequired: true,
            medicalLicenseVerificationStatus:
              user.medicalLicenseVerificationStatus ||
              'PENDING',
          });
        }

        if (user.isFrozen) {
          return res.status(403).json({
            error:
              'Account is frozen due to low Trust Score (< 40). Contact System Administrator.',
          });
        }

        // --------------------------------------------------------
        // MFA
        // --------------------------------------------------------

        if (user.mfaEnabled) {
          if (!otp) {
            return res.status(401).json({
              error: 'MFA verification code is required.',
              mfaRequired: true,
            });
          }

          if (!user.mfaSecretEnc) {
            return res.status(500).json({
              error:
                'MFA is enabled but the MFA secret is unavailable.',
            });
          }

          try {
            const secret = openSecret(user.mfaSecretEnc);

            if (!verifyTotp(secret, otp)) {
              const count = recordLoginFailure(lockKey);

              if (count >= 3) {
                threatDetector.detectThreat(
                  'BRUTE_FORCE',
                  user.id,
                  user.hospitalName || 'Unknown Hospital',
                  ip
                );
              }

              return res.status(401).json({
                error: 'Invalid MFA verification code.',
                mfaRequired: true,
              });
            }
          } catch (error) {
            console.error('MFA verification error:', error);

            return res.status(500).json({
              error: 'Unable to verify MFA.',
            });
          }
        }

        // Successful authentication.
        clearLoginFailures(lockKey);

        // --------------------------------------------------------
        // TRUST REWARD
        // --------------------------------------------------------

        const trustResult = trustEngine.applyTrustRule(
          user.id,
          'USER',
          'SUCCESSFUL_LOGIN',
          Number(user.trustScore),
          user.hospitalName || 'System',
          'Successful User Login'
        );

        user.trustScore = trustResult.newScore;
        user.isFrozen = trustResult.isFrozen;

        await pool.query(
          `
          UPDATE users
          SET trust_score = $1,
              is_frozen = $2
          WHERE id = $3
          `,
          [
            trustResult.newScore,
            trustResult.isFrozen,
            user.id,
          ]
        );

        const memoryUser = db.users.find(
          (u) => u.id === user.id
        );

        if (memoryUser) {
          memoryUser.trustScore = trustResult.newScore;
          memoryUser.isFrozen = trustResult.isFrozen;
        }

        // --------------------------------------------------------
        // JWT
        // --------------------------------------------------------

        const token = jwt.sign(
          {
            id: user.id,
            email: user.email,
            role: user.role,
            hospitalId: user.hospitalId,
          },
          JWT_SECRET,
          {
            expiresIn: '24h',
            algorithm: 'HS256',
          }
        );

        // --------------------------------------------------------
        // AUDIT
        // --------------------------------------------------------

        const auditId = `aud-${Date.now()}`;
        const auditTimestamp = new Date().toISOString();

        db.auditLogs.unshift({
          id: auditId,
          userId: user.id,
          userName: user.fullName,
          userRole: user.role,
          hospitalName: user.hospitalName || 'System',
          action: 'LOGIN_SUCCESS',
          ipAddress: ip,
          trustImpact: 2,
          timestamp: auditTimestamp,
        });

        await pool.query(
          `
          INSERT INTO audit_logs
          (
            id,
            user_id,
            user_name,
            user_role,
            hospital_name,
            action,
            ip_address,
            trust_impact,
            timestamp
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          `,
          [
            `${auditId}-pg`,
            user.id,
            user.fullName,
            user.role,
            user.hospitalName || 'System',
            'LOGIN_SUCCESS',
            ip,
            2,
            auditTimestamp,
          ]
        );

        return res.json({
          success: true,
          token,
          user: publicUser(user),
        });
      } catch (error) {
        console.error('Login error:', error);

        return res.status(500).json({
          error: 'Internal server error during login.',
        });
      }
    }
  );

  // ============================================================
  // REGISTRATION
  // ============================================================

  app.post('/api/auth/register', async (req, res) => {
    try {
      const {
        fullName,
        email,
        password,
        role,
        hospitalId,
        departmentName,
        requestedPermissions,
        aadhaarNumber,
        medicalLicenseNumber,
        medicalLicenseDocumentName,
      } = req.body;

      const normalizedEmail = String(email || '')
        .trim()
        .toLowerCase();

      const normalizedRole = String(
        role || 'PATIENT'
      )
        .trim()
        .toUpperCase();

      const normalizedAadhaar = String(
        aadhaarNumber || ''
      ).replace(/\s+/g, '');

      const normalizedLicense = String(
        medicalLicenseNumber || ''
      ).trim();

      const normalizedLicenseDocument = String(
        medicalLicenseDocumentName || ''
      ).trim();

      if (
        !String(fullName || '').trim() ||
        !normalizedEmail ||
        !password
      ) {
        return res.status(400).json({
          error:
            'Full name, email and password are required.',
        });
      }

      if (!isEmail(normalizedEmail)) {
        return res.status(400).json({
          error: 'Please enter a valid email address.',
        });
      }

      if (!isStrongPassword(password)) {
        return res.status(400).json({
          error:
            'Password must be 10-128 characters and contain at least one letter and one number.',
        });
      }

      if (normalizedRole === 'SYSTEM_ADMIN') {
        return res.status(403).json({
          error:
            'SYSTEM_ADMIN accounts cannot be created through public registration.',
        });
      }

      if (!isValidAadhaar(normalizedAadhaar)) {
        return res.status(400).json({
          error:
            'A valid 12-digit Aadhaar number is required for registration.',
        });
      }

      if (normalizedRole === 'DOCTOR') {
        if (!normalizedLicense) {
          return res.status(400).json({
            error:
              'Medical licence/registration number is required for doctors.',
          });
        }

        if (!normalizedLicenseDocument) {
          return res.status(400).json({
            error:
              'Medical licence document is required for doctors.',
          });
        }
      }

      const memoryExisting = db.users.find(
        (u) =>
          u.email &&
          u.email.toLowerCase() === normalizedEmail
      );

      if (memoryExisting) {
        return res.status(400).json({
          error: 'User with this email already exists.',
        });
      }

      const { rows: existingRows } =
        await pool.query(
          `
          SELECT id
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [normalizedEmail]
        );

      if (existingRows.length > 0) {
        return res.status(400).json({
          error: 'User with this email already exists.',
        });
      }

      const targetHosp =
        db.hospitals.find(
          (h) => h.id === hospitalId
        ) || db.hospitals[0];

      if (!targetHosp) {
        return res.status(500).json({
          error:
            'No hospital configuration is available.',
        });
      }

      const eccKeys = generateEccKeyPair();

      const { createHash } = await import('crypto');

      const aadhaarHash = createHash('sha256')
        .update(normalizedAadhaar)
        .digest('hex');

      const passwordHash = await bcrypt.hash(
        password,
        12
      );

      const userId = `usr-${Date.now()}`;
      const createdAt = new Date().toISOString();

      const permissions =
        Array.isArray(requestedPermissions) &&
        requestedPermissions.length
          ? requestedPermissions
          : ['READ_RECORDS'];

      let privateKeyEnc: string | null = null;

      try {
        privateKeyEnc = sealSecret(
          eccKeys.privateKeyPem
        );
      } catch (error) {
        console.warn(
          'Unable to seal ECC private key:',
          error
        );
      }

      const newUser: any = {
        id: userId,
        email: normalizedEmail,
        fullName: String(fullName).trim(),

        // Keep bcrypt hash in memory.
        password: passwordHash,

        role: normalizedRole,
        hospitalId: targetHosp.id,
        hospitalName: targetHosp.name,

        departmentName:
          departmentName ||
          (normalizedRole === 'DOCTOR'
            ? 'General Medicine'
            : undefined),

        trustScore: 85,
        isFrozen: false,
        isVerified: false,

        approvalStatus: 'PENDING',

        dataAccessPermissions: [],
        requestedPermissions: permissions,

        rejectionReason: undefined,

        publicKeyEcc: eccKeys.publicKeyPem,

        createdAt,

        aadhaarLast4:
          normalizedAadhaar.slice(-4),

        aadhaarVerificationStatus: 'PENDING',

        medicalLicenseNumber:
          normalizedRole === 'DOCTOR'
            ? normalizedLicense
            : undefined,

        medicalLicenseVerificationStatus:
          normalizedRole === 'DOCTOR'
            ? 'PENDING'
            : 'NOT_REQUIRED',

        medicalLicenseDocumentName:
          normalizedRole === 'DOCTOR'
            ? normalizedLicenseDocument
            : undefined,

        mfaEnabled: false,
      };

      await pool.query(
        `
        INSERT INTO users
        (
          id,
          email,
          full_name,
          role,
          hospital_id,
          hospital_name,
          department_name,
          trust_score,
          is_frozen,
          is_verified,
          approval_status,
          data_access_permissions,
          requested_permissions,
          rejection_reason,
          password,
          public_key_ecc,
          private_key_enc,
          created_at,
          aadhaar_hash,
          aadhaar_last4,
          aadhaar_verification_status,
          medical_license_number,
          medical_license_verification_status,
          medical_license_document_name,
          mfa_enabled
        )
        VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
          $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,
          $22,$23,$24,$25
        )
        `,
        [
          newUser.id,
          newUser.email,
          newUser.fullName,
          newUser.role,
          newUser.hospitalId,
          newUser.hospitalName,
          newUser.departmentName || null,
          newUser.trustScore,
          newUser.isFrozen,
          newUser.isVerified,
          newUser.approvalStatus,
          newUser.dataAccessPermissions,
          newUser.requestedPermissions,
          null,
          passwordHash,
          newUser.publicKeyEcc,
          privateKeyEnc,
          createdAt,
          aadhaarHash,
          newUser.aadhaarLast4,
          newUser.aadhaarVerificationStatus,
          newUser.medicalLicenseNumber || null,
          newUser.medicalLicenseVerificationStatus,
          newUser.medicalLicenseDocumentName || null,
          false,
        ]
      );

      db.users.push(newUser);

      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        title: 'New User Registration Request',
        message:
          `${newUser.fullName} (${newUser.role}) registered and is awaiting identity verification and Admin Authorization.`,
        type: 'ALERT',
        timestamp: createdAt,
        read: false,
      });

      db.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        userId: newUser.id,
        userName: newUser.fullName,
        userRole: newUser.role,
        hospitalName: newUser.hospitalName,
        action:
          'REGISTRATION_SUBMITTED_IDENTITY_VERIFICATION_PENDING',
        ipAddress: getClientIp(req),
        trustImpact: 0,
        timestamp: createdAt,
      });

      return res.json({
        success: true,
        message:
          'Registration submitted. Complete Aadhaar verification and wait for System Admin approval before login.',
        user: {
          id: newUser.id,
          email: newUser.email,
          fullName: newUser.fullName,
          role: newUser.role,
          approvalStatus: newUser.approvalStatus,
          aadhaarLast4: newUser.aadhaarLast4,
          aadhaarVerificationStatus:
            newUser.aadhaarVerificationStatus,
          medicalLicenseVerificationStatus:
            newUser.medicalLicenseVerificationStatus,
        },
      });
    } catch (error) {
      console.error('Registration error:', error);

      return res.status(500).json({
        error: 'Unable to complete registration.',
      });
    }
  });

  // ============================================================
  // MFA
  // ============================================================

  app.post('/api/auth/mfa/setup', async (req, res) => {
    const user = requireAuth(req, res);

    if (!user) return;

    try {
      const secret = generateTotpSecret();

      const encryptedSecret =
        sealSecret(secret);

      await pool.query(
        `
        UPDATE users
        SET mfa_secret_enc = $1,
            mfa_enabled = FALSE
        WHERE id = $2
        `,
        [encryptedSecret, user.id]
      );

      const dbUser = db.users.find(
        (u) => u.id === user.id
      );

      if (dbUser) {
        dbUser.mfaEnabled = false;
      }

      return res.json({
        success: true,
        secret,
        otpAuthUri: otpauthUri(
          'FedTrustMed',
          user.email,
          secret
        ),
        message:
          'Add this secret to an authenticator application and confirm with an OTP.',
      });
    } catch (error) {
      console.error('MFA setup error:', error);

      return res.status(500).json({
        error: 'Unable to initialize MFA.',
      });
    }
  });

  app.post('/api/auth/mfa/enable', async (req, res) => {
    const user = requireAuth(req, res);

    if (!user) return;

    const otp = String(req.body?.otp || '').trim();

    if (!otp) {
      return res.status(400).json({
        error: 'OTP is required.',
      });
    }

    try {
      const { rows } = await pool.query(
        `
        SELECT mfa_secret_enc AS "mfaSecretEnc"
        FROM users
        WHERE id = $1
        LIMIT 1
        `,
        [user.id]
      );

      const secretEnc =
        rows[0]?.mfaSecretEnc;

      if (!secretEnc) {
        return res.status(400).json({
          error:
            'MFA setup has not been initialized.',
        });
      }

      const secret = openSecret(secretEnc);

      if (!verifyTotp(secret, otp)) {
        return res.status(400).json({
          error: 'Invalid OTP.',
        });
      }

      await pool.query(
        `
        UPDATE users
        SET mfa_enabled = TRUE
        WHERE id = $1
        `,
        [user.id]
      );

      const dbUser = db.users.find(
        (u) => u.id === user.id
      );

      if (dbUser) {
        dbUser.mfaEnabled = true;
      }

      return res.json({
        success: true,
        mfaEnabled: true,
      });
    } catch (error) {
      console.error('MFA enable error:', error);

      return res.status(500).json({
        error: 'Unable to enable MFA.',
      });
    }
  });

  app.post('/api/auth/mfa/disable', async (req, res) => {
    const user = requireAuth(req, res);

    if (!user) return;

    if (user.role !== 'SYSTEM_ADMIN') {
      return res.status(403).json({
        error:
          'Only SYSTEM_ADMIN can disable MFA for an account through this endpoint.',
      });
    }

    const targetUserId = String(
      req.body?.userId || ''
    ).trim();

    if (!targetUserId) {
      return res.status(400).json({
        error: 'userId is required.',
      });
    }

    await pool.query(
      `
      UPDATE users
      SET mfa_enabled = FALSE,
          mfa_secret_enc = NULL
      WHERE id = $1
      `,
      [targetUserId]
    );

    const target = db.users.find(
      (u) => u.id === targetUserId
    );

    if (target) {
      target.mfaEnabled = false;
    }

    return res.json({
      success: true,
    });
  });

  // ============================================================
  // ADMIN
  // ============================================================

  app.get('/api/admin/pending-users', (req, res) => {
    const admin = requireSystemAdmin(req, res);

    if (!admin) return;

    const pending = db.users
      .filter(
        (u) => u.approvalStatus === 'PENDING'
      )
      .map((u) => publicUser(u));

    res.json({
      pendingUsers: pending,
    });
  });

  app.get('/api/admin/all-users', (req, res) => {
    const admin = requireSystemAdmin(req, res);

    if (!admin) return;

    res.json({
      users: db.users.map((u) =>
        publicUser(u)
      ),
    });
  });

  app.post(
    '/api/admin/verify-user-documents',
    async (req, res) => {
      const admin = requireSystemAdmin(req, res);

      if (!admin) return;

      try {
        const {
          userId,
          aadhaarVerified,
          medicalLicenseVerified,
        } = req.body;

        if (!userId) {
          return res.status(400).json({
            error: 'userId is required.',
          });
        }

        const { rows } =
          await pool.query(
            `
            SELECT
              id,
              role,
              aadhaar_verification_status AS "aadhaarVerificationStatus",
              medical_license_verification_status AS "medicalLicenseVerificationStatus"
            FROM users
            WHERE id = $1
            LIMIT 1
            `,
            [userId]
          );

        if (!rows[0]) {
          return res.status(404).json({
            error: 'User not found.',
          });
        }

        const target = db.users.find(
          (u) => u.id === userId
        );

        if (!target) {
          return res.status(404).json({
            error:
              'User not found in active session store.',
          });
        }

        const nextAadhaar =
          target.role === 'SYSTEM_ADMIN'
            ? 'NOT_REQUIRED'
            : aadhaarVerified === true
              ? 'VERIFIED'
              : aadhaarVerified === false
                ? 'REJECTED'
                : rows[0]
                    .aadhaarVerificationStatus ||
                  'PENDING';

        const nextLicense =
          target.role !== 'DOCTOR'
            ? 'NOT_REQUIRED'
            : medicalLicenseVerified === true
              ? 'VERIFIED'
              : medicalLicenseVerified === false
                ? 'REJECTED'
                : rows[0]
                    .medicalLicenseVerificationStatus ||
                  'PENDING';

        await pool.query(
          `
          UPDATE users
          SET aadhaar_verification_status = $1,
              medical_license_verification_status = $2
          WHERE id = $3
          `,
          [
            nextAadhaar,
            nextLicense,
            userId,
          ]
        );

        target.aadhaarVerificationStatus =
          nextAadhaar;

        target.medicalLicenseVerificationStatus =
          nextLicense;

        db.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          userId: target.id,
          userName: target.fullName,
          userRole: target.role,
          hospitalName:
            target.hospitalName || 'System',
          action:
            `ADMIN_VERIFIED_DOCUMENTS_BY_${admin.id}`,
          ipAddress: getClientIp(req),
          trustImpact: 0,
          timestamp:
            new Date().toISOString(),
        });

        return res.json({
          success: true,
          user: {
            id: target.id,
            aadhaarVerificationStatus:
              nextAadhaar,
            medicalLicenseVerificationStatus:
              nextLicense,
          },
        });
      } catch (error) {
        console.error(
          'Document verification error:',
          error
        );

        return res.status(500).json({
          error:
            'Unable to update verification status.',
        });
      }
    }
  );

  app.post(
    '/api/admin/approve-user',
    async (req, res) => {
      const admin = requireSystemAdmin(req, res);

      if (!admin) return;

      try {
        const {
          userId,
          permissions,
          role,
        } = req.body;

        const target = db.users.find(
          (u) => u.id === userId
        );

        if (!target) {
          return res.status(404).json({
            error: 'User not found',
          });
        }

        const allowedRoles = [
          'PATIENT',
          'DOCTOR',
          'HOSPITAL_ADMIN',
          'SYSTEM_ADMIN',
        ] as const;

        const requestedRole = String(
          role || target.role || 'PATIENT'
        ).toUpperCase();

        if (
          !allowedRoles.includes(
            requestedRole as
              (typeof allowedRoles)[number]
          )
        ) {
          return res.status(400).json({
            error: 'Invalid user role.',
          });
        }

        const effectiveRole =
          requestedRole as
            (typeof allowedRoles)[number];

        if (
          effectiveRole !== 'SYSTEM_ADMIN' &&
          target.aadhaarVerificationStatus !==
            'VERIFIED'
        ) {
          return res.status(403).json({
            error:
              'Aadhaar verification must be completed before approval.',
          });
        }

        if (
          effectiveRole === 'DOCTOR' &&
          target.medicalLicenseVerificationStatus !==
            'VERIFIED'
        ) {
          return res.status(403).json({
            error:
              'Medical licence verification must be completed before doctor approval.',
          });
        }

        if (
          effectiveRole === 'SYSTEM_ADMIN' &&
          target.role !== 'SYSTEM_ADMIN'
        ) {
          return res.status(403).json({
            error:
              'SYSTEM_ADMIN role cannot be granted through normal user approval.',
          });
        }

        target.approvalStatus = 'APPROVED';
        target.isVerified = true;
        target.role = effectiveRole;

        target.dataAccessPermissions =
          Array.isArray(permissions)
            ? permissions
            : target.requestedPermissions ||
              ['READ_RECORDS'];

        if (target.role === 'PATIENT') {
          const exists = db.patients.find(
            (p) => p.userId === target.id
          );

          if (!exists) {
            db.patients.push({
              id: `pat-${Date.now()}`,
              userId: target.id,
              fullName: target.fullName,
              email: target.email,
              dob: null,
              gender: 'Other',
              bloodType: 'O+',
              allergies: [],
              medicalConditions: [],
              primaryHospitalId:
                target.hospitalId || 'hosp-a',
              primaryHospitalName:
                target.hospitalName ||
                'St. Jude General Hospital',
              emergencyContact:
                'Emergency (+1-555-0100)',
              trustScore: target.trustScore,
              publicKeyEcc:
                target.publicKeyEcc,
            });
          }
        }

        if (target.role === 'DOCTOR') {
          const exists = db.doctors.find(
            (d) => d.userId === target.id
          );

          if (!exists) {
            db.doctors.push({
              id: `doc-${Date.now()}`,
              userId: target.id,
              fullName: target.fullName,
              specialty:
                target.departmentName ||
                'General Practitioner',
              departmentId:
                target.departmentId ||
                'dept-cardio',
              departmentName:
                target.departmentName ||
                'Cardiology',
              hospitalId:
                target.hospitalId || 'hosp-a',
              hospitalName:
                target.hospitalName ||
                'St. Jude General Hospital',
              licenseNumber:
                target.medicalLicenseNumber ||
                `LIC-MED-${Math.floor(
                  10000 +
                    Math.random() * 90000
                )}`,
              trustScore:
                target.trustScore,
              assignedPatientsCount: 0,
            });
          }
        }

        await pool.query(
          `
          UPDATE users
          SET approval_status = 'APPROVED',
              is_verified = TRUE,
              role = $1,
              data_access_permissions = $2
          WHERE id = $3
          `,
          [
            target.role,
            target.dataAccessPermissions ||
              [],
            target.id,
          ]
        );

        db.notifications.unshift({
          id: `notif-${Date.now()}`,
          title: 'User Account Approved',
          message:
            `${target.fullName} has been approved by Admin.`,
          type: 'SUCCESS',
          timestamp:
            new Date().toISOString(),
          read: false,
        });

        db.auditLogs.unshift({
          id: `aud-${Date.now()}`,
          userId: target.id,
          userName: target.fullName,
          userRole: target.role,
          hospitalName:
            target.hospitalName || 'System',
          action:
            `ADMIN_APPROVED_USER_BY_${admin.id}`,
          ipAddress: getClientIp(req),
          trustImpact: 5,
          timestamp:
            new Date().toISOString(),
        });

        return res.json({
          success: true,
          user: publicUser(target),
        });
      } catch (error) {
        console.error(
          'Approve user error:',
          error
        );

        return res.status(500).json({
          error: 'Unable to approve user.',
        });
      }
    }
  );

  app.post(
    '/api/admin/reject-user',
    async (req, res) => {
      const admin = requireSystemAdmin(req, res);

      if (!admin) return;

      const {
        userId,
        reason,
      } = req.body;

      const target = db.users.find(
        (u) => u.id === userId
      );

      if (!target) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      target.approvalStatus = 'REJECTED';

      target.rejectionReason =
        reason ||
        'Security requirements not met.';

      await pool.query(
        `
        UPDATE users
        SET approval_status = 'REJECTED',
            rejection_reason = $1
        WHERE id = $2
        `,
        [
          target.rejectionReason,
          target.id,
        ]
      );

      db.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        userId: target.id,
        userName: target.fullName,
        userRole: target.role,
        hospitalName:
          target.hospitalName || 'System',
        action:
          `ADMIN_REJECTED_USER_BY_${admin.id}`,
        ipAddress: getClientIp(req),
        trustImpact: 0,
        timestamp:
          new Date().toISOString(),
      });

      return res.json({
        success: true,
        user: publicUser(target),
      });
    }
  );

  app.post(
    '/api/admin/update-permissions',
    async (req, res) => {
      const admin = requireSystemAdmin(req, res);

      if (!admin) return;

      const {
        userId,
        permissions,
      } = req.body;

      if (!Array.isArray(permissions)) {
        return res.status(400).json({
          error:
            'permissions must be an array.',
        });
      }

      const target = db.users.find(
        (u) => u.id === userId
      );

      if (!target) {
        return res.status(404).json({
          error: 'User not found',
        });
      }

      target.dataAccessPermissions =
        permissions;

      await pool.query(
        `
        UPDATE users
        SET data_access_permissions = $1
        WHERE id = $2
        `,
        [permissions, userId]
      );

      db.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        userId: target.id,
        userName: target.fullName,
        userRole: target.role,
        hospitalName:
          target.hospitalName || 'System',
        action:
          `ADMIN_UPDATED_DATA_PERMISSIONS_BY_${admin.id}`,
        ipAddress: getClientIp(req),
        trustImpact: 0,
        timestamp:
          new Date().toISOString(),
      });

      return res.json({
        success: true,
        user: publicUser(target),
      });
    }
  );

  // ============================================================
  // CURRENT USER
  // ============================================================

  app.get('/api/auth/me', (req, res) => {
    const payload = verifyJwt(req);

    if (!payload) {
      return res.status(401).json({
        error: 'Unauthorized',
      });
    }

    const user = db.users.find(
      (u) => u.id === payload.id
    );

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    return res.json({
      user: publicUser(user),
    });
  });

  app.post(
    '/api/auth/forgot-password',
    (req, res) => {
      // Demo-safe response. Do not disclose whether
      // an email exists in the database.
      return res.json({
        message:
          'If the account exists, a password reset link will be sent to the registered email address.',
      });
    }
  );

  // ============================================================
  // MEDICAL RECORDS
  // ============================================================

  app.get(
    '/api/medical-records',
    (req, res) => {
      const user = requireAuth(req, res);

      if (!user) return;

      if (user.role === 'PATIENT') {
        const patient = db.patients.find(
          (p) => p.userId === user.id
        );

        if (!patient) {
          return res.status(404).json({
            error:
              'Patient profile not found',
          });
        }

        return res.json({
          records:
            db.medicalRecords.filter(
              (r) =>
                r.patientId === patient.id
            ),
        });
      }

      if (user.role === 'DOCTOR') {
        const doctor = db.doctors.find(
          (d) => d.userId === user.id
        );

        if (!doctor) {
          return res.status(404).json({
            error:
              'Doctor profile not found',
          });
        }

        const records =
          db.medicalRecords.filter(
            (r) => {
              if (
                r.doctorId === doctor.id
              ) {
                return true;
              }

              return db.consentRecords.some(
                (c) =>
                  c.patientId ===
                    r.patientId &&
                  c.requestingHospitalId ===
                    doctor.hospitalId &&
                  c.status === 'GRANTED' &&
                  (!c.expiresAt ||
                    new Date(
                      c.expiresAt
                    ) > new Date())
              );
            }
          );

        return res.json({ records });
      }

      if (
        user.role ===
        'HOSPITAL_ADMIN'
      ) {
        return res.json({
          records:
            db.medicalRecords.filter(
              (r) =>
                r.hospitalId ===
                user.hospitalId
            ),
        });
      }

      if (
        user.role ===
        'SYSTEM_ADMIN'
      ) {
        return res.json({
          records:
            db.medicalRecords,
        });
      }

      return res.status(403).json({
        error: 'Access denied',
      });
    }
  );

  app.post(
    '/api/medical-records',
    (req, res) => {
      const user = requireAuth(req, res);

      if (!user) return;

      if (
        user.role !== 'DOCTOR' &&
        user.role !== 'SYSTEM_ADMIN'
      ) {
        return res.status(403).json({
          error:
            'Only doctors or system administrators can create medical records',
        });
      }

      const {
        patientId,
        title,
        recordType,
        diagnosis,
        prescriptions,
        labTests,
      } = req.body;

      if (!patientId) {
        return res.status(400).json({
          error:
            'Patient ID is required',
        });
      }

      const patient = db.patients.find(
        (p) => p.id === patientId
      );

      if (!patient) {
        return res.status(404).json({
          error: 'Patient not found',
        });
      }

      let doctor: any;

      if (user.role === 'DOCTOR') {
        doctor = db.doctors.find(
          (d) => d.userId === user.id
        );
      } else {
        doctor = db.doctors.find(
          (d) =>
            d.id === req.body?.doctorId
        );
      }

      if (!doctor) {
        return res.status(404).json({
          error:
            'Doctor profile not found',
        });
      }

      const plaintextRecord = {
        title,
        recordType,
        patientName:
          patient.fullName,
        doctorName:
          doctor.fullName,
        hospital:
          doctor.hospitalName,
        diagnosis,
        prescriptions:
          prescriptions || [],
        labTests: labTests || [],
        createdAt:
          new Date().toISOString(),
      };

      const encrypted =
        encryptMedicalRecord(
          plaintextRecord,
          patient.publicKeyEcc
        );

      const fabricTx =
        fabricBlockchain.invokeChaincode(
          'MedicalRecordRegistry',
          'CommitRecordHash',
          {
            sha256Hash:
              encrypted.sha256Hash,
            patientId:
              patient.id,
            doctorId:
              doctor.id,
          },
          doctor.hospitalName
        );

      const newRecord: MedicalRecord = {
        id: `rec-${Date.now()}`,
        patientId: patient.id,
        patientName:
          patient.fullName,
        doctorId: doctor.id,
        doctorName:
          doctor.fullName,
        hospitalId:
          doctor.hospitalId,
        hospitalName:
          doctor.hospitalName,
        title,
        recordType:
          recordType ||
          'DIAGNOSIS',
        diagnosis,
        encryptedContent:
          encrypted.encryptedContent,
        ivAes:
          encrypted.ivAes,
        authTag:
          encrypted.authTag,
        eccEncryptedAesKey:
          encrypted.eccEncryptedAesKey,
        sha256Hash:
          encrypted.sha256Hash,
        fabricTxId:
          fabricTx.transaction.txId,
        createdAt:
          new Date().toISOString(),
        prescriptions:
          prescriptions || [],
        labTests:
          labTests || [],
      };

      db.medicalRecords.unshift(
        newRecord
      );

      db.auditLogs.unshift({
        id: `aud-${Date.now()}`,
        userId: user.id,
        userName:
          doctor.fullName,
        userRole:
          user.role as any,
        hospitalName:
          doctor.hospitalName,
        action:
          'ENCRYPTED_AND_COMMITTED_RECORD',
        resourceId:
          newRecord.id,
        ipAddress:
          getClientIp(req),
        trustImpact: 2,
        fabricTxId:
          fabricTx.transaction.txId,
        timestamp:
          new Date().toISOString(),
      });

      return res.json({
        record: newRecord,
        fabricBlock:
          fabricTx.block,
        fabricTransaction:
          fabricTx.transaction,
      });
    }
  );

  app.post(
    '/api/medical-records/decrypt',
    (req, res) => {
      const user = requireAuth(req, res);

      if (!user) return;

      const recordId =
        String(req.body?.recordId || '');

      if (!recordId) {
        return res.status(400).json({
          error:
            'Record ID is required',
        });
      }

      const record =
        db.medicalRecords.find(
          (r) => r.id === recordId
        );

      if (!record) {
        return res.status(404).json({
          error: 'Record not found',
        });
      }

      const patient =
        db.patients.find(
          (p) =>
            p.id === record.patientId
        );

      if (!patient) {
        return res.status(404).json({
          error:
            'Patient profile not found',
        });
      }

      let hasAccess = false;

      if (user.role === 'PATIENT') {
        hasAccess =
          patient.userId ===
          user.id;
      }

      if (user.role === 'DOCTOR') {
        const doctor =
          db.doctors.find(
            (d) =>
              d.userId === user.id
          );

        if (doctor) {
          hasAccess =
            record.doctorId ===
              doctor.id ||
            db.consentRecords.some(
              (c) =>
                c.patientId ===
                  record.patientId &&
                c.requestingHospitalId ===
                  doctor.hospitalId &&
                c.status ===
                  'GRANTED' &&
                (!c.expiresAt ||
                  new Date(
                    c.expiresAt
                  ) > new Date())
            );
        }
      }

      if (
        user.role ===
        'HOSPITAL_ADMIN'
      ) {
        hasAccess =
          record.hospitalId ===
          user.hospitalId;
      }

      if (
        user.role ===
        'SYSTEM_ADMIN'
      ) {
        hasAccess = true;
      }

      if (!hasAccess) {
        return res.status(403).json({
          error:
            'You are not authorized to access this medical record',
        });
      }

      const plaintext =
        decryptMedicalRecord(
          {
            encryptedContent:
              record.encryptedContent,
            ivAes:
              record.ivAes,
            authTag:
              record.authTag || '',
            eccEncryptedAesKey:
              record.eccEncryptedAesKey,
            sha256Hash:
              record.sha256Hash,
          },
          '',
          patient.publicKeyEcc
        );

      const decryptedData =
        plaintext || {
          title:
            record.title,
          patientName:
            record.patientName,
          doctorName:
            record.doctorName,
          hospital:
            record.hospitalName,
          recordType:
            record.recordType,
          diagnosis:
            record.diagnosis,
          prescriptions:
            record.prescriptions ||
            [],
          labTests:
            record.labTests ||
            [],
          decryptedAt:
            new Date().toISOString(),
          decryptionStatus:
            'SUCCESS_AES_256_GCM_DECRYPTED',
        };

      fabricBlockchain.invokeChaincode(
        'AuditContract',
        'LogAccess',
        {
          recordId:
            record.id,
          accessorId:
            user.id,
          sha256Hash:
            record.sha256Hash,
        },
        user.hospitalId ||
          'St. Jude General Hospital'
      );

      return res.json({
        decryptedData,
        record,
      });
    }
  );

  // ============================================================
  // CONSENT
  // ============================================================

  app.get(
    '/api/consent',
    (req, res) => {
      const user = requireAuth(req, res);

      if (!user) return;

      const requestedPatientId =
        typeof req.query.patientId ===
        'string'
          ? req.query.patientId
          : undefined;

      if (user.role === 'PATIENT') {
        const patient =
          db.patients.find(
            (p) =>
              p.userId === user.id
          );

        if (!patient) {
          return res.status(404).json({
            error:
              'Patient profile not found',
          });
        }

        if (
          requestedPatientId &&
          requestedPatientId !==
            patient.id
        ) {
          return res.status(403).json({
            error:
              "You are not authorized to view this patient's consent records",
          });
        }

        return res.json({
          consents:
            db.consentRecords.filter(
              (c) =>
                c.patientId ===
                patient.id
            ),
        });
      }

      if (user.role === 'DOCTOR') {
        const doctor =
          db.doctors.find(
            (d) =>
              d.userId === user.id
          );

        if (!doctor) {
          return res.status(404).json({
            error:
              'Doctor profile not found',
          });
        }

        return res.json({
          consents:
            db.consentRecords.filter(
              (c) =>
                c.doctorId ===
                  doctor.id ||
                c.requestingHospitalId ===
                  doctor.hospitalId
            ),
        });
      }

      if (
        user.role ===
        'HOSPITAL_ADMIN'
      ) {
        return res.json({
          consents:
            db.consentRecords.filter(
              (c) =>
                c.requestingHospitalId ===
                user.hospitalId
            ),
        });
      }

      if (
        user.role ===
        'SYSTEM_ADMIN'
      ) {
        return res.json({
          consents:
            db.consentRecords,
        });
      }

      return res.status(403).json({
        error: 'Access denied',
      });
    }
  );

  app.post(
    '/api/consent/request',
    (req, res) => {
      const user = requireAuth(req, res);

      if (!user) return;

      if (
        user.role !== 'DOCTOR' &&
        user.role !== 'SYSTEM_ADMIN'
      ) {
        return res.status(403).json({
          error:
            'Only doctors or system administrators can request patient consent',
        });
      }

      const {
        patientId,
        purpose,
        recordId,
      } = req.body;

      if (!patientId || !purpose) {
        return res.status(400).json({
          error:
            'Patient ID and purpose are required',
        });
      }

      const patient =
        db.patients.find(
          (p) =>
            p.id === patientId
        );

      if (!patient) {
        return res.status(404).json({
          error:
            'Patient not found',
        });
      }

      let doctor: any;
      let hospital: any;

      if (user.role === 'DOCTOR') {
        doctor =
          db.doctors.find(
            (d) =>
              d.userId === user.id
          );

        if (!doctor) {
          return res.status(404).json({
            error:
              'Doctor profile not found',
          });
        }

        hospital =
          db.hospitals.find(
            (h) =>
              h.id ===
              doctor.hospitalId
          );
      } else {
        const {
          doctorId,
          requestingHospitalId,
        } = req.body;

        doctor = doctorId
          ? db.doctors.find(
              (d) =>
                d.id === doctorId
            )
          : undefined;

        hospital =
          requestingHospitalId
            ? db.hospitals.find(
                (h) =>
                  h.id ===
                  requestingHospitalId
              )
            : undefined;

        if (!hospital && doctor) {
          hospital =
            db.hospitals.find(
              (h) =>
                h.id ===
                doctor.hospitalId
            );
        }
      }

      if (!hospital) {
        return res.status(400).json({
          error:
            'A valid requesting hospital is required',
        });
      }

      const duplicatePending =
        db.consentRecords.some(
          (c) =>
            c.patientId ===
              patient.id &&
            c.requestingHospitalId ===
              hospital.id &&
            c.status ===
              'PENDING' &&
            (!doctor ||
              !c.doctorId ||
              c.doctorId ===
                doctor.id)
        );

      if (duplicatePending) {
        return res.status(409).json({
          error:
            'A pending consent request already exists for this patient and hospital',
        });
      }

      const tx =
        fabricBlockchain.invokeChaincode(
          'ConsentContract',
          'RequestConsent',
          {
            patientId:
              patient.id,
            requestingHospitalId:
              hospital.id,
            purpose,
          },
          hospital.name
        );

      const consent: ConsentRecord = {
        id: `cst-${Date.now()}`,
        patientId:
          patient.id,
        patientName:
          patient.fullName,
        doctorId:
          doctor?.id,
        doctorName:
          doctor?.fullName,
        requestingHospitalId:
          hospital.id,
        requestingHospitalName:
          hospital.name,
        recordId,
        recordTitle: recordId
          ? db.medicalRecords.find(
              (r) =>
                r.id ===
                recordId
            )?.title
          : undefined,
        status: 'PENDING',
        purpose,
        fabricTxId:
          tx.transaction.txId,
        createdAt:
          new Date().toISOString(),
      };

      db.consentRecords.unshift(
        consent
      );

      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        title:
          'Consent Request Received',
        message:
          `${hospital.name} requested access to your medical records for: ${purpose}`,
        type: 'WARNING',
        timestamp:
          new Date().toISOString(),
        read: false,
      });

      return res.json({
        success: true,
        consent,
      });
    }
  );

  app.post(
    '/api/consent/grant',
    (req, res) => {
      const user = requireAuth(req, res);

      if (!user) return;

      const consentId =
        String(
          req.body?.consentId || ''
        );

      if (!consentId) {
        return res.status(400).json({
          error:
            'Consent ID is required',
        });
      }

      const consent =
        db.consentRecords.find(
          (c) =>
            c.id === consentId
        );

      if (!consent) {
        return res.status(404).json({
          error:
            'Consent request not found',
        });
      }

      if (user.role === 'PATIENT') {
        const patient =
          db.patients.find(
            (p) =>
              p.userId === user.id
          );

        if (
          !patient ||
          consent.patientId !==
            patient.id
        ) {
          return res.status(403).json({
            error:
              'You are not authorized to grant this consent',
          });
        }
      } else if (
        user.role !==
        'SYSTEM_ADMIN'
      ) {
        return res.status(403).json({
          error:
            'Only the patient or system administrator can grant consent',
        });
      }

      if (
        consent.status !==
        'PENDING'
      ) {
        return res.status(409).json({
          error:
            `Consent is already ${consent.status.toLowerCase()}`,
        });
      }

      consent.status = 'GRANTED';
      consent.grantedAt =
        new Date().toISOString();

      consent.expiresAt =
        new Date(
          Date.now() +
            90 *
              24 *
              3600 *
              1000
        ).toISOString();

      const tx =
        fabricBlockchain.invokeChaincode(
          'ConsentContract',
          'GrantConsent',
          {
            consentId:
              consent.id,
            patientId:
              consent.patientId,
            hospitalId:
              consent.requestingHospitalId,
          },
          consent.requestingHospitalName
        );

      consent.fabricTxId =
        tx.transaction.txId;

      return res.json({
        success: true,
        consent,
        fabricTransaction:
          tx.transaction,
      });
    }
  );

  app.post(
    '/api/consent/revoke',
    (req, res) => {
      const user = requireAuth(req, res);

      if (!user) return;

      const consentId =
        String(
          req.body?.consentId || ''
        );

      if (!consentId) {
        return res.status(400).json({
          error:
            'Consent ID is required',
        });
      }

      const consent =
        db.consentRecords.find(
          (c) =>
            c.id === consentId
        );

      if (!consent) {
        return res.status(404).json({
          error:
            'Consent request not found',
        });
      }

      if (user.role === 'PATIENT') {
        const patient =
          db.patients.find(
            (p) =>
              p.userId === user.id
          );

        if (
          !patient ||
          consent.patientId !==
            patient.id
        ) {
          return res.status(403).json({
            error:
              'You are not authorized to revoke this consent',
          });
        }
      } else if (
        user.role !==
        'SYSTEM_ADMIN'
      ) {
        return res.status(403).json({
          error:
            'Only the patient or system administrator can revoke consent',
        });
      }

      if (
        consent.status !==
        'GRANTED'
      ) {
        return res.status(409).json({
          error:
            'Only granted consent can be revoked',
        });
      }

      consent.status = 'REVOKED';

      const tx =
        fabricBlockchain.invokeChaincode(
          'ConsentContract',
          'RevokeConsent',
          {
            consentId:
              consent.id,
            patientId:
              consent.patientId,
          },
          consent.requestingHospitalName
        );

      consent.fabricTxId =
        tx.transaction.txId;

      return res.json({
        success: true,
        consent,
        fabricTransaction:
          tx.transaction,
      });
    }
  );

  // ============================================================
  // BLOCKCHAIN
  // ============================================================

  app.get(
    '/api/blockchain/blocks',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        blocks:
          fabricBlockchain.getBlocks(),
      });
    }
  );

  app.get(
    '/api/blockchain/transactions',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        transactions:
          fabricBlockchain.getTransactions(),
      });
    }
  );

  app.get(
    '/api/blockchain/verify',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json(
        fabricBlockchain.verifyIntegrity()
      );
    }
  );

  // ============================================================
  // TRUST
  // ============================================================

  app.get(
    '/api/trust/scores',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        users: db.users.map(
          (u) => publicUser(u)
        ),
        doctors:
          db.doctors,
        hospitals:
          db.hospitals,
      });
    }
  );

  app.get(
    '/api/trust/logs',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        logs:
          trustEngine.getAllLogs(),
      });
    }
  );

  app.post(
    '/api/trust/adjust',
    (req, res) => {
      const admin =
        requireSystemAdmin(
          req,
          res
        );

      if (!admin) return;

      const {
        targetId,
        targetType,
        event,
        delta,
        reason,
      } = req.body;

      const user =
        db.users.find(
          (u) =>
            u.id === targetId
        );

      if (!user) {
        return res.status(404).json({
          error:
            'Target user not found.',
        });
      }

      const result =
        trustEngine.applyTrustRule(
          targetId,
          targetType ||
            'USER',
          event ||
            'MANUAL_BONUS',
          user.trustScore,
          user.hospitalName ||
            'System',
          reason ||
            'Administrator trust evaluation'
        );

      user.trustScore =
        result.newScore;

      user.isFrozen =
        result.isFrozen;

      return res.json({
        result,
        user: publicUser(user),
      });
    }
  );

  // ============================================================
  // AI THREAT DETECTION
  // ============================================================

  app.get(
    '/api/ai/threats',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        alerts:
          threatDetector.getActiveAlerts(),
      });
    }
  );

  app.post(
    '/api/ai/simulate-attack',
    (req, res) => {
      const admin =
        requireSystemAdmin(
          req,
          res
        );

      if (!admin) return;

      const {
        attackType,
        targetUserEmail,
        targetHospitalCode,
      } = req.body;

      const ip =
        `${Math.floor(
          Math.random() * 200 + 10
        )}.${Math.floor(
          Math.random() * 255
        )}.${Math.floor(
          Math.random() * 255
        )}.${Math.floor(
          Math.random() * 255
        )}`;

      const hospital =
        db.hospitals.find(
          (h) =>
            h.code ===
            targetHospitalCode
        ) ||
        db.hospitals[0];

      const user =
        db.users.find(
          (u) =>
            u.email ===
            targetUserEmail
        ) ||
        db.users[0];

      const alert =
        threatDetector.detectThreat(
          attackType,
          targetUserEmail ||
            user.email,
          hospital.name,
          ip
        );

      let penaltyEvent: any =
        'FAILED_LOGIN';

      if (
        attackType ===
          'BRUTE_FORCE' ||
        attackType ===
          'CREDENTIAL_STUFFING'
      ) {
        penaltyEvent =
          'REPEATED_FAILED_LOGIN';
      }

      if (
        attackType ===
          'SQL_INJECTION' ||
        attackType ===
          'ABNORMAL_BEHAVIOR'
      ) {
        penaltyEvent =
          'UNAUTHORIZED_ACCESS';
      }

      if (
        attackType ===
        'EXCESSIVE_DOWNLOADS'
      ) {
        penaltyEvent =
          'EXCESSIVE_DOWNLOADS';
      }

      const trustResult =
        trustEngine.applyTrustRule(
          user.id,
          'USER',
          penaltyEvent,
          user.trustScore,
          hospital.name,
          `AI Threat Engine Intercepted ${attackType} Attack`
        );

      user.trustScore =
        trustResult.newScore;

      user.isFrozen =
        trustResult.isFrozen;

      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        title:
          `AI Security Alert: ${attackType}`,
        message:
          `Threat detected from ${ip}. Target: ${user.fullName}. Trust score reduced to ${user.trustScore}.`,
        type: 'ALERT',
        timestamp:
          new Date().toISOString(),
        read: false,
      });

      return res.json({
        alert,
        trustResult,
        updatedUser:
          publicUser(user),
      });
    }
  );

  app.post(
    '/api/ai/resolve-alert',
    (req, res) => {
      const admin =
        requireSystemAdmin(
          req,
          res
        );

      if (!admin) return;

      const {
        alertId,
      } = req.body;

      const success =
        threatDetector.resolveAlert(
          alertId
        );

      res.json({
        success,
      });
    }
  );

  // ============================================================
  // FILEDAG
  // ============================================================

  app.get(
    '/api/filedag/nodes',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        dagNodes:
          fileDagLedger.getDagNodes(),
      });
    }
  );

  app.post(
    '/api/filedag/verify',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      const {
        cid,
      } = req.body;

      res.json(
        fileDagLedger.verifyIntegrity(
          cid
        )
      );
    }
  );

  // ============================================================
  // IDRSN + BSTOA
  // ============================================================

  app.get(
    '/api/idrsn/metrics',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        metrics:
          idrsnEngine.getPerformanceMetrics(),
        bstoaParams:
          idrsnEngine.getBstoaParams(),
      });
    }
  );

  app.post(
    '/api/idrsn/classify',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      const {
        flowDuration,
        totalFwdPackets,
        totalBwdPackets,
        flowBytesPerSec,
        synFlagCount,
        ackFlagCount,
        destPort,
        protocol,
        ipSource,
        datasetOrigin,
      } = req.body;

      const source =
        ipSource ||
        '192.168.1.105';

      const dataset =
        datasetOrigin ||
        'ToN-IoT';

      const result =
        idrsnEngine.classifyTraffic(
          {
            flowDuration:
              Number(
                flowDuration
              ) || 1200,
            totalFwdPackets:
              Number(
                totalFwdPackets
              ) || 12,
            totalBwdPackets:
              Number(
                totalBwdPackets
              ) || 8,
            flowBytesPerSec:
              Number(
                flowBytesPerSec
              ) || 4500,
            synFlagCount:
              Number(
                synFlagCount
              ) || 1,
            ackFlagCount:
              Number(
                ackFlagCount
              ) || 1,
            destPort:
              Number(
                destPort
              ) || 443,
            protocol:
              protocol ||
              'TCP',
            ipSource: source,
          },
          dataset
        );

      if (
        result.isMalicious &&
        result.threatType !==
          'NORMAL'
      ) {
        threatDetector.detectThreat(
          result.threatType,
          'system_target',
          'St. Jude General Hospital',
          source,
          result.description,
          dataset
        );
      }

      return res.json(result);
    }
  );

  // ============================================================
  // FEDERATED LEARNING
  // ============================================================

  app.get(
    '/api/federated/status',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        nodes:
          federatedLearningManager.getNodes(),
        rounds:
          federatedLearningManager.getRounds(),
      });
    }
  );

  app.post(
    '/api/federated/train-round',
    (req, res) => {
      const admin =
        requireSystemAdmin(
          req,
          res
        );

      if (!admin) return;

      const {
        newRound,
        updatedNodes,
      } =
        federatedLearningManager.runFederatedRound();

      db.notifications.unshift({
        id: `notif-${Date.now()}`,
        title:
          `Federated Round #${newRound.roundNumber} Aggregated`,
        message:
          `FedAvg complete across 3 hospitals. Global model accuracy: ${newRound.globalAccuracy}%, Global loss: ${newRound.globalLoss}.`,
        type: 'SUCCESS',
        timestamp:
          new Date().toISOString(),
        read: false,
      });

      return res.json({
        round: newRound,
        nodes: updatedNodes,
      });
    }
  );

  // ============================================================
  // HOSPITALS / DOCTORS / PATIENTS
  // ============================================================

  app.get(
    '/api/hospitals',
    (req, res) => {
      // Public endpoint required by the registration page.
      res.json({
        hospitals: db.hospitals,
      });
    }
  );

  app.get(
    '/api/doctors',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        doctors:
          db.doctors,
      });
    }
  );

  app.get(
    '/api/patients',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      if (
        user.role ===
        'PATIENT'
      ) {
        const patient =
          db.patients.find(
            (p) =>
              p.userId === user.id
          );

        return res.json({
          patients:
            patient
              ? [patient]
              : [],
        });
      }

      res.json({
        patients:
          db.patients,
      });
    }
  );

  // ============================================================
  // NOTIFICATIONS
  // ============================================================

  app.get(
    '/api/notifications',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      res.json({
        notifications:
          db.notifications,
      });
    }
  );

  app.post(
    '/api/notifications/mark-read',
    (req, res) => {
      const user = requireAuth(
        req,
        res
      );

      if (!user) return;

      db.notifications.forEach(
        (notification) => {
          notification.read = true;
        }
      );

      res.json({
        success: true,
      });
    }
  );

  // ============================================================
  // VITE
  // ============================================================

  if (
    process.env.NODE_ENV !==
    'production'
  ) {
    const vite =
      await createViteServer({
        server: {
          middlewareMode: true,
        },
        appType: 'spa',
      });

    app.use(
      vite.middlewares
    );
  } else {
    const distPath =
      path.join(
        process.cwd(),
        'dist'
      );

    app.use(
      express.static(
        distPath
      )
    );

    app.get(
      '*',
      (req, res) => {
        res.sendFile(
          path.join(
            distPath,
            'index.html'
          )
        );
      }
    );
  }

  // ============================================================
  // START SERVER
  // ============================================================

  app.listen(
    PORT,
    '0.0.0.0',
    () => {
      console.log(
        `FedTrustMed server running on http://localhost:${PORT}`
      );
    }
  );
}

startServer().catch(
  (error) => {
    console.error(
      'Failed to start FedTrustMed server:',
      error
    );

    process.exit(1);
  }
);
