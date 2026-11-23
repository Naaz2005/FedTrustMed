/**
 * FedTrustMed API Client Service
 */

const API_BASE = '';

export interface Hospital {
  id: string;
  name: string;
}

export interface Department {
  id: string;
  name: string;
  hospital_id: string;
}

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

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'PATIENT' | 'DOCTOR' | 'HOSPITAL_ADMIN' | 'SYSTEM_ADMIN';
  hospitalId?: string | null;
  hospitalName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  aadhaarLast4?: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  aadhaarVerificationStatus: string;
  medicalLicenseNumber?: string | null;
  medicalLicenseVerificationStatus?: string;
  adminAuthorizationCode?: string | null;
  affiliationVerificationStatus?: string;
  isFrozen: boolean;
  trustScore: number;
  mfaEnabled: boolean;
  publicKeyEcc?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  success?: boolean;
  token?: string;
  user?: User;
  mfaRequired?: boolean;
  userId?: string;
  message?: string;
  error?: string;
}

export const TOKEN_STORAGE_KEY = 'fedtrustmed_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Don't set Content-Type if sending FormData (browser sets boundary automatically)
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const rawText = await response.text();
  let data: any;
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: rawText || 'Server returned an invalid response' };
  }

  if (!response.ok) {
    const errorMsg = data?.error || `Request failed with status ${response.status}`;
    const err: any = new Error(errorMsg);
    err.status = response.status;
    err.data = data;
    err.error = errorMsg;
    throw err;
  }

  return data;
}

export const api = {
  // -------------------- Doctor UI Helpers --------------------
  // Create a new medical record (PDF + metadata)
  async createDoctorRecord(formData: FormData): Promise<any> {
    // Backend infers doctor from auth token; do NOT send doctorId
    return request('/api/doctors/me/records', { method: 'POST', body: formData });
  },
  // Fetch patients that the logged‑in doctor can treat
  async getDoctorPatients(): Promise<any[]> {
    return request('/api/doctors/me/patients');
  },
  // Fetch records created by the logged‑in doctor
  async getDoctorRecords(): Promise<any[]> {
    return request('/api/doctors/me/records');
  },
  // Request access to a patient’s record
  async requestPatientAccess(patientId: string, purpose: string): Promise<any> {
    return request('/api/doctors/me/access-requests', {
      method: 'POST',
      body: JSON.stringify({ patientId, purpose }),
    });
  },
  // List access requests made by this doctor (pending/granted/denied)
  async getDoctorAccessRequests(): Promise<any[]> {
    return request('/api/doctors/me/access-requests');
  },
  // -----------------------------------------------------------

  // Patient Records PDF retrieval
  async getRecordPdf(recordId: string): Promise<string> {
    // Returns a URL that can be opened directly in a new tab
    const token = getStoredToken();
    // Construct a signed URL; for simplicity we just return the endpoint
    return `${API_BASE}/api/patients/me/records/${encodeURIComponent(recordId)}/pdf?token=${encodeURIComponent(token || '')}`;
  },
  // Existing sharing actions (added previously)
  async approveShare(shareId: string): Promise<any> {
    return request(`/api/consent/${encodeURIComponent(shareId)}/approve`, { method: 'POST' });
  },
  async approveShareOne(shareId: string, recordId: string): Promise<any> {
    return request(`/api/consent/${encodeURIComponent(shareId)}/approve-one`, {
      method: 'POST',
      body: JSON.stringify({ recordId }),
    });
  },
  async denyShare(shareId: string): Promise<any> {
    return request(`/api/consent/${encodeURIComponent(shareId)}/deny`, { method: 'POST' });
  },
  async revokeShare(shareId: string): Promise<any> {
    return request(`/api/consent/${encodeURIComponent(shareId)}/revoke`, { method: 'POST' });
  },
  // Pending share requests (dynamic consent)
  async getPendingShares(): Promise<any[]> {
    const res = await request<{ success: boolean; pending: any[] }>('/api/consent/pending');
    return res.pending || [];
  },

  // Authentication
  async login(payload: { email: string; password: string; otp?: string }): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async register(formData: FormData): Promise<AuthResponse> {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: formData,
    });
  },

  async getCurrentUser(): Promise<{ success: boolean; user: User }> {
    return request<{ success: boolean; user: User }>('/api/auth/me', {
      method: 'GET',
    });
  },

  // Hospitals & Departments
  async getHospitals(): Promise<Hospital[]> {
    return request<Hospital[]>('/api/hospitals', { method: 'GET' });
  },

  async getDepartments(hospitalId?: string): Promise<Department[]> {
    if (hospitalId) {
      return request<Department[]>(`/api/hospitals/${encodeURIComponent(hospitalId)}/departments`, {
        method: 'GET',
      });
    }
    return request<Department[]>('/api/hospitals/departments/all', { method: 'GET' });
  },

  // Simulation Mode Info
  async getSimulationInfo(): Promise<{ simulationMode: boolean; identities: SimulationIdentity[] }> {
    try {
      return await request<{ simulationMode: boolean; identities: SimulationIdentity[] }>(
        '/api/auth/simulation-info',
        { method: 'GET' }
      );
    } catch {
      return { simulationMode: false, identities: [] };
    }
  },

  // Notifications
  async getNotifications(): Promise<AppNotification[]> {
    const res = await request<{ success: boolean; notifications: AppNotification[] }>('/api/notifications', {
      method: 'GET',
    });
    return res.notifications || [];
  },

  async markNotificationRead(id: string): Promise<void> {
    await request(`/api/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
  },

  async markAllNotificationsRead(): Promise<void> {
    await request('/api/notifications/read-all', { method: 'POST' });
  },

  // Admin Approvals (Module M13)
  async getPendingUsers(): Promise<PendingUser[]> {
    const res = await request<{ success: boolean; users: PendingUser[] }>('/api/admin/pending-users', {
      method: 'GET',
    });
    return res.users || [];
  },

  async verifyUserDocuments(payload: {
    userId: string;
    aadhaarVerified?: boolean;
    medicalLicenseVerified?: boolean;
    affiliationVerified?: boolean;
  }): Promise<{ success: boolean; user: User }> {
    return request('/api/admin/verify-user-documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async approveUser(payload: {
    userId: string;
    role?: string;
    permissions?: string[];
  }): Promise<{ success: boolean; message: string; user: User }> {
    return request('/api/admin/approve-user', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async rejectUser(payload: {
    userId: string;
    reason: string;
  }): Promise<{ success: boolean; message: string; user: User }> {
    return request('/api/admin/reject-user', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getAdminDocumentBlob(docId: string): Promise<{ blob: Blob; mime: string; filename: string }> {
    const token = getStoredToken();
    const res = await fetch(`/api/admin/documents/${encodeURIComponent(docId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || `Failed to fetch document (${res.status})`);
    }
    const blob = await res.blob();
    const mime = res.headers.get('content-type') || 'application/octet-stream';
    const disposition = res.headers.get('content-disposition') || '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match ? decodeURIComponent(match[1]) : 'document';
    return { blob, mime, filename };
  },

  // Patient APIs
  async getPatientProfile(): Promise<any> {
    const res = await request<{ success: boolean; patient: any }>('/api/patients/me');
    return res.patient;
  },

  async getPatientRecords(): Promise<any[]> {
    const res = await request<{ success: boolean; records: any[] }>('/api/patients/me/records');
    return res.records || [];
  },

  async getConsents(): Promise<any[]> {
    const res = await request<{ success: boolean; consents: any[] }>('/api/consent');
    return res.consents || [];
  },

  async createConsent(data: { doctorName: string; hospitalName: string; purpose: string; validityDays: number }): Promise<any> {
    return request('/api/consent', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async revokeConsent(id: string): Promise<any> {
    return request(`/api/consent/${encodeURIComponent(id)}/revoke`, {
      method: 'POST',
    });
  },

  // Doctor & Hospital Admin APIs
  async getAllRecords(): Promise<any[]> {
    const res = await request<{ success: boolean; records: any[] }>('/api/records');
    return res.records || [];
  },

  async getAllPatients(): Promise<any[]> {
    const res = await request<{ success: boolean; patients: any[] }>('/api/patients');
    return res.patients || [];
  },

  async getHospitalOverview(): Promise<{ hospitalId: string; hospitalName: string; doctorsCount: number; patientsCount: number; pendingStaffCount: number }> {
    return request('/api/hospital/overview');
  },

  async getHospitalStaff(): Promise<any[]> {
    const res = await request<{ success: boolean; staff: any[] }>('/api/hospital/staff');
    return res.staff || [];
  },

  async getHospitalPatients(): Promise<any[]> {
    const res = await request<{ success: boolean; patients: any[] }>('/api/hospital/patients');
    return res.patients || [];
  },

  async getHospitalPendingApprovals(): Promise<any[]> {
    const res = await request<{ success: boolean; approvals: any[]; pendingStaff?: any[] }>('/api/hospital/pending-approvals');
    return res.approvals || res.pendingStaff || [];
  },

  async getHospitalActivity(): Promise<any[]> {
    const res = await request<{ success: boolean; logs: any[]; activity?: any[] }>('/api/hospital/activity');
    return res.logs || res.activity || [];
  },

  // System Admin APIs
  async getAdminUsers(): Promise<any[]> {
    const res = await request<{ success: boolean; users: any[] }>('/api/admin/users');
    return res.users || [];
  },

  async getAdminOverviewStats(): Promise<{
    pendingApprovals: number;
    health: {
      activeHospitalNodes: number;
      keyVaultStatus: string;
      sealedKeysCount: number;
      auditLedgerStatus: string;
      auditEventsCount: number;
    };
  }> {
    return request('/api/admin/overview-stats');
  },

  async getAdminAuditLogs(): Promise<any[]> {
    const res = await request<{ success: boolean; logs: any[] }>('/api/admin/audit-logs');
    return res.logs || [];
  },

  async toggleFreezeUser(userId: string, isFrozen: boolean, reason: string): Promise<any> {
    return request('/api/admin/toggle-freeze', {
      method: 'POST',
      body: JSON.stringify({ userId, isFrozen, reason }),
    });
  },

  async updateUserPermissions(userId: string, permissions: string[]): Promise<any> {
    return request('/api/admin/update-permissions', {
      method: 'POST',
      body: JSON.stringify({ userId, permissions }),
    });
  },

  // Audit Ledger (Module M24)
  async getLedgerBlocks(): Promise<{ success: boolean; count: number; blocks: LedgerBlock[] }> {
    return request('/api/admin/ledger/blocks', { method: 'GET' });
  },

  async verifyLedger(): Promise<{ success: boolean; result: ChainVerificationResult }> {
    return request('/api/admin/ledger/verify', { method: 'POST' });
  },

  // Account Safety & Trust Engine (Module M25)
  async getAccountSafety(): Promise<{ success: boolean; threshold: number; users: any[] }> {
    return request('/api/admin/account-safety', { method: 'GET' });
  },

  async getTrustEvents(userId?: string): Promise<{ success: boolean; count: number; events: any[] }> {
    const endpoint = userId ? `/api/admin/trust-events/${encodeURIComponent(userId)}` : '/api/admin/trust-events';
    return request(endpoint, { method: 'GET' });
  },

  async adjustTrustScore(userId: string, delta: number, reason: string): Promise<any> {
    return request('/api/admin/adjust-trust-score', {
      method: 'POST',
      body: JSON.stringify({ userId, delta, reason }),
    });
  },
};

export interface BlockSignature {
  orgId: string;
  publicKey: string;
  signature: string;
}

export interface LedgerTransaction {
  id: string;
  blockIndex: number;
  txHash: string;
  txType: 'CONSENT_GRANTED' | 'CONSENT_REVOKED' | 'RECORD_CREATED' | 'FILE_ANCHORED' | 'BREAK_GLASS_USED' | 'GENESIS';
  actorId?: string;
  actorRole?: string;
  hospitalId?: string;
  resourceId?: string;
  payload: Record<string, any>;
  timestamp: string;
}

export interface LedgerBlock {
  index: number;
  blockHash: string;
  prevHash: string;
  merkleRoot: string;
  timestamp: string;
  signatures: BlockSignature[];
  transactions: LedgerTransaction[];
  createdAt?: string;
}

export interface BlockVerificationDetail {
  index: number;
  blockHash: string;
  valid: boolean;
  status: 'VERIFIED' | 'LEGACY_UNSIGNED' | 'INVALID';
  validSignaturesCount: number;
  totalSignaturesCount: number;
  error?: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalBlocks: number;
  verifiedBlocks: number;
  legacyUnsignedBlocks: number;
  quorumPassedBlocks: number;
  errors: string[];
  details: BlockVerificationDetail[];
}

export interface DocumentMeta {
  id: string;
  kind: string;
  originalName: string;
  mime: string;
  size: number;
  createdAt: string;
}

export interface PendingUser extends User {
  documents?: DocumentMeta[];
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'INFO' | 'WARNING' | 'ALERT' | 'SUCCESS';
  read: boolean;
  created_at: string;
}
