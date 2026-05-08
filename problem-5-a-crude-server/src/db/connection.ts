import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  // Ensure the directory exists for file-based DBs.
  if (config.databasePath !== ':memory:') {
    const dir = path.dirname(config.databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(config.databasePath);

  // WAL gives us better concurrency for read-heavy workloads.
  // foreign_keys is OFF by default in SQLite — turn it on so FK constraints actually work.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
