import {
  User,
  MedicalRecord,
  FabricBlock,
  FabricTransaction,
  TrustScoreFactor,
  AIThreatAlert,
  FederatedModelNode,
  FederatedRound,
  NotificationItem,
  Hospital,
  Doctor,
  Patient,
} from '../types';

import { realtime } from './realtime';

const API_BASE = '/api';

const TOKEN_KEY = 'fedtrustmed_token';

/*
 * Get the authentication token saved after login.
 */
const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

/*
 * Common request headers.
 *
 * Every API request automatically receives the JWT
 * when the user is authenticated.
 */
const authHeaders = (
  includeJson = false
): HeadersInit => {
  const headers: Record<string, string> = {};

  if (includeJson) {
    headers['Content-Type'] =
      'application/json';
  }

  const token = getToken();

  if (token) {
    headers.Authorization =
      `Bearer ${token}`;
  }

  return headers;
};

/*
 * Save / remove JWT.
 */
export const authToken = {
  get: getToken,

  set: (token: string) => {
    localStorage.setItem(
      TOKEN_KEY,
      token
    );

    /*
     * Tell other tabs that authentication
     * has changed.
     */
    realtime.authChanged();
  },

  clear: () => {
    localStorage.removeItem(TOKEN_KEY);

    /*
     * Tell other tabs that the session
     * has been cleared.
     */
    realtime.logout();
  },
};

export const api = {
  // ============================================================
  // AUTH
  // ============================================================

  login: async (
    email: string,
    password?: string,
    otp?: string
  ) => {
    const res = await fetch(
      `${API_BASE}/auth/login`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          email,
          password,
          otp,
        }),
      }
    );

    const data = await res.json();

    /*
     * Backend returns JWT only after
     * successful authentication.
     */
    if (data.token) {
      authToken.set(data.token);
    }

    return data;
  },

  getSimulationRegistry: async () => {
    const res = await fetch(
      `${API_BASE}/auth/simulation-registry`,
      {
        headers: authHeaders(),
      }
    );
    return res.json();
  },

  register: async (data: any) => {
    const res = await fetch(
      `${API_BASE}/auth/register`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    /*
     * Registration changes shared application
     * data because a new PENDING user is created.
     */
    if (result?.success) {
      realtime.dataChanged(
        'USER_REGISTERED'
      );
    }

    return result;
  },

  getCurrentUser: async () => {
    const res = await fetch(
      `${API_BASE}/auth/me`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  // ============================================================
  // ADMIN USER & ACCESS CONTROL
  // ============================================================

  getPendingUsers: async (): Promise<{
    pendingUsers: User[];
  }> => {
    const res = await fetch(
      `${API_BASE}/admin/pending-users`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  getAllUsers: async (): Promise<{
    users: User[];
  }> => {
    const res = await fetch(
      `${API_BASE}/admin/all-users`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  approveUser: async (data: {
    userId: string;
    permissions: string[];
    role?: string;
  }) => {
    const res = await fetch(
      `${API_BASE}/admin/approve-user`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'USER_APPROVED'
      );
    }

    return result;
  },

  rejectUser: async (data: {
    userId: string;
    reason: string;
  }) => {
    const res = await fetch(
      `${API_BASE}/admin/reject-user`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'USER_REJECTED'
      );
    }

    return result;
  },

  updatePermissions: async (data: {
    userId: string;
    permissions: string[];
  }) => {
    const res = await fetch(
      `${API_BASE}/admin/update-permissions`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'PERMISSIONS_UPDATED'
      );
    }

    return result;
  },

  // ============================================================
  // MEDICAL RECORDS
  // ============================================================

  getMedicalRecords: async (
    patientId?: string
  ) => {
    const url = patientId
      ? `${API_BASE}/medical-records?patientId=${encodeURIComponent(
          patientId
        )}`
      : `${API_BASE}/medical-records`;

    const res = await fetch(url, {
      headers: authHeaders(),
    });

    return res.json();
  },

  createMedicalRecord: async (
    data: any
  ) => {
    const res = await fetch(
      `${API_BASE}/medical-records`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'MEDICAL_RECORD_CREATED'
      );
    }

    return result;
  },

  decryptRecord: async (
    recordId: string,
    userId: string
  ) => {
    const res = await fetch(
      `${API_BASE}/medical-records/decrypt`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          recordId,
          userId,
        }),
      }
    );

    return res.json();
  },

  // ============================================================
  // CONSENT
  // ============================================================

  getConsentRecords: async (
    patientId?: string
  ) => {
    const url = patientId
      ? `${API_BASE}/consent?patientId=${encodeURIComponent(
          patientId
        )}`
      : `${API_BASE}/consent`;

    const res = await fetch(url, {
      headers: authHeaders(),
    });

    return res.json();
  },

  requestConsent: async (
    data: any
  ) => {
    const res = await fetch(
      `${API_BASE}/consent/request`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'CONSENT_REQUESTED'
      );
    }

    return result;
  },

  grantConsent: async (
    consentId: string
  ) => {
    const res = await fetch(
      `${API_BASE}/consent/grant`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          consentId,
        }),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'CONSENT_GRANTED'
      );
    }

    return result;
  },

  revokeConsent: async (
    consentId: string
  ) => {
    const res = await fetch(
      `${API_BASE}/consent/revoke`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          consentId,
        }),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'CONSENT_REVOKED'
      );
    }

    return result;
  },

  // ============================================================
  // BLOCKCHAIN
  // ============================================================

  getBlocks: async (): Promise<{
    blocks: FabricBlock[];
  }> => {
    const res = await fetch(
      `${API_BASE}/blockchain/blocks`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  getTransactions: async (): Promise<{
    transactions: FabricTransaction[];
  }> => {
    const res = await fetch(
      `${API_BASE}/blockchain/transactions`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  verifyBlockchain: async () => {
    const res = await fetch(
      `${API_BASE}/blockchain/verify`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  // ============================================================
  // TRUST ENGINE
  // ============================================================

  getTrustScores: async () => {
    const res = await fetch(
      `${API_BASE}/trust/scores`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  getTrustLogs: async (): Promise<{
    logs: TrustScoreFactor[];
  }> => {
    const res = await fetch(
      `${API_BASE}/trust/logs`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  adjustTrustScore: async (
    data: any
  ) => {
    const res = await fetch(
      `${API_BASE}/trust/adjust`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'TRUST_SCORE_CHANGED'
      );
    }

    return result;
  },

  // ============================================================
  // AI THREAT DETECTION
  // ============================================================

  getThreats: async (): Promise<{
    alerts: AIThreatAlert[];
  }> => {
    const res = await fetch(
      `${API_BASE}/ai/threats`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  simulateAttack: async (data: {
    attackType: string;
    targetUserEmail?: string;
    targetHospitalCode?: string;
  }) => {
    const res = await fetch(
      `${API_BASE}/ai/simulate-attack`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'THREAT_CREATED'
      );
    }

    return result;
  },

  resolveAlert: async (
    alertId: string
  ) => {
    const res = await fetch(
      `${API_BASE}/ai/resolve-alert`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          alertId,
        }),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'THREAT_RESOLVED'
      );
    }

    return result;
  },

  // ============================================================
  // FEDERATED LEARNING
  // ============================================================

  getFederatedStatus: async (): Promise<{
    nodes: FederatedModelNode[];
    rounds: FederatedRound[];
  }> => {
    const res = await fetch(
      `${API_BASE}/federated/status`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  runFederatedRound: async (): Promise<{
    round: FederatedRound;
    nodes: FederatedModelNode[];
  }> => {
    const res = await fetch(
      `${API_BASE}/federated/train-round`,
      {
        method: 'POST',
        headers: authHeaders(),
      }
    );

    const result = await res.json();

    if (result?.round) {
      realtime.dataChanged(
        'FEDERATED_ROUND_COMPLETED'
      );
    }

    return result;
  },

  // ============================================================
  // IOT / FILE DAG
  // ============================================================

  ingestIotData: async (
    data: any
  ) => {
    const res = await fetch(
      `${API_BASE}/iot/ingest`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'IOT_DATA_UPDATED'
      );
    }

    return result;
  },

  getIotReadings: async () => {
    const res = await fetch(
      `${API_BASE}/iot/readings`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  getFileDagNodes: async () => {
    const res = await fetch(
      `${API_BASE}/filedag/nodes`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  verifyFileDagCid: async (
    cid: string
  ) => {
    const res = await fetch(
      `${API_BASE}/filedag/verify`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          cid,
        }),
      }
    );

    return res.json();
  },

  // ============================================================
  // IDRSN
  // ============================================================

  getIdrsnMetrics: async () => {
    const res = await fetch(
      `${API_BASE}/idrsn/metrics`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  classifyTrafficIdrsn: async (
    data: any
  ) => {
    const res = await fetch(
      `${API_BASE}/idrsn/classify`,
      {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(data),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'IDRSN_CLASSIFICATION_UPDATED'
      );
    }

    return result;
  },

  // ============================================================
  // GENERAL
  // ============================================================

  getHospitals: async (): Promise<{
    hospitals: Hospital[];
  }> => {
    const res = await fetch(
      `${API_BASE}/hospitals`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  getDoctors: async (): Promise<{
    doctors: Doctor[];
  }> => {
    const res = await fetch(
      `${API_BASE}/doctors`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  getPatients: async (): Promise<{
    patients: Patient[];
  }> => {
    const res = await fetch(
      `${API_BASE}/patients`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  getNotifications: async (): Promise<{
    notifications: NotificationItem[];
  }> => {
    const res = await fetch(
      `${API_BASE}/notifications`,
      {
        headers: authHeaders(),
      }
    );

    return res.json();
  },

  markNotificationsRead: async () => {
    const res = await fetch(
      `${API_BASE}/notifications/mark-read`,
      {
        method: 'POST',
        headers: authHeaders(),
      }
    );

    const result = await res.json();

    if (result?.success) {
      realtime.dataChanged(
        'NOTIFICATIONS_UPDATED'
      );
    }

    return result;
  },
};