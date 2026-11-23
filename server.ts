import 'express-async-errors';
import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import dotenv from 'dotenv';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { authRouter, hospitalsRouter, requireAuth, requireRole } from './server/auth.js';
import { uploadsTestRouter } from './server/uploads.js';
import { adminRouter } from './server/admin.js';
import { hospitalAdminRouter } from './server/hospitalAdmin.js';
import { consentRouter } from './server/consent.js';
import { recordAccessRouter, auditAccessRouter } from './server/recordAccess.js';
import { eventsRouter } from './eventsRouter.js';
import { pool } from './server/db.js';
import { blockchain, verifyChainIntegrity } from './server/blockchain.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProduction = process.env.NODE_ENV === 'production';

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: isProduction ? undefined : false,
    crossOriginEmbedderPolicy: isProduction ? undefined : false,
  })
);

// Request logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl || req.url} ${res.statusCode} - ${duration}ms`
    );
  });
  next();
});

// JSON body parser with 100 KB limit
app.use(express.json({ limit: '100kb' }));

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

// ── PUBLIC ROUTES (no auth) ──────────────────────────────────────────────────
// Authentication routes (login, register are public sub-routes)
app.use('/api/auth', authRouter);

// Public hospital list: returns id and name only
app.use('/api/hospitals', hospitalsRouter);

// ── PROTECTED ROUTES (requireAuth on everything below) ───────────────────────

// SYSTEM_ADMIN only routes (Module M10 Approval Backend & Admin Controls)
app.use('/api/admin', requireAuth, requireRole('SYSTEM_ADMIN'), adminRouter);

// HOSPITAL_ADMIN routes (Module M22: Scoped strictly to admin's own hospital)
app.use('/api/hospital', hospitalAdminRouter);

// DOCTOR routes
app.get('/api/records', requireAuth, requireRole('DOCTOR', 'SYSTEM_ADMIN'), async (req: Request, res: Response) => {
  const user = (req as any).user;

  // SYSTEM_ADMIN sees records directly
  if (user.role === 'SYSTEM_ADMIN') {
    const result = await pool.query('SELECT * FROM medical_records ORDER BY created_at DESC LIMIT 50');
    return res.json({ success: true, message: 'Medical records', records: result.rows });
  }

  // DOCTOR access: governed strictly by explicit dynamic patient consent!
  // First, mark any expired consents as EXPIRED in PostgreSQL
  await pool.query(
    "UPDATE consent_records SET status = 'EXPIRED' WHERE status = 'GRANTED' AND expires_at IS NOT NULL AND expires_at <= NOW()"
  );

  // Look up doctor profile id
  const docRes = await pool.query('SELECT id FROM doctors WHERE user_id = $1 LIMIT 1', [user.id]);
  const docId = docRes.rows[0]?.id || user.id;

  // Only return medical records where an active, non-expired GRANTED consent exists for this doctor
  const query = `
    SELECT mr.*
    FROM medical_records mr
    WHERE EXISTS (
      SELECT 1 FROM consent_records c
      WHERE (c.doctor_id = $1 OR c.doctor_id = $2)
        AND c.patient_id = mr.patient_id
        AND c.status = 'GRANTED'
        AND (c.expires_at IS NULL OR c.expires_at > NOW())
        AND (c.record_id IS NULL OR c.record_id = mr.id)
    )
    ORDER BY mr.created_at DESC
    LIMIT 50
  `;
  const result = await pool.query(query, [docId, user.id]);
  return res.json({ success: true, message: 'Medical records', records: result.rows });
});

app.get('/api/records/:id', requireAuth, requireRole('DOCTOR', 'SYSTEM_ADMIN'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const recordId = req.params.id;

  if (user.role === 'SYSTEM_ADMIN') {
    const result = await pool.query('SELECT * FROM medical_records WHERE id = $1 LIMIT 1', [recordId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Record not found' });
    return res.json({ success: true, record: result.rows[0] });
  }

  await pool.query(
    "UPDATE consent_records SET status = 'EXPIRED' WHERE status = 'GRANTED' AND expires_at IS NOT NULL AND expires_at <= NOW()"
  );

  const docRes = await pool.query('SELECT id FROM doctors WHERE user_id = $1 LIMIT 1', [user.id]);
  const docId = docRes.rows[0]?.id || user.id;

  const query = `
    SELECT mr.*
    FROM medical_records mr
    WHERE mr.id = $1
      AND EXISTS (
        SELECT 1 FROM consent_records c
        WHERE (c.doctor_id = $2 OR c.doctor_id = $3)
          AND c.patient_id = mr.patient_id
          AND c.status = 'GRANTED'
          AND (c.expires_at IS NULL OR c.expires_at > NOW())
          AND (c.record_id IS NULL OR c.record_id = mr.id)
      )
    LIMIT 1
  `;
  const result = await pool.query(query, [recordId, docId, user.id]);
  if (result.rows.length === 0) {
    return res.status(403).json({ error: 'Access denied: no active consent for this medical record' });
  }
  return res.json({ success: true, record: result.rows[0] });
});

app.get('/api/patients', requireAuth, requireRole('DOCTOR', 'HOSPITAL_ADMIN', 'SYSTEM_ADMIN'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  if (user.role === 'HOSPITAL_ADMIN') {
    const hospId = user.hospitalId || (await pool.query('SELECT hospital_id FROM users WHERE id = $1', [user.id])).rows[0]?.hospital_id;
    const result = await pool.query('SELECT * FROM patients WHERE primary_hospital_id = $1 ORDER BY created_at DESC', [hospId]);
    return res.json({ success: true, message: 'Patients list', patients: result.rows });
  }
  const result = await pool.query('SELECT * FROM patients ORDER BY created_at DESC');
  res.json({ success: true, message: 'Patients list', patients: result.rows });
});

// PATIENT routes (patients can view their own data)
app.get('/api/patients/me', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await pool.query('SELECT * FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
  res.json({ success: true, message: 'Patient own profile', patient: result.rows[0] || null });
});

app.get('/api/patients/me/records', requireAuth, requireRole('PATIENT'), async (req: Request, res: Response) => {
  const user = (req as any).user;
  const patRes = await pool.query('SELECT id FROM patients WHERE user_id = $1 LIMIT 1', [user.id]);
  if (patRes.rows.length === 0) {
    return res.json({ success: true, message: 'Patient own records', records: [] });
  }
  const result = await pool.query('SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC', [patRes.rows[0].id]);
  res.json({ success: true, message: 'Patient own records', records: result.rows });
});

// Module M16: Consent backend routes
app.use('/api/consent', consentRouter);

// Module M17: Record Access & Audit routes
app.use('/api/medical-records', recordAccessRouter);
app.use('/api/audit', auditAccessRouter);

// Notifications (authenticated users)
app.get('/api/notifications', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  const result = await pool.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
    [user.id]
  );
  res.json({ success: true, notifications: result.rows });
});

app.post('/api/notifications/:id/read', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  await pool.query(
    'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
    [req.params.id, user.id]
  );
  res.json({ success: true, message: 'Notification marked as read' });
});

app.post('/api/notifications/read-all', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user;
  await pool.query(
    'UPDATE notifications SET read = TRUE WHERE user_id = $1',
    [user.id]
  );
  res.json({ success: true, message: 'All notifications marked as read' });
});

// Test routes for verification of error handling in non-production
if (!isProduction) {
  app.get('/api/test/error', async () => {
    throw new Error('Simulated unhandled server failure');
  });

  app.post('/api/test/echo', (req: Request, res: Response) => {
    res.json({ ok: true, data: req.body });
  });

  // Temporary dev-only test route to exercise secure upload service (Module M7)
  app.use('/api/test/uploads', requireAuth, uploadsTestRouter);
}

// Central error handling middleware - always returns {"error": "..."} without stack traces
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    return _next(err);
  }

  // Handle invalid JSON body syntax errors from express.json()
  if (err instanceof SyntaxError && 'status' in err && (err as any).status === 400) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }

  // Handle body-parser payload limit exceeded
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ error: 'Payload too large: JSON body exceeds 100 KB limit' });
  }

  // Determine status code
  const status =
    typeof err.status === 'number' && err.status >= 400 && err.status < 600
      ? err.status
      : typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500;

  // Sanitized message, never returning stack traces
  const message =
    status === 500 ? 'Internal server error' : (err.message || 'An unexpected error occurred');

  return res.status(status).json({ error: message });
});

async function startServer() {
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  return new Promise<void>((resolve) => {
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
      resolve();
    });
  });
}

const isRunDirectly = Boolean(
  process.argv[1] &&
    !process.argv[1].includes('tests') &&
    (process.argv[1].endsWith('server.ts') ||
      process.argv[1].endsWith('server.js') ||
      path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
);

if (isRunDirectly && process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

export { app, startServer };
