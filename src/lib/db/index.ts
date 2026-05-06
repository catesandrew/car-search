import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'car-search.db');

function createDatabase() {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema });
}

// Use globalThis singleton to survive Next.js dev hot-reloads
declare global {
  // eslint-disable-next-line no-var
  var __db: ReturnType<typeof createDatabase> | undefined;
}

export const db = globalThis.__db ?? createDatabase();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__db = db;
}

export type DB = typeof db;
