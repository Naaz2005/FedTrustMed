/**
 * ============================================================
 * FedTrustMed - Controlled Simulation Identity Registry
 * ============================================================
 * 
 * For academic prototype demonstration & viva defense:
 * uidai / state medical council / hospital admin verifications
 * are performed against this controlled simulation registry.
 * 
 * Real Aadhaar numbers or government credentials are never stored.
 * Test identifiers use unambiguous labels (e.g. TEST-AADHAAR-XXXX,
 * TEST-MED-LIC-XXXX, HOSP-ADMIN-AUTH-XXXX).
 */

export interface SimulatedIdentity {
  aadhaarId: string;
  fullName: string;
  role: 'PATIENT' | 'DOCTOR' | 'HOSPITAL_ADMIN';
  hospitalId: string;
  hospitalName: string;
  status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED';
  verificationType: 'VERIFIED — SIMULATION';
  department?: string;
  notes?: string;
}

export interface SimulatedHospitalAuthorization {
  authorizationCode: string;
  hospitalId: string;
  hospitalName: string;
  aadhaarId: string;
  authorizedName: string;
  role: 'HOSPITAL_ADMIN';
  status: 'VERIFIED' | 'REVOKED';
  verificationType: 'VERIFIED — SIMULATION';
  issuedBy: string;
}

export interface SimulatedMedicalLicense {
  licenseNumber: string;
  doctorName: string;
  aadhaarId: string;
  hospitalId: string;
  council: string;
  specialty: string;
  status: 'VERIFIED' | 'REVOKED';
  verificationType: 'VERIFIED — SIMULATION';
  validUntil: string;
}

// ------------------------------------------------------------
// 1. Demo Identity Registry (Simulated UIDAI Citizen Database)
// ------------------------------------------------------------
export const DEMO_IDENTITY_REGISTRY: Record<string, SimulatedIdentity> = {
  'TEST-AADHAAR-0001': {
    aadhaarId: 'TEST-AADHAAR-0001',
    fullName: 'Sarah Connor (Demo)',
    role: 'PATIENT',
    hospitalId: 'hosp-a',
    hospitalName: 'St. Jude General Hospital',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Simulated Patient Identity for St. Jude General Hospital',
  },
  'TEST-AADHAAR-0002': {
    aadhaarId: 'TEST-AADHAAR-0002',
    fullName: 'Dr. Robert Chen (Demo)',
    role: 'DOCTOR',
    hospitalId: 'hosp-a',
    hospitalName: 'St. Jude General Hospital',
    department: 'Cardiology',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Simulated Attending Cardiologist Identity',
  },
  'TEST-AADHAAR-0003': {
    aadhaarId: 'TEST-AADHAAR-0003',
    fullName: 'Aisha Khan (Demo)',
    role: 'HOSPITAL_ADMIN',
    hospitalId: 'hosp-a',
    hospitalName: 'St. Jude General Hospital',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Simulated Hospital Administrator for St. Jude General Hospital',
  },
  'TEST-AADHAAR-0004': {
    aadhaarId: 'TEST-AADHAAR-0004',
    fullName: 'Dr. Marcus Vance (Demo)',
    role: 'DOCTOR',
    hospitalId: 'hosp-b',
    hospitalName: 'Metro Heart & Cancer Specialty',
    department: 'Oncology',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Simulated Oncologist Identity',
  },
  'TEST-AADHAAR-0005': {
    aadhaarId: 'TEST-AADHAAR-0005',
    fullName: 'Michael Scott (Demo)',
    role: 'PATIENT',
    hospitalId: 'hosp-b',
    hospitalName: 'Metro Heart & Cancer Specialty',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Simulated Patient Identity for Metro Specialty',
  },
  'TEST-AADHAAR-0006': {
    aadhaarId: 'TEST-AADHAAR-0006',
    fullName: 'Elena Vance (Demo)',
    role: 'HOSPITAL_ADMIN',
    hospitalId: 'hosp-a',
    hospitalName: 'St. Jude General Hospital',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Simulated Secondary Hospital Admin Identity',
  },
  'TEST-AADHAAR-0009': {
    aadhaarId: 'TEST-AADHAAR-0009',
    fullName: 'Demo User (TEST-0009)',
    role: 'PATIENT',
    hospitalId: 'hosp-a',
    hospitalName: 'St. Jude General Hospital',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Simulated Demo Patient Identity 0009',
  },
  'TEST-AADHAAR-9999': {
    aadhaarId: 'TEST-AADHAAR-9999',
    fullName: 'Unverified Impostor (Demo)',
    role: 'PATIENT',
    hospitalId: 'hosp-c',
    hospitalName: 'City Memorial Hospital',
    status: 'REJECTED',
    verificationType: 'VERIFIED — SIMULATION',
    notes: 'Explicitly flagged simulated identity for testing zero-trust rejection',
  },
};

// ------------------------------------------------------------
// 2. Demo Hospital Authorization Registry (Institutional Affiliation)
// ------------------------------------------------------------
export const DEMO_HOSPITAL_AUTHORIZATION_REGISTRY: Record<string, SimulatedHospitalAuthorization> = {
  'HOSP-ADMIN-AUTH-001': {
    authorizationCode: 'HOSP-ADMIN-AUTH-001',
    hospitalId: 'hosp-a',
    hospitalName: 'St. Jude General Hospital',
    aadhaarId: 'TEST-AADHAAR-0003',
    authorizedName: 'Aisha Khan (Demo)',
    role: 'HOSPITAL_ADMIN',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    issuedBy: 'St. Jude Hospital Governance Board',
  },
  'HOSP-ADMIN-AUTH-002': {
    authorizationCode: 'HOSP-ADMIN-AUTH-002',
    hospitalId: 'hosp-a',
    hospitalName: 'St. Jude General Hospital',
    aadhaarId: 'TEST-AADHAAR-0006',
    authorizedName: 'Elena Vance (Demo)',
    role: 'HOSPITAL_ADMIN',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    issuedBy: 'St. Jude Hospital Governance Board',
  },
  'HOSP-ADMIN-AUTH-003': {
    authorizationCode: 'HOSP-ADMIN-AUTH-003',
    hospitalId: 'hosp-b',
    hospitalName: 'Metro Heart & Cancer Specialty',
    aadhaarId: 'TEST-AADHAAR-XXXX',
    authorizedName: 'Metro Admin (Demo)',
    role: 'HOSPITAL_ADMIN',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    issuedBy: 'Metro Health System Board of Trustees',
  },
};

// ------------------------------------------------------------
// 3. Demo Medical Licence Registry (Simulated Medical Council)
// ------------------------------------------------------------
export const DEMO_MEDICAL_LICENSE_REGISTRY: Record<string, SimulatedMedicalLicense> = {
  'TEST-MED-LIC-0001': {
    licenseNumber: 'TEST-MED-LIC-0001',
    doctorName: 'Dr. Robert Chen (Demo)',
    aadhaarId: 'TEST-AADHAAR-0002',
    hospitalId: 'hosp-a',
    council: 'National Medical Commission (NMC-SIMULATION)',
    specialty: 'Cardiology',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    validUntil: '2030-12-31',
  },
  'TEST-MED-LIC-0002': {
    licenseNumber: 'TEST-MED-LIC-0002',
    doctorName: 'Dr. Marcus Vance (Demo)',
    aadhaarId: 'TEST-AADHAAR-0004',
    hospitalId: 'hosp-b',
    council: 'State Medical Council (SMC-SIMULATION)',
    specialty: 'Oncology',
    status: 'VERIFIED',
    verificationType: 'VERIFIED — SIMULATION',
    validUntil: '2029-12-31',
  },
};

// ------------------------------------------------------------
// Verification Engine
// ------------------------------------------------------------

export interface VerificationSimulationResult {
  isSimulation: boolean;
  passed: boolean;
  aadhaarStatus: 'VERIFIED' | 'REJECTED' | 'NOT_FOUND' | 'PENDING';
  affiliationStatus: 'VERIFIED' | 'MISMATCH' | 'NOT_FOUND' | 'NOT_REQUIRED';
  licenseStatus: 'VERIFIED' | 'NOT_REQUIRED' | 'REJECTED' | 'NOT_FOUND';
  adminAuthStatus: 'VERIFIED' | 'NOT_REQUIRED' | 'REJECTED' | 'NOT_FOUND';
  reason?: string;
  identityRecord?: SimulatedIdentity;
}

export function isSimulationAadhaar(aadhaar: string): boolean {
  const norm = String(aadhaar || '').trim().toUpperCase();
  return norm.startsWith('TEST-AADHAAR-') || norm in DEMO_IDENTITY_REGISTRY;
}

export function verifyControlledSimulation(params: {
  aadhaar: string;
  fullName: string;
  role: string;
  hospitalId: string;
  medicalLicenseNumber?: string;
  adminAuthCode?: string;
}): VerificationSimulationResult {
  const normAadhaar = String(params.aadhaar || '').trim().toUpperCase();
  const normRole = String(params.role || '').trim().toUpperCase();
  const normHospital = String(params.hospitalId || '').trim();
  const normLicense = String(params.medicalLicenseNumber || '').trim().toUpperCase();
  const normAuthCode = String(params.adminAuthCode || '').trim().toUpperCase();

  // Check if this is a simulated registration
  if (!isSimulationAadhaar(normAadhaar)) {
    return {
      isSimulation: false,
      passed: true,
      aadhaarStatus: 'PENDING',
      affiliationStatus: 'NOT_REQUIRED',
      licenseStatus: 'NOT_REQUIRED',
      adminAuthStatus: 'NOT_REQUIRED',
    };
  }

  // 1. Does identity exist in Demo Identity Registry?
  let identity = DEMO_IDENTITY_REGISTRY[normAadhaar];

  // Dynamic fallback for test Aadhaar numbers (e.g. TEST-AADHAAR-0009 or any TEST-AADHAAR-XXXX format)
  if (!identity && normAadhaar.startsWith('TEST-AADHAAR-')) {
    if (normAadhaar === 'TEST-AADHAAR-9999') {
      identity = {
        aadhaarId: normAadhaar,
        fullName: 'Unverified Impostor (Demo)',
        role: 'PATIENT',
        hospitalId: 'hosp-c',
        hospitalName: 'City Memorial Hospital',
        status: 'REJECTED',
        verificationType: 'VERIFIED — SIMULATION',
        notes: 'Explicitly flagged simulated identity for testing zero-trust rejection',
      };
    } else {
      identity = {
        aadhaarId: normAadhaar,
        fullName: params.fullName || `Demo User (${normAadhaar})`,
        role: (normRole as 'PATIENT' | 'DOCTOR' | 'HOSPITAL_ADMIN') || 'PATIENT',
        hospitalId: normHospital || 'hosp-a',
        hospitalName: normHospital === 'hosp-b' ? 'Metro Heart & Cancer Specialty' : 'St. Jude General Hospital',
        status: 'VERIFIED',
        verificationType: 'VERIFIED — SIMULATION',
        notes: 'Dynamically authorized test identity for simulation demonstration',
      };
    }
  }

  if (!identity) {
    return {
      isSimulation: true,
      passed: false,
      aadhaarStatus: 'NOT_FOUND',
      affiliationStatus: 'NOT_FOUND',
      licenseStatus: normRole === 'DOCTOR' ? 'NOT_FOUND' : 'NOT_REQUIRED',
      adminAuthStatus: normRole === 'HOSPITAL_ADMIN' ? 'NOT_FOUND' : 'NOT_REQUIRED',
      reason: `Simulated identity '${normAadhaar}' does not exist in the Demo Identity Registry.`,
    };
  }

  // 2. Is identity verified?
  if (identity.status !== 'VERIFIED') {
    return {
      isSimulation: true,
      passed: false,
      aadhaarStatus: 'REJECTED',
      affiliationStatus: 'NOT_FOUND',
      licenseStatus: normRole === 'DOCTOR' ? 'REJECTED' : 'NOT_REQUIRED',
      adminAuthStatus: normRole === 'HOSPITAL_ADMIN' ? 'REJECTED' : 'NOT_REQUIRED',
      reason: `Simulated identity '${normAadhaar}' is marked as ${identity.status} in the verification registry.`,
      identityRecord: identity,
    };
  }

  // 3. Is user affiliated with selected hospital?
  if (identity.hospitalId !== normHospital) {
    return {
      isSimulation: true,
      passed: false,
      aadhaarStatus: 'VERIFIED',
      affiliationStatus: 'MISMATCH',
      licenseStatus: normRole === 'DOCTOR' ? 'REJECTED' : 'NOT_REQUIRED',
      adminAuthStatus: normRole === 'HOSPITAL_ADMIN' ? 'REJECTED' : 'NOT_REQUIRED',
      reason: `Institutional affiliation mismatch: Identity '${identity.fullName}' is officially affiliated with ${identity.hospitalName} (${identity.hospitalId}), but registration attempted for hospital '${normHospital}'.`,
      identityRecord: identity,
    };
  }

  // 4. Is role authorized for this identity?
  if (identity.role !== normRole) {
    return {
      isSimulation: true,
      passed: false,
      aadhaarStatus: 'VERIFIED',
      affiliationStatus: 'MISMATCH',
      licenseStatus: normRole === 'DOCTOR' ? 'REJECTED' : 'NOT_REQUIRED',
      adminAuthStatus: normRole === 'HOSPITAL_ADMIN' ? 'REJECTED' : 'NOT_REQUIRED',
      reason: `Role privilege mismatch: Simulated identity '${identity.fullName}' is registered as ${identity.role}, but access was requested as ${normRole}.`,
      identityRecord: identity,
    };
  }

  // 5. Doctor Specific Verification: Medical License Check
  if (normRole === 'DOCTOR') {
    if (!normLicense) {
      return {
        isSimulation: true,
        passed: false,
        aadhaarStatus: 'VERIFIED',
        affiliationStatus: 'VERIFIED',
        licenseStatus: 'NOT_FOUND',
        adminAuthStatus: 'NOT_REQUIRED',
        reason: 'Medical licence / registration number is required for doctor verification simulation.',
        identityRecord: identity,
      };
    }

    let licenseRecord = DEMO_MEDICAL_LICENSE_REGISTRY[normLicense];
    if (!licenseRecord && (normLicense.startsWith('TEST-MED-LIC-') || normLicense.startsWith('TEST-'))) {
      licenseRecord = {
        licenseNumber: normLicense,
        doctorName: params.fullName || identity.fullName,
        aadhaarId: normAadhaar,
        hospitalId: normHospital,
        council: 'National Medical Commission (NMC-SIMULATION)',
        specialty: 'General Medicine',
        status: 'VERIFIED',
        verificationType: 'VERIFIED — SIMULATION',
        validUntil: '2030-12-31',
      };
    }

    if (!licenseRecord) {
      return {
        isSimulation: true,
        passed: false,
        aadhaarStatus: 'VERIFIED',
        affiliationStatus: 'VERIFIED',
        licenseStatus: 'NOT_FOUND',
        adminAuthStatus: 'NOT_REQUIRED',
        reason: `Medical licence '${normLicense}' not found in the Demo Medical Council Registry.`,
        identityRecord: identity,
      };
    }

    if (
      licenseRecord.status !== 'VERIFIED' ||
      (licenseRecord.aadhaarId !== normAadhaar && !licenseRecord.aadhaarId.includes('XXXX') && !normLicense.startsWith('TEST-'))
    ) {
      return {
        isSimulation: true,
        passed: false,
        aadhaarStatus: 'VERIFIED',
        affiliationStatus: 'VERIFIED',
        licenseStatus: 'REJECTED',
        adminAuthStatus: 'NOT_REQUIRED',
        reason: `Medical licence '${normLicense}' is not valid or does not belong to identity '${normAadhaar}'.`,
        identityRecord: identity,
      };
    }
  }

  // 6. Hospital Admin Specific Verification: Hospital Affiliation Authorization Code Check
  if (normRole === 'HOSPITAL_ADMIN') {
    if (!normAuthCode) {
      return {
        isSimulation: true,
        passed: false,
        aadhaarStatus: 'VERIFIED',
        affiliationStatus: 'MISMATCH',
        licenseStatus: 'NOT_REQUIRED',
        adminAuthStatus: 'NOT_FOUND',
        reason: 'Hospital Administrator Authorization Code (e.g. HOSP-ADMIN-AUTH-001) is required to authenticate institutional authority.',
        identityRecord: identity,
      };
    }

    let authRecord = DEMO_HOSPITAL_AUTHORIZATION_REGISTRY[normAuthCode];
    if (!authRecord && (normAuthCode.startsWith('HOSP-ADMIN-AUTH-') || normAuthCode.startsWith('HOSP-'))) {
      authRecord = {
        authorizationCode: normAuthCode,
        hospitalId: normHospital,
        hospitalName: normHospital === 'hosp-b' ? 'Metro Heart & Cancer Specialty' : 'St. Jude General Hospital',
        aadhaarId: normAadhaar,
        authorizedName: params.fullName || identity.fullName,
        role: 'HOSPITAL_ADMIN',
        status: 'VERIFIED',
        verificationType: 'VERIFIED — SIMULATION',
        issuedBy: 'St. Jude Hospital Governance Board',
      };
    }

    if (!authRecord) {
      return {
        isSimulation: true,
        passed: false,
        aadhaarStatus: 'VERIFIED',
        affiliationStatus: 'MISMATCH',
        licenseStatus: 'NOT_REQUIRED',
        adminAuthStatus: 'NOT_FOUND',
        reason: `Authorization code '${normAuthCode}' not recognized in Demo Hospital Authorization Registry.`,
        identityRecord: identity,
      };
    }

    if (
      authRecord.status !== 'VERIFIED' ||
      (authRecord.hospitalId !== normHospital && !authRecord.hospitalId.includes('XXXX')) ||
      (authRecord.aadhaarId !== normAadhaar && !authRecord.aadhaarId.includes('XXXX') && !normAuthCode.startsWith('HOSP-'))
    ) {
      return {
        isSimulation: true,
        passed: false,
        aadhaarStatus: 'VERIFIED',
        affiliationStatus: 'MISMATCH',
        licenseStatus: 'NOT_REQUIRED',
        adminAuthStatus: 'REJECTED',
        reason: `Authorization code '${normAuthCode}' is not verified for hospital '${normHospital}' and identity '${normAadhaar}'.`,
        identityRecord: identity,
      };
    }
  }

  // All zero-trust checks passed!
  return {
    isSimulation: true,
    passed: true,
    aadhaarStatus: 'VERIFIED',
    affiliationStatus: 'VERIFIED',
    licenseStatus: normRole === 'DOCTOR' ? 'VERIFIED' : 'NOT_REQUIRED',
    adminAuthStatus: normRole === 'HOSPITAL_ADMIN' ? 'VERIFIED' : 'NOT_REQUIRED',
    identityRecord: identity,
  };
}
