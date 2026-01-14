import pg from 'pg';
import { config } from '../config.js';
import { logger } from './logger.js';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 20,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('connect', () => {
      logger.debug('New DB connection established');
    });

    pool.on('error', (err: Error) => {
      logger.error('Unexpected pool error', { message: err.message });
    });
  }

  return pool;
}

export async function query<T extends pg.QueryResultRow = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const elapsed = Date.now() - start;

  logger.debug('Query executed', { text: text.substring(0, 80), elapsed, rows: result.rowCount });
  return result;
}

export async function getClient(): Promise<pg.PoolClient> {
  return getPool().connect();
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('DB pool closed');
  }
}
