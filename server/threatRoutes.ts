// Threat Engine admin routes – Module M26
import { Router } from 'express';
import { requireRole } from './auth.js';
import {
  getAllThreatAlerts,
  resolveAlert as resolveAlertInEngine,
  simulateAttack,
} from './threatEngine.js';

const router = Router();

// GET all threat alerts (System Admin only)
router.get(
  '/threat-alerts',
  requireRole('SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const alerts = await getAllThreatAlerts();
      res.json({ alerts });
    } catch (e) {
      console.error('[ThreatRoutes] get alerts error', e);
      res.status(500).json({ error: 'internal' });
    }
  }
);

// POST simulate an attack – System Admin only
router.post(
  '/simulate-attack',
  requireRole('SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const { type, ip, userId, email, recordId } = req.body;
      const alert = await simulateAttack({ type, ip, userId, email, recordId });
      res.json({ alert });
    } catch (e) {
      console.error('[ThreatRoutes] simulate error', e);
      res.status(500).json({ error: 'simulation failed' });
    }
  }
);

// POST resolve an existing alert – System Admin only
router.post(
  '/resolve-alert',
  requireRole('SYSTEM_ADMIN'),
  async (req, res) => {
    try {
      const { alertId } = req.body;
      await resolveAlertInEngine(alertId);
      res.json({ ok: true });
    } catch (e) {
      console.error('[ThreatRoutes] resolve error', e);
      res.status(500).json({ error: 'resolve failed' });
    }
  }
);

export default router;
