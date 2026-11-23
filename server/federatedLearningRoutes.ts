// server/federatedLearningRoutes.ts
import { Router, Request, Response } from 'express';
import { runFederatedRound, federatedState, trainCentralizedModel, trainLocalBaselines } from './federatedLearning.js';
import { requireRole } from './auth.js';

const router = Router();

// Only SYSTEM_ADMIN can run federated learning or view metrics
router.use(requireRole('SYSTEM_ADMIN'));

// GET current metrics for UI chart
router.get('/metrics', (_req: Request, res: Response) => {
  res.json({ round: federatedState.round, metrics: federatedState.metrics });
});

// POST run a new federated round
router.post('/run', async (_req: Request, res: Response) => {
  try {
    const result = await runFederatedRound();
    res.json({ success: true, ...result });
  } catch (err: any) {
    console.error('[FedLearning] run error', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET centralized baseline (single model trained on all data)
router.get('/baseline/centralized', async (_req: Request, res: Response) => {
  const { loss, accuracy } = await trainCentralizedModel();
  res.json({ loss, accuracy });
});

// GET local baselines per hospital
router.get('/baseline/local', async (_req: Request, res: Response) => {
  const results = await trainLocalBaselines();
  res.json({ results });
});

export default router;
