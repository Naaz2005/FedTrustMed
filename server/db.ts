import pg from 'pg';
let currentClientId = '';
export function setCurrentClientId(id: string) { currentClientId = id; }

import dotenv from 'dotenv';
import { broadcastDataChanged } from './events.js';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'fedtrustmed',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export async function query<R extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<R>> {
  const result = await pool.query<R>(text, params);
  // Detect write queries and broadcast a data change event
  const trimmed = text.trim().toUpperCase();
  if (trimmed.startsWith('INSERT') || trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
    // Basic scope extraction: use table name after first space
    const match = /^(INSERT|UPDATE|DELETE)\s+INTO\s+([a-z_]+)|^(INSERT|UPDATE|DELETE)\s+([a-z_]+)/i.exec(text);
    const table = match ? (match[2] || match[4] || '').toLowerCase() : '';
    const scope = table || 'unknown';
    // Origin is taken from a request context if provided via a global variable – for simplicity use empty string here
    broadcastDataChanged(scope, currentClientId);
  }
  return result;
}

export async function getClient(): Promise<pg.PoolClient> {
  return pool.connect();
}

export default pool;

