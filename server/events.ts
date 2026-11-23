import { Response } from 'express';
import { pool } from './db.js';
import { getClientIp } from './auth.js';

/**
 * In‑memory registry of SSE connections per user.
 * Each entry maps a userId to a Set of { res, clientId } objects.
 */
const connections: Map<string, Set<{ res: Response; clientId: string }>> = new Map();

/** Broadcast a data‑changed event to all connected users (except the origin if provided). */
export function broadcastDataChanged(scope: string, originClientId: string) {
  const payload = `data: ${JSON.stringify({ type: 'DATA_CHANGED', scope, origin: originClientId })}\n\n`;
  connections.forEach((set) => {
    set.forEach(({ res, clientId }) => {
      if (clientId !== originClientId) {
        res.write(payload);
      }
    });
  });
}

/** Register a new SSE client for a user. Returns a cleanup function. */
export function registerSseClient(userId: string, clientId: string, res: Response) {
  // Ensure max 5 streams per user
  const userSet = connections.get(userId) ?? new Set();
  if (userSet.size >= 5) {
    // Too many open streams – close this one immediately
    res.status(429).end();
    return () => {};
  }
  userSet.add({ res, clientId });
  connections.set(userId, userSet);

  // Keep‑alive ping every 25 seconds – comment line
  const keepAlive = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 25000);

  // Cleanup on client disconnect
  const cleanup = () => {
    clearInterval(keepAlive);
    const set = connections.get(userId);
    if (set) {
      set.forEach((obj) => {
        if (obj.res === res) set.delete(obj);
      });
      if (set.size === 0) connections.delete(userId);
    }
  };

  res.on('close', cleanup);
  res.on('error', cleanup);

  return cleanup;
}

