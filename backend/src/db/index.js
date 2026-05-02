import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env.js';
import * as schema from './schema.js';

// One pg pool per process. Reused by all repositories via the `db` export.
// We prefer individual DB_* fields over a URL because the user's password
// contains '@', which would have to be URL-encoded inside DATABASE_URL.
// A URL without a password makes `pg` pass `undefined` and breaks SCRAM auth.
const databaseUrl = typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL.trim() : '';
const pool = databaseUrl
  ? new pg.Pool({
      connectionString: databaseUrl,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
      max: 10,
    })
  : new pg.Pool({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USER,
      password: String(env.DB_PASSWORD ?? ''),
      database: env.DB_NAME,
      ssl: env.DB_SSL ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

pool.on('error', (err) => {
  console.error('[db] Idle client error', err);
});

export const db = drizzle(pool, { schema });

export async function pingDb() {
  const r = await pool.query('SELECT 1 AS ok');
  return r.rows?.[0]?.ok === 1;
}

export async function closeDb() {
  await pool.end();
}

// Re-export tables for convenience: `import { db, metaAdAccounts } from '../db/index.js'`
export * from './schema.js';
