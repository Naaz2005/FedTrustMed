import crypto from 'crypto';
import { pool } from './db.js';
import { insertAuditLog } from './auth.js';

export const FREEZE_THRESHOLD = 50.0;
export const MAX_TRUST_SCORE = 100.0;
export const MIN_TRUST_SCORE = 0.0;

export const TRUST_DELTAS = {
  FAILED_LOGIN: -15.0,
  DENIED_ACCESS_ATTEMPT: -20.0,
  OFF_HOURS_ACCESS: -10.0,
  GOOD_BEHAVIOUR: 5.0,
} as const;

export interface TrustEvent {
  id: string;
  userId: string;
  eventType: 'FAILED_LOGIN' | 'DENIED_ACCESS_ATTEMPT' | 'OFF_HOURS_ACCESS' | 'ADMIN_CHANGE' | 'GOOD_BEHAVIOUR' | string;
  reason: string;
  delta: number;
  previousScore: number;
  newScore: number;
  createdAt: string;
}

export interface TrustRecordResult {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    trustScore: number;
    isFrozen: boolean;
  };
  event: TrustEvent;
  autoFrozen: boolean;
}

/**
 * Records a trust event for a user with reason and delta.
 * If the resulting score falls to or below FREEZE_THRESHOLD,
 * the user account is automatically frozen in PostgreSQL.
 * The freeze takes effect immediately via the per-request database check in requireAuth.
 */
export async function recordTrustEvent(params: {
  userId: string;
  eventType: 'FAILED_LOGIN' | 'DENIED_ACCESS_ATTEMPT' | 'OFF_HOURS_ACCESS' | 'ADMIN_CHANGE' | 'GOOD_BEHAVIOUR' | string;
  reason: string;
  delta: number;
}): Promise<TrustRecordResult> {
  const { userId, eventType, reason, delta } = params;

  // Retrieve current user score and freeze state
  const userRes = await pool.query(
    'SELECT id, email, full_name, role, hospital_id, hospital_name, is_frozen, trust_score FROM users WHERE id = $1',
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  const user = userRes.rows[0];
  const previousScore = parseFloat(user.trust_score) || 100.0;
  const rawNewScore = previousScore + delta;
  const newScore = Math.max(MIN_TRUST_SCORE, Math.min(MAX_TRUST_SCORE, Math.round(rawNewScore * 100) / 100));

  // Determine if automatic freeze condition is met
  const autoFrozen = newScore <= FREEZE_THRESHOLD && !user.is_frozen;
  const newIsFrozen = autoFrozen ? true : user.is_frozen;

  // Update user's trust score and freeze state in database
  const updateRes = await pool.query(
    `UPDATE users
     SET trust_score = $1,
         is_frozen = $2,
         updated_at = NOW()
     WHERE id = $3
     RETURNING id, email, full_name, role, trust_score, is_frozen`,
    [newScore, newIsFrozen, userId]
  );

  const eventId = `te-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  // Insert into trust_events table
  await pool.query(
    `INSERT INTO trust_events (id, user_id, event_type, reason, delta, previous_score, new_score, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [eventId, userId, eventType, reason, delta, previousScore, newScore]
  );

  const event: TrustEvent = {
    id: eventId,
    userId,
    eventType,
    reason,
    delta,
    previousScore,
    newScore,
    createdAt: now,
  };

  // If automatically frozen, write an audit log
  if (autoFrozen) {
    await insertAuditLog({
      userId: user.id,
      userName: user.full_name,
      userRole: user.role,
      hospitalId: user.hospital_id || null,
      hospitalName: user.hospital_name || 'Central Governance Node',
      action: 'USER_ACCOUNT_AUTO_FROZEN_LOW_TRUST',
      resourceId: user.id,
      ipAddress: '127.0.0.1',
      trustImpact: delta,
      details: `Account automatically frozen: trust score dropped to ${newScore} (<= threshold ${FREEZE_THRESHOLD}). Triggered by: ${reason}`,
    }).catch((err) => console.error('[TrustEngine] Failed to write auto-freeze audit log:', err));
  }

  return {
    user: {
      id: updateRes.rows[0].id,
      email: updateRes.rows[0].email,
      fullName: updateRes.rows[0].full_name,
      role: updateRes.rows[0].role,
      trustScore: parseFloat(updateRes.rows[0].trust_score),
      isFrozen: updateRes.rows[0].is_frozen,
    },
    event,
    autoFrozen,
  };
}

/**
 * Record a failed login attempt (delta -15.0).
 */
export async function recordFailedLogin(userId: string, reason?: string) {
  return recordTrustEvent({
    userId,
    eventType: 'FAILED_LOGIN',
    reason: reason || 'Failed authentication attempt: incorrect credentials',
    delta: TRUST_DELTAS.FAILED_LOGIN,
  });
}

/**
 * Record a denied access attempt (e.g. clinical route access without consent or role violation) (delta -20.0).
 */
export async function recordDeniedAccess(userId: string, reason: string) {
  return recordTrustEvent({
    userId,
    eventType: 'DENIED_ACCESS_ATTEMPT',
    reason,
    delta: TRUST_DELTAS.DENIED_ACCESS_ATTEMPT,
  });
}

/**
 * Record off-hours access anomaly (delta -10.0).
 */
export async function recordOffHoursAccess(userId: string, reason: string) {
  return recordTrustEvent({
    userId,
    eventType: 'OFF_HOURS_ACCESS',
    reason,
    delta: TRUST_DELTAS.OFF_HOURS_ACCESS,
  });
}

/**
 * Record admin trust score change with custom delta and reason.
 */
export async function recordAdminChange(userId: string, delta: number, reason: string) {
  return recordTrustEvent({
    userId,
    eventType: 'ADMIN_CHANGE',
    reason: `Admin adjustment: ${reason}`,
    delta,
  });
}

/**
 * Record good behavior over time (delta +5.0).
 */
export async function recordGoodBehaviour(userId: string, reason?: string) {
  return recordTrustEvent({
    userId,
    eventType: 'GOOD_BEHAVIOUR',
    reason: reason || 'Consistent authenticated compliance and zero security infractions',
    delta: TRUST_DELTAS.GOOD_BEHAVIOUR,
  });
}

/**
 * Admin unfreeze action with required rationale.
 * Restores account standing and resets trust score to 100.0 if it was degraded.
 */
export async function adminUnfreezeUser(params: {
  userId: string;
  reason: string;
  adminUser?: { id: string; fullName?: string; email?: string; hospitalId?: string; hospitalName?: string };
  ipAddress?: string;
}): Promise<TrustRecordResult> {
  const { userId, reason, adminUser, ipAddress } = params;
  const cleanReason = (reason || '').trim();

  if (!cleanReason) {
    throw new Error('A specific reason is required to unfreeze an account');
  }

  const userRes = await pool.query(
    'SELECT id, email, full_name, role, hospital_id, hospital_name, is_frozen, trust_score FROM users WHERE id = $1',
    [userId]
  );

  if (userRes.rows.length === 0) {
    throw new Error(`User with ID ${userId} not found`);
  }

  const user = userRes.rows[0];
  const prevScore = parseFloat(user.trust_score) || 100.0;
  // Restore score to 100.0 upon admin unfreeze
  const targetScore = Math.max(prevScore, 100.0);
  const delta = Math.round((targetScore - prevScore) * 100) / 100;

  await pool.query(
    'UPDATE users SET is_frozen = FALSE, trust_score = $1, failed_login_count = 0, locked_until = NULL, updated_at = NOW() WHERE id = $2',
    [targetScore, userId]
  );

  const eventId = `te-${crypto.randomUUID()}`;
  await pool.query(
    `INSERT INTO trust_events (id, user_id, event_type, reason, delta, previous_score, new_score, created_at)
     VALUES ($1, $2, 'ADMIN_CHANGE', $3, $4, $5, $6, NOW())`,
    [eventId, userId, `Admin unfreeze: ${cleanReason}`, delta, prevScore, targetScore]
  );

  await insertAuditLog({
    userId: adminUser?.id || null,
    userName: adminUser?.fullName || adminUser?.email || 'System Admin',
    userRole: 'SYSTEM_ADMIN',
    hospitalId: adminUser?.hospitalId || null,
    hospitalName: adminUser?.hospitalName || 'Central Governance Node',
    action: 'USER_ACCOUNT_UNFROZEN',
    resourceId: userId,
    ipAddress: ipAddress || '127.0.0.1',
    trustImpact: delta,
    details: `Account unfrozen for user ${user.email}. Reason: ${cleanReason}`,
  }).catch((err) => console.error('[TrustEngine] Failed to write unfreeze audit log:', err));

  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      trustScore: targetScore,
      isFrozen: false,
    },
    event: {
      id: eventId,
      userId,
      eventType: 'ADMIN_CHANGE',
      reason: `Admin unfreeze: ${cleanReason}`,
      delta,
      previousScore: prevScore,
      newScore: targetScore,
      createdAt: new Date().toISOString(),
    },
    autoFrozen: false,
  };
}

/**
 * Returns trust event history for a specific user, sorted from newest to oldest.
 */
export async function getUserTrustEvents(userId: string): Promise<TrustEvent[]> {
  const result = await pool.query(
    `SELECT id, user_id, event_type, reason, delta, previous_score, new_score, created_at
     FROM trust_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    reason: row.reason,
    delta: parseFloat(row.delta),
    previousScore: parseFloat(row.previous_score),
    newScore: parseFloat(row.new_score),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Returns recent trust events across all users for System Admin Account Safety.
 */
export async function getAllTrustEvents(limit: number = 100): Promise<any[]> {
  const result = await pool.query(
    `SELECT te.id, te.user_id, te.event_type, te.reason, te.delta, te.previous_score, te.new_score, te.created_at,
            u.email, u.full_name, u.role, u.is_frozen, u.trust_score
     FROM trust_events te
     JOIN users u ON te.user_id = u.id
     ORDER BY te.created_at DESC
     LIMIT $1`,
    [limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    isFrozen: row.is_frozen,
    currentTrustScore: parseFloat(row.trust_score),
    eventType: row.event_type,
    reason: row.reason,
    delta: parseFloat(row.delta),
    previousScore: parseFloat(row.previous_score),
    newScore: parseFloat(row.new_score),
    createdAt: new Date(row.created_at).toISOString(),
  }));
}

/**
 * Returns account safety overview for all users (scores, freeze status, event count).
 */
export async function getAccountSafetyOverview(): Promise<any[]> {
  const result = await pool.query(`
    SELECT u.id, u.email, u.full_name, u.role, u.hospital_name, u.is_frozen, u.trust_score,
           u.approval_status, u.mfa_enabled, u.failed_login_count, u.locked_until,
           COUNT(te.id)::int AS total_events,
           MAX(te.created_at) AS last_event_at
    FROM users u
    LEFT JOIN trust_events te ON u.id = te.user_id
    GROUP BY u.id
    ORDER BY u.trust_score ASC, u.is_frozen DESC, u.created_at DESC
  `);

  return result.rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.full_name,
    role: r.role,
    hospitalName: r.hospital_name,
    isFrozen: r.is_frozen,
    trustScore: parseFloat(r.trust_score),
    approvalStatus: r.approval_status,
    mfaEnabled: r.mfa_enabled,
    failedLoginCount: r.failed_login_count,
    lockedUntil: r.locked_until,
    totalEvents: r.total_events,
    lastEventAt: r.last_event_at ? new Date(r.last_event_at).toISOString() : null,
  }));
}

