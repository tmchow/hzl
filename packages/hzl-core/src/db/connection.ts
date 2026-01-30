import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { runMigrations } from './migrations.js';

export function getDefaultDbPath(): string {
  const hzlDir = path.join(os.homedir(), '.hzl');
  return path.join(hzlDir, 'data.db');
}

export function createConnection(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? process.env.HZL_DB ?? getDefaultDbPath();

  // Handle in-memory databases
  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(resolvedPath);
  runMigrations(db);
  return db;
}

/**
 * Execute a function within a write transaction using BEGIN IMMEDIATE.
 * This ensures proper locking for concurrent access from multiple agents.
 * Includes retry logic for SQLITE_BUSY errors.
 */
export function withWriteTransaction<T>(
  db: Database.Database,
  fn: () => T,
  opts?: { retries?: number; busySleepMs?: number }
): T {
  const retries = opts?.retries ?? 5;
  const busySleepMs = opts?.busySleepMs ?? 25;
  let attempt = 0;

  while (true) {
    try {
      // Use immediate transaction for write lock
      return db.transaction(fn).immediate();
    } catch (err: any) {
      const isBusy = err?.code === 'SQLITE_BUSY' || String(err?.message).includes('SQLITE_BUSY');
      if (!isBusy || attempt >= retries) {
        throw err;
      }
      attempt += 1;
      // Simple sleep with exponential backoff
      const sleepTime = busySleepMs * attempt;
      const start = Date.now();
      while (Date.now() - start < sleepTime) {
        // Busy wait (synchronous sleep for better-sqlite3)
      }
    }
  }
}
