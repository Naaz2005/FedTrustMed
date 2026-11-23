import crypto from 'crypto';
import { pool } from './db.js';
import { recordFailedLogin, recordDeniedAccess, recordTrustEvent } from './trustEngine.js';

export const THREAT_RULES = {
  BRUTE_FORCE: 'RULE_BRUTE_FORCE',
  REQUEST_FLOODING: 'RULE_REQUEST_FLOODING',
  PRIVILEGE_ESCALATION: 'RULE_PRIVILEGE_ESCALATION',
  ABNORMAL_READ_VOLUME: 'RULE_ABNORMAL_READ_VOLUME',
} as const;

export type ThreatRuleType = (typeof THREAT_RULES)[keyof typeof THREAT_RULES];

export interface ThreatAlert {
  id: string;
  rule: ThreatRuleType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  evidence: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  targetIp: string;
  resolved: boolean;
  createdAt: string;
}

// In-memory sliding window trackers for transparent rule evaluation
interface TimestampedEvent {
  timestamp: number;
}

interface RecordAccessEvent extends TimestampedEvent {
  recordId: string;
}

// Brute force tracker: Map<identifier, TimestampedEvent[]>
const failedLoginTracker = new Map<string, TimestampedEvent[]>();
// Request flooding tracker: Map<ip, TimestampedEvent[]>
const requestFloodingTracker = new Map<string, TimestampedEvent[]>();
// Abnormal read volume tracker: Map<userId, RecordAccessEvent[]>
const recordAccessTracker = new Map<string, RecordAccessEvent[]>();

// Threshold constants
const BRUTE_FORCE_WINDOW_MS = 180 * 1000; // 3 minutes
const BRUTE_FORCE_THRESHOLD = 3; // >= 3 attempts

const FLOODING_WINDOW_MS = 10 * 1000; // 10 seconds
const FLOODING_THRESHOLD = 20; // >= 20 requests

const ABNORMAL_READ_WINDOW_MS = 30 * 1000; // 30 seconds
const ABNORMAL_READ_THRESHOLD = 5; // >= 5 distinct records

/**
 * Persists a generated ThreatAlert into the database.
 */
async function saveThreatAlert(alert: Omit<ThreatAlert, 'id' | 'createdAt' | 'resolved'>): Promise<ThreatAlert> {
  const id = `alert-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await pool.query(
    `INSERT INTO threat_alerts (id, rule, severity, evidence, target_user_id, target_ip, resolved, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW())`,
    [id, alert.rule, alert.severity, alert.evidence, alert.targetUserId || null, alert.targetIp]
  );

  return {
    id,
    rule: alert.rule,
    severity: alert.severity,
    evidence: alert.evidence,
    targetUserId: alert.targetUserId || null,
    targetEmail: alert.targetEmail || null,
    targetIp: alert.targetIp,
    resolved: false,
    createdAt: now,
  };
}

/**
 * 1. RULE_BRUTE_FORCE:
 * Evaluates failed authentication attempts against an account or IP.
 * Fires when >= 3 failed logins occur within 3 minutes.
 */
export async function recordFailedAttempt(params: {
  targetIdentifier: string; // userId or email
  ip: string;
  userId?: string;
  email?: string;
}): Promise<ThreatAlert | null> {
  const { targetIdentifier, ip, userId, email } = params;
  const now = Date.now();
  const key = `${targetIdentifier}:${ip}`;

  const history = failedLoginTracker.get(key) || [];
  // Prune expired events outside sliding window
  const activeHistory = history.filter((e) => now - e.timestamp <= BRUTE_FORCE_WINDOW_MS);
  activeHistory.push({ timestamp: now });
  failedLoginTracker.set(key, activeHistory);

  if (activeHistory.length >= BRUTE_FORCE_THRESHOLD) {
    const durationSec = Math.max(1, Math.round((now - activeHistory[0].timestamp) / 1000));
    const evidence = `${activeHistory.length} consecutive failed authentication attempts recorded within ${durationSec}s for target ${targetIdentifier} from IP ${ip}`;

    // Reset tracker for this key so we don't spam duplicate alerts on every single subsequent failure
    failedLoginTracker.delete(key);

    const alert = await saveThreatAlert({
      rule: THREAT_RULES.BRUTE_FORCE,
      severity: 'HIGH',
      evidence,
      targetUserId: userId || null,
      targetEmail: email || targetIdentifier,
      targetIp: ip,
    });

    return alert;
  }

  return null;
}

/**
 * 2. RULE_REQUEST_FLOODING:
 * Evaluates request burst frequency.
 * Fires when >= 20 requests occur within 10 seconds.
 */
export async function recordRequest(params: {
  ip: string;
  userId?: string;
}): Promise<ThreatAlert | null> {
  const { ip, userId } = params;
  const now = Date.now();

  const history = requestFloodingTracker.get(ip) || [];
  const activeHistory = history.filter((e) => now - e.timestamp <= FLOODING_WINDOW_MS);
  activeHistory.push({ timestamp: now });
  requestFloodingTracker.set(ip, activeHistory);

  if (activeHistory.length >= FLOODING_THRESHOLD) {
    const durationSec = Math.max(1, Math.round((now - activeHistory[0].timestamp) / 1000));
    const evidence = `High-frequency request flooding: ${activeHistory.length} requests recorded within ${durationSec}s from IP ${ip} (threshold: ${FLOODING_THRESHOLD} req / 10s)`;

    requestFloodingTracker.delete(ip);

    const alert = await saveThreatAlert({
      rule: THREAT_RULES.REQUEST_FLOODING,
      severity: 'MEDIUM',
      evidence,
      targetUserId: userId || null,
      targetIp: ip,
    });

    return alert;
  }

  return null;
}

/**
 * 3. RULE_PRIVILEGE_ESCALATION:
 * Fires when an actor attempts an administrative or unauthorized action outside their role.
 */
export async function recordPrivilegeEscalationAttempt(params: {
  userId: string;
  role: string;
  attemptedAction: string;
  ip: string;
  email?: string;
}): Promise<ThreatAlert> {
  const { userId, role, attemptedAction, ip, email } = params;

  // Evidence showing exact rule that fired and concrete proof
  const evidence = `Unauthorized privilege escalation: Actor ${email || userId} (role: ${role}) attempted unauthorized execution of restricted action [${attemptedAction}] from IP ${ip}`;

  // Automatically lower the actor's trust score via the real trust pipeline (-20 delta)
  await recordDeniedAccess(userId, `Privilege escalation attempt: ${attemptedAction}`).catch((err) =>
    console.error('[ThreatEngine] Failed to lower trust on privilege escalation:', err)
  );

  const alert = await saveThreatAlert({
    rule: THREAT_RULES.PRIVILEGE_ESCALATION,
    severity: 'CRITICAL',
    evidence,
    targetUserId: userId,
    targetEmail: email || null,
    targetIp: ip,
  });

  return alert;
}

/**
 * 4. RULE_ABNORMAL_READ_VOLUME:
 * Fires when an actor queries/decrypts >= 5 distinct medical records within 30 seconds.
 */
export async function recordRecordAccess(params: {
  userId: string;
  recordId: string;
  ip: string;
  email?: string;
}): Promise<ThreatAlert | null> {
  const { userId, recordId, ip, email } = params;
  const now = Date.now();

  const history = recordAccessTracker.get(userId) || [];
  const activeHistory = history.filter((e) => now - e.timestamp <= ABNORMAL_READ_WINDOW_MS);
  activeHistory.push({ timestamp: now, recordId });
  recordAccessTracker.set(userId, activeHistory);

  const distinctRecords = new Set(activeHistory.map((e) => e.recordId));

  if (distinctRecords.size >= ABNORMAL_READ_THRESHOLD) {
    const durationSec = Math.max(1, Math.round((now - activeHistory[0].timestamp) / 1000));
    const evidence = `Abnormal medical record decryption volume: ${distinctRecords.size} distinct patient records accessed within ${durationSec}s by user ${email || userId} (baseline: ${ABNORMAL_READ_THRESHOLD} records / 30s)`;

    recordAccessTracker.delete(userId);

    // Lower trust score due to anomalous exfiltration behavior
    await recordTrustEvent({
      userId,
      eventType: 'OFF_HOURS_ACCESS',
      reason: `Anomalous batch record reading volume: ${distinctRecords.size} records in ${durationSec}s`,
      delta: -15.0,
    }).catch(console.error);

    const alert = await saveThreatAlert({
      rule: THREAT_RULES.ABNORMAL_READ_VOLUME,
      severity: 'HIGH',
      evidence,
      targetUserId: userId,
      targetEmail: email || null,
      targetIp: ip,
    });

    return alert;
  }

  return null;
}

/**
 * Real Attack Simulator:
 * Accessible ONLY by SYSTEM_ADMIN.
 * Executes REAL pipeline events that lower trust and trigger the transparent rules.
 */
export async function simulateAttack(params: {
  attackType: 'BRUTE_FORCE' | 'PRIVILEGE_ESCALATION' | 'REQUEST_FLOODING' | 'ABNORMAL_READ_VOLUME' | string;
  targetUserId?: string;
  targetEmail?: string;
  ip?: string;
  adminUser?: any;
}): Promise<{ success: boolean; alert: ThreatAlert; trustResult?: any }> {
  const { attackType, targetUserId, targetEmail, ip, adminUser } = params;
  const simulationIp = ip || '198.51.100.42'; // RFC 5737 Test Net IP

  // Resolve target user from DB if not provided
  let user: any = null;
  if (targetUserId) {
    const uRes = await pool.query('SELECT id, email, full_name, role, trust_score, is_frozen FROM users WHERE id = $1', [targetUserId]);
    user = uRes.rows[0];
  } else if (targetEmail) {
    const uRes = await pool.query('SELECT id, email, full_name, role, trust_score, is_frozen FROM users WHERE email = $1', [targetEmail]);
    user = uRes.rows[0];
  } else {
    // Default simulation target: first active patient or doctor
    const uRes = await pool.query("SELECT id, email, full_name, role, trust_score, is_frozen FROM users WHERE role = 'PATIENT' LIMIT 1");
    user = uRes.rows[0];
  }

  if (!user && (attackType === 'BRUTE_FORCE' || attackType === 'PRIVILEGE_ESCALATION' || attackType === 'ABNORMAL_READ_VOLUME')) {
    throw new Error('No target user found for simulation');
  }

  switch (attackType) {
    case 'BRUTE_FORCE': {
      // Execute 3 real failed logins through the trust engine pipeline
      let lastTrustResult: any = null;
      for (let i = 1; i <= 3; i++) {
        lastTrustResult = await recordFailedLogin(user.id, `Simulated brute force failed attempt ${i} of 3`);
      }

      // Record in threat tracker to trigger RULE_BRUTE_FORCE
      for (let i = 1; i < 3; i++) {
        await recordFailedAttempt({
          targetIdentifier: user.email,
          ip: simulationIp,
          userId: user.id,
          email: user.email,
        });
      }
      // 3rd attempt triggers the rule
      const alert = await recordFailedAttempt({
        targetIdentifier: user.email,
        ip: simulationIp,
        userId: user.id,
        email: user.email,
      });

      if (!alert) {
        throw new Error('Brute force rule failed to fire on threshold');
      }

      return {
        success: true,
        alert,
        trustResult: lastTrustResult,
      };
    }

    case 'PRIVILEGE_ESCALATION': {
      // Simulate low-privilege user attempting unauthorized admin route
      const alert = await recordPrivilegeEscalationAttempt({
        userId: user.id,
        role: user.role,
        attemptedAction: 'POST /api/admin/security/simulate-attack',
        ip: simulationIp,
        email: user.email,
      });

      return {
        success: true,
        alert,
      };
    }

    case 'REQUEST_FLOODING': {
      // Generate request burst past threshold (20 req in 10s)
      for (let i = 0; i < 19; i++) {
        await recordRequest({ ip: simulationIp, userId: user?.id });
      }
      const alert = await recordRequest({ ip: simulationIp, userId: user?.id });
      if (!alert) {
        throw new Error('Request flooding rule failed to fire on threshold');
      }

      return {
        success: true,
        alert,
      };
    }

    case 'ABNORMAL_READ_VOLUME': {
      // Generate 5 distinct record read events in rapid sequence
      for (let i = 1; i <= 4; i++) {
        await recordRecordAccess({
          userId: user.id,
          recordId: `sim-rec-${i}`,
          ip: simulationIp,
          email: user.email,
        });
      }
      const alert = await recordRecordAccess({
        userId: user.id,
        recordId: 'sim-rec-5',
        ip: simulationIp,
        email: user.email,
      });
      if (!alert) {
        throw new Error('Abnormal read volume rule failed to fire on threshold');
      }

      return {
        success: true,
        alert,
      };
    }

    default:
      throw new Error(`Unknown attack type: ${attackType}`);
  }
}

/**
 * Returns all real detected threat alerts from PostgreSQL.
 * Transparent: shows exact rule and evidence, no seeded alerts, no invented percentages.
 */
export async function getThreatAlerts(limit: number = 100): Promise<ThreatAlert[]> {
  const result = await pool.query(
    `SELECT ta.id, ta.rule, ta.severity, ta.evidence, ta.target_user_id, ta.target_ip, ta.resolved, ta.created_at,
            u.email AS target_email
     FROM threat_alerts ta
     LEFT JOIN users u ON ta.target_user_id = u.id
     ORDER BY ta.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    rule: row.rule as ThreatRuleType,
    severity: row.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM',
    evidence: row.evidence,
    targetUserId: row.target_user_id,
    targetEmail: row.target_email || null,
    targetIp: row.target_ip,
    resolved: row.resolved,
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Marks an alert as resolved.
 */
export async function resolveThreatAlert(alertId: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE threat_alerts SET resolved = TRUE WHERE id = $1 RETURNING id',
    [alertId]
  );
  return result.rows.length > 0;
}

/**
 * Clears all threat alerts and tracker state (for test isolation).
 */
export async function clearThreatAlerts(): Promise<void> {
  failedLoginTracker.clear();
  requestFloodingTracker.clear();
  recordAccessTracker.clear();
  await pool.query('DELETE FROM threat_alerts');
}
