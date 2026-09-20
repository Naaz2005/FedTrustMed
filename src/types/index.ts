export type UserRole = 'PATIENT' | 'DOCTOR' | 'HOSPITAL_ADMIN' | 'SYSTEM_ADMIN';
export type ApprovalStatus = 'APPROVED' | 'PENDING' | 'REJECTED';

export type DataAccessScope =
  | 'READ_RECORDS'
  | 'WRITE_RECORDS'
  | 'CROSS_HOSPITAL_CONSENT'
  | 'ADMIN_ACCESS'
  | 'AUDIT_LOGS'
  | 'FEDERATED_AI';

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  hospitalId?: string;
  hospitalName?: string;
  departmentId?: string;
  departmentName?: string;
  trustScore: number;
  isFrozen: boolean;
  isVerified: boolean;
  approvalStatus?: ApprovalStatus;
  dataAccessPermissions?: DataAccessScope[];
  requestedPermissions?: DataAccessScope[];
  rejectionReason?: string;
  password?: string;
  publicKeyEcc: string;
  createdAt: string;
    aadhaarLast4?: string;
  aadhaarVerificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_REQUIRED';

  medicalLicenseNumber?: string;
  medicalLicenseVerificationStatus?: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NOT_REQUIRED';
  medicalLicenseDocumentName?: string;

  mfaEnabled?: boolean;
  mfaSecret?: string;
}

export interface Patient {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  dob: string;
  gender: string;
  bloodType: string;
  allergies: string[];
  medicalConditions: string[];
  primaryHospitalId: string;
  primaryHospitalName: string;
  emergencyContact: string;
  trustScore: number;
  publicKeyEcc: string;
}

export interface Doctor {
  id: string;
  userId: string;
  fullName: string;
  specialty: string;
  departmentId: string;
  departmentName: string;
  hospitalId: string;
  hospitalName: string;
  licenseNumber: string;
  trustScore: number;
  assignedPatientsCount: number;
}

export interface Hospital {
  id: string;
  name: string;
  code: string; // e.g. HOSP-A, HOSP-B, HOSP-C
  region: string;
  address: string;
  contactEmail: string;
  status: 'PENDING' | 'APPROVED' | 'SUSPENDED';
  trustScore: number;
  nodeAddress: string;
  doctorsCount: number;
  patientsCount: number;
  recordsCount: number;
  federatedWeightVersion: number;
}

export interface Department {
  id: string;
  hospitalId: string;
  name: string;
  headDoctorName: string;
}

export interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  hospitalName: string;
  date: string;
  time: string;
  type: string;
  status: 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';
  notes?: string;
}

export interface MedicalRecord {
  id: string;
  patientId: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  hospitalId: string;
  hospitalName: string;
  title: string;
  recordType: 'DIAGNOSIS' | 'LAB_RESULT' | 'PRESCRIPTION' | 'DISCHARGE_SUMMARY' | 'RADIOLOGY' | 'IOT_TELEMETRY';
  diagnosis: string;
  encryptedContent: string; // AES-256 ciphertext (base64)
  ivAes: string;            // AES Initialization Vector
  authTag?: string;         // AES-256-GCM Auth Tag
  eccEncryptedAesKey: string; // AES Symmetric Key encrypted with ECC Public Key
  sha256Hash: string;        // SHA-256 hash stored on Hyperledger Fabric
  clsmHash?: string;         // Composite Logistic Sine Map (CLSM) hash
  mheCiphertext?: string;    // Martino Homomorphic Encryption (MHE) payload
  encryptionTimeMs?: number; // Encryption latency in ms
  decryptionTimeMs?: number; // Decryption latency in ms
  fabricTxId: string;        // Hyperledger Fabric Transaction ID
  fileDagCid?: string;       // FileDAG Content Identifier
  createdAt: string;
  prescriptions?: string[];
  labTests?: string[];
  iotDeviceId?: string;      // Associated IoT Healthcare Sensor Device ID
}

// Healthcare & IoT Telemetry Ingestion Model
export interface IotHealthcareReading {
  id: string;
  patientId: string;
  deviceId: string;          // e.g. 'IOT-ECG-9021', 'IOT-PULSE-402'
  deviceType: 'ECG_MONITOR' | 'PULSE_OXIMETER' | 'BLOOD_PRESSURE' | 'GLUCOSE_SENSOR' | 'SMART_BAND';
  timestamp: string;
  heartRateBpm: number;
  spO2Percent: number;
  systolicBp: number;
  diastolicBp: number;
  temperatureC: number;
  clsmHash: string;          // Generated via Composite Logistic Sine Map (CLSM)
  mheCiphertext: string;     // Encrypted via Martino Homomorphic Encryption (MHE)
  encryptionTimeMs: number;
  fileDagCid: string;        // FileDAG storage CID
  fileDagHash: string;       // FileDAG immutability verification hash
  dagParentHashes: string[]; // FileDAG Directed Acyclic Graph parents
  isVerified: boolean;
}

export interface ConsentRecord {
  id: string;
  patientId: string;
  patientName: string;
  doctorId?: string;
  doctorName?: string;
  requestingHospitalId: string;
  requestingHospitalName: string;
  recordId?: string;
  recordTitle?: string;
  status: 'PENDING' | 'GRANTED' | 'REVOKED' | 'EXPIRED';
  purpose: string;
  grantedAt?: string;
  expiresAt?: string;
  fabricTxId: string;
  createdAt: string;
}

// FileDAG Directed Acyclic Graph Block Structure
export interface FileDagNode {
  cid: string;                // Content Identifier (IPFS/DAG CID)
  timestamp: string;
  dagParentHashes: string[];  // Parent tips in the DAG
  clsmHash: string;           // Composite Logistic Sine Map (CLSM) hash
  mheCiphertext: string;      // Martino Homomorphic Encrypted payload
  signature: string;          // ECDSA Digital Signature
  originDeviceOrHospital: string;
  dataSizeKb: number;
  isVerified: boolean;
}

export interface FabricBlock {
  blockIndex: number;
  timestamp: string;
  previousHash: string;
  blockHash: string;
  merkleRoot: string;
  transactionsCount: number;
  channelName: string; // 'health-data-channel'
  endorsingOrgs: string[]; // ['HospitalA_MSP', 'HospitalB_MSP', 'HospitalC_MSP']
  dagParentHashes?: string[];
  fileDagCid?: string;
  clsmHash?: string;
}

export interface FabricTransaction {
  txId: string;
  blockIndex: number;
  timestamp: string;
  chaincode: string; // e.g. 'ConsentContract', 'MedicalRecordRegistry', 'FileDagChaincode'
  functionName: string; // e.g. 'CommitRecordHash', 'StoreFileDag', 'GrantConsent', 'RevokeConsent'
  payloadHash: string;
  clsmHash?: string;
  originHospital: string;
  status: 'VALIDATED' | 'REJECTED';
  endorsedBy: string[];
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  hospitalName: string;
  action: string;
  resourceId?: string;
  ipAddress: string;
  trustImpact: number;
  fabricTxId?: string;
  timestamp: string;
}

export interface TrustScoreFactor {
  id: string;
  targetId: string;
  targetType: 'USER' | 'DOCTOR' | 'HOSPITAL';
  event: string;
  scoreChange: number;
  resultingScore: number;
  reason: string;
  timestamp: string;
}

export interface AIThreatAlert {
  id: string;
  threatType: 'BRUTE_FORCE' | 'SQL_INJECTION' | 'DDOS_SIMULATION' | 'CREDENTIAL_STUFFING' | 'ABNORMAL_BEHAVIOR' | 'EXCESSIVE_DOWNLOADS' | 'MALWARE_INJECTION' | 'BOTNET_TRAFFIC';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  targetUser?: string;
  targetHospital?: string;
  ipAddress: string;
  description: string;
  detectedAt: string;
  status: 'ACTIVE' | 'MITIGATED' | 'INVESTIGATING';
  recommendedAction: string;
  datasetOrigin?: 'ToN-IoT' | 'CICIDS-2017' | 'Realtime_Network';
  idrsnConfidence?: number;
  bstoaOptimized?: boolean;
}

// Benchmark Performance Evaluation Metrics
export interface ModelPerformanceMetrics {
  datasetName: 'ToN-IoT' | 'CICIDS-2017';
  modelArchitecture: 'IDRSN + BSTOA (Proposed System)';
  accuracy: number;         // e.g. 99.42 %
  precision: number;        // e.g. 99.18 %
  recall: number;           // e.g. 99.35 %
  f1Score: number;          // e.g. 99.26 %
  encryptionTimeMs: number; // MHE + CLSM average latency (ms)
  decryptionTimeMs: number; // MHE + CLSM decryption latency (ms)
  totalSamplesTested: number;
  bstoaIterations: number;
}

export interface FederatedModelNode {
  hospitalId: string;
  hospitalName: string;
  localSamples: number;
  localLoss: number;
  localAccuracy: number;
  lastUpdated: string;
  modelWeightsHash: string;
  status: 'TRAINING' | 'SYNCED' | 'AGGREGATING';
}

export interface FederatedRound {
  roundNumber: number;
  timestamp: string;
  globalLoss: number;
  globalAccuracy: number;
  participatingHospitals: string[];
  aggregateWeightsHash: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  timestamp: string;
  read: boolean;
}
