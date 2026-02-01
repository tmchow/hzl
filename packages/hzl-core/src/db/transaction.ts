import type Database from 'libsql';

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
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string } | null;
      const isBusy =
        error?.code === 'SQLITE_BUSY' ||
        (typeof error?.message === 'string' && error.message.includes('SQLITE_BUSY'));
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
