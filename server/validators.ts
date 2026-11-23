import { computeAadhaarHash, hashAadhaar } from './security.js';

export { computeAadhaarHash, hashAadhaar };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

// ============================================================================
// VERHOEFF CHECKSUM ALGORITHM (D5 Dihedral Group)
// ============================================================================

const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const VERHOEFF_INV: number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validates a number string using the Verhoeff algorithm.
 */
export function validateVerhoeff(str: string): boolean {
  if (typeof str !== 'string' || !/^\d+$/.test(str)) {
    return false;
  }
  let c = 0;
  const digits = str.split('').map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}

/**
 * Generates the Verhoeff checksum digit for a number string.
 */
export function generateVerhoeff(str: string): number {
  if (typeof str !== 'string' || !/^\d+$/.test(str)) {
    throw new Error('generateVerhoeff expects a string of digits');
  }
  let c = 0;
  const digits = str.split('').map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[(i + 1) % 8][digits[i]]];
  }
  return VERHOEFF_INV[c];
}

// ============================================================================
// STRING SANITIZATION & CONTROL CHARACTER STRIPPING
// ============================================================================

/**
 * Strips ASCII control characters.
 * If allowMultiline is true, preserves standard whitespace (\t, \n, \r).
 */
export function stripControlChars(str: string, allowMultiline = false): string {
  if (typeof str !== 'string') return '';
  if (allowMultiline) {
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  }
  return str.replace(/[\x00-\x1F\x7F]/g, '');
}

export function cleanInput(input: unknown, allowMultiline = false): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Input must be a string' };
  }
  const cleaned = stripControlChars(input, allowMultiline).trim();
  if (cleaned.length === 0) {
    return { ok: false, error: 'Input cannot be empty or only control characters' };
  }
  return { ok: true, value: cleaned };
}

// ============================================================================
// 1. FULL NAME: 2-80 chars (letters, spaces, . ' -)
// ============================================================================
export function validateFullName(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Full name must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (clean.length < 2) {
    return { ok: false, error: 'Full name must be at least 2 characters long' };
  }
  if (clean.length > 80) {
    return { ok: false, error: 'Full name must not exceed 80 characters' };
  }
  const nameRegex = /^[A-Za-z\u00C0-\u024F\u1E00-\u1EFF\s.'-]+$/;
  if (!nameRegex.test(clean) || !/[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/.test(clean)) {
    return { ok: false, error: 'Full name can only contain letters, spaces, dots, apostrophes, and hyphens' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 2. EMAIL: valid, max 254, lower-cased
// ============================================================================
export function validateEmail(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Email must be a string' };
  }
  const clean = stripControlChars(input).trim().toLowerCase();
  if (!clean) {
    return { ok: false, error: 'Email cannot be empty' };
  }
  if (clean.length > 254) {
    return { ok: false, error: 'Email must not exceed 254 characters' };
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(clean)) {
    return { ok: false, error: 'Invalid email address format' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 3. PASSWORD: 10-128 chars with at least one letter and one number
// ============================================================================
export function validatePassword(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Password must be a string' };
  }
  if (input.length < 10) {
    return { ok: false, error: 'Password must be at least 10 characters long' };
  }
  if (input.length > 128) {
    return { ok: false, error: 'Password must not exceed 128 characters' };
  }
  if (!/[a-zA-Z]/.test(input)) {
    return { ok: false, error: 'Password must contain at least one letter' };
  }
  if (!/[0-9]/.test(input)) {
    return { ok: false, error: 'Password must contain at least one number' };
  }
  return { ok: true, value: input };
}

// ============================================================================
// 4. AADHAAR: exactly 12 digits, first digit 2-9, Verhoeff checksum
// (in simulation mode TEST-AADHAAR-NNNN is accepted instead)
// ============================================================================
export function validateAadhaar(input: unknown, allowSimulation?: boolean): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Aadhaar must be a string' };
  }
  const clean = stripControlChars(input).trim();
  const isSimulation = allowSimulation ?? (process.env.SIMULATION_MODE === 'true');

  if (isSimulation && /^TEST-AADHAAR-\d{4}$/.test(clean)) {
    return { ok: true, value: clean };
  }

  const digits = clean.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(digits)) {
    return { ok: false, error: 'Aadhaar must be exactly 12 digits' };
  }
  if (/^[01]/.test(digits)) {
    return { ok: false, error: 'Aadhaar first digit must be between 2 and 9' };
  }
  if (!validateVerhoeff(digits)) {
    return { ok: false, error: 'Aadhaar failed Verhoeff checksum validation' };
  }
  return { ok: true, value: digits };
}

// ============================================================================
// 5. LICENCE NUMBER: ^[A-Z]{2,4}[-/]?[0-9]{4,10}$ (simulation: TEST-MED-LIC-NNNN)
// ============================================================================
export function validateLicenceNumber(input: unknown, allowSimulation?: boolean): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Licence number must be a string' };
  }
  const clean = stripControlChars(input).trim();
  const isSimulation = allowSimulation ?? (process.env.SIMULATION_MODE === 'true');

  if (isSimulation && /^TEST-MED-LIC-\d{4}$/.test(clean)) {
    return { ok: true, value: clean };
  }

  const licenceRegex = /^[A-Z]{2,4}[-/]?[0-9]{4,10}$/;
  if (!licenceRegex.test(clean)) {
    return { ok: false, error: 'Licence number must match format ^[A-Z]{2,4}[-/]?[0-9]{4,10}$' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 6. HOSPITAL AUTHORIZATION CODE: ^HOSP-ADMIN-AUTH-[0-9]{3}$
// ============================================================================
export function validateHospitalAuthCode(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Hospital authorization code must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (!/^HOSP-ADMIN-AUTH-[0-9]{3}$/.test(clean)) {
    return { ok: false, error: 'Hospital authorization code must match format ^HOSP-ADMIN-AUTH-[0-9]{3}$' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 7. ENUM ALLOW-LISTS: Role, Hospital, Department, Record Type, Device Type, Consent Purpose
// ============================================================================
export const ALLOWED_ROLES = [
  'PATIENT',
  'DOCTOR',
  'HOSPITAL_ADMIN',
  'SYSTEM_ADMIN',
] as const;
export type Role = (typeof ALLOWED_ROLES)[number];

export function validateRole(input: unknown): ValidationResult<Role> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Role must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (!ALLOWED_ROLES.includes(clean as Role)) {
    return { ok: false, error: `Invalid role. Allowed values: ${ALLOWED_ROLES.join(', ')}` };
  }
  return { ok: true, value: clean as Role };
}

export const ALLOWED_HOSPITALS = [
  'hosp-st-jude',
  'hosp-metro-heart',
  'hosp-city-memorial',
  'ST-JUDE',
  'METRO-HCS',
  'CITY-MEM',
  'St. Jude General',
  'Metro Heart & Cancer Specialty',
  'City Memorial',
] as const;

export function validateHospital(input: unknown, allowedList: readonly string[] = ALLOWED_HOSPITALS): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Hospital must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (!allowedList.includes(clean)) {
    return { ok: false, error: 'Hospital identifier not found in approved hospital allow-list' };
  }
  return { ok: true, value: clean };
}

export const ALLOWED_DEPARTMENTS = [
  'dept-stjude-cardio',
  'dept-stjude-genmed',
  'dept-metro-cardio',
  'dept-metro-onco',
  'dept-city-genmed',
  'Cardiology',
  'General Medicine',
  'Oncology',
] as const;

export function validateDepartment(input: unknown, allowedList: readonly string[] = ALLOWED_DEPARTMENTS): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Department must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (!allowedList.includes(clean)) {
    return { ok: false, error: 'Department not found in approved department allow-list' };
  }
  return { ok: true, value: clean };
}

export const ALLOWED_RECORD_TYPES = [
  'Cardiology Report',
  'Diagnostic Report',
  'Prescription',
  'Lab Report',
  'Discharge Summary',
  'General Consultation',
] as const;

export function validateRecordType(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Record type must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (!ALLOWED_RECORD_TYPES.includes(clean as any)) {
    return { ok: false, error: `Invalid record type. Allowed values: ${ALLOWED_RECORD_TYPES.join(', ')}` };
  }
  return { ok: true, value: clean };
}

export const ALLOWED_DEVICE_TYPES = [
  'Heart Rate Monitor',
  'Pulse Oximeter',
  'Blood Pressure Monitor',
  'Thermometer',
  'ECG Monitor',
  'Glucometer',
] as const;

export function validateDeviceType(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Device type must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (!ALLOWED_DEVICE_TYPES.includes(clean as any)) {
    return { ok: false, error: `Invalid device type. Allowed values: ${ALLOWED_DEVICE_TYPES.join(', ')}` };
  }
  return { ok: true, value: clean };
}

export const ALLOWED_CONSENT_PURPOSES = [
  'Treatment',
  'Second opinion',
  'Emergency',
  'Research',
] as const;

export function validateConsentPurpose(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Consent purpose must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (!ALLOWED_CONSENT_PURPOSES.includes(clean as any)) {
    return { ok: false, error: `Invalid consent purpose. Allowed values: ${ALLOWED_CONSENT_PURPOSES.join(', ')}` };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 8. RECORD TITLE: 3-100 chars
// ============================================================================
export function validateRecordTitle(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Record title must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (clean.length < 3) {
    return { ok: false, error: 'Record title must be at least 3 characters long' };
  }
  if (clean.length > 100) {
    return { ok: false, error: 'Record title must not exceed 100 characters' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 9. DIAGNOSIS: coded list (ICD-10 style) plus optional note
// ============================================================================
export const ALLOWED_DIAGNOSES = [
  'I20.9 - Angina pectoris, unspecified',
  'E78.5 - Hyperlipidemia, unspecified',
  'I10 - Essential (primary) hypertension',
  'E11.9 - Type 2 diabetes mellitus without complications',
  'J45.909 - Unspecified asthma, uncomplicated',
  'R07.9 - Chest pain, unspecified',
  'K21.9 - Gastro-esophageal reflux disease without esophagitis',
  'M54.5 - Low back pain, unspecified',
] as const;

export function validateDiagnosis(
  diagnosisInput: unknown,
  optionalNote?: unknown
): ValidationResult<{ diagnosis: string; note?: string }> {
  if (typeof diagnosisInput !== 'string') {
    return { ok: false, error: 'Diagnosis must be a string' };
  }
  const cleanDiag = stripControlChars(diagnosisInput).trim();
  if (!ALLOWED_DIAGNOSES.includes(cleanDiag as any)) {
    return { ok: false, error: 'Invalid diagnosis. Must be chosen from coded ICD-10 list' };
  }

  let note: string | undefined = undefined;
  if (optionalNote !== undefined && optionalNote !== null && optionalNote !== '') {
    if (typeof optionalNote !== 'string') {
      return { ok: false, error: 'Diagnosis note must be a string' };
    }
    const cleanNote = stripControlChars(optionalNote, true).trim();
    if (cleanNote.length > 500) {
      return { ok: false, error: 'Diagnosis note must not exceed 500 characters' };
    }
    if (/<[^>]*>/i.test(cleanNote)) {
      return { ok: false, error: 'Diagnosis note cannot contain HTML tags' };
    }
    note = cleanNote;
  }

  return { ok: true, value: { diagnosis: cleanDiag, ...(note ? { note } : {}) } };
}

// ============================================================================
// 10. CLINICAL NOTE: optional, max 1000 chars, plain text (never HTML)
// ============================================================================
export function validateClinicalNote(input: unknown): ValidationResult<string> {
  if (input === undefined || input === null || input === '') {
    return { ok: true, value: '' };
  }
  if (typeof input !== 'string') {
    return { ok: false, error: 'Clinical note must be a string' };
  }
  const clean = stripControlChars(input, true).trim();
  if (clean.length > 1000) {
    return { ok: false, error: 'Clinical note must not exceed 1000 characters' };
  }
  if (/<[^>]*>/i.test(clean)) {
    return { ok: false, error: 'Clinical note must be plain text and cannot contain HTML tags' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 11. PRESCRIPTION: structured rows (drug from a list, dose, frequency from a list, days 1-365)
// ============================================================================
export const ALLOWED_DRUGS = [
  'Aspirin',
  'Atorvastatin',
  'Metformin',
  'Lisinopril',
  'Amlodipine',
  'Amoxicillin',
  'Omeprazole',
  'Paracetamol',
  'Metoprolol',
  'Azithromycin',
] as const;

export const ALLOWED_FREQUENCIES = [
  'Once daily',
  'Twice daily',
  'Thrice daily',
  'Four times daily',
  'Once daily at bedtime',
  'As needed (PRN)',
  'Every 8 hours',
  'Every 12 hours',
] as const;

export interface PrescriptionItem {
  drug: string;
  dose: string;
  frequency: string;
  days: number;
}

export function validatePrescriptionItem(item: unknown): ValidationResult<PrescriptionItem> {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { ok: false, error: 'Prescription item must be an object' };
  }
  const { drug, dose, frequency, days } = item as Record<string, unknown>;

  if (typeof drug !== 'string' || !ALLOWED_DRUGS.includes(stripControlChars(drug).trim() as any)) {
    return { ok: false, error: 'Invalid prescription drug. Must be chosen from allowed drug list' };
  }

  if (typeof dose !== 'string') {
    return { ok: false, error: 'Prescription dose must be a string' };
  }
  const cleanDose = stripControlChars(dose).trim();
  if (!cleanDose || cleanDose.length > 50) {
    return { ok: false, error: 'Prescription dose must be 1-50 characters' };
  }

  if (typeof frequency !== 'string' || !ALLOWED_FREQUENCIES.includes(stripControlChars(frequency).trim() as any)) {
    return { ok: false, error: 'Invalid prescription frequency. Must be chosen from allowed frequency list' };
  }

  if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
    return { ok: false, error: 'Prescription days must be an integer between 1 and 365' };
  }

  return {
    ok: true,
    value: {
      drug: stripControlChars(drug).trim(),
      dose: cleanDose,
      frequency: stripControlChars(frequency).trim(),
      days,
    },
  };
}

export function validatePrescriptions(input: unknown): ValidationResult<PrescriptionItem[]> {
  if (typeof input === 'string') {
    return { ok: false, error: 'Prescription must be structured rows, never comma-separated text' };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Prescriptions must be an array of structured items' };
  }
  if (input.length === 0) {
    return { ok: false, error: 'At least one prescription item is required' };
  }
  const validatedItems: PrescriptionItem[] = [];
  for (const item of input) {
    const res = validatePrescriptionItem(item);
    if (!res.ok) {
      return res;
    }
    validatedItems.push(res.value);
  }
  return { ok: true, value: validatedItems };
}

// ============================================================================
// 12. LAB TESTS: multi-select from a list
// ============================================================================
export const ALLOWED_LAB_TESTS = [
  'Lipid Panel',
  '12-Lead Electrocardiogram',
  'Troponin I',
  'Complete Blood Count (CBC)',
  'Fasting Blood Glucose',
  'HbA1c',
  'Comprehensive Metabolic Panel',
  'Urinalysis',
  'Liver Function Tests',
  'Thyroid Stimulating Hormone (TSH)',
] as const;

export function validateLabTests(input: unknown): ValidationResult<string[]> {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Lab tests must be an array (multi-select from allowed list)' };
  }
  if (input.length === 0) {
    return { ok: false, error: 'At least one lab test must be selected' };
  }
  const cleanTests: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'Each lab test must be a string' };
    }
    const clean = stripControlChars(item).trim();
    if (!ALLOWED_LAB_TESTS.includes(clean as any)) {
      return { ok: false, error: `Invalid lab test "${clean}". Must be from allowed list` };
    }
    if (!cleanTests.includes(clean)) {
      cleanTests.push(clean);
    }
  }
  return { ok: true, value: cleanTests };
}

// ============================================================================
// 13. CONSENT PURPOSE & OPTIONAL REASON (max 200 chars)
// ============================================================================
export function validateConsentReason(input: unknown): ValidationResult<string> {
  if (input === undefined || input === null || input === '') {
    return { ok: true, value: '' };
  }
  if (typeof input !== 'string') {
    return { ok: false, error: 'Consent reason must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (clean.length > 200) {
    return { ok: false, error: 'Consent reason must not exceed 200 characters' };
  }
  return { ok: true, value: clean };
}

export function validateConsentRequest(
  purposeInput: unknown,
  reasonInput?: unknown
): ValidationResult<{ purpose: string; reason?: string }> {
  const pRes = validateConsentPurpose(purposeInput);
  if (!pRes.ok) return pRes;

  const rRes = validateConsentReason(reasonInput);
  if (!rRes.ok) return rRes;

  return {
    ok: true,
    value: {
      purpose: pRes.value,
      ...(rRes.value ? { reason: rRes.value } : {}),
    },
  };
}

// ============================================================================
// 14. REJECTION REASON: 5-300 chars
// ============================================================================
export function validateRejectionReason(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Rejection reason must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (clean.length < 5) {
    return { ok: false, error: 'Rejection reason must be at least 5 characters long' };
  }
  if (clean.length > 300) {
    return { ok: false, error: 'Rejection reason must not exceed 300 characters' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 15. BREAK-GLASS REASON: 15-300 chars
// ============================================================================
export function validateBreakGlassReason(input: unknown): ValidationResult<string> {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Break-glass reason must be a string' };
  }
  const clean = stripControlChars(input).trim();
  if (clean.length < 15) {
    return { ok: false, error: 'Break-glass reason must be at least 15 characters long' };
  }
  if (clean.length > 300) {
    return { ok: false, error: 'Break-glass reason must not exceed 300 characters' };
  }
  return { ok: true, value: clean };
}

// ============================================================================
// 16. DEVICE READINGS: HR 20-250, SpO2 50-100, Sys 50-260, Dia 30-160, Temp 30-45
// ============================================================================
export function validateHeartRate(val: unknown): ValidationResult<number> {
  if (typeof val !== 'number' || isNaN(val)) {
    return { ok: false, error: 'Heart rate must be a valid number' };
  }
  if (val < 20 || val > 250) {
    return { ok: false, error: 'Heart rate must be between 20 and 250 bpm' };
  }
  return { ok: true, value: val };
}

export function validateSpO2(val: unknown): ValidationResult<number> {
  if (typeof val !== 'number' || isNaN(val)) {
    return { ok: false, error: 'SpO2 must be a valid number' };
  }
  if (val < 50 || val > 100) {
    return { ok: false, error: 'SpO2 must be between 50 and 100 percent' };
  }
  return { ok: true, value: val };
}

export function validateSystolic(val: unknown): ValidationResult<number> {
  if (typeof val !== 'number' || isNaN(val)) {
    return { ok: false, error: 'Systolic blood pressure must be a valid number' };
  }
  if (val < 50 || val > 260) {
    return { ok: false, error: 'Systolic pressure must be between 50 and 260 mmHg' };
  }
  return { ok: true, value: val };
}

export function validateDiastolic(val: unknown): ValidationResult<number> {
  if (typeof val !== 'number' || isNaN(val)) {
    return { ok: false, error: 'Diastolic blood pressure must be a valid number' };
  }
  if (val < 30 || val > 160) {
    return { ok: false, error: 'Diastolic pressure must be between 30 and 160 mmHg' };
  }
  return { ok: true, value: val };
}

export function validateTemperature(val: unknown): ValidationResult<number> {
  if (typeof val !== 'number' || isNaN(val)) {
    return { ok: false, error: 'Temperature must be a valid number' };
  }
  if (val < 30 || val > 45) {
    return { ok: false, error: 'Temperature must be between 30 and 45 °C' };
  }
  return { ok: true, value: val };
}

export interface DeviceReadings {
  heartRate?: number;
  spO2?: number;
  systolic?: number;
  diastolic?: number;
  temperature?: number;
}

export function validateDeviceReadings(input: unknown): ValidationResult<DeviceReadings> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Device readings must be an object' };
  }
  const readings = input as Record<string, unknown>;
  const keys = Object.keys(readings);
  if (keys.length === 0) {
    return { ok: false, error: 'At least one device reading must be provided' };
  }

  const result: DeviceReadings = {};

  if (readings.heartRate !== undefined) {
    const hr = validateHeartRate(readings.heartRate);
    if (!hr.ok) return hr;
    result.heartRate = hr.value;
  }

  if (readings.spO2 !== undefined) {
    const spo2 = validateSpO2(readings.spO2);
    if (!spo2.ok) return spo2;
    result.spO2 = spo2.value;
  }

  if (readings.systolic !== undefined) {
    const sys = validateSystolic(readings.systolic);
    if (!sys.ok) return sys;
    result.systolic = sys.value;
  }

  if (readings.diastolic !== undefined) {
    const dia = validateDiastolic(readings.diastolic);
    if (!dia.ok) return dia;
    result.diastolic = dia.value;
  }

  if (readings.temperature !== undefined) {
    const temp = validateTemperature(readings.temperature);
    if (!temp.ok) return temp;
    result.temperature = temp.value;
  }

  if (result.systolic !== undefined && result.diastolic !== undefined) {
    if (result.systolic <= result.diastolic) {
      return { ok: false, error: 'Systolic pressure must be greater than diastolic pressure' };
    }
  }

  return { ok: true, value: result };
}
