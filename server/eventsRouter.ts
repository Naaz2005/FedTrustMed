import { Request, Response } from 'express';
import { requireAuth } from './server/auth.js';
import { registerSseClient } from './events.js';
import { setCurrentClientId } from './db.js';
import crypto from 'crypto';

// SSE endpoint for live sync
export const eventsRouter = (app: any) => {
  app.get('/api/events', requireAuth, (req: Request, res: Response) => {
    const user = (req as any).user;
    // Disconnect frozen or unapproved users
    if (user.approval_status !== 'APPROVED' || user.is_frozen) {
      res.status(403).end();
      return;
    }
    // Determine client id (passed by frontend or generated)
    const clientIdHeader = req.headers['x-client-id'] as string | undefined;
    const clientId = clientIdHeader || crypto.randomUUID();
    // Make clientId available for DB broadcast origin tracking
    setCurrentClientId(clientId);
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    // Register connection (enforces max 5 streams per user)
    const cleanup = registerSseClient(user.id, clientId, res);
    // Cleanup on close/error and reset clientId
    const finish = () => {
      cleanup();
      setCurrentClientId('');
    };
    res.on('close', finish);
    res.on('error', finish);
  });
};

