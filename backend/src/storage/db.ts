/**
 * @module storage/db
 * @description Drizzle ORM client and migration runner.
 *
 * Exports:
 *   db      – The Drizzle query client (used throughout the app for all DB ops).
 *   initDb  – Runs pending Drizzle migrations then seeds default alert rules.
 *             Called once at server startup before routes are registered.
 *
 * Requires DATABASE_URL environment variable (postgres connection string).
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';
import * as schema from './schema';
import { seed } from './seed';
import { logger } from '../utils/logger';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

const client = postgres(process.env.DATABASE_URL);

export const db = drizzle(client, { schema });

export async function initDb(): Promise<void> {
  // process.cwd() = /app in Docker (WORKDIR), or backend/ in local dev
  // Both locations contain the drizzle/ migrations folder.
  const migrationsFolder = path.join(process.cwd(), 'drizzle');
  await migrate(db, { migrationsFolder });
  logger.info('Database migrations applied');
  await seed();
}
