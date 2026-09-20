import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'fedtrust',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});
import {
  User,
  Patient,
  Doctor,
  Hospital,
  Department,
  Appointment,
  MedicalRecord,
  ConsentRecord,
  AuditLog,
  NotificationItem,
} from '../src/types/index.js';

import { encryptMedicalRecord, generateEccKeyPair } from './cryptoUtils.js';
import { fabricBlockchain } from './blockchain.js';

class RelationalDatabase {
  public users: User[] = [];
  public patients: Patient[] = [];
  public doctors: Doctor[] = [];
  public hospitals: Hospital[] = [];
  public departments: Department[] = [];
  public appointments: Appointment[] = [];
  public medicalRecords: MedicalRecord[] = [];
  public consentRecords: ConsentRecord[] = [];
  public auditLogs: AuditLog[] = [];
  public notifications: NotificationItem[] = [];

  constructor() {
    this.seedDatabase();
  }

  private seedDatabase() {
    // 1. Hospitals
    this.hospitals = [
      {
        id: 'hosp-a',
        name: 'St. Jude General Hospital',
        code: 'HOSP-A',
        region: 'North Sector',
        address: '100 Healthcare Blvd, Metro City',
        contactEmail: 'admin@hospital-a.com',
        status: 'APPROVED',
        trustScore: 96,
        nodeAddress: 'peer0.hospitala.fedtrustmed.org',
        doctorsCount: 45,
        patientsCount: 1200,
        recordsCount: 3400,
        federatedWeightVersion: 3,
      },
      {
        id: 'hosp-b',
        name: 'Metro Heart & Cancer Specialty',
        code: 'HOSP-B',
        region: 'East Sector',
        address: '45 Specialty Way, Metro City',
        contactEmail: 'admin@hospital-b.com',
        status: 'APPROVED',
        trustScore: 92,
        nodeAddress: 'peer0.hospitalb.fedtrustmed.org',
        doctorsCount: 32,
        patientsCount: 890,
        recordsCount: 2100,
        federatedWeightVersion: 3,
      },
      {
        id: 'hosp-c',
        name: 'City Memorial Hospital',
        code: 'HOSP-C',
        region: 'South Sector',
        address: '782 Community Rd, Metro City',
        contactEmail: 'admin@hospital-c.com',
        status: 'APPROVED',
        trustScore: 88,
        nodeAddress: 'peer0.hospitalc.fedtrustmed.org',
        doctorsCount: 28,
        patientsCount: 750,
        recordsCount: 1800,
        federatedWeightVersion: 3,
      },
    ];

    // 2. Departments
    this.departments = [
      { id: 'dept-cardio', hospitalId: 'hosp-a', name: 'Cardiology', headDoctorName: 'Dr. Robert Chen' },
      { id: 'dept-neuro', hospitalId: 'hosp-a', name: 'Neurology', headDoctorName: 'Dr. Amanda Foster' },
      { id: 'dept-oncology', hospitalId: 'hosp-b', name: 'Oncology', headDoctorName: 'Dr. Marcus Vance' },
      { id: 'dept-peds', hospitalId: 'hosp-c', name: 'Pediatrics', headDoctorName: 'Dr. Priya Sharma' },
    ];

    // Generate ECC Keypair for system users
    const patientKeys = generateEccKeyPair();
    const doctorKeys = generateEccKeyPair();
    const hospAdminKeys = generateEccKeyPair();
    const sysAdminKeys = generateEccKeyPair();

    // 3. Users (4 Primary Roles + Pending Approval Testing Users)
    this.users = [
      {
        id: 'usr-patient-1',
        email: 'patient@fedtrustmed.org',
        fullName: 'Sarah Connor',
        role: 'PATIENT',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        trustScore: 98,
        isFrozen: false,
        isVerified: true,
        approvalStatus: 'APPROVED',
        dataAccessPermissions: ['READ_RECORDS', 'CROSS_HOSPITAL_CONSENT'],
        password: 'patient123',
        publicKeyEcc: patientKeys.publicKeyPem,
        createdAt: '2025-01-15T09:00:00Z',
      },
      {
        id: 'usr-doctor-1',
        email: 'doctor@fedtrustmed.org',
        fullName: 'Dr. Robert Chen',
        role: 'DOCTOR',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        departmentId: 'dept-cardio',
        departmentName: 'Cardiology',
        trustScore: 94,
        isFrozen: false,
        isVerified: true,
        approvalStatus: 'APPROVED',
        dataAccessPermissions: ['READ_RECORDS', 'WRITE_RECORDS', 'CROSS_HOSPITAL_CONSENT'],
        password: 'doc123',
        publicKeyEcc: doctorKeys.publicKeyPem,
        createdAt: '2025-01-10T10:00:00Z',
      },
      {
        id: 'usr-hospadmin-1',
        email: 'hospadmin@fedtrustmed.org',
        fullName: 'Elena Vance',
        role: 'HOSPITAL_ADMIN',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        trustScore: 96,
        isFrozen: false,
        isVerified: true,
        approvalStatus: 'APPROVED',
        dataAccessPermissions: ['READ_RECORDS', 'CROSS_HOSPITAL_CONSENT', 'ADMIN_ACCESS', 'AUDIT_LOGS'],
        password: 'hosp123',
        publicKeyEcc: hospAdminKeys.publicKeyPem,
        createdAt: '2025-01-05T08:00:00Z',
      },
      {
        id: 'usr-sysadmin-1',
        email: 'sysadmin@fedtrustmed.org',
        fullName: 'Root System Admin',
        role: 'SYSTEM_ADMIN',
        trustScore: 100,
        isFrozen: false,
        isVerified: true,
        approvalStatus: 'APPROVED',
        dataAccessPermissions: [
          'READ_RECORDS',
          'WRITE_RECORDS',
          'CROSS_HOSPITAL_CONSENT',
          'ADMIN_ACCESS',
          'AUDIT_LOGS',
          'FEDERATED_AI',
        ],
        password: 'admin123',
        publicKeyEcc: sysAdminKeys.publicKeyPem,
        createdAt: '2025-01-01T00:00:00Z',
      },
      // Fake Temporary Users Awaiting Admin Authorization
      {
        id: 'usr-pending-doc-1',
        email: 'j.wilson@cardio.med',
        fullName: 'Dr. James Wilson',
        role: 'DOCTOR',
        hospitalId: 'hosp-b',
        hospitalName: 'Metro Heart & Cancer Specialty',
        departmentId: 'dept-cardio',
        departmentName: 'Cardiology Specialist',
        trustScore: 85,
        isFrozen: false,
        isVerified: false,
        approvalStatus: 'PENDING',
        dataAccessPermissions: [],
        requestedPermissions: ['READ_RECORDS', 'WRITE_RECORDS', 'CROSS_HOSPITAL_CONSENT'],
        password: 'pending123',
        publicKeyEcc: generateEccKeyPair().publicKeyPem,
        createdAt: new Date(Date.now() - 3600000 * 4).toISOString(),
      },
      {
        id: 'usr-pending-patient-1',
        email: 'marcus.vance@gmail.com',
        fullName: 'Marcus Vance',
        role: 'PATIENT',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        trustScore: 90,
        isFrozen: false,
        isVerified: false,
        approvalStatus: 'PENDING',
        dataAccessPermissions: [],
        requestedPermissions: ['READ_RECORDS'],
        password: 'pending123',
        publicKeyEcc: generateEccKeyPair().publicKeyPem,
        createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
      },
      {
        id: 'usr-pending-researcher-1',
        email: 'amara.patel@aihealth.org',
        fullName: 'Dr. Amara Patel',
        role: 'DOCTOR',
        hospitalId: 'hosp-c',
        hospitalName: 'City Memorial Hospital',
        departmentId: 'dept-peds',
        departmentName: 'Pediatric AI Research',
        trustScore: 88,
        isFrozen: false,
        isVerified: false,
        approvalStatus: 'PENDING',
        dataAccessPermissions: [],
        requestedPermissions: ['READ_RECORDS', 'FEDERATED_AI'],
        password: 'pending123',
        publicKeyEcc: generateEccKeyPair().publicKeyPem,
        createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
      },
    ];

    // 4. Patients
    this.patients = [
      {
        id: 'pat-101',
        userId: 'usr-patient-1',
        fullName: 'Sarah Connor',
        email: 'patient@fedtrustmed.org',
        dob: '1988-06-14',
        gender: 'Female',
        bloodType: 'O+',
        allergies: ['Penicillin', 'Sulfa Drugs'],
        medicalConditions: ['Hypertension', 'Mild Asthma'],
        primaryHospitalId: 'hosp-a',
        primaryHospitalName: 'St. Jude General Hospital',
        emergencyContact: 'John Connor (+1-555-0192)',
        trustScore: 98,
        publicKeyEcc: patientKeys.publicKeyPem,
      },
      {
        id: 'pat-102',
        userId: 'usr-patient-2',
        fullName: 'Michael Scott',
        email: 'michael.s@dunder.com',
        dob: '1975-03-15',
        gender: 'Male',
        bloodType: 'A-',
        allergies: ['Latex'],
        medicalConditions: ['Type 2 Diabetes'],
        primaryHospitalId: 'hosp-b',
        primaryHospitalName: 'Metro Heart & Cancer Specialty',
        emergencyContact: 'Dwight Schrute (+1-555-0144)',
        trustScore: 91,
        publicKeyEcc: patientKeys.publicKeyPem,
      },
    ];

    // 5. Doctors
    this.doctors = [
      {
        id: 'doc-201',
        userId: 'usr-doctor-1',
        fullName: 'Dr. Robert Chen',
        specialty: 'Cardiovascular Surgery',
        departmentId: 'dept-cardio',
        departmentName: 'Cardiology',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        licenseNumber: 'MD-CA-994821',
        trustScore: 94,
        assignedPatientsCount: 18,
      },
      {
        id: 'doc-202',
        userId: 'usr-doctor-2',
        fullName: 'Dr. Marcus Vance',
        specialty: 'Medical Oncology',
        departmentId: 'dept-oncology',
        departmentName: 'Oncology',
        hospitalId: 'hosp-b',
        hospitalName: 'Metro Heart & Cancer Specialty',
        licenseNumber: 'MD-NY-773120',
        trustScore: 92,
        assignedPatientsCount: 14,
      },
    ];

    // 6. Appointments
    this.appointments = [
      {
        id: 'apt-301',
        patientId: 'pat-101',
        patientName: 'Sarah Connor',
        doctorId: 'doc-201',
        doctorName: 'Dr. Robert Chen',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        date: '2026-08-10',
        time: '10:30 AM',
        type: 'Cardiology Follow-Up',
        status: 'SCHEDULED',
        notes: 'Routine ECG check & blood pressure review.',
      },
      {
        id: 'apt-302',
        patientId: 'pat-101',
        patientName: 'Sarah Connor',
        doctorId: 'doc-202',
        doctorName: 'Dr. Marcus Vance',
        hospitalId: 'hosp-b',
        hospitalName: 'Metro Heart & Cancer Specialty',
        date: '2026-08-18',
        time: '02:00 PM',
        type: 'Oncology Consultation',
        status: 'SCHEDULED',
        notes: 'Cross-hospital referral review.',
      },
    ];

    // 7. Medical Records (Encrypted with AES-256 and ECC)
    const recordPlaintext1 = {
      recordTitle: 'Echocardiogram & Cardiac Lipid Profile',
      patientName: 'Sarah Connor',
      doctorName: 'Dr. Robert Chen',
      hospital: 'St. Jude General Hospital',
      diagnosis: 'Mild Sinus Bradycardia & Essential Hypertension (Controlled)',
      vitalSigns: { bloodPressure: '122/80 mmHg', heartRate: '58 bpm', oxygenSat: '99%' },
      notes: 'Patient shows stable cardiac rhythm. Continue Lisinopril 10mg daily.',
      prescriptions: ['Lisinopril 10mg Daily', 'Aspirin 81mg Daily'],
      labResults: ['Total Cholesterol: 185 mg/dL', 'Triglycerides: 120 mg/dL', 'HDL: 52 mg/dL'],
    };

    const encrypted1 = encryptMedicalRecord(recordPlaintext1, patientKeys.publicKeyPem);
    const fabricTx1 = fabricBlockchain.invokeChaincode(
      'MedicalRecordRegistry',
      'CommitRecordHash',
      { recordId: 'rec-501', sha256Hash: encrypted1.sha256Hash, patientId: 'pat-101' },
      'St. Jude General Hospital'
    );

    const recordPlaintext2 = {
      recordTitle: 'Pulmonary Function Test & Chest X-Ray',
      patientName: 'Sarah Connor',
      doctorName: 'Dr. Amanda Foster',
      hospital: 'St. Jude General Hospital',
      diagnosis: 'Mild Intermittent Asthma with Airway Sensitivity',
      vitalSigns: { bloodPressure: '118/76 mmHg', heartRate: '68 bpm', oxygenSat: '98%' },
      notes: 'Lungs clear bilaterally. Spirometry FEV1/FVC ratio is 82%.',
      prescriptions: ['Albuterol HFA Inhaler 90mcg PRN'],
      labResults: ['Eosinophil count: 2.1% (Normal)'],
    };

    const encrypted2 = encryptMedicalRecord(recordPlaintext2, patientKeys.publicKeyPem);
    const fabricTx2 = fabricBlockchain.invokeChaincode(
      'MedicalRecordRegistry',
      'CommitRecordHash',
      { recordId: 'rec-502', sha256Hash: encrypted2.sha256Hash, patientId: 'pat-101' },
      'St. Jude General Hospital'
    );

    this.medicalRecords = [
      {
        id: 'rec-501',
        patientId: 'pat-101',
        patientName: 'Sarah Connor',
        doctorId: 'doc-201',
        doctorName: 'Dr. Robert Chen',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        title: 'Echocardiogram & Cardiac Lipid Profile',
        recordType: 'DIAGNOSIS',
        diagnosis: 'Mild Sinus Bradycardia & Essential Hypertension (Controlled)',
        encryptedContent: encrypted1.encryptedContent,
        ivAes: encrypted1.ivAes,
        authTag: encrypted1.authTag,
        eccEncryptedAesKey: encrypted1.eccEncryptedAesKey,
        sha256Hash: encrypted1.sha256Hash,
        fabricTxId: fabricTx1.transaction.txId,
        createdAt: '2026-07-28T14:30:00Z',
        prescriptions: ['Lisinopril 10mg Daily', 'Aspirin 81mg Daily'],
        labTests: ['Lipid Panel', 'High-Sensitivity CRP'],
      },
      {
        id: 'rec-502',
        patientId: 'pat-101',
        patientName: 'Sarah Connor',
        doctorId: 'doc-201',
        doctorName: 'Dr. Amanda Foster',
        hospitalId: 'hosp-a',
        hospitalName: 'St. Jude General Hospital',
        title: 'Pulmonary Function Test & Chest X-Ray',
        recordType: 'RADIOLOGY',
        diagnosis: 'Mild Intermittent Asthma with Airway Sensitivity',
        encryptedContent: encrypted2.encryptedContent,
        ivAes: encrypted2.ivAes,
        authTag: encrypted2.authTag,
        eccEncryptedAesKey: encrypted2.eccEncryptedAesKey,
        sha256Hash: encrypted2.sha256Hash,
        fabricTxId: fabricTx2.transaction.txId,
        createdAt: '2026-06-12T10:15:00Z',
        prescriptions: ['Albuterol HFA Inhaler 90mcg PRN'],
        labTests: ['Spirometry Report'],
      },
    ];

    // 8. Consent Records
    const consentTx1 = fabricBlockchain.invokeChaincode(
      'ConsentContract',
      'GrantConsent',
      { consentId: 'cst-701', patientId: 'pat-101', doctorId: 'doc-201', hospitalId: 'hosp-a' },
      'St. Jude General Hospital'
    );

    const consentTx2 = fabricBlockchain.invokeChaincode(
      'ConsentContract',
      'GrantConsent',
      { consentId: 'cst-702', patientId: 'pat-101', doctorId: 'doc-202', hospitalId: 'hosp-b' },
      'Metro Heart & Cancer Specialty'
    );

    this.consentRecords = [
      {
        id: 'cst-701',
        patientId: 'pat-101',
        patientName: 'Sarah Connor',
        doctorId: 'doc-201',
        doctorName: 'Dr. Robert Chen',
        requestingHospitalId: 'hosp-a',
        requestingHospitalName: 'St. Jude General Hospital',
        recordId: 'rec-501',
        recordTitle: 'Echocardiogram & Cardiac Lipid Profile',
        status: 'GRANTED',
        purpose: 'Direct Patient Treatment & Cardiology Monitoring',
        grantedAt: '2026-07-28T14:35:00Z',
        expiresAt: '2027-07-28T14:35:00Z',
        fabricTxId: consentTx1.transaction.txId,
        createdAt: '2026-07-28T14:30:00Z',
      },
      {
        id: 'cst-702',
        patientId: 'pat-101',
        patientName: 'Sarah Connor',
        doctorId: 'doc-202',
        doctorName: 'Dr. Marcus Vance',
        requestingHospitalId: 'hosp-b',
        requestingHospitalName: 'Metro Heart & Cancer Specialty',
        recordId: 'rec-501',
        recordTitle: 'Echocardiogram & Cardiac Lipid Profile',
        status: 'GRANTED',
        purpose: 'Cross-Hospital Cardiology Consultation & Second Opinion',
        grantedAt: '2026-08-01T09:12:00Z',
        expiresAt: '2026-11-01T09:12:00Z',
        fabricTxId: consentTx2.transaction.txId,
        createdAt: '2026-07-31T16:20:00Z',
      },
    ];

    // 9. Audit Logs
    this.auditLogs = [
      {
        id: 'aud-801',
        userId: 'usr-doctor-1',
        userName: 'Dr. Robert Chen',
        userRole: 'DOCTOR',
        hospitalName: 'St. Jude General Hospital',
        action: 'CREATED_MEDICAL_RECORD',
        resourceId: 'rec-501',
        ipAddress: '10.0.1.15',
        trustImpact: 2,
        fabricTxId: fabricTx1.transaction.txId,
        timestamp: '2026-07-28T14:30:00Z',
      },
      {
        id: 'aud-802',
        userId: 'usr-patient-1',
        userName: 'Sarah Connor',
        userRole: 'PATIENT',
        hospitalName: 'St. Jude General Hospital',
        action: 'GRANTED_CONSENT',
        resourceId: 'cst-701',
        ipAddress: '192.168.1.45',
        trustImpact: 2,
        fabricTxId: consentTx1.transaction.txId,
        timestamp: '2026-07-28T14:35:00Z',
      },
    ];

    // 10. Notifications
    this.notifications = [
      {
        id: 'notif-901',
        title: 'New Cross-Hospital Consent Granted',
        message: 'Sarah Connor approved record sharing request with Metro Heart & Cancer Specialty.',
        type: 'SUCCESS',
        timestamp: '2026-08-01T09:12:00Z',
        read: false,
      },
      {
        id: 'notif-902',
        title: 'Hyperledger Block Endorsed',
        message: 'Block #14 successfully committed to health-data-channel by 3 MSP nodes.',
        type: 'INFO',
        timestamp: '2026-08-05T18:22:00Z',
        read: false,
      },
      {
        id: 'notif-903',
        title: 'Federated Round #3 Completed',
        message: 'Global model accuracy reached 94.1% with FedAvg weights aggregation across 3 hospitals.',
        type: 'SUCCESS',
        timestamp: '2026-08-06T04:10:00Z',
        read: true,
      },
    ];
  }
}

export const db = new RelationalDatabase();
