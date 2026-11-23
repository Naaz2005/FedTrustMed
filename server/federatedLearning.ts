// server/federatedLearning.ts
import crypto from 'crypto';
import { pool } from './db.js';

/**
 * Synthetic non‑IID data generator for three hospitals.
 * Each hospital gets a different seed, 8 features, binary label.
 * Returns an object {hospitalId: string, data: {X: number[][], y: number[]}}
 */
export function generateSyntheticData() {
  const hospitals = [
    { id: 'hosp-1', rows: 120, seed: 42 },
    { id: 'hosp-2', rows: 80, seed: 84 },
    { id: 'hosp-3', rows: 60, seed: 168 },
  ];
  const result: Record<string, { X: number[][]; y: number[] }> = {};
  for (const h of hospitals) {
    const rng = mulberry32(h.seed);
    const X: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < h.rows; i++) {
      const row: number[] = [];
      for (let f = 0; f < 8; f++) {
        // Feature distribution differs per hospital to create non‑IIDness
        const base = f % 2 === 0 ? 0 : 1;
        row.push(base + rng() * 2);
      }
      X.push(row);
      // Simple linear model + noise for label
      const linear = row.reduce((sum, v, idx) => sum + v * (idx + 1), 0);
      const prob = 1 / (1 + Math.exp(-linear / 20));
      y.push(rng() < prob ? 1 : 0);
    }
    result[h.id] = { X, y };
  }
  return result;
}

/** Simple pseudo‑random generator – deterministic */
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Logistic regression utilities */
export interface Model {
  weights: number[]; // length 9 (8 features + bias)
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

/** Train logistic regression on a single hospital's data */
export async function trainLocalModel(
  X: number[][],
  y: number[],
  epochs: number = 10,
  batchSize: number = 16,
  lr: number = 0.1,
  l2: number = 0.01
): Promise<{ model: Model; loss: number; accuracy: number }> {
  const nFeatures = X[0].length;
  // initialize weights to zeros
  const weights = new Array(nFeatures + 1).fill(0);

  const n = X.length;
  for (let epoch = 0; epoch < epochs; epoch++) {
    // shuffle indices
    const indices = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    for (let start = 0; start < n; start += batchSize) {
      const end = Math.min(start + batchSize, n);
      const batch = indices.slice(start, end);
      const grad = new Array(nFeatures + 1).fill(0);
      for (const idx of batch) {
        const row = X[idx];
        const label = y[idx];
        const z =
          row.reduce((sum, v, i) => sum + v * weights[i], 0) + weights[nFeatures];
        const pred = sigmoid(z);
        const error = pred - label;
        for (let i = 0; i < nFeatures; i++) {
          grad[i] += error * row[i];
        }
        grad[nFeatures] += error; // bias gradient
      }
      // apply L2 regularization and update
      for (let i = 0; i < nFeatures; i++) {
        grad[i] = grad[i] / batch.length + l2 * weights[i];
        weights[i] -= lr * grad[i];
      }
      grad[nFeatures] = grad[nFeatures] / batch.length;
      weights[nFeatures] -= lr * grad[nFeatures];
    }
  }
  // compute final loss & accuracy
  let loss = 0;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const z = X[i].reduce((sum, v, j) => sum + v * weights[j], 0) + weights[nFeatures];
    const pred = sigmoid(z);
    loss += -y[i] * Math.log(pred + 1e-12) - (1 - y[i]) * Math.log(1 - pred + 1e-12);
    const predLabel = pred >= 0.5 ? 1 : 0;
    if (predLabel === y[i]) correct++;
  }
  loss = loss / n;
  const accuracy = correct / n;
  return { model: { weights }, loss, accuracy };
}

/** Federated averaging weighted by sample count */
export function federatedAvg(models: Model[], sampleCounts: number[]): Model {
  const total = sampleCounts.reduce((a, b) => a + b, 0);
  const nWeights = models[0].weights.length;
  const avg = new Array(nWeights).fill(0);
  for (let i = 0; i < models.length; i++) {
    const weight = sampleCounts[i] / total;
    for (let j = 0; j < nWeights; j++) {
      avg[j] += models[i].weights[j] * weight;
    }
  }
  return { weights: avg };
}

/** Compute SHA‑256 hash of model weights for ledger anchoring */
export function hashModel(model: Model): string {
  const hash = crypto.createHash('sha256');
  hash.update(JSON.stringify(model.weights));
  return hash.digest('hex');
}

/** In‑memory storage for round metrics – used by API & UI */
export const federatedState = {
  round: 0,
  metrics: [] as Array<{ round: number; loss: number; accuracy: number; hash: string }>,
  globalModel: { weights: new Array(9).fill(0) } as Model,
};

/** Run a single federated learning round */
export async function runFederatedRound() {
  const data = generateSyntheticData();
  const localResults = [] as Array<{ model: Model; loss: number; accuracy: number; count: number }>;
  for (const hospId of Object.keys(data)) {
    const { X, y } = data[hospId];
    const res = await trainLocalModel(X, y);
    localResults.push({ model: res.model, loss: res.loss, accuracy: res.accuracy, count: X.length });
  }
  // aggregate
  const models = localResults.map((r) => r.model);
  const counts = localResults.map((r) => r.count);
  const newGlobal = federatedAvg(models, counts);
  federatedState.globalModel = newGlobal;
  // evaluate on a held‑out test set (we reuse combined data for simplicity)
  const allX: number[][] = [];
  const allY: number[] = [];
  for (const hospId of Object.keys(data)) {
    const { X, y } = data[hospId];
    allX.push(...X);
    allY.push(...y);
  }
  const evalRes = evaluateModel(newGlobal, allX, allY);
  const hash = hashModel(newGlobal);
  federatedState.round++;
  federatedState.metrics.push({ round: federatedState.round, loss: evalRes.loss, accuracy: evalRes.accuracy, hash });
  // store hash on ledger – we reuse the audit ledger table for demonstration
  await pool.query(
    `INSERT INTO ledger_blocks (hash, round) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [hash, federatedState.round]
  );
  return { round: federatedState.round, loss: evalRes.loss, accuracy: evalRes.accuracy, hash };
}

function evaluateModel(model: Model, X: number[][], y: number[]) {
  const n = X.length;
  const nFeatures = X[0].length;
  let loss = 0;
  let correct = 0;
  for (let i = 0; i < n; i++) {
    const z = X[i].reduce((sum, v, j) => sum + v * model.weights[j], 0) + model.weights[nFeatures];
    const pred = sigmoid(z);
    loss += -y[i] * Math.log(pred + 1e-12) - (1 - y[i]) * Math.log(1 - pred + 1e-12);
    const predLabel = pred >= 0.5 ? 1 : 0;
    if (predLabel === y[i]) correct++;
  }
  return { loss: loss / n, accuracy: correct / n };
}

/** Centralized training baseline (train on combined data) */
export async function trainCentralizedModel() {
  const data = generateSyntheticData();
  const allX: number[][] = [];
  const allY: number[] = [];
  for (const h of Object.keys(data)) {
    const { X, y } = data[h];
    allX.push(...X);
    allY.push(...y);
  }
  const res = await trainLocalModel(allX, allY);
  return res;
}

/** Local‑only baseline per hospital */
export async function trainLocalBaselines() {
  const data = generateSyntheticData();
  const results: Array<{ hosp: string; loss: number; accuracy: number }> = [];
  for (const h of Object.keys(data)) {
    const { X, y } = data[h];
    const r = await trainLocalModel(X, y);
    results.push({ hosp: h, loss: r.loss, accuracy: r.accuracy });
  }
  return results;
}
