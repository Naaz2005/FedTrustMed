/**
 * Simulation Registry (Module M9)
 * Provides pre-seeded synthetic test identities for onboarding research simulations.
 * Enforces identity bindings when SIMULATION_MODE=true and rejects test values when disabled.
 */

export interface SimulationIdentity {
  aadhaar: string;
  fullName: string;
  role: 'PATIENT' | 'DOCTOR' | 'HOSPITAL_ADMIN' | 'SYSTEM_ADMIN';
  hospitalId: string | null;
  hospitalName: string | null;
  hospitalCode: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  medicalLicenseNumber?: string | null;
  adminAuthorizationCode?: string | null;
  description: string;
}

export const SIMULATION_IDENTITIES: Record<string, SimulationIdentity> = {
  'TEST-AADHAAR-0001': {
    aadhaar: 'TEST-AADHAAR-0001',
    fullName: 'Aarav Sharma',
    role: 'PATIENT',
    hospitalId: 'hosp-st-jude',
    hospitalName: 'St. Jude General',
    hospitalCode: 'ST-JUDE',
    description: 'Demo Patient registered at St. Jude General Hospital',
  },
  'TEST-AADHAAR-0002': {
    aadhaar: 'TEST-AADHAAR-0002',
    fullName: 'Dr. Priya Patel',
    role: 'DOCTOR',
    hospitalId: 'hosp-st-jude',
    hospitalName: 'St. Jude General',
    hospitalCode: 'ST-JUDE',
    departmentId: 'dept-stjude-cardio',
    departmentName: 'Cardiology',
    medicalLicenseNumber: 'TEST-MED-LIC-0001',
    description: 'Demo Doctor (Cardiology) at St. Jude General Hospital',
  },
  'TEST-AADHAAR-0003': {
    aadhaar: 'TEST-AADHAAR-0003',
    fullName: 'Rajesh Verma',
    role: 'HOSPITAL_ADMIN',
    hospitalId: 'hosp-st-jude',
    hospitalName: 'St. Jude General',
    hospitalCode: 'ST-JUDE',
    adminAuthorizationCode: 'HOSP-ADMIN-AUTH-001',
    description: 'Demo Hospital Administrator for St. Jude General Hospital',
  },
  'TEST-AADHAAR-0004': {
    aadhaar: 'TEST-AADHAAR-0004',
    fullName: 'Vikram Malhotra',
    role: 'SYSTEM_ADMIN',
    hospitalId: null,
    hospitalName: null,
    hospitalCode: null,
    description: 'Demo System Administrator for FedTrustMed Network',
  },
  'TEST-AADHAAR-0005': {
    aadhaar: 'TEST-AADHAAR-0005',
    fullName: 'Dr. Rajesh Gupta',
    role: 'DOCTOR',
    hospitalId: 'hosp-metro-heart',
    hospitalName: 'Metro Heart & Cancer Specialty',
    hospitalCode: 'METRO-HCS',
    departmentId: 'dept-metro-cardio',
    departmentName: 'Cardiology',
    medicalLicenseNumber: 'TEST-MED-LIC-0002',
    description: 'Demo Doctor (Cardiology) at Metro Heart & Cancer Specialty',
  },
  'TEST-AADHAAR-0006': {
    aadhaar: 'TEST-AADHAAR-0006',
    fullName: 'Sunita Rao',
    role: 'HOSPITAL_ADMIN',
    hospitalId: 'hosp-metro-heart',
    hospitalName: 'Metro Heart & Cancer Specialty',
    hospitalCode: 'METRO-HCS',
    adminAuthorizationCode: 'HOSP-ADMIN-AUTH-002',
    description: 'Demo Hospital Administrator for Metro Heart & Cancer Specialty',
  },
  'TEST-AADHAAR-0009': {
    aadhaar: 'TEST-AADHAAR-0009',
    fullName: 'Meera Iyer',
    role: 'HOSPITAL_ADMIN',
    hospitalId: 'hosp-city-memorial',
    hospitalName: 'City Memorial',
    hospitalCode: 'CITY-MEM',
    adminAuthorizationCode: 'HOSP-ADMIN-AUTH-003',
    description: 'Demo Hospital Administrator for City Memorial',
  },
};

/**
 * Returns true if simulation mode is active.
 */
export function isSimulationMode(): boolean {
  return process.env.SIMULATION_MODE === 'true';
}

/**
 * Checks if a string contains a simulation test prefix or identifier.
 */
export function isTestIdentifier(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const clean = val.trim();
  return clean.startsWith('TEST-') || clean.includes('-9999');
}

export interface SimulationVerificationResult {
  ok: boolean;
  error?: string;
  isSimulation: boolean;
  identity?: SimulationIdentity;
}

/**
 * Normalizes human names by trimming, converting to lower case,
 * and stripping professional titles like "Dr." or "Doctor".
 */
function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^(dr|doctor)\.?\s+/i, '')
    .replace(/[\s.'-]+/g, ' ');
}

/**
 * Verifies simulation identities against the registry during registration onboarding.
 */
export function verifySimulationOnboarding(params: {
  aadhaar: string;
  fullName: string;
  role: string;
  hospitalId?: string | null;
  medicalLicenseNumber?: string | null;
  adminAuthorizationCode?: string | null;
}): SimulationVerificationResult {
  const {
    aadhaar,
    fullName,
    role,
    hospitalId,
    medicalLicenseNumber,
    adminAuthorizationCode,
  } = params;

  const hasTestValue =
    isTestIdentifier(aadhaar) ||
    isTestIdentifier(medicalLicenseNumber) ||
    isTestIdentifier(adminAuthorizationCode);

  // If not a simulation identifier, proceed with regular production checks
  if (!hasTestValue) {
    return { ok: true, isSimulation: false };
  }

  // If simulation mode flag is disabled, reject any test identifiers
  if (!isSimulationMode()) {
    return {
      ok: false,
      isSimulation: true,
      error: 'Simulation test identities are not accepted when SIMULATION_MODE is disabled.',
    };
  }

  // Rejection check for designated failure test identifiers (-9999)
  if (
    aadhaar.includes('-9999') ||
    (medicalLicenseNumber && medicalLicenseNumber.includes('-9999')) ||
    (adminAuthorizationCode && adminAuthorizationCode.includes('-9999'))
  ) {
    return {
      ok: false,
      isSimulation: true,
      error: `Simulation verification failed: Identity is designated for failure testing (-9999 is always rejected).`,
    };
  }

  // Look up Aadhaar in the simulation registry
  const identity = SIMULATION_IDENTITIES[aadhaar];
  if (!identity) {
    return {
      ok: false,
      isSimulation: true,
      error: `Simulation verification failed: Unknown simulation Aadhaar identity "${aadhaar}". Allowed: TEST-AADHAAR-0001..0006, 0009.`,
    };
  }

  // 1. Verify Full Name binding
  const normProvided = normalizeName(fullName);
  const normExpected = normalizeName(identity.fullName);
  if (normProvided !== normExpected) {
    return {
      ok: false,
      isSimulation: true,
      error: `Simulation verification failed: Name mismatch for ${aadhaar} (expected "${identity.fullName}", got "${fullName}").`,
    };
  }

  // 2. Verify Role binding
  if (role !== identity.role) {
    return {
      ok: false,
      isSimulation: true,
      error: `Simulation verification failed: Role mismatch for ${aadhaar} (expected "${identity.role}", got "${role}").`,
    };
  }

  // 3. Verify Hospital binding (if specified in registry)
  if (identity.hospitalId) {
    const providedHosp = hospitalId?.trim();
    if (!providedHosp) {
      return {
        ok: false,
        isSimulation: true,
        error: `Simulation verification failed: Hospital is required for ${role} with ${aadhaar} (expected "${identity.hospitalName}").`,
      };
    }

    const matchesHospital =
      providedHosp === identity.hospitalId ||
      providedHosp.toLowerCase() === identity.hospitalName?.toLowerCase() ||
      providedHosp.toUpperCase() === identity.hospitalCode?.toUpperCase();

    if (!matchesHospital) {
      return {
        ok: false,
        isSimulation: true,
        error: `Simulation verification failed: Hospital mismatch for ${aadhaar} (expected "${identity.hospitalName}", got "${providedHosp}").`,
      };
    }
  }

  // 4. Verify Doctor Medical Licence binding
  if (identity.role === 'DOCTOR') {
    const providedLic = medicalLicenseNumber?.trim();
    if (!providedLic) {
      return {
        ok: false,
        isSimulation: true,
        error: `Simulation verification failed: Medical licence is required for doctor ${aadhaar} (expected "${identity.medicalLicenseNumber}").`,
      };
    }
    if (providedLic !== identity.medicalLicenseNumber) {
      return {
        ok: false,
        isSimulation: true,
        error: `Simulation verification failed: Medical licence mismatch for ${aadhaar} (expected "${identity.medicalLicenseNumber}", got "${providedLic}").`,
      };
    }
  }

  // 5. Verify Hospital Admin Authorization Code binding
  if (identity.role === 'HOSPITAL_ADMIN') {
    const providedCode = adminAuthorizationCode?.trim();
    if (!providedCode) {
      return {
        ok: false,
        isSimulation: true,
        error: `Simulation verification failed: Authorization code is required for hospital admin ${aadhaar} (expected "${identity.adminAuthorizationCode}").`,
      };
    }
    if (providedCode !== identity.adminAuthorizationCode) {
      return {
        ok: false,
        isSimulation: true,
        error: `Simulation verification failed: Authorization code mismatch for ${aadhaar} (expected "${identity.adminAuthorizationCode}", got "${providedCode}").`,
      };
    }
  }

  return {
    ok: true,
    isSimulation: true,
    identity,
  };
}

/**
 * Returns safe metadata for all available test identities to list on demo pages.
 */
export function getSimulationRegistryList(): SimulationIdentity[] {
  return Object.values(SIMULATION_IDENTITIES);
}
