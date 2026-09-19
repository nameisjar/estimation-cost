import { Pool } from 'pg';
import { config } from './config.js';

export const databasePool = config.databaseUrl
  ? new Pool({ connectionString: config.databaseUrl, max: config.databasePoolMax })
  : null;

databasePool?.on('error', error => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export async function closeDatabase(): Promise<void> {
  await databasePool?.end();
}
