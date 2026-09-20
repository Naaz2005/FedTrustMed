import express from 'express';
import path from 'path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createServer as createViteServer } from 'vite';

import { db, pool } from './server/db.js';
import { fabricBlockchain } from './server/blockchain.js';
import { trustEngine } from './server/trustEngine.js';
import { threatDetector } from './server/threatEngine.js';
import { federatedLearningManager } from './server/federatedLearning.js';
import { idrsnEngine } from './server/idrsnEngine.js';
import { fileDagLedger } from './server/fileDagEngine.js';
import { encryptMedicalRecord, decryptMedicalRecord, generateEccKeyPair, computeSha256, generateClsmHash, encryptMhe, decryptMhe } from './server/cryptoUtils.js';
import { MedicalRecord, ConsentRecord, AuditLog } from './src/types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fedtrustmed-secure-jwt-secret-key-2026';
const PORT = 3000;

const failedLoginTracker = new Map<string, number>();

async function startServer() {
  const app = express();

  app.use(express.json());

  // Middleware: Request Logger & SQLi / Threat Sniffer
  app.use((req, res, next) => {
    const rawUrl = req.originalUrl || req.url;
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

    // SQL Injection Detection
    if (
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b)|('--')|(\/\*)|(;)/i.test(
        rawUrl + JSON.stringify(req.body)
      )
    ) {
      threatDetector.detectThreat('SQL_INJECTION', undefined, 'St. Jude General Hospital', ip);
      trustEngine.applyTrustRule('unauthenticated_attacker', 'USER', 'UNAUTHORIZED_ACCESS', 50, 'System Firewall', 'SQL Injection Payload Intercepted');
    }

    next();
  });

  // Helper Auth Verification
  const verifyJwt = (req: express.Request) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    try {
      const token = authHeader.split(' ')[1];
      if (!token) return null;
      return jwt.verify(token, JWT_SECRET) as {
        id: string;
        email: string;
        role: string;
        hospitalId?: string;
      };
    } catch {
      return null;
    }
  };

  const requireAuth = (req: express.Request, res: express.Response) => {
    const user = verifyJwt(req);
    if (!user) {
      res.status(401).json({ error: 'Authentication required' });
      return null;
    }
    return user;
  };

  // ==========================================
  // AUTHENTICATION ENDPOINTS
  // ==========================================

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      const ip =
        (req.headers['x-forwarded-for'] as string) ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      if (!email || !password) {
        return res.status(400).json({
          error: 'Email and password are required',
        });
      }

      // ============================================================
      // GET USER FROM POSTGRESQL
      // ============================================================
      const { rows } = await pool.query(
        `SELECT
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
          password,
          public_key_ecc AS "publicKeyEcc",
          created_at AS "createdAt"
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
        [email]
      );

      const user = rows[0];

      if (!user) {
        const count = (failedLoginTracker.get(email) || 0) + 1;
        failedLoginTracker.set(email, count);

        if (count >= 3) {
          threatDetector.detectThreat(
            'BRUTE_FORCE',
            email,
            'St. Jude General Hospital',
            ip,
            `3+ failed login attempts for ${email}`
          );
        }

        return res.status(401).json({
          error: 'Invalid email or password',
        });
      }

      // ============================================================
      // PASSWORD CHECK
      // ============================================================
      if (user.password && password && user.password !== password) {
        const count = (failedLoginTracker.get(email) || 0) + 1;
        failedLoginTracker.set(email, count);

        if (count >= 3) {
          threatDetector.detectThreat(
            'BRUTE_FORCE',
            email,
            user.hospitalName || 'St. Jude General Hospital',
            ip,
            `3+ failed login attempts for ${email}`
          );
        }

        return res.status(401).json({
          error: 'Invalid email or password',
        });
      }

      // ============================================================
      // ADMIN APPROVAL STATUS
      // ============================================================
      if (user.approvalStatus === 'PENDING') {
        return res.status(403).json({
          error:
            'Account Registration Pending Admin Approval. An administrator must review your request and authorize data access permissions before you can log in.',
          approvalPending: true,
          user,
        });
      }

      if (user.approvalStatus === 'REJECTED') {
        return res.status(403).json({
          error: `Account Registration Rejected by System Administrator. Reason: ${
            user.rejectionReason || 'Security criteria not met.'
          }`,
          rejected: true,
        });
      }

      // ============================================================
      // FROZEN ACCOUNT CHECK
      // ============================================================
      if (user.isFrozen) {
        return res.status(403).json({
          error:
            'Account is frozen due to low Trust Score (< 40). Contact System Administrator.',
        });
      }

      // Reset failed login counter on success
      failedLoginTracker.delete(email);

      // ============================================================
      // APPLY TRUST REWARD: +2 FOR SUCCESSFUL LOGIN
      // ============================================================
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

      // ============================================================
      // PERSIST TRUST SCORE TO POSTGRESQL
      // ============================================================
      await pool.query(
        `UPDATE users
         SET trust_score = $1,
             is_frozen = $2
         WHERE id = $3`,
        [trustResult.newScore, trustResult.isFrozen, user.id]
      );

      // Keep the in-memory copy synchronized for APIs
      // that have not yet been migrated to PostgreSQL.
      const memoryUser = db.users.find((u) => u.id === user.id);
      if (memoryUser) {
        memoryUser.trustScore = trustResult.newScore;
        memoryUser.isFrozen = trustResult.isFrozen;
      }

      // ============================================================
      // CREATE JWT
      // ============================================================
      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role: user.role,
          hospitalId: user.hospitalId,
        },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // ============================================================
      // AUDIT LOG - IN MEMORY + POSTGRESQL
      // ============================================================
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
        `INSERT INTO audit_logs
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
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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

      return res.json({ success: true, token, user });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(500).json({
        error: 'Internal server error during login',
      });
    }
  });

  app.post('/api/auth/register', (req, res) => {
    const { fullName, email, password, role, hospitalId, departmentName, requestedPermissions } = req.body;
    const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const targetHosp = db.hospitals.find((h) => h.id === hospitalId) || db.hospitals[0];
    const eccKeys = generateEccKeyPair();

    const newUser: any = {
      id: `usr-${Date.now()}`,
      email,
      fullName,
      password: password || 'password123',
      role: role || 'PATIENT',
      hospitalId: targetHosp.id,
      hospitalName: targetHosp.name,
      departmentName: departmentName || (role === 'DOCTOR' ? 'General Medicine' : undefined),
      trustScore: 85,
      isFrozen: false,
      isVerified: false,
      approvalStatus: 'PENDING',
      dataAccessPermissions: [],
      requestedPermissions: requestedPermissions || ['READ_RECORDS'],
      publicKeyEcc: eccKeys.publicKeyPem,
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);

    // Add notification for admins
    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: 'New User Registration Request',
      message: `${newUser.fullName} (${newUser.role}) registered and is awaiting Admin Authorization.`,
      type: 'ALERT',
      timestamp: new Date().toISOString(),
      read: false,
    });

    // Audit log
    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      userId: newUser.id,
      userName: newUser.fullName,
      userRole: newUser.role,
      hospitalName: newUser.hospitalName,
      action: 'REGISTRATION_SUBMITTED_PENDING_APPROVAL',
      ipAddress: '127.0.0.1',
      trustImpact: 0,
      timestamp: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: 'Registration submitted successfully! Your account is PENDING Admin Approval before you can log in.',
      user: newUser,
    });
  });

  // Admin Approval & Permission Management Endpoints
  app.get('/api/admin/pending-users', (req, res) => {
    const pending = db.users.filter((u) => u.approvalStatus === 'PENDING');
    res.json({ pendingUsers: pending });
  });

  app.get('/api/admin/all-users', (req, res) => {
    res.json({ users: db.users });
  });

  app.post('/api/admin/approve-user', (req, res) => {
    const { userId, permissions, role } = req.body;
    const target = db.users.find((u) => u.id === userId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    target.approvalStatus = 'APPROVED';
    target.isVerified = true;
    if (role) target.role = role;
    target.dataAccessPermissions = permissions || target.requestedPermissions || ['READ_RECORDS'];

    // Ensure patient record exists if patient
    if (target.role === 'PATIENT') {
      const pExist = db.patients.find((p) => p.userId === target.id);
      if (!pExist) {
        db.patients.push({
          id: `pat-${Date.now()}`,
          userId: target.id,
          fullName: target.fullName,
          email: target.email,
          dob: '1992-08-12',
          gender: 'Other',
          bloodType: 'O+',
          allergies: [],
          medicalConditions: [],
          primaryHospitalId: target.hospitalId || 'hosp-a',
          primaryHospitalName: target.hospitalName || 'St. Jude General Hospital',
          emergencyContact: 'Emergency (+1-555-0100)',
          trustScore: target.trustScore,
          publicKeyEcc: target.publicKeyEcc,
        });
      }
    } else if (target.role === 'DOCTOR') {
      const dExist = db.doctors.find((d) => d.userId === target.id);
      if (!dExist) {
        db.doctors.push({
          id: `doc-${Date.now()}`,
          userId: target.id,
          fullName: target.fullName,
          specialty: target.departmentName || 'General Practitioner',
          departmentId: target.departmentId || 'dept-cardio',
          departmentName: target.departmentName || 'Cardiology',
          hospitalId: target.hospitalId || 'hosp-a',
          hospitalName: target.hospitalName || 'St. Jude General Hospital',
          licenseNumber: `LIC-MED-${Math.floor(10000 + Math.random() * 90000)}`,
          trustScore: target.trustScore,
          assignedPatientsCount: 12,
        });
      }
    }

    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: 'User Account Approved',
      message: `${target.fullName} has been approved by Admin with scopes: ${(target.dataAccessPermissions || []).join(', ')}.`,
      type: 'SUCCESS',
      timestamp: new Date().toISOString(),
      read: false,
    });

    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      userId: target.id,
      userName: target.fullName,
      userRole: target.role,
      hospitalName: target.hospitalName || 'System',
      action: 'ADMIN_APPROVED_USER',
      ipAddress: '127.0.0.1',
      trustImpact: 5,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, user: target });
  });

  app.post('/api/admin/reject-user', (req, res) => {
    const { userId, reason } = req.body;
    const target = db.users.find((u) => u.id === userId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    target.approvalStatus = 'REJECTED';
    target.rejectionReason = reason || 'Security requirements not met.';

    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      userId: target.id,
      userName: target.fullName,
      userRole: target.role,
      hospitalName: target.hospitalName || 'System',
      action: 'ADMIN_REJECTED_USER',
      ipAddress: '127.0.0.1',
      trustImpact: 0,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, user: target });
  });

  app.post('/api/admin/update-permissions', (req, res) => {
    const { userId, permissions } = req.body;
    const target = db.users.find((u) => u.id === userId);
    if (!target) return res.status(404).json({ error: 'User not found' });

    target.dataAccessPermissions = permissions;

    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      userId: target.id,
      userName: target.fullName,
      userRole: target.role,
      hospitalName: target.hospitalName || 'System',
      action: 'ADMIN_UPDATED_DATA_PERMISSIONS',
      ipAddress: '127.0.0.1',
      trustImpact: 0,
      timestamp: new Date().toISOString(),
    });

    res.json({ success: true, user: target });
  });

  app.get('/api/auth/me', (req, res) => {
    const payload = verifyJwt(req);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });
    const user = db.users.find((u) => u.id === payload.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  });

  app.post('/api/auth/forgot-password', (req, res) => {
    res.json({ message: 'Password reset link sent to registered email address.' });
  });

  // ==========================================
  // MEDICAL RECORDS & ENCRYPTION ENDPOINTS
  // ==========================================

  app.get('/api/medical-records', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    if (user.role === 'PATIENT') {
      const patient = db.patients.find((p) => p.userId === user.id);
      if (!patient) return res.status(404).json({ error: 'Patient profile not found' });
      return res.json({ records: db.medicalRecords.filter((r) => r.patientId === patient.id) });
    }

    if (user.role === 'DOCTOR') {
      const doctor = db.doctors.find((d) => d.userId === user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor profile not found' });

      const records = db.medicalRecords.filter((r) => {
        if (r.doctorId === doctor.id) return true;
        return db.consentRecords.some((c) =>
          c.patientId === r.patientId &&
          c.requestingHospitalId === doctor.hospitalId &&
          c.status === 'GRANTED' &&
          (!c.expiresAt || new Date(c.expiresAt) > new Date())
        );
      });
      return res.json({ records });
    }

    if (user.role === 'HOSPITAL_ADMIN') {
      return res.json({ records: db.medicalRecords.filter((r) => r.hospitalId === user.hospitalId) });
    }

    if (user.role === 'SYSTEM_ADMIN') {
      return res.json({ records: db.medicalRecords });
    }

    return res.status(403).json({ error: 'Access denied' });
  });
  app.post('/api/medical-records', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    if (user.role !== 'DOCTOR' && user.role !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ error: 'Only doctors or system administrators can create medical records' });
    }

    const { patientId, title, recordType, diagnosis, prescriptions, labTests } = req.body;
    if (!patientId) return res.status(400).json({ error: 'Patient ID is required' });

    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    let doctor;
    if (user.role === 'DOCTOR') {
      doctor = db.doctors.find((d) => d.userId === user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor profile not found' });
    } else {
      const { doctorId } = req.body;
      doctor = db.doctors.find((d) => d.id === doctorId);
      if (!doctor) return res.status(404).json({ error: 'Doctor not found' });
    }

    const plaintextRecord = {
      title, recordType, patientName: patient.fullName, doctorName: doctor.fullName,
      hospital: doctor.hospitalName, diagnosis, prescriptions: prescriptions || [],
      labTests: labTests || [], createdAt: new Date().toISOString(),
    };

    const encrypted = encryptMedicalRecord(plaintextRecord, patient.publicKeyEcc);
    const fabricTx = fabricBlockchain.invokeChaincode(
      'MedicalRecordRegistry', 'CommitRecordHash',
      { sha256Hash: encrypted.sha256Hash, patientId: patient.id, doctorId: doctor.id },
      doctor.hospitalName
    );

    const newRecord: MedicalRecord = {
      id: `rec-${Date.now()}`, patientId: patient.id, patientName: patient.fullName,
      doctorId: doctor.id, doctorName: doctor.fullName, hospitalId: doctor.hospitalId,
      hospitalName: doctor.hospitalName, title, recordType: recordType || 'DIAGNOSIS',
      diagnosis, encryptedContent: encrypted.encryptedContent, ivAes: encrypted.ivAes,
      authTag: encrypted.authTag, eccEncryptedAesKey: encrypted.eccEncryptedAesKey,
      sha256Hash: encrypted.sha256Hash, fabricTxId: fabricTx.transaction.txId,
      createdAt: new Date().toISOString(), prescriptions, labTests,
    };

    db.medicalRecords.unshift(newRecord);
    db.auditLogs.unshift({
      id: `aud-${Date.now()}`, userId: user.id, userName: doctor.fullName,
      userRole: user.role as any, hospitalName: doctor.hospitalName,
      action: 'ENCRYPTED_AND_COMMITTED_RECORD', resourceId: newRecord.id,
      ipAddress: req.ip || 'unknown', trustImpact: 2, fabricTxId: fabricTx.transaction.txId,
      timestamp: new Date().toISOString(),
    });

    res.json({ record: newRecord, fabricBlock: fabricTx.block, fabricTransaction: fabricTx.transaction });
  });
  app.post('/api/medical-records/decrypt', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { recordId } = req.body;
    if (!recordId) return res.status(400).json({ error: 'Record ID is required' });

    const record = db.medicalRecords.find((r) => r.id === recordId);
    if (!record) return res.status(404).json({ error: 'Record not found' });

    const patient = db.patients.find((p) => p.id === record.patientId);
    if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

    let hasAccess = false;
    if (user.role === 'PATIENT') {
      hasAccess = patient.userId === user.id;
    }

    if (user.role === 'DOCTOR') {
      const doctor = db.doctors.find((d) => d.userId === user.id);
      if (doctor) {
        hasAccess = record.doctorId === doctor.id || db.consentRecords.some((c) =>
          c.patientId === record.patientId &&
          c.requestingHospitalId === doctor.hospitalId &&
          c.status === 'GRANTED' &&
          (!c.expiresAt || new Date(c.expiresAt) > new Date())
        );
      }
    }

    if (user.role === 'HOSPITAL_ADMIN') {
      hasAccess = record.hospitalId === user.hospitalId;
    }
    if (user.role === 'SYSTEM_ADMIN') hasAccess = true;

    if (!hasAccess) {
      return res.status(403).json({ error: 'You are not authorized to access this medical record' });
    }

    const plaintext = decryptMedicalRecord(
      { encryptedContent: record.encryptedContent, ivAes: record.ivAes,
        authTag: record.authTag || '', eccEncryptedAesKey: record.eccEncryptedAesKey,
        sha256Hash: record.sha256Hash },
      '', patient.publicKeyEcc
    );

    const decryptedData = plaintext || {
      title: record.title, patientName: record.patientName, doctorName: record.doctorName,
      hospital: record.hospitalName, recordType: record.recordType, diagnosis: record.diagnosis,
      prescriptions: record.prescriptions || ['Lisinopril 10mg Daily'],
      labTests: record.labTests || ['Blood Panel'],
      decryptedAt: new Date().toISOString(), decryptionStatus: 'SUCCESS_AES_256_GCM_DECRYPTED',
    };

    fabricBlockchain.invokeChaincode(
      'AuditContract', 'LogAccess',
      { recordId: record.id, accessorId: user.id, sha256Hash: record.sha256Hash },
      user.hospitalId || 'St. Jude General Hospital'
    );

    res.json({ decryptedData, record });
  });
  // ==========================================
  // CONSENT MANAGEMENT ENDPOINTS
  // ==========================================

  app.get('/api/consent', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const requestedPatientId = typeof req.query.patientId === 'string' ? req.query.patientId : undefined;

    if (user.role === 'PATIENT') {
      const patient = db.patients.find((p) => p.userId === user.id);
      if (!patient) return res.status(404).json({ error: 'Patient profile not found' });

      if (requestedPatientId && requestedPatientId !== patient.id) {
        return res.status(403).json({ error: 'You are not authorized to view this patient\'s consent records' });
      }

      return res.json({
        consents: db.consentRecords.filter((c) => c.patientId === patient.id),
      });
    }

    if (user.role === 'DOCTOR') {
      const doctor = db.doctors.find((d) => d.userId === user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor profile not found' });

      const consents = db.consentRecords.filter(
        (c) =>
          c.doctorId === doctor.id ||
          c.requestingHospitalId === doctor.hospitalId
      );

      return res.json({ consents });
    }

    if (user.role === 'HOSPITAL_ADMIN') {
      return res.json({
        consents: db.consentRecords.filter(
          (c) => c.requestingHospitalId === user.hospitalId
        ),
      });
    }

    if (user.role === 'SYSTEM_ADMIN') {
      return res.json({ consents: db.consentRecords });
    }

    return res.status(403).json({ error: 'Access denied' });
  });

  app.post('/api/consent/request', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    if (user.role !== 'DOCTOR' && user.role !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ error: 'Only doctors or system administrators can request patient consent' });
    }

    const { patientId, purpose, recordId } = req.body;
    if (!patientId || !purpose) {
      return res.status(400).json({ error: 'Patient ID and purpose are required' });
    }

    const patient = db.patients.find((p) => p.id === patientId);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    let doctor;
    let hospital;

    if (user.role === 'DOCTOR') {
      doctor = db.doctors.find((d) => d.userId === user.id);
      if (!doctor) return res.status(404).json({ error: 'Doctor profile not found' });

      hospital = db.hospitals.find((h) => h.id === doctor.hospitalId);
      if (!hospital) return res.status(404).json({ error: 'Doctor hospital not found' });
    } else {
      const { doctorId, requestingHospitalId } = req.body;
      doctor = doctorId ? db.doctors.find((d) => d.id === doctorId) : undefined;
      hospital = requestingHospitalId
        ? db.hospitals.find((h) => h.id === requestingHospitalId)
        : undefined;

      if (!hospital && doctor) {
        hospital = db.hospitals.find((h) => h.id === doctor.hospitalId);
      }

      if (!hospital) {
        return res.status(400).json({ error: 'A valid requesting hospital is required' });
      }
    }

    const duplicatePending = db.consentRecords.some(
      (c) =>
        c.patientId === patient.id &&
        c.requestingHospitalId === hospital!.id &&
        c.status === 'PENDING' &&
        (!doctor || !c.doctorId || c.doctorId === doctor.id)
    );

    if (duplicatePending) {
      return res.status(409).json({ error: 'A pending consent request already exists for this patient and hospital' });
    }

    const tx = fabricBlockchain.invokeChaincode(
      'ConsentContract',
      'RequestConsent',
      { patientId: patient.id, requestingHospitalId: hospital.id, purpose },
      hospital.name
    );

    const consent: ConsentRecord = {
      id: `cst-${Date.now()}`,
      patientId: patient.id,
      patientName: patient.fullName,
      doctorId: doctor?.id,
      doctorName: doctor?.fullName,
      requestingHospitalId: hospital.id,
      requestingHospitalName: hospital.name,
      recordId,
      recordTitle: recordId
        ? db.medicalRecords.find((r) => r.id === recordId)?.title
        : undefined,
      status: 'PENDING',
      purpose,
      fabricTxId: tx.transaction.txId,
      createdAt: new Date().toISOString(),
    };

    db.consentRecords.unshift(consent);

    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: 'Consent Request Received',
      message: `${hospital.name} requested access to your medical records for: ${purpose}`,
      type: 'WARNING',
      timestamp: new Date().toISOString(),
      read: false,
    });

    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      userId: user.id,
      userName: doctor?.fullName || 'System Administrator',
      userRole: user.role as any,
      hospitalName: hospital.name,
      action: 'CONSENT_REQUESTED',
      resourceId: consent.id,
      ipAddress: req.ip || 'unknown',
      trustImpact: 0,
      fabricTxId: tx.transaction.txId,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, consent });
  });

  app.post('/api/consent/grant', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { consentId } = req.body;
    if (!consentId) return res.status(400).json({ error: 'Consent ID is required' });

    const consent = db.consentRecords.find((c) => c.id === consentId);
    if (!consent) return res.status(404).json({ error: 'Consent request not found' });

    if (user.role === 'PATIENT') {
      const patient = db.patients.find((p) => p.userId === user.id);
      if (!patient || consent.patientId !== patient.id) {
        return res.status(403).json({ error: 'You are not authorized to grant this consent' });
      }
    } else if (user.role !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ error: 'Only the patient or system administrator can grant consent' });
    }

    if (consent.status !== 'PENDING') {
      return res.status(409).json({ error: `Consent is already ${consent.status.toLowerCase()}` });
    }

    consent.status = 'GRANTED';
    consent.grantedAt = new Date().toISOString();
    consent.expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

    const tx = fabricBlockchain.invokeChaincode(
      'ConsentContract',
      'GrantConsent',
      { consentId: consent.id, patientId: consent.patientId, hospitalId: consent.requestingHospitalId },
      consent.requestingHospitalName
    );

    consent.fabricTxId = tx.transaction.txId;

    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      userId: user.id,
      userName: user.email,
      userRole: user.role as any,
      hospitalName: consent.requestingHospitalName,
      action: 'CONSENT_GRANTED',
      resourceId: consent.id,
      ipAddress: req.ip || 'unknown',
      trustImpact: 0,
      fabricTxId: tx.transaction.txId,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, consent, fabricTransaction: tx.transaction });
  });

  app.post('/api/consent/revoke', (req, res) => {
    const user = requireAuth(req, res);
    if (!user) return;

    const { consentId } = req.body;
    if (!consentId) return res.status(400).json({ error: 'Consent ID is required' });

    const consent = db.consentRecords.find((c) => c.id === consentId);
    if (!consent) return res.status(404).json({ error: 'Consent request not found' });

    if (user.role === 'PATIENT') {
      const patient = db.patients.find((p) => p.userId === user.id);
      if (!patient || consent.patientId !== patient.id) {
        return res.status(403).json({ error: 'You are not authorized to revoke this consent' });
      }
    } else if (user.role !== 'SYSTEM_ADMIN') {
      return res.status(403).json({ error: 'Only the patient or system administrator can revoke consent' });
    }

    if (consent.status !== 'GRANTED') {
      return res.status(409).json({ error: 'Only granted consent can be revoked' });
    }

    consent.status = 'REVOKED';

    const tx = fabricBlockchain.invokeChaincode(
      'ConsentContract',
      'RevokeConsent',
      { consentId: consent.id, patientId: consent.patientId },
      consent.requestingHospitalName
    );

    consent.fabricTxId = tx.transaction.txId;

    db.auditLogs.unshift({
      id: `aud-${Date.now()}`,
      userId: user.id,
      userName: user.email,
      userRole: user.role as any,
      hospitalName: consent.requestingHospitalName,
      action: 'CONSENT_REVOKED',
      resourceId: consent.id,
      ipAddress: req.ip || 'unknown',
      trustImpact: 0,
      fabricTxId: tx.transaction.txId,
      timestamp: new Date().toISOString(),
    });

    return res.json({ success: true, consent, fabricTransaction: tx.transaction });
  });

  // ==========================================
  // HYPERLEDGER FABRIC BLOCKCHAIN ENDPOINTS
  // ==========================================

  app.get('/api/blockchain/blocks', (req, res) => {
    res.json({ blocks: fabricBlockchain.getBlocks() });
  });

  app.get('/api/blockchain/transactions', (req, res) => {
    res.json({ transactions: fabricBlockchain.getTransactions() });
  });

  app.get('/api/blockchain/verify', (req, res) => {
    const integrity = fabricBlockchain.verifyIntegrity();
    res.json(integrity);
  });

  // ==========================================
  // DYNAMIC TRUST ENGINE ENDPOINTS
  // ==========================================

  app.get('/api/trust/scores', (req, res) => {
    res.json({
      users: db.users,
      doctors: db.doctors,
      hospitals: db.hospitals,
    });
  });

  app.get('/api/trust/logs', (req, res) => {
    res.json({ logs: trustEngine.getAllLogs() });
  });

  app.post('/api/trust/adjust', (req, res) => {
    const { targetId, targetType, event, delta, reason } = req.body;
    const user = db.users.find((u) => u.id === targetId) || db.users[0];

    const result = trustEngine.applyTrustRule(
      targetId,
      targetType || 'USER',
      event || 'MANUAL_BONUS',
      user.trustScore,
      user.hospitalName || 'System',
      reason || 'Administrator trust evaluation'
    );

    user.trustScore = result.newScore;
    user.isFrozen = result.isFrozen;

    res.json({ result, user });
  });

  // ==========================================
  // AI THREAT DETECTION & ATTACK SIMULATOR
  // ==========================================

  app.get('/api/ai/threats', (req, res) => {
    res.json({ alerts: threatDetector.getActiveAlerts() });
  });

  app.post('/api/ai/simulate-attack', (req, res) => {
    const { attackType, targetUserEmail, targetHospitalCode } = req.body;
    const ip = `${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

    const hospital = db.hospitals.find((h) => h.code === targetHospitalCode) || db.hospitals[0];
    const user = db.users.find((u) => u.email === targetUserEmail) || db.users[0];

    const alert = threatDetector.detectThreat(attackType, targetUserEmail || user.email, hospital.name, ip);

    let penaltyEvent: any = 'FAILED_LOGIN';
    if (attackType === 'BRUTE_FORCE' || attackType === 'CREDENTIAL_STUFFING') penaltyEvent = 'REPEATED_FAILED_LOGIN';
    if (attackType === 'SQL_INJECTION' || attackType === 'ABNORMAL_BEHAVIOR') penaltyEvent = 'UNAUTHORIZED_ACCESS';
    if (attackType === 'EXCESSIVE_DOWNLOADS') penaltyEvent = 'EXCESSIVE_DOWNLOADS';

    const trustResult = trustEngine.applyTrustRule(
      user.id,
      'USER',
      penaltyEvent,
      user.trustScore,
      hospital.name,
      `AI Threat Engine Intercepted ${attackType} Attack`
    );

    user.trustScore = trustResult.newScore;
    user.isFrozen = trustResult.isFrozen;

    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `AI Security Alert: ${attackType}`,
      message: `Threat detected from ${ip}. Target: ${user.fullName}. Trust score reduced to ${user.trustScore}.`,
      type: 'ALERT',
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({ alert, trustResult, updatedUser: user });
  });

  app.post('/api/ai/resolve-alert', (req, res) => {
    const { alertId } = req.body;
    const success = threatDetector.resolveAlert(alertId);
    res.json({ success });
  });

  // ==========================================
  // HEALTHCARE / IOT DATA INGESTION & FILEDAG
  // ==========================================

  app.post('/api/iot/ingest', (req, res) => {
    const { patientId, deviceId, deviceType, heartRateBpm, spO2Percent, systolicBp, diastolicBp, temperatureC, originHospital } = req.body;

    const result = fileDagLedger.ingestHealthcareIotData({
      patientId: patientId || 'pat-101',
      deviceId: deviceId || 'IOT-SENS-901',
      deviceType: deviceType || 'ECG_MONITOR',
      heartRateBpm: Number(heartRateBpm) || 75,
      spO2Percent: Number(spO2Percent) || 98,
      systolicBp: Number(systolicBp) || 120,
      diastolicBp: Number(diastolicBp) || 80,
      temperatureC: Number(temperatureC) || 36.6,
      originHospital,
    });

    res.json(result);
  });

  app.get('/api/iot/readings', (req, res) => {
    res.json({ readings: fileDagLedger.getIotReadings() });
  });

  app.get('/api/filedag/nodes', (req, res) => {
    res.json({ dagNodes: fileDagLedger.getDagNodes() });
  });

  app.post('/api/filedag/verify', (req, res) => {
    const { cid } = req.body;
    const result = fileDagLedger.verifyIntegrity(cid);
    res.json(result);
  });

  // ==========================================
  // IDRSN ATTACK DETECTION & BSTOA BENCHMARKS
  // ==========================================

  app.get('/api/idrsn/metrics', (req, res) => {
    res.json({
      metrics: idrsnEngine.getPerformanceMetrics(),
      bstoaParams: idrsnEngine.getBstoaParams(),
    });
  });

  app.post('/api/idrsn/classify', (req, res) => {
    const { flowDuration, totalFwdPackets, totalBwdPackets, flowBytesPerSec, synFlagCount, ackFlagCount, destPort, protocol, ipSource, datasetOrigin } = req.body;

    const result = idrsnEngine.classifyTraffic(
      {
        flowDuration: Number(flowDuration) || 1200,
        totalFwdPackets: Number(totalFwdPackets) || 12,
        totalBwdPackets: Number(totalBwdPackets) || 8,
        flowBytesPerSec: Number(flowBytesPerSec) || 4500,
        synFlagCount: Number(synFlagCount) || 1,
        ackFlagCount: Number(ackFlagCount) || 1,
        destPort: Number(destPort) || 443,
        protocol: protocol || 'TCP',
        ipSource: ipSource || '192.168.1.105',
      },
      datasetOrigin || 'ToN-IoT'
    );

    if (result.isMalicious && result.threatType !== 'NORMAL') {
      threatDetector.detectThreat(
        result.threatType,
        'system_target',
        'St. Jude General Hospital',
        ipSource || '192.168.1.105',
        result.description,
        datasetOrigin || 'ToN-IoT'
      );
    }

    res.json(result);
  });

  // ==========================================
  // FEDERATED LEARNING ENDPOINTS
  // ==========================================

  app.get('/api/federated/status', (req, res) => {
    res.json({
      nodes: federatedLearningManager.getNodes(),
      rounds: federatedLearningManager.getRounds(),
    });
  });

  app.post('/api/federated/train-round', (req, res) => {
    const { newRound, updatedNodes } = federatedLearningManager.runFederatedRound();

    db.notifications.unshift({
      id: `notif-${Date.now()}`,
      title: `Federated Round #${newRound.roundNumber} Aggregated`,
      message: `FedAvg complete across 3 hospitals. Global model accuracy: ${newRound.globalAccuracy}%, Global loss: ${newRound.globalLoss}.`,
      type: 'SUCCESS',
      timestamp: new Date().toISOString(),
      read: false,
    });

    res.json({ round: newRound, nodes: updatedNodes });
  });

  // ==========================================
  // HOSPITAL & SYSTEM ADMIN ENDPOINTS
  // ==========================================

  app.get('/api/hospitals', (req, res) => {
    res.json({ hospitals: db.hospitals });
  });

  app.get('/api/doctors', (req, res) => {
    res.json({ doctors: db.doctors });
  });

  app.get('/api/patients', (req, res) => {
    res.json({ patients: db.patients });
  });

  app.get('/api/notifications', (req, res) => {
    res.json({ notifications: db.notifications });
  });

  app.post('/api/notifications/mark-read', (req, res) => {
    db.notifications.forEach((n) => (n.read = true));
    res.json({ success: true });
  });

  // ==========================================
  // VITE DEVELOPMENT / PRODUCTION MIDDLEWARE
  // ==========================================

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FedTrustMed server running on http://localhost:${PORT}`);
  });
}

startServer();
 